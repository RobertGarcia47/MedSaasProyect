// Documentos y radiografías del paciente (sql/2026-10-24_archivos_paciente.sql).
// Metadatos en `expediente_archivos` (notas CIFRADAS, solo vía RPC); el archivo y su
// miniatura en el bucket privado "archivos-paciente" (se ven con URLs firmadas).
// Mismo patrón que lib/laboratorio.ts. Los archivos no se borran: se ARCHIVAN.

import { supabase } from './supabase';

const BUCKET = 'archivos-paciente';

export type CategoriaArchivo = 'radiografia' | 'fotografia' | 'documento' | 'otro';

export const CATEGORIAS_ARCHIVO: { value: CategoriaArchivo; label: string; icon: string }[] = [
  { value: 'radiografia', label: 'Radiografía', icon: 'radiology' },
  { value: 'fotografia',  label: 'Fotografía',  icon: 'photo_camera' },
  { value: 'documento',   label: 'Documento',   icon: 'description' },
  { value: 'otro',        label: 'Otro',        icon: 'folder' },
];

export interface ArchivoPaciente {
  id: string;
  categoria: CategoriaArchivo;
  titulo: string;
  fecha: string;                 // 'YYYY-MM-DD'
  diente: string | null;
  notas: string | null;          // descifrada por la RPC
  archivo_path: string;
  miniatura_path: string | null;
  archivo_nombre: string | null;
  mime: string | null;
  tamano_bytes: number | null;
  archivado: boolean;
  creado_por: string;
  created_at: string;
}

export interface NuevoArchivo {
  categoria: CategoriaArchivo;
  titulo: string;
  fecha: string;
  diente?: string | null;
  notas?: string | null;
  archivo_path: string;
  miniatura_path?: string | null;
  archivo_nombre?: string | null;
  mime?: string | null;
  tamano_bytes?: number | null;
}

export const esImagen = (a: Pick<ArchivoPaciente, 'mime'>) => !!a.mime && a.mime.startsWith('image/');
export const esPdf = (a: Pick<ArchivoPaciente, 'mime'>) => a.mime === 'application/pdf';

// ── Procesamiento antes de subir ──────────────────────────────────────────────
const PDF_MAX_BYTES = 20 * 1024 * 1024;   // el bucket admite 25 MB
const THUMB_PX = 480;

/** Las radiografías conservan más resolución y calidad que una foto o un documento. */
const AJUSTES_IMAGEN: Record<CategoriaArchivo, { maxPx: number; calidad: number }> = {
  radiografia: { maxPx: 3200, calidad: 0.92 },
  fotografia:  { maxPx: 2400, calidad: 0.86 },
  documento:   { maxPx: 2400, calidad: 0.86 },
  otro:        { maxPx: 2400, calidad: 0.86 },
};

async function bitmapAWebp(bitmap: ImageBitmap, maxPx: number, calidad: number): Promise<Blob> {
  let { width, height } = bitmap;
  if (width > maxPx || height > maxPx) {
    const ratio = Math.min(maxPx / width, maxPx / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo convertir la imagen.'))), 'image/webp', calidad);
  });
}

interface ArchivoProcesado {
  blob: Blob;
  nombre: string;
  contentType: string;
  miniatura: Blob | null;
}

/** PDF: se valida el tamaño y se sube tal cual. Imagen: WebP (resolución según categoría) + miniatura. */
export async function procesarArchivoPaciente(file: File, categoria: CategoriaArchivo): Promise<ArchivoProcesado> {
  if (file.type === 'application/pdf') {
    if (file.size > PDF_MAX_BYTES) {
      throw new Error(`"${file.name}" supera 20 MB (${(file.size / 1024 / 1024).toFixed(1)} MB). Usa una versión optimizada.`);
    }
    return { blob: file, nombre: file.name, contentType: 'application/pdf', miniatura: null };
  }
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}": solo se admiten imágenes y PDF.`);
  }

  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(`"${file.name}": el navegador no pudo leer esa imagen (¿formato HEIC?). Expórtala como JPG o PNG.`); }

  try {
    const { maxPx, calidad } = AJUSTES_IMAGEN[categoria];
    const [blob, miniatura] = await Promise.all([
      bitmapAWebp(bitmap, maxPx, calidad),
      bitmapAWebp(bitmap, THUMB_PX, 0.75),
    ]);
    return { blob, nombre: file.name.replace(/\.[^.]+$/, '') + '.webp', contentType: 'image/webp', miniatura };
  } finally {
    bitmap.close();
  }
}

/** Procesa y sube el archivo (y su miniatura) al bucket. */
export async function subirArchivoPaciente(
  file: File,
  categoria: CategoriaArchivo,
  clinicaId: string,
  expedienteId: string,
): Promise<{ path: string; miniaturaPath: string | null; nombre: string; mime: string; tamano: number }> {
  const { blob, nombre, contentType, miniatura } = await procesarArchivoPaciente(file, categoria);
  const base = `${clinicaId}/${expedienteId}`;
  const unico = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${nombre.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const path = `${base}/${unico}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false });
  if (error) throw error;

  let miniaturaPath: string | null = null;
  if (miniatura) {
    const tp = `${base}/thumbs/${unico}`;
    const { error: e2 } = await supabase.storage.from(BUCKET).upload(tp, miniatura, { contentType: 'image/webp', upsert: false });
    if (!e2) miniaturaPath = tp;   // si la miniatura falla, el archivo igual queda (la galería usa el original)
  }
  return { path, miniaturaPath, nombre, mime: contentType, tamano: blob.size };
}

// ── URLs firmadas (con caché de 1 h) ──────────────────────────────────────────
const TTL_S = 3600;
const _cache = new Map<string, { url: string; expira: number }>();
const vigente = (e: { expira: number } | undefined) => !!e && Date.now() < e.expira - 60_000;

/** URLs firmadas de varios paths en una sola llamada (las que ya están en caché no se piden). */
export async function urlsFirmadas(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const faltan: string[] = [];
  for (const p of new Set(paths)) {
    const c = _cache.get(p);
    if (vigente(c)) out.set(p, c!.url); else faltan.push(p);
  }
  if (faltan.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(faltan, TTL_S);
    if (error) throw error;
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) {
        _cache.set(d.path, { url: d.signedUrl, expira: Date.now() + TTL_S * 1000 });
        out.set(d.path, d.signedUrl);
      }
    }
  }
  return out;
}

export async function urlFirmada(path: string): Promise<string> {
  const m = await urlsFirmadas([path]);
  const url = m.get(path);
  if (!url) throw new Error('No se pudo obtener el archivo.');
  return url;
}

// ── RPCs ──────────────────────────────────────────────────────────────────────
export async function obtenerArchivos(expedienteId: string): Promise<ArchivoPaciente[]> {
  const { data, error } = await supabase.rpc('obtener_archivos_paciente', { p_expediente_id: expedienteId });
  if (error) throw error;
  return ((data ?? []) as ArchivoPaciente[]).map((a) => ({ ...a, tamano_bytes: a.tamano_bytes == null ? null : Number(a.tamano_bytes) }));
}

export async function crearArchivo(expedienteId: string, a: NuevoArchivo): Promise<string> {
  const { data, error } = await supabase.rpc('crear_archivo_paciente', {
    p_expediente_id: expedienteId, p_categoria: a.categoria, p_titulo: a.titulo, p_archivo_path: a.archivo_path,
    p_fecha: a.fecha, p_diente: a.diente ?? null, p_notas: a.notas ?? null, p_miniatura_path: a.miniatura_path ?? null,
    p_archivo_nombre: a.archivo_nombre ?? null, p_mime: a.mime ?? null, p_tamano_bytes: a.tamano_bytes ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function actualizarArchivo(
  id: string,
  c: { categoria: CategoriaArchivo; titulo: string; fecha: string; diente: string | null; notas: string | null; archivado: boolean },
): Promise<void> {
  const { error } = await supabase.rpc('actualizar_archivo_paciente', {
    p_id: id, p_categoria: c.categoria, p_titulo: c.titulo, p_fecha: c.fecha,
    p_diente: c.diente, p_notas: c.notas, p_archivado: c.archivado,
  });
  if (error) throw error;
}

export function formatoTamano(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

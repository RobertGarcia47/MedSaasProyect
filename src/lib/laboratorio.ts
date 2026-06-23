// Servicio de estudios de laboratorio.
// Las notas van CIFRADAS (notas_enc) → solo via RPC.
// El archivo va en Storage bucket "laboratorios" (privado) → signed URL para descargar.

import { supabase } from './supabase';

export interface EstudioUI {
  id: string;
  consulta_id: string | null;
  creado_por: string;
  tipo_estudio: string;
  fecha_estudio: string;          // 'YYYY-MM-DD'
  laboratorio_externo: string | null;
  notas: string | null;           // descifrado por la RPC
  archivo_url: string;            // path en Storage (NO url pública)
  archivo_nombre: string | null;
  created_at: string;
}

export interface NuevoEstudio {
  tipo_estudio: string;
  fecha_estudio: string;
  archivo_url: string;
  archivo_nombre?: string | null;
  laboratorio_externo?: string | null;
  notas?: string | null;
  consulta_id?: string | null;
}

const PDF_MAX_BYTES  = 10 * 1024 * 1024;  // 10 MB
const IMG_MAX_PX     = 2000;               // máximo en cualquier dimensión
const IMG_WEBP_QUALITY = 0.85;

/**
 * Procesa el archivo antes de subir:
 * - PDF: valida que no supere 10 MB (sin compresión — pendiente API .NET Core 8).
 * - Imagen: convierte a WebP al 85 % de calidad y redimensiona si supera 2000 px.
 * Devuelve el File/Blob listo para subir y el nombre a guardar.
 */
export async function procesarArchivo(
  file: File,
): Promise<{ blob: Blob; nombre: string; contentType: string }> {
  const isPdf  = file.type === 'application/pdf';
  const isImg  = file.type.startsWith('image/');

  if (!isPdf && !isImg) {
    throw new Error('Tipo de archivo no permitido. Solo PDF e imágenes.');
  }

  if (isPdf) {
    if (file.size > PDF_MAX_BYTES) {
      throw new Error(
        `El PDF supera el límite de 10 MB (${(file.size / 1024 / 1024).toFixed(1)} MB). ` +
        'Usa una versión optimizada del documento.',
      );
    }
    return { blob: file, nombre: file.name, contentType: 'application/pdf' };
  }

  // Imagen → Canvas → WebP
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  if (width > IMG_MAX_PX || height > IMG_MAX_PX) {
    const ratio = Math.min(IMG_MAX_PX / width, IMG_MAX_PX / height);
    width  = Math.round(width  * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('Error al convertir imagen a WebP')),
      'image/webp',
      IMG_WEBP_QUALITY,
    );
  });

  const nombre = file.name.replace(/\.[^.]+$/, '') + '.webp';
  return { blob, nombre, contentType: 'image/webp' };
}

/** Procesa y sube el archivo al bucket; devuelve el path de Storage y el nombre final. */
export async function subirArchivo(
  file: File,
  clinicaId: string,
  expedienteId: string,
): Promise<{ path: string; nombre: string }> {
  const { blob, nombre, contentType } = await procesarArchivo(file);
  const safeName = nombre.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${clinicaId}/${expedienteId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from('laboratorios')
    .upload(path, blob, { contentType, upsert: false });
  if (error) throw error;

  return { path, nombre };
}

export interface TipoEstudioLab { id: string; nombre: string; }

/** Carga el catálogo de tipos de estudio. */
export async function fetchTiposEstudio(): Promise<TipoEstudioLab[]> {
  const { data, error } = await supabase
    .from('tipos_estudio_lab')
    .select('id, nombre')
    .order('nombre');
  if (error) throw error;
  return (data ?? []) as TipoEstudioLab[];
}

/** Agrega un tipo nuevo al catálogo (ignora duplicados). */
export async function crearTipoEstudio(nombre: string): Promise<void> {
  const { error } = await supabase
    .from('tipos_estudio_lab')
    .insert({ nombre: nombre.trim() })
    .select()
    .maybeSingle();
  // código 23505 = unique_violation → ya existe, no es error
  if (error && error.code !== '23505') throw error;
}

// Caché de URLs firmadas: evita re-peticiones por 1 hora.
const _urlCache = new Map<string, { url: string; expiresAt: number }>();
const URL_TTL_S = 3600;

/** Genera (o devuelve desde caché) una URL firmada de descarga válida por 1 hora. */
export async function urlDescarga(path: string): Promise<string> {
  const cached = _urlCache.get(path);
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from('laboratorios')
    .createSignedUrl(path, URL_TTL_S);
  if (error) throw error;

  _urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + URL_TTL_S * 1000 });
  return data.signedUrl;
}

/** Crea el registro del estudio (las notas se cifran en la RPC). */
export async function crearEstudio(
  expedienteId: string,
  input: NuevoEstudio,
): Promise<string> {
  const { data, error } = await supabase.rpc('crear_estudio_laboratorio', {
    p_expediente_id:       expedienteId,
    p_tipo_estudio:        input.tipo_estudio,
    p_fecha_estudio:       input.fecha_estudio,
    p_archivo_url:         input.archivo_url,
    p_archivo_nombre:      input.archivo_nombre      ?? null,
    p_laboratorio_externo: input.laboratorio_externo ?? null,
    p_notas:               input.notas               ?? null,
    p_consulta_id:         input.consulta_id         ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** Lista los estudios del expediente (notas descifradas). */
export async function obtenerEstudios(expedienteId: string): Promise<EstudioUI[]> {
  const { data, error } = await supabase.rpc('obtener_estudios_laboratorio', {
    p_expediente_id: expedienteId,
  });
  if (error) throw error;
  return (data ?? []) as EstudioUI[];
}

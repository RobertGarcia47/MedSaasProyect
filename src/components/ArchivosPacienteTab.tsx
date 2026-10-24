import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Button, Card, Chip, IconButton, Dialog, TextField, Select } from './index';
import {
  CATEGORIAS_ARCHIVO, obtenerArchivos, crearArchivo, actualizarArchivo, subirArchivoPaciente,
  urlFirmada, urlsFirmadas, esImagen, esPdf, formatoTamano,
  type ArchivoPaciente, type CategoriaArchivo,
} from '../lib/archivosPaciente';

// Pestaña "Archivos" del expediente (dentistas): radiografías, fotos y documentos.
// Galería con miniaturas, visor con zoom, comparación de dos imágenes (antes/después) y
// subida múltiple. Los archivos no se borran: se archivan. Los diálogos y visores se montan
// en document.body (la animación de la página descentra los position: fixed).

const catInfo = (c: CategoriaArchivo) => CATEGORIAS_ARCHIVO.find((x) => x.value === c) ?? CATEGORIAS_ARCHIVO[3];
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fechaCorta = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
const sinExtension = (n: string) => n.replace(/\.[^.]+$/, '');

function Spinner() {
  return (
    <div style={{ padding: 28, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--primary-container)', borderTopColor: 'var(--primary)', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

// ── Subir archivos ────────────────────────────────────────────────────────────
function DialogoSubir({ expedienteId, clinicaId, onClose, onSubidos }: {
  expedienteId: string; clinicaId: string; onClose: () => void; onSubidos: (n: number) => Promise<void>;
}) {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [categoria, setCategoria] = useState<CategoriaArchivo>('radiografia');
  const [fecha, setFecha] = useState(hoyLocal());
  const [diente, setDiente] = useState('');
  const [titulo, setTitulo] = useState('');
  const [notas, setNotas] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const [progreso, setProgreso] = useState<{ actual: number; total: number } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const agregar = (lista: FileList | null) => {
    if (!lista) return;
    setArchivos((prev) => [...prev, ...Array.from(lista)]);
    setErrores([]);
  };

  const subir = async () => {
    if (archivos.length === 0) return setErrores(['Elige al menos un archivo.']);
    setErrores([]);
    let ok = 0;
    const fallos: string[] = [];
    for (let i = 0; i < archivos.length; i++) {
      setProgreso({ actual: i + 1, total: archivos.length });
      const f = archivos[i];
      try {
        const up = await subirArchivoPaciente(f, categoria, clinicaId, expedienteId);
        await crearArchivo(expedienteId, {
          categoria, fecha, diente: diente.trim() || null, notas: notas.trim() || null,
          titulo: archivos.length === 1 && titulo.trim() ? titulo.trim() : sinExtension(f.name),
          archivo_path: up.path, miniatura_path: up.miniaturaPath, archivo_nombre: up.nombre, mime: up.mime, tamano_bytes: up.tamano,
        });
        ok++;
      } catch (e: any) { fallos.push(e?.message ?? `No se pudo subir "${f.name}".`); }
    }
    setProgreso(null);
    if (ok > 0) await onSubidos(ok);
    if (fallos.length === 0) onClose();
    else { setErrores(fallos); setArchivos([]); }   // los que fallaron se vuelven a elegir
  };

  const ocupado = progreso !== null;
  return (
    <Dialog open onClose={ocupado ? () => {} : onClose} width={560}>
      <div style={{ padding: '22px 24px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="upload_file" size={24} style={{ color: 'var(--primary)' }} />
        <h2 className="title-l" style={{ flex: 1 }}>Subir archivos</h2>
        <IconButton name="close" tooltip="Cerrar" onClick={onClose} />
      </div>
      <div style={{ padding: '8px 24px 4px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          style={{ border: `2px dashed ${arrastrando ? 'var(--primary)' : 'var(--outline-variant)'}`, borderRadius: 14, padding: '22px 16px', textAlign: 'center', cursor: 'pointer', background: arrastrando ? 'color-mix(in srgb, var(--primary) 8%, var(--card-bg))' : 'var(--card-bg)' }}
        >
          <Icon name="cloud_upload" size={34} style={{ color: 'var(--primary)' }} />
          <div className="title-s" style={{ marginTop: 6 }}>Arrastra aquí o haz clic para elegir</div>
          <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', marginTop: 2 }}>Imágenes (JPG, PNG, WebP) y PDF · varios a la vez</div>
          <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }}
            onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
        </div>

        {archivos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 130, overflowY: 'auto' }}>
            {archivos.map((f, i) => (
              <div key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Icon name={f.type === 'application/pdf' ? 'picture_as_pdf' : 'image'} size={18} style={{ color: 'var(--on-surface-variant)' }} />
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                <span style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>{formatoTamano(f.size)}</span>
                {!ocupado && <IconButton name="close" size={28} iconSize={16} tooltip="Quitar" onClick={() => setArchivos((p) => p.filter((_, j) => j !== i))} />}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Select label="Categoría" value={categoria} onChange={(v: string) => setCategoria(v as CategoriaArchivo)} options={CATEGORIAS_ARCHIVO.map((c) => ({ value: c.value, label: c.label }))} />
          <TextField staticLabel label="Fecha" type="date" value={fecha} onChange={setFecha} />
        </div>
        {archivos.length === 1 && <TextField staticLabel label="Título" value={titulo} onChange={setTitulo} placeholder={sinExtension(archivos[0].name)} />}
        <TextField staticLabel label="Diente(s) / zona (opcional)" value={diente} onChange={setDiente} placeholder="16, 17 o cuadrante 2" />
        <TextField staticLabel label="Notas (cifradas)" value={notas} onChange={setNotas} multiline rows={2} placeholder="Motivo del estudio, hallazgos…" />

        {errores.length > 0 && (
          <div role="alert" style={{ fontSize: 13, color: 'var(--error)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {errores.map((m, i) => <span key={i}>{m}</span>)}
          </div>
        )}
      </div>
      <div style={{ padding: '14px 24px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, fontSize: 13, color: 'var(--on-surface-variant)' }}>
          {progreso ? `Subiendo ${progreso.actual} de ${progreso.total}…` : archivos.length > 0 ? `${archivos.length} archivo${archivos.length === 1 ? '' : 's'}` : ''}
        </div>
        <Button variant="text" onClick={onClose} disabled={ocupado}>Cancelar</Button>
        <Button variant="filled" icon="upload" onClick={subir} disabled={ocupado || archivos.length === 0}>{ocupado ? 'Subiendo…' : 'Subir'}</Button>
      </div>
    </Dialog>
  );
}

// ── Editar metadatos ──────────────────────────────────────────────────────────
function DialogoEditar({ archivo, onClose, onGuardado }: { archivo: ArchivoPaciente; onClose: () => void; onGuardado: () => Promise<void> }) {
  const [titulo, setTitulo] = useState(archivo.titulo);
  const [categoria, setCategoria] = useState<CategoriaArchivo>(archivo.categoria);
  const [fecha, setFecha] = useState(archivo.fecha);
  const [diente, setDiente] = useState(archivo.diente ?? '');
  const [notas, setNotas] = useState(archivo.notas ?? '');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    if (!titulo.trim()) return setError('El título es obligatorio.');
    setError(''); setOcupado(true);
    try {
      await actualizarArchivo(archivo.id, { categoria, titulo: titulo.trim(), fecha, diente: diente.trim() || null, notas: notas.trim() || null, archivado: archivo.archivado });
      await onGuardado();
    } catch (e: any) { setError(e?.message ?? String(e)); setOcupado(false); }
  };

  return (
    <Dialog open onClose={onClose} width={500}>
      <div style={{ padding: '22px 24px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="edit" size={24} style={{ color: 'var(--primary)' }} />
        <h2 className="title-l" style={{ flex: 1 }}>Editar archivo</h2>
        <IconButton name="close" tooltip="Cerrar" onClick={onClose} />
      </div>
      <div style={{ padding: '8px 24px 4px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TextField staticLabel label="Título" value={titulo} onChange={setTitulo} required autoFocus />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Select label="Categoría" value={categoria} onChange={(v: string) => setCategoria(v as CategoriaArchivo)} options={CATEGORIAS_ARCHIVO.map((c) => ({ value: c.value, label: c.label }))} />
          <TextField staticLabel label="Fecha" type="date" value={fecha} onChange={setFecha} />
        </div>
        <TextField staticLabel label="Diente(s) / zona" value={diente} onChange={setDiente} placeholder="16, 17 o cuadrante 2" />
        <TextField staticLabel label="Notas (cifradas)" value={notas} onChange={setNotas} multiline rows={3} />
        {error && <div role="alert" style={{ fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>{error}</div>}
      </div>
      <div style={{ padding: '14px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="text" onClick={onClose} disabled={ocupado}>Cancelar</Button>
        <Button variant="filled" icon="save" onClick={guardar} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Dialog>
  );
}

// ── Visor con zoom ────────────────────────────────────────────────────────────
const ZOOMS = [1, 1.5, 2, 3];

function Visor({ lista, indice, setIndice, onClose, puedeEditar, onEditar, onArchivar, toast }: {
  lista: ArchivoPaciente[]; indice: number; setIndice: (i: number) => void; onClose: () => void;
  puedeEditar: boolean; onEditar: (a: ArchivoPaciente) => void; onArchivar: (a: ArchivoPaciente) => Promise<void>;
  toast?: (m: string) => void;
}) {
  const a = lista[indice];
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);              // índice en ZOOMS
  const [confirma, setConfirma] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setUrl(null); setError(false); setZoom(0); setConfirma(false);
    let vivo = true;
    urlFirmada(a.archivo_path).then((u) => { if (vivo) setUrl(u); }).catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [a.archivo_path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && indice > 0) setIndice(indice - 1);
      else if (e.key === 'ArrowRight' && indice < lista.length - 1) setIndice(indice + 1);
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 1, ZOOMS.length - 1));
      else if (e.key === '-') setZoom((z) => Math.max(z - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [indice, lista.length, onClose, setIndice]);

  const descargar = async () => {
    try {
      const blob = await (await fetch(url ?? await urlFirmada(a.archivo_path))).blob();
      const objeto = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = objeto; enlace.download = a.archivo_nombre ?? a.titulo;
      document.body.appendChild(enlace); enlace.click(); enlace.remove();
      setTimeout(() => URL.revokeObjectURL(objeto), 4000);
    } catch (e: any) { toast?.('No se pudo descargar: ' + (e?.message ?? e)); }
  };

  const cat = catInfo(a.categoria);
  const boton = (icono: string, texto: string, onClick: () => void, peligro = false) => (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${peligro ? 'var(--error)' : 'var(--outline-variant)'}`, background: 'var(--card-bg)', color: peligro ? 'var(--error)' : 'var(--on-surface)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
      <Icon name={icono} size={18} />{texto}
    </button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={a.titulo} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(12,14,13,.98)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', color: '#fff' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title-m" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</div>
          <div style={{ fontSize: 12, opacity: .7 }}>{indice + 1} de {lista.length}</div>
        </div>
        {esImagen(a) && (
          <>
            <IconButton name="zoom_out" tooltip="Alejar (−)" color="#fff" onClick={() => setZoom((z) => Math.max(z - 1, 0))} />
            <span style={{ fontSize: 12.5, minWidth: 40, textAlign: 'center' }}>{Math.round(ZOOMS[zoom] * 100)}%</span>
            <IconButton name="zoom_in" tooltip="Acercar (+)" color="#fff" onClick={() => setZoom((z) => Math.min(z + 1, ZOOMS.length - 1))} />
          </>
        )}
        <IconButton name="close" tooltip="Cerrar (Esc)" color="#fff" onClick={onClose} />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 480px', minWidth: 0, minHeight: 280, position: 'relative', overflow: 'auto', display: 'flex', alignItems: ZOOMS[zoom] === 1 ? 'center' : 'flex-start', justifyContent: ZOOMS[zoom] === 1 ? 'center' : 'flex-start' }}>
          {error ? (
            <div style={{ margin: 'auto', color: '#fff', textAlign: 'center' }}><Icon name="error" size={40} /><div style={{ marginTop: 8 }}>No se pudo cargar el archivo</div></div>
          ) : !url ? (
            <div style={{ margin: 'auto' }}><Icon name="progress_activity" size={36} style={{ color: '#fff', animation: 'spin 1s linear infinite' }} /></div>
          ) : esPdf(a) ? (
            <iframe title={a.titulo} src={url} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
          ) : (
            <img src={url} alt={a.titulo}
              style={ZOOMS[zoom] === 1
                ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
                : { width: `${ZOOMS[zoom] * 100}%`, maxWidth: 'none', height: 'auto', flexShrink: 0 }} />
          )}
          {indice > 0 && <IconButton name="chevron_left" tooltip="Anterior (←)" color="#fff" size={48} iconSize={30} onClick={() => setIndice(indice - 1)}
            style={{ position: 'fixed', left: 12, top: '50%', background: 'rgba(255,255,255,.14)' }} />}
          {indice < lista.length - 1 && <IconButton name="chevron_right" tooltip="Siguiente (→)" color="#fff" size={48} iconSize={30} onClick={() => setIndice(indice + 1)}
            style={{ position: 'fixed', right: 340, top: '50%', background: 'rgba(255,255,255,.14)' }} />}
        </div>

        <aside style={{ flex: '0 0 320px', maxWidth: '100%', background: 'var(--card-bg)', padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name={cat.icon} size={20} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--primary)' }}>{cat.label}</span>
            {a.archivado && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>ARCHIVADO</span>}
          </div>
          <h3 className="title-l" style={{ wordBreak: 'break-word' }}>{a.titulo}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 13.5 }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>Fecha</span><span>{fechaCorta(a.fecha)}</span>
            {a.diente && <><span style={{ color: 'var(--on-surface-variant)' }}>Diente</span><span>{a.diente}</span></>}
            {a.tamano_bytes != null && <><span style={{ color: 'var(--on-surface-variant)' }}>Tamaño</span><span>{formatoTamano(a.tamano_bytes)}</span></>}
          </div>
          {a.notas && <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', padding: '10px 12px', borderRadius: 10, background: 'var(--surface-container-high)' }}>{a.notas}</div>}
          <div style={{ flex: 1 }} />
          {boton('download', 'Descargar', descargar)}
          {url && esPdf(a) && boton('open_in_new', 'Abrir en otra pestaña', () => window.open(url, '_blank', 'noopener'))}
          {puedeEditar && boton('edit', 'Editar datos', () => onEditar(a))}
          {puedeEditar && (confirma
            ? boton(a.archivado ? 'unarchive' : 'archive', a.archivado ? 'Confirmar: restaurar' : 'Confirmar: archivar', () => onArchivar(a), !a.archivado)
            : boton(a.archivado ? 'unarchive' : 'archive', a.archivado ? 'Restaurar' : 'Archivar', () => setConfirma(true)))}
        </aside>
      </div>
    </div>
  );
}

// ── Comparar dos imágenes (antes / después) ───────────────────────────────────
function Comparar({ a, b, onClose }: { a: ArchivoPaciente; b: ArchivoPaciente; onClose: () => void }) {
  const [antes, despues] = a.fecha <= b.fecha ? [a, b] : [b, a];
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => { urlsFirmadas([antes.archivo_path, despues.archivo_path]).then(setUrls).catch(() => setUrls(new Map())); }, [antes.archivo_path, despues.archivo_path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lado = (x: ArchivoPaciente, etiqueta: string) => (
    <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: '#fff', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', opacity: .65 }}>{etiqueta}</div>
        <div className="title-s">{x.titulo}</div>
        <div style={{ fontSize: 12.5, opacity: .75 }}>{fechaCorta(x.fecha)}{x.diente ? ` · diente ${x.diente}` : ''}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050606', borderRadius: 12, overflow: 'hidden' }}>
        {urls.get(x.archivo_path)
          ? <img src={urls.get(x.archivo_path)} alt={x.titulo} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <Icon name="progress_activity" size={32} style={{ color: '#fff', animation: 'spin 1s linear infinite' }} />}
      </div>
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Comparar imágenes" style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(12,14,13,.98)', display: 'flex', flexDirection: 'column', padding: '10px 18px 18px', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', color: '#fff' }}>
        <h3 className="title-m" style={{ flex: 1 }}>Comparar imágenes</h3>
        <IconButton name="close" tooltip="Cerrar (Esc)" color="#fff" onClick={onClose} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {lado(antes, 'Más antigua')}
        {lado(despues, 'Más reciente')}
      </div>
    </div>
  );
}

// ── Pestaña ───────────────────────────────────────────────────────────────────
type Filtro = 'todos' | CategoriaArchivo;

export function ArchivosPacienteTab({ expedienteId, clinicaId, puedeEditar, toast }: {
  expedienteId: string; clinicaId: string; puedeEditar: boolean; toast?: (m: string) => void;
}) {
  const [archivos, setArchivos] = useState<ArchivoPaciente[] | null>(null);
  const [miniaturas, setMiniaturas] = useState<Map<string, string>>(new Map());
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [verArchivados, setVerArchivados] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [visor, setVisor] = useState<number | null>(null);
  const [editando, setEditando] = useState<ArchivoPaciente | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [comparando, setComparando] = useState(false);

  const recargar = async () => {
    try { setArchivos(await obtenerArchivos(expedienteId)); }
    catch (e: any) { console.error('Archivos error:', e); toast?.('No se pudieron cargar los archivos: ' + (e?.message ?? String(e))); setArchivos((p) => p ?? []); }
  };
  useEffect(() => { setArchivos(null); setSeleccion([]); recargar(); }, [expedienteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Miniaturas (o el original si no hay miniatura) en una sola llamada de URLs firmadas.
  useEffect(() => {
    if (!archivos) return;
    const paths = archivos.filter(esImagen).map((a) => a.miniatura_path ?? a.archivo_path);
    if (paths.length === 0) return;
    urlsFirmadas(paths).then(setMiniaturas).catch(() => {});
  }, [archivos]);

  const activos = useMemo(() => (archivos ?? []).filter((a) => !a.archivado), [archivos]);
  const archivados = useMemo(() => (archivos ?? []).filter((a) => a.archivado), [archivos]);
  const visibles = useMemo(
    () => (verArchivados ? archivados : activos).filter((a) => filtro === 'todos' || a.categoria === filtro),
    [activos, archivados, verArchivados, filtro],
  );
  const cuenta = (c: Filtro) => (verArchivados ? archivados : activos).filter((a) => c === 'todos' || a.categoria === c).length;

  const alternarSeleccion = (id: string) =>
    setSeleccion((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2));
  const parComparar = seleccion.length === 2 ? seleccion.map((id) => (archivos ?? []).find((a) => a.id === id)!).filter(Boolean) : [];

  const archivar = async (a: ArchivoPaciente) => {
    try {
      await actualizarArchivo(a.id, { categoria: a.categoria, titulo: a.titulo, fecha: a.fecha, diente: a.diente, notas: a.notas, archivado: !a.archivado });
      toast?.(a.archivado ? 'Archivo restaurado' : 'Archivo archivado');
      setVisor(null);
      await recargar();
    } catch (e: any) { toast?.(e?.message ?? String(e)); }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 className="title-l">Archivos del paciente</h2>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>Radiografías, fotografías y documentos.</div>
        </div>
        {puedeEditar && archivos !== null && <Button variant="filled" icon="upload" onClick={() => setSubiendo(true)}>Subir archivos</Button>}
      </div>

      {!puedeEditar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 14, borderRadius: 'var(--r-sm)', background: 'var(--surface-container-high)', fontSize: 13.5 }}>
          <Icon name="lock" size={18} style={{ color: 'var(--on-surface-variant)' }} />Tu suscripción está en modo limitado: los archivos son de solo lectura.
        </div>
      )}

      {archivos === null ? <Spinner /> : (archivos.length === 0) ? (
        <Card variant="elevated" style={{ padding: '44px 24px', textAlign: 'center' }}>
          <Icon name="photo_library" size={44} style={{ color: 'var(--primary)', opacity: .7 }} />
          <h3 className="title-l" style={{ marginTop: 12 }}>Aún no hay archivos</h3>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', maxWidth: 440, margin: '8px auto 20px', lineHeight: 1.6 }}>
            Sube radiografías, fotos del antes y después, estudios o cualquier documento del paciente. Se guardan en privado y solo los ve el equipo de la clínica.
          </p>
          {puedeEditar && <Button variant="filled" icon="upload" onClick={() => setSubiendo(true)}>Subir el primer archivo</Button>}
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <Chip label={`Todos · ${cuenta('todos')}`} selected={filtro === 'todos'} onClick={() => setFiltro('todos')} />
            {CATEGORIAS_ARCHIVO.map((c) => (
              <Chip key={c.value} icon={c.icon} label={`${c.label}s · ${cuenta(c.value)}`}
                selected={filtro === c.value} onClick={() => setFiltro(filtro === c.value ? 'todos' : c.value)} />
            ))}
            {archivados.length > 0 && <Chip icon="archive" label={`Archivados · ${archivados.length}`} selected={verArchivados} onClick={() => setVerArchivados((v) => !v)} />}
          </div>

          {seleccion.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 14, borderRadius: 'var(--r-sm)', background: 'var(--primary-container)', color: 'var(--on-primary-container)', fontSize: 13.5, flexWrap: 'wrap' }}>
              <Icon name="compare" size={20} />
              <span style={{ flex: 1 }}>{seleccion.length === 1 ? 'Elige una segunda imagen para comparar.' : '2 imágenes elegidas.'}</span>
              <Button variant="text" onClick={() => setSeleccion([])}>Limpiar</Button>
              <Button variant="filled" icon="compare" onClick={() => setComparando(true)} disabled={seleccion.length !== 2}>Comparar</Button>
            </div>
          )}

          {visibles.length === 0 ? (
            <div className="body-l" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--on-surface-variant)' }}>No hay archivos en esta categoría.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
              {visibles.map((a, i) => {
                const miniatura = esImagen(a) ? miniaturas.get(a.miniatura_path ?? a.archivo_path) : null;
                const elegida = seleccion.includes(a.id);
                const cat = catInfo(a.categoria);
                return (
                  <div key={a.id} style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: 'var(--card-bg)', boxShadow: 'var(--elev-1)', border: `2px solid ${elegida ? 'var(--primary)' : 'transparent'}`, opacity: a.archivado ? .7 : 1 }}>
                    <button type="button" onClick={() => setVisor(i)} aria-label={`Abrir ${a.titulo}`}
                      style={{ display: 'block', width: '100%', padding: 0, border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', fontFamily: 'inherit', color: 'inherit' }}>
                      <div style={{ aspectRatio: '4 / 3', background: a.categoria === 'radiografia' ? '#0d0f0f' : 'var(--surface-container-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {miniatura
                          ? <img src={miniatura} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: a.categoria === 'radiografia' ? 'contain' : 'cover' }} />
                          : <Icon name={esPdf(a) ? 'picture_as_pdf' : cat.icon} size={44} style={{ color: 'var(--on-surface-variant)', opacity: .6 }} />}
                      </div>
                      <div style={{ padding: '10px 12px 12px' }}>
                        <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titulo}</div>
                        <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                          {fechaCorta(a.fecha)}{a.diente ? ` · diente ${a.diente}` : ''}
                        </div>
                      </div>
                    </button>
                    <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(12,14,13,.72)', color: '#fff' }}>{cat.label}</span>
                    {esImagen(a) && (
                      <button type="button" onClick={() => alternarSeleccion(a.id)} aria-pressed={elegida} aria-label={`Elegir ${a.titulo} para comparar`} title="Elegir para comparar"
                        style={{ position: 'absolute', top: 6, left: 6, width: 30, height: 30, borderRadius: '50%', border: '2px solid #fff', background: elegida ? 'var(--primary)' : 'rgba(12,14,13,.45)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        <Icon name={elegida ? 'check' : 'compare'} size={17} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {createPortal(
        <>
          {subiendo && (
            <DialogoSubir expedienteId={expedienteId} clinicaId={clinicaId} onClose={() => setSubiendo(false)}
              onSubidos={async (n) => { toast?.(n === 1 ? 'Archivo subido' : `${n} archivos subidos`); await recargar(); }} />
          )}
          {visor !== null && visibles[visor] && (
            <Visor lista={visibles} indice={visor} setIndice={setVisor} onClose={() => setVisor(null)} puedeEditar={puedeEditar}
              onEditar={(a) => { setVisor(null); setEditando(a); }} onArchivar={archivar} toast={toast} />
          )}
          {editando && (
            <DialogoEditar archivo={editando} onClose={() => setEditando(null)}
              onGuardado={async () => { toast?.('Archivo actualizado'); setEditando(null); await recargar(); }} />
          )}
          {comparando && parComparar.length === 2 && <Comparar a={parComparar[0]} b={parComparar[1]} onClose={() => setComparando(false)} />}
        </>,
        document.body,
      )}
    </>
  );
}

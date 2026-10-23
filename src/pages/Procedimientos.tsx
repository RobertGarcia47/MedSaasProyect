import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from '../context/AccountContext';
import { Icon, Button, Card, Chip, IconButton, Dialog, TextField, Switch, useIsMobile } from '../components';
import {
  fetchProcedimientos, crearProcedimiento, actualizarProcedimiento, eliminarProcedimiento,
  cargarProcedimientosBase, formatoPrecio, type Procedimiento, type ProcedimientoInput,
} from '../lib/procedimientos';

// Catálogo de procedimientos y precios de la clínica. Lo ve todo el equipo; solo el
// dueño de la clínica lo edita (la RLS lo exige, aquí además se ocultan los controles).

const SIN_CATEGORIA = 'Sin categoría';
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Spinner() {
  return (
    <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--primary-container)', borderTopColor: 'var(--primary)', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

// ── Precio: editable en la fila (se guarda al salir del campo o con Enter) ────
function PrecioCelda({ valor, editable, onGuardar }: { valor: number | null; editable: boolean; onGuardar: (n: number | null) => void }) {
  const original = valor == null ? '' : String(valor);
  const [txt, setTxt] = useState(original);
  const cancelando = useRef(false);
  useEffect(() => { setTxt(original); }, [original]);

  if (!editable) {
    return valor == null
      ? <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Sin precio</span>
      : <span style={{ fontSize: 14, fontWeight: 600 }}>{formatoPrecio(valor)}</span>;
  }

  const confirmar = () => {
    if (cancelando.current) { cancelando.current = false; setTxt(original); return; }
    const limpio = txt.replace(/[^0-9.]/g, '');
    const n = limpio === '' ? null : Number(limpio);
    if (n !== null && (Number.isNaN(n) || n < 0)) { setTxt(original); return; }
    if (n === valor) { setTxt(original); return; }   // sin cambios (normaliza "1,200" → "1200")
    onGuardar(n);
  };

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)' }}>
      <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>$</span>
      <input
        value={txt} inputMode="decimal" placeholder="Sin precio" aria-label="Precio en pesos"
        onChange={(e) => setTxt(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          if (e.key === 'Enter') el.blur();
          if (e.key === 'Escape') { cancelando.current = true; el.blur(); }
        }}
        style={{ width: 84, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-body)', color: 'var(--on-surface)' }}
      />
    </label>
  );
}

// ── Formulario (crear / editar) ───────────────────────────────────────────────
function FormularioProcedimiento({ inicial, categorias, onClose, onGuardar, onEliminar }: {
  inicial: Procedimiento | null;
  categorias: string[];
  onClose: () => void;
  onGuardar: (p: ProcedimientoInput) => Promise<void>;
  onEliminar?: () => Promise<void>;
}) {
  const [codigo, setCodigo] = useState(inicial?.codigo ?? '');
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [categoria, setCategoria] = useState(inicial?.categoria ?? '');
  const [duracion, setDuracion] = useState(String(inicial?.duracion_min ?? 30));
  const [precio, setPrecio] = useState(inicial?.precio == null ? '' : String(inicial.precio));
  const [activo, setActivo] = useState(inicial?.activo ?? true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmaBorrar, setConfirmaBorrar] = useState(false);

  const guardar = async () => {
    const dur = Number(duracion);
    const pre = precio.trim() === '' ? null : Number(precio.replace(/[^0-9.]/g, ''));
    if (!nombre.trim()) return setError('El nombre es obligatorio.');
    if (!Number.isInteger(dur) || dur <= 0) return setError('La duración debe ser un número entero de minutos mayor a 0.');
    if (pre !== null && (Number.isNaN(pre) || pre < 0)) return setError('El precio debe ser un número igual o mayor a 0.');
    setError(''); setGuardando(true);
    try {
      await onGuardar({ codigo: codigo.trim() || null, nombre: nombre.trim(), categoria: categoria.trim() || null, duracion_min: dur, precio: pre, activo });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally { setGuardando(false); }
  };

  const borrar = async () => {
    if (!onEliminar) return;
    setGuardando(true);
    try { await onEliminar(); } catch (e: any) { setError(e?.message ?? String(e)); setGuardando(false); }
  };

  return (
    <Dialog open onClose={onClose} width={520}>
      <div style={{ padding: '22px 24px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="medical_services" size={24} style={{ color: 'var(--primary)' }} />
        <h2 className="title-l" style={{ flex: 1 }}>{inicial ? 'Editar procedimiento' : 'Nuevo procedimiento'}</h2>
        <IconButton name="close" tooltip="Cerrar" onClick={onClose} />
      </div>
      <div style={{ padding: '8px 24px 4px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
          <TextField staticLabel label="Código" value={codigo} onChange={setCodigo} placeholder="EN01" />
          <TextField staticLabel label="Nombre" value={nombre} onChange={setNombre} placeholder="Endodoncia unirradicular" required autoFocus />
        </div>
        <div>
          <TextField staticLabel label="Categoría" value={categoria} onChange={setCategoria} placeholder="Endodoncia" />
          {categorias.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {categorias.map((c) => <Chip key={c} size="sm" label={c} selected={categoria === c} onClick={() => setCategoria(c)} />)}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TextField staticLabel label="Duración (min)" type="number" value={duracion} onChange={setDuracion} />
          <TextField staticLabel label="Precio (MXN)" type="number" value={precio} onChange={setPrecio} placeholder="Sin precio" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Activo</div>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Los inactivos se ocultan de la lista y no se ofrecerán al agendar o presupuestar.</div>
          </div>
          <Switch checked={activo} onChange={setActivo} />
        </div>
        {error && <div role="alert" style={{ fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>{error}</div>}
      </div>
      <div style={{ padding: '14px 24px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {onEliminar && (
          confirmaBorrar
            ? <Button variant="text" danger icon="delete" onClick={borrar} disabled={guardando}>Confirmar eliminación</Button>
            : <Button variant="text" icon="delete" onClick={() => setConfirmaBorrar(true)} disabled={guardando}>Eliminar</Button>
        )}
        <div style={{ flex: 1 }} />
        <Button variant="text" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="filled" icon="save" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Dialog>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export function Procedimientos({ toast }: { toast?: (m: string) => void }) {
  const account = useAccount();
  const clinicaId = account.clinicaId ?? '';
  const esOwner = account.rol === 'owner';
  const puedeEditar = esOwner && account.accesoNivel !== 'limitado';
  const esMovil = useIsMobile(640);

  const [items, setItems] = useState<Procedimiento[] | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [soloSinPrecio, setSoloSinPrecio] = useState(false);
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Procedimiento | 'nuevo' | null>(null);
  const [cargandoBase, setCargandoBase] = useState(false);

  const recargar = async () => {
    try { setItems(await fetchProcedimientos(clinicaId)); }
    catch (e: any) { console.error('Procedimientos error:', e); toast?.('No se pudo cargar el catálogo: ' + (e?.message ?? String(e))); setItems([]); }
  };
  useEffect(() => { if (clinicaId) recargar(); else setItems([]); }, [clinicaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const categorias = useMemo(
    () => [...new Set((items ?? []).map((i) => i.categoria || SIN_CATEGORIA))].sort((a, b) => a.localeCompare(b, 'es')),
    [items],
  );
  const activos = (items ?? []).filter((i) => i.activo);
  const faltanPrecio = activos.filter((i) => i.precio == null).length;

  const visibles = useMemo(() => {
    const needle = sinAcentos(q.trim());
    return (items ?? []).filter((i) => {
      if (!verInactivos && !i.activo) return false;
      if (cat && (i.categoria || SIN_CATEGORIA) !== cat) return false;
      if (soloSinPrecio && i.precio != null) return false;
      if (needle && !sinAcentos(`${i.codigo ?? ''} ${i.nombre} ${i.categoria ?? ''}`).includes(needle)) return false;
      return true;
    });
  }, [items, q, cat, soloSinPrecio, verInactivos]);

  const grupos = useMemo(() => {
    const m = new Map<string, Procedimiento[]>();
    for (const i of visibles) {
      const k = i.categoria || SIN_CATEGORIA;
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [visibles]);

  const guardarPrecio = async (p: Procedimiento, precio: number | null) => {
    setItems((prev) => prev && prev.map((i) => i.id === p.id ? { ...i, precio } : i));   // optimista
    try {
      await actualizarProcedimiento(p.id, { precio });
      toast?.(precio == null ? `Se quitó el precio de ${p.nombre}` : `${p.nombre}: ${formatoPrecio(precio)}`);
    } catch (e: any) {
      toast?.(e?.message ?? String(e));
      recargar();
    }
  };

  const cargarBase = async () => {
    setCargandoBase(true);
    try {
      const n = await cargarProcedimientosBase(clinicaId);
      toast?.(n > 0 ? `Se agregaron ${n} procedimientos sugeridos` : 'Ya tenías todos los procedimientos sugeridos');
      await recargar();
    } catch (e: any) { toast?.(e?.message ?? String(e)); }
    finally { setCargandoBase(false); }
  };

  const columnas = esMovil ? 'minmax(0,1fr) 120px 36px' : 'minmax(0,1fr) 90px 150px 44px';

  return (
    <>
    <div className="page-pad fade-up">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
        <div>
          <h1 className="headline-l" style={{ letterSpacing: '-.5px' }}>Procedimientos y precios</h1>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>
            {items === null ? 'Cargando…' : `${activos.length} procedimiento${activos.length === 1 ? '' : 's'} activo${activos.length === 1 ? '' : 's'}`}
            {items !== null && activos.length > 0 && (faltanPrecio > 0 ? ` · ${faltanPrecio} sin precio` : ' · todos con precio')}
          </div>
        </div>
        {puedeEditar && items !== null && items.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="outlined" icon="playlist_add" onClick={cargarBase} disabled={cargandoBase}>{cargandoBase ? 'Cargando…' : 'Agregar sugeridos'}</Button>
            <Button variant="filled" icon="add" onClick={() => setEditando('nuevo')}>Nuevo procedimiento</Button>
          </div>
        )}
      </div>

      {!puedeEditar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 16, borderRadius: 'var(--r-sm)', background: 'var(--surface-container-high)', fontSize: 13.5 }}>
          <Icon name="lock" size={18} style={{ color: 'var(--on-surface-variant)' }} />
          {esOwner ? 'Tu suscripción está en modo limitado: el catálogo es de solo lectura.' : 'Solo el dueño de la clínica puede editar el catálogo y los precios.'}
        </div>
      )}

      {items === null ? <Spinner /> : items.length === 0 ? (
        <Card variant="elevated" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <Icon name="medical_services" size={44} style={{ color: 'var(--primary)', opacity: .7 }} />
          <h2 className="title-l" style={{ marginTop: 12 }}>Aún no hay procedimientos</h2>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', maxWidth: 460, margin: '8px auto 20px', lineHeight: 1.6 }}>
            {puedeEditar
              ? 'Empieza con el catálogo dental sugerido (51 procedimientos comunes, sin precios) y ponle precio a cada uno, o agrega los tuyos a mano.'
              : 'Pídele al dueño de la clínica que cargue el catálogo de procedimientos.'}
          </p>
          {puedeEditar && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="filled" icon="playlist_add" onClick={cargarBase} disabled={cargandoBase}>{cargandoBase ? 'Cargando…' : 'Cargar catálogo dental sugerido'}</Button>
              <Button variant="outlined" icon="add" onClick={() => setEditando('nuevo')}>Agregar uno a mano</Button>
            </div>
          )}
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 240, maxWidth: 420, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-container-high)', borderRadius: 'var(--r-full)', padding: '0 18px', height: 48 }}>
              <Icon name="search" size={22} style={{ color: 'var(--on-surface-variant)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, código o categoría…" aria-label="Buscar procedimiento"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)' }} />
              {q && <Icon name="close" size={20} onClick={() => setQ('')} title="Limpiar búsqueda" style={{ color: 'var(--on-surface-variant)' }} />}
            </div>
            <Chip label={`Sin precio · ${faltanPrecio}`} icon="sell" selected={soloSinPrecio} onClick={() => setSoloSinPrecio((v) => !v)} />
            <Chip label="Ver inactivos" icon="visibility" selected={verInactivos} onClick={() => setVerInactivos((v) => !v)} />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <Chip label="Todas" selected={cat === ''} onClick={() => setCat('')} />
            {categorias.map((c) => <Chip key={c} label={c} selected={cat === c} onClick={() => setCat(cat === c ? '' : c)} />)}
          </div>

          {grupos.length === 0 ? (
            <div className="body-l" style={{ textAlign: 'center', padding: '48px 0', color: 'var(--on-surface-variant)' }}>Ningún procedimiento coincide con los filtros.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {grupos.map(([nombreCat, lista]) => (
                <Card key={nombreCat} variant="elevated" style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: columnas, gap: 12, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>
                      {nombreCat} <span style={{ fontWeight: 500 }}>· {lista.length}</span>
                    </div>
                    {!esMovil && <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.4px', color: 'var(--on-surface-variant)' }}>DURACIÓN</div>}
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.4px', color: 'var(--on-surface-variant)', textAlign: esMovil ? 'right' : 'left' }}>PRECIO</div>
                    <div />
                  </div>
                  {lista.map((p) => (
                    <div key={p.id} style={{ display: 'grid', gridTemplateColumns: columnas, gap: 12, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--outline-variant)', opacity: p.activo ? 1 : .55 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.nombre}{!p.activo && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--on-surface-variant)' }}>INACTIVO</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                          {[p.codigo, esMovil ? `${p.duracion_min} min` : null].filter(Boolean).join(' · ') || ' '}
                        </div>
                      </div>
                      {!esMovil && <div className="body-m">{p.duracion_min} min</div>}
                      <div style={{ display: 'flex', justifyContent: esMovil ? 'flex-end' : 'flex-start' }}>
                        <PrecioCelda valor={p.precio} editable={puedeEditar} onGuardar={(n) => guardarPrecio(p, n)} />
                      </div>
                      <div>{puedeEditar && <IconButton name="edit" tooltip="Editar" size={36} iconSize={20} onClick={() => setEditando(p)} />}</div>
                    </div>
                  ))}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>

    {/* Fuera de .fade-up: esa animación deja un transform y haría que el Dialog
        (position: fixed) se centrara en toda la página en vez de en la ventana. */}
      {editando && (
        <FormularioProcedimiento
          inicial={editando === 'nuevo' ? null : editando}
          categorias={categorias.filter((c) => c !== SIN_CATEGORIA)}
          onClose={() => setEditando(null)}
          onGuardar={async (datos) => {
            if (editando === 'nuevo') await crearProcedimiento(clinicaId, datos);
            else await actualizarProcedimiento(editando.id, datos);
            toast?.(editando === 'nuevo' ? 'Procedimiento agregado' : 'Procedimiento actualizado');
            setEditando(null);
            await recargar();
          }}
          onEliminar={editando === 'nuevo' ? undefined : async () => {
            await eliminarProcedimiento(editando.id);
            toast?.('Procedimiento eliminado');
            setEditando(null);
            await recargar();
          }}
        />
      )}
    </>
  );
}

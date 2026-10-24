import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Button, Card, IconButton, Dialog, TextField, Select, useIsMobile } from './index';
import {
  obtenerPlanes, crearPlan, actualizarPlan, eliminarPlan, guardarItem, eliminarItem, calcularTotales,
  ESTADOS_PLAN, ESTADOS_ITEM, type PlanDental, type ItemPlan, type ItemPlanInput, type EstadoItem, type EstadoPlan,
} from '../lib/planesTratamiento';
import { fetchProcedimientos, formatoPrecio, type Procedimiento } from '../lib/procedimientos';
import { useAccount } from '../context/AccountContext';
import { construirPresupuestoPdf, generarPresupuestoPdf, PLANTILLAS, type PresupuestoPdfData } from '../lib/pdf';
import { PdfPreviewModal } from './PdfPreviewModal';

// Pestaña "Plan de tratamiento" del expediente (solo dentistas): planes con líneas
// (diente + procedimiento + precio), estado de cada línea y total. Los diálogos se
// montan en document.body: la página tiene una animación con transform que, si no,
// descentra los position: fixed.

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Colores por estado (con tokens, para que sirvan en claro y oscuro).
const BADGE_OK  = ['color-mix(in srgb, var(--success) 18%, var(--surface))', 'var(--success)'] as const;
const COLOR_PLAN: Record<EstadoPlan, readonly [string, string]> = {
  borrador:   ['var(--surface-container-highest)', 'var(--on-surface-variant)'],
  presentado: ['var(--secondary-container)', 'var(--on-secondary-container)'],
  aprobado:   ['var(--primary-container)', 'var(--on-primary-container)'],
  completado: BADGE_OK,
  cancelado:  ['var(--error-container)', 'var(--on-error-container)'],
};
const COLOR_ITEM: Record<EstadoItem, readonly [string, string]> = {
  pendiente: ['var(--surface-container-highest)', 'var(--on-surface-variant)'],
  en_curso:  ['var(--warning-container)', 'var(--on-warning-container)'],
  hecho:     BADGE_OK,
  cancelado: ['var(--error-container)', 'var(--on-error-container)'],
};

function Badge({ texto, colores }: { texto: string; colores: readonly [string, string] }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: colores[0], color: colores[1], whiteSpace: 'nowrap' }}>{texto}</span>
  );
}

function Spinner() {
  return (
    <div style={{ padding: 28, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--primary-container)', borderTopColor: 'var(--primary)', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

const itemAInput = (i: ItemPlan, cambios: Partial<ItemPlanInput> = {}): ItemPlanInput => ({
  procedimiento_id: i.procedimiento_id, codigo: i.codigo, nombre: i.nombre, diente: i.diente,
  cantidad: i.cantidad, precio_unitario: i.precio_unitario, estado: i.estado, notas: i.notas, orden: i.orden, ...cambios,
});

// ── Diálogo: plan (título, estado, descuento, notas) ──────────────────────────
function DialogoPlan({ plan, onClose, onGuardado }: { plan: PlanDental; onClose: () => void; onGuardado: (m: string) => Promise<void> }) {
  const [titulo, setTitulo] = useState(plan.titulo);
  const [estado, setEstado] = useState<EstadoPlan>(plan.estado);
  const [descuento, setDescuento] = useState(String(plan.descuento_pct));
  const [notas, setNotas] = useState(plan.notas ?? '');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [confirmaBorrar, setConfirmaBorrar] = useState(false);

  const guardar = async () => {
    const d = Number(descuento === '' ? 0 : descuento);
    if (!titulo.trim()) return setError('El título es obligatorio.');
    if (Number.isNaN(d) || d < 0 || d > 100) return setError('El descuento debe estar entre 0 y 100.');
    setError(''); setOcupado(true);
    try {
      await actualizarPlan(plan.id, { titulo: titulo.trim(), notas: notas.trim() || null, estado, descuento_pct: d });
      await onGuardado('Plan actualizado');
    } catch (e: any) { setError(e?.message ?? String(e)); setOcupado(false); }
  };
  const borrar = async () => {
    setOcupado(true);
    try { await eliminarPlan(plan.id); await onGuardado('Plan eliminado'); }
    catch (e: any) { setError(e?.message ?? String(e)); setOcupado(false); }
  };

  return (
    <Dialog open onClose={onClose} width={520}>
      <div style={{ padding: '22px 24px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="checklist" size={24} style={{ color: 'var(--primary)' }} />
        <h2 className="title-l" style={{ flex: 1 }}>Editar plan</h2>
        <IconButton name="close" tooltip="Cerrar" onClick={onClose} />
      </div>
      <div style={{ padding: '8px 24px 4px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TextField staticLabel label="Título" value={titulo} onChange={setTitulo} required autoFocus />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
          <Select label="Estado del plan" value={estado} onChange={(v: string) => setEstado(v as EstadoPlan)} options={ESTADOS_PLAN} />
          <TextField staticLabel label="Descuento (%)" type="number" value={descuento} onChange={setDescuento} />
        </div>
        <TextField staticLabel label="Notas del plan (cifradas)" value={notas} onChange={setNotas} multiline rows={3}
          placeholder="Condiciones de pago, secuencia de tratamiento, observaciones…" />
        {error && <div role="alert" style={{ fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>{error}</div>}
      </div>
      <div style={{ padding: '14px 24px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {plan.estado === 'borrador' && (
          confirmaBorrar
            ? <Button variant="text" danger icon="delete" onClick={borrar} disabled={ocupado}>Confirmar eliminación</Button>
            : <Button variant="text" icon="delete" onClick={() => setConfirmaBorrar(true)} disabled={ocupado}>Eliminar plan</Button>
        )}
        <div style={{ flex: 1 }} />
        <Button variant="text" onClick={onClose} disabled={ocupado}>Cancelar</Button>
        <Button variant="filled" icon="save" onClick={guardar} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Dialog>
  );
}

// ── Diálogo: línea del plan (procedimiento del catálogo o personalizado) ──────
function DialogoItem({ item, catalogo, siguienteOrden, onClose, onGuardar, onEliminar }: {
  item: ItemPlan | null;
  catalogo: Procedimiento[];
  siguienteOrden: number;
  onClose: () => void;
  onGuardar: (i: ItemPlanInput) => Promise<void>;
  onEliminar?: () => Promise<void>;
}) {
  const [procId, setProcId] = useState<string | null>(item?.procedimiento_id ?? null);
  const [codigo, setCodigo] = useState<string | null>(item?.codigo ?? null);
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [diente, setDiente] = useState(item?.diente ?? '');
  const [cantidad, setCantidad] = useState(String(item?.cantidad ?? 1));
  const [precio, setPrecio] = useState(item ? String(item.precio_unitario) : '');
  const [estado, setEstado] = useState<EstadoItem>(item?.estado ?? 'pendiente');
  const [notas, setNotas] = useState(item?.notas ?? '');
  const [verSug, setVerSug] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [confirmaBorrar, setConfirmaBorrar] = useState(false);

  const sugerencias = useMemo(() => {
    const q = sinAcentos(nombre.trim());
    return catalogo
      .filter((p) => !q || sinAcentos(`${p.codigo ?? ''} ${p.nombre} ${p.categoria ?? ''}`).includes(q))
      .slice(0, 5);
  }, [catalogo, nombre]);

  const elegir = (p: Procedimiento) => {
    setProcId(p.id); setCodigo(p.codigo); setNombre(p.nombre);
    if (p.precio != null) setPrecio(String(p.precio));
    setVerSug(false);
  };

  const guardar = async () => {
    const cant = Number(cantidad), pre = precio.trim() === '' ? 0 : Number(precio);
    if (!nombre.trim()) return setError('Escribe o elige un procedimiento.');
    if (!Number.isInteger(cant) || cant <= 0) return setError('La cantidad debe ser un entero mayor a 0.');
    if (Number.isNaN(pre) || pre < 0) return setError('El precio debe ser un número igual o mayor a 0.');
    setError(''); setOcupado(true);
    try {
      await onGuardar({
        procedimiento_id: procId, codigo, nombre: nombre.trim(), diente: diente.trim() || null,
        cantidad: cant, precio_unitario: pre, estado, notas: notas.trim() || null, orden: item?.orden ?? siguienteOrden,
      });
    } catch (e: any) { setError(e?.message ?? String(e)); setOcupado(false); }
  };
  const borrar = async () => {
    if (!onEliminar) return;
    setOcupado(true);
    try { await onEliminar(); } catch (e: any) { setError(e?.message ?? String(e)); setOcupado(false); }
  };

  return (
    <Dialog open onClose={onClose} width={540}>
      <div style={{ padding: '22px 24px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="medical_services" size={24} style={{ color: 'var(--primary)' }} />
        <h2 className="title-l" style={{ flex: 1 }}>{item ? 'Editar línea' : 'Agregar procedimiento'}</h2>
        <IconButton name="close" tooltip="Cerrar" onClick={onClose} />
      </div>
      <div style={{ padding: '8px 24px 4px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ position: 'relative' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--on-surface-variant)', marginBottom: 6 }}>Procedimiento *</label>
          <input
            value={nombre} autoFocus placeholder="Busca en el catálogo o escribe uno propio…"
            onChange={(e) => { setNombre(e.target.value); setProcId(null); setCodigo(null); setVerSug(true); }}
            onFocus={() => setVerSug(true)} onBlur={() => setVerSug(false)}
            style={{ width: '100%', minHeight: 52, padding: '0 16px', fontSize: 15, fontFamily: 'var(--font-body)', color: 'var(--on-surface)', background: 'var(--surface-container-highest)', border: '1.5px solid var(--outline-variant)', borderRadius: 'var(--r-xs)', outline: 'none' }}
          />
          {procId && <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>Del catálogo{codigo ? ` · ${codigo}` : ''}</div>}
          {verSug && sugerencias.length > 0 && (
            <div role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: 80, zIndex: 5, background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 10, boxShadow: 'var(--elev-3)', overflow: 'hidden' }}>
              {sugerencias.map((p) => (
                <div key={p.id} role="option" onMouseDown={(e) => { e.preventDefault(); elegir(p); }} className="state-layer"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{[p.codigo, p.categoria].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.precio != null ? formatoPrecio(p.precio) : 'Sin precio'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', gap: 12 }}>
          <TextField staticLabel label="Diente(s) / zona" value={diente} onChange={setDiente} placeholder="16, 17 o cuadrante 2" />
          <TextField staticLabel label="Cantidad" type="number" value={cantidad} onChange={setCantidad} />
          <TextField staticLabel label="Precio unitario (MXN)" type="number" value={precio} onChange={setPrecio} placeholder="0" />
        </div>
        <Select label="Estado" value={estado} onChange={(v: string) => setEstado(v as EstadoItem)} options={ESTADOS_ITEM} />
        <TextField staticLabel label="Notas (cifradas)" value={notas} onChange={setNotas} multiline rows={2} placeholder="Material, indicaciones, observaciones de esta línea…" />
        {error && <div role="alert" style={{ fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>{error}</div>}
      </div>
      <div style={{ padding: '14px 24px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {onEliminar && (
          confirmaBorrar
            ? <Button variant="text" danger icon="delete" onClick={borrar} disabled={ocupado}>Confirmar</Button>
            : <Button variant="text" icon="delete" onClick={() => setConfirmaBorrar(true)} disabled={ocupado}>Quitar</Button>
        )}
        <div style={{ flex: 1 }} />
        <Button variant="text" onClick={onClose} disabled={ocupado}>Cancelar</Button>
        <Button variant="filled" icon="save" onClick={guardar} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Dialog>
  );
}

// ── Pestaña ───────────────────────────────────────────────────────────────────
export function PlanTratamientoTab({ expedienteId, clinicaId, pacienteId, pacienteNombre, puedeEditar, toast }: {
  expedienteId: string; clinicaId: string; pacienteId: string; pacienteNombre: string; puedeEditar: boolean; toast?: (m: string) => void;
}) {
  const account = useAccount();
  const esMovil = useIsMobile(700);
  const [planes, setPlanes] = useState<PlanDental[] | null>(null);
  const [catalogo, setCatalogo] = useState<Procedimiento[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [editandoPlan, setEditandoPlan] = useState<PlanDental | null>(null);
  const [dialogoItem, setDialogoItem] = useState<{ plan: PlanDental; item: ItemPlan | null } | null>(null);
  const [creando, setCreando] = useState(false);
  const [presupuesto, setPresupuesto] = useState<{ plan: PlanDental; data: PresupuestoPdfData } | null>(null);
  const [generandoPdf, setGenerandoPdf] = useState<string | null>(null);

  const recargar = async (abrir?: string) => {
    try {
      const lista = await obtenerPlanes(expedienteId);
      setPlanes(lista);
      setAbierto((actual) => abrir ?? (actual && lista.some((p) => p.id === actual) ? actual : lista[0]?.id ?? null));
    } catch (e: any) {
      console.error('Planes error:', e);
      toast?.('No se pudo cargar el plan: ' + (e?.message ?? String(e)));
      setPlanes((p) => p ?? []);
    }
  };

  useEffect(() => { setPlanes(null); recargar(); }, [expedienteId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!clinicaId) return;
    fetchProcedimientos(clinicaId).then((l) => setCatalogo(l.filter((p) => p.activo))).catch(() => setCatalogo([]));
  }, [clinicaId]);

  const nuevoPlan = async () => {
    setCreando(true);
    try {
      const n = (planes?.length ?? 0) + 1;
      const id = await crearPlan(expedienteId, n === 1 ? 'Plan de tratamiento' : `Plan de tratamiento ${n}`);
      await recargar(id);
      toast?.('Plan creado');
    } catch (e: any) { toast?.(e?.message ?? String(e)); }
    finally { setCreando(false); }
  };

  const abrirPresupuesto = async (plan: PlanDental) => {
    setGenerandoPdf(plan.id);
    try {
      const data = await construirPresupuestoPdf(plan, {
        clinicaId, userId: account.userId, medicoNombre: account.nombreCompleto, pacienteId, pacienteNombre,
      });
      setPresupuesto({ plan, data });
    } catch (e: any) { toast?.(e?.message ?? String(e)); }
    finally { setGenerandoPdf(null); }
  };

  // Tras entregar el presupuesto, un borrador pasa a "presentado" (a decisión de quien lo emite).
  const marcarPresentado = async () => {
    if (!presupuesto) return;
    const { plan } = presupuesto;
    try {
      await actualizarPlan(plan.id, { titulo: plan.titulo, notas: plan.notas, estado: 'presentado', descuento_pct: plan.descuento_pct });
      setPresupuesto((p) => p && { ...p, plan: { ...p.plan, estado: 'presentado' } });
      toast?.('Plan marcado como presentado');
      await recargar();
    } catch (e: any) { toast?.(e?.message ?? String(e)); }
  };

  const cambiarEstadoItem = async (plan: PlanDental, item: ItemPlan, estado: EstadoItem) => {
    setPlanes((prev) => prev && prev.map((p) => p.id !== plan.id ? p : { ...p, items: p.items.map((i) => i.id === item.id ? { ...i, estado } : i) }));
    try { await guardarItem(plan.id, item.id, itemAInput(item, { estado })); await recargar(); }
    catch (e: any) { toast?.(e?.message ?? String(e)); recargar(); }
  };

  const columnas = esMovil ? 'minmax(0,1fr) 110px' : '64px minmax(0,1fr) 46px 96px 104px 132px 40px';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 className="title-l">Plan de tratamiento y presupuesto</h2>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>Procedimientos propuestos, su precio y su avance.</div>
        </div>
        {puedeEditar && planes !== null && planes.length > 0 && (
          <Button variant="filled" icon="add" onClick={nuevoPlan} disabled={creando}>{creando ? 'Creando…' : 'Nuevo plan'}</Button>
        )}
      </div>

      {!puedeEditar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 14, borderRadius: 'var(--r-sm)', background: 'var(--surface-container-high)', fontSize: 13.5 }}>
          <Icon name="lock" size={18} style={{ color: 'var(--on-surface-variant)' }} />Tu suscripción está en modo limitado: el plan es de solo lectura.
        </div>
      )}

      {planes === null ? <Spinner /> : planes.length === 0 ? (
        <Card variant="elevated" style={{ padding: '44px 24px', textAlign: 'center' }}>
          <Icon name="checklist" size={44} style={{ color: 'var(--primary)', opacity: .7 }} />
          <h3 className="title-l" style={{ marginTop: 12 }}>Aún no hay un plan de tratamiento</h3>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', maxWidth: 440, margin: '8px auto 20px', lineHeight: 1.6 }}>
            Crea un plan, agrega los procedimientos que necesita el paciente y obtén el total del presupuesto.
          </p>
          {puedeEditar && <Button variant="filled" icon="add" onClick={nuevoPlan} disabled={creando}>{creando ? 'Creando…' : 'Crear plan de tratamiento'}</Button>}
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {planes.map((plan) => {
            const t = calcularTotales(plan);
            const abiertoAhora = abierto === plan.id;
            const avance = t.subtotal > 0 ? Math.min(100, Math.round((t.hecho / Math.max(t.total, 0.01)) * 100)) : 0;
            return (
              <Card key={plan.id} variant="elevated" style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
                  <button onClick={() => setAbierto(abiertoAhora ? null : plan.id)} aria-expanded={abiertoAhora}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--on-surface)' }}>
                    <Icon name="expand_more" size={22} style={{ color: 'var(--on-surface-variant)', flexShrink: 0, transition: 'transform .2s', transform: abiertoAhora ? 'rotate(180deg)' : 'none' }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span className="title-m" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.titulo}</span>
                        <Badge texto={ESTADOS_PLAN.find((e) => e.value === plan.estado)?.label ?? plan.estado} colores={COLOR_PLAN[plan.estado]} />
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                        {t.lineas} procedimiento{t.lineas === 1 ? '' : 's'} · {t.lineasHechas} hecho{t.lineasHechas === 1 ? '' : 's'} · creado {new Date(plan.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')}
                      </div>
                    </div>
                  </button>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>{formatoPrecio(t.total) || '$0'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)' }}>total</div>
                  </div>
                  {puedeEditar && <IconButton name="edit" tooltip="Editar plan" size={36} iconSize={20} onClick={() => setEditandoPlan(plan)} />}
                </div>

                {abiertoAhora && (
                  <div style={{ borderTop: '1px solid var(--outline-variant)' }}>
                    {plan.items.length === 0 ? (
                      <div className="body-m" style={{ padding: '24px 20px', color: 'var(--on-surface-variant)' }}>Este plan aún no tiene procedimientos.</div>
                    ) : (
                      <>
                        {!esMovil && (
                          <div style={{ display: 'grid', gridTemplateColumns: columnas, gap: 10, padding: '10px 20px', fontSize: 11.5, fontWeight: 700, letterSpacing: '.4px', color: 'var(--on-surface-variant)' }}>
                            <div>DIENTE</div><div>PROCEDIMIENTO</div><div>CANT.</div><div style={{ textAlign: 'right' }}>PRECIO</div><div style={{ textAlign: 'right' }}>SUBTOTAL</div><div>ESTADO</div><div />
                          </div>
                        )}
                        {plan.items.map((i) => {
                          const cancelado = i.estado === 'cancelado';
                          const selector = (
                            <select value={i.estado} disabled={!puedeEditar} aria-label={`Estado de ${i.nombre}`}
                              onChange={(e) => cambiarEstadoItem(plan, i, e.target.value as EstadoItem)}
                              style={{ width: '100%', height: 32, padding: '0 8px', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-body)', borderRadius: 999, border: 'none', cursor: puedeEditar ? 'pointer' : 'default', background: COLOR_ITEM[i.estado][0], color: COLOR_ITEM[i.estado][1] }}>
                              {ESTADOS_ITEM.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                            </select>
                          );
                          return (
                            <div key={i.id} style={{ display: 'grid', gridTemplateColumns: columnas, gap: 10, alignItems: 'center', padding: '10px 20px', borderTop: '1px solid var(--outline-variant)', opacity: cancelado ? .6 : 1 }}>
                              {esMovil ? (
                                <>
                                  <div style={{ minWidth: 0 }}>
                                    <div className="title-s" style={{ textDecoration: cancelado ? 'line-through' : 'none' }}>{i.nombre}</div>
                                    <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                                      {[i.diente ? `Diente ${i.diente}` : null, `${i.cantidad} × ${formatoPrecio(i.precio_unitario) || '$0'}`].filter(Boolean).join(' · ')}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', fontWeight: 700 }}>{formatoPrecio(i.cantidad * i.precio_unitario) || '$0'}</div>
                                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>{selector}</div>
                                    {puedeEditar && <IconButton name="edit" tooltip="Editar línea" size={36} iconSize={20} onClick={() => setDialogoItem({ plan, item: i })} />}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div style={{ fontWeight: 600, fontSize: 14 }}>{i.diente || <span style={{ color: 'var(--on-surface-variant)', fontWeight: 400 }}>—</span>}</div>
                                  <div style={{ minWidth: 0 }}>
                                    <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: cancelado ? 'line-through' : 'none' }}>
                                      {i.nombre}{i.notas && <Icon name="sticky_note_2" size={15} title={i.notas} style={{ marginLeft: 6, verticalAlign: '-2px', color: 'var(--on-surface-variant)' }} />}
                                    </div>
                                    {i.codigo && <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{i.codigo}</div>}
                                  </div>
                                  <div className="body-m">{i.cantidad}</div>
                                  <div className="body-m" style={{ textAlign: 'right' }}>{formatoPrecio(i.precio_unitario) || '$0'}</div>
                                  <div style={{ textAlign: 'right', fontWeight: 700 }}>{formatoPrecio(i.cantidad * i.precio_unitario) || '$0'}</div>
                                  {selector}
                                  <div>{puedeEditar && <IconButton name="edit" tooltip="Editar línea" size={36} iconSize={20} onClick={() => setDialogoItem({ plan, item: i })} />}</div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}

                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', padding: '16px 20px 18px', borderTop: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)' }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {puedeEditar && <Button variant="outlined" icon="add" onClick={() => setDialogoItem({ plan, item: null })}>Agregar procedimiento</Button>}
                          <Button variant="outlined" icon="picture_as_pdf" onClick={() => abrirPresupuesto(plan)} disabled={t.lineas === 0 || generandoPdf === plan.id}>
                            {generandoPdf === plan.id ? 'Preparando…' : 'Presupuesto PDF'}
                          </Button>
                        </div>
                        {plan.notas && (
                          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--on-surface-variant)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            <strong style={{ color: 'var(--on-surface)' }}>Notas:</strong> {plan.notas}
                          </div>
                        )}
                      </div>
                      <div style={{ minWidth: 240, fontSize: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}><span>Subtotal</span><span>{formatoPrecio(t.subtotal) || '$0'}</span></div>
                        {plan.descuento_pct > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                            <span>Descuento ({plan.descuento_pct}%)</span><span>−{formatoPrecio(t.descuento)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--outline-variant)', fontWeight: 700, fontSize: 17 }}>
                          <span>Total</span><span>{formatoPrecio(t.total) || '$0'}</span>
                        </div>
                        {t.subtotal > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-container-highest)', overflow: 'hidden' }}>
                              <div style={{ width: `${avance}%`, height: '100%', background: 'var(--success)' }} />
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>Realizado: {formatoPrecio(t.hecho) || '$0'} ({avance}%)</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {createPortal(
        <>
          {editandoPlan && (
            <DialogoPlan
              plan={editandoPlan}
              onClose={() => setEditandoPlan(null)}
              onGuardado={async (m) => { toast?.(m); setEditandoPlan(null); await recargar(); }}
            />
          )}
          <PdfPreviewModal
            open={!!presupuesto}
            data={presupuesto?.data ?? null}
            generar={generarPresupuestoPdf}
            titulo="Presupuesto de tratamiento"
            detalle={presupuesto
              ? `${presupuesto.data.folio ?? 'Vista previa'} · Plantilla ${(PLANTILLAS.find((p) => p.id === presupuesto.data.plantilla) ?? PLANTILLAS[0]).nombre}`
              : undefined}
            icono="request_quote"
            nombreArchivo={`Presupuesto ${presupuesto?.data.folio ?? ''}`.trim() + '.pdf'}
            acciones={presupuesto && presupuesto.plan.estado === 'borrador' && puedeEditar
              ? <Button variant="text" icon="send" onClick={marcarPresentado}>Marcar plan como presentado</Button>
              : undefined}
            onClose={() => setPresupuesto(null)}
            toast={toast}
          />
          {dialogoItem && (
            <DialogoItem
              item={dialogoItem.item}
              catalogo={catalogo}
              siguienteOrden={dialogoItem.plan.items.reduce((m, i) => Math.max(m, i.orden), 0) + 1}
              onClose={() => setDialogoItem(null)}
              onGuardar={async (input) => {
                await guardarItem(dialogoItem.plan.id, dialogoItem.item?.id ?? null, input);
                toast?.(dialogoItem.item ? 'Línea actualizada' : 'Procedimiento agregado');
                setDialogoItem(null);
                await recargar();
              }}
              onEliminar={dialogoItem.item ? async () => {
                await eliminarItem(dialogoItem.item!.id);
                toast?.('Línea eliminada');
                setDialogoItem(null);
                await recargar();
              } : undefined}
            />
          )}
        </>,
        document.body,
      )}
    </>
  );
}

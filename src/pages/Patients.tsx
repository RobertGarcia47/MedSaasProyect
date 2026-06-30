import { useState, useEffect } from 'react';
import { useAccount } from '../context/AccountContext';
import { fetchPacientes, fetchPacienteDetalle, actualizarPaciente, type PacienteUI, type PacienteDetalleUI } from '../lib/patients';
import type { SexoEnum, GrupoSanguineo } from '../lib/types';
import { obtenerRecetas, formatFolioReceta, type RecetaUI } from '../lib/recetas';
import { construirRecetaPdfDesdeReceta, type RecetaPdfData } from '../lib/pdf';
import { PdfRecetaModal } from '../components/PdfRecetaModal';
import { obtenerInformes, formatFolio, TIPO_INFORME_LABEL, TIPO_INFORME_ICON, TIPO_INFORME_COLOR, VISIBILIDAD_ICON, VISIBILIDAD_LABEL, type InformeUI } from '../lib/informes';
import { obtenerEstudios, urlDescarga, type EstudioUI } from '../lib/laboratorio';
import { obtenerConsultas, type ConsultaDetalleUI } from '../lib/consultas';
import { Icon, Button, Card, Chip, Avatar, IconButton, Segmented, Divider, SectionHeader } from '../components';

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ size = 32 }: { size?: number }) {
  return (
    <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', border: '3px solid var(--primary-container)', borderTopColor: 'var(--primary)', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 20px', color: 'var(--on-surface-variant)' }}>
      <Icon name={icon} size={48} style={{ opacity: .5 }} />
      <span className="body-l">{text}</span>
    </div>
  );
}

function InfoStat({ label, value, sub }: { label: string; value?: string | number | null; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', fontWeight: 600 }}>{label}</div>
      <div className="title-m" style={{ marginTop: 2 }}>
        {value ?? '—'}{' '}
        {sub && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--on-surface-variant)' }}>{sub}</span>}
      </div>
    </div>
  );
}

// ── Lista de pacientes ────────────────────────────────────────────────────────
export function PatientList({ go, openModal, dataVersion = 0 }: { go: (n: string, p?: any) => void; openModal: (t: string) => void; dataVersion?: number }) {
  const account   = useAccount();
  const clinicaId = account.clinicaId ?? '';

  const [q,       setQ]       = useState('');
  const [view,    setView]    = useState<'table' | 'grid'>('table');
  const [loading, setLoading] = useState(true);
  const [all,     setAll]     = useState<PacienteUI[]>([]);

  useEffect(() => {
    if (!clinicaId) { setLoading(false); return; }
    setLoading(true);
    fetchPacientes(clinicaId)
      .then(setAll)
      .catch((e) => console.error('PatientList load error:', e))
      .finally(() => setLoading(false));
  }, [clinicaId, dataVersion]);

  const list = q
    ? all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || (p.curp ?? '').toLowerCase().includes(q.toLowerCase()))
    : all;

  return (
    <div className="page-pad fade-up">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="headline-l" style={{ letterSpacing: '-.5px' }}>Pacientes</h1>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>
            {loading ? 'Cargando…' : `${all.length} paciente${all.length !== 1 ? 's' : ''} registrado${all.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <Button variant="filled" icon="person_add" onClick={() => openModal('patient')}>Nuevo paciente</Button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 420, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-container-high)', borderRadius: 'var(--r-full)', padding: '0 18px', height: 48 }}>
          <Icon name="search" size={22} style={{ color: 'var(--on-surface-variant)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o CURP…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)' }} />
          {q && <Icon name="close" size={20} onClick={() => setQ('')} style={{ cursor: 'pointer', color: 'var(--on-surface-variant)' }} />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip label="Todos" selected />
        </div>
        <div style={{ flex: 1 }} />
        <Segmented value={view} onChange={(v) => setView(v as 'table' | 'grid')} options={[{ value: 'table', icon: 'table_rows' }, { value: 'grid', icon: 'grid_view' }]} />
      </div>

      {loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState icon="group" text={q ? 'Sin resultados para la búsqueda' : 'Sin pacientes registrados aún'} />
      ) : view === 'table' ? (
        <Card variant="elevated" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 1.6fr 1.6fr 48px', padding: '14px 20px', borderBottom: '1px solid var(--outline-variant)', fontSize: 12, fontWeight: 700, color: 'var(--on-surface-variant)', letterSpacing: '.4px' }}>
            <div>PACIENTE</div><div>EDAD / SEXO</div><div>CONTACTO</div><div>DIAGNÓSTICOS</div><div />
          </div>
          {list.map((p) => (
            <div key={p.id} className="state-layer patients-row" onClick={() => go('patient', { id: p.id })} style={{
              display: 'grid', gridTemplateColumns: '2.4fr 1fr 1.6fr 1.6fr 48px', alignItems: 'center', padding: '12px 20px',
              borderBottom: '1px solid var(--outline-variant)', cursor: 'pointer', position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <Avatar initials={p.initials} color={p.color} size={42} />
                <div style={{ minWidth: 0 }}>
                  <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>{p.email ?? '—'}</div>
                </div>
              </div>
              <div className="body-m">{p.age != null ? `${p.age} a` : '—'} · {p.sex ?? '—'}</div>
              <div className="body-m" style={{ color: 'var(--on-surface-variant)' }}>{p.telefono ?? '—'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {p.conditions.slice(0, 2).map((c) => (
                  <span key={c} style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>{c}</span>
                ))}
              </div>
              <IconButton name="chevron_right" size={36} iconSize={22} />
            </div>
          ))}
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {list.map((p) => (
            <Card key={p.id} variant="elevated" onClick={() => go('patient', { id: p.id })} hover style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar initials={p.initials} color={p.color} size={52} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="title-m" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
                    {p.age != null ? `${p.age} años` : '—'} · {p.sex ?? '—'}
                  </div>
                </div>
              </div>
              <Divider style={{ margin: '16px 0' }} />
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{p.telefono ?? p.email ?? '—'}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Expediente del paciente ───────────────────────────────────────────────────
export function PatientRecord({ id, go, openModal, dataVersion = 0 }: { id: string; go: (n: string, p?: any) => void; openModal: (t: string, p?: any) => void; dataVersion?: number }) {
  const account   = useAccount();
  const clinicaId = account.clinicaId ?? '';

  const [tab,       setTab]       = useState('resumen');
  const [loading,   setLoading]   = useState(true);
  const [pac,       setPac]       = useState<PacienteDetalleUI | null>(null);
  const [pacVersion, setPacVersion] = useState(0);

  // Edit modal
  const [editOpen,   setEditOpen]   = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState({
    nombre: '', apellido_paterno: '', apellido_materno: '',
    fecha_nacimiento: '', sexo: '' as SexoEnum | '',
    grupo_sanguineo: '' as GrupoSanguineo | '',
    telefono: '', email: '', curp: '',
  });

  // Consultas / recetas / informes (se cargan vía RPC al abrir su pestaña)
  const [consultasFull, setConsultasFull] = useState<ConsultaDetalleUI[] | null>(null);
  const [recetas,  setRecetas]  = useState<RecetaUI[] | null>(null);
  const [informes,  setInformes]  = useState<InformeUI[]   | null>(null);
  const [estudios,  setEstudios]  = useState<EstudioUI[]   | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [openConsulta, setOpenConsulta] = useState<string | null>(null); // acordeón Historial: id de la consulta abierta
  const [openReceta,   setOpenReceta]   = useState<string | null>(null); // acordeón Recetas: id de la receta abierta
  const [openInforme,  setOpenInforme]  = useState<string | null>(null); // acordeón Informes: id del informe abierto

  // Visor de archivos de laboratorio
  const [archivoModal, setArchivoModal] = useState<{ url: string; nombre: string; tipo: 'pdf' | 'image' } | null>(null);
  const [zoomLevel,    setZoomLevel]    = useState(1);

  // PDF de receta (regenerar desde el historial)
  const [pdfData,     setPdfData]     = useState<RecetaPdfData | null>(null);
  const [pdfOpen,     setPdfOpen]     = useState(false);
  const [pdfBuilding, setPdfBuilding] = useState<string | null>(null); // id de la receta cargando

  const verRecetaPdf = async (r: RecetaUI) => {
    if (!pac || !clinicaId) return;
    setPdfBuilding(r.id);
    try {
      const data = await construirRecetaPdfDesdeReceta(r, {
        clinicaId,
        userId: account.userId,
        medicoNombre: account.nombreCompleto,
        pacienteId: pac.id,
        pacienteNombre: pac.name,
      });
      setPdfData(data);
      setPdfOpen(true);
    } catch (e) {
      console.error('No se pudo preparar el PDF de la receta:', e);
    } finally {
      setPdfBuilding(null);
    }
  };

  useEffect(() => {
    if (!id || !clinicaId) { setLoading(false); return; }
    setLoading(true);
    fetchPacienteDetalle(id, clinicaId)
      .then(setPac)
      .catch((e) => console.error('PatientRecord load error:', e))
      .finally(() => setLoading(false));
  }, [id, clinicaId, dataVersion, pacVersion]);

  // Carga perezosa de recetas/informes según la pestaña activa.
  const expedienteId = pac?.expedienteId ?? null;
  useEffect(() => {
    if (!expedienteId) return;
    if (tab === 'timeline' && consultasFull === null) {
      setLoadingDoc(true);
      obtenerConsultas(expedienteId).then(setConsultasFull).catch((e) => { console.error(e); setConsultasFull([]); }).finally(() => setLoadingDoc(false));
    }
    if (tab === 'recetas' && recetas === null) {
      setLoadingDoc(true);
      obtenerRecetas(expedienteId).then(setRecetas).catch((e) => { console.error(e); setRecetas([]); }).finally(() => setLoadingDoc(false));
    }
    if (tab === 'informes' && informes === null) {
      setLoadingDoc(true);
      obtenerInformes(expedienteId).then(setInformes).catch((e) => { console.error(e); setInformes([]); }).finally(() => setLoadingDoc(false));
    }
    if (tab === 'labs' && estudios === null) {
      setLoadingDoc(true);
      obtenerEstudios(expedienteId).then(setEstudios).catch((e) => { console.error(e); setEstudios([]); }).finally(() => setLoadingDoc(false));
    }
  }, [tab, expedienteId]);

  // Al crear una consulta/receta/informe (dataVersion cambia) invalida lo cargado.
  useEffect(() => { setConsultasFull(null); setRecetas(null); setInformes(null); setEstudios(null); setOpenConsulta(null); setOpenReceta(null); setOpenInforme(null); }, [dataVersion]);

  const tabs = [
    ['resumen',  'Expediente', 'summarize'],
    ['timeline', 'Consultas', 'history'],
    ['recetas',  'Recetas',   'prescriptions'],
    ['informes', 'Informes',  'description'],
    ['labs',     'Laboratorio','labs'],
  ];

  if (loading) return <div className="page-pad"><Spinner /></div>;
  if (!pac) return (
    <div className="page-pad">
      <EmptyState icon="person_off" text="Paciente no encontrado" />
      <div style={{ textAlign: 'center' }}>
        <Button variant="outlined" icon="arrow_back" onClick={() => go('patients')}>Volver</Button>
      </div>
    </div>
  );

  const v = pac.ultimos_vitales;

  return (
    <div className="page-pad fade-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, color: 'var(--on-surface-variant)', fontSize: 13.5 }}>
        <span style={{ cursor: 'pointer' }} onClick={() => go('patients')}>Pacientes</span>
        <Icon name="chevron_right" size={16} />
        <span style={{ color: 'var(--on-surface)', fontWeight: 600 }}>{pac.name}</span>
      </div>

      {/* Header del paciente */}
      <Card variant="elevated" style={{ padding: 24, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Avatar initials={pac.initials} color={pac.color} size={76} fontSize={28} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 className="headline-m" style={{ letterSpacing: '-.5px' }}>{pac.name}</h1>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10, color: 'var(--on-surface-variant)', fontSize: 14 }}>
              {pac.age != null && <span><Icon name="cake" size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />{pac.age} años · {pac.sex ?? '—'}</span>}
              {pac.telefono && <span><Icon name="call" size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />{pac.telefono}</span>}
              {pac.curp && <span><Icon name="badge" size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />{pac.curp}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="outlined" icon="edit" onClick={() => {
              setEditForm({
                nombre:            pac.nombre_raw,
                apellido_paterno:  pac.apellido_paterno_raw ?? '',
                apellido_materno:  pac.apellido_materno_raw ?? '',
                fecha_nacimiento:  pac.fecha_nacimiento ?? '',
                sexo:              (pac.sex ?? '') as SexoEnum | '',
                grupo_sanguineo:   (pac.grupo_sanguineo ?? '') as GrupoSanguineo | '',
                telefono:          pac.telefono ?? '',
                email:             pac.email ?? '',
                curp:              pac.curp ?? '',
              });
              setEditError(null);
              setEditOpen(true);
            }}>Editar</Button>
            <Button variant="outlined" icon="event"         onClick={() => openModal('appointment',  { patientId: pac.id })}>Agendar</Button>
            <Button variant="outlined" icon="prescriptions" onClick={() => go('receta', { patientId: pac.id })}>Receta</Button>
            <Button variant="outlined" icon="description"   onClick={() => go('informe',     { patientId: pac.id })}>Informe</Button>
            <Button variant="outlined" icon="labs"          onClick={() => go('laboratorio', { patientId: pac.id })}>Laboratorio</Button>
            <Button variant="filled"   icon="stethoscope"   onClick={() => go('consulta',    { patientId: pac.id })}>Nueva consulta</Button>
          </div>
        </div>
        {pac.alergias.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, padding: '10px 16px', background: 'var(--error-container)', color: 'var(--on-error-container)', borderRadius: 'var(--r-sm)' }}>
            <Icon name="warning" size={20} fill />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Alergias:</span>
            <span style={{ fontSize: 14 }}>{pac.alergias.join(', ')}</span>
          </div>
        )}
      </Card>

      {/* Etiqueta de sección: la barra de pestañas es el historial del paciente.
          (Los botones de arriba abren páginas de acción; aquí se consultan los registros.) */}
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--on-surface-variant)', marginBottom: 8 }}>
        Historial
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--outline-variant)', marginBottom: 20, overflowX: 'auto' }}>
        {tabs.map(([k, l, ic]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', border: 'none', background: 'transparent', cursor: 'pointer',
            color: tab === k ? 'var(--primary)' : 'var(--on-surface-variant)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
            borderBottom: `3px solid ${tab === k ? 'var(--primary)' : 'transparent'}`, marginBottom: -1, whiteSpace: 'nowrap',
          }}>
            <Icon name={ic} size={18} fill={tab === k} />{l}
          </button>
        ))}
      </div>

      {/* Resumen */}
      {tab === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 18 }} className="dash-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            <Card variant="elevated" style={{ padding: 20 }}>
              <h3 className="title-l" style={{ marginBottom: 16 }}>Signos vitales</h3>
              {v ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 14 }}>
                  {[
                    { label: 'Frec. cardiaca', value: v.fc,      unit: 'lpm',  icon: 'cardiology'     },
                    { label: 'Presión arterial',value: v.ta,      unit: 'mmHg', icon: 'blood_pressure'  },
                    { label: 'Temperatura',     value: v.temp_c,  unit: '°C',   icon: 'thermostat'      },
                    { label: 'Peso',            value: v.peso_kg, unit: 'kg',   icon: 'monitor_weight'  },
                    { label: 'Estatura',        value: v.talla_cm,unit: 'cm',   icon: 'height'          },
                    { label: 'IMC',             value: v.imc,     unit: 'kg/m²',icon: 'calculate'       },
                  ].map((vit) => (
                    <div key={vit.label} style={{ padding: 14, borderRadius: 'var(--r-md)', background: 'var(--surface-container-high)' }}>
                      <Icon name={vit.icon} size={22} fill style={{ color: 'var(--primary)' }} />
                      <div className="headline-s" style={{ marginTop: 8, fontSize: 22 }}>
                        {vit.value ?? '—'}{' '}
                        {vit.value != null && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--on-surface-variant)' }}>{vit.unit}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{vit.label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon="monitor_heart" text="Sin consultas con vitales registrados" />
              )}
            </Card>

            {pac.diagnosticos.length > 0 && (
              <Card variant="elevated" style={{ padding: 20 }}>
                <SectionHeader title="Diagnósticos activos" icon="health_and_safety" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pac.diagnosticos.map((d) => (
                    <div key={d.codigo} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--outline-variant)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--tertiary-container)', color: 'var(--on-tertiary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="diagnosis" size={20} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <span className="title-s">{d.descripcion}</span>
                        <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginLeft: 8 }}>{d.codigo}</span>
                      </div>
                      {d.es_principal && <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--primary-container)', color: 'var(--on-primary-container)' }}>Principal</span>}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            <Card variant="elevated" style={{ padding: 20 }}>
              <h3 className="title-l" style={{ marginBottom: 16 }}>Datos del paciente</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <InfoStat label="Grupo sanguíneo" value={pac.grupo_sanguineo === 'desconocido' ? 'Desconocido' : pac.grupo_sanguineo ?? undefined} />
                <InfoStat label="IMC" value={v?.imc} sub="kg/m²" />
                <InfoStat label="Peso" value={v?.peso_kg} sub="kg" />
                <InfoStat label="Estatura" value={v?.talla_cm} sub="cm" />
              </div>
              <Divider style={{ margin: '18px 0' }} />
              <InfoStat label="Última consulta" value={v ? new Date(v.fecha).toLocaleDateString('es-MX') : undefined} />
              <div style={{ marginTop: 14 }}><InfoStat label="Aseguradora" value="—" /></div>
            </Card>
            <Card variant="filled" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Icon name="smart_toy" size={22} style={{ color: 'var(--primary)' }} />
                <h3 className="title-m">Resumen IA</h3>
              </div>
              <p className="body-m" style={{ color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
                Funcionalidad disponible próximamente.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Historial de consultas — RPC obtener_consultas (narrativa descifrada) */}
      {tab === 'timeline' && (
        <Card variant="elevated" style={{ padding: 24, maxWidth: 900, margin: '0 auto', width: '100%' }}>
          {loadingDoc && consultasFull === null ? <Spinner /> : (consultasFull?.length ?? 0) === 0 ? (
            <EmptyState icon="history" text="Sin consultas registradas" />
          ) : (
            <div style={{ position: 'relative', paddingLeft: 8 }}>
              {consultasFull!.map((c, i) => {
                const vit = [
                  c.peso_kg != null ? `${c.peso_kg} kg` : null,
                  c.talla_cm != null ? `${c.talla_cm} cm` : null,
                  (c.ta_sistolica != null && c.ta_diastolica != null) ? `PA ${c.ta_sistolica}/${c.ta_diastolica}` : null,
                  c.fc != null ? `${c.fc} lpm` : null,
                  c.fr != null ? `FR ${c.fr} rpm` : null,
                  c.temp_c != null ? `${c.temp_c} °C` : null,
                  c.spo2 != null ? `SpO₂ ${c.spo2}%` : null,
                  c.glucosa != null ? `Glucosa ${c.glucosa} mg/dL` : null,
                  c.perimetro_abdominal_cm != null ? `Abd. ${c.perimetro_abdominal_cm} cm` : null,
                  c.grasa_corporal_pct != null ? `GC ${c.grasa_corporal_pct}%` : null,
                ].filter(Boolean).join(' · ');
                const isOpen = openConsulta === c.id;
                return (
                  <div key={c.id} style={{ display: 'flex', gap: 18, paddingBottom: i === consultasFull!.length - 1 ? 0 : 24, position: 'relative' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary-container)', color: 'var(--on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                        <Icon name="stethoscope" size={20} fill />
                      </div>
                      {i !== consultasFull!.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--outline-variant)', marginTop: 4 }} />}
                    </div>
                    <div style={{ paddingTop: 2, flex: 1, minWidth: 0 }}>
                      {/* Cabecera del acordeón: clic para desplegar/colapsar */}
                      <button
                        onClick={() => setOpenConsulta(isOpen ? null : c.id)}
                        aria-expanded={isOpen}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 12px',
                          background: isOpen ? 'var(--surface-container-high)' : 'transparent', border: '1px solid var(--outline-variant)',
                          borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--on-surface)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="title-s">{c.motivo || 'Consulta médica'}</div>
                          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                            {new Date(c.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        </div>
                        <Icon name="expand_more" size={22}
                          style={{ color: 'var(--on-surface-variant)', flexShrink: 0, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                      </button>
                      {/* Cuerpo: solo cuando está desplegada */}
                      {isOpen && (
                        <div style={{ marginTop: 10, paddingLeft: 2 }}>
                          {vit && <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{vit}</div>}
                          {c.notas && (
                            <div className="nota-clinica-render"
                              style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-container-high)', borderRadius: 'var(--r-sm)', fontSize: 13.5, color: 'var(--on-surface)', lineHeight: 1.55 }}
                              dangerouslySetInnerHTML={{ __html: c.notas }}
                            />
                          )}
                          {!vit && !c.notas && (
                            <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Sin detalles adicionales registrados.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Recetas — RPC obtener_recetas */}
      {tab === 'recetas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="filled" icon="add" onClick={() => go('receta', { patientId: pac.id })}>Nueva receta</Button>
          </div>
          {loadingDoc && recetas === null ? <Spinner /> : (recetas?.length ?? 0) === 0 ? (
            <Card variant="elevated" style={{ padding: 24 }}><EmptyState icon="prescriptions" text="Sin recetas registradas" /></Card>
          ) : recetas!.map((r) => {
            const isOpen = openReceta === r.id;
            return (
              <Card key={r.id} variant="outlined" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Cabecera acordeón (toggle + acción PDF al lado del colapsable) */}
                <div style={{
                  display: 'flex', alignItems: 'center',
                  background: isOpen ? 'var(--surface-container)' : 'var(--surface-container-low)',
                  borderBottom: isOpen ? '1px solid var(--outline-variant)' : 'none',
                }}>
                  <button
                    onClick={() => setOpenReceta(isOpen ? null : r.id)}
                    aria-expanded={isOpen}
                    style={{
                      flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 8px 14px 20px', background: 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--on-surface)',
                    }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary-container)', color: 'var(--on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="prescriptions" size={20} fill />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        <div className="title-s">{r.diagnostico_cie10 || 'Receta'}</div>
                        {r.folio_num && (
                          <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 999, background: 'var(--primary-container)', color: 'var(--on-primary-container)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatFolioReceta(r.folio_num, r.fecha_receta, r.created_at)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                        {(r.fecha_receta
                          ? new Date(r.fecha_receta + 'T00:00:00')
                          : new Date(r.created_at)
                        ).toLocaleDateString('es-MX', { dateStyle: 'medium' })} · {r.medicamentos.length} medicamento(s)
                      </div>
                    </div>
                  </button>
                  {/* Acción: regenerar / imprimir PDF */}
                  <button
                    onClick={() => verRecetaPdf(r)}
                    disabled={pdfBuilding === r.id}
                    title="Ver / Imprimir PDF"
                    aria-label="Ver o imprimir PDF de la receta"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      padding: '7px 12px', marginRight: 6, borderRadius: 999,
                      border: '1px solid var(--outline-variant)', background: 'var(--surface)',
                      color: 'var(--primary)', cursor: pdfBuilding === r.id ? 'default' : 'pointer',
                      fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600,
                    }}
                  >
                    <Icon name={pdfBuilding === r.id ? 'progress_activity' : 'picture_as_pdf'} size={18}
                      style={pdfBuilding === r.id ? { animation: 'spin 1s linear infinite' } : undefined} />
                    PDF
                  </button>
                  <button
                    onClick={() => setOpenReceta(isOpen ? null : r.id)}
                    aria-label={isOpen ? 'Colapsar' : 'Expandir'}
                    style={{ display: 'flex', alignItems: 'center', padding: '14px 20px 14px 6px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <Icon name="expand_more" size={22}
                      style={{ color: 'var(--on-surface-variant)', flexShrink: 0, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                  </button>
                </div>
                {/* Cuerpo: solo cuando está desplegada */}
                {isOpen && (
                  <div style={{ padding: '8px 20px 16px' }}>
                    {r.medicamentos.map((m, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 0', borderBottom: i === r.medicamentos.length - 1 ? 'none' : '1px solid var(--outline-variant)' }}>
                        <Icon name="medication" size={22} style={{ color: 'var(--secondary)', marginTop: 2, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span className="title-s">{m.medicamento}</span>
                            {m.controlado && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'var(--warning-container)', color: 'var(--on-warning-container)' }}>CONTROLADO</span>}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
                            {[m.dosis, m.frecuencia, m.duracion, m.via].filter(Boolean).join(' · ')}
                          </div>
                          {m.instrucciones && <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', marginTop: 3, fontStyle: 'italic' }}>{m.instrucciones}</div>}
                        </div>
                      </div>
                    ))}
                    {r.indicaciones && (
                      <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface-container-high)', borderRadius: 'var(--r-sm)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 700, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          <Icon name="notes" size={15} />Indicaciones generales
                        </div>
                        <div className="nota-clinica-render"
                          style={{ fontSize: 13.5, color: 'var(--on-surface)', lineHeight: 1.55 }}
                          dangerouslySetInnerHTML={{ __html: r.indicaciones }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Informes — RPC obtener_informes */}
      {tab === 'informes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="filled" icon="add" onClick={() => go('informe', { patientId: pac.id })}>Nuevo informe</Button>
          </div>
          {loadingDoc && informes === null ? <Spinner /> : (informes?.length ?? 0) === 0 ? (
            <Card variant="elevated" style={{ padding: 24 }}><EmptyState icon="description" text="Sin informes registrados" /></Card>
          ) : informes!.map((inf) => {
            const isOpen  = openInforme === inf.id;
            const tipoCfg = TIPO_INFORME_COLOR[inf.tipo] ?? { color: 'var(--primary)', bg: 'var(--primary-container)' };
            const tipoIcon = TIPO_INFORME_ICON[inf.tipo] ?? 'description';
            const fechaDisplay = inf.fecha_informe
              ? new Date(inf.fecha_informe + 'T00:00:00').toLocaleDateString('es-MX', { dateStyle: 'medium' })
              : new Date(inf.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' });
            return (
              <Card key={inf.id} variant="outlined" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Cabecera acordeón */}
                <button
                  onClick={() => setOpenInforme(isOpen ? null : inf.id)}
                  aria-expanded={isOpen}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                    padding: '14px 20px', background: isOpen ? 'var(--surface-container)' : 'var(--surface-container-low)',
                    border: 'none', borderBottom: isOpen ? '1px solid var(--outline-variant)' : 'none',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--on-surface)',
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: tipoCfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={tipoIcon} size={20} style={{ color: tipoCfg.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <div className="title-s" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inf.titulo}</div>
                      {inf.folio_num && (
                        <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 999, background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatFolio(inf.folio_num, inf.fecha_informe, inf.created_at)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>{TIPO_INFORME_LABEL[inf.tipo] ?? inf.tipo}</span>
                      <span>·</span>
                      <span>{fechaDisplay}</span>
                      {inf.visibilidad && inf.visibilidad !== 'expediente' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          · <Icon name={VISIBILIDAD_ICON[inf.visibilidad]} size={13} style={{ marginLeft: 4 }} />{VISIBILIDAD_LABEL[inf.visibilidad]}
                        </span>
                      )}
                    </div>
                  </div>
                  <Icon name="expand_more" size={22}
                    style={{ color: 'var(--on-surface-variant)', flexShrink: 0, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
                {/* Cuerpo desplegable */}
                {isOpen && (
                  <div style={{ padding: '14px 20px 18px' }}>
                    {/* Tags */}
                    {inf.tags?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {inf.tags.map((t) => (
                          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 500, background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>{t}</span>
                        ))}
                      </div>
                    )}
                    {/* Cuerpo HTML */}
                    {inf.cuerpo ? (
                      <div className="nota-clinica-render"
                        style={{ fontSize: 14, color: 'var(--on-surface)', lineHeight: 1.65, padding: '10px 14px', background: 'var(--surface-container-high)', borderRadius: 'var(--r-sm)' }}
                        dangerouslySetInnerHTML={{ __html: inf.cuerpo }}
                      />
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>Sin contenido registrado.</div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Laboratorio */}
      {tab === 'labs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="filled" icon="add" onClick={() => go('laboratorio', { patientId: pac.id })}>Nuevo estudio</Button>
          </div>
          {loadingDoc && estudios === null ? <Spinner /> : (estudios?.length ?? 0) === 0 ? (
            <Card variant="elevated" style={{ padding: 24 }}><EmptyState icon="labs" text="Sin estudios de laboratorio registrados" /></Card>
          ) : estudios!.map((est) => {
            const isOpen = openInforme === est.id;
            return (
              <Card key={est.id} variant="outlined" style={{ padding: 0, overflow: 'hidden' }}>
                <button
                  onClick={() => setOpenInforme(isOpen ? null : est.id)}
                  aria-expanded={isOpen}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 20px', background: isOpen ? 'var(--surface-container)' : 'var(--surface-container-low)', border: 'none', borderBottom: isOpen ? '1px solid var(--outline-variant)' : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--on-surface)' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--secondary-container)', color: 'var(--on-secondary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="labs" size={20} fill />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title-s">{est.tipo_estudio}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                      {new Date(est.fecha_estudio + 'T00:00:00').toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                      {est.laboratorio_externo && ` · ${est.laboratorio_externo}`}
                    </div>
                  </div>
                  <Icon name="expand_more" size={22} style={{ color: 'var(--on-surface-variant)', flexShrink: 0, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
                {isOpen && (
                  <div style={{ padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Botón ver archivo */}
                    <button
                      onClick={async () => {
                        try {
                          const url  = await urlDescarga(est.archivo_url);
                          const nombre = est.archivo_nombre ?? est.archivo_url.split('/').pop() ?? 'archivo';
                          const ext  = nombre.split('.').pop()?.toLowerCase() ?? '';
                          const tipo: 'pdf' | 'image' = ext === 'pdf' ? 'pdf' : 'image';
                          setZoomLevel(1);
                          setArchivoModal({ url, nombre, tipo });
                        } catch (e) { console.error('Error al obtener el archivo', e); }
                      }}
                      style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, border: '1px solid var(--outline-variant)', background: 'var(--surface)', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, color: 'var(--primary)', fontFamily: 'var(--font-body)' }}
                    >
                      <Icon name="visibility" size={18} />
                      {est.archivo_nombre ?? 'Ver archivo'}
                    </button>
                    {/* Notas */}
                    {est.notas && (
                      <div className="nota-clinica-render"
                        style={{ fontSize: 14, color: 'var(--on-surface)', lineHeight: 1.65, padding: '10px 14px', background: 'var(--surface-container-high)', borderRadius: 'var(--r-sm)' }}
                        dangerouslySetInnerHTML={{ __html: est.notas }}
                      />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Modal editar paciente ─────────────────────────────────────────── */}
      {editOpen && (
        <div
          onClick={() => { if (!editSaving) setEditOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--elev-5)', display: 'flex', flexDirection: 'column' }}
          >
            {/* Cabecera */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 24px 14px', borderBottom: '1px solid var(--outline-variant)', flexShrink: 0 }}>
              <Icon name="edit" size={22} style={{ color: 'var(--primary)' }} />
              <span className="title-l" style={{ flex: 1 }}>Editar paciente</span>
              <button onClick={() => setEditOpen(false)} disabled={editSaving}
                style={{ width: 36, height: 36, border: 'none', background: 'var(--surface-container)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface)' }}>
                <Icon name="close" size={20} />
              </button>
            </div>

            {/* Formulario */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Nombre */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Nombre *</label>
                <input
                  value={editForm.nombre}
                  onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Nombre"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Apellidos */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Apellido paterno</label>
                  <input
                    value={editForm.apellido_paterno}
                    onChange={(e) => setEditForm((f) => ({ ...f, apellido_paterno: e.target.value }))}
                    placeholder="Paterno"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Apellido materno</label>
                  <input
                    value={editForm.apellido_materno}
                    onChange={(e) => setEditForm((f) => ({ ...f, apellido_materno: e.target.value }))}
                    placeholder="Materno"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Fecha nacimiento + Sexo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Fecha de nacimiento</label>
                  <input
                    type="date"
                    value={editForm.fecha_nacimiento}
                    onChange={(e) => setEditForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Sexo</label>
                  <select
                    value={editForm.sexo}
                    onChange={(e) => setEditForm((f) => ({ ...f, sexo: e.target.value as SexoEnum | '' }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="">— Sin especificar —</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                  </select>
                </div>
              </div>

              {/* Grupo sanguíneo */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Grupo sanguíneo</label>
                <select
                  value={editForm.grupo_sanguineo}
                  onChange={(e) => setEditForm((f) => ({ ...f, grupo_sanguineo: e.target.value as GrupoSanguineo | '' }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value="">— Desconocido —</option>
                  {(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as GrupoSanguineo[]).map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Teléfono + Email */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Teléfono</label>
                  <input
                    value={editForm.telefono}
                    onChange={(e) => setEditForm((f) => ({ ...f, telefono: e.target.value }))}
                    placeholder="10 dígitos"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Correo electrónico</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="correo@ejemplo.com"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* CURP */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>CURP</label>
                <input
                  value={editForm.curp}
                  onChange={(e) => setEditForm((f) => ({ ...f, curp: e.target.value.toUpperCase() }))}
                  placeholder="18 caracteres"
                  maxLength={18}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', color: 'var(--on-surface)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase', letterSpacing: 1 }}
                />
              </div>

              {editError && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--error-container)', color: 'var(--on-error-container)', fontSize: 13.5 }}>
                  {editError}
                </div>
              )}
            </div>

            {/* Acciones */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px 20px', borderTop: '1px solid var(--outline-variant)', flexShrink: 0 }}>
              <Button variant="outlined" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancelar</Button>
              <Button
                variant="filled"
                disabled={editSaving || !editForm.nombre.trim()}
                onClick={async () => {
                  if (!pac) return;
                  setEditSaving(true);
                  setEditError(null);
                  try {
                    await actualizarPaciente(pac.id, {
                      nombre:           editForm.nombre,
                      apellido_paterno: editForm.apellido_paterno || null,
                      apellido_materno: editForm.apellido_materno || null,
                      fecha_nacimiento: editForm.fecha_nacimiento || null,
                      sexo:             (editForm.sexo as SexoEnum) || null,
                      grupo_sanguineo:  (editForm.grupo_sanguineo as GrupoSanguineo) || null,
                      telefono:         editForm.telefono || null,
                      email:            editForm.email || null,
                      curp:             editForm.curp || null,
                    });
                    setEditOpen(false);
                    setPacVersion((v) => v + 1);
                  } catch (e: any) {
                    setEditError(e?.message ?? 'Error al guardar los cambios');
                  } finally {
                    setEditSaving(false);
                  }
                }}
              >{editSaving ? 'Guardando…' : 'Guardar cambios'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal visor de archivos de laboratorio ─────────────────────────── */}
      {archivoModal && (
        <div
          onClick={() => setArchivoModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 1200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--elev-5)' }}
          >
            {/* Barra superior */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', flexShrink: 0 }}>
              <Icon name={archivoModal.tipo === 'pdf' ? 'picture_as_pdf' : 'image'} size={20} style={{ color: 'var(--primary)' }} />
              <span className="title-s" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{archivoModal.nombre}</span>
              {archivoModal.tipo === 'image' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => setZoomLevel((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
                    style={{ width: 32, height: 32, border: '1px solid var(--outline-variant)', borderRadius: 8, background: 'var(--surface-container)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="remove" size={18} />
                  </button>
                  <span style={{ minWidth: 46, textAlign: 'center', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoomLevel * 100)}%</span>
                  <button onClick={() => setZoomLevel((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                    style={{ width: 32, height: 32, border: '1px solid var(--outline-variant)', borderRadius: 8, background: 'var(--surface-container)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="add" size={18} />
                  </button>
                  <button onClick={() => setZoomLevel(1)}
                    style={{ marginLeft: 4, height: 32, padding: '0 10px', border: '1px solid var(--outline-variant)', borderRadius: 8, background: 'var(--surface-container)', cursor: 'pointer', fontSize: 12, color: 'var(--on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                    Reset
                  </button>
                </div>
              )}
              <a href={archivoModal.url} download={archivoModal.nombre} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--on-surface-variant)', textDecoration: 'none' }}>
                <Icon name="download" size={18} />
              </a>
              <button onClick={() => setArchivoModal(null)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, border: 'none', background: 'var(--surface-container)', cursor: 'pointer', color: 'var(--on-surface)' }}>
                <Icon name="close" size={20} />
              </button>
            </div>

            {/* Contenido */}
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', alignItems: archivoModal.tipo === 'image' ? 'flex-start' : 'stretch', justifyContent: 'center', background: archivoModal.tipo === 'pdf' ? 'var(--surface-container-low)' : '#1a1a1a' }}>
              {archivoModal.tipo === 'pdf' ? (
                <iframe
                  src={archivoModal.url}
                  title={archivoModal.nombre}
                  style={{ width: '100%', height: '75vh', border: 'none' }}
                />
              ) : (
                <div
                  style={{ padding: 16, overflow: 'auto', width: '100%', height: '75vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', cursor: zoomLevel > 1 ? 'grab' : 'zoom-in' }}
                  onWheel={(e) => {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 0.1 : -0.1;
                    setZoomLevel((z) => Math.min(4, Math.max(0.25, +(z + delta).toFixed(2))));
                  }}
                >
                  <img
                    src={archivoModal.url}
                    alt={archivoModal.nombre}
                    style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', maxWidth: '100%', display: 'block', transition: 'transform .15s', userSelect: 'none' }}
                    draggable={false}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <PdfRecetaModal open={pdfOpen} data={pdfData} onClose={() => setPdfOpen(false)} />
    </div>
  );
}

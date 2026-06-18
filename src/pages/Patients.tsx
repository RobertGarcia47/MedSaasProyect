import { useState, useEffect } from 'react';
import { useAccount } from '../context/AccountContext';
import { fetchPacientes, fetchPacienteDetalle, type PacienteUI, type PacienteDetalleUI } from '../lib/patients';
import { obtenerRecetas, type RecetaUI } from '../lib/recetas';
import { obtenerInformes, TIPO_INFORME_LABEL, type InformeUI } from '../lib/informes';
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

  const [tab,     setTab]     = useState('resumen');
  const [loading, setLoading] = useState(true);
  const [pac,     setPac]     = useState<PacienteDetalleUI | null>(null);

  // Consultas / recetas / informes (se cargan vía RPC al abrir su pestaña)
  const [consultasFull, setConsultasFull] = useState<ConsultaDetalleUI[] | null>(null);
  const [recetas,  setRecetas]  = useState<RecetaUI[] | null>(null);
  const [informes, setInformes] = useState<InformeUI[] | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [openConsulta, setOpenConsulta] = useState<string | null>(null); // acordeón Historial: id de la consulta abierta

  useEffect(() => {
    if (!id || !clinicaId) { setLoading(false); return; }
    fetchPacienteDetalle(id, clinicaId)
      .then(setPac)
      .catch((e) => console.error('PatientRecord load error:', e))
      .finally(() => setLoading(false));
  }, [id, clinicaId, dataVersion]);

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
  }, [tab, expedienteId]);

  // Al crear una consulta/receta/informe (dataVersion cambia) invalida lo cargado.
  useEffect(() => { setConsultasFull(null); setRecetas(null); setInformes(null); setOpenConsulta(null); }, [dataVersion]);

  const tabs = [
    ['resumen',  'Resumen',   'summarize'],
    ['timeline', 'Historial', 'history'],
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
            <Button variant="outlined" icon="event"         onClick={() => openModal('appointment',  { patientId: pac.id })}>Agendar</Button>
            <Button variant="outlined" icon="prescriptions" onClick={() => go('receta', { patientId: pac.id })}>Receta</Button>
            <Button variant="outlined" icon="description"   onClick={() => openModal('report',       { patientId: pac.id })}>Informe</Button>
            <Button variant="filled"   icon="stethoscope"   onClick={() => go('consulta', { patientId: pac.id })}>Nueva consulta</Button>
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
        <Card variant="elevated" style={{ padding: 24 }}>
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
                  c.temp_c != null ? `${c.temp_c} °C` : null,
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="filled" icon="add" onClick={() => go('receta', { patientId: pac.id })}>Nueva receta</Button>
          </div>
          {loadingDoc && recetas === null ? <Spinner /> : (recetas?.length ?? 0) === 0 ? (
            <Card variant="elevated" style={{ padding: 24 }}><EmptyState icon="prescriptions" text="Sin recetas registradas" /></Card>
          ) : recetas!.map((r) => (
            <Card key={r.id} variant="outlined" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: 'var(--surface-container-low)', borderBottom: '1px solid var(--outline-variant)' }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--primary-container)', color: 'var(--on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="prescriptions" size={22} fill />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title-m">{r.diagnostico_cie10 || 'Receta'}</div>
                  <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
                    {new Date(r.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })} · {r.medicamentos.length} medicamento(s)
                  </div>
                </div>
              </div>
              <div style={{ padding: '8px 20px' }}>
                {r.medicamentos.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 0', borderBottom: i === r.medicamentos.length - 1 ? 'none' : '1px solid var(--outline-variant)' }}>
                    <Icon name="medication" size={22} style={{ color: 'var(--secondary)', marginTop: 2 }} />
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
                  <div style={{ padding: '12px 0 4px', fontSize: 13.5, color: 'var(--on-surface-variant)' }}>
                    <Icon name="notes" size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />{r.indicaciones}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Informes — RPC obtener_informes */}
      {tab === 'informes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="filled" icon="add" onClick={() => openModal('report', { patientId: pac.id })}>Nuevo informe</Button>
          </div>
          {loadingDoc && informes === null ? <Spinner /> : (informes?.length ?? 0) === 0 ? (
            <Card variant="elevated" style={{ padding: 24 }}><EmptyState icon="description" text="Sin informes registrados" /></Card>
          ) : informes!.map((inf) => (
            <Card key={inf.id} variant="outlined" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--tertiary-container)', color: 'var(--on-tertiary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="description" size={22} fill />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className="title-m">{inf.titulo}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>{TIPO_INFORME_LABEL[inf.tipo] ?? inf.tipo}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                    {new Date(inf.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                  </div>
                  {inf.cuerpo && <p className="body-m" style={{ color: 'var(--on-surface-variant)', marginTop: 10, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{inf.cuerpo}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Labs — sin tabla aún */}
      {tab === 'labs' && (
        <Card variant="elevated" style={{ padding: 24 }}>
          <EmptyState icon="labs" text="Resultados de laboratorio disponibles próximamente" />
        </Card>
      )}
    </div>
  );
}

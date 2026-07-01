import { useState, useEffect, useRef } from 'react';
import { useAccount } from '../context/AccountContext';
import { fetchPacientesSelect, getOrCreateExpediente, type PacienteSelect } from '../lib/patients';
import { crearInforme, type TipoInforme, type VisibilidadInforme } from '../lib/informes';
import { construirInformePdf, type InformePdfData } from '../lib/pdf';
import { PdfInformeModal } from '../components/PdfInformeModal';
import { Icon, Button, Card } from '../components';

// ── Helpers ──────────────────────────────────────────────────────────────────

function RailCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <Card variant="outlined" style={{ padding: 18, borderRadius: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Icon name={icon} size={19} style={{ color: 'var(--primary)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--on-surface-variant)' }}>{title}</span>
      </div>
      {children}
    </Card>
  );
}

// ── Catálogo de tipos de informe ─────────────────────────────────────────────

interface TipoInfo {
  id: TipoInforme;
  label: string;
  desc: string;
  icon: string;
  color: string;
  bg: string;
}

const TIPOS: TipoInfo[] = [
  { id: 'nota_evolucion',  label: 'Nota de evolución',  desc: 'Seguimiento clínico del paciente',        icon: 'monitoring',       color: '#0E8C86', bg: '#D6F0EC' },
  { id: 'nota_consulta',   label: 'Nota de consulta',   desc: 'Valoración en la consulta actual',        icon: 'stethoscope',      color: '#1A6CCB', bg: '#E4EEFB' },
  { id: 'nota_obstetrica', label: 'Nota obstétrica',    desc: 'Seguimiento obstétrico/perinatal',        icon: 'child_care',       color: '#7C3AED', bg: '#EDE6FB' },
  { id: 'interconsulta',   label: 'Interconsulta',      desc: 'Solicitud a otra especialidad',           icon: 'forum',            color: '#0E8C86', bg: '#D6F0EC' },
  { id: 'otro',            label: 'Resumen / Otro',     desc: 'Síntesis integral u otro tipo de nota',  icon: 'summarize',        color: '#C2410C', bg: '#FBE6D8' },
];

// ── Plantillas de contenido ───────────────────────────────────────────────────

const PLANTILLAS = [
  {
    id: 'soap', label: 'Estructura SOAP', icon: 'article',
    html: `<h3>S — Subjetivo</h3><p>Motivo de consulta y síntomas referidos por el paciente.</p><h3>O — Objetivo</h3><p>Hallazgos de la exploración física y signos vitales.</p><h3>A — Análisis / Diagnóstico</h3><p>Impresión diagnóstica y diagnóstico diferencial.</p><h3>P — Plan</h3><ul><li>Tratamiento indicado.</li><li>Estudios solicitados.</li><li>Seguimiento programado.</li></ul>`,
  },
  {
    id: 'evolucion', label: 'Nota de evolución', icon: 'monitoring',
    html: `<p><strong>Evolución:</strong> El paciente refiere...</p><p><strong>Exploración física:</strong> A la exploración se encuentra...</p><p><strong>Plan:</strong> Se continúa manejo con...</p>`,
  },
  {
    id: 'resumen', label: 'Resumen clínico', icon: 'summarize',
    html: `<p><strong>Motivo de atención:</strong></p><p><strong>Diagnósticos:</strong></p><p><strong>Tratamiento recibido:</strong></p><p><strong>Estado actual y recomendaciones:</strong></p>`,
  },
];

// ── Chips de etiquetas (decorativos por ahora, sin columna en DB) ─────────────

const TAGS = [
  { id: 'control',      label: 'Control',      icon: 'event_repeat' },
  { id: 'urgente',      label: 'Urgente',       icon: 'priority_high' },
  { id: 'cronico',      label: 'Crónico',       icon: 'autorenew' },
  { id: 'seguimiento',  label: 'Seguimiento',   icon: 'schedule' },
  { id: 'laboratorio',  label: 'Laboratorio',   icon: 'science' },
  { id: 'imagenologia', label: 'Imagenología',  icon: 'radiology' },
];

// ── Componente principal ──────────────────────────────────────────────────────

export function Informe({ go, goBack, toast, patientId }: {
  go: (n: string, p?: any) => void; goBack?: () => void; toast?: (m: string) => void; patientId?: string;
}) {
  const account  = useAccount();
  const editorRef = useRef<HTMLDivElement>(null);

  const [pacientes,   setPacientes]   = useState<PacienteSelect[]>([]);
  const [pid,         setPid]         = useState(patientId || '');
  const [patientOpen, setPatOpen]     = useState(false);
  const [tipoId,      setTipoId]      = useState<TipoInforme>('nota_evolucion');
  const [tipoOpen,    setTipoOpen]    = useState(false);
  const [titulo,      setTitulo]      = useState('');
  const [tituloError, setTituloError] = useState(false);
  const [fecha,       setFecha]       = useState(new Date().toISOString().slice(0, 10));
  const [visibilidad, setVisibilidad] = useState<VisibilidadInforme>('expediente');
  const [tags,        setTags]        = useState<string[]>([]);
  const [wordCount,   setWordCount]   = useState(0);
  const [charCount,   setCharCount]   = useState(0);
  const [plantillaOpen, setPlantOpen] = useState(false);
  const [dirty,       setDirty]       = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [pdfData,     setPdfData]     = useState<InformePdfData | null>(null);
  const [pdfOpen,     setPdfOpen]     = useState(false);

  const puede = account.puedeEmitirClinico && !!account.clinicaId;

  useEffect(() => {
    if (!account.clinicaId) return;
    fetchPacientesSelect(account.clinicaId).then(setPacientes).catch(console.error);
  }, [account.clinicaId]);

  useEffect(() => {
    if (!pid && pacientes.length) setPid(patientId || pacientes[0].id);
  }, [pacientes]);

  const paciente = pacientes.find((p) => p.id === pid) ?? null;
  const tipoInfo = TIPOS.find((t) => t.id === tipoId) ?? TIPOS[0];

  const toggleTag = (id: string) =>
    setTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const updateWordCount = () => {
    const txt = editorRef.current?.innerText.trim() ?? '';
    setWordCount(txt ? txt.split(/\s+/).length : 0);
    setCharCount(txt.length);
    setDirty(true);
  };

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    editorRef.current?.focus();
    setDirty(true);
  };

  const insertPlantilla = (html: string) => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, html);
    setPlantOpen(false);
    updateWordCount();
  };

  const cancelar = () => go(pid ? 'patient' : 'patients', pid ? { id: pid } : undefined);

  const guardar = async () => {
    if (!titulo.trim()) { setTituloError(true); toast?.('El título del informe es obligatorio'); return; }
    if (!pid)           { toast?.('Selecciona un paciente'); return; }
    const cuerpo = (editorRef.current?.innerHTML || '').trim();
    setSaving(true);
    try {
      const expId = await getOrCreateExpediente(pid, account.clinicaId!);
      const informeId = await crearInforme(expId, {
        tipo:           tipoId,
        titulo:         titulo.trim(),
        cuerpo:         cuerpo && cuerpo !== '<br>' ? cuerpo : null,
        visibilidad,
        tags,
        fecha_informe:  fecha || null,
      });
      toast?.('Informe guardado correctamente');

      // Arma el PDF (datos ya descifrados) y abre el modal de vista previa.
      try {
        const data = await construirInformePdf({
          clinicaId: account.clinicaId!,
          userId: account.userId,
          medicoNombre: account.nombreCompleto,
          pacienteId: pid,
          pacienteNombre: paciente?.name ?? 'Paciente',
          expedienteId: expId,
          informeId,
        });
        setPdfData(data);
        setPdfOpen(true);
      } catch (e: any) {
        // Si falla el armado del PDF, el informe ya quedó guardado: solo avisa.
        toast?.('Informe guardado. El PDF no se pudo preparar: ' + (e?.message ?? e));
        go('patient', { id: pid });
      }
    } catch (e: any) {
      toast?.('Error al guardar: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  const cerrarPdf = () => { setPdfOpen(false); go('patient', { id: pid }); };

  if (!puede) {
    return (
      <div className="page-pad" style={{ maxWidth: 640, margin: '40px auto', textAlign: 'center' }}>
        <Card variant="elevated" style={{ padding: '48px 28px' }}>
          <Icon name="badge" size={48} style={{ color: 'var(--primary)', opacity: .6 }} />
          <h2 className="title-l" style={{ marginTop: 14 }}>Registra tu cédula profesional</h2>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '8px auto 18px', maxWidth: 420 }}>
            Para emitir informes necesitas estar dado de alta como médico. Captura tu cédula en tu perfil.
          </p>
          <Button variant="filled" icon="account_circle" onClick={() => go('profile')}>Ir a mi perfil</Button>
        </Card>
      </div>
    );
  }

  const fechaLarga = (() => {
    const s = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  // El folio real se asigna en la DB al guardar; aquí solo mostramos un indicador visual.
  const folioDisplay = 'Se asignará al guardar';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* ── Header sticky ─────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--surface)', borderBottom: '1px solid var(--outline-variant)', padding: '10px 28px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {goBack && (
          <button onClick={goBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--on-surface-variant)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <Icon name="arrow_back" size={18} />Regresar
          </button>
        )}
        <button onClick={() => pid && go('patient', { id: pid })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--on-surface)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <Icon name="folder_shared" size={18} />{paciente ? paciente.name : 'Expediente'}
        </button>
        <div style={{ width: 1, height: 32, background: 'var(--outline-variant)', flexShrink: 0 }} />
        <div style={{ width: 40, height: 40, borderRadius: 12, background: '#D6F0EC', color: '#0B5C57', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="clinical_notes" size={22} fill />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="title-l" style={{ fontWeight: 700, letterSpacing: '-.2px', fontSize: 17 }}>Nuevo informe médico</div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            <span onClick={() => go('patients')} style={{ cursor: 'pointer' }}>Pacientes</span>
            {paciente && <>{' › '}<span>{paciente.name}</span></>}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, background: '#EAF6F3', color: '#0B5C57', whiteSpace: 'nowrap' }}>
          <Icon name="lock" size={16} />Cifrado
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, background: dirty ? 'var(--surface-container-highest)' : 'var(--surface-container)', color: 'var(--on-surface-variant)' }}>
          <Icon name={dirty ? 'edit_document' : 'check_circle'} size={16} />{dirty ? 'Borrador' : 'Sin cambios'}
        </span>
        <Button variant="filled" icon="check_circle" onClick={guardar} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar informe'}
        </Button>
      </div>

      {/* ── Cuerpo 2 columnas ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 1680, width: '100%', margin: '0 auto', padding: '24px 28px 40px' }} className="consulta-body">

        {/* ── Rail izquierdo ──────────────────────────────────────────────── */}
        <div style={{ width: 408, flex: 'none', position: 'sticky', top: 96, display: 'flex', flexDirection: 'column', gap: 18 }} className="consulta-rail">

          {/* 1. Paciente */}
          <RailCard icon="person" title="Paciente">
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setPatOpen(!patientOpen)}
                style={{ width: '100%', textAlign: 'left', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '12px 44px 12px 14px', background: 'var(--surface)', cursor: 'pointer', position: 'relative' }}
              >
                <div className="title-s" style={{ fontSize: 16 }}>{paciente?.name ?? 'Selecciona un paciente'}</div>
                {paciente && (
                  <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
                    Exp. {paciente.expediente_id?.slice(0, 8) ?? '—'}
                  </div>
                )}
                <Icon name="arrow_drop_down" size={22} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-variant)' }} />
              </button>
              {patientOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-container-high)', borderRadius: 12, boxShadow: 'var(--elev-3)', zIndex: 30, maxHeight: 280, overflowY: 'auto', padding: 6 }}>
                  {pacientes.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--on-surface-variant)' }}>Sin pacientes registrados.</div>}
                  {pacientes.map((p) => (
                    <button key={p.id} onClick={() => { setPid(p.id); setPatOpen(false); }} className="state-layer"
                      style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '10px 12px', borderRadius: 8, position: 'relative', background: p.id === pid ? 'var(--secondary-container)' : 'transparent', color: 'var(--on-surface)', fontFamily: 'var(--font-body)', fontSize: 14.5 }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {paciente && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={() => go('patient', { id: pid })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: 'var(--surface-container)', color: 'var(--on-surface)', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)', width: '100%' }}>
                  <Icon name="folder_shared" size={16} style={{ color: 'var(--primary)' }} />Ver expediente completo
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                  {([
                    { key: 'consulta',    icon: 'stethoscope',   label: 'Consulta' },
                    { key: 'receta',      icon: 'prescriptions', label: 'Receta'   },
                    { key: 'informe',     icon: 'clinical_notes',label: 'Informe'  },
                    { key: 'laboratorio', icon: 'labs',           label: 'Lab'     },
                  ] as const).map(({ key, icon, label }) => {
                    const active = key === 'informe';
                    return (
                      <button key={key} disabled={active} onClick={() => !active && go(key, { patientId: pid })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '7px 4px', borderRadius: 10, border: 'none', cursor: active ? 'default' : 'pointer', background: active ? 'var(--primary-container)' : 'var(--surface-container-high)', color: active ? 'var(--on-primary-container)' : 'var(--on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: active ? 700 : 500 }}>
                        <Icon name={icon} size={16} fill={active} />{label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </RailCard>

          {/* 2. Tipo de informe */}
          <RailCard icon="category" title="Tipo de informe">
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setTipoOpen(!tipoOpen)}
                style={{ width: '100%', textAlign: 'left', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '10px 44px 10px 10px', background: 'var(--surface)', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 10, background: tipoInfo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={tipoInfo.icon} size={18} style={{ color: tipoInfo.color }} />
                </div>
                <span style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--on-surface)' }}>{tipoInfo.label}</span>
                <Icon name="arrow_drop_down" size={22} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-variant)' }} />
              </button>
              {tipoOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-container-high)', borderRadius: 12, boxShadow: '0 8px 24px rgba(16,40,80,.12)', zIndex: 30, maxHeight: 320, overflowY: 'auto', padding: 6 }}>
                  {TIPOS.map((t) => (
                    <button key={t.id} onClick={() => { setTipoId(t.id); setTipoOpen(false); setDirty(true); }} className="state-layer"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '10px 12px', borderRadius: 8, position: 'relative', background: t.id === tipoId ? '#F3FAF8' : 'transparent', fontFamily: 'var(--font-body)' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={t.icon} size={16} style={{ color: t.color }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--on-surface)' }}>{t.label}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)' }}>{t.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </RailCard>

          {/* 3. Detalles */}
          <RailCard icon="badge" title="Detalles">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Fecha del informe */}
              <div style={{ position: 'relative' }}>
                <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '10px 12px 8px', background: 'var(--surface)' }}>
                  <span style={{ position: 'absolute', top: -8, left: 11, padding: '0 5px', background: 'var(--surface)', fontSize: 11.5, fontWeight: 600, color: 'var(--on-surface-variant)' }}>Fecha del informe</span>
                  <input type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); setDirty(true); }}
                    style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-body)', cursor: 'text' }} />
                </div>
              </div>
              {/* Folio (readonly — se asigna en DB al guardar) */}
              <div style={{ position: 'relative' }}>
                <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '10px 12px 8px', background: 'var(--surface-container-low)' }}>
                  <span style={{ position: 'absolute', top: -8, left: 11, padding: '0 5px', background: 'var(--surface-container-low)', fontSize: 11.5, fontWeight: 600, color: 'var(--on-surface-variant)' }}>Folio</span>
                  <div style={{ fontSize: 12.5, fontStyle: 'italic', color: 'var(--on-surface-variant)' }}>{folioDisplay}</div>
                </div>
              </div>
            </div>
            {/* Médico autor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 12px', background: 'var(--surface-container-low)', borderRadius: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#D6F0EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="stethoscope" size={18} style={{ color: '#0B5C57' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>{account.nombreCompleto || 'Médico'}</div>
                <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                  {account.clinicaNombre || 'Autor del informe'}
                </div>
              </div>
            </div>
          </RailCard>

          {/* 4. Visibilidad */}
          <RailCard icon="visibility" title="Visibilidad">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                { id: 'expediente', icon: 'folder_shared', label: 'Expediente',  desc: 'Visible para el equipo tratante' },
                { id: 'compartido', icon: 'group',         label: 'Compartido',  desc: 'Incluir en interconsultas' },
                { id: 'privado',    icon: 'lock_person',   label: 'Privado',     desc: 'Solo el autor del informe' },
              ] as const).map((v) => {
                const sel = visibilidad === v.id;
                return (
                  <button key={v.id} onClick={() => setVisibilidad(v.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${sel ? '#0E8C86' : 'var(--outline-variant)'}`, background: sel ? '#F3FAF8' : 'var(--surface)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)' }}>
                    <Icon name={sel ? 'radio_button_checked' : 'radio_button_unchecked'} size={20} style={{ color: sel ? '#0E8C86' : 'var(--outline-variant)', flexShrink: 0 }} />
                    <Icon name={v.icon} size={18} style={{ color: sel ? '#0B5C57' : 'var(--on-surface-variant)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: sel ? '#0B5C57' : 'var(--on-surface)' }}>{v.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)' }}>{v.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </RailCard>
        </div>

        {/* ── Lienzo principal ───────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* 1. Título */}
          <Card variant="outlined" style={{ padding: '18px 22px', borderRadius: 20, border: tituloError ? '1px solid #F4C9C5' : undefined }}>
            <div style={{ position: 'relative' }}>
              <div style={{ border: `1px solid ${tituloError ? '#BA1A1A' : 'var(--outline-variant)'}`, borderRadius: 12, padding: '10px 14px 8px', background: 'var(--surface)' }}>
                <span style={{ position: 'absolute', top: -8, left: 11, padding: '0 5px', background: 'var(--surface)', fontSize: 11.5, fontWeight: 600, color: tituloError ? '#BA1A1A' : 'var(--on-surface-variant)' }}>
                  Título del informe *
                </span>
                <input
                  type="text"
                  value={titulo}
                  placeholder="Ej. Evolución favorable · control de hipertensión"
                  onChange={(e) => { setTitulo(e.target.value); if (e.target.value.trim()) setTituloError(false); setDirty(true); }}
                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-body)' }}
                />
              </div>
              {tituloError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 12.5, color: '#BA1A1A' }}>
                  <Icon name="error" size={15} />El título del informe es obligatorio.
                </div>
              )}
            </div>
          </Card>

          {/* 2. Contenido (editor cifrado) */}
          <Card variant="outlined" style={{ padding: 0, borderRadius: 20, overflow: 'hidden' }}>
            {/* Cabecera del editor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderBottom: '1px solid var(--outline-variant)' }}>
              <Icon name="edit_note" size={20} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface)' }}>Contenido</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: '#EAF6F3', color: '#0B5C57' }}>
                <Icon name="lock" size={14} />Cifrado
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>{wordCount} palabras · {charCount} caracteres</span>
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 22px', background: 'var(--surface-container-low)', borderBottom: '1px solid var(--outline-variant)', flexWrap: 'wrap' }}>
              {[
                { cmd: 'bold',          icon: 'format_bold' },
                { cmd: 'italic',        icon: 'format_italic' },
                { cmd: 'underline',     icon: 'format_underlined' },
              ].map(({ cmd, icon }) => (
                <button key={cmd} onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}
                  style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--on-surface-variant)' }}>
                  <Icon name={icon} size={20} />
                </button>
              ))}
              <div style={{ width: 1, height: 20, background: 'var(--outline-variant)', margin: '0 4px' }} />
              {[
                { cmd: 'formatBlock',   icon: 'title',                arg: 'h3' },
                { cmd: 'insertUnorderedList', icon: 'format_list_bulleted' },
                { cmd: 'insertOrderedList',   icon: 'format_list_numbered' },
              ].map(({ cmd, icon, arg }) => (
                <button key={cmd + icon} onMouseDown={(e) => { e.preventDefault(); exec(cmd, arg); }}
                  style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--on-surface-variant)' }}>
                  <Icon name={icon} size={20} />
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {/* Menú plantillas */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setPlantOpen(!plantillaOpen)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, color: 'var(--on-surface)', fontFamily: 'var(--font-body)' }}>
                  <Icon name="description" size={18} style={{ color: 'var(--primary)' }} />Plantillas<Icon name="arrow_drop_down" size={18} style={{ color: 'var(--on-surface-variant)' }} />
                </button>
                {plantillaOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 280, background: 'var(--surface-container-high)', borderRadius: 12, boxShadow: '0 10px 30px rgba(16,40,80,.16)', zIndex: 40, padding: 6 }}>
                    {PLANTILLAS.map((pl) => (
                      <button key={pl.id} onClick={() => insertPlantilla(pl.html)} className="state-layer"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '10px 12px', borderRadius: 8, background: 'transparent', fontFamily: 'var(--font-body)', position: 'relative' }}>
                        <Icon name={pl.icon} size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 14, color: 'var(--on-surface)' }}>{pl.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Área editable */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              data-ph="Redacta el contenido del informe: padecimiento actual, evolución, hallazgos relevantes, impresión diagnóstica, plan e indicaciones..."
              onInput={updateWordCount}
              style={{ minHeight: 520, padding: '18px 20px', fontSize: 15.5, lineHeight: 1.75, color: 'var(--on-surface)', outline: 'none', fontFamily: 'var(--font-body)' }}
            />

            {/* Pie del editor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 22px', borderTop: '1px solid var(--outline-variant)', fontSize: 12, color: 'var(--on-surface-variant)' }}>
              <Icon name="shield_lock" size={14} />El contenido se cifra de extremo a extremo antes de guardarse en el expediente.
            </div>
          </Card>

          {/* 3. Etiquetas */}
          <Card variant="outlined" style={{ padding: '18px 22px', borderRadius: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Icon name="sell" size={19} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--on-surface-variant)' }}>Etiquetas</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TAGS.map((tag) => {
                const sel = tags.includes(tag.id);
                return (
                  <button key={tag.id} onClick={() => toggleTag(tag.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, border: `1px solid ${sel ? '#0E8C86' : 'var(--outline-variant)'}`, background: sel ? '#D6F0EC' : 'var(--surface-container-low)', color: sel ? '#0B5C57' : 'var(--on-surface)', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font-body)' }}>
                    <Icon name={tag.icon} size={16} style={{ color: sel ? '#0B5C57' : 'var(--on-surface-variant)' }} />
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* Placeholder CSS para el editor vacío */}
      <style>{`
        [contenteditable]:empty:before { content: attr(data-ph); color: var(--on-surface-variant); opacity: .55; pointer-events: none; }
      `}</style>

      <PdfInformeModal open={pdfOpen} data={pdfData} onClose={cerrarPdf} toast={toast} />
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAccount } from '../context/AccountContext';
import { fetchPacientesSelect, getOrCreateExpediente, type PacienteSelect } from '../lib/patients';
import { subirArchivo, crearEstudio, fetchTiposEstudio, crearTipoEstudio, type TipoEstudioLab } from '../lib/laboratorio';
import { Icon, Button, Card } from '../components';

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


export function Laboratorio({ go, goBack, toast, patientId }: {
  go: (n: string, p?: any) => void; goBack?: () => void; toast?: (m: string) => void; patientId?: string;
}) {
  const account   = useAccount();
  const fileRef   = useRef<HTMLInputElement>(null);
  const notasRef  = useRef<HTMLDivElement>(null);

  const [pacientes,    setPacientes]   = useState<PacienteSelect[]>([]);
  const [pid,          setPid]         = useState(patientId || '');
  const [patientOpen,  setPatOpen]     = useState(false);
  const [tipos,        setTipos]       = useState<TipoEstudioLab[]>([]);
  const [tipoEstudio,  setTipo]        = useState('');
  const [tipoOpen,     setTipoOpen]    = useState(false);
  const [fechaEstudio, setFecha]       = useState(new Date().toISOString().slice(0, 10));
  const [labExterno,   setLabExterno]  = useState('');
  const [archivo,      setArchivo]     = useState<File | null>(null);
  const [archivoErr,   setArchivoErr]  = useState(false);
  const [tipoErr,      setTipoErr]     = useState(false);
  const [saving,       setSaving]      = useState(false);
  const [dirty,        setDirty]       = useState(false);

  const puede = account.puedeEmitirClinico && !!account.clinicaId;

  useEffect(() => {
    if (!account.clinicaId) return;
    fetchPacientesSelect(account.clinicaId).then(setPacientes).catch(console.error);
    fetchTiposEstudio().then(setTipos).catch(console.error);
  }, [account.clinicaId]);

  useEffect(() => {
    if (!pid && pacientes.length) setPid(patientId || pacientes[0].id);
  }, [pacientes]);

  const paciente = pacientes.find((p) => p.id === pid) ?? null;

  const cancelar = () => go(pid ? 'patient' : 'patients', pid ? { id: pid } : undefined);

  const guardar = async () => {
    let ok = true;
    if (!tipoEstudio.trim()) { setTipoErr(true); ok = false; }
    if (!archivo)            { setArchivoErr(true); ok = false; }
    if (!pid)                { toast?.('Selecciona un paciente'); return; }
    if (!ok) { toast?.('Completa los campos obligatorios'); return; }

    setSaving(true);
    try {
      const expId               = await getOrCreateExpediente(pid, account.clinicaId!);
      const { path, nombre }    = await subirArchivo(archivo!, account.clinicaId!, expId);
      const notas               = (notasRef.current?.innerHTML || '').trim();

      await crearEstudio(expId, {
        tipo_estudio:        tipoEstudio.trim(),
        fecha_estudio:       fechaEstudio,
        archivo_url:         path,
        archivo_nombre:      nombre,
        laboratorio_externo: labExterno.trim() || null,
        notas:               notas && notas !== '<br>' ? notas : null,
      });

      toast?.('Estudio guardado correctamente');
      go('patient', { id: pid });
    } catch (e: any) {
      toast?.('Error al guardar: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  if (!puede) {
    return (
      <div className="page-pad" style={{ maxWidth: 640, margin: '40px auto', textAlign: 'center' }}>
        <Card variant="elevated" style={{ padding: '48px 28px' }}>
          <Icon name="badge" size={48} style={{ color: 'var(--primary)', opacity: .6 }} />
          <h2 className="title-l" style={{ marginTop: 14 }}>Registra tu cédula profesional</h2>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '8px auto 18px', maxWidth: 420 }}>
            Para registrar estudios necesitas estar dado de alta como médico.
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
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
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--secondary-container)', color: 'var(--on-secondary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="labs" size={22} fill />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="title-l" style={{ fontWeight: 700, letterSpacing: '-.2px', fontSize: 17 }}>Nuevo estudio de laboratorio</div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            <span onClick={() => go('patients')} style={{ cursor: 'pointer' }}>Pacientes</span>
            {paciente && <>{' › '}<span>{paciente.name}</span></>}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, background: dirty ? 'var(--surface-container-highest)' : 'var(--surface-container)', color: 'var(--on-surface-variant)' }}>
          <Icon name={dirty ? 'edit_document' : 'check_circle'} size={16} />{dirty ? 'Borrador' : 'Sin cambios'}
        </span>
        <Button variant="filled" icon="upload" onClick={guardar} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar estudio'}
        </Button>
      </div>

      {/* ── Cuerpo ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 1680, width: '100%', margin: '0 auto', padding: '24px 28px 40px' }} className="consulta-body">

        {/* ── Rail ───────────────────────────────────────────────────────── */}
        <div style={{ width: 408, flex: 'none', position: 'sticky', top: 96, display: 'flex', flexDirection: 'column', gap: 18 }} className="consulta-rail">

          {/* Paciente */}
          <RailCard icon="person" title="Paciente">
            <div style={{ position: 'relative' }}>
              <button onClick={() => setPatOpen(!patientOpen)}
                style={{ width: '100%', textAlign: 'left', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '12px 44px 12px 14px', background: 'var(--surface)', cursor: 'pointer', position: 'relative' }}>
                <div className="title-s" style={{ fontSize: 16 }}>{paciente?.name ?? 'Selecciona un paciente'}</div>
                {paciente && <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Exp. {paciente.expediente_id?.slice(0, 8) ?? '—'}</div>}
                <Icon name="arrow_drop_down" size={22} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-variant)' }} />
              </button>
              {patientOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-container-high)', borderRadius: 12, boxShadow: 'var(--elev-3)', zIndex: 30, maxHeight: 280, overflowY: 'auto', padding: 6 }}>
                  {pacientes.map((p) => (
                    <button key={p.id} onClick={() => { setPid(p.id); setPatOpen(false); setDirty(true); }} className="state-layer"
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
                    const active = key === 'laboratorio';
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

          {/* Detalles del estudio */}
          <RailCard icon="science" title="Detalles del estudio">
            {/* Tipo de estudio */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <div style={{ border: `1px solid ${tipoErr ? '#BA1A1A' : 'var(--outline-variant)'}`, borderRadius: 12, padding: '10px 12px 8px', background: 'var(--surface)', position: 'relative' }}>
                <span style={{ position: 'absolute', top: -8, left: 11, padding: '0 5px', background: 'var(--surface)', fontSize: 11.5, fontWeight: 600, color: tipoErr ? '#BA1A1A' : 'var(--on-surface-variant)' }}>Tipo de estudio *</span>
                <input type="text" value={tipoEstudio} placeholder="Ej. Biometría hemática"
                  onClick={() => setTipoOpen(true)}
                  onChange={(e) => { setTipo(e.target.value); setTipoErr(false); setDirty(true); setTipoOpen(true); }}
                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 15, fontWeight: 500, fontFamily: 'var(--font-body)' }} />
              </div>
              {tipoErr && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 12, color: '#BA1A1A' }}><Icon name="error" size={14} />Campo obligatorio.</div>}
              {tipoOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-container-high)', borderRadius: 12, boxShadow: 'var(--elev-3)', zIndex: 30, maxHeight: 260, overflowY: 'auto', padding: 6 }}>
                  {tipos
                    .filter((t) => t.nombre.toLowerCase().includes(tipoEstudio.toLowerCase()))
                    .map((t) => (
                      <button key={t.id} onClick={() => { setTipo(t.nombre); setTipoOpen(false); setTipoErr(false); setDirty(true); }} className="state-layer"
                        style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '9px 12px', borderRadius: 8, background: 'transparent', color: 'var(--on-surface)', fontFamily: 'var(--font-body)', fontSize: 14, position: 'relative' }}>
                        {t.nombre}
                      </button>
                    ))
                  }
                  {/* Opción "Agregar tipo nuevo" si no hay coincidencia exacta */}
                  {tipoEstudio.trim() && !tipos.some((t) => t.nombre.toLowerCase() === tipoEstudio.trim().toLowerCase()) && (
                    <button
                      onClick={async () => {
                        const nombre = tipoEstudio.trim();
                        await crearTipoEstudio(nombre).catch(console.error);
                        setTipos((prev) => [...prev, { id: Date.now().toString(), nombre }].sort((a, b) => a.nombre.localeCompare(b.nombre)));
                        setTipo(nombre); setTipoOpen(false); setTipoErr(false); setDirty(true);
                      }}
                      className="state-layer"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '9px 12px', borderRadius: 8, background: 'transparent', color: 'var(--primary)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, position: 'relative' }}>
                      <Icon name="add_circle" size={18} />Agregar "{tipoEstudio.trim()}"
                    </button>
                  )}
                  {tipos.length === 0 && !tipoEstudio && (
                    <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--on-surface-variant)' }}>Cargando tipos…</div>
                  )}
                </div>
              )}
            </div>

            {/* Fecha del estudio */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '10px 12px 8px', background: 'var(--surface)' }}>
                <span style={{ position: 'absolute', top: -8, left: 11, padding: '0 5px', background: 'var(--surface)', fontSize: 11.5, fontWeight: 600, color: 'var(--on-surface-variant)' }}>Fecha del estudio</span>
                <input type="date" value={fechaEstudio} onChange={(e) => { setFecha(e.target.value); setDirty(true); }}
                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-body)' }} />
              </div>
            </div>

            {/* Laboratorio externo */}
            <div style={{ position: 'relative' }}>
              <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '10px 12px 8px', background: 'var(--surface)' }}>
                <span style={{ position: 'absolute', top: -8, left: 11, padding: '0 5px', background: 'var(--surface)', fontSize: 11.5, fontWeight: 600, color: 'var(--on-surface-variant)' }}>Laboratorio (opcional)</span>
                <input type="text" value={labExterno} placeholder="Ej. Laboratorio San Rafael"
                  onChange={(e) => { setLabExterno(e.target.value); setDirty(true); }}
                  style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-body)' }} />
              </div>
            </div>
          </RailCard>
        </div>

        {/* ── Lienzo ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Archivo adjunto */}
          <Card variant="outlined" style={{ padding: '18px 22px', borderRadius: 20, border: archivoErr ? '1px solid #F4C9C5' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Icon name="attach_file" size={19} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Archivo del estudio *</span>
            </div>

            <input ref={fileRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setArchivo(f); setArchivoErr(false); setDirty(true); } }} />

            {archivo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 14, background: 'var(--secondary-container)' }}>
                <Icon name={archivo.type === 'application/pdf' ? 'picture_as_pdf' : 'image'} size={28} style={{ color: 'var(--on-secondary-container)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--on-secondary-container)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{archivo.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2 }}>{(archivo.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
                <button onClick={() => { setArchivo(null); if (fileRef.current) fileRef.current.value = ''; }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}>
                  <Icon name="close" size={20} />
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                style={{ width: '100%', border: `2px dashed ${archivoErr ? '#BA1A1A' : 'var(--outline-variant)'}`, borderRadius: 16, padding: '36px 24px', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                <Icon name="upload_file" size={40} style={{ color: archivoErr ? '#BA1A1A' : 'var(--primary)', opacity: .7 }} />
                <div style={{ fontSize: 15, fontWeight: 500, color: archivoErr ? '#BA1A1A' : 'var(--on-surface)' }}>Haz clic para adjuntar el resultado</div>
                <div style={{ fontSize: 12.5 }}>PDF, JPG, PNG o WEBP · máx. 20 MB</div>
              </button>
            )}
            {archivoErr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12.5, color: '#BA1A1A' }}>
                <Icon name="error" size={15} />Adjunta el archivo del estudio.
              </div>
            )}
          </Card>

          {/* Notas clínicas */}
          <Card variant="outlined" style={{ padding: 0, borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderBottom: '1px solid var(--outline-variant)' }}>
              <Icon name="edit_note" size={20} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Notas clínicas</span>
              <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginLeft: 4 }}>— opcional</span>
              <div style={{ flex: 1 }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: '#EAF6F3', color: '#0B5C57' }}>
                <Icon name="lock" size={14} />Cifradas
              </span>
            </div>

            {/* Toolbar mínimo */}
            <div style={{ display: 'flex', gap: 2, padding: '8px 22px', background: 'var(--surface-container-low)', borderBottom: '1px solid var(--outline-variant)' }}>
              {[
                { cmd: 'bold',      icon: 'format_bold' },
                { cmd: 'italic',    icon: 'format_italic' },
                { cmd: 'underline', icon: 'format_underlined' },
              ].map(({ cmd, icon }) => (
                <button key={cmd} onMouseDown={(e) => { e.preventDefault(); document.execCommand(cmd); notasRef.current?.focus(); setDirty(true); }}
                  style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--on-surface-variant)' }}>
                  <Icon name={icon} size={20} />
                </button>
              ))}
              <div style={{ width: 1, height: 20, background: 'var(--outline-variant)', margin: '8px 4px' }} />
              {[
                { cmd: 'insertUnorderedList', icon: 'format_list_bulleted' },
                { cmd: 'insertOrderedList',   icon: 'format_list_numbered' },
              ].map(({ cmd, icon }) => (
                <button key={cmd} onMouseDown={(e) => { e.preventDefault(); document.execCommand(cmd); notasRef.current?.focus(); setDirty(true); }}
                  style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--on-surface-variant)' }}>
                  <Icon name={icon} size={20} />
                </button>
              ))}
            </div>

            <div ref={notasRef} contentEditable suppressContentEditableWarning
              data-ph="Interpretación del resultado, valores de referencia, observaciones clínicas relevantes…"
              onInput={() => setDirty(true)}
              style={{ minHeight: 220, padding: '18px 20px', fontSize: 15, lineHeight: 1.7, color: 'var(--on-surface)', outline: 'none', fontFamily: 'var(--font-body)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 22px', borderTop: '1px solid var(--outline-variant)', fontSize: 12, color: 'var(--on-surface-variant)' }}>
              <Icon name="shield_lock" size={14} />Las notas se cifran antes de guardarse en el expediente.
            </div>
          </Card>
        </div>
      </div>

      <style>{`
        [contenteditable]:empty:before { content: attr(data-ph); color: var(--on-surface-variant); opacity: .5; pointer-events: none; }
      `}</style>
    </div>
  );
}

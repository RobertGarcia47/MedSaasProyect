import { useState, useEffect } from 'react';
import { useAccount } from '../context/AccountContext';
import { createPaciente, fetchPacientesSelect } from '../lib/patients';
import { createCita } from '../lib/citas';
import { crearInforme, TIPO_INFORME_LABEL } from '../lib/informes';
import { Icon, Button, Card, IconButton, Dialog, TextField, Select } from '../components';

/* ============================================================
   Páginas Recetas / Informes
   Recetas e informes son POR EXPEDIENTE (se ven en el expediente del paciente).
   No hay un listado global multi-clínica, así que estas vistas redirigen ahí.
   ============================================================ */
function HubModule({ icon, title, detail, go }) {
  return (
    <div className="page-pad fade-up">
      <h1 className="headline-l" style={{ letterSpacing: '-.5px', marginBottom: 20 }}>{title}</h1>
      <Card variant="elevated" style={{ padding: '56px 24px', textAlign: 'center' }}>
        <Icon name={icon} size={56} style={{ opacity: .5, color: 'var(--primary)' }} />
        <h2 className="title-l" style={{ marginTop: 16 }}>Se gestionan desde el expediente</h2>
        <p className="body-m" style={{ color: 'var(--on-surface-variant)', maxWidth: 460, margin: '10px auto 18px', lineHeight: 1.6 }}>
          {detail}
        </p>
        <Button variant="filled" icon="groups" onClick={() => go('patients')}>Ir a pacientes</Button>
      </Card>
    </div>
  );
}

export function Prescriptions({ go }) {
  return (
    <HubModule icon="prescriptions" title="Recetas" go={go}
      detail="Las recetas se emiten y consultan dentro del expediente de cada paciente, en la pestaña Recetas." />
  );
}

export function Reports({ go }) {
  return (
    <HubModule icon="description" title="Informes médicos" go={go}
      detail="Los informes se redactan y consultan dentro del expediente de cada paciente, en la pestaña Informes." />
  );
}

/* ---------- Modal helpers ---------- */
function ModalHeader({ icon, title, subtitle, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '24px 24px 12px' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-container)', color: 'var(--on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={24} fill />
      </div>
      <div style={{ flex: 1 }}>
        <h2 className="headline-s" style={{ fontSize: 22 }}>{title}</h2>
        {subtitle && <p className="body-m" style={{ color: 'var(--on-surface-variant)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      <IconButton name="close" onClick={onClose} />
    </div>
  );
}

function ModalActions({ children }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 24px 24px', marginTop: 8 }}>{children}</div>;
}

function PendingNotice({ icon = 'construction', text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>
      <Icon name={icon} size={22} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      <span className="body-m" style={{ lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

/* ---------- Hook: carga pacientes de la clínica para los selects ---------- */
function usePacientes(open, clinicaId) {
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !clinicaId) return;
    setLoading(true);
    fetchPacientesSelect(clinicaId)
      .then(setPacientes)
      .catch((e) => console.error('fetchPacientesSelect:', e))
      .finally(() => setLoading(false));
  }, [open, clinicaId]);
  return { pacientes, loading };
}

/* ---------- Combina date + time (locales) → ISO timestamptz ---------- */
function toISO(date, time) {
  if (!date) return null;
  const dt = new Date(`${date}T${time || '00:00'}`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

/* ============================================================
   Appointment modal → tabla citas (INSERT directo)
   ============================================================ */
export function AppointmentModal({ open, onClose, prefill, toast, onCreated }) {
  const account = useAccount();
  const { pacientes } = usePacientes(open, account.clinicaId);

  const [pid, setPid]       = useState('');
  const [date, setDate]     = useState('');
  const [time, setTime]     = useState('10:00');
  const [dur, setDur]       = useState('30');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const puede = account.puedeEmitirClinico && !!account.clinicaId;

  useEffect(() => {
    if (open) {
      const today = new Date().toISOString().slice(0, 10);
      setPid(prefill?.patientId || '');
      setDate(today); setTime('10:00'); setDur('30'); setMotivo(''); setSaving(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && !pid && pacientes.length) setPid(pacientes[0].id);
  }, [open, pacientes]);

  const guardar = async () => {
    const fecha = toISO(date, time);
    if (!pid)   { toast?.('Selecciona un paciente'); return; }
    if (!fecha) { toast?.('Fecha u hora inválida'); return; }
    setSaving(true);
    try {
      await createCita(account.clinicaId, account.userId, {
        paciente_id: pid, fecha, duracion_min: Number(dur) || 30, motivo,
      });
      toast?.('Cita agendada correctamente');
      onCreated?.();
      onClose();
    } catch (e) {
      toast?.('Error al agendar: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} width={580}>
      <ModalHeader icon="event" title="Agendar cita" subtitle="Programa una consulta para un paciente" onClose={onClose} />
      {!puede ? (
        <div style={{ padding: '8px 24px' }}>
          <PendingNotice text="Para agendar citas necesitas estar registrado como médico (cédula). Captúrala en tu perfil." />
        </div>
      ) : pacientes.length === 0 ? (
        <div style={{ padding: '8px 24px' }}>
          <PendingNotice icon="group_off" text="No hay pacientes registrados aún. Crea un paciente antes de agendar una cita." />
        </div>
      ) : (
        <div style={{ padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <Select label="Paciente" icon="person" value={pid} onChange={setPid}
            options={pacientes.map((p) => ({ value: p.id, label: p.name }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12 }}>
            <TextField label="Fecha" icon="calendar_today" type="date" value={date} onChange={setDate} />
            <TextField label="Hora"  icon="schedule"       type="time" value={time} onChange={setTime} />
            <TextField label="Duración (min)" type="number" value={dur} onChange={setDur} />
          </div>
          <TextField label="Motivo (breve)" icon="notes" value={motivo} onChange={setMotivo} placeholder="Ej. Control de hipertensión" />
        </div>
      )}
      <ModalActions>
        <Button variant="text" onClick={onClose}>Cancelar</Button>
        {puede && pacientes.length > 0 && (
          <Button variant="filled" icon="check" onClick={guardar} disabled={saving || !pid}>
            {saving ? 'Agendando…' : 'Agendar cita'}
          </Button>
        )}
      </ModalActions>
    </Dialog>
  );
}

/* ============================================================
   Report modal → RPC crear_informe (cuerpo cifrado)
   ============================================================ */
export function ReportModal({ open, onClose, prefill, toast, onCreated }) {
  const account = useAccount();
  const { pacientes } = usePacientes(open, account.clinicaId);

  const [pid, setPid]     = useState('');
  const [tipo, setTipo]   = useState('nota_evolucion');
  const [titulo, setTit]  = useState('');
  const [cuerpo, setCue]  = useState('');
  const [saving, setSaving] = useState(false);

  const puede = account.puedeEmitirClinico && !!account.clinicaId;
  const expedienteId = pacientes.find((p) => p.id === pid)?.expediente_id ?? null;

  useEffect(() => {
    if (open) {
      setPid(prefill?.patientId || '');
      setTipo('nota_evolucion'); setTit(''); setCue(''); setSaving(false);
    }
  }, [open]);
  useEffect(() => { if (open && !pid && pacientes.length) setPid(pacientes[0].id); }, [open, pacientes]);

  const guardar = async () => {
    if (!expedienteId) { toast?.('El paciente no tiene expediente válido'); return; }
    if (!titulo.trim()) { toast?.('El título es obligatorio'); return; }
    setSaving(true);
    try {
      await crearInforme(expedienteId, { tipo, titulo, cuerpo });
      toast?.('Informe guardado correctamente');
      onCreated?.();
      onClose();
    } catch (e) {
      toast?.('Error al guardar: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} width={640}>
      <ModalHeader icon="description" title="Nuevo informe médico" subtitle="Redacta una nota clínica" onClose={onClose} />
      {!puede ? (
        <div style={{ padding: '8px 24px' }}>
          <PendingNotice text="Para redactar informes necesitas estar registrado como médico (cédula). Captúrala en tu perfil." />
        </div>
      ) : pacientes.length === 0 ? (
        <div style={{ padding: '8px 24px' }}>
          <PendingNotice icon="group_off" text="No hay pacientes registrados aún. Crea un paciente antes de redactar un informe." />
        </div>
      ) : (
        <div style={{ padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Select label="Paciente" icon="person" value={pid} onChange={setPid}
              options={pacientes.map((p) => ({ value: p.id, label: p.name }))} />
            <Select label="Tipo" icon="category" value={tipo} onChange={setTipo}
              options={Object.entries(TIPO_INFORME_LABEL).map(([value, label]) => ({ value, label }))} />
          </div>
          <TextField label="Título" icon="title" value={titulo} onChange={setTit} required />
          <TextField label="Contenido (cifrado)" icon="notes" value={cuerpo} onChange={setCue} multiline rows={6} placeholder="Subjetivo, objetivo, análisis y plan…" />
        </div>
      )}
      <ModalActions>
        <Button variant="text" onClick={onClose}>Cancelar</Button>
        {puede && pacientes.length > 0 && (
          <Button variant="filled" icon="check" onClick={guardar} disabled={saving || !titulo.trim()}>
            {saving ? 'Guardando…' : 'Guardar informe'}
          </Button>
        )}
      </ModalActions>
    </Dialog>
  );
}

/* ============================================================
   Patient modal → tabla pacientes + expedientes (INSERT directo)
   ============================================================ */
const SEXO_OPTS = [
  { value: '',  label: 'Sin especificar' },
  { value: 'F', label: 'Femenino' },
  { value: 'M', label: 'Masculino' },
];

const GRUPO_OPTS = [
  { value: '', label: 'Sin especificar' },
  ...['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => ({ value: g, label: g })),
  { value: 'desconocido', label: 'Desconocido' },
];

export function PatientModal({ open, onClose, toast, onCreated }) {
  const account = useAccount();

  const [nombre,    setNombre]    = useState('');
  const [apPaterno, setApPaterno] = useState('');
  const [apMaterno, setApMaterno] = useState('');
  const [fechaNac,  setFechaNac]  = useState('');
  const [sexo,      setSexo]      = useState('');
  const [grupo,     setGrupo]     = useState('');
  const [telefono,  setTelefono]  = useState('');
  const [email,     setEmail]     = useState('');
  const [curp,      setCurp]      = useState('');
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (open) {
      setNombre(''); setApPaterno(''); setApMaterno(''); setFechaNac('');
      setSexo(''); setGrupo(''); setTelefono(''); setEmail(''); setCurp(''); setSaving(false);
    }
  }, [open]);

  const puede = account.puedeEmitirClinico && !!account.clinicaId;

  const guardar = async () => {
    if (!nombre.trim()) { toast?.('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      await createPaciente(account.clinicaId, account.userId, {
        nombre, apellido_paterno: apPaterno, apellido_materno: apMaterno,
        fecha_nacimiento: fechaNac || null, sexo: sexo || null,
        grupo_sanguineo: grupo || null,
        telefono, email, curp,
      });
      toast?.('Paciente registrado correctamente');
      onCreated?.();
      onClose();
    } catch (e) {
      toast?.('Error al registrar: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} width={600}>
      <ModalHeader icon="person_add" title="Nuevo paciente" subtitle="Registra un expediente clínico" onClose={onClose} />
      {!puede ? (
        <div style={{ padding: '8px 24px' }}>
          <PendingNotice text="Para dar de alta pacientes necesitas estar registrado como médico (cédula). Captúrala en tu perfil para habilitar el alta." />
        </div>
      ) : (
        <div style={{ padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <TextField label="Nombre(s)" icon="badge" value={nombre} onChange={setNombre} required />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TextField label="Apellido paterno" value={apPaterno} onChange={setApPaterno} />
            <TextField label="Apellido materno" value={apMaterno} onChange={setApMaterno} />
          </div>
          <TextField label="Fecha de nacimiento" icon="cake" type="date" value={fechaNac} onChange={setFechaNac} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label="Sexo" value={sexo} onChange={setSexo} options={SEXO_OPTS} />
            <Select label="Grupo sanguíneo" value={grupo} onChange={setGrupo} options={GRUPO_OPTS} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TextField label="Teléfono" icon="call" type="tel" value={telefono} onChange={setTelefono} />
            <TextField label="Correo" icon="mail" type="email" value={email} onChange={setEmail} />
          </div>
          <TextField label="CURP" icon="fingerprint" value={curp} onChange={setCurp} placeholder="18 caracteres" />
        </div>
      )}
      <ModalActions>
        <Button variant="text" onClick={onClose}>Cancelar</Button>
        {puede && (
          <Button variant="filled" icon="check" onClick={guardar} disabled={saving || !nombre.trim()}>
            {saving ? 'Guardando…' : 'Crear expediente'}
          </Button>
        )}
      </ModalActions>
    </Dialog>
  );
}

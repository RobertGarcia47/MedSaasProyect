import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Icon, Card, useThemeColors } from './index';
import type { ConsultaDetalleUI } from '../lib/consultas';

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

function TrendCard({ icon, title, unit, children, empty }: {
  icon: string; title: string; unit?: string; children?: React.ReactNode; empty?: boolean;
}) {
  return (
    <Card variant="elevated" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Icon name={icon} size={20} style={{ color: 'var(--primary)' }} />
        <span className="title-s" style={{ fontSize: 16 }}>{title}</span>
        {unit && <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>{unit}</span>}
      </div>
      {empty ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 0', color: 'var(--on-surface-variant)' }}>
          <Icon name="show_chart" size={28} />
          <span style={{ fontSize: 13 }}>Aún no hay suficientes consultas con esta escala respondida para mostrar una tendencia.</span>
        </div>
      ) : children}
    </Card>
  );
}

const tooltipStyle = (c: Record<string, string>) => ({
  background: `var(--surface-container-high, #fff)`,
  border: `1px solid var(--outline-variant, #ccc)`,
  borderRadius: 12,
  fontSize: 12.5,
  fontFamily: 'var(--font-body)',
  boxShadow: 'var(--elev-2)',
});

/**
 * Tendencias de PHQ-9/GAD-7 del paciente a través de sus consultas — mismo
 * patrón que VitalsTrends, reusando los datos que ya trae obtener_consultas
 * (columna `escalas` jsonb) sin ninguna llamada propia. Solo se monta cuando
 * el profesional es psicología/psiquiatría (ver esPracticaSaludMental).
 */
export function EscalasTrends({ consultas }: { consultas: ConsultaDetalleUI[] }) {
  const c = useThemeColors();

  const asc = [...consultas].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  const phq9 = asc
    .filter((x) => x.escalas?.phq9)
    .map((x) => ({ fecha: fmtFecha(x.fecha), total: x.escalas!.phq9!.total }));

  const gad7 = asc
    .filter((x) => x.escalas?.gad7)
    .map((x) => ({ fecha: fmtFecha(x.fecha), total: x.escalas!.gad7!.total }));

  const huboEscalas = phq9.length > 0 || gad7.length > 0;
  if (!huboEscalas) {
    return (
      <Card variant="elevated" style={{ padding: 32, textAlign: 'center' }}>
        <Icon name="checklist" size={32} style={{ color: 'var(--on-surface-variant)' }} />
        <div style={{ marginTop: 10, fontSize: 14, color: 'var(--on-surface-variant)' }}>
          Sin escalas registradas todavía — PHQ-9/GAD-7 se capturan desde Consulta y aparecen aquí conforme se responden.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
      <TrendCard icon="mood" title="PHQ-9 (depresión)" unit="0–27 pts" empty={phq9.length < 2}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={phq9} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={c['outline-variant']} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={{ stroke: c['outline-variant'] }} tickLine={false} />
            <YAxis domain={[0, 27]} tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle(c)} labelStyle={{ color: c['on-surface'] }} />
            <Line type="monotone" dataKey="total" name="PHQ-9" stroke={c.primary} strokeWidth={2.5} dot={{ r: 3, fill: c.primary }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard icon="psychology_alt" title="GAD-7 (ansiedad)" unit="0–21 pts" empty={gad7.length < 2}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={gad7} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={c['outline-variant']} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={{ stroke: c['outline-variant'] }} tickLine={false} />
            <YAxis domain={[0, 21]} tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle(c)} labelStyle={{ color: c['on-surface'] }} />
            <Line type="monotone" dataKey="total" name="GAD-7" stroke={c.tertiary} strokeWidth={2.5} dot={{ r: 3, fill: c.tertiary }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </TrendCard>
    </div>
  );
}

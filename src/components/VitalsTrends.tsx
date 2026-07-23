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
          <span style={{ fontSize: 13 }}>Aún no hay suficientes consultas con este dato para mostrar una tendencia.</span>
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
 * Tendencias de signos vitales del paciente a través de sus consultas.
 * Reusa los datos ya traídos por obtener_consultas (RPC descifra en servidor;
 * los vitales viajan en claro, sin columnas _enc) — no hace ninguna llamada propia.
 */
export function VitalsTrends({ consultas }: { consultas: ConsultaDetalleUI[] }) {
  const c = useThemeColors();

  const asc = [...consultas].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  const peso = asc
    .filter((x) => x.peso_kg != null)
    .map((x) => ({ fecha: fmtFecha(x.fecha), peso: x.peso_kg }));

  const ta = asc
    .filter((x) => x.ta_sistolica != null && x.ta_diastolica != null)
    .map((x) => ({ fecha: fmtFecha(x.fecha), sistolica: x.ta_sistolica, diastolica: x.ta_diastolica }));

  const glucosa = asc
    .filter((x) => x.glucosa != null)
    .map((x) => ({ fecha: fmtFecha(x.fecha), glucosa: x.glucosa }));

  // IMC no viene calculado del RPC — se deriva de peso/talla, arrastrando la
  // última talla conocida (en adultos casi no cambia y no siempre se repite).
  let ultimaTalla: number | null = null;
  const imc: { fecha: string; imc: number }[] = [];
  for (const x of asc) {
    if (x.talla_cm != null) ultimaTalla = x.talla_cm;
    if (x.peso_kg != null && ultimaTalla != null) {
      const m = ultimaTalla / 100;
      imc.push({ fecha: fmtFecha(x.fecha), imc: Math.round((x.peso_kg / (m * m)) * 10) / 10 });
    }
  }

  const huboConsultas = consultas.length > 0;
  if (!huboConsultas) {
    return (
      <Card variant="elevated" style={{ padding: 32, textAlign: 'center' }}>
        <Icon name="monitoring" size={32} style={{ color: 'var(--on-surface-variant)' }} />
        <div style={{ marginTop: 10, fontSize: 14, color: 'var(--on-surface-variant)' }}>
          Sin consultas registradas todavía — las tendencias aparecen aquí conforme se capturan signos vitales.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
      <TrendCard icon="monitor_weight" title="Peso" unit="kg" empty={peso.length < 2}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={peso} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={c['outline-variant']} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={{ stroke: c['outline-variant'] }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip contentStyle={tooltipStyle(c)} labelStyle={{ color: c['on-surface'] }} />
            <Line type="monotone" dataKey="peso" name="Peso (kg)" stroke={c.primary} strokeWidth={2.5} dot={{ r: 3, fill: c.primary }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard icon="blood_pressure" title="Presión arterial" unit="mmHg" empty={ta.length < 2}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={ta} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={c['outline-variant']} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={{ stroke: c['outline-variant'] }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip contentStyle={tooltipStyle(c)} labelStyle={{ color: c['on-surface'] }} />
            <Line type="monotone" dataKey="sistolica" name="Sistólica" stroke={c.primary} strokeWidth={2.5} dot={{ r: 3, fill: c.primary }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="diastolica" name="Diastólica" stroke={c.tertiary} strokeWidth={2.5} dot={{ r: 3, fill: c.tertiary }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard icon="water_drop" title="Glucosa" unit="mg/dL" empty={glucosa.length < 2}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={glucosa} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={c['outline-variant']} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={{ stroke: c['outline-variant'] }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip contentStyle={tooltipStyle(c)} labelStyle={{ color: c['on-surface'] }} />
            <Line type="monotone" dataKey="glucosa" name="Glucosa (mg/dL)" stroke={c.warning} strokeWidth={2.5} dot={{ r: 3, fill: c.warning }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard icon="calculate" title="IMC" unit="kg/m²" empty={imc.length < 2}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={imc} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={c['outline-variant']} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={{ stroke: c['outline-variant'] }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip contentStyle={tooltipStyle(c)} labelStyle={{ color: c['on-surface'] }} />
            <Line type="monotone" dataKey="imc" name="IMC" stroke={c.success} strokeWidth={2.5} dot={{ r: 3, fill: c.success }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </TrendCard>
    </div>
  );
}

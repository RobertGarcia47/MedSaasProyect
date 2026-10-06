import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Icon, Button, Card, useThemeColors } from './index';
import {
  fetchTopDiagnosticos, fetchTopMedicamentos, fetchCitasResumen, fetchConsultasPorDiaSemana,
  type DxFrecuente, type MedicamentosResumen, type CitasResumen, type DiaSemanaCount,
} from '../lib/stats';

const RANGOS_CITAS = [7, 30, 90] as const;
const DIAS_VENTANA_CITAS_DEFAULT = 90;

// ── Exportar CSV ──────────────────────────────────────────────────────────────
// Un solo archivo con las 4 secciones. Escapa comas/comillas (las descripciones
// CIE-10 suelen traer comas) — sin librería, es un formato simple.
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRows(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

function exportarCsv(dx: DxFrecuente[], meds: MedicamentosResumen, citas: CitasResumen, porDia: DiaSemanaCount[], rangoDias: number) {
  const otras = citas.total - citas.completadas - citas.canceladas - citas.noAsistio;
  const partes = [
    'Diagnósticos más frecuentes',
    csvRows([['Código', 'Descripción', 'Consultas'], ...dx.map((d) => [d.codigo, d.descripcion, d.count])]),
    '',
    'Medicamentos más recetados',
    csvRows([['Medicamento', 'Recetas', 'Controlados'], ...meds.top.map((m) => [m.medicamento, m.count, m.controlados])]),
    '',
    `Citas (últimos ${rangoDias} días)`,
    csvRows([
      ['Estado', 'Cantidad'],
      ['Completadas', citas.completadas],
      ['Canceladas', citas.canceladas],
      ['No asistió', citas.noAsistio],
      ['Pendientes / en curso', otras],
      ['Total', citas.total],
      ['Tasa de cancelación / no-show', `${citas.tasaCancelacion}%`],
    ]),
    '',
    'Consultas por día de la semana',
    csvRows([['Día', 'Consultas'], ...porDia.map((d) => [d.dia, d.count])]),
  ];
  const blob = new Blob(['﻿' + partes.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `panorama-practica-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function StatCardShell({ icon, title, sub, extra, children }: {
  icon: string; title: string; sub?: string; extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    // fondo blanco intenso (no el gris de "elevated" por defecto): estas 4
    // tarjetas necesitan destacar sobre el fondo decorativo de la página.
    <Card variant="elevated" style={{ padding: 20, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 4, height: 18, borderRadius: 2, background: '#0E6B5E', flexShrink: 0 }} />
        <Icon name={icon} size={20} style={{ color: 'var(--primary)' }} />
        <span className="title-s" style={{ fontSize: 16 }}>{title}</span>
        {sub && <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>{sub}</span>}
        {/* no-print: un control interactivo no aporta nada en el PDF/impresión —
            mismo criterio que ya se aplica a los botones Imprimir/Exportar CSV. */}
        {extra && <div className="no-print" style={{ marginLeft: 'auto' }}>{extra}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Segmentado 7/30/90 días — hoy solo controla la ventana de la tarjeta de Citas
 *  (diagnósticos/medicamentos/consultas-por-día son histórico completo en el
 *  backend, sin filtro de fecha todavía). */
function RangeToggle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 3, background: 'var(--surface-container-highest)', borderRadius: 999, padding: 3 }}>
      {RANGOS_CITAS.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          style={{
            fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', transition: 'background .12s, color .12s',
            background: value === o ? 'var(--primary-gradient)' : 'transparent',
            color: value === o ? 'var(--on-primary)' : 'var(--on-surface-variant)',
          }}
        >
          {o}d
        </button>
      ))}
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
      {text}
    </div>
  );
}

// Colores del spec de "Panorama de tu práctica" — deliberadamente distintos
// de los tokens semánticos genéricos (--success/--error/--warning): esta
// sección quería su propio lenguaje de color (ej. terracota en vez del rojo
// puro para "Canceladas", para que alarme menos).
const DX_COLOR = '#0E6B5E';
const MED_COLOR = '#0E6B5E';
const MED_CONTROLADO_COLOR = '#C98A1A';
const TRACK_COLOR = '#E3EAE7';

function RankedBar({ label, count, max, sub, color = DX_COLOR, badge }: {
  label: string; count: number; max: number; sub?: string; color?: string; badge?: string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: TRACK_COLOR, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${max > 0 ? (count / max) * 100 : 0}%`, borderRadius: 999, background: color }} />
      </div>
      {(sub || badge) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {sub && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{sub}</span>}
          {badge && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#8A5A0B', background: '#FBF0DA', padding: '1px 8px', borderRadius: 999 }}>
              {badge}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TopDiagnosticosCard({ items }: { items: DxFrecuente[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <StatCardShell icon="diagnosis" title="Diagnósticos más frecuentes">
      {items.length === 0 ? (
        <EmptyMini text="Aún no hay diagnósticos registrados." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((d) => (
            <RankedBar key={d.codigo} label={d.descripcion} count={d.count} max={max} sub={d.codigo} color={DX_COLOR} />
          ))}
        </div>
      )}
    </StatCardShell>
  );
}

function TopMedicamentosCard({ resumen }: { resumen: MedicamentosResumen }) {
  const max = Math.max(1, ...resumen.top.map((i) => i.count));
  const pctControlados = resumen.totalLineas > 0 ? Math.round((resumen.totalControladas / resumen.totalLineas) * 100) : 0;
  return (
    <StatCardShell
      icon="prescriptions"
      title="Medicamentos más recetados"
      sub={resumen.totalLineas > 0 ? `${pctControlados}% de las líneas son controlados` : undefined}
    >
      {resumen.top.length === 0 ? (
        <EmptyMini text="Aún no hay medicamentos recetados." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {resumen.top.map((m) => (
            <RankedBar
              key={m.medicamento}
              label={m.medicamento}
              count={m.count}
              max={max}
              color={m.controlados > 0 ? MED_CONTROLADO_COLOR : MED_COLOR}
              badge={m.controlados > 0 ? 'Controlado' : undefined}
              sub={m.controlados > 0 ? `${m.controlados} de ${m.count}` : undefined}
            />
          ))}
        </div>
      )}
    </StatCardShell>
  );
}

// Colores semánticos propios de esta tarjeta (deliberadamente distintos de
// --success/--error/--warning): "Canceladas" usa terracota, no el rojo puro
// del resto de la app, para que alarme menos que una urgencia real.
const CITAS_COLOR = {
  completadas: '#2E8A5F',
  canceladas: '#C4553B',
  noAsistio: '#C98A1A',
  pendientes: '#8A96A0',
};

function CitasResumenCard({ resumen, rango, onRangoChange }: { resumen: CitasResumen; rango: number; onRangoChange: (v: number) => void }) {
  const otras = resumen.total - resumen.completadas - resumen.canceladas - resumen.noAsistio;
  const items = [
    { label: 'Completadas', value: resumen.completadas, color: CITAS_COLOR.completadas },
    { label: 'Canceladas', value: resumen.canceladas, color: CITAS_COLOR.canceladas },
    { label: 'No asistió', value: resumen.noAsistio, color: CITAS_COLOR.noAsistio },
    // El resto (programada/confirmada/sala_espera/en_curso): citas del periodo que
    // aún no llegan a un estado final — sin esto, el total no cuadraba con las 3
    // filas de arriba y parecía que no había datos cuando sí los había.
    ...(otras > 0 ? [{ label: 'Pendientes / en curso', value: otras, color: CITAS_COLOR.pendientes }] : []),
  ];
  return (
    <StatCardShell icon="event_busy" title="Citas" sub={`últimos ${rango} días`} extra={<RangeToggle value={rango} onChange={onRangoChange} />}>
      {resumen.total === 0 ? (
        <EmptyMini text="Sin citas registradas en este periodo." />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span className="headline-m" style={{ color: CITAS_COLOR.canceladas }}>{resumen.tasaCancelacion}%</span>
            <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
              tasa de cancelación / no-show · {resumen.total} cita{resumen.total === 1 ? '' : 's'} en total
            </span>
          </div>
          {/* barra apilada: proporción de cada estado de un vistazo */}
          <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 16 }}>
            {items.map((it) => (
              <div key={it.label} style={{ flex: it.value || 0.0001, background: it.color }} title={`${it.label}: ${it.value}`} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it) => (
              <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--on-surface)' }}>{it.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{it.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </StatCardShell>
  );
}

function ConsultasPorDiaCard({ data }: { data: DiaSemanaCount[] }) {
  const c = useThemeColors();
  const total = data.reduce((s, d) => s + d.count, 0);
  const maxIdx = data.reduce((best, d, i) => (d.count > data[best].count ? i : best), 0);
  return (
    <StatCardShell icon="calendar_view_week" title="Consultas por día de la semana">
      {total === 0 ? (
        <EmptyMini text="Aún no hay consultas registradas." />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="#E4E0D8" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="dia"
              tick={({ x, y, payload, index }) => (
                <text x={x} y={y + 14} textAnchor="middle" fontSize={11} fontWeight={index === maxIdx ? 700 : 400} fill={index === maxIdx ? '#0E6B5E' : c['on-surface-variant']}>
                  {payload.value}
                </text>
              )}
              axisLine={{ stroke: '#E4E0D8' }}
              tickLine={false}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: c['on-surface-variant'] }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: c['surface-container-high'] }}
              contentStyle={{ background: c['surface-container-high'], border: `1px solid ${c['outline-variant']}`, borderRadius: 12, fontSize: 12.5 }}
              labelStyle={{ color: c['on-surface'] }}
            />
            <Bar dataKey="count" name="Consultas" radius={[6, 6, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={i === maxIdx ? '#0E6B5E' : '#B9CFC8'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </StatCardShell>
  );
}

/**
 * Panorama de la práctica — sección del Dashboard con estadísticas agregadas
 * de toda la clínica (no de un paciente). Carga sus propios datos; basta con
 * darle el clinicaId.
 */
export function PracticeStats({ clinicaId }: { clinicaId: string }) {
  const [loading, setLoading] = useState(true);
  const [dx, setDx] = useState<DxFrecuente[]>([]);
  const [meds, setMeds] = useState<MedicamentosResumen>({ top: [], totalLineas: 0, totalControladas: 0 });
  const [citas, setCitas] = useState<CitasResumen>({ total: 0, completadas: 0, canceladas: 0, noAsistio: 0, tasaCancelacion: 0 });
  const [porDia, setPorDia] = useState<DiaSemanaCount[]>([]);
  const [rangoCitas, setRangoCitas] = useState(DIAS_VENTANA_CITAS_DEFAULT);

  useEffect(() => {
    if (!clinicaId) { setLoading(false); return; }
    let mounted = true;
    const desdeCitas = new Date(Date.now() - rangoCitas * 24 * 60 * 60 * 1000);
    setLoading(true);
    Promise.all([
      fetchTopDiagnosticos(clinicaId, 5),
      fetchTopMedicamentos(clinicaId, 5),
      fetchCitasResumen(clinicaId, desdeCitas),
      fetchConsultasPorDiaSemana(clinicaId),
    ])
      .then(([dxRes, medsRes, citasRes, porDiaRes]) => {
        if (!mounted) return;
        setDx(dxRes); setMeds(medsRes); setCitas(citasRes); setPorDia(porDiaRes);
      })
      .catch((e) => console.error('PracticeStats error:', e))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [clinicaId, rangoCitas]);

  return (
    <div className="practice-stats-print" style={{ marginTop: 24 }}>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <Icon name="insights" size={22} style={{ color: 'var(--primary)' }} />
        <h2 className="title-l" style={{ flex: 1, minWidth: 200 }}>Panorama de tu práctica</h2>
        {!loading && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outlined" icon="print" size="sm" onClick={() => window.print()}>Imprimir / PDF</Button>
            <Button variant="outlined" icon="download" size="sm" onClick={() => exportarCsv(dx, meds, citas, porDia, rangoCitas)}>Exportar CSV</Button>
          </div>
        )}
      </div>
      {/* título visible solo al imprimir — el de arriba se oculta junto con los botones */}
      <h2 className="title-l print-only" style={{ marginBottom: 14, display: 'none' }}>Panorama de tu práctica</h2>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <Icon name="progress_activity" size={28} style={{ color: 'var(--on-surface-variant)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          <TopDiagnosticosCard items={dx} />
          <TopMedicamentosCard resumen={meds} />
          <CitasResumenCard resumen={citas} rango={rangoCitas} onRangoChange={setRangoCitas} />
          <ConsultasPorDiaCard data={porDia} />
        </div>
      )}
    </div>
  );
}

import { useMemo } from 'react';

const C = {
  cream:    '#EAE8DD',
  ink:      '#21392C',
  amarillo: '#F5F53D',
  ocre:     '#BFB200',
  celeste:  '#78D9D8',
  lila:     '#AD95E6',
  brick:    '#A23A2A',
  ink15:    '#21392C26',
  ink08:    '#21392C14',
};

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const VALID_STATUS = new Set(['Checked out', 'Checked in', 'Confirmed', 'Started', 'Processed']);

function parseAmount(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[€\s]/g, '').replace(/,/g, '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function asDate(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Customer-level analysis from the Mews bridge reservations.
 *
 * Customers are keyed by name (the bridge has no stable customer id). We
 * aggregate lifetime behaviour across all valid bookings: visit counts,
 * revenue, nights, first/last visit. From that we derive retention tiers,
 * customer value, and a new-vs-returning split by month. A booking counts as
 * "acquiring" (new) when its arrival is the customer's earliest arrival.
 */
export function computeCustomerStats(reservations) {
  const map = new Map();
  for (const r of reservations) {
    if (!r || !VALID_STATUS.has(r.status)) continue;
    const name = (r.customer || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const arrival = asDate(r.arrival);
    const amount = parseAmount(r.totalAmount);
    const nights = Number(r.nights) || 0;
    if (!map.has(key)) map.set(key, { name, count: 0, revenue: 0, nights: 0, bookings: [] });
    const c = map.get(key);
    c.count += 1;
    c.revenue += amount;
    c.nights += nights;
    c.bookings.push({ arrival, amount, nights });
  }

  const customers = [...map.values()];
  let minArrival = null;
  let maxArrival = null;
  customers.forEach((c) => {
    const dated = c.bookings.filter((b) => b.arrival).sort((a, b) => a.arrival - b.arrival);
    c.arrivals = dated.map((b) => b.arrival);
    c.first = c.arrivals[0] || null;
    c.last = c.arrivals[c.arrivals.length - 1] || null;
    if (c.first && (!minArrival || c.first < minArrival)) minArrival = c.first;
    if (c.last && (!maxArrival || c.last > maxArrival)) maxArrival = c.last;
  });

  const total = customers.length;
  const totalBookings = customers.reduce((a, c) => a + c.count, 0);
  const totalRevenue = customers.reduce((a, c) => a + c.revenue, 0);
  const oneTime = customers.filter((c) => c.count === 1).length;
  const repeat = customers.filter((c) => c.count >= 2).length;
  const loyal = customers.filter((c) => c.count >= 3).length;
  const returningRevenue = customers.filter((c) => c.count >= 2).reduce((a, c) => a + c.revenue, 0);

  // Average gap (days) between consecutive visits, across repeat customers
  const gaps = [];
  for (const c of customers) {
    for (let i = 1; i < c.arrivals.length; i++) {
      gaps.push((c.arrivals[i] - c.arrivals[i - 1]) / 86400000);
    }
  }
  const avgGapDays = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;

  const topByRevenue = [...customers].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // New customers acquired per month (by first arrival) + monthly revenue split
  const monthly = new Map(); // 'YYYY-MM' -> { newCustomers, newRev, retRev }
  const bump = (k) => { if (!monthly.has(k)) monthly.set(k, { key: k, newCustomers: 0, newRev: 0, retRev: 0 }); return monthly.get(k); };
  for (const c of customers) {
    const firstTime = c.first ? c.first.getTime() : null;
    if (c.first) bump(monthKey(c.first)).newCustomers += 1;
    for (const b of c.bookings) {
      if (!b.arrival) continue;
      const row = bump(monthKey(b.arrival));
      if (firstTime != null && b.arrival.getTime() === firstTime) row.newRev += b.amount;
      else row.retRev += b.amount;
    }
  }
  const byMonth = [...monthly.values()].sort((a, b) => a.key.localeCompare(b.key));

  return {
    total, totalBookings, totalRevenue,
    oneTime, repeat, loyal, returningRevenue,
    repeatRate: total > 0 ? repeat / total : 0,
    avgLTV: total > 0 ? totalRevenue / total : 0,
    avgTicket: totalBookings > 0 ? totalRevenue / totalBookings : 0,
    avgBookings: total > 0 ? totalBookings / total : 0,
    returningRevenueShare: totalRevenue > 0 ? returningRevenue / totalRevenue : 0,
    avgGapDays,
    topByRevenue,
    byMonth,
    minArrival,
    maxArrival,
  };
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTHS_ES[Number(m) - 1]} ${y.slice(2)}`;
}
function fmtEUR(n, opts = {}) {
  if (n == null || isNaN(n)) return '—';
  const { compact = false } = opts;
  if (compact && Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${Math.round(n).toLocaleString('es-ES')}€`;
}
function fmtPct(p) {
  if (p == null || isNaN(p)) return '—';
  return `${Math.round(p * 100)}%`;
}
function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Customers({ reservations = [], now = new Date() }) {
  const data = useMemo(() => computeCustomerStats(reservations), [reservations]);
  const empty = data.total === 0;

  const tierMax = Math.max(1, data.total);
  const topMax = Math.max(1, ...data.topByRevenue.map((c) => c.revenue));
  const monthNewMax = Math.max(1, ...data.byMonth.map((m) => m.newCustomers));

  return (
    <div style={{ padding: '32px 32px 80px', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 className="display" style={{ fontSize: 52, lineHeight: 0.95, color: C.ink, marginBottom: 6 }}>
          Análisis de clientes
        </h1>
        <div className="eyebrow" style={{ opacity: 0.65, fontSize: 11 }}>
          {data.minArrival
            ? `RESERVAS DESDE ${fmtDate(data.minArrival).toUpperCase()} — ${fmtDate(data.maxArrival).toUpperCase()}`
            : 'SIN DATOS'} · ACTUALIZADO {fmtDate(now).toUpperCase()} · FUENTE: MEWS
        </div>
      </header>

      {empty ? (
        <div className="tile" style={{ padding: 28, color: C.ink, opacity: 0.7, fontSize: 14, textAlign: 'center' }}>
          Sin reservas en el bridge de Mews todavía. Configura el origen «Mews Bridge» o carga datos demo.
        </div>
      ) : (
        <>
          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <Metric label="Clientes únicos" value={String(data.total)} sub={`${data.totalBookings} reservas`} />
            <Metric label="Tasa de repetición" value={fmtPct(data.repeatRate)} sub={`${data.repeat} recurrentes`} highlight />
            <Metric label="LTV medio" value={fmtEUR(data.avgLTV)} sub="ingresos por cliente" />
            <Metric label="Ticket medio" value={fmtEUR(data.avgTicket)} sub="por reserva" />
            <Metric label="Reservas / cliente" value={data.avgBookings.toFixed(1)} sub={data.avgGapDays != null ? `${Math.round(data.avgGapDays)}d entre visitas` : '—'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Retención y fidelidad */}
            <Card title="Retención y fidelidad" subtitle="Distribución por nº de visitas">
              <BarRow label="Una sola visita" value={data.oneTime} max={tierMax} color={C.ink15} valueLabel={String(data.oneTime)} />
              <BarRow label="Recurrentes (2+)" value={data.repeat} max={tierMax} color={C.celeste} valueLabel={String(data.repeat)} />
              <BarRow label="Fieles (3+)" value={data.loyal} max={tierMax} color={C.ink} valueLabel={String(data.loyal)} />
              <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
                <MiniStat label="Ingresos de recurrentes" value={fmtPct(data.returningRevenueShare)} />
                <MiniStat label="Días medios entre visitas" value={data.avgGapDays != null ? `${Math.round(data.avgGapDays)}d` : '—'} />
              </div>
            </Card>

            {/* Valor por cliente */}
            <Card title="Valor por cliente" subtitle="Top 10 por ingresos">
              {data.topByRevenue.map((c, i) => (
                <BarRow
                  key={c.name + i}
                  label={c.name}
                  value={c.revenue}
                  max={topMax}
                  color={i === 0 ? C.ink : C.celeste}
                  valueLabel={fmtEUR(c.revenue, { compact: true })}
                  sub={`${c.count} ${c.count === 1 ? 'reserva' : 'reservas'} · ${c.nights}n`}
                />
              ))}
            </Card>

            {/* Nuevos vs recurrentes */}
            <Card title="Nuevos vs recurrentes" subtitle="Altas de clientes nuevos por mes">
              {data.byMonth.map((m) => (
                <BarRow
                  key={m.key}
                  label={monthLabel(m.key)}
                  value={m.newCustomers}
                  max={monthNewMax}
                  color={C.lila}
                  valueLabel={String(m.newCustomers)}
                  sub={`${fmtEUR(m.newRev, { compact: true })} nuevos · ${fmtEUR(m.retRev, { compact: true })} recurr.`}
                />
              ))}
            </Card>
          </div>

          <div style={{ marginTop: 16, fontSize: 11, opacity: 0.55, letterSpacing: '0.02em', lineHeight: 1.6 }}>
            Clientes identificados por nombre (el bridge de Mews no trae un id de cliente estable), así que homónimos
            podrían fusionarse. «Recurrente» = 2+ reservas; «fiel» = 3+. Una reserva cuenta como «nueva» cuando es la
            primera del cliente. Nacionalidad, canal y vouchers no se incluyen: no están en la exportación actual.
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub, highlight }) {
  return (
    <div className="tile dark" style={{ padding: 16 }}>
      <div className="eyebrow eyebrow-sm" style={{ color: C.cream, opacity: 0.7, fontSize: 10, letterSpacing: '0.2em' }}>{label}</div>
      <div className="display tabular" style={{ fontSize: 32, lineHeight: 1, marginTop: 6, color: highlight ? C.amarillo : C.cream }}>{value}</div>
      {sub && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, color: C.cream }}>{sub}</div>}
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="tile" style={{ padding: 20 }}>
      <h2 className="display" style={{ fontSize: 22, color: C.ink, margin: 0 }}>{title}</h2>
      {subtitle && <div className="eyebrow eyebrow-sm" style={{ opacity: 0.55, marginTop: 2, marginBottom: 14 }}>{subtitle}</div>}
      <div>{children}</div>
    </div>
  );
}

function BarRow({ label, value, max, color, valueLabel, sub }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span className="tabular" style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{valueLabel}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: C.ink08, marginTop: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      {sub && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="display tabular" style={{ fontSize: 26, lineHeight: 1, color: C.ink }}>{value}</div>
      <div className="eyebrow eyebrow-sm" style={{ opacity: 0.55, marginTop: 4 }}>{label}</div>
    </div>
  );
}

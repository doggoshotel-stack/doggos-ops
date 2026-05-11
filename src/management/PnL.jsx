import { useMemo } from 'react';

const C = {
  cream:    '#EAE8DD',
  ink:      '#21392C',
  amarillo: '#F5F53D',
  ocre:     '#BFB200',
  celeste:  '#78D9D8',
  brick:    '#A23A2A',
  ink15:    '#21392C26',
  ink08:    '#21392C14',
};

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const VALID_STATUS = new Set(['Checked out', 'Checked in', 'Confirmed', 'Started', 'Processed']);

/**
 * Parse amounts that may be:
 *  - number: returned as is
 *  - string with "€" prefix and dot decimals: stripped and parsed (e.g. "€783.00")
 *  - other strings: parseFloat
 *  - null/undefined/empty: 0
 */
function parseAmount(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[€\s]/g, '').replace(/,/g, '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Derive a 12-month P&L summary from the bridge reservations array.
 *
 * Each booking contributes revenue & room-nights to its arrival month
 * (simple attribution — not pro-rating across months).
 *
 * What we can derive:
 *  - rooms_revenue (€)
 *  - room_nights
 *  - occupancy_pct (room_nights / capacity*days)
 *  - adr (€)
 *  - revpar (€)
 *  - is_actual (month strictly past = true; current/future = false)
 *  - otb (revenue from bookings with arrival >= today, attributed to their month)
 *
 * What we can't derive yet (no data in current sheet):
 *  - F&B revenue, Extras revenue
 *  - Budget, Variance
 *  - Pickup 7d, vs STLY pace
 * They render as "—".
 */
export function computePnL(reservations, year, capacity, today = new Date()) {
  const months = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    rooms_revenue: 0,
    fb_revenue: null,
    extras_revenue: null,
    room_nights: 0,
    booking_count: 0,
    otb: 0,
    budget: null,
    is_actual: false,
  }));

  const todayMonth = today.getFullYear() === year ? today.getMonth() : (today.getFullYear() < year ? -1 : 12);

  for (const r of reservations) {
    if (!r || !VALID_STATUS.has(r.status)) continue;
    if (!r.arrival || isNaN(r.arrival.getTime())) continue;
    if (r.arrival.getFullYear() !== year) continue;
    const m = r.arrival.getMonth();
    const amount = parseAmount(r.totalAmount);
    const nights = Number(r.nights) || 0;
    months[m].rooms_revenue += amount;
    months[m].room_nights += nights;
    months[m].booking_count += 1;
    if (r.arrival >= today) months[m].otb += amount;
  }

  for (let m = 0; m < 12; m++) {
    const d = daysInMonth(year, m);
    const cap = capacity * d;
    months[m].available_nights = cap;
    months[m].occupancy_pct = cap > 0 ? months[m].room_nights / cap : 0;
    months[m].adr = months[m].room_nights > 0 ? months[m].rooms_revenue / months[m].room_nights : 0;
    months[m].revpar = cap > 0 ? months[m].rooms_revenue / cap : 0;
    months[m].is_actual = m < todayMonth;
    months[m].is_current = m === todayMonth;
  }

  // FY totals
  const fy = {
    rooms_revenue: months.reduce((a, b) => a + b.rooms_revenue, 0),
    room_nights:   months.reduce((a, b) => a + b.room_nights, 0),
    booking_count: months.reduce((a, b) => a + b.booking_count, 0),
    otb:           months.reduce((a, b) => a + b.otb, 0),
    available_nights: months.reduce((a, b) => a + b.available_nights, 0),
  };
  fy.occupancy_pct = fy.available_nights > 0 ? fy.room_nights / fy.available_nights : 0;
  fy.adr = fy.room_nights > 0 ? fy.rooms_revenue / fy.room_nights : 0;
  fy.revpar = fy.available_nights > 0 ? fy.rooms_revenue / fy.available_nights : 0;

  // YTD (sum closed months only)
  const ytd = {
    rooms_revenue: 0, room_nights: 0, available_nights: 0,
  };
  for (let m = 0; m < 12; m++) {
    if (months[m].is_actual) {
      ytd.rooms_revenue += months[m].rooms_revenue;
      ytd.room_nights += months[m].room_nights;
      ytd.available_nights += months[m].available_nights;
    }
  }
  ytd.occupancy_pct = ytd.available_nights > 0 ? ytd.room_nights / ytd.available_nights : 0;
  ytd.adr = ytd.room_nights > 0 ? ytd.rooms_revenue / ytd.room_nights : 0;
  ytd.revpar = ytd.available_nights > 0 ? ytd.rooms_revenue / ytd.available_nights : 0;

  return { months, fy, ytd };
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

export default function PnL({ reservations, capacity = 42, now = new Date() }) {
  const year = 2026;
  const data = useMemo(() => computePnL(reservations, year, capacity, now), [reservations, year, capacity, now]);

  const rows = [
    { kind: 'section', label: 'Revenue' },
    { kind: 'metric', label: 'Rooms', values: data.months.map(m => fmtEUR(m.rooms_revenue, { compact: true })), fy: fmtEUR(data.fy.rooms_revenue, { compact: true }), accent: true },
    { kind: 'metric', label: 'F&B',   values: data.months.map(() => '—'), fy: '—', muted: true, note: 'pendiente' },
    { kind: 'metric', label: 'Extras',values: data.months.map(() => '—'), fy: '—', muted: true, note: 'pendiente' },
    { kind: 'metric', label: 'Total revenue', values: data.months.map(m => fmtEUR(m.rooms_revenue, { compact: true })), fy: fmtEUR(data.fy.rooms_revenue, { compact: true }), bold: true },

    { kind: 'section', label: 'KPIs de ocupación' },
    { kind: 'metric', label: 'Occupancy %', values: data.months.map(m => fmtPct(m.occupancy_pct)), fy: fmtPct(data.fy.occupancy_pct) },
    { kind: 'metric', label: 'Room nights', values: data.months.map(m => String(m.room_nights)), fy: String(data.fy.room_nights) },
    { kind: 'metric', label: 'ADR',         values: data.months.map(m => fmtEUR(m.adr)), fy: fmtEUR(data.fy.adr) },
    { kind: 'metric', label: 'RevPAR',      values: data.months.map(m => fmtEUR(m.revpar)), fy: fmtEUR(data.fy.revpar) },

    { kind: 'section', label: 'Pickup & pace' },
    { kind: 'metric', label: 'OTB',          values: data.months.map(m => fmtEUR(m.otb, { compact: true })), fy: fmtEUR(data.fy.otb, { compact: true }) },
    { kind: 'metric', label: 'Pickup 7d',    values: data.months.map(() => '—'), fy: '—', muted: true, note: 'requiere histórico' },
    { kind: 'metric', label: 'vs STLY pace', values: data.months.map(() => '—'), fy: '—', muted: true, note: 'requiere LY' },

    { kind: 'section', label: 'Forecast vs actual' },
    { kind: 'metric', label: 'Budget',   values: data.months.map(() => '—'), fy: '—', muted: true, note: 'input manual' },
    { kind: 'metric', label: 'Variance', values: data.months.map(() => '—'), fy: '—', muted: true, note: 'depende de budget' },
  ];

  const currentMonthIdx = now.getFullYear() === year ? now.getMonth() : -1;
  const lastUpdated = now.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ padding: '32px 32px 80px', maxWidth: 1440, margin: '0 auto' }}>
      <style>{`
        .pnl-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
        .pnl-table th, .pnl-table td { padding: 8px 10px; text-align: right; white-space: nowrap; }
        .pnl-table th.pnl-label, .pnl-table td.pnl-label { text-align: left; font-weight: 700; }
        .pnl-table thead th { font-family: 'GT Zirkon', sans-serif; font-weight: 700; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: ${C.ink}; opacity: 0.55; padding-top: 12px; padding-bottom: 12px; border-bottom: 1.5px solid ${C.ink}; background: ${C.cream}; position: sticky; top: 0; z-index: 1; }
        .pnl-table thead th.pnl-current { background: ${C.amarillo}; opacity: 1; color: ${C.ink}; }
        .pnl-table thead th.pnl-fy { background: rgba(33,57,44,0.10); opacity: 1; color: ${C.ink}; border-left: 1.5px solid ${C.ink15}; }
        .pnl-section-row td { background: ${C.ink08}; color: ${C.ink}; font-family: 'GT Zirkon', sans-serif; font-weight: 700; font-size: 10px; letter-spacing: 0.20em; text-transform: uppercase; opacity: 0.7; padding-top: 16px; padding-bottom: 6px; }
        .pnl-row td { border-bottom: 1px solid ${C.ink08}; }
        .pnl-row.pnl-bold td { font-weight: 700; border-top: 1.5px solid ${C.ink15}; }
        .pnl-row.pnl-accent td.pnl-label { color: ${C.ink}; }
        .pnl-cell-muted { color: ${C.ink}; opacity: 0.35; }
        .pnl-cell-current { background: rgba(245,245,61,0.18); font-weight: 700; }
        .pnl-cell-future { color: ${C.ink}; opacity: 0.55; }
        .pnl-cell-fy { background: rgba(33,57,44,0.06); border-left: 1.5px solid ${C.ink15}; font-weight: 700; }
        .pnl-cell-fy.pnl-cell-key { background: ${C.amarillo}; color: ${C.ink}; }
      `}</style>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="display" style={{ fontSize: 52, lineHeight: 0.95, color: C.ink, marginBottom: 6 }}>
            P&amp;L · Resumen anual
          </h1>
          <div className="eyebrow" style={{ opacity: 0.65, fontSize: 11 }}>
            ENE {String(year).slice(2)} — DIC {String(year).slice(2)} · ACTUALIZADO {lastUpdated.toUpperCase()} · FUENTE: MEWS
          </div>
        </div>
      </header>

      {/* Metric strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Metric label="Revenue YTD" value={fmtEUR(data.ytd.rooms_revenue, { compact: true })} />
        <Metric label="Revenue FY (proj.)" value={fmtEUR(data.fy.rooms_revenue, { compact: true })} />
        <Metric label="Occupancy FY" value={fmtPct(data.fy.occupancy_pct)} />
        <Metric label="ADR FY" value={fmtEUR(data.fy.adr)} />
        <Metric label="RevPAR FY" value={fmtEUR(data.fy.revpar)} />
      </div>

      {/* P&L table */}
      <div className="tile" style={{ padding: 0, overflow: 'auto' }}>
        <table className="pnl-table">
          <thead>
            <tr>
              <th className="pnl-label" style={{ minWidth: 160 }}>Métrica</th>
              {MONTHS_ES.map((m, i) => (
                <th key={m} className={i === currentMonthIdx ? 'pnl-current' : ''}>{m}</th>
              ))}
              <th className="pnl-fy">FY</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              if (row.kind === 'section') {
                return (
                  <tr key={`s-${ri}`} className="pnl-section-row">
                    <td colSpan={14} className="pnl-label">{row.label}</td>
                  </tr>
                );
              }
              return (
                <tr key={`r-${ri}`} className={`pnl-row${row.bold ? ' pnl-bold' : ''}${row.accent ? ' pnl-accent' : ''}`}>
                  <td className="pnl-label">
                    {row.label}
                    {row.note && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, opacity: 0.5, letterSpacing: '0.02em' }}>· {row.note}</span>
                    )}
                  </td>
                  {row.values.map((v, mi) => {
                    const cls = [
                      row.muted && v === '—' ? 'pnl-cell-muted' : '',
                      mi === currentMonthIdx ? 'pnl-cell-current' : (mi > currentMonthIdx && currentMonthIdx >= 0 ? 'pnl-cell-future' : ''),
                    ].filter(Boolean).join(' ');
                    return <td key={mi} className={`tabular ${cls}`}>{v}</td>;
                  })}
                  <td className={`tabular pnl-cell-fy ${row.bold || row.accent ? 'pnl-cell-key' : ''}`}>{row.fy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, opacity: 0.55, letterSpacing: '0.02em', lineHeight: 1.6 }}>
        Mes en curso destacado en amarillo. Meses futuros en gris (forecast por completar).
        Pestañas marcadas <em>pendiente</em> / <em>requiere histórico</em> no se calculan todavía con los datos disponibles.
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="tile dark" style={{ padding: 16 }}>
      <div className="eyebrow eyebrow-sm" style={{ color: C.cream, opacity: 0.7, fontSize: 10, letterSpacing: '0.2em' }}>{label}</div>
      <div className="display tabular" style={{ fontSize: 32, lineHeight: 1, marginTop: 6, color: C.amarillo }}>{value}</div>
    </div>
  );
}

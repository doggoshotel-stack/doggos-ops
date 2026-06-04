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
 * What we can't derive yet (no per-product line items in current sheet):
 *  - Extra-product revenue: Transportes, Late checkout, Guardería, Lavado
 *  - Budget, Variance
 *  - Pickup 7d, vs STLY pace
 * They render as "—".
 */
export function computePnL(reservations, year, capacity, today = new Date()) {
  const DAY = 86400000;
  const months = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    rooms_revenue: 0,
    room_nights: 0,
    booking_count: 0,
    otb: 0,
    pickup7: 0,
    pickup30: 0,
    bookings: [],          // { created: Date|null, amount } — drives pace/forecast
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
    // created may arrive as a Date (live) or an ISO string (rehydrated cache).
    const createdDate = r.created == null ? null : (r.created instanceof Date ? r.created : new Date(r.created));
    const created = createdDate && !isNaN(createdDate.getTime()) ? createdDate : null;
    months[m].bookings.push({ created, amount });
    if (created) {
      const ageDays = (today - created) / DAY;
      if (ageDays >= 0 && ageDays <= 7) months[m].pickup7 += amount;
      if (ageDays >= 0 && ageDays <= 30) months[m].pickup30 += amount;
    }
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

  // --- Forecast: on-the-books + expected remaining pickup ---
  // Every booking carries a created date, so for any completed month we can
  // reconstruct how much was still booked AFTER a given lead point. Averaging
  // that "remaining pickup" across completed months tells us how much a month
  // typically still gains from t days out onward. Projected close = what's
  // already on the books for the month + that expected remaining pickup — so it
  // always builds on real reservations and never drops below current OTB.
  // (With history only since Oct 2025, far-out months with little OTB lean
  // mostly on the closed-month average, so treat them as indicative.)
  const monthStart = (mi) => new Date(year, mi, 1);
  const completed = months.filter((mm) => mm.is_actual && mm.rooms_revenue > 0);
  const remainingPickup = (t) => {
    if (completed.length === 0) return null;
    let acc = 0;
    for (const mm of completed) {
      const cutoff = monthStart(mm.month).getTime() - t * DAY;
      let onBooks = 0;
      for (const b of mm.bookings) {
        if (b.created && b.created.getTime() <= cutoff) onBooks += b.amount;
      }
      acc += Math.max(0, mm.rooms_revenue - onBooks);
    }
    return acc / completed.length;
  };

  for (let m = 0; m < 12; m++) {
    const mm = months[m];
    if (mm.is_actual) {
      mm.forecast = mm.rooms_revenue;
      mm.projected = mm.rooms_revenue;
      continue;
    }
    const t = (monthStart(m).getTime() - today.getTime()) / DAY;
    const extra = remainingPickup(t);
    mm.forecast = extra != null ? mm.rooms_revenue + extra : null;
    mm.projected = mm.forecast != null ? mm.forecast : mm.rooms_revenue;
  }

  // FY totals
  const sum = (sel) => months.reduce((a, b) => a + sel(b), 0);
  const fy = {
    rooms_revenue: sum((b) => b.rooms_revenue),
    room_nights:   sum((b) => b.room_nights),
    booking_count: sum((b) => b.booking_count),
    otb:           sum((b) => b.otb),
    pickup7:       sum((b) => b.pickup7),
    pickup30:      sum((b) => b.pickup30),
    projected:     sum((b) => b.projected || 0),
    remaining:     sum((b) => (!b.is_actual && b.forecast != null ? Math.max(0, b.forecast - b.rooms_revenue) : 0)),
    available_nights: sum((b) => b.available_nights),
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
    { kind: 'metric', label: 'Transportes',   values: data.months.map(() => '—'), fy: '—', muted: true, note: 'pendiente' },
    { kind: 'metric', label: 'Late checkout',  values: data.months.map(() => '—'), fy: '—', muted: true, note: 'pendiente' },
    { kind: 'metric', label: 'Guardería',      values: data.months.map(() => '—'), fy: '—', muted: true, note: 'pendiente' },
    { kind: 'metric', label: 'Lavado',         values: data.months.map(() => '—'), fy: '—', muted: true, note: 'pendiente' },
    { kind: 'metric', label: 'Total revenue', values: data.months.map(m => fmtEUR(m.rooms_revenue, { compact: true })), fy: fmtEUR(data.fy.rooms_revenue, { compact: true }), bold: true },

    { kind: 'section', label: 'KPIs de ocupación' },
    { kind: 'metric', label: 'Occupancy %', values: data.months.map(m => fmtPct(m.occupancy_pct)), fy: fmtPct(data.fy.occupancy_pct) },
    { kind: 'metric', label: 'Room nights', values: data.months.map(m => String(m.room_nights)), fy: String(data.fy.room_nights) },
    { kind: 'metric', label: 'ADR',         values: data.months.map(m => fmtEUR(m.adr)), fy: fmtEUR(data.fy.adr) },
    { kind: 'metric', label: 'RevPAR',      values: data.months.map(m => fmtEUR(m.revpar)), fy: fmtEUR(data.fy.revpar) },

    { kind: 'section', label: 'Pickup & pace' },
    { kind: 'metric', label: 'OTB',        values: data.months.map(m => fmtEUR(m.otb, { compact: true })), fy: fmtEUR(data.fy.otb, { compact: true }) },
    { kind: 'metric', label: 'Pickup 7d',  values: data.months.map(m => fmtEUR(m.pickup7, { compact: true })), fy: fmtEUR(data.fy.pickup7, { compact: true }) },
    { kind: 'metric', label: 'Pickup 30d', values: data.months.map(m => fmtEUR(m.pickup30, { compact: true })), fy: fmtEUR(data.fy.pickup30, { compact: true }) },

    { kind: 'section', label: 'Forecast' },
    { kind: 'metric', label: 'Forecast cierre (proj.)', values: data.months.map(m => (m.is_actual || m.forecast != null) ? fmtEUR(m.projected, { compact: true }) : '—'), fy: fmtEUR(data.fy.projected, { compact: true }), bold: true },
    { kind: 'metric', label: 'Pickup restante (proj.)', values: data.months.map(m => (!m.is_actual && m.forecast != null) ? fmtEUR(Math.max(0, m.forecast - m.rooms_revenue), { compact: true }) : '—'), fy: fmtEUR(data.fy.remaining, { compact: true }), note: 'proyección' },
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
        <Metric label="Revenue FY (proj.)" value={fmtEUR(data.fy.projected, { compact: true })} />
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
        Mes en curso destacado en amarillo. Meses futuros en gris.
        El <strong>forecast</strong> suma a las reservas que ya tiene cada mes (OTB) el pickup que
        históricamente sigue entrando a partir de este punto del calendario, estimado con la fecha
        de creación de cada reserva en los meses ya cerrados. Por eso nunca baja del OTB real. Como
        solo hay histórico desde oct 2025, los meses más lejanos (con poco OTB todavía) se apoyan
        casi solo en la media de meses cerrados — tómalos como orientativos. No hay comparativa con
        el año anterior (STLY). Filas de productos extra (Transportes, Late checkout, Guardería,
        Lavado) marcadas <em>pendiente</em>: requieren desglose por línea en la exportación de Mews.
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

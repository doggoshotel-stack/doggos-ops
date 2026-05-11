import { useState, useEffect, useMemo } from 'react';

const C = {
  cream:    '#EAE8DD',
  ink:      '#21392C',
  amarillo: '#F5F53D',
  ocre:     '#BFB200',
  celeste:  '#78D9D8',
  ink15:    '#21392C26',
  ink08:    '#21392C14',
};

const TIER_COLORS = [
  { max: 0.25, bg: '#f0e9d6', fg: '#6b7d72', label: '0–25%' },
  { max: 0.50, bg: '#c9d5a0', fg: '#3d5a1f', label: '25–50%' },
  { max: 0.75, bg: '#8fb070', fg: '#1a2d10', label: '50–75%' },
  { max: 1.01, bg: '#2d5239', fg: '#dde839', label: '75–100%' },
];

const VALID_STATUS = new Set(['Checked out', 'Checked in', 'Confirmed', 'Started', 'Processed']);

const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const WEEKDAYS_ES = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

function pad2(n) { return String(n).padStart(2, '0'); }
function dayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function isSameYMD(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Aggregate reservations into per-day occupancy/arrivals/departures for a given month.
 * A reservation occupies the day if arrival.dateOnly <= D < departure.dateOnly.
 * Times are interpreted in the client's local zone (assumed Europe/Madrid for the property).
 */
function getMonthlyData(reservations, year, month, capacity) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const valid = reservations.filter(r =>
    r && VALID_STATUS.has(r.status)
    && r.arrival && !isNaN(r.arrival.getTime())
    && r.departure && !isNaN(r.departure.getTime())
  );

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    let occupancy = 0, arrivals = 0, departures = 0;
    for (const r of valid) {
      const arrDay = new Date(r.arrival.getFullYear(), r.arrival.getMonth(), r.arrival.getDate());
      const depDay = new Date(r.departure.getFullYear(), r.departure.getMonth(), r.departure.getDate());
      if (date >= arrDay && date < depDay) occupancy++;
      if (isSameYMD(date, arrDay)) arrivals++;
      if (isSameYMD(date, depDay)) departures++;
    }
    const pct = capacity > 0 ? occupancy / capacity : 0;
    days.push({ day: d, date, occupancy, arrivals, departures, pct });
  }
  return days;
}

function tierFor(pct) {
  for (const t of TIER_COLORS) if (pct <= t.max) return t;
  return TIER_COLORS[TIER_COLORS.length - 1];
}

export default function MonthlyView({ reservations = [], capacity = 42, now = new Date(), error, configured }) {
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const days = useMemo(
    () => getMonthlyData(reservations, year, month, capacity),
    [reservations, year, month, capacity]
  );

  const totals = useMemo(() => {
    const sumOcc = days.reduce((a, d) => a + d.occupancy, 0);
    const totalCapNights = capacity * days.length;
    const occPct = totalCapNights > 0 ? sumOcc / totalCapNights : 0;
    const arrivals = days.reduce((a, d) => a + d.arrivals, 0);
    const departures = days.reduce((a, d) => a + d.departures, 0);
    let peak = days[0] || { pct: 0, day: 1 };
    for (const d of days) if (d.pct > peak.pct) peak = d;
    return { sumOcc, totalCapNights, occPct, arrivals, departures, peak };
  }, [days, capacity]);

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => setCursor(new Date(now.getFullYear(), now.getMonth(), 1));

  // First weekday of month, Monday-first (0 = Mon, 6 = Sun)
  const firstWeekday = (() => {
    const js = new Date(year, month, 1).getDay();
    return js === 0 ? 6 : js - 1;
  })();
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...days,
  ];
  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = `${MONTH_NAMES_ES[month]} ${year}`.toUpperCase();
  const todayKey = dayKey(now);
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;

  return (
    <div className="mv-page" style={{ padding: '32px 32px 80px', maxWidth: 1280, margin: '0 auto' }}>
      <style>{`
        .mv-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .mv-weekday-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 8px; }
        .mv-calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .mv-cell-weekday-inline { display: none; }
        .mv-cell-bottom { margin-top: auto; }
        @media (max-width: 760px) {
          .mv-page { padding: 20px 16px 60px !important; }
          .mv-header-title { font-size: 38px !important; }
          .mv-header-nav { width: 100%; justify-content: space-between; }
          .mv-kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .mv-kpi-value { font-size: 32px !important; }
          .mv-weekday-row { display: none; }
          .mv-calendar-grid { grid-template-columns: 1fr; gap: 6px; }
          .mv-cell { flex-direction: row !important; align-items: center; min-height: 52px !important; padding: 10px 14px !important; gap: 12px; }
          .mv-cell-top { flex: 1; align-items: center !important; }
          .mv-cell-day { font-size: 16px !important; }
          .mv-cell-bottom { margin-top: 0 !important; }
          .mv-cell-weekday-inline { display: inline; opacity: 0.6; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; margin-right: 8px; text-transform: uppercase; }
          .mv-cell-pct { font-size: 13px !important; margin-right: 4px; }
          .mv-pad { display: none; }
        }
      `}</style>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
        <div>
          <h1 className="display mv-header-title" style={{ fontSize: 56, lineHeight: 0.95, color: C.ink, marginBottom: 6 }}>
            Vista mensual
          </h1>
          <div className="eyebrow" style={{ opacity: 0.65 }}>
            OCUPACIÓN · LLEGADAS · {monthLabel}
          </div>
        </div>
        <div className="mv-header-nav" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={goPrev} className="btn secondary sm" style={{ padding: '8px 12px' }} aria-label="Mes anterior">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3 L4 8 L10 13" /></svg>
          </button>
          <button onClick={goToday} className="btn secondary sm" style={{ minWidth: 110 }}>
            {monthLabel}
          </button>
          <button onClick={goNext} className="btn secondary sm" style={{ padding: '8px 12px' }} aria-label="Mes siguiente">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3 L12 8 L6 13" /></svg>
          </button>
          <button
            onClick={() => { if (typeof window !== 'undefined') window.location.hash = '#/dashboard'; }}
            className="btn secondary sm"
            style={{ marginLeft: 8 }}
          >
            ← Semana
          </button>
        </div>
      </header>

      {/* Configured / error states */}
      {!configured && (
        <div className="tile" style={{ padding: 24, marginBottom: 24, background: C.cream }}>
          <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginBottom: 8 }}>Bridge no configurado</div>
          <p style={{ fontSize: 14, lineHeight: 1.55 }}>
            Esta vista lee de la fuente <strong>Mews Bridge</strong>. Configura la URL y la clave en{' '}
            <code style={{ background: C.amarillo, padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>#admin</code>.
          </p>
        </div>
      )}
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(162,58,42,0.08)', border: '1.5px solid rgba(162,58,42,0.4)', color: '#A23A2A', fontSize: 13, marginBottom: 24 }}>
          <strong style={{ letterSpacing: '0.06em' }}>Error al leer Bridge:</strong> {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="mv-kpi-grid">
        <KPI
          label="Ocupación mes"
          value={`${Math.round(totals.occPct * 100)}%`}
          sub={`${totals.sumOcc} / ${totals.totalCapNights} noches`}
        />
        <KPI
          label="Llegadas mes"
          value={String(totals.arrivals)}
          sub={totals.arrivals === 1 ? 'reserva' : 'reservas'}
        />
        <KPI
          label="Salidas mes"
          value={String(totals.departures)}
          sub={totals.departures === 1 ? 'reserva' : 'reservas'}
        />
        <KPI
          label="Pico ocupación"
          value={`${Math.round((totals.peak.pct || 0) * 100)}%`}
          sub={totals.peak.day ? `día ${totals.peak.day}` : '—'}
        />
      </div>

      {/* Calendar */}
      <div className="tile" style={{ padding: 20 }}>
        {/* Weekday headers (desktop only) */}
        <div className="mv-weekday-row">
          {WEEKDAYS_ES.map((w) => (
            <div key={w} className="eyebrow eyebrow-sm" style={{ opacity: 0.6, textAlign: 'center', padding: '4px 0' }}>
              {w}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="mv-calendar-grid">
          {cells.map((d, idx) => {
            if (!d) return <div key={`pad-${idx}`} className="mv-pad" style={{ minHeight: 86 }} />;
            const tier = tierFor(d.pct);
            const isToday = isCurrentMonth && isSameYMD(d.date, now);
            const hasActivity = d.arrivals > 0 || d.departures > 0;
            const weekdayIdx = (d.date.getDay() + 6) % 7;
            return (
              <button
                key={d.day}
                className="mv-cell"
                onClick={() => setSelectedDay(d)}
                style={{
                  background: tier.bg,
                  color: tier.fg,
                  borderRadius: 12,
                  padding: '8px 10px',
                  minHeight: 86,
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: isToday ? `0 0 0 2px ${C.amarillo}` : 'none',
                  transition: 'transform 120ms ease, box-shadow 120ms ease',
                  position: 'relative',
                  border: 'none',
                  textAlign: 'left',
                  font: 'inherit',
                  cursor: hasActivity ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => { if (hasActivity && !isToday) e.currentTarget.style.boxShadow = `0 0 0 1.5px ${C.ink}`; }}
                onMouseLeave={(e) => { if (!isToday) e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div className="mv-cell-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span className="mv-cell-weekday-inline">{WEEKDAYS_ES[weekdayIdx]}</span>
                    <span className="display mv-cell-day" style={{ fontSize: 18, lineHeight: 1 }}>{d.day}</span>
                  </span>
                  <span className="tabular mv-cell-pct" style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
                    {Math.round(d.pct * 100)}%
                  </span>
                </div>
                <div className="mv-cell-bottom" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {d.arrivals > 0 && (
                    <span style={{ background: C.amarillo, color: C.ink, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.04em' }}>
                      ↓{d.arrivals}
                    </span>
                  )}
                  {d.departures > 0 && (
                    <span style={{ background: C.celeste, color: C.ink, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.04em' }}>
                      ↑{d.departures}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <span className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>Ocupación:</span>
        {TIER_COLORS.map((t) => (
          <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: t.bg, border: `1px solid ${C.ink15}` }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>{t.label}</span>
          </div>
        ))}
        <span style={{ width: 1, height: 18, background: C.ink15, margin: '0 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ background: C.amarillo, color: C.ink, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999 }}>↓N</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7 }}>Llegadas</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ background: C.celeste, color: C.ink, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999 }}>↑N</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7 }}>Salidas</span>
        </div>
      </div>

      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          reservations={reservations}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function DayDetailModal({ day, reservations, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const arrivals = useMemo(() => reservations.filter(r =>
    r && VALID_STATUS.has(r.status)
    && r.arrival && !isNaN(r.arrival.getTime())
    && isSameYMD(r.arrival, day.date)
  ).sort((a, b) => a.arrival - b.arrival), [reservations, day.date]);

  const departures = useMemo(() => reservations.filter(r =>
    r && VALID_STATUS.has(r.status)
    && r.departure && !isNaN(r.departure.getTime())
    && isSameYMD(r.departure, day.date)
  ).sort((a, b) => a.departure - b.departure), [reservations, day.date]);

  const dateLabel = day.date.toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(33,57,44,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 24,
        animation: 'fadeIn 160ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tile"
        style={{
          maxWidth: 720, width: '100%',
          maxHeight: '85vh', overflow: 'auto',
          padding: 32, background: C.cream,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16 }}>
          <div>
            <div className="eyebrow eyebrow-sm" style={{ opacity: 0.65 }}>{dateLabel.toUpperCase()}</div>
            <h2 className="display" style={{ fontSize: 40, lineHeight: 1, marginTop: 6 }}>
              {arrivals.length + departures.length} {arrivals.length + departures.length === 1 ? 'movimiento' : 'movimientos'}
            </h2>
            <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginTop: 6 }}>
              Ocupación {Math.round(day.pct * 100)}% · {day.occupancy} en casa
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 36, height: 36, borderRadius: 999,
              border: `1.5px solid ${C.ink}`, background: 'transparent',
              cursor: 'pointer', fontSize: 16, fontWeight: 700, color: C.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
          <DaySection
            title="Llegadas"
            count={arrivals.length}
            pillBg={C.amarillo}
            arrow="↓"
            items={arrivals}
            timeKey="arrival"
          />
          <DaySection
            title="Salidas"
            count={departures.length}
            pillBg={C.celeste}
            arrow="↑"
            items={departures}
            timeKey="departure"
          />
        </div>
      </div>
    </div>
  );
}

function DaySection({ title, count, pillBg, arrow, items, timeKey }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ background: pillBg, color: C.ink, fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 999, letterSpacing: '0.05em' }}>
          {arrow} {count}
        </span>
        <span className="eyebrow eyebrow-sm" style={{ opacity: 0.75 }}>{title.toUpperCase()}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, opacity: 0.5, fontStyle: 'italic', padding: '8px 0' }}>Sin movimientos</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((r) => {
            const t = r[timeKey];
            const time = t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const spaceLabel = [r.spaceCategory, r.spaceNumber].filter(Boolean).join(' · ');
            return (
              <div
                key={`${r.number}-${timeKey}`}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1px solid ${C.ink15}`,
                  background: 'rgba(255,255,255,0.4)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{r.customer || `Reserva #${r.number}`}</span>
                  <span className="tabular" style={{ fontSize: 12, opacity: 0.65 }}>{time}</span>
                </div>
                {(spaceLabel || r.nights) && (
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4, letterSpacing: '0.02em' }}>
                    {spaceLabel}
                    {spaceLabel && r.nights ? ' · ' : ''}
                    {r.nights ? `${r.nights} ${r.nights === 1 ? 'noche' : 'noches'}` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, sub }) {
  return (
    <div className="tile dark" style={{ padding: 20 }}>
      <div className="eyebrow eyebrow-sm" style={{ opacity: 0.7 }}>{label}</div>
      <div className="display tabular mv-kpi-value" style={{ fontSize: 44, lineHeight: 1, marginTop: 8, color: C.amarillo }}>
        {value}
      </div>
      {sub && (
        <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}

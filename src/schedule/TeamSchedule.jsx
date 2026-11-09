import { useState, useEffect, useMemo } from 'react';
import { getMonthlyData, tierFor } from '../MonthlyView.jsx';
import useSchedule, { cellKey, ymd, shiftHours, fmtHours } from './useSchedule.js';

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

const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAYS_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const WEEKDAYS_MON_FIRST = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const WEEKDAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Shift kinds. 'turno' carries hours; the rest are full-day absences.
export const KINDS = {
  turno:      { label: 'Trabajo',    bg: C.celeste,     fg: C.ink },
  vacaciones: { label: 'Vacaciones', bg: C.amarillo,    fg: C.ink },
  libre:      { label: 'Libre',      bg: 'transparent', fg: C.ink, border: true },
  baja:       { label: 'Baja',       bg: C.brick,       fg: C.cream },
};

const PRESETS = [
  { label: 'Mañana',   start: '08:00', end: '15:00' },
  { label: 'Tarde',    start: '14:00', end: '21:00' },
  { label: 'Completo', start: '09:00', end: '18:00' },
];

function pad2(n) { return String(n).padStart(2, '0'); }
const fromKey = (k) => new Date(k + 'T12:00:00');
const shortDate = (k) => { const d = fromKey(k); return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}`; };

function memberStats(member, monthDays, getShift) {
  const stats = { worked: 0, hours: 0, vacaciones: 0, libre: 0, baja: 0 };
  for (const d of monthDays) {
    const s = getShift(ymd(d.date), member);
    if (!s) continue;
    if (s.kind === 'turno') { stats.worked++; stats.hours += shiftHours(s); }
    else if (stats[s.kind] != null) stats[s.kind]++;
  }
  return stats;
}

export default function TeamSchedule({ reservations = [], capacity = 42, now = new Date(), hubspotUrl, hubspotKey, bridgeError }) {
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [editing, setEditing] = useState(null);  // { date, member }
  const [openMember, setOpenMember] = useState(null);
  const [newMember, setNewMember] = useState('');
  const sch = useSchedule(hubspotUrl, hubspotKey);
  const { getShift, writeShift, error, setError, loading, saving } = sch;

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthPrefix = `${year}-${pad2(month + 1)}-`;

  const days = useMemo(
    () => getMonthlyData(reservations, year, month, capacity),
    [reservations, year, month, capacity]
  );
  const members = useMemo(() => sch.membersFor(monthPrefix), [sch, monthPrefix]);
  const statsBy = useMemo(() => {
    const out = {};
    for (const m of members) out[m] = memberStats(m, days, getShift);
    return out;
  }, [members, days, getShift]);

  const totals = useMemo(() => {
    const sumOcc = days.reduce((a, d) => a + d.occupancy, 0);
    const capNights = capacity * days.length;
    return {
      occPct: capNights > 0 ? sumOcc / capNights : 0,
      arrivals: days.reduce((a, d) => a + d.arrivals, 0),
      departures: days.reduce((a, d) => a + d.departures, 0),
      transports: days.reduce((a, d) => a + d.pickups + d.dropoffs, 0),
    };
  }, [days, capacity]);

  const addMember = () => {
    const name = newMember.trim();
    setNewMember('');
    if (!name || members.some((m) => m.toLowerCase() === name.toLowerCase())) return;
    sch.addMember(name);
    setOpenMember(name);
  };

  const removeMember = (name) => {
    if (!window.confirm(`¿Quitar a ${name} del equipo? Sus días ya guardados se mantienen.`)) return;
    if (openMember === name) setOpenMember(null);
    sch.removeMember(name);
  };

  const monthLabel = `${MONTH_NAMES_ES[month]} ${year}`.toUpperCase();
  const todayKey = ymd(now);

  return (
    <div className="ts-page" style={{ padding: '32px 32px 80px', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .ts-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
        .ts-table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 13px; }
        .ts-table th, .ts-table td { padding: 6px 8px; border-bottom: 1px solid ${C.ink08}; text-align: center; white-space: nowrap; }
        .ts-table thead th { position: sticky; top: 0; background: ${C.cream}; z-index: 2; border-bottom: 1.5px solid ${C.ink}; vertical-align: bottom; }
        .ts-table .ts-day { position: sticky; left: 0; background: ${C.cream}; z-index: 1; text-align: left; }
        .ts-table thead .ts-day { z-index: 3; }
        .ts-table tr.ts-weekend td { background: ${C.ink08}; }
        .ts-table tr.ts-weekend td.ts-day { background: #dcdacf; }
        .ts-table tr.ts-today td { box-shadow: inset 0 2px 0 ${C.amarillo}, inset 0 -2px 0 ${C.amarillo}; }
        .ts-table .ts-sep { border-left: 1.5px solid ${C.ink15}; }
        .ts-cell-btn { width: 100%; min-width: 96px; min-height: 30px; border-radius: 8px; border: 1.5px dashed transparent; background: transparent; font: inherit; font-size: 12px; cursor: pointer; color: ${C.ink}; padding: 4px 6px; }
        .ts-cell-btn.empty { opacity: 0.25; }
        .ts-cell-btn.empty:hover { opacity: 0.8; border-color: ${C.ink15}; }
        .ts-cell-btn:hover { box-shadow: 0 0 0 1.5px ${C.ink}; }
        .ts-input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1.5px solid ${C.ink}; border-radius: 8px; background: #fff; color: ${C.ink}; }
        .ts-person-row { display: grid; grid-template-columns: 1fr repeat(3, 110px) 32px; align-items: center; gap: 8px; padding: 14px 18px; background: transparent; border: none; border-top: 1px solid ${C.ink15}; width: 100%; font: inherit; color: ${C.ink}; text-align: left; cursor: pointer; }
        .ts-person-row:hover { background: ${C.ink08}; }
        .ts-person-row.open { background: ${C.ink}; color: ${C.cream}; }
        .ts-stat-num { font-weight: 700; font-size: 15px; }
        .ts-stat-lbl { font-size: 10px; letter-spacing: 0.14em; opacity: 0.6; text-transform: uppercase; }
        .ts-panel { border-top: 1px solid ${C.ink}; padding: 22px 18px 26px; background: #f3f1e8; display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: 28px; }
        .ts-mini-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .ts-mini-day { aspect-ratio: 1 / 1; border-radius: 8px; border: 1.5px solid ${C.ink15}; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; padding: 0; }
        .ts-mini-day.sel { outline: 3px solid ${C.ink}; outline-offset: 1px; }
        .ts-list { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ts-list td, .ts-list th { padding: 7px 6px; border-bottom: 1px solid ${C.ink08}; text-align: left; }
        .ts-list th { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.6; font-weight: 700; }
        .ts-list tr.ts-click { cursor: pointer; }
        .ts-list tr.ts-click:hover td { background: ${C.ink08}; }
        .ts-x { background: none; border: none; cursor: pointer; color: ${C.ink}; opacity: 0.5; font-size: 15px; padding: 0 4px; }
        .ts-x:hover { opacity: 1; color: ${C.brick}; }
        @media (max-width: 760px) {
          .ts-page { padding: 20px 12px 60px !important; }
          .ts-title { font-size: 38px !important; }
          .ts-kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .ts-kpi-value { font-size: 30px !important; }
          .ts-person-row { grid-template-columns: 1fr repeat(2, 64px) 24px; padding: 12px; }
          .ts-person-row .ts-hide-sm { display: none; }
          .ts-panel { grid-template-columns: 1fr; padding: 16px 12px 20px; }
          .ts-modal-overlay { padding: 0 !important; align-items: flex-end !important; }
          .ts-modal-card { border-radius: 18px 18px 0 0 !important; padding-bottom: calc(20px + env(safe-area-inset-bottom)) !important; }
        }
      `}</style>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="display ts-title" style={{ fontSize: 56, lineHeight: 0.95, color: C.ink, marginBottom: 6 }}>Horario equipo</h1>
          <div className="eyebrow" style={{ opacity: 0.65 }}>
            TURNOS · OCUPACIÓN · {monthLabel}
            {(loading || saving > 0) && <span style={{ marginLeft: 10, opacity: 0.8 }}>· {saving > 0 ? 'guardando…' : 'cargando…'}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="btn secondary sm" style={{ padding: '8px 12px' }} aria-label="Mes anterior">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3 L4 8 L10 13" /></svg>
          </button>
          <button onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))} className="btn secondary sm" style={{ minWidth: 130 }}>{monthLabel}</button>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="btn secondary sm" style={{ padding: '8px 12px' }} aria-label="Mes siguiente">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3 L12 8 L6 13" /></svg>
          </button>
          <button onClick={sch.reload} className="btn secondary sm" disabled={loading} style={{ marginLeft: 8 }}>Recargar</button>
        </div>
      </header>

      {!hubspotUrl && (
        <div className="tile" style={{ padding: 20, marginBottom: 20 }}>
          <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginBottom: 6 }}>HubSpot bridge no configurado</div>
          <p style={{ fontSize: 14 }}>Los turnos se guardan en la pestaña <strong>Schedule</strong> de la hoja de HubSpot. Configura la URL y la clave en <code>#admin</code>.</p>
        </div>
      )}
      {(error || bridgeError) && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(162,58,42,0.08)', border: '1.5px solid rgba(162,58,42,0.4)', color: C.brick, fontSize: 13, marginBottom: 20, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{error || `Error al leer Bridge (ocupación): ${bridgeError}`}</span>
          {error && <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: C.brick, cursor: 'pointer', fontWeight: 700 }} aria-label="Cerrar">×</button>}
        </div>
      )}

      <div className="ts-kpi-grid">
        <KPI label="Ocupación mes" value={`${Math.round(totals.occPct * 100)}%`} />
        <KPI label="Check-ins" value={String(totals.arrivals)} />
        <KPI label="Check-outs" value={String(totals.departures)} />
        <KPI label="Transportes" value={String(totals.transports)} sub="ida + vuelta" />
      </div>

      {/* Team list — click a person to open their month */}
      <div className="tile" style={{ padding: 0, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '16px 18px' }}>
          <div>
            <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>Equipo</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>Pulsa tu nombre para gestionar tus días de {MONTH_NAMES_ES[month]}.</div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); addMember(); }} style={{ display: 'flex', gap: 6 }}>
            <input className="ts-input" value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Nombre" style={{ width: 150, padding: '6px 10px', fontSize: 13 }} disabled={!hubspotUrl} />
            <button type="submit" className="btn sm" disabled={!hubspotUrl || !newMember.trim()}>Añadir</button>
          </form>
        </div>
        {members.length === 0 && (
          <div style={{ padding: '14px 18px', borderTop: `1px solid ${C.ink15}`, fontSize: 13, opacity: 0.6 }}>Todavía no hay nadie. Añade a las personas del equipo arriba.</div>
        )}
        {members.map((m) => {
          const st = statsBy[m];
          const open = openMember === m;
          return (
            <div key={m}>
              <button className={`ts-person-row${open ? ' open' : ''}`} onClick={() => setOpenMember(open ? null : m)} aria-expanded={open}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{m}</span>
                <span><span className="ts-stat-num">{st.worked}</span> <span className="ts-stat-lbl">días</span></span>
                <span><span className="ts-stat-num">{fmtHours(st.hours)}</span></span>
                <span className="ts-hide-sm"><span className="ts-stat-num">{st.vacaciones}</span> <span className="ts-stat-lbl">vacac.</span></span>
                <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms', justifySelf: 'end' }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3 L12 8 L6 13" /></svg>
                </span>
              </button>
              {open && (
                <PersonPanel
                  member={m}
                  year={year}
                  month={month}
                  monthDays={days}
                  stats={st}
                  todayKey={todayKey}
                  getShift={getShift}
                  writeShifts={sch.writeShifts}
                  onPrevMonth={() => setCursor(new Date(year, month - 1, 1))}
                  onNextMonth={() => setCursor(new Date(year, month + 1, 1))}
                  onEdit={(date) => setEditing({ date, member: m })}
                  onRemove={() => removeMember(m)}
                  disabled={!hubspotUrl}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Month grid: one row per day, everyone side by side */}
      <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, margin: '0 0 8px 4px' }}>Vista general del mes</div>
      <div className="tile" style={{ padding: 0, overflow: 'auto', maxHeight: '75vh' }}>
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-day">Día</th>
              <th title="Check-ins (llegadas)">Check-in</th>
              <th title="Check-outs (salidas)">Check-out</th>
              <th title="Ocupación">Occ%</th>
              <th title="Transporte ida (recogida) / vuelta (entrega)">Transp.</th>
              <th title="Personas trabajando" className="ts-sep">Equipo</th>
              {members.map((m, i) => (
                <th key={m} className={i === 0 ? 'ts-sep' : undefined}>
                  <div style={{ fontWeight: 700 }}>{m}</div>
                  <div style={{ fontSize: 10, opacity: 0.55, fontWeight: 400 }}>
                    {statsBy[m].worked} días · {fmtHours(statsBy[m].hours)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const key = ymd(d.date);
              const dow = d.date.getDay();
              const tier = tierFor(d.pct);
              const working = members.filter((m) => getShift(key, m)?.kind === 'turno').length;
              const busy = d.arrivals + d.departures + d.pickups + d.dropoffs > 0 || d.occupancy > 0;
              const understaffed = members.length > 0 && working === 0 && busy;
              const cls = [dow === 0 || dow === 6 ? 'ts-weekend' : '', key === todayKey ? 'ts-today' : ''].join(' ').trim();
              return (
                <tr key={key} className={cls || undefined}>
                  <td className="ts-day">
                    <span className="tabular" style={{ fontWeight: 700, display: 'inline-block', minWidth: 20 }}>{d.day}</span>
                    <span style={{ fontSize: 10, letterSpacing: '0.1em', opacity: 0.6, marginLeft: 6 }}>{WEEKDAYS_SHORT[dow]}</span>
                  </td>
                  <td className="tabular">{d.arrivals || <span style={{ opacity: 0.25 }}>0</span>}</td>
                  <td className="tabular">{d.departures || <span style={{ opacity: 0.25 }}>0</span>}</td>
                  <td>
                    <span className="tabular" style={{ background: tier.bg, color: tier.fg, borderRadius: 6, padding: '2px 7px', fontWeight: 700, fontSize: 12 }}>
                      {Math.round(d.pct * 100)}%
                    </span>
                  </td>
                  <td className="tabular" title={`Ida ${d.pickups} · Vuelta ${d.dropoffs}`}>
                    {d.pickups + d.dropoffs === 0
                      ? <span style={{ opacity: 0.25 }}>—</span>
                      : <span>{d.pickups}<span style={{ opacity: 0.4 }}>↗</span> {d.dropoffs}<span style={{ opacity: 0.4 }}>↘</span></span>}
                  </td>
                  <td className="ts-sep tabular" style={{ fontWeight: 700, color: understaffed ? C.brick : C.ink }} title={understaffed ? 'Nadie asignado con actividad ese día' : undefined}>
                    {understaffed ? '⚠ 0' : working}
                  </td>
                  {members.map((m, i) => (
                    <td key={m} className={i === 0 ? 'ts-sep' : undefined}>
                      <ShiftButton shift={getShift(key, m)} disabled={!hubspotUrl} onClick={() => setEditing({ date: key, member: m })} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, fontSize: 11, opacity: 0.7 }}>
        <span>↗ transporte ida (recogida) · ↘ vuelta (entrega)</span>
        <span>Check-in / Check-out / Occ% / Transp. vienen de Mews (igual que Vista mensual)</span>
        <span style={{ color: C.brick }}>⚠ día con actividad y nadie trabajando</span>
      </div>

      {editing && (
        <ShiftEditor
          date={editing.date}
          member={editing.member}
          shift={getShift(editing.date, editing.member)}
          onClose={() => setEditing(null)}
          onSave={(s) => { writeShift(editing.date, editing.member, s); setEditing(null); }}
          onClear={() => { writeShift(editing.date, editing.member, null); setEditing(null); }}
        />
      )}
    </div>
  );
}

/* ----------------------- One person's month ----------------------- */

function PersonPanel({ member, year, month, monthDays, stats, todayKey, getShift, writeShifts, onPrevMonth, onNextMonth, onEdit, onRemove, disabled }) {
  const mes = MONTH_NAMES_ES[month];
  const [selected, setSelected] = useState(() => new Set());
  const [kind, setKind] = useState('turno');
  const [start, setStart] = useState(PRESETS[0].start);
  const [end, setEnd] = useState(PRESETS[0].end);

  // Selection is per month — clear it when the month changes.
  useEffect(() => { setSelected(new Set()); }, [year, month]);

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const keys = monthDays.map((d) => ymd(d.date));

  const entries = keys.map((k) => ({ key: k, shift: getShift(k, member) })).filter((e) => e.shift);
  const work = entries.filter((e) => e.shift.kind === 'turno');
  const away = entries.filter((e) => e.shift.kind !== 'turno');

  const toggle = (k) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const selectWeekdays = () => setSelected(new Set(keys.filter((k) => {
    const dow = fromKey(k).getDay();
    return dow !== 0 && dow !== 6;
  })));

  const apply = (shift) => {
    const items = [...selected].sort().map((date) => ({ date, member, shift }));
    writeShifts(items);
    setSelected(new Set());
  };

  const validTimes = kind !== 'turno' || (start && end);
  const newShift = () => ({ kind, start: kind === 'turno' ? start : '', end: kind === 'turno' ? end : '', note: '' });

  return (
    <div className="ts-panel">
      {/* Left: calendar to pick days */}
      <div>
        {/* The month this panel edits — every day is saved to this month only. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.ink, color: C.cream, borderRadius: 12, padding: '6px 6px', marginBottom: 6 }}>
          <button type="button" onClick={onPrevMonth} aria-label="Mes anterior" style={{ background: 'none', border: 'none', color: C.cream, cursor: 'pointer', padding: '6px 10px' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3 L4 8 L10 13" /></svg>
          </button>
          <span className="display" style={{ fontSize: 22, lineHeight: 1, color: C.amarillo, textTransform: 'capitalize' }}>{mes} {year}</span>
          <button type="button" onClick={onNextMonth} aria-label="Mes siguiente" style={{ background: 'none', border: 'none', color: C.cream, cursor: 'pointer', padding: '6px 10px' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3 L12 8 L6 13" /></svg>
          </button>
        </div>
        <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 14 }}>
          Los días se guardan solo para {mes}. Cada mes se rellena aparte: cambia de mes con las flechas.
        </div>

        <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginBottom: 8 }}>1 · Elige tus días de {mes}</div>
        <div className="ts-mini-grid" style={{ marginBottom: 4 }}>
          {WEEKDAYS_MON_FIRST.map((w) => <div key={w} style={{ fontSize: 9, letterSpacing: '0.12em', textAlign: 'center', opacity: 0.55 }}>{w}</div>)}
        </div>
        <div className="ts-mini-grid">
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`p${i}`} />)}
          {keys.map((k) => {
            const s = getShift(k, member);
            const def = s ? (KINDS[s.kind] || KINDS.turno) : null;
            return (
              <button
                key={k}
                type="button"
                className={`ts-mini-day${selected.has(k) ? ' sel' : ''}`}
                onClick={() => toggle(k)}
                disabled={disabled}
                title={s ? `${def.label}${s.start ? ` ${s.start}–${s.end}` : ''}` : 'Sin asignar'}
                style={{
                  background: def ? (def.border ? '#fff' : def.bg) : 'transparent',
                  color: def ? def.fg : C.ink,
                  borderColor: k === todayKey ? C.ink : (def && !def.border ? 'transparent' : C.ink15),
                }}
              >
                {fromKey(k).getDate()}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', fontSize: 12 }}>
          <button type="button" className="pastilla outline" style={{ cursor: 'pointer' }} onClick={selectWeekdays}>Marcar todos los lun–vie de {mes}</button>
          {selected.size > 0 && <button type="button" className="pastilla outline" style={{ cursor: 'pointer' }} onClick={() => setSelected(new Set())}>Quitar selección</button>}
        </div>

        <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, margin: '18px 0 8px' }}>2 · ¿Qué son? ({selected.size} {selected.size === 1 ? 'día' : 'días'})</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {Object.entries(KINDS).map(([k, def]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`btn sm ${kind === k ? '' : 'secondary'}`}>{def.label}</button>
          ))}
        </div>
        {kind === 'turno' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => { setStart(p.start); setEnd(p.end); }}
                  className="pastilla outline" style={{ cursor: 'pointer', background: start === p.start && end === p.end ? C.celeste : 'transparent' }}>
                  {p.label} {p.start}–{p.end}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
              <label style={{ fontSize: 12 }}>Entrada<br /><input type="time" className="ts-input" value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <label style={{ fontSize: 12 }}>Salida<br /><input type="time" className="ts-input" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
              <span style={{ fontSize: 12, opacity: 0.6, paddingBottom: 10 }}>{fmtHours(shiftHours({ kind, start, end }))}</span>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm" disabled={disabled || selected.size === 0 || !validTimes} onClick={() => apply(newShift())}>
            Guardar {selected.size || ''} {selected.size === 1 ? 'día' : 'días'} de {mes}
          </button>
          <button className="btn danger sm" disabled={disabled || selected.size === 0} onClick={() => apply(null)}>Borrar días</button>
        </div>
      </div>

      {/* Right: the lists + totals */}
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginBottom: 6 }}>Días de trabajo en {mes} · {work.length}</div>
        {work.length === 0
          ? <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 20 }}>Ningún día de trabajo en {mes} todavía.</div>
          : (
            <table className="ts-list" style={{ marginBottom: 22 }}>
              <thead><tr><th>Día</th><th>Horario</th><th>Nota</th><th style={{ textAlign: 'right' }}>Horas</th><th /></tr></thead>
              <tbody>
                {work.map(({ key, shift }) => (
                  <tr key={key} className="ts-click" onClick={() => onEdit(key)}>
                    <td style={{ fontWeight: 700 }}>{shortDate(key)}</td>
                    <td className="tabular">{shift.start}–{shift.end}</td>
                    <td style={{ opacity: 0.7, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shift.note}</td>
                    <td className="tabular" style={{ textAlign: 'right' }}>{fmtHours(shiftHours(shift))}</td>
                    <td style={{ width: 24 }}><button className="ts-x" aria-label="Borrar" onClick={(e) => { e.stopPropagation(); writeShifts([{ date: key, member, shift: null }]); }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginBottom: 6 }}>Vacaciones y ausencias en {mes} · {away.length}</div>
        {away.length === 0
          ? <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 20 }}>Sin vacaciones ni días libres en {mes}.</div>
          : (
            <table className="ts-list" style={{ marginBottom: 22 }}>
              <tbody>
                {away.map(({ key, shift }) => {
                  const def = KINDS[shift.kind] || KINDS.libre;
                  return (
                    <tr key={key} className="ts-click" onClick={() => onEdit(key)}>
                      <td style={{ fontWeight: 700, width: 90 }}>{shortDate(key)}</td>
                      <td><span className="pastilla" style={{ background: def.border ? 'transparent' : def.bg, color: def.fg, border: def.border ? `1.5px solid ${C.ink}` : 'none' }}>{def.label}</span></td>
                      <td style={{ opacity: 0.7 }}>{shift.note}</td>
                      <td style={{ width: 24 }}><button className="ts-x" aria-label="Borrar" onClick={(e) => { e.stopPropagation(); writeShifts([{ date: key, member, shift: null }]); }}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

        {/* Month summary */}
        <div className="tile dark" style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end' }}>
          <div className="eyebrow eyebrow-sm" style={{ color: C.amarillo, width: '100%', marginBottom: -12 }}>Resumen de {mes} {year}</div>
          <Summary label="Días trabajados" value={stats.worked} />
          <Summary label="Horas" value={fmtHours(stats.hours)} />
          <Summary label="Vacaciones" value={stats.vacaciones} />
          <Summary label="Libres" value={stats.libre} />
          {stats.baja > 0 && <Summary label="Baja" value={stats.baja} />}
          <button className="btn danger sm" style={{ marginLeft: 'auto', borderColor: C.cream, color: C.cream }} onClick={onRemove}>Quitar del equipo</button>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }) {
  return (
    <div>
      <div className="eyebrow eyebrow-sm" style={{ color: C.cream, opacity: 0.65 }}>{label}</div>
      <div className="display tabular" style={{ fontSize: 30, lineHeight: 1, marginTop: 4, color: C.amarillo }}>{value}</div>
    </div>
  );
}

/* ----------------------- Single-cell editor ----------------------- */

function ShiftButton({ shift, onClick, disabled }) {
  if (!shift) {
    return <button className="ts-cell-btn empty" onClick={onClick} disabled={disabled} aria-label="Añadir turno">+</button>;
  }
  const k = KINDS[shift.kind] || KINDS.turno;
  const text = shift.kind === 'turno' && shift.start ? `${shift.start}–${shift.end || '?'}` : k.label;
  return (
    <button
      className="ts-cell-btn"
      onClick={onClick}
      disabled={disabled}
      title={shift.note || undefined}
      style={{ background: k.bg, color: k.fg, border: k.border ? `1.5px solid ${C.ink15}` : '1.5px solid transparent', fontWeight: 600 }}
    >
      {text}{shift.note ? ' ·' : ''}
    </button>
  );
}

function ShiftEditor({ date, member, shift, onClose, onSave, onClear }) {
  const [kind, setKind] = useState(shift?.kind || 'turno');
  const [start, setStart] = useState(shift?.start || PRESETS[0].start);
  const [end, setEnd] = useState(shift?.end || PRESETS[0].end);
  const [note, setNote] = useState(shift?.note || '');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const d = fromKey(date);
  const title = `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTH_NAMES_ES[d.getMonth()]}`;
  const current = () => ({ kind, start: kind === 'turno' ? start : '', end: kind === 'turno' ? end : '', note: note.trim() });
  const valid = kind !== 'turno' || (start && end);

  return (
    <div className="ts-modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(33,57,44,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="ts-modal-card tile" onClick={(e) => e.stopPropagation()} style={{ background: C.cream, padding: 24, width: '100%', maxWidth: 420, borderRadius: 18 }}>
        <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>{member}</div>
        <h2 className="display" style={{ fontSize: 32, lineHeight: 1, margin: '4px 0 16px' }}>{title}</h2>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {Object.entries(KINDS).map(([k, def]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`btn sm ${kind === k ? '' : 'secondary'}`}>{def.label}</button>
          ))}
        </div>

        {kind === 'turno' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => { setStart(p.start); setEnd(p.end); }}
                  className="pastilla outline" style={{ cursor: 'pointer', background: start === p.start && end === p.end ? C.celeste : 'transparent' }}>
                  {p.label} {p.start}–{p.end}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
              <label style={{ fontSize: 12 }}>Entrada<br /><input type="time" className="ts-input" value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <label style={{ fontSize: 12 }}>Salida<br /><input type="time" className="ts-input" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 14 }}>{fmtHours(shiftHours({ kind, start, end }))}</div>
            </div>
          </>
        )}

        <label style={{ fontSize: 12, display: 'block', marginBottom: 18 }}>
          Nota (opcional)
          <input className="ts-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="p. ej. hace transportes" style={{ width: '100%', marginTop: 4 }} />
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm" disabled={!valid} onClick={() => onSave(current())}>Guardar</button>
          {shift && <button className="btn danger sm" onClick={onClear}>Borrar</button>}
          <button className="btn secondary sm" onClick={onClose} style={{ marginLeft: 'auto' }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, sub }) {
  return (
    <div className="tile dark" style={{ padding: 18 }}>
      <div className="eyebrow eyebrow-sm" style={{ color: C.cream, opacity: 0.7 }}>{label}</div>
      <div className="display tabular ts-kpi-value" style={{ fontSize: 40, lineHeight: 1, marginTop: 8, color: C.amarillo }}>{value}</div>
      {sub && <div className="eyebrow eyebrow-sm" style={{ color: C.cream, opacity: 0.55, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

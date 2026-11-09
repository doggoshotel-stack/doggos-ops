import { useState, useEffect, useMemo, useCallback } from 'react';
import { getMonthlyData, tierFor } from '../MonthlyView.jsx';
import { fetchSchedule, saveShift, saveMember } from './api.js';

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

// Shift kinds. 'turno' carries hours; the rest are full-day markers.
const KINDS = {
  turno:      { label: 'Turno',      bg: C.celeste,   fg: C.ink },
  libre:      { label: 'Libre',      bg: 'transparent', fg: C.ink, border: true },
  vacaciones: { label: 'Vacaciones', bg: C.amarillo,  fg: C.ink },
  baja:       { label: 'Baja',       bg: C.brick,     fg: C.cream },
};

const PRESETS = [
  { label: 'Mañana',   start: '08:00', end: '15:00' },
  { label: 'Tarde',    start: '14:00', end: '21:00' },
  { label: 'Completo', start: '09:00', end: '18:00' },
];

function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }

function shiftHours(s) {
  if (!s || s.kind !== 'turno' || !s.start || !s.end) return 0;
  const [h1, m1] = s.start.split(':').map(Number);
  const [h2, m2] = s.end.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60; // overnight
  return mins / 60;
}

function fmtHours(h) {
  if (!h) return '0 h';
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`;
}

const cellKey = (date, member) => `${date}|${member.toLowerCase()}`;

export default function TeamSchedule({ reservations = [], capacity = 42, now = new Date(), hubspotUrl, hubspotKey, bridgeError }) {
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [roster, setRoster] = useState([]);
  const [shifts, setShifts] = useState({});      // cellKey → shift
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(0);
  const [editing, setEditing] = useState(null);  // { date, member }
  const [newMember, setNewMember] = useState('');

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const load = useCallback(async () => {
    if (!hubspotUrl) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchSchedule(hubspotUrl, hubspotKey);
      const map = {};
      for (const s of data.shifts) map[cellKey(s.date, s.member)] = s;
      setShifts(map);
      setRoster(data.roster);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [hubspotUrl, hubspotKey]);

  useEffect(() => { load(); }, [load]);

  const days = useMemo(
    () => getMonthlyData(reservations, year, month, capacity),
    [reservations, year, month, capacity]
  );

  const monthPrefix = `${year}-${pad2(month + 1)}-`;

  // Columns: everyone on the roster, plus anyone holding a shift this month
  // (e.g. someone removed from the roster after their shifts were set).
  const members = useMemo(() => {
    const seen = new Map();
    for (const m of roster) if (!seen.has(m.toLowerCase())) seen.set(m.toLowerCase(), m);
    for (const s of Object.values(shifts)) {
      if (s.date.startsWith(monthPrefix) && !seen.has(s.member.toLowerCase())) seen.set(s.member.toLowerCase(), s.member);
    }
    return [...seen.values()];
  }, [roster, shifts, monthPrefix]);

  const getShift = (date, member) => shifts[cellKey(date, member)] || null;

  const totals = useMemo(() => {
    const sumOcc = days.reduce((a, d) => a + d.occupancy, 0);
    const capNights = capacity * days.length;
    const hoursBy = {};
    for (const m of members) {
      let h = 0, n = 0;
      for (const d of days) {
        const s = shifts[cellKey(ymd(d.date), m)];
        if (s && s.kind === 'turno') { h += shiftHours(s); n++; }
      }
      hoursBy[m] = { hours: h, shifts: n };
    }
    return {
      occPct: capNights > 0 ? sumOcc / capNights : 0,
      arrivals: days.reduce((a, d) => a + d.arrivals, 0),
      departures: days.reduce((a, d) => a + d.departures, 0),
      transports: days.reduce((a, d) => a + d.pickups + d.dropoffs, 0),
      hoursBy,
    };
  }, [days, capacity, members, shifts]);

  const writeShift = async (date, member, shift) => {
    const k = cellKey(date, member);
    const prev = shifts[k] || null;
    setShifts((cur) => {
      const next = { ...cur };
      if (shift) next[k] = { ...shift, date, member }; else delete next[k];
      return next;
    });
    setSaving((n) => n + 1);
    try {
      await saveShift(hubspotUrl, hubspotKey, date, member, shift);
    } catch (e) {
      setError(`No se pudo guardar el turno de ${member} (${date}): ${e.message || e}`);
      setShifts((cur) => {
        const next = { ...cur };
        if (prev) next[k] = prev; else delete next[k];
        return next;
      });
    } finally {
      setSaving((n) => n - 1);
    }
  };

  const addMember = async () => {
    const name = newMember.trim();
    if (!name) return;
    if (members.some((m) => m.toLowerCase() === name.toLowerCase())) { setNewMember(''); return; }
    setRoster((r) => [...r, name]);
    setNewMember('');
    setSaving((n) => n + 1);
    try { await saveMember(hubspotUrl, hubspotKey, name); }
    catch (e) {
      setError(`No se pudo añadir a ${name}: ${e.message || e}`);
      setRoster((r) => r.filter((m) => m !== name));
    } finally { setSaving((n) => n - 1); }
  };

  const removeMember = async (name) => {
    if (!window.confirm(`¿Quitar a ${name} del equipo? Sus turnos ya guardados se mantienen.`)) return;
    const prev = roster;
    setRoster((r) => r.filter((m) => m.toLowerCase() !== name.toLowerCase()));
    setSaving((n) => n + 1);
    try { await saveMember(hubspotUrl, hubspotKey, name, true); }
    catch (e) {
      setError(`No se pudo quitar a ${name}: ${e.message || e}`);
      setRoster(prev);
    } finally { setSaving((n) => n - 1); }
  };

  const monthLabel = `${MONTH_NAMES_ES[month]} ${year}`.toUpperCase();
  const todayKey = ymd(now);
  const editingShift = editing ? getShift(editing.date, editing.member) : null;

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
        .ts-cell-btn.empty { color: ${C.ink}; opacity: 0.25; }
        .ts-cell-btn.empty:hover { opacity: 0.8; border-color: ${C.ink15}; }
        .ts-cell-btn:hover { box-shadow: 0 0 0 1.5px ${C.ink}; }
        .ts-input { font: inherit; font-size: 14px; padding: 8px 10px; border: 1.5px solid ${C.ink}; border-radius: 8px; background: #fff; color: ${C.ink}; }
        @media (max-width: 760px) {
          .ts-page { padding: 20px 12px 60px !important; }
          .ts-title { font-size: 38px !important; }
          .ts-kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .ts-kpi-value { font-size: 30px !important; }
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
          <button onClick={load} className="btn secondary sm" disabled={loading} style={{ marginLeft: 8 }}>Recargar</button>
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

      {/* Team roster */}
      <div className="tile" style={{ padding: 16, marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginRight: 4 }}>Equipo</span>
        {members.length === 0 && <span style={{ fontSize: 13, opacity: 0.6 }}>Añade a las personas del equipo para empezar →</span>}
        {members.map((m) => (
          <span key={m} className="pastilla outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {m}
            <span style={{ opacity: 0.6, fontWeight: 400 }}>{fmtHours(totals.hoursBy[m]?.hours || 0)}</span>
            <button onClick={() => removeMember(m)} aria-label={`Quitar a ${m}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink, padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
          </span>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); addMember(); }} style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <input className="ts-input" value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Nombre" style={{ width: 150, padding: '6px 10px', fontSize: 13 }} disabled={!hubspotUrl} />
          <button type="submit" className="btn sm" disabled={!hubspotUrl || !newMember.trim()}>Añadir</button>
        </form>
      </div>

      {/* Month grid: one row per day */}
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
                    {totals.hoursBy[m]?.shifts || 0} turnos · {fmtHours(totals.hoursBy[m]?.hours || 0)}
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
                  {members.map((m, i) => {
                    const s = getShift(key, m);
                    return (
                      <td key={m} className={i === 0 ? 'ts-sep' : undefined}>
                        <ShiftButton shift={s} disabled={!hubspotUrl} onClick={() => setEditing({ date: key, member: m })} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, fontSize: 11, opacity: 0.7 }}>
        <span>↗ transporte ida (recogida) · ↘ vuelta (entrega)</span>
        <span>Check-in / Check-out / Occ% / Transp. vienen de Mews (igual que Vista mensual)</span>
        <span style={{ color: C.brick }}>⚠ día con actividad y nadie con turno</span>
      </div>

      {editing && (
        <ShiftEditor
          date={editing.date}
          member={editing.member}
          shift={editingShift}
          onClose={() => setEditing(null)}
          onSave={(s) => { writeShift(editing.date, editing.member, s); setEditing(null); }}
          onClear={() => { writeShift(editing.date, editing.member, null); setEditing(null); }}
          onCopyWeek={(s) => {
            // Same shift Mon–Fri of that week (only empty days are filled).
            const base = new Date(editing.date + 'T12:00:00');
            const offset = (base.getDay() + 6) % 7;
            for (let i = 0; i < 5; i++) {
              const d = new Date(base); d.setDate(base.getDate() - offset + i);
              const k = ymd(d);
              if (k === editing.date) writeShift(k, editing.member, s);
              else if (!getShift(k, editing.member)) writeShift(k, editing.member, s);
            }
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ShiftButton({ shift, onClick, disabled }) {
  if (!shift) {
    return <button className="ts-cell-btn empty" onClick={onClick} disabled={disabled} aria-label="Añadir turno">+</button>;
  }
  const k = KINDS[shift.kind] || KINDS.turno;
  const text = shift.kind === 'turno' && shift.start
    ? `${shift.start}–${shift.end || '?'}`
    : k.label;
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

function ShiftEditor({ date, member, shift, onClose, onSave, onClear, onCopyWeek }) {
  const [kind, setKind] = useState(shift?.kind || 'turno');
  const [start, setStart] = useState(shift?.start || PRESETS[0].start);
  const [end, setEnd] = useState(shift?.end || PRESETS[0].end);
  const [note, setNote] = useState(shift?.note || '');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const d = new Date(date + 'T12:00:00');
  const title = `${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()]} ${d.getDate()} ${MONTH_NAMES_ES[d.getMonth()]}`;
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
          <button className="btn secondary sm" disabled={!valid} onClick={() => onCopyWeek(current())} title="Rellena lunes–viernes de esa semana (solo días vacíos)">Lun–Vie</button>
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

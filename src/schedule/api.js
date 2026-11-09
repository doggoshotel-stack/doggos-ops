// Team schedule persistence. Shifts live in the `Schedule` tab of the HubSpot
// sheet, served by the same Apps Script proxy as the room board and budget
// (`apps-script/hubspot-proxy.gs`), so a shift typed on the iPad shows up on
// the laptop.
//
// Tab layout (all plain text):
//   date | member | kind | start | end | note | updated_at
// A row with an empty date is a roster entry: a team member with no shift yet.
//
// Writes are per cell (one shift = one upsert), never a whole-month replace,
// so two people filling in their own days at the same time don't overwrite
// each other.

export const SCHEDULE_TAB = 'Schedule';

function endpoint(url, params) {
  const qs = new URLSearchParams(params).toString();
  return `${url}${url.includes('?') ? '&' : '?'}${qs}`;
}

function pad2(n) { return String(n).padStart(2, '0'); }

// The proxy stores text, but a hand-edited tab can still hand us Date-ish ISO
// strings. Normalise both back to what the UI uses.
function normDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function normTime(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${pad2(m[1])}:${m[2]}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Read the whole Schedule tab. Returns { roster: string[], shifts: Shift[] }.
 * A missing tab is the normal first-run state and comes back empty.
 */
export async function fetchSchedule(url, key) {
  if (!url) throw new Error('Falta la URL del bridge de HubSpot (configúrala en admin).');
  const res = await fetch(endpoint(url, { key: key || '', sheet: SCHEDULE_TAB }), { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let data;
  try { data = await res.json(); }
  catch { throw new Error('Respuesta no es JSON válido (revisa el Apps Script)'); }
  if (data && data.error) {
    if (/no .*tab|not found/i.test(String(data.error))) return { roster: [], shifts: [] };
    throw new Error(`Apps Script: ${data.error}`);
  }
  if (!Array.isArray(data)) return { roster: [], shifts: [] };

  const roster = [];
  const shifts = [];
  for (const r of data) {
    const member = String(r.member ?? '').trim();
    if (!member) continue;
    const rawDate = String(r.date ?? '').trim();
    if (!rawDate) { roster.push(member); continue; }
    const date = normDate(rawDate);
    if (!date) continue;
    shifts.push({
      date,
      member,
      kind:  String(r.kind ?? '').trim() || 'turno',
      start: normTime(r.start),
      end:   normTime(r.end),
      note:  String(r.note ?? '').trim(),
    });
  }
  return { roster, shifts };
}

async function post(url, key, body) {
  if (!url) throw new Error('Falta la URL del bridge de HubSpot (configúrala en admin).');
  // text/plain skips the CORS preflight Apps Script cannot answer.
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: key || '', ...body }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.error) throw new Error(`Apps Script: ${data.error}`);
  return data;
}

/** Upsert one shift. Pass shift = null to clear the cell. */
export function saveShift(url, key, date, member, shift) {
  return post(url, key, {
    action: 'saveShift',
    date,
    member,
    kind:  shift ? shift.kind || 'turno' : '',
    start: shift ? shift.start || '' : '',
    end:   shift ? shift.end || '' : '',
    note:  shift ? shift.note || '' : '',
  });
}

/** Upsert many cells in one request. Each item: { date, member, shift|null }. */
export function saveShifts(url, key, items) {
  return post(url, key, {
    action: 'saveShifts',
    shifts: items.map(({ date, member, shift }) => ({
      date,
      member,
      kind:  shift ? shift.kind || 'turno' : '',
      start: shift ? shift.start || '' : '',
      end:   shift ? shift.end || '' : '',
      note:  shift ? shift.note || '' : '',
    })),
  });
}

export function saveMember(url, key, member, remove = false) {
  return post(url, key, { action: 'saveMember', member, remove });
}

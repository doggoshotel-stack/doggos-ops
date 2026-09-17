// Budget persistence. The budget lives in the `Budget` tab of the same HubSpot
// sheet the rest of the dashboard already reads, served by the same Apps Script
// proxy (`apps-script/hubspot-proxy.gs`). Shared across devices — unlike the
// localStorage config, a budget typed on the laptop shows up on the iPad.
//
// The proxy resolves tab names case-insensitively, so "Budget" and "budget"
// both land on the same tab rather than quietly creating a second one.
//
// Wire format is one flat row per line so the tab stays readable/editable in
// Google Sheets itself:
//   year | type | section_id | section_label | line_id | line_label | ene..dic | updated_at
//
// type is one of: driver | revenue | expense

export const BUDGET_TAB = 'Budget';
export const MONTH_COLS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function endpoint(url, params) {
  const qs = new URLSearchParams(params).toString();
  return `${url}${url.includes('?') ? '&' : '?'}${qs}`;
}

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[€\s]/g, '').replace(/,/g, '.'));
  return isNaN(n) ? 0 : n;
}

/**
 * Read every budget row for `year`. Returns [] when the tab does not exist yet
 * or holds nothing for that year — the caller then falls back to the defaults.
 */
export async function fetchBudget(url, key, year) {
  if (!url) throw new Error('Falta la URL del bridge de HubSpot (configúrala en admin).');
  const res = await fetch(endpoint(url, { key: key || '', sheet: BUDGET_TAB }), { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let data;
  try { data = await res.json(); }
  catch { throw new Error('Respuesta no es JSON válido (revisa el Apps Script)'); }
  if (data && data.error) {
    // A missing tab is a normal first-run state, not an error to surface.
    if (/no .*tab|not found/i.test(String(data.error))) return [];
    throw new Error(`Apps Script: ${data.error}`);
  }
  if (!Array.isArray(data)) return [];

  return data
    .filter((r) => String(r.year ?? '').trim() === String(year))
    .map((r) => ({
      type:          String(r.type ?? '').trim(),
      sectionId:     String(r.section_id ?? '').trim(),
      sectionLabel:  String(r.section_label ?? '').trim(),
      lineId:        String(r.line_id ?? '').trim(),
      lineLabel:     String(r.line_label ?? '').trim(),
      values:        MONTH_COLS.map((m) => num(r[m])),
      updatedAt:     r.updated_at || '',
    }))
    .filter((r) => r.type && r.lineId);
}

/**
 * Replace every row for `year` with `rows`. Whole-year replace (not upsert):
 * the budget is edited as one document, and renaming or deleting a line has to
 * survive the round trip.
 *
 * POSTs as text/plain so the browser skips the CORS preflight Apps Script
 * cannot answer — same trick as the room board and consent form.
 */
export async function saveBudget(url, key, year, rows) {
  if (!url) throw new Error('Falta la URL del bridge de HubSpot (configúrala en admin).');
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      key: key || '',
      action: 'saveBudget',
      year,
      rows: rows.map((r) => ({
        type:          r.type,
        section_id:    r.sectionId,
        section_label: r.sectionLabel,
        line_id:       r.lineId,
        line_label:    r.lineLabel,
        values:        r.values,
      })),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.error) throw new Error(`Apps Script: ${data.error}`);
  return data;
}

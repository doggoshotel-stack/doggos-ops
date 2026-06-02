// Customer-portal backend client. Talks to the Apps Script Web App whose
// /exec URL is provided via VITE_PORTAL_API. All auth is enforced server-side
// with signed magic-link tokens — this endpoint is not a secret.
//
// Requests POST JSON as text/plain so the browser skips the CORS preflight
// that Apps Script cannot answer (same approach the ops dashboard uses).

const API = import.meta.env.VITE_PORTAL_API || '';

async function post(payload) {
  if (!API) throw new Error('Portal no configurado (falta VITE_PORTAL_API).');
  const res = await fetch(API, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

export function isConfigured() {
  return !!API;
}

export function requestLink(email) {
  return post({ action: 'requestLink', email });
}

export function getRecord(token) {
  return post({ action: 'getRecord', token });
}

export function saveRecord(token, id, fields) {
  return post({ action: 'saveRecord', token, id, fields });
}

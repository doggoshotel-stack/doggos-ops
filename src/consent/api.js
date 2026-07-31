// Consent-form backend client. Posts the signed form to the same Apps Script
// Web App that already backs the ops dashboard's HubSpot bridge — it routes on
// { action: 'submitConsent' } and appends a row to the "Consent" tab.
//
// Requests POST JSON as text/plain so the browser skips the CORS preflight that
// Apps Script cannot answer (same trick the dashboard and portal use).
//
// The endpoint URL and shared key are not secrets: the same values already ship
// in the ops dashboard bundle. Overridable via env for staging/rotation.

const API = import.meta.env.VITE_HUBSPOT_API
  || 'https://script.google.com/macros/s/AKfycbytMIu0Zli3wYKDCl0LmtpNCmT31XqHtZwYffGR6RinYKkJuvksrRU9VKPYMY0rOaIcHg/exec';
const KEY = import.meta.env.VITE_HUBSPOT_KEY || 'hubspot-Bq3xR';

export function isConfigured() {
  return !!API && !!KEY;
}

export async function submitConsent(data) {
  if (!isConfigured()) throw new Error('Formulario no configurado (falta VITE_HUBSPOT_API / VITE_HUBSPOT_KEY).');
  const res = await fetch(API, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: KEY, action: 'submitConsent', data }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const out = await res.json();
  if (out && out.error) throw new Error(out.error);
  return out;
}

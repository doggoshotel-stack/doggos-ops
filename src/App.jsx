import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { storage } from './storage.js';
import MonthlyView from './MonthlyView.jsx';
import ManagementRouter, { ManagementLogin, checkMgmtAuth, clearMgmtAuth, MGMT_NAV } from './management/index.jsx';

/* ============================================================
   DOGGOS · OPS DASHBOARD — v2 (Google Sheets sources)
   Single-file React app. Two modes:
     #kiosk  → wall-mounted iPad view, auto-refreshes every 60s
     #admin  → configure sheet URLs + secret keys
   Data sources:
     1. Mews reservations sheet (booking source of truth)
     2. HubSpot intake form sheet (pet dossier)
   Both fetched via Apps Script web-app endpoints (restricted
   sheets, OAuth handled inside the script).
   ============================================================ */

/* ----------------------- BRAND TOKENS ----------------------- */
const C = {
  cream:    '#EAE8DD',  // gris cálido — primary surface
  ink:      '#21392C',  // verde oscuro — primary ink
  amarillo: '#F5F53D',
  ocre:     '#BFB200',
  celeste:  '#78D9D8',
  lila:     '#AD95E6',
  brick:    '#A23A2A',  // sparingly
  ink80:    '#21392CCC',
  ink15:    '#21392C26',
  ink08:    '#21392C14',
  cream60:  '#EAE8DD99',
};

/* Brand fonts embedded as base64 (Cooper BT Light + GT Zirkon Book/Bold) */
/* Brand fonts loaded from /public/fonts via the @font-face rules in STYLES below. */

const STYLES = `
@font-face {
  font-family: 'Cooper BT';
  src: url('/fonts/CooperBT-Light.ttf') format('truetype');
  font-weight: 300; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'GT Zirkon';
  src: url('/fonts/GT-Zirkon-Book.woff2') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'GT Zirkon';
  src: url('/fonts/GT-Zirkon-Bold.woff2') format('woff2');
  font-weight: 700; font-style: normal; font-display: swap;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { width: 100%; height: 100%; }

.doggos-app {
  font-family: 'GT Zirkon', system-ui, sans-serif;
  font-size: 16px; line-height: 1.5; letter-spacing: 0.025em;
  color: ${C.ink}; background: ${C.cream};
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  font-variant-numeric: lining-nums;
}
.doggos-app * { box-sizing: border-box; }

.display { font-family: 'Cooper BT', Georgia, serif; font-weight: 300; line-height: 0.98; letter-spacing: 0.005em; }
.eyebrow {
  font-family: 'GT Zirkon', sans-serif; font-weight: 700;
  font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
  color: ${C.ink};
}
.eyebrow-sm { font-size: 10px; letter-spacing: 0.2em; }
.tabular { font-variant-numeric: tabular-nums lining-nums; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  font-family: 'GT Zirkon', sans-serif; font-weight: 700;
  font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
  padding: 14px 26px; border-radius: 999px;
  border: 1.5px solid ${C.ink};
  background: ${C.ink}; color: ${C.cream};
  cursor: pointer; text-decoration: none;
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
              background 220ms ease, color 220ms ease;
}
.btn:hover { background: ${C.amarillo}; color: ${C.ink}; border-color: ${C.amarillo}; }
.btn:active { transform: translateY(2px); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn:disabled:hover { background: ${C.ink}; color: ${C.cream}; border-color: ${C.ink}; transform: none; }
.btn.secondary { background: transparent; color: ${C.ink}; }
.btn.secondary:hover { background: ${C.ink}; color: ${C.cream}; border-color: ${C.ink}; }
.btn.celeste { background: ${C.celeste}; color: ${C.ink}; border-color: ${C.celeste}; }
.btn.celeste:hover { background: ${C.amarillo}; border-color: ${C.amarillo}; }
.btn.danger { background: transparent; color: ${C.brick}; border-color: ${C.brick}; }
.btn.danger:hover { background: ${C.brick}; color: ${C.cream}; }
.btn.sm { padding: 8px 16px; font-size: 11px; }

.pastilla {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'GT Zirkon', sans-serif; font-weight: 700;
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
  padding: 4px 10px; border-radius: 999px; white-space: nowrap;
  background: ${C.amarillo}; color: ${C.ink};
}
.pastilla.celeste { background: ${C.celeste}; }
.pastilla.lila { background: ${C.lila}; }
.pastilla.ocre { background: ${C.ocre}; color: ${C.ink}; }
.pastilla.outline { background: transparent; border: 1.5px solid ${C.ink}; }
.pastilla.outline-celeste { background: transparent; border: 1.5px solid ${C.celeste}; color: ${C.celeste}; }
.pastilla.dark { background: ${C.ink}; color: ${C.amarillo}; }
.pastilla.lg { font-size: 11px; padding: 6px 14px; }

.tile {
  display: flex; flex-direction: column;
  border-radius: 20px; border: 1.5px solid ${C.ink};
  background: ${C.cream}; color: ${C.ink};
  overflow: hidden;
}
.tile.dark { background: ${C.ink}; color: ${C.cream}; border-color: ${C.ink}; }

.row {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1.5px solid ${C.ink};
  background: ${C.cream};
  transition: background 200ms ease;
}
.row.celeste-tint { background: rgba(120, 217, 216, 0.12); }
.row.amarillo-tint { background: rgba(245, 245, 61, 0.14); }

.dot { display: inline-block; width: 7px; height: 7px; border-radius: 999px; }
.dot.pulse { animation: pulse 2.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@keyframes slide-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.fade-in { animation: slide-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }

.doggos-app ::-webkit-scrollbar { width: 6px; height: 6px; }
.doggos-app ::-webkit-scrollbar-track { background: transparent; }
.doggos-app ::-webkit-scrollbar-thumb { background: ${C.ink15}; border-radius: 3px; }
.doggos-app ::-webkit-scrollbar-thumb:hover { background: ${C.ink}; }

.input {
  font-family: 'GT Zirkon', sans-serif; font-weight: 400;
  background: ${C.cream}; color: ${C.ink};
  border: 1.5px solid ${C.ink}; border-radius: 12px;
  padding: 10px 14px; font-size: 14px; outline: none;
  width: 100%;
  transition: background 200ms ease;
}
.input:focus { background: rgba(245, 245, 61, 0.15); }
.input.mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; }

.empty-overlay {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(234, 232, 221, 0.92); pointer-events: none; z-index: 50;
}
.empty-card {
  pointer-events: auto;
  background: ${C.cream}; border: 1.5px solid ${C.ink}; border-radius: 20px;
  padding: 36px 40px; max-width: 480px; text-align: center;
}

.code-block {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 12px; line-height: 1.6;
  background: ${C.ink}; color: ${C.cream};
  padding: 16px 18px; border-radius: 12px;
  white-space: pre-wrap; word-break: break-all;
  overflow-x: auto;
}
`;

/* ----------------------- helpers ----------------------- */

const pad2 = (n) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const dateKey = (d) => {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return null;
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
};
const SHEET_ERR_RE = /^#(REF|N\/A|VALUE|NAME|NUM|DIV\/0|ERROR|NULL|GETTING_DATA|SPILL)[!?]?$/i;
const sanitizeText = (v) => {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || SHEET_ERR_RE.test(s)) return '';
  return s;
};
const MONTH_NAMES = {
  ene:0, jan:0, feb:1, mar:2, abr:3, apr:3, may:4,
  jun:5, jul:6, ago:7, aug:7, sep:8, oct:9, nov:10, dic:11, dec:11,
};
const parseDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s || SHEET_ERR_RE.test(s)) return null;
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:[\sT](\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, d, mo, y, h, min] = m;
    const yr = y.length === 2 ? 2000 + Number(y) : Number(y);
    const dt = new Date(yr, Number(mo) - 1, Number(d), Number(h || 0), Number(min || 0));
    if (!isNaN(dt.getTime())) return dt;
  }
  // Calendly format: "HH:MM - <weekday>, DD <Month> YYYY (timezone)"
  const cal = s.match(/^(\d{1,2}):(\d{2})\s*-\s*\w+,?\s*(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (cal) {
    const [, h, min, day, monStr, year] = cal;
    const monKey = monStr.slice(0, 3).toLowerCase();
    const month = MONTH_NAMES[monKey];
    if (month != null) {
      const dt = new Date(Number(year), month, Number(day), Number(h), Number(min));
      if (!isNaN(dt.getTime())) return dt;
    }
  }
  return null;
};
const combineDateTime = (date, timeStr) => {
  if (!date) return null;
  const out = new Date(date);
  if (!timeStr) return out;
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (m) out.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return out;
};
const parseNumber = (v) => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
const parseList = (v) => {
  if (!v) return [];
  return String(v)
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'no' && s.toLowerCase() !== 'ninguna' && s.toLowerCase() !== 'ninguno' && s.toLowerCase() !== 'n/a');
};
const isYes = (v) => {
  if (!v) return false;
  const s = String(v).toLowerCase().trim();
  return s === 'sí' || s === 'si' || s === 'yes' || s === 'true' || s === '1' || s === 'x';
};
const normEmail = (v) => String(v || '').toLowerCase().trim();
const normName = (v) =>
  String(v || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a || !b) return Math.max((a || '').length, (b || '').length);
  if (Math.abs(a.length - b.length) > 2) return 99;
  const n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}
const pct = (n) => `${Math.round(n)}%`;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/* ----------------------- row parsers ----------------------- */

function parseMewsRow(row, idx) {
  return {
    source: 'mews',
    id: row.confirmation_number || `mews-${idx}`,
    confirmation: row.confirmation_number || '',
    guest: row.owner_name || '',
    email: normEmail(row.owner_email),
    arrival: parseDate(row.start_datetime),
    departure: parseDate(row.end_datetime),
    service: row.service || '',
    spaceType: row.requested_category || '',
    rate: parseNumber(row.rate),
    amount: parseNumber(row.total_amount),
    notes: row.notes || '',
    origin: row.origin || '',
    travelAgency: row.travel_agency || '',
    products: row.products || '',
    personCount: parseInt(row.person_count) || 1,
    enterprise: row.enterprise || '',
    receivedAt: parseDate(row.received_at),
  };
}

function parseHubSpotRow(row) {
  const arrDate = parseDate(row['Entrada (Check-in)']);
  const arrTime = row['Hora Estimada Entrada (Check-in)'];
  const depDate = parseDate(row['Salida (Check-out)']);
  const depTime = row['Hora Estimada Salida (check-out)'];
  const arrival = combineDateTime(arrDate, arrTime);
  const departure = combineDateTime(depDate, depTime);

  const drugName = row['Nombre del fármaco'] || '';
  const dose = row['Dosis'] || '';
  const schedule = row['Días de las dosis'] || '';
  const medications = drugName ? [{ name: drugName, dose, schedule }] : [];

  return {
    source: 'hubspot',
    id: row['Conversion ID'] || row['Contact ID'] || '',
    guest: `${row.Nombre || ''} ${row.Apellidos || ''}`.trim(),
    email: normEmail(row.Correo || row['Contact email']),
    phone: row['Número de teléfono de WhatsApp'] || '',
    address: sanitizeText(row.Dirección),
    pickup: row['Persona autorizada para recogida/entrega'] || '',
    pet: row['Nombre del perro'] || '',
    breed: row.Raza || '',
    size: row.Tamaño || '',
    sex: row.Sexo || '',
    weight: row['Peso (kg)'] || '',
    age: row.Edad || '',
    birthDate: row['Fecha de nacimiento'] || '',
    chip: row['Número de chip'] || '',
    healthCard: row['Número de Cartilla Sanitaria'] || '',
    sterilized: isYes(row.Esterilizado),
    lastVaccination: row['Última vacunación polivalente'] || '',
    arrival,
    departure,
    service: row.Servicio || '',
    transport: isYes(row.Transporte) || (!!row.Transporte && String(row.Transporte).trim() !== ''),
    allergies: parseList(row.Alergias),
    pathologies: parseList(row.Patologias),
    medications,
    medicalNotes: row['Observaciones medicas'] || '',
    insurer: row['Compañía aseguradora'] || '',
    foodType: row['Tipo de comida'] || '',
    foodBrand: row['Marca de comida'] || '',
    foodAmount: row['Cantidad diaria (gramos)'] || '',
    foodFrequency: row['Frecuencia de comidas'] || '',
    foodSchedule: row['Horario habitual'] || '',
    treats: row['Premios/snacks'] || '',
    prohibitedFoods: row['Alimentos prohibidos'] || '',
    supplements: row['Suplementos'] || '',
    rituals: row['Rituales o costumbres'] || '',
    notes: row.Observaciones || '',
    vetClinic: row['Clínica habitual'] || '',
    vetAddress: row['Dirección (2)'] || '',
    vetPhone: row['Teléfono clinica'] || '',
    emergency1: row['Contacto emergencia 1'] || '',
    emergency2: row['Contacto emergencia 2'] || '',
    submittedAt: parseDate(row['Conversion Date']),
    authorizedMedical: isYes(row['Autorizo tratamiento veterinario de urgencia cuando doggos lo considere necesario y asumo sus costes.']),
    authorizedMedication: isYes(row['Autorizo administración de medicación conforme a las instrucciones aportadas.']),
    authorizedTransport: isYes(row['Autorizo transporte contratado.']),
    authorizedImages: isYes(row['Autorizo uso de imágenes con fines informativos/publicitarios.']),
  };
}

/* ----------------------- merge ----------------------- */

function mergeReservations(mewsList, hubspotList) {
  // Index HubSpot by email and by normalized name (most recent submission wins).
  const hubByEmail = new Map();
  const hubByName = new Map();
  for (const h of hubspotList) {
    if (h.email) {
      const existing = hubByEmail.get(h.email);
      if (!existing || (h.submittedAt?.getTime() || 0) > (existing.submittedAt?.getTime() || 0)) {
        hubByEmail.set(h.email, h);
      }
    }
    const nm = normName(h.guest);
    if (nm) {
      const existing = hubByName.get(nm);
      if (!existing || (h.submittedAt?.getTime() || 0) > (existing.submittedAt?.getTime() || 0)) {
        hubByName.set(nm, h);
      }
    }
  }
  const hubNamesArr = Array.from(hubByName.entries()); // [name, record][] for fuzzy fallback

  const merged = mewsList.map((m) => {
    let h = null;
    let confidence = 'none';
    if (m.email && hubByEmail.has(m.email)) {
      h = hubByEmail.get(m.email);
      confidence = 'high';
    } else {
      const mNorm = normName(m.guest);
      if (mNorm && hubByName.has(mNorm)) {
        h = hubByName.get(mNorm);
        confidence = 'medium';
      } else if (mNorm) {
        let best = null;
        let bestDist = 3;
        for (const [hubName, hubRec] of hubNamesArr) {
          const d = levenshtein(mNorm, hubName);
          if (d < bestDist) { bestDist = d; best = hubRec; }
        }
        if (best && bestDist <= 2) {
          h = best;
          confidence = 'low';
        }
      }
    }
    return {
      ...m,
      pet: h?.pet || '',
      breed: h?.breed || '',
      size: h?.size || '',
      weight: h?.weight || '',
      sex: h?.sex || '',
      age: h?.age || '',
      address: h?.address || '',
      phone: h?.phone || '',
      sterilized: h?.sterilized,
      transport: h?.transport || false,
      allergies: h?.allergies || [],
      pathologies: h?.pathologies || [],
      medications: h?.medications || [],
      medicalNotes: h?.medicalNotes || '',
      foodType: h?.foodType || '',
      foodBrand: h?.foodBrand || '',
      foodAmount: h?.foodAmount || '',
      foodFrequency: h?.foodFrequency || '',
      foodSchedule: h?.foodSchedule || '',
      treats: h?.treats || '',
      prohibitedFoods: h?.prohibitedFoods || '',
      supplements: h?.supplements || '',
      rituals: h?.rituals || '',
      vetClinic: h?.vetClinic || '',
      vetPhone: h?.vetPhone || '',
      emergency1: h?.emergency1 || '',
      emergency2: h?.emergency2 || '',
      submittedAt: h?.submittedAt || null,
      hubspotId: h?.id || null,
      _hasHubspot: !!h,
      _matchConfidence: confidence,
      _hubspot: h || null,
    };
  });

  // Pending: HubSpot records that didn't match any Mews booking and have a future check-in.
  const matchedHubIds = new Set(merged.filter((r) => r._hubspot).map((r) => r._hubspot.id));
  const matchedEmails = new Set(merged.filter((r) => r._hasHubspot && r.email).map((r) => r.email));
  const matchedNames = new Set(merged.filter((r) => r._hasHubspot).map((r) => normName(r.guest)));
  const now = new Date();
  const pending = hubspotList.filter((h) => {
    if (matchedHubIds.has(h.id)) return false;
    if (h.email && matchedEmails.has(h.email)) return false;
    if (matchedNames.has(normName(h.guest))) return false;
    return h.arrival && h.arrival >= now;
  });

  return { merged, pending };
}

/* ----------------------- structured alerts ----------------------- */

const ALERT_STYLES = {
  medical:   { label: 'Médico',          pastilla: 'pastilla',         tint: 'amarillo-tint', priority: 0 },
  allergy:   { label: 'Alergia',         pastilla: 'pastilla',         tint: 'amarillo-tint', priority: 1 },
  pathology: { label: 'Patología',       pastilla: 'pastilla ocre',    tint: 'amarillo-tint', priority: 2 },
  neutered:  { label: 'No esterilizado', pastilla: 'pastilla ocre',    tint: '',              priority: 3 },
  behavior:  { label: 'Manejo',          pastilla: 'pastilla ocre',    tint: '',              priority: 4 },
  diet:      { label: 'Dieta',           pastilla: 'pastilla celeste', tint: 'celeste-tint',  priority: 5 },
  transport: { label: 'Transporte',      pastilla: 'pastilla celeste', tint: '',              priority: 6 },
  vip:       { label: 'VIP',             pastilla: 'pastilla lila',    tint: '',              priority: 7 },
};

function detectAlerts(record) {
  const alerts = [];

  // Medical (structured)
  if (record.medications?.length > 0 && record.medications[0].name) {
    const m = record.medications[0];
    const detail = [m.name, m.dose, m.schedule].filter(Boolean).join(' · ');
    alerts.push({ type: 'medical', detail });
  }

  // Allergies (structured)
  if (record.allergies?.length > 0) {
    alerts.push({ type: 'allergy', detail: record.allergies.join(', ') });
  }

  // Pathologies (structured)
  if (record.pathologies?.length > 0) {
    alerts.push({ type: 'pathology', detail: record.pathologies.join(', ') });
  }

  // Not neutered — only fires when we have HubSpot data that explicitly says no
  if (record._hasHubspot && record.sterilized === false) {
    alerts.push({ type: 'neutered', detail: 'Sin esterilizar' });
  }

  // Diet (structured)
  if (record.prohibitedFoods && record.prohibitedFoods.trim()) {
    alerts.push({ type: 'diet', detail: `Prohibido: ${record.prohibitedFoods}` });
  }

  // Transport — read from Mews products (HubSpot transport is stale across bookings)
  const products = String(record.products || '');
  const transportLegs = [];
  if (/transporte\s*ida/i.test(products)) transportLegs.push('Ida');
  if (/transporte\s*vuelta/i.test(products)) transportLegs.push('Vuelta');
  if (transportLegs.length > 0) {
    alerts.push({ type: 'transport', detail: transportLegs.join(' + ') });
  }

  // Behavior (keyword scan — no structured field)
  const behaviorKeywords = ['agresiv', 'reactiv', 'mord', 'miedo', 'fearful', 'ansied', 'separac', 'no socializ'];
  const allText = [record.notes, record.medicalNotes, record.rituals].filter(Boolean).join(' ').toLowerCase();
  if (behaviorKeywords.some((kw) => allText.includes(kw))) {
    const sample = record.rituals || record.notes || record.medicalNotes;
    alerts.push({ type: 'behavior', detail: sample || 'Ver observaciones' });
  }

  // VIP (heuristic)
  const vipKeywords = ['vip', 'preferred', 'premium', 'recurrent', 'habitual'];
  if (vipKeywords.some((kw) => allText.includes(kw)) || (record.products && /VIP|Premium/i.test(record.products))) {
    alerts.push({ type: 'vip', detail: 'Cliente recurrente' });
  }

  alerts.sort((a, b) => ALERT_STYLES[a.type].priority - ALERT_STYLES[b.type].priority);
  return alerts;
}

const topAlertTint = (alerts) => {
  if (!alerts || alerts.length === 0) return '';
  return ALERT_STYLES[alerts[0].type]?.tint || '';
};

/* ----------------------- fetch ----------------------- */

async function fetchSheet(url, key) {
  if (!url) throw new Error('URL no configurada');
  const fullUrl = `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key || '')}`;
  let res;
  try {
    res = await fetch(fullUrl, { redirect: 'follow' });
  } catch (e) {
    throw new Error(`Red: ${e.message}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('Respuesta no es JSON válido (revisa el script)');
  }
  if (data && data.error) throw new Error(`Apps Script: ${data.error}`);
  if (!Array.isArray(data)) throw new Error('Respuesta no es un array');
  return data;
}

/* ----------------------- demo data ----------------------- */

const offsetDate = (days, hours = 12, minutes = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

function buildDemoRow(opts) {
  return {
    source: 'mews',
    id: opts.id, confirmation: opts.id,
    guest: opts.guest, email: opts.email || '',
    arrival: opts.arrival, departure: opts.departure,
    service: opts.service || 'Hotel', spaceType: opts.spaceType || 'Suite estándar',
    rate: opts.rate || 58, amount: opts.amount || 290,
    notes: opts.notes || '', origin: 'web',
    products: opts.products || '', personCount: 1, enterprise: 'doggos',
    pet: opts.pet || '', breed: opts.breed || '', size: opts.size || '',
    weight: opts.weight || '',
    transport: opts.transport || false,
    allergies: opts.allergies || [],
    pathologies: opts.pathologies || [],
    medications: opts.medications || [],
    medicalNotes: opts.medicalNotes || '',
    foodBrand: opts.foodBrand || '', foodAmount: opts.foodAmount || '',
    prohibitedFoods: opts.prohibitedFoods || '',
    rituals: opts.rituals || '',
    vetClinic: opts.vetClinic || '', vetPhone: opts.vetPhone || '',
    emergency1: opts.emergency1 || '', emergency2: opts.emergency2 || '',
    _hasHubspot: opts._hasHubspot !== false,
  };
}

const DEMO_DATA = [
  // Today's arrivals
  buildDemoRow({ id: 'AAA-1042', guest: 'Pérez Soler', email: 'perez@example.com', pet: 'Luna', breed: 'Golden Retriever', size: 'Grande', weight: '28', arrival: offsetDate(0, 9), departure: offsetDate(5, 11), rate: 57, amount: 285, foodBrand: 'Acana', foodAmount: '350', notes: 'Muy sociable.' }),
  buildDemoRow({ id: 'AAA-1043', guest: 'Martí Vila', email: 'marti@example.com', pet: 'Toby', breed: 'Bulldog Francés', size: 'Mediano', weight: '12', arrival: offsetDate(0, 10), departure: offsetDate(3, 11), rate: 65, amount: 195, transport: true, notes: 'Roncador, lo saben.' }),
  buildDemoRow({ id: 'AAA-1044', guest: 'López Bernat', email: 'lopez@example.com', pet: 'Coco', breed: 'Caniche', size: 'Pequeño', weight: '8', arrival: offsetDate(0, 11), departure: offsetDate(7, 11), rate: 67, amount: 469, spaceType: 'Suite médica', pathologies: ['Diabetes'], medications: [{ name: 'Insulina', dose: '10 UI', schedule: '2x/día (mañana y noche)' }] }),
  buildDemoRow({ id: 'AAA-1045', guest: 'Rovira Casals', email: 'rovira@example.com', pet: 'Mia', breed: 'Bichón Maltés', size: 'Pequeño', weight: '5', arrival: offsetDate(0, 14), departure: offsetDate(4, 11), rate: 62, amount: 248, allergies: ['Pollo'], prohibitedFoods: 'pollo y derivados', foodBrand: 'Pienso hipoalergénico (aporta el dueño)' }),
  buildDemoRow({ id: 'AAA-1046', guest: 'Vidal Puig', email: 'vidal@example.com', pet: 'Rocky', breed: 'Pastor Alemán', size: 'Grande', weight: '34', arrival: offsetDate(0, 16), departure: offsetDate(2, 11), rate: 72, amount: 144, spaceType: 'Suite solo', notes: 'Reactivo con otros perros macho. Pasear solo.', rituals: 'Caminata individual por la mañana.' }),
  buildDemoRow({ id: 'AAA-1047', guest: 'Garcia Roca', email: 'garcia@example.com', pet: 'Brisa', breed: 'Labrador', size: 'Grande', weight: '26', arrival: offsetDate(0, 17), departure: offsetDate(10, 11), rate: 72, amount: 720, spaceType: 'Suite premium', products: 'VIP', notes: 'Cliente habitual desde 2023. Mantener kong en cama.' }),

  // Today's departures
  buildDemoRow({ id: 'AAA-1031', guest: 'Soler Mas', email: 'soler@example.com', pet: 'Max', breed: 'Beagle', size: 'Mediano', weight: '14', arrival: offsetDate(-5, 10), departure: offsetDate(0, 11), rate: 58, amount: 290, notes: 'Padre vendrá a recoger antes de las 11h.' }),
  buildDemoRow({ id: 'AAA-1032', guest: 'Ruiz Bosch', email: 'ruiz@example.com', pet: 'Bella', breed: 'Caniche toy', size: 'Pequeño', weight: '4', arrival: offsetDate(-3, 14), departure: offsetDate(0, 12), rate: 58, amount: 174, notes: 'Dejar baño antes de salir.' }),
  buildDemoRow({ id: 'AAA-1033', guest: 'Casas Verdú', email: 'casas@example.com', pet: 'Hugo', breed: 'Setter', size: 'Grande', weight: '22', arrival: offsetDate(-7, 16), departure: offsetDate(0, 17), rate: 67, amount: 469 }),

  // In-house (continuing)
  buildDemoRow({ id: 'AAA-1034', guest: 'Mendoza Coll', pet: 'Nala', breed: 'Husky', size: 'Grande', weight: '24', arrival: offsetDate(-2, 10), departure: offsetDate(2, 11), rate: 58, amount: 232 }),
  buildDemoRow({ id: 'AAA-1035', guest: 'Torres Riba', pet: 'Simba', breed: 'Border Collie', size: 'Mediano', weight: '18', arrival: offsetDate(-4, 11), departure: offsetDate(1, 11), rate: 58, amount: 290, notes: 'Mucha energía. Sesión de juego extra.' }),
  buildDemoRow({ id: 'AAA-1036', guest: 'Navarro Pla', pet: 'Lola', breed: 'Carlino', size: 'Pequeño', weight: '8', arrival: offsetDate(-1, 9), departure: offsetDate(6, 11), rate: 58, amount: 406, pathologies: ['Síndrome braquicefálico'], notes: 'Cuidado con el calor.' }),
  buildDemoRow({ id: 'AAA-1037', guest: 'Esteve Roig', pet: 'Thor', breed: 'Mastín', size: 'Gigante', weight: '52', arrival: offsetDate(-3, 10), departure: offsetDate(4, 11), rate: 75, amount: 525, spaceType: 'Suite XL' }),
  buildDemoRow({ id: 'AAA-1038', guest: 'Font Sabaté', pet: 'Maya', breed: 'Mestiza', size: 'Pequeño', weight: '6', arrival: offsetDate(-2, 14), departure: offsetDate(3, 11), rate: 58, amount: 290, notes: 'Ansiedad por separación.', rituals: 'Le calma una mantita azul que aporta el dueño.' }),
  buildDemoRow({ id: 'AAA-1039', guest: 'Bosch Ferrer', pet: 'Olivia', breed: 'Labrador', size: 'Grande', weight: '27', arrival: offsetDate(-5, 16), departure: offsetDate(2, 11), rate: 58, amount: 406, notes: 'VIP, viene cada mes.' }),
  buildDemoRow({ id: 'AAA-1040', guest: 'Ribas Camps', pet: 'Zeus', breed: 'Dóberman', size: 'Grande', weight: '36', arrival: offsetDate(-1, 11), departure: offsetDate(8, 11), rate: 58, amount: 522, medications: [{ name: 'Cosequin DS', dose: '1 cápsula', schedule: 'con la cena' }], pathologies: ['Displasia de cadera'] }),
  buildDemoRow({ id: 'AAA-1041', guest: 'Vives Pons', pet: 'Pepa', breed: 'Schnauzer', size: 'Mediano', weight: '11', arrival: offsetDate(-2, 9), departure: offsetDate(5, 11), rate: 58, amount: 406 }),

  // Future
  buildDemoRow({ id: 'AAA-1048', guest: 'Pujol Riera', pet: 'Kira', breed: 'Akita', size: 'Grande', weight: '29', arrival: offsetDate(1, 10), departure: offsetDate(6, 11), rate: 58, amount: 290 }),
  buildDemoRow({ id: 'AAA-1049', guest: 'Serra Boix', pet: 'Boby', breed: 'Yorkshire', size: 'Pequeño', weight: '4', arrival: offsetDate(1, 14), departure: offsetDate(4, 11), rate: 58, amount: 174 }),
  buildDemoRow({ id: 'AAA-1050', guest: 'Camps Oliva', pet: 'Duna', breed: 'Galgo', size: 'Grande', weight: '24', arrival: offsetDate(2, 10), departure: offsetDate(9, 11), rate: 58, amount: 406, notes: 'Recientemente adoptado. Miedo a ruidos fuertes.', rituals: 'Necesita un espacio tranquilo, lejos de zonas de juego.' }),
];

const DEMO_PENDING = 2; // pretend 2 HubSpot intakes without Mews bookings

const DEMO_CALENDLY = [
  { source: 'calendly', id: 'cal-1', eventType: 'visita-30min', eventName: 'Visita Doggos · 30 min', host: 'Alan García', time: offsetDate(0, 11), location: 'Doggos Ullastrell', invitee: 'Carla Domènech', email: 'carla.d@example.com', kind: 'visit' },
  { source: 'calendly', id: 'cal-2', eventType: 'llamada-descubrimiento', eventName: 'Llamada de descubrimiento', host: 'Laura Ellison', time: offsetDate(0, 16), location: 'Google Meet', meetingUrl: 'https://meet.google.com/...', invitee: 'Marc Olivé', email: 'marc.o@example.com', kind: 'call' },
  { source: 'calendly', id: 'cal-3', eventType: 'visita-30min', eventName: 'Visita Doggos · 30 min', host: 'Alan García', time: offsetDate(1, 10, 30), location: 'Doggos Ullastrell', invitee: 'Anna Puig', email: 'anna@example.com', kind: 'visit' },
  { source: 'calendly', id: 'cal-4', eventType: 'consulta-adiestramiento', eventName: 'Consulta adiestramiento', host: 'Stephanie Roca', time: offsetDate(1, 15), location: 'Doggos Ullastrell', invitee: 'Jordi Vives', email: 'jordi.v@example.com', kind: 'other' },
  { source: 'calendly', id: 'cal-5', eventType: 'llamada-onboarding', eventName: 'Llamada onboarding nuevo cliente', host: 'Laura Ellison', time: offsetDate(1, 17), location: 'Zoom', meetingUrl: 'https://zoom.us/...', invitee: 'Pol Carreras', email: 'pol@example.com', kind: 'call' },
];

/* ----------------------- brand SVG motifs ----------------------- */

const PeakTL = ({ height = 70 }) => (
  <svg viewBox="0 0 320 90" preserveAspectRatio="none"
       style={{ position: 'absolute', top: 0, left: 0, width: 280, height, zIndex: 2, pointerEvents: 'none' }}>
    <path d="M0,0 L0,50 Q55,42 95,25 Q130,8 165,22 L195,10 L235,20 L275,6 L320,14 L320,0 Z" fill={C.ink}/>
  </svg>
);
const PeakTR = ({ height = 70 }) => (
  <svg viewBox="0 0 320 90" preserveAspectRatio="none"
       style={{ position: 'absolute', top: 0, right: 0, width: 280, height, zIndex: 2, pointerEvents: 'none', transform: 'scaleX(-1)' }}>
    <path d="M0,0 L0,50 Q55,42 95,25 Q130,8 165,22 L195,10 L235,20 L275,6 L320,14 L320,0 Z" fill={C.ink}/>
  </svg>
);
const Range = ({ fill = C.ink, height = 80 }) => (
  <svg viewBox="0 0 1600 170" preserveAspectRatio="none"
       style={{ position: 'absolute', bottom: -1, left: 0, width: '100%', height, zIndex: 2, pointerEvents: 'none', display: 'block' }}>
    <path d="M0,170 L0,105 Q80,92 150,75 T300,38 Q380,18 455,38 T605,92 Q680,118 755,92 T910,42 Q990,20 1065,42 T1215,92 Q1290,118 1365,92 T1520,42 L1600,60 L1600,170 Z" fill={fill}/>
  </svg>
);
const MountainMark = ({ size = 28, color = C.ink }) => (
  <svg viewBox="0 0 979.5 728.24" width={size} height={size * (728.24 / 979.5)} aria-hidden="true">
    <g fill={color}>
      <polygon points="851.9 89.33 863.22 0 810.37 0 825.1 89.33 851.9 89.33"/>
      <polygon points="811.61 95.06 756.45 23.89 719.08 61.26 792.66 114.02 811.61 95.06"/>
      <polygon points="787.18 127.6 697.85 116.28 697.85 169.13 787.18 154.4 787.18 127.6"/>
      <polygon points="721.74 223.04 759.11 260.42 811.86 186.83 792.91 167.88 721.74 223.04"/>
      <polygon points="825.45 192.32 814.12 281.65 866.98 281.65 852.25 192.32 825.45 192.32"/>
      <polygon points="865.73 186.59 920.89 257.76 958.27 220.39 884.68 167.63 865.73 186.59"/>
      <polygon points="890.16 127.25 890.16 154.05 979.5 165.38 979.5 112.52 890.16 127.25"/>
      <polygon points="955.61 58.61 918.24 21.23 865.48 94.82 884.43 113.77 955.61 58.61"/>
      <path d="M751.65,686.27a14.62,14.62,0,0,1-12.35-6.79L714.23,640a68,68,0,0,0-57.41-31.55H542.47A67,67,0,0,1,482.29,571l-22.06-52.32,124.7-309.19c2-4.89,7-10.1,12.59-10.16,5.39-.06,10.44,5.22,12.9,10.16L727.76,470.57l9.77,20.18a592.33,592.33,0,0,1,25.82,62l35.91,89.83h72.18s-58.36-92.67-92.65-162.16L669.06,239.18c-10.71-21.81-21.33-43.67-32.47-65.26a40.82,40.82,0,0,0-31.35-22.08c-23.27,0-35.37,9-42.12,22.08L438.71,467.59,313.3,173.92A40.79,40.79,0,0,0,282,151.84c-23.26,0-35.36,9-42.11,22.08L63.6,548.59C40.63,593.12,0,651.08,0,651.08H92.53s-4.73-47.36,54-180.51L261.65,209.46a16.49,16.49,0,0,1,4.18-5.34,8.34,8.34,0,0,1,10.72,0,16.62,16.62,0,0,1,4.18,5.34l164.39,393.1a84.9,84.9,0,0,0,76.4,47.87H644.94a37,37,0,0,1,31.75,18l19.84,33.12a54.9,54.9,0,0,0,47.1,26.69h178l-24.4-42.08Z"/>
    </g>
  </svg>
);
const Wordmark = ({ size = 28, color = C.ink }) => (
  <span className="display" style={{ fontSize: size, lineHeight: 1, color, letterSpacing: '0.005em' }}>doggos</span>
);

/* ============================================================
   MAIN
   ============================================================ */

const STORAGE_KEYS = {
  config: 'doggos_sources_config',
  meta: 'doggos_meta',
  cache: 'doggos_cache',
};

const DEFAULT_CONFIG = {
  mewsUrl: '',
  mewsKey: '',
  hubspotUrl: '',
  hubspotKey: '',
  calendlyUrl: '',
  calendlyKey: '',
  bridgeUrl: '',
  bridgeKey: '',
};

const BRIDGE_VALID_STATUS = new Set(['Checked out', 'Checked in', 'Confirmed', 'Started', 'Processed']);

function parseBridgeDate(v) {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function parseBridgeAmount(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[€\s]/g, '').replace(/,/g, '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseBridgeRow(row) {
  return {
    number: row.Number,
    customer: `${row['First name'] || ''} ${row['Last name'] || ''}`.trim() || row['Group name'] || '',
    status: row.Status || '',
    arrival: parseBridgeDate(row.Arrival),
    departure: parseBridgeDate(row.Departure),
    spaceNumber: row['Space number'] != null ? String(row['Space number']) : '',
    spaceCategory: row['Space category'] || '',
    nights: Number(row['Count (days)']) || 0,
    personCount: Number(row['Person count']) || 1,
    totalAmount: parseBridgeAmount(row['Total amount']),
  };
}

/* ----------------------- Calendly parsing + classification ----------------------- */

const CALENDLY_KINDS = {
  visit: { label: 'Visita',  pastilla: 'pastilla',         priority: 0 },
  call:  { label: 'Llamada', pastilla: 'pastilla celeste', priority: 1 },
  other: { label: 'Cita',    pastilla: 'pastilla lila',    priority: 2 },
};

function classifyCalendly(eventName, eventType) {
  const s = `${eventName || ''} ${eventType || ''}`.toLowerCase();
  if (/visit|tour|instalac|recorrid/.test(s)) return 'visit';
  if (/llam|call|consult|descubr|onboard|kickoff/.test(s)) return 'call';
  return 'other';
}

function parseCalendlyRow(row, idx) {
  const eventName = row.event_name || row.event_type || '';
  const kind = classifyCalendly(eventName, row.event_type);
  return {
    source: 'calendly',
    id: row.calendly_uuid || `cal-${idx}`,
    eventType: row.event_type || '',
    eventName,
    host: row.host || '',
    time: parseDate(row.event_time_raw),
    location: sanitizeText(row.location),
    meetingUrl: sanitizeText(row.meeting_url),
    invitee: row.invitee_name || '',
    email: normEmail(row.invitee_email),
    customQuestions: row.custom_questions || '',
    kind,
    receivedAt: parseDate(row.received_at),
  };
}

/* ----------------------- routing + layout ----------------------- */

const SIDEBAR_COLLAPSED_KEY = 'doggos_sidebar_collapsed';

function getRoute() {
  if (typeof window === 'undefined') return '#/dashboard';
  const h = window.location.hash;
  if (h === '#admin') return '#admin';
  if (!h || h === '#' || h === '#/') return '#/dashboard';
  return h;
}

function navigate(hash) {
  if (typeof window !== 'undefined') window.location.hash = hash;
}

function useRoute() {
  const [route, setRoute] = useState(getRoute);
  useEffect(() => {
    const onChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function getInitialSidebarCollapsed() {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) return stored === 'true';
  } catch {}
  return window.innerWidth < 1100;
}

const NAV_ICON = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="2.5" width="6" height="6" /><rect x="11.5" y="2.5" width="6" height="6" />
      <rect x="2.5" y="11.5" width="6" height="6" /><rect x="11.5" y="11.5" width="6" height="6" />
    </svg>
  ),
  arrivals: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 10 L12 10 M9 7 L12 10 L9 13" /><rect x="14" y="3" width="4" height="14" />
    </svg>
  ),
  departures: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="3" width="4" height="14" /><path d="M8 10 L18 10 M15 7 L18 10 L15 13" />
    </svg>
  ),
  clients: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10" cy="6.5" r="3" /><path d="M3.5 17.5 C3.5 13.5 6.5 11.5 10 11.5 C13.5 11.5 16.5 13.5 16.5 17.5" />
    </svg>
  ),
  transports: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="1.5" y="6" width="13" height="7.5" /><path d="M14.5 8 L18.5 8 L18.5 13.5 L14.5 13.5" />
      <circle cx="6" cy="15" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  inhouse: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3 17 L3 9 L10 3 L17 9 L17 17 Z" />
      <path d="M8 17 L8 12 L12 12 L12 17" />
    </svg>
  ),
  monthly: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="2.5" y="4.5" width="15" height="13" rx="1" />
      <path d="M2.5 8.5 L17.5 8.5" />
      <path d="M6.5 2.5 L6.5 5.5 M13.5 2.5 L13.5 5.5" />
    </svg>
  ),
  chevronLeft: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3 L4 8 L10 13" /></svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3 L12 8 L6 13" /></svg>
  ),
};

const NAV_ITEMS = [
  { hash: '#/dashboard',       label: 'Dashboard',    icon: NAV_ICON.dashboard },
  { hash: '#/arrivals/today',  label: 'Llegadas hoy', icon: NAV_ICON.arrivals },
  { hash: '#/departures/today',label: 'Salidas hoy',  icon: NAV_ICON.departures },
  { hash: '#/inhouse',         label: 'In-House',     icon: NAV_ICON.inhouse },
  { hash: '#/mensual',         label: 'Vista mensual',icon: NAV_ICON.monthly },
  { hash: '#/clients',         label: 'Clientes',     icon: NAV_ICON.clients },
  { hash: '#/transports',      label: 'Transportes',  icon: NAV_ICON.transports },
];

function Sidebar({ route, collapsed, onToggle, isManagement, onLogout }) {
  const W = collapsed ? 64 : 220;
  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, bottom: 0,
      width: W, background: C.ink, color: C.cream,
      display: 'flex', flexDirection: 'column',
      transition: 'width 200ms ease',
      zIndex: 50, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '20px 0' : '20px 14px 20px 20px',
        borderBottom: '1px solid rgba(234, 232, 221, 0.15)',
        minHeight: 60,
      }}>
        {!collapsed && (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="display" style={{ fontSize: 22, color: C.cream, lineHeight: 1 }}>doggos</span>
            {isManagement && (
              <span
                className="eyebrow"
                style={{ background: C.amarillo, color: C.ink, fontSize: 9, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.2em' }}
              >
                MGMT
              </span>
            )}
          </span>
        )}
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          style={{
            background: 'transparent', border: 'none', color: C.cream,
            cursor: 'pointer', padding: 6, borderRadius: 4,
            display: 'flex', alignItems: 'center',
          }}
        >
          {collapsed ? NAV_ICON.chevronRight : NAV_ICON.chevronLeft}
        </button>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', padding: '12px 8px', gap: 4, flex: 1, overflow: 'auto' }}>
        {NAV_ITEMS.map((item) => {
          const active = route === item.hash;
          return (
            <button
              key={item.hash}
              onClick={() => navigate(item.hash)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '12px 0' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: active ? C.amarillo : 'transparent',
                color: active ? C.ink : C.cream,
                border: 'none', borderRadius: 8,
                cursor: 'pointer', fontSize: 14, fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden',
                fontFamily: 'inherit', textAlign: 'left', width: '100%',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}

        {!isManagement && (
          <>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => navigate('#/management')}
              title={collapsed ? 'Management' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '12px 0' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: 'transparent', color: C.cream, opacity: 0.65,
                border: '1px dashed rgba(234, 232, 221, 0.25)',
                borderRadius: 8,
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                whiteSpace: 'nowrap', overflow: 'hidden',
                fontFamily: 'inherit', textAlign: 'left', width: '100%',
                marginTop: 4,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = C.amarillo; e.currentTarget.style.color = C.amarillo; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.65'; e.currentTarget.style.borderColor = 'rgba(234, 232, 221, 0.25)'; e.currentTarget.style.color = C.cream; }}
            >
              <span style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                  <rect x="4" y="9" width="12" height="8" rx="1" />
                  <path d="M7 9 V6 C7 4.5 8 3 10 3 C12 3 13 4.5 13 6 V9" />
                </svg>
              </span>
              {!collapsed && <span>Management</span>}
            </button>
          </>
        )}

        {isManagement && (
          <>
            {!collapsed && (
              <div className="eyebrow eyebrow-sm" style={{ color: C.amarillo, opacity: 0.85, marginTop: 16, padding: '6px 12px', fontSize: 9, letterSpacing: '0.2em' }}>
                MANAGEMENT
              </div>
            )}
            {collapsed && <div style={{ height: 1, background: 'rgba(234, 232, 221, 0.15)', margin: '12px 8px' }} />}
            {MGMT_NAV.map((item) => {
              const active = route === item.hash || (item.hash === '#/management' && route.startsWith('#/management') && !MGMT_NAV.slice(1).some(o => route === o.hash));
              return (
                <button
                  key={item.hash}
                  onClick={() => navigate(item.hash)}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: collapsed ? '12px 0' : '10px 12px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    background: active ? C.amarillo : 'transparent',
                    color: active ? C.ink : C.cream,
                    border: 'none', borderRadius: 8,
                    cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    fontFamily: 'inherit', textAlign: 'left', width: '100%',
                  }}
                >
                  <span style={{ width: 6, height: 6, background: active ? C.ink : C.amarillo, borderRadius: 999, flex: 'none' }} />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </>
        )}
      </nav>

      {isManagement && (
        <div style={{ padding: collapsed ? '8px' : '12px 8px', borderTop: '1px solid rgba(234, 232, 221, 0.15)' }}>
          <button
            onClick={onLogout}
            title={collapsed ? 'Salir de Management' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '10px 0' : '10px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              background: 'transparent',
              color: C.cream, opacity: 0.7,
              border: '1px solid rgba(234, 232, 221, 0.25)',
              borderRadius: 8,
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              fontFamily: 'inherit', width: '100%',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 4 L4 4 L4 16 L12 16" />
              <path d="M9 10 L17 10 M14 7 L17 10 L14 13" />
            </svg>
            {!collapsed && <span>Salir</span>}
          </button>
        </div>
      )}
    </aside>
  );
}

function PageHeader({ title, subtitle }) {
  return (
    <header style={{ padding: '32px 32px 16px' }}>
      <h1 className="display" style={{ fontSize: 36, color: C.ink, margin: 0, lineHeight: 1 }}>{title}</h1>
      {subtitle && (
        <div className="eyebrow eyebrow-sm" style={{ color: C.ink, opacity: 0.6, marginTop: 6 }}>{subtitle}</div>
      )}
    </header>
  );
}

function ComingSoon({ note }) {
  return (
    <div style={{ margin: '0 32px', padding: 24, borderRadius: 12, background: 'rgba(33, 57, 44, 0.06)', color: C.ink, fontSize: 14 }}>
      Vista en construcción. {note}
    </div>
  );
}

/* ----------------------- detail card (arrivals/departures/in-house) ----------------------- */

const WEEKDAY_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTH_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtDateTime(d) {
  if (!d) return '—';
  const wd = WEEKDAY_ES[d.getDay()];
  const day = d.getDate();
  const mo = MONTH_ES[d.getMonth()];
  const yr = d.getFullYear();
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${wd} ${day} ${mo} ${yr}, ${hh}:${mm}`;
}

function splitProducts(productsStr) {
  const items = String(productsStr || '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const transports = items.filter((s) => /^transporte/i.test(s));
  const other = items.filter((s) => !/^transporte/i.test(s));
  return { transports, other };
}

const CONFIDENCE_LABEL = { high: 'alto', medium: 'medio', low: 'bajo', none: 'sin match' };
const CONFIDENCE_COLOR = { high: C.ocre, medium: C.celeste, low: C.lila, none: C.brick };

function MetaCell({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="eyebrow eyebrow-sm" style={{ color: C.ink, opacity: 0.55, marginBottom: 2 }}>{label}</div>
      <div style={{ color: C.ink, fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{value || '—'}</div>
    </div>
  );
}

function ProductPill({ label, on }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '4px 10px', borderRadius: 999,
      background: on ? 'rgba(120, 217, 216, 0.25)' : 'rgba(33, 57, 44, 0.06)',
      color: on ? C.ink : 'rgba(33, 57, 44, 0.5)',
      border: `1px solid ${on ? C.celeste : 'rgba(33, 57, 44, 0.15)'}`,
      fontSize: 12, fontWeight: 600,
    }}>
      {label}: {on ? 'Sí' : 'No'}
    </span>
  );
}

function ReservationDetailCard({ r }) {
  const { transports, other } = splitProducts(r.products);
  const hasTransport = transports.length > 0;
  const hasOtherProducts = other.length > 0;
  const hasNotes = !!(r.notes && r.notes.trim());
  const hasHubspot = !!r._hasHubspot;
  const confidence = r._matchConfidence || 'none';
  const profileMeta = [
    r.breed && ['Raza', r.breed],
    r.size && ['Tamaño', r.size],
    r.sex && ['Sexo', r.sex],
    r.age && ['Edad', r.age],
    r.weight && ['Peso (kg)', r.weight],
  ].filter(Boolean);
  const foodLines = [
    r.foodType && ['Tipo', r.foodType],
    r.foodBrand && ['Marca', r.foodBrand],
    r.foodAmount && ['Cantidad diaria', r.foodAmount + (/\bg\b|gram/i.test(r.foodAmount) ? '' : ' g')],
    r.foodFrequency && ['Frecuencia', r.foodFrequency],
    r.foodSchedule && ['Horario', r.foodSchedule],
    r.treats && ['Premios', r.treats],
  ].filter(Boolean);
  const allergiesText = r.allergies?.length > 0 ? r.allergies.join(', ') : 'Ninguna';
  const conditionsText = r.pathologies?.length > 0 ? r.pathologies.join(', ') : 'Ninguna';
  const neuteredText = r.sterilized === true ? 'Sí' : r.sterilized === false ? 'No' : '—';
  const vetParts = [
    r.vetClinic && ['Vet', r.vetClinic],
    r.vetPhone && ['Tel.', r.vetPhone],
    r.emergency1 && ['Emergencia 1', r.emergency1],
    r.emergency2 && ['Emergencia 2', r.emergency2],
  ].filter(Boolean);

  return (
    <article style={{
      background: C.cream, color: C.ink,
      border: `1px solid rgba(33, 57, 44, 0.15)`,
      borderRadius: 14, padding: 22, marginBottom: 16,
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h2 className="display" style={{ fontSize: 30, lineHeight: 1, margin: 0, letterSpacing: '0.02em' }}>
          {(r.pet || r.guest || '—').toUpperCase()}
        </h2>
        <div style={{ fontSize: 14, opacity: 0.75 }}>
          <span style={{ opacity: 0.6 }}>Dueño:</span> <strong>{r.guest || '—'}</strong>
        </div>
      </div>

      {/* Meta cells */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 16, marginTop: 14,
      }}>
        <MetaCell label="Entrada" value={fmtDateTime(r.arrival)} />
        <MetaCell label="Salida" value={fmtDateTime(r.departure)} />
        <MetaCell label="Habitación" value={r.spaceType} />
        <MetaCell label="Reserva nº" value={r.confirmation} />
      </div>

      {/* Pills */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {/d[ií]a\s*(de\s*)?guarder/i.test(r.service || '') && (
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(245, 245, 61, 0.4)',
            color: C.ink,
            border: `1px solid ${C.amarillo}`,
            fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
          }}>
            Guardería
          </span>
        )}
        <ProductPill label="Transporte" on={hasTransport} />
        <ProductPill label="Otros productos" on={hasOtherProducts} />
        {hasOtherProducts && (
          <span style={{ fontSize: 12, color: C.ink, opacity: 0.55 }}>
            ({other.join(', ')})
          </span>
        )}
      </div>

      {/* Booking notes (Mews) */}
      {hasNotes && (
        <div style={{
          marginTop: 14, padding: '10px 14px',
          background: 'rgba(245, 245, 61, 0.35)',
          borderLeft: `3px solid ${C.ink}`,
          borderRadius: 4, fontSize: 13.5, lineHeight: 1.4,
        }}>
          <strong>Notas de reserva (Mews):</strong> {r.notes}
        </div>
      )}

      {/* Dog profile (HubSpot) */}
      {hasHubspot ? (
        <div style={{
          marginTop: 14, padding: 16,
          background: 'rgba(120, 217, 216, 0.13)',
          border: '1px solid rgba(120, 217, 216, 0.5)',
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: 15 }}>Ficha del perro</strong>
            <span style={{ fontSize: 11, color: CONFIDENCE_COLOR[confidence], fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              match HubSpot: {CONFIDENCE_LABEL[confidence]}
            </span>
          </div>

          {profileMeta.length > 0 && (
            <div style={{ fontSize: 13.5, marginBottom: 10 }}>
              {profileMeta.map(([k, v], i) => (
                <span key={k}>
                  {i > 0 && <span style={{ opacity: 0.4, margin: '0 6px' }}>·</span>}
                  <span style={{ opacity: 0.6 }}>{k}:</span> <strong>{v}</strong>
                </span>
              ))}
            </div>
          )}

          {foodLines.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13.5 }}>Alimentación</strong>
              <ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 13 }}>
                {foodLines.map(([k, v]) => (
                  <li key={k}><span style={{ opacity: 0.65 }}>{k}:</span> {v}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'rgba(162, 58, 42, 0.08)',
            border: '1px solid rgba(162, 58, 42, 0.3)',
            borderRadius: 6,
          }}>
            <div style={{ fontSize: 12, color: C.brick, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Alergias</div>
            <div style={{ fontSize: 13.5 }}>{allergiesText}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 13.5 }}>A vigilar</strong>
            <ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 13 }}>
              <li><span style={{ opacity: 0.65 }}>Patologías:</span> {conditionsText}</li>
              <li><span style={{ opacity: 0.65 }}>Esterilizado:</span> {neuteredText}</li>
              {r.medicalNotes && <li><span style={{ opacity: 0.65 }}>Notas médicas:</span> {r.medicalNotes}</li>}
              {r.prohibitedFoods && <li><span style={{ opacity: 0.65 }}>Alimentos prohibidos:</span> {r.prohibitedFoods}</li>}
              {r.rituals && <li><span style={{ opacity: 0.65 }}>Rituales:</span> {r.rituals}</li>}
            </ul>
          </div>

          {vetParts.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(33, 57, 44, 0.1)', fontSize: 12.5, opacity: 0.85 }}>
              {vetParts.map(([k, v], i) => (
                <span key={k}>
                  {i > 0 && <span style={{ opacity: 0.4, margin: '0 6px' }}>·</span>}
                  <span style={{ opacity: 0.6 }}>{k}:</span> {v}
                </span>
              ))}
            </div>
          )}

          {r.submittedAt && (
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.55, fontStyle: 'italic' }}>
              Formulario enviado: {fmtDateTime(r.submittedAt)}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          marginTop: 14, padding: '12px 14px',
          background: 'rgba(162, 58, 42, 0.08)',
          border: `1px dashed ${C.brick}`,
          borderRadius: 8, fontSize: 13.5, color: C.ink,
        }}>
          <strong style={{ color: C.brick }}>Sin ficha HubSpot.</strong>{' '}
          Pedir al cliente que rellene el formulario de admisión antes de la entrada.
        </div>
      )}
    </article>
  );
}

function CardList({ items, emptyText }) {
  if (items.length === 0) {
    return (
      <div style={{
        margin: '0 32px', padding: 28,
        background: 'rgba(33, 57, 44, 0.04)',
        borderRadius: 12, color: C.ink, opacity: 0.65,
        fontSize: 14, textAlign: 'center',
      }}>
        {emptyText}
      </div>
    );
  }
  return (
    <div style={{ padding: '0 32px 60px' }}>
      {items.map((r) => <ReservationDetailCard key={r.id} r={r} />)}
    </div>
  );
}

function ArrivalsTodayView({ merged }) {
  const today = todayKey();
  const items = useMemo(() =>
    merged
      .filter((r) => dateKey(r.arrival) === today)
      .sort((a, b) => (a.arrival?.getTime() || 0) - (b.arrival?.getTime() || 0)),
    [merged, today]
  );
  return (
    <div>
      <PageHeader title="Llegadas hoy" subtitle={`${items.length} ${items.length === 1 ? 'reserva' : 'reservas'}`} />
      <CardList items={items} emptyText="Sin llegadas previstas hoy." />
    </div>
  );
}

function DeparturesTodayView({ merged }) {
  const today = todayKey();
  const items = useMemo(() =>
    merged
      .filter((r) => dateKey(r.departure) === today)
      .sort((a, b) => (a.departure?.getTime() || 0) - (b.departure?.getTime() || 0)),
    [merged, today]
  );
  return (
    <div>
      <PageHeader title="Salidas hoy" subtitle={`${items.length} ${items.length === 1 ? 'reserva' : 'reservas'}`} />
      <CardList items={items} emptyText="Sin salidas previstas hoy." />
    </div>
  );
}

function InHouseView({ merged }) {
  const items = useMemo(() => {
    const t = new Date();
    return merged
      .filter((r) => r.arrival && r.departure && r.arrival <= t && r.departure >= t)
      .sort((a, b) => (a.departure?.getTime() || 0) - (b.departure?.getTime() || 0));
  }, [merged]);
  return (
    <div>
      <PageHeader title="In-House" subtitle={`${items.length} ${items.length === 1 ? 'perro alojado' : 'perros alojados'}`} />
      <CardList items={items} emptyText="Nadie alojado ahora mismo." />
    </div>
  );
}

function ClientsView({ hubspot, merged, pending }) {
  const [query, setQuery] = useState('');
  const unique = useMemo(() => {
    // Primary source: every parsed HubSpot row, regardless of arrival date.
    // Falls back to merged + pending if hubspot prop is missing (warm cache before refresh).
    const source = (hubspot && hubspot.length > 0)
      ? hubspot
      : [...merged.filter((r) => r._hubspot).map((r) => r._hubspot), ...pending];
    const map = new Map();
    let anonymous = 0;
    for (const h of source) {
      const key = h.id || `anon-${anonymous++}`;
      const existing = map.get(key);
      if (!existing || (h.submittedAt?.getTime() || 0) > (existing.submittedAt?.getTime() || 0)) {
        map.set(key, h);
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0));
  }, [hubspot, merged, pending]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!q) return unique;
    return unique.filter((h) => {
      const hay = [h.guest, h.pet, h.email, h.phone, h.breed, h.address]
        .filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return hay.includes(q);
    });
  }, [unique, query]);

  return (
    <div>
      <PageHeader title="Clientes" subtitle={`${unique.length} ${unique.length === 1 ? 'ficha HubSpot' : 'fichas HubSpot'}`} />
      <div style={{ padding: '0 32px 16px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por dueño, perro, email, teléfono..."
          className="input"
          style={{
            width: '100%', padding: '10px 14px',
            border: '1px solid rgba(33, 57, 44, 0.2)',
            borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
          }}
        />
        {query && (
          <div style={{ marginTop: 6, fontSize: 12, color: C.ink, opacity: 0.55 }}>
            {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
          </div>
        )}
      </div>
      <div style={{ padding: '0 32px 60px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 28, background: 'rgba(33, 57, 44, 0.04)', borderRadius: 12, color: C.ink, opacity: 0.6, fontSize: 14, textAlign: 'center' }}>
            {query ? 'Sin coincidencias.' : 'Sin fichas HubSpot.'}
          </div>
        ) : (
          filtered.map((h) => <ClientRow key={h.id} h={h} />)
        )}
      </div>
    </div>
  );
}

function ClientRow({ h }) {
  const [expanded, setExpanded] = useState(false);
  const meta = [h.breed, h.size, h.sex, h.age && `${h.age} años`, h.weight && `${h.weight} kg`].filter(Boolean).join(' · ');
  const contact = [h.email, h.phone, h.address].filter(Boolean).join(' · ');
  return (
    <div style={{
      marginBottom: 8,
      background: C.cream, border: '1px solid rgba(33, 57, 44, 0.12)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          padding: '14px 18px',
          background: expanded ? 'rgba(33, 57, 44, 0.04)' : 'transparent',
          border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit',
          transition: 'background 160ms ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              display: 'inline-block', width: 14,
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 160ms ease',
              opacity: 0.55, fontSize: 12,
            }}>›</span>
            <span className="display" style={{ fontSize: 22, lineHeight: 1 }}>{h.pet || '—'}</span>
            {h.guest && <span style={{ marginLeft: 4, fontSize: 13, opacity: 0.7 }}>· {h.guest}</span>}
          </div>
          {h.submittedAt && (
            <span className="eyebrow eyebrow-sm" style={{ opacity: 0.5 }}>
              Formulario: {h.submittedAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        {meta && <div style={{ marginTop: 4, marginLeft: 22, fontSize: 13, opacity: 0.85 }}>{meta}</div>}
        {contact && <div style={{ marginTop: 3, marginLeft: 22, fontSize: 12, opacity: 0.65 }}>{contact}</div>}
      </button>

      {expanded && <ClientDetailPanel h={h} />}
    </div>
  );
}

function ClientDetailPanel({ h }) {
  const yesNo = (v) => v === true ? 'Sí' : v === false ? 'No' : '—';
  const sterilizedText = yesNo(h.sterilized);

  const profile = [
    ['Raza', h.breed], ['Tamaño', h.size], ['Sexo', h.sex],
    ['Edad', h.age], ['Peso (kg)', h.weight], ['Fecha de nacimiento', h.birthDate],
    ['Nº de chip', h.chip], ['Cartilla sanitaria', h.healthCard],
    ['Esterilizado', sterilizedText], ['Última vacunación', h.lastVaccination],
  ];
  const contactRows = [
    ['Email', h.email], ['Teléfono (WhatsApp)', h.phone],
    ['Dirección', h.address], ['Recogida/entrega', h.pickup],
  ];
  const stay = [
    ['Servicio', h.service],
    ['Entrada', h.arrival ? fmtDateTime(h.arrival) : '—'],
    ['Salida', h.departure ? fmtDateTime(h.departure) : '—'],
    ['Transporte', yesNo(h.transport)],
  ];
  const food = [
    ['Tipo', h.foodType], ['Marca', h.foodBrand], ['Cantidad diaria', h.foodAmount],
    ['Frecuencia', h.foodFrequency], ['Horario', h.foodSchedule],
    ['Premios', h.treats], ['Alimentos prohibidos', h.prohibitedFoods],
    ['Suplementos', h.supplements],
  ];
  const vet = [
    ['Clínica', h.vetClinic], ['Dirección clínica', h.vetAddress], ['Teléfono', h.vetPhone],
    ['Aseguradora', h.insurer],
    ['Emergencia 1', h.emergency1], ['Emergencia 2', h.emergency2],
  ];
  const authorizations = [
    ['Tratamiento veterinario de urgencia', h.authorizedMedical],
    ['Administración de medicación', h.authorizedMedication],
    ['Transporte', h.authorizedTransport],
    ['Uso de imágenes', h.authorizedImages],
  ];

  const allergiesText = h.allergies?.length > 0 ? h.allergies.join(', ') : 'Ninguna';
  const pathologiesText = h.pathologies?.length > 0 ? h.pathologies.join(', ') : 'Ninguna';

  return (
    <div className="fade-in" style={{
      borderTop: '1px solid rgba(33, 57, 44, 0.12)',
      padding: '16px 18px 18px',
      background: 'rgba(120, 217, 216, 0.06)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <Section title="Contacto" rows={contactRows} />
      <Section title="Perfil del perro" rows={profile} />
      <Section title="Estancia" rows={stay} />

      <div>
        <SectionHeader>Salud</SectionHeader>
        <div style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}>
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: 'rgba(162, 58, 42, 0.08)',
            border: '1px solid rgba(162, 58, 42, 0.3)',
          }}>
            <div className="eyebrow eyebrow-sm" style={{ color: C.brick, marginBottom: 2 }}>Alergias</div>
            <div style={{ fontSize: 13.5 }}>{allergiesText}</div>
          </div>
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: 'rgba(33, 57, 44, 0.05)',
            border: '1px solid rgba(33, 57, 44, 0.15)',
          }}>
            <div className="eyebrow eyebrow-sm" style={{ opacity: 0.65, marginBottom: 2 }}>Patologías</div>
            <div style={{ fontSize: 13.5 }}>{pathologiesText}</div>
          </div>
        </div>
        {h.medications?.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="eyebrow eyebrow-sm" style={{ opacity: 0.65, marginBottom: 4 }}>Medicación</div>
            <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: 13 }}>
              {h.medications.map((m, i) => (
                <li key={i}>
                  <strong>{m.name}</strong>
                  {m.dose && <> · {m.dose}</>}
                  {m.schedule && <> · {m.schedule}</>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {h.medicalNotes && (
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
            <span style={{ opacity: 0.6 }}>Notas médicas:</span> {h.medicalNotes}
          </div>
        )}
      </div>

      <Section title="Alimentación" rows={food} />

      {(h.rituals || h.notes) && (
        <div>
          <SectionHeader>Rituales y notas</SectionHeader>
          {h.rituals && (
            <div style={{ fontSize: 13, lineHeight: 1.45, marginBottom: 4 }}>
              <span style={{ opacity: 0.6 }}>Rituales:</span> {h.rituals}
            </div>
          )}
          {h.notes && (
            <div style={{ fontSize: 13, lineHeight: 1.45 }}>
              <span style={{ opacity: 0.6 }}>Observaciones:</span> {h.notes}
            </div>
          )}
        </div>
      )}

      <Section title="Veterinario y emergencias" rows={vet} />

      <div>
        <SectionHeader>Autorizaciones</SectionHeader>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {authorizations.map(([label, on]) => (
            <span key={label} style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '4px 10px', borderRadius: 999,
              background: on ? 'rgba(120, 217, 216, 0.25)' : 'rgba(162, 58, 42, 0.08)',
              color: on ? C.ink : C.brick,
              border: `1px solid ${on ? C.celeste : 'rgba(162, 58, 42, 0.3)'}`,
              fontSize: 12, fontWeight: 600,
            }}>
              {label}: {yesNo(on)}
            </span>
          ))}
        </div>
      </div>

      {(h.id || h.submittedAt) && (
        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.55, fontStyle: 'italic' }}>
          {h.id && <>HubSpot ID: {h.id}</>}
          {h.id && h.submittedAt && ' · '}
          {h.submittedAt && <>Formulario enviado: {fmtDateTime(h.submittedAt)}</>}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div className="eyebrow eyebrow-sm" style={{ opacity: 0.55, marginBottom: 6 }}>{children}</div>
  );
}

function Section({ title, rows }) {
  const visible = rows.filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== '—');
  if (visible.length === 0) return null;
  return (
    <div>
      <SectionHeader>{title}</SectionHeader>
      <div style={{
        display: 'grid', gap: '4px 16px',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        fontSize: 13, lineHeight: 1.45,
      }}>
        {visible.map(([k, v]) => (
          <div key={k}>
            <span style={{ opacity: 0.6 }}>{k}:</span> <strong>{v}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransportsView({ merged }) {
  const jobs = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const limit = new Date(today); limit.setDate(limit.getDate() + 7); limit.setHours(23, 59, 59, 999);
    const out = [];
    merged.forEach((r) => {
      const products = String(r.products || '');
      const hasIda = /transporte\s*ida/i.test(products);
      const hasVuelta = /transporte\s*vuelta/i.test(products);
      if (hasIda && r.arrival && r.arrival >= today && r.arrival <= limit) {
        out.push({ kind: 'ida', time: r.arrival, r });
      }
      if (hasVuelta && r.departure && r.departure >= today && r.departure <= limit) {
        out.push({ kind: 'vuelta', time: r.departure, r });
      }
    });
    out.sort((a, b) => a.time.getTime() - b.time.getTime());
    return out;
  }, [merged]);

  const byDay = useMemo(() => {
    const groups = new Map();
    jobs.forEach((j) => {
      const k = dateKey(j.time);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(j);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [jobs]);

  return (
    <div>
      <PageHeader title="Transportes" subtitle={`Próximos 7 días · ${jobs.length} ${jobs.length === 1 ? 'servicio' : 'servicios'}`} />
      {byDay.length === 0 ? (
        <div style={{ margin: '0 32px 60px', padding: 28, background: 'rgba(33, 57, 44, 0.04)', borderRadius: 12, color: C.ink, opacity: 0.65, fontSize: 14, textAlign: 'center' }}>
          Sin transportes programados en los próximos 7 días.
        </div>
      ) : (
        <div style={{ padding: '0 32px 60px' }}>
          {byDay.map(([dKey, dayJobs]) => <TransportDayBlock key={dKey} dKey={dKey} jobs={dayJobs} />)}
        </div>
      )}
    </div>
  );
}

function TransportDayBlock({ dKey, jobs }) {
  const date = new Date(dKey + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  let label;
  if (date.getTime() === today.getTime()) label = 'Hoy';
  else if (date.getTime() === tomorrow.getTime()) label = 'Mañana';
  else label = `${WEEKDAY_ES[date.getDay()]} ${date.getDate()} ${MONTH_ES[date.getMonth()]}`;
  return (
    <section style={{ marginBottom: 24 }}>
      <h3 className="display" style={{ fontSize: 22, color: C.ink, margin: '0 0 10px', textTransform: 'capitalize' }}>{label}</h3>
      {jobs.map((j, i) => <TransportJobRow key={`${j.r.id}-${j.kind}-${i}`} job={j} />)}
    </section>
  );
}

function TransportJobRow({ job }) {
  const { kind, time, r } = job;
  const isIda = kind === 'ida';
  const directionLabel = isIda ? 'Pickup · Ida' : 'Dropoff · Vuelta';
  const accent = isIda ? C.celeste : C.lila;
  const timeStr = `${pad2(time.getHours())}:${pad2(time.getMinutes())}`;
  const showTime = !(time.getHours() === 0 && time.getMinutes() === 0);
  const noAddress = !r.address;
  const noPhone = !r.phone;
  return (
    <div style={{
      padding: 14, marginBottom: 8,
      background: C.cream,
      border: `1px solid rgba(33, 57, 44, 0.12)`,
      borderLeft: `4px solid ${accent}`,
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow eyebrow-sm" style={{ color: accent === C.celeste ? C.ocre : C.lila, fontWeight: 700 }}>{directionLabel}</span>
          <div style={{ marginTop: 3 }}>
            <span className="display" style={{ fontSize: 20, lineHeight: 1 }}>{r.pet || '—'}</span>
            <span style={{ marginLeft: 8, fontSize: 13, opacity: 0.7 }}>· {r.guest || '—'}</span>
          </div>
        </div>
        {showTime && (
          <span className="display tabular" style={{ fontSize: 22, color: C.ink }}>{timeStr}</span>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>
        <div>
          <span style={{ opacity: 0.6 }}>Tel:</span>{' '}
          {noPhone
            ? <span style={{ color: C.brick }}>Sin teléfono — pedir al cliente</span>
            : <strong>{r.phone}</strong>}
        </div>
        <div>
          <span style={{ opacity: 0.6 }}>{isIda ? 'Recogida en:' : 'Entrega en:'}</span>{' '}
          {noAddress
            ? <span style={{ color: C.brick }}>Sin dirección — falta ficha HubSpot o columna Dirección vacía</span>
            : <strong>{r.address}</strong>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const isAdmin = route === '#admin';
  const isMgmtRoute = route.startsWith('#/management');
  const isMgmtLogin = route === '#/management/login';
  const [mgmtAuthed, setMgmtAuthed] = useState(() => checkMgmtAuth());
  useEffect(() => { setMgmtAuthed(checkMgmtAuth()); }, [route]);
  const [collapsed, setCollapsed] = useState(getInitialSidebarCollapsed);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [meta, setMeta] = useState({ capacity: 42, lastUpdated: null });
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [merged, setMerged] = useState([]);
  const [pending, setPending] = useState([]);
  const [hubspot, setHubspot] = useState([]);
  const [calendlyEvents, setCalendlyEvents] = useState([]);
  const [bridgeReservations, setBridgeReservations] = useState([]);
  const [fetchErrors, setFetchErrors] = useState({ mews: null, hubspot: null, calendly: null, bridge: null });

  /* ---- load config + cache ---- */
  const loadConfig = useCallback(async () => {
    try {
      const c = await storage.get(STORAGE_KEYS.config, true);
      if (c?.value) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(c.value) });
    } catch {}
    try {
      const m = await storage.get(STORAGE_KEYS.meta, true);
      if (m?.value) setMeta(JSON.parse(m.value));
    } catch {}
    try {
      const ca = await storage.get(STORAGE_KEYS.cache, true);
      if (ca?.value) {
        const cache = JSON.parse(ca.value);
        const rehydrated = (cache.merged || []).map((r) => ({
          ...r,
          arrival: r.arrival ? new Date(r.arrival) : null,
          departure: r.departure ? new Date(r.departure) : null,
          receivedAt: r.receivedAt ? new Date(r.receivedAt) : null,
        }));
        setMerged(rehydrated);
        setPending(cache.pending || []);
        const hubRehydrated = (cache.hubspot || []).map((h) => ({
          ...h,
          arrival: h.arrival ? new Date(h.arrival) : null,
          departure: h.departure ? new Date(h.departure) : null,
          submittedAt: h.submittedAt ? new Date(h.submittedAt) : null,
        }));
        setHubspot(hubRehydrated);
        const calRehydrated = (cache.calendly || []).map((e) => ({
          ...e,
          time: e.time ? new Date(e.time) : null,
          receivedAt: e.receivedAt ? new Date(e.receivedAt) : null,
        }));
        setCalendlyEvents(calRehydrated);
        const bridgeRehydrated = (cache.bridge || []).map((r) => ({
          ...r,
          arrival: r.arrival ? new Date(r.arrival) : null,
          departure: r.departure ? new Date(r.departure) : null,
        }));
        setBridgeReservations(bridgeRehydrated);
      }
    } catch {}
  }, []);

  /* ---- fetch + merge from sources ---- */
  const refresh = useCallback(async (cfg = config) => {
    setRefreshing(true);
    const errors = { mews: null, hubspot: null, calendly: null, bridge: null };
    let mewsRows = [];
    let hubspotRows = [];
    let calendlyRows = [];
    let bridgeRows = [];

    if (cfg.mewsUrl) {
      try {
        const raw = await fetchSheet(cfg.mewsUrl, cfg.mewsKey);
        mewsRows = raw.map(parseMewsRow);
      } catch (e) {
        errors.mews = e.message;
      }
    }
    if (cfg.hubspotUrl) {
      try {
        const raw = await fetchSheet(cfg.hubspotUrl, cfg.hubspotKey);
        hubspotRows = raw.map(parseHubSpotRow);
      } catch (e) {
        errors.hubspot = e.message;
      }
    }
    if (cfg.calendlyUrl) {
      try {
        const raw = await fetchSheet(cfg.calendlyUrl, cfg.calendlyKey);
        calendlyRows = raw.map(parseCalendlyRow);
      } catch (e) {
        errors.calendly = e.message;
      }
    }
    if (cfg.bridgeUrl) {
      try {
        const url = `${cfg.bridgeUrl}${cfg.bridgeUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(cfg.bridgeKey || '')}&sheet=reservations`;
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.error) throw new Error(`Apps Script: ${data.error}`);
        if (!Array.isArray(data?.rows)) throw new Error('Respuesta sin rows');
        bridgeRows = data.rows.map(parseBridgeRow);
      } catch (e) {
        errors.bridge = e.message;
      }
    }

    const { merged: mergedRows, pending: pendingRows } = mergeReservations(mewsRows, hubspotRows);
    setMerged(mergedRows);
    setPending(pendingRows);
    setHubspot(hubspotRows);
    setCalendlyEvents(calendlyRows);
    setBridgeReservations(bridgeRows);
    setFetchErrors(errors);

    // Save to cache for resilience
    if (mergedRows.length > 0 || pendingRows.length > 0 || hubspotRows.length > 0 || calendlyRows.length > 0 || bridgeRows.length > 0) {
      const cache = {
        merged: mergedRows.map((r) => ({
          ...r,
          arrival: r.arrival?.toISOString() || null,
          departure: r.departure?.toISOString() || null,
          receivedAt: r.receivedAt?.toISOString() || null,
          _hubspot: undefined,
        })),
        pending: pendingRows.map((p) => ({ guest: p.guest, pet: p.pet, arrival: p.arrival?.toISOString(), email: p.email })),
        hubspot: hubspotRows.map((h) => ({
          ...h,
          arrival: h.arrival?.toISOString() || null,
          departure: h.departure?.toISOString() || null,
          submittedAt: h.submittedAt?.toISOString() || null,
        })),
        calendly: calendlyRows.map((e) => ({
          ...e,
          time: e.time?.toISOString() || null,
          receivedAt: e.receivedAt?.toISOString() || null,
        })),
        bridge: bridgeRows.map((r) => ({
          ...r,
          arrival: r.arrival?.toISOString() || null,
          departure: r.departure?.toISOString() || null,
        })),
      };
      try {
        await storage.set(STORAGE_KEYS.cache, JSON.stringify(cache), true);
      } catch {}
      const newMeta = { ...meta, lastUpdated: new Date().toISOString() };
      try {
        await storage.set(STORAGE_KEYS.meta, JSON.stringify(newMeta), true);
      } catch {}
      setMeta(newMeta);
    }

    setTimeout(() => setRefreshing(false), 500);
  }, [config, meta]);

  useEffect(() => {
    (async () => {
      await loadConfig();
      setLoading(false);
    })();
  }, [loadConfig]);

  // Initial fetch after config loads
  const didInitialFetch = useRef(false);
  useEffect(() => {
    if (loading || didInitialFetch.current) return;
    if (config.mewsUrl || config.hubspotUrl || config.calendlyUrl || config.bridgeUrl) {
      didInitialFetch.current = true;
      refresh(config);
    }
  }, [loading, config, refresh]);

  // Auto-refresh every 60s on any non-admin route (only if any source is configured)
  useEffect(() => {
    if (isAdmin) return;
    if (!config.mewsUrl && !config.hubspotUrl && !config.calendlyUrl && !config.bridgeUrl) return;
    const id = setInterval(() => refresh(config), 60000);
    return () => clearInterval(id);
  }, [isAdmin, config, refresh]);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const switchMode = (m) => navigate(m === 'admin' ? '#admin' : '#/dashboard');

  const toggleSidebar = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch {}
      return next;
    });
  };

  const saveConfig = async (newCfg) => {
    setConfig(newCfg);
    await storage.set(STORAGE_KEYS.config, JSON.stringify(newCfg), true);
  };
  const saveCapacity = async (val) => {
    const newMeta = { ...meta, capacity: val };
    await storage.set(STORAGE_KEYS.meta, JSON.stringify(newMeta), true);
    setMeta(newMeta);
  };

  const loadDemo = async () => {
    setMerged(DEMO_DATA);
    setPending(Array.from({ length: DEMO_PENDING }, (_, i) => ({
      guest: `Demo ${i + 1}`, pet: `Pet ${i + 1}`, arrival: offsetDate(i + 3, 10), email: `demo${i}@example.com`,
    })));
    setCalendlyEvents(DEMO_CALENDLY);
    const newMeta = { ...meta, lastUpdated: new Date().toISOString() };
    await storage.set(STORAGE_KEYS.meta, JSON.stringify(newMeta), true);
    setMeta(newMeta);
  };

  const clearCache = async () => {
    setMerged([]);
    setPending([]);
    setCalendlyEvents([]);
    setBridgeReservations([]);
    setFetchErrors({ mews: null, hubspot: null, calendly: null, bridge: null });
    await storage.delete(STORAGE_KEYS.cache, true);
  };

  if (loading) {
    return (
      <div className="doggos-app" style={{ minHeight: '100vh', position: 'relative' }}>
        <style>{STYLES}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <span className="display" style={{ fontSize: 32, color: C.ink, opacity: 0.5 }}>cargando…</span>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="doggos-app" style={{ minHeight: '100vh', position: 'relative' }}>
        <style>{STYLES}</style>
        <AdminView
          config={config}
          meta={meta}
          merged={merged}
          pending={pending}
          calendlyEvents={calendlyEvents}
          bridgeReservations={bridgeReservations}
          fetchErrors={fetchErrors}
          refreshing={refreshing}
          onSaveConfig={saveConfig}
          onSaveCapacity={saveCapacity}
          onRefresh={() => refresh(config)}
          onLoadDemo={loadDemo}
          onClearCache={clearCache}
          onSwitchMode={switchMode}
        />
      </div>
    );
  }

  const isConfigured = !!(config.mewsUrl || config.hubspotUrl || config.calendlyUrl || config.bridgeUrl);
  const sidebarWidth = collapsed ? 64 : 220;

  // Management login page renders without the regular sidebar.
  if (isMgmtLogin) {
    return (
      <div className="doggos-app" style={{ minHeight: '100vh' }}>
        <style>{STYLES}</style>
        <ManagementLogin onSuccess={() => { setMgmtAuthed(true); navigate('#/management'); }} />
      </div>
    );
  }
  // Management routes require auth; otherwise redirect to login.
  if (isMgmtRoute && !mgmtAuthed) {
    return (
      <div className="doggos-app" style={{ minHeight: '100vh' }}>
        <style>{STYLES}</style>
        <ManagementLogin onSuccess={() => { setMgmtAuthed(true); navigate('#/management'); }} />
      </div>
    );
  }

  let routeBody;
  if (isMgmtRoute) {
    routeBody = (
      <ManagementRouter
        route={route}
        reservations={bridgeReservations}
        capacity={meta.capacity}
        now={now}
      />
    );
  } else {
    switch (route) {
      case '#/arrivals/today':
        routeBody = <ArrivalsTodayView merged={merged} />;
        break;
      case '#/departures/today':
        routeBody = <DeparturesTodayView merged={merged} />;
        break;
      case '#/inhouse':
        routeBody = <InHouseView merged={merged} />;
        break;
      case '#/mensual':
        routeBody = <MonthlyView reservations={bridgeReservations} capacity={meta.capacity} now={now} error={fetchErrors.bridge} configured={!!config.bridgeUrl} />;
        break;
      case '#/clients':
        routeBody = <ClientsView hubspot={hubspot} merged={merged} pending={pending} />;
        break;
      case '#/transports':
        routeBody = <TransportsView merged={merged} />;
        break;
      case '#/dashboard':
      default:
        routeBody = (
          <KioskView
            merged={merged}
            pending={pending}
            calendlyEvents={calendlyEvents}
            meta={meta}
            now={now}
            refreshing={refreshing}
            fetchErrors={fetchErrors}
            isConfigured={isConfigured}
            onSwitchMode={switchMode}
          />
        );
    }
  }

  const handleLogout = () => {
    clearMgmtAuth();
    setMgmtAuthed(false);
    navigate('#/dashboard');
  };

  return (
    <div className="doggos-app" style={{ minHeight: '100vh', position: 'relative' }}>
      <style>{STYLES}</style>
      <Sidebar
        route={route}
        collapsed={collapsed}
        onToggle={toggleSidebar}
        isManagement={isMgmtRoute && mgmtAuthed}
        onLogout={handleLogout}
      />
      <div style={{ paddingLeft: sidebarWidth, transition: 'padding-left 200ms ease', minHeight: '100vh', position: 'relative' }}>
        {routeBody}
      </div>
    </div>
  );
}

/* ============================================================
   KIOSK VIEW
   ============================================================ */

function KioskView({ merged, pending, calendlyEvents, meta, now, refreshing, fetchErrors, isConfigured, onSwitchMode }) {
  const today = todayKey();
  const tomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return dateKey(d);
  }, [now]);

  const arrivalsToday = useMemo(() =>
    merged
      .filter((r) => dateKey(r.arrival) === today)
      .sort((a, b) => (a.arrival?.getTime() || 0) - (b.arrival?.getTime() || 0)),
    [merged, today]
  );

  const arrivalsTomorrow = useMemo(() =>
    merged
      .filter((r) => dateKey(r.arrival) === tomorrow)
      .sort((a, b) => (a.arrival?.getTime() || 0) - (b.arrival?.getTime() || 0)),
    [merged, tomorrow]
  );

  const departuresToday = useMemo(() =>
    merged
      .filter((r) => dateKey(r.departure) === today)
      .sort((a, b) => (a.departure?.getTime() || 0) - (b.departure?.getTime() || 0)),
    [merged, today]
  );

  const departuresTomorrow = useMemo(() =>
    merged
      .filter((r) => dateKey(r.departure) === tomorrow)
      .sort((a, b) => (a.departure?.getTime() || 0) - (b.departure?.getTime() || 0)),
    [merged, tomorrow]
  );

  const inHouse = useMemo(() => {
    const t = new Date();
    return merged.filter((r) => r.arrival && r.departure && r.arrival <= t && r.departure >= t);
  }, [merged]);

  const allActive = useMemo(() => {
    const ids = new Set();
    const list = [];
    [...arrivalsToday, ...inHouse, ...departuresToday].forEach((r) => {
      if (!ids.has(r.id)) { ids.add(r.id); list.push(r); }
    });
    return list;
  }, [arrivalsToday, inHouse, departuresToday]);

  const alertsList = useMemo(() => {
    const out = [];
    allActive.forEach((r) => {
      const flags = detectAlerts(r);
      flags.forEach((f) => out.push({ res: r, ...f }));
    });
    out.sort((a, b) => ALERT_STYLES[a.type].priority - ALERT_STYLES[b.type].priority);
    return out;
  }, [allActive]);

  const occupancyPct = meta.capacity > 0 ? (inHouse.length / meta.capacity) * 100 : 0;

  // Calendly upcoming events (today + tomorrow)
  const upcomingEvents = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setDate(end.getDate() + 2); end.setHours(0, 0, 0, 0);
    return calendlyEvents
      .filter((e) => e.time && e.time >= start && e.time < end)
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }, [calendlyEvents]);
  const eventsTodayCount = useMemo(
    () => upcomingEvents.filter((e) => dateKey(e.time) === today).length,
    [upcomingEvents, today]
  );

  const dateLabel = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeLabel = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const secLabel = pad2(now.getSeconds());
  const lastUpdatedLabel = meta.lastUpdated
    ? `actualizado ${new Date(meta.lastUpdated).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : 'sin datos';
  const hasAnyError = !!(fetchErrors.mews || fetchErrors.hubspot);
  const isEmpty = !isConfigured && merged.length === 0;

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PeakTL height={60} />
      <PeakTR height={60} />

      <header style={{ position: 'relative', zIndex: 5, padding: '24px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <MountainMark size={32} color={C.ink} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Wordmark size={32} />
            <span className="eyebrow eyebrow-sm" style={{ opacity: 0.7 }}>Operaciones · Ullastrell</span>
          </div>
        </div>

        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
            <span className="display tabular" style={{ fontSize: 56, color: C.ink }}>{timeLabel}</span>
            <span className="display tabular" style={{ fontSize: 28, color: C.ink, opacity: 0.45 }}>:{secLabel}</span>
          </div>
          <div className="eyebrow" style={{ opacity: 0.55, marginTop: 2 }}>{cap(dateLabel)}</div>
        </div>

        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="dot pulse" style={{ background: hasAnyError ? C.brick : (refreshing ? C.amarillo : C.ocre) }} />
            <span style={{ opacity: 0.7 }}>{hasAnyError ? 'error de origen' : lastUpdatedLabel}</span>
          </span>
          <button
            onClick={() => onSwitchMode('admin')}
            className="eyebrow eyebrow-sm"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.ink, opacity: 0.4, padding: 0 }}
            aria-label="Admin"
          >
            ⚙ admin
          </button>
        </div>
      </header>

      {/* Hero KPI band */}
      <section style={{ position: 'relative', margin: '20px 32px 0', borderRadius: 20, background: C.ink, color: C.cream, padding: '28px 32px 24px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 28, position: 'relative', zIndex: 2 }}>
          <Stat label="En casa" value={`${inHouse.length}/${meta.capacity}`} sub={pct(occupancyPct)} />
          <Stat label="Llegadas hoy" value={String(arrivalsToday.length)} sub={arrivalsToday.length === 1 ? 'reserva' : 'reservas'} onClick={() => navigate('#/arrivals/today')} />
          <Stat label="Salidas hoy" value={String(departuresToday.length)} sub={departuresToday.length === 1 ? 'reserva' : 'reservas'} onClick={() => navigate('#/departures/today')} />
          <Stat label="Alertas activas" value={String(alertsList.length)} sub={alertsList.length === 1 ? 'activa' : 'activas'} />
          <Stat label="Por confirmar" value={String(pending.length)} sub="forms sin reserva" valueColor={pending.length > 0 ? C.celeste : C.amarillo} />
        </div>
        <OccupancyCells inHouse={inHouse.length} capacity={meta.capacity} />
      </section>

      {/* 7-day occupancy forecast */}
      <OccupancyForecast merged={merged} capacity={meta.capacity} now={now} />

      {/* Calendly strip — today + tomorrow */}
      <CalendlyStrip events={upcomingEvents} todayCount={eventsTodayCount} />

      {/* Four columns */}
      <main style={{ flex: 1, padding: '20px 32px 100px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, minHeight: 0 }}>
        <TabbedColumn
          eyebrow="Check-in"
          tabs={[
            {
              key: 'today',
              label: 'Hoy',
              title: 'Llegadas hoy',
              count: arrivalsToday.length,
              content: arrivalsToday.length === 0
                ? <Empty>Sin llegadas previstas hoy</Empty>
                : arrivalsToday.map((r) => <GuestRow key={r.id} r={r} time={r.arrival} variant="arrival" />),
            },
            {
              key: 'tomorrow',
              label: 'Mañana',
              title: 'Llegadas mañana',
              count: arrivalsTomorrow.length,
              content: arrivalsTomorrow.length === 0
                ? <Empty>Sin llegadas previstas mañana</Empty>
                : arrivalsTomorrow.map((r) => <GuestRow key={r.id} r={r} time={r.arrival} variant="arrival" />),
            },
          ]}
        />

        <TabbedColumn
          eyebrow="Check-out"
          tabs={[
            {
              key: 'today',
              label: 'Hoy',
              title: 'Salidas hoy',
              count: departuresToday.length,
              content: departuresToday.length === 0
                ? <Empty>Sin salidas previstas hoy</Empty>
                : departuresToday.map((r) => <GuestRow key={r.id} r={r} time={r.departure} variant="departure" />),
            },
            {
              key: 'tomorrow',
              label: 'Mañana',
              title: 'Salidas mañana',
              count: departuresTomorrow.length,
              content: departuresTomorrow.length === 0
                ? <Empty>Sin salidas previstas mañana</Empty>
                : departuresTomorrow.map((r) => <GuestRow key={r.id} r={r} time={r.departure} variant="departure" />),
            },
          ]}
        />

        <Column title="In-House" eyebrow="Durmiendo" count={inHouse.length}>
          {inHouse.length === 0
            ? <Empty>Nadie alojado ahora mismo</Empty>
            : [...inHouse]
                .sort((a, b) => (a.departure?.getTime() || 0) - (b.departure?.getTime() || 0))
                .map((r) => <GuestRow key={r.id} r={r} time={r.departure} variant="inhouse" />)}
        </Column>

        <Column title="Alertas activas" eyebrow="Atención" count={alertsList.length}>
          {alertsList.length === 0
            ? <Empty>Sin alertas operativas</Empty>
            : alertsList.map((a, i) => <AlertRow key={`${a.res.id}-${a.type}-${i}`} res={a.res} type={a.type} detail={a.detail} />)}
        </Column>
      </main>

      <Range fill={C.ink} height={70} />

      {isEmpty && (
        <div className="empty-overlay">
          <div className="empty-card">
            <MountainMark size={42} color={C.ink} />
            <div className="display" style={{ fontSize: 32, marginTop: 16, marginBottom: 12 }}>
              Configura los orígenes.
            </div>
            <p style={{ fontSize: 15, opacity: 0.75, marginBottom: 24 }}>
              Pega las URLs de tus dos Apps Scripts (Mews y HubSpot) en el panel admin para empezar.
              También puedes cargar datos demo para ver el panel funcionando.
            </p>
            <button onClick={() => onSwitchMode('admin')} className="btn">
              Ir al admin
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------- kiosk subcomponents ----------------------- */

function Stat({ label, value, sub, valueColor, onClick }) {
  const baseStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
  const interactiveStyle = onClick ? {
    background: 'transparent', border: 'none', padding: 0,
    color: 'inherit', font: 'inherit', textAlign: 'left',
    cursor: 'pointer',
  } : {};
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={onClick ? 'stat-clickable' : undefined} style={{ ...baseStyle, ...interactiveStyle }}>
      <span className="eyebrow eyebrow-sm" style={{ color: C.celeste, opacity: 0.85 }}>{label}</span>
      <span className="display tabular" style={{ fontSize: 40, lineHeight: 1, color: valueColor || C.amarillo }}>{value}</span>
      <span style={{ fontSize: 11, opacity: 0.65, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{sub}</span>
    </Tag>
  );
}

function OccupancyCells({ inHouse, capacity }) {
  const filled = Math.min(capacity, inHouse);
  const cells = Array.from({ length: capacity }, (_, i) => i < filled);
  return (
    <div style={{ marginTop: 20, display: 'flex', gap: 3 }}>
      {cells.map((on, i) => (
        <div key={i} style={{
          flex: 1, height: 8, borderRadius: 2,
          background: on ? C.amarillo : 'rgba(234,232,221,0.18)',
        }}/>
      ))}
    </div>
  );
}

function OccupancyForecast({ merged, capacity, now }) {
  const days = useMemo(() => {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d0 = new Date(start); d0.setDate(start.getDate() + i);
      const d1 = new Date(d0);    d1.setDate(d0.getDate() + 1);
      const k = dateKey(d0);
      let arrivals = 0, departures = 0, stayovers = 0;
      merged.forEach((r) => {
        const aK = dateKey(r.arrival);
        const dK = dateKey(r.departure);
        if (aK === k) arrivals++;
        if (dK === k) departures++;
        if (r.arrival && r.departure && r.arrival < d0 && r.departure >= d1) stayovers++;
      });
      const customers = arrivals + stayovers;
      out.push({ date: d0, arrivals, departures, stayovers, customers });
    }
    return out;
  }, [merged, now]);

  const cap = Math.max(capacity || 0, 1);
  const maxCustomers = Math.max(cap, ...days.map((d) => d.customers));
  const maxArrivals = Math.max(1, ...days.map((d) => d.arrivals), ...days.map((d) => d.departures));

  // chart geometry
  const W = 100, H = 36; // viewBox in % units (we use preserveAspectRatio="none")
  const xOf = (i) => (i / (days.length - 1)) * W;

  const occPts = days.map((d, i) => [xOf(i), H - (Math.min(d.customers, cap) / cap) * H]);
  const arrPts = days.map((d, i) => [xOf(i), H - (d.arrivals / maxArrivals) * H]);

  const smoothPath = (pts) => {
    if (pts.length < 2) return '';
    let p = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const cx = (x0 + x1) / 2;
      p += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return p;
  };

  const occPath = smoothPath(occPts);
  const occArea = `${occPath} L ${W} ${H} L 0 ${H} Z`;
  const arrPath = smoothPath(arrPts);

  const todayK = todayKey();

  return (
    <section style={{ margin: '14px 32px 0', padding: '14px 18px 16px', borderRadius: 16, border: `1.5px solid ${C.ink}`, background: C.cream }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>Ocupación · próximos 7 días</span>
          <h3 className="display" style={{ fontSize: 22, lineHeight: 1 }}>Previsión semanal</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="eyebrow eyebrow-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 3, background: C.ink, borderRadius: 2 }} />
            Huéspedes
          </span>
          <span className="eyebrow eyebrow-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 3, background: C.celeste, borderRadius: 2 }} />
            Llegadas
          </span>
          <span className="pastilla outline tabular eyebrow-sm">cap {cap}</span>
        </div>
      </header>

      <div style={{ position: 'relative', height: 120, marginBottom: 10 }}>
        {/* gridlines */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 1, background: C.ink15 }} />
          ))}
        </div>
        {/* axis labels (left = customers, right = arrivals/departures) */}
        <div style={{ position: 'absolute', left: -2, top: -6, bottom: -6, width: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.ink, opacity: 0.5 }}>
          <span>{maxCustomers}</span>
          <span>{Math.round(maxCustomers / 2)}</span>
          <span>0</span>
        </div>
        <div style={{ position: 'absolute', right: -2, top: -6, bottom: -6, width: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.celeste, opacity: 0.85 }}>
          <span>{maxArrivals}</span>
          <span>{Math.round(maxArrivals / 2)}</span>
          <span>0</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', left: 30, right: 28, top: 0, bottom: 0, width: 'calc(100% - 58px)', height: '100%', overflow: 'visible' }}>
          {/* arrival bars */}
          {days.map((d, i) => {
            const h = (d.arrivals / maxArrivals) * H;
            const w = 1.2;
            return (
              <rect
                key={`bar-${i}`}
                x={xOf(i) - w / 2} y={H - h}
                width={w} height={h}
                fill={C.ink} opacity={0.35}
              />
            );
          })}
          {/* occupancy area + line */}
          <path d={occArea} fill={C.ink} opacity={0.08} />
          <path d={occPath} fill="none" stroke={C.ink} strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
          {/* arrivals line */}
          <path d={arrPath} fill="none" stroke={C.celeste} strokeWidth="0.7" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          {/* dots */}
          {occPts.map(([x, y], i) => (
            <circle key={`o-${i}`} cx={x} cy={y} r="0.9" fill={C.ink} vectorEffect="non-scaling-stroke" />
          ))}
          {arrPts.map(([x, y], i) => (
            <circle key={`a-${i}`} cx={x} cy={y} r="0.7" fill={C.celeste} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>

      {/* day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: `90px repeat(${days.length}, 1fr)`, alignItems: 'center', gap: 4 }}>
        <span />
        {days.map((d, i) => {
          const isToday = dateKey(d.date) === todayK;
          const wd = d.date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
          const dm = `${d.date.getDate()}/${d.date.getMonth() + 1}`;
          return (
            <div key={`hd-${i}`} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span className="eyebrow eyebrow-sm" style={{ opacity: isToday ? 1 : 0.55, color: isToday ? C.ink : C.ink, fontSize: 9 }}>
                {wd}
              </span>
              <span className="tabular" style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, opacity: isToday ? 1 : 0.7 }}>
                {dm}
              </span>
            </div>
          );
        })}

        {[
          { label: 'Llegadas', key: 'arrivals', color: C.celeste },
          { label: 'Salidas', key: 'departures', color: C.ocre },
          { label: 'Estancias', key: 'stayovers', color: C.ink, dim: true },
          { label: 'Huéspedes', key: 'customers', color: C.ink, bold: true },
        ].map((row) => (
          <FragmentRow key={row.key} row={row} days={days} todayK={todayK} />
        ))}
      </div>
    </section>
  );
}

function FragmentRow({ row, days, todayK }) {
  return (
    <>
      <span className="eyebrow eyebrow-sm" style={{ opacity: 0.6, fontSize: 10 }}>{row.label}</span>
      {days.map((d, i) => {
        const isToday = dateKey(d.date) === todayK;
        const v = d[row.key];
        return (
          <span
            key={`${row.key}-${i}`}
            className="tabular"
            style={{
              textAlign: 'center',
              fontSize: 13,
              fontWeight: row.bold ? 700 : 400,
              color: v === 0 ? C.ink : row.color,
              opacity: row.dim && v === 0 ? 0.3 : v === 0 ? 0.35 : 1,
              padding: '4px 0',
              borderRadius: 6,
              background: isToday ? 'rgba(33,57,44,0.06)' : 'transparent',
            }}
          >
            {v}
          </span>
        );
      })}
    </>
  );
}

function CalendlyStrip({ events, todayCount }) {
  const tomorrowCount = events.length - todayCount;
  const MAX_VISIBLE = 5;
  const visible = events.slice(0, MAX_VISIBLE);
  const overflow = events.length - visible.length;

  return (
    <section style={{ margin: '14px 32px 0', padding: '12px 16px', borderRadius: 16, border: `1.5px solid ${C.ink}`, background: C.cream, display: 'flex', alignItems: 'center', gap: 14, minHeight: 76 }}>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 14, borderRight: `1px solid ${C.ink15}` }}>
        <span className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>Próximas citas</span>
        <span className="display tabular" style={{ fontSize: 22, lineHeight: 1 }}>
          {todayCount}
          <span style={{ opacity: 0.4, fontSize: 16 }}> hoy</span>
          {tomorrowCount > 0 && (
            <>
              <span style={{ opacity: 0.4, fontSize: 16 }}> · </span>
              {tomorrowCount}
              <span style={{ opacity: 0.4, fontSize: 16 }}> mañ</span>
            </>
          )}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 8, overflow: 'hidden' }}>
        {visible.length === 0 ? (
          <span className="eyebrow eyebrow-sm" style={{ opacity: 0.4, alignSelf: 'center' }}>
            Sin citas hoy ni mañana
          </span>
        ) : (
          visible.map((e) => <CalendlyCard key={e.id} event={e} />)
        )}
      </div>

      {overflow > 0 && (
        <span className="pastilla outline tabular eyebrow-sm" style={{ flexShrink: 0 }}>
          +{overflow} más
        </span>
      )}
    </section>
  );
}

function CalendlyCard({ event }) {
  const todayK = todayKey();
  const isToday = dateKey(event.time) === todayK;
  const t = event.time ? `${pad2(event.time.getHours())}:${pad2(event.time.getMinutes())}` : '--';
  const kindDef = CALENDLY_KINDS[event.kind] || CALENDLY_KINDS.other;
  const isVirtual = /meet|zoom|google|teams|virtual|online/i.test(event.location || '');

  return (
    <div className="fade-in" style={{
      flex: '1 1 0', minWidth: 0, maxWidth: 220,
      padding: '8px 12px', borderRadius: 12,
      border: `1.5px solid ${C.ink}`,
      background: isToday ? 'rgba(245, 245, 61, 0.12)' : C.cream,
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span className="eyebrow tabular" style={{ fontSize: 11 }}>
          {!isToday && <span style={{ opacity: 0.55, marginRight: 4 }}>MAÑ</span>}
          {t}
        </span>
        <span className={kindDef.pastilla} style={{ fontSize: 9, padding: '2px 7px' }}>
          {kindDef.label}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {event.invitee || '—'}
      </div>
      <div className="eyebrow eyebrow-sm" style={{ opacity: 0.65, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className="dot" style={{ background: isVirtual ? C.celeste : C.amarillo, width: 5, height: 5 }} />
        {event.host || event.location || event.eventName}
      </div>
    </div>
  );
}

function Column({ title, eyebrow, count, children }) {
  return (
    <section className="tile" style={{ minHeight: 0 }}>
      <header style={{ padding: '14px 18px 12px', borderBottom: `1.5px solid ${C.ink}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>{eyebrow}</span>
          <h2 className="display" style={{ fontSize: 28, lineHeight: 1 }}>{title}</h2>
        </div>
        <span className="pastilla outline tabular">{count}</span>
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

function TabbedColumn({ eyebrow, tabs }) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const active = tabs.find((t) => t.key === activeKey) || tabs[0];
  return (
    <section className="tile" style={{ minHeight: 0 }}>
      <header style={{ padding: '14px 18px 12px', borderBottom: `1.5px solid ${C.ink}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>{eyebrow}</span>
            <h2 className="display" style={{ fontSize: 28, lineHeight: 1 }}>{active.title}</h2>
          </div>
          <span className="pastilla outline tabular">{active.count}</span>
        </div>
        <div style={{ display: 'inline-flex', alignSelf: 'flex-start', borderRadius: 999, border: `1.5px solid ${C.ink}`, padding: 2, gap: 2 }}>
          {tabs.map((t) => {
            const isActive = t.key === activeKey;
            return (
              <button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                className="eyebrow eyebrow-sm"
                style={{
                  border: 'none', cursor: 'pointer',
                  padding: '5px 12px', borderRadius: 999,
                  background: isActive ? C.ink : 'transparent',
                  color: isActive ? C.cream : C.ink,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 10,
                  transition: 'background 160ms ease, color 160ms ease',
                }}
              >
                {t.label}
                <span className="tabular" style={{ opacity: 0.7, fontSize: 10 }}>{t.count}</span>
              </button>
            );
          })}
        </div>
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {active.content}
      </div>
    </section>
  );
}

function GuestRow({ r, time, variant }) {
  const flags = detectAlerts(r);
  const tint = topAlertTint(flags);
  const eyebrowLabel = (() => {
    if (!time) return '--';
    if (variant === 'inhouse') {
      return `Sale ${time.getDate()} ${time.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}`;
    }
    return `${pad2(time.getHours())}:${pad2(time.getMinutes())}`;
  })();
  const eyebrowIcon = variant === 'arrival' ? '↘' : variant === 'departure' ? '↗' : '●';
  const eyebrowColor = variant === 'arrival' ? C.ink : variant === 'departure' ? C.ocre : C.celeste;
  const breedSize = [r.breed, r.size].filter(Boolean).join(' · ');
  return (
    <div className={`row fade-in ${tint}`}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span className="eyebrow tabular" style={{ color: eyebrowColor }}>
          {eyebrowIcon} {eyebrowLabel}
        </span>
        <span className="eyebrow eyebrow-sm" style={{ opacity: 0.55, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.spaceType || r.service}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
        <span className="display" style={{ fontSize: 22, lineHeight: 1 }}>{r.pet || r.guest || '—'}</span>
        {r.pet && r.guest && (
          <span style={{ fontSize: 13, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            · {r.guest}
          </span>
        )}
      </div>
      {breedSize && (
        <span className="eyebrow eyebrow-sm" style={{ opacity: 0.5, marginTop: 1 }}>{breedSize}{r.weight ? ` · ${r.weight} kg` : ''}</span>
      )}
      {flags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
          {flags.map((f) => (
            <span key={f.type} className={ALERT_STYLES[f.type].pastilla}>
              {ALERT_STYLES[f.type].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({ res, type, detail }) {
  const def = ALERT_STYLES[type];
  return (
    <div className={`row fade-in ${def.tint}`}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span className="display" style={{ fontSize: 22, lineHeight: 1 }}>{res.pet || res.guest}</span>
        <span className={def.pastilla}>{def.label}</span>
      </div>
      {res.pet && res.guest && (
        <span className="eyebrow eyebrow-sm" style={{ opacity: 0.55, marginTop: 2 }}>
          {res.guest} · {res.spaceType || res.service}
        </span>
      )}
      <p style={{ fontSize: 13, lineHeight: 1.45, marginTop: 6 }}>{detail}</p>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', minHeight: 120 }}>
      <span className="eyebrow eyebrow-sm" style={{ opacity: 0.4 }}>{children}</span>
    </div>
  );
}

/* ============================================================
   ADMIN VIEW
   ============================================================ */

function AdminView({ config, meta, merged, pending, calendlyEvents, bridgeReservations, fetchErrors, refreshing, onSaveConfig, onSaveCapacity, onRefresh, onLoadDemo, onClearCache, onSwitchMode }) {
  const [draft, setDraft] = useState(config);
  const [capInput, setCapInput] = useState(meta.capacity);
  const [showScript, setShowScript] = useState(false);

  useEffect(() => setDraft(config), [config]);
  useEffect(() => setCapInput(meta.capacity), [meta.capacity]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  return (
    <div style={{ position: 'relative', minHeight: '100vh', paddingBottom: 100 }}>
      <PeakTL height={50} />
      <PeakTR height={50} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 0' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32, position: 'relative', zIndex: 5, gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <MountainMark size={36} />
            <div>
              <Wordmark size={36} />
              <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginTop: 4 }}>Operaciones · Admin</div>
            </div>
          </div>
          <button onClick={() => onSwitchMode('kiosk')} className="btn">
            Volver al kiosco
          </button>
        </header>

        {/* Sources config */}
        <div className="tile" style={{ padding: 28 }}>
          <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>Orígenes de datos</div>
          <h3 className="display" style={{ fontSize: 32, lineHeight: 1, marginTop: 4, marginBottom: 8 }}>Google Sheets · Apps Script</h3>
          <p style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.55, marginBottom: 24, maxWidth: 720 }}>
            Pega las URLs de los web apps de Apps Script y la clave secreta que configuraste en cada script.
            Si necesitas la plantilla del script, ábrela debajo.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
            <SourceField
              title="Mews · Reservas"
              eyebrow="Origen 1"
              status={merged.length > 0 ? `${merged.length} reservas` : 'sin datos'}
              error={fetchErrors.mews}
              urlValue={draft.mewsUrl}
              keyValue={draft.mewsKey}
              onUrlChange={(v) => setDraft({ ...draft, mewsUrl: v })}
              onKeyChange={(v) => setDraft({ ...draft, mewsKey: v })}
            />
            <SourceField
              title="HubSpot · Intake"
              eyebrow="Origen 2"
              status={pending.length > 0 ? `${pending.length} sin reserva` : 'enriquecimiento'}
              error={fetchErrors.hubspot}
              urlValue={draft.hubspotUrl}
              keyValue={draft.hubspotKey}
              onUrlChange={(v) => setDraft({ ...draft, hubspotUrl: v })}
              onKeyChange={(v) => setDraft({ ...draft, hubspotKey: v })}
              tone="celeste"
            />
            <SourceField
              title="Calendly · Citas"
              eyebrow="Origen 3"
              status={calendlyEvents.length > 0 ? `${calendlyEvents.length} eventos` : 'sin datos'}
              error={fetchErrors.calendly}
              urlValue={draft.calendlyUrl}
              keyValue={draft.calendlyKey}
              onUrlChange={(v) => setDraft({ ...draft, calendlyUrl: v })}
              onKeyChange={(v) => setDraft({ ...draft, calendlyKey: v })}
              tone="lila"
            />
            <SourceField
              title="Mews Bridge · Vista mensual"
              eyebrow="Origen 4"
              status={bridgeReservations.length > 0 ? `${bridgeReservations.length} reservas` : 'sin datos'}
              error={fetchErrors.bridge}
              urlValue={draft.bridgeUrl}
              keyValue={draft.bridgeKey}
              onUrlChange={(v) => setDraft({ ...draft, bridgeUrl: v })}
              onKeyChange={(v) => setDraft({ ...draft, bridgeKey: v })}
              tone="ocre"
            />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => onSaveConfig(draft)} disabled={!dirty} className="btn">
              Guardar configuración
            </button>
            <button onClick={onRefresh} disabled={refreshing || (!draft.mewsUrl && !draft.hubspotUrl && !draft.calendlyUrl && !draft.bridgeUrl)} className="btn celeste">
              {refreshing ? 'Actualizando…' : 'Probar / actualizar ahora'}
            </button>
            {dirty && <span className="eyebrow eyebrow-sm" style={{ color: C.brick }}>cambios sin guardar</span>}
            {meta.lastUpdated && !dirty && (
              <span className="eyebrow eyebrow-sm" style={{ opacity: 0.55 }}>
                última actualización: {new Date(meta.lastUpdated).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* Capacity — compact single row */}
        <div className="tile" style={{ padding: '12px 16px', marginTop: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="eyebrow eyebrow-sm" style={{ opacity: 0.7 }}>Capacidad total</span>
          <input
            type="number"
            value={capInput}
            onChange={(e) => setCapInput(Number(e.target.value) || 0)}
            className="input tabular"
            style={{ width: 70, fontSize: 14, textAlign: 'center', padding: '6px 8px' }}
            min={1}
          />
          <button onClick={() => onSaveCapacity(capInput)} className="btn celeste" style={{ padding: '6px 12px', fontSize: 13 }}>Guardar</button>
          <span className="eyebrow eyebrow-sm" style={{ opacity: 0.5 }}>Actual: {meta.capacity}</span>
        </div>

        {/* Apps Script template */}
        <div className="tile" style={{ padding: 24, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>Recetas</div>
              <h3 className="display" style={{ fontSize: 28, lineHeight: 1, marginTop: 4 }}>Plantilla del Apps Script</h3>
            </div>
            <button onClick={() => setShowScript((s) => !s)} className="btn secondary sm">
              {showScript ? 'Ocultar' : 'Ver código'}
            </button>
          </div>
          <p style={{ fontSize: 14, opacity: 0.75, marginTop: 12, marginBottom: 16 }}>
            Pega esto en Extensiones → Apps Script de cada hoja. Cambia la SECRET, despliega como web app
            (Ejecutar como: yo / Acceso: cualquier persona) y copia la URL aquí arriba.
          </p>
          {showScript && (
            <pre className="code-block">{APPS_SCRIPT_TEMPLATE}</pre>
          )}
        </div>

        {/* Quick actions */}
        <div className="tile" style={{ padding: 24, marginTop: 20 }}>
          <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>Atajos</div>
          <h3 className="display" style={{ fontSize: 28, lineHeight: 1, marginTop: 4, marginBottom: 16 }}>Acciones rápidas</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button onClick={onLoadDemo} className="btn">Cargar datos demo</button>
            <button onClick={() => { if (confirm('¿Borrar caché local?')) onClearCache(); }} className="btn danger">
              Borrar caché
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="tile" style={{ padding: 24, marginTop: 20 }}>
          <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>Estado</div>
          <h3 className="display" style={{ fontSize: 28, lineHeight: 1, marginTop: 4, marginBottom: 16 }}>Datos en sistema</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            <StatusItem label="Reservas (Mews)" value={String(merged.length)} />
            <StatusItem label="Por confirmar" value={String(pending.length)} />
            <StatusItem label="Con dossier HubSpot" value={String(merged.filter((r) => r._hasHubspot).length)} />
            <StatusItem label="Citas (Calendly)" value={String(calendlyEvents.length)} />
            <StatusItem label="Reservas (Bridge)" value={String(bridgeReservations.length)} />
            <StatusItem label="Capacidad" value={String(meta.capacity)} />
          </div>
        </div>

        <div style={{ marginTop: 32, padding: 20, background: 'rgba(33,57,44,0.04)', borderRadius: 16, fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>
          <p style={{ marginBottom: 8 }}>
            <strong style={{ letterSpacing: '0.05em' }}>Cómo funciona.</strong>{' '}
            La configuración y la caché se guardan en almacenamiento compartido. Cualquier dispositivo viendo la app
            verá los mismos orígenes y los mismos datos. La vista de kiosco se actualiza automáticamente cada 60 segundos.
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong style={{ letterSpacing: '0.05em' }}>Match de fuentes.</strong>{' '}
            Mews es la fuente de verdad para las reservas. HubSpot enriquece con el dossier del perro
            (alergias, patologías, medicación, dieta) cruzando por <code style={{ background: C.amarillo, padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>email</code>.
            Si una intake de HubSpot no tiene Mews aún, aparece como <strong>Por confirmar</strong>.
          </p>
          <p>
            <strong style={{ letterSpacing: '0.05em' }}>Acceso al admin.</strong>{' '}
            Añade <code style={{ background: C.amarillo, padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>#admin</code> al final de la URL para volver aquí desde cualquier dispositivo.
          </p>
        </div>
      </div>
    </div>
  );
}

function SourceField({ title, eyebrow, status, error, urlValue, keyValue, onUrlChange, onKeyChange, tone = 'amarillo' }) {
  const bg = tone === 'celeste' ? 'rgba(120, 217, 216, 0.08)'
           : tone === 'lila'    ? 'rgba(173, 149, 230, 0.10)'
           : tone === 'ocre'    ? 'rgba(191, 178, 0, 0.10)'
           :                      'rgba(245, 245, 61, 0.08)';
  return (
    <div style={{ border: `1.5px solid ${C.ink}`, borderRadius: 16, padding: 20, background: bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>{eyebrow}</span>
        <span className={`pastilla outline eyebrow-sm`} style={{ fontSize: 9 }}>{status}</span>
      </div>
      <h4 className="display" style={{ fontSize: 24, lineHeight: 1, marginBottom: 14 }}>{title}</h4>

      <label className="eyebrow eyebrow-sm" style={{ display: 'block', marginBottom: 6, opacity: 0.7 }}>URL del Apps Script</label>
      <input
        type="url"
        value={urlValue}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://script.google.com/macros/s/.../exec"
        className="input mono"
        style={{ marginBottom: 12 }}
      />

      <label className="eyebrow eyebrow-sm" style={{ display: 'block', marginBottom: 6, opacity: 0.7 }}>Clave secreta</label>
      <input
        type="text"
        value={keyValue}
        onChange={(e) => onKeyChange(e.target.value)}
        placeholder="doggos-ops-..."
        className="input mono"
      />

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(162,58,42,0.12)', border: `1.5px solid ${C.brick}`, color: C.brick, fontSize: 12 }}>
          <strong style={{ letterSpacing: '0.06em' }}>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}

function StatusItem({ label, value }) {
  return (
    <div>
      <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6 }}>{label}</div>
      <div className="display tabular" style={{ fontSize: 28, lineHeight: 1, marginTop: 6 }}>{value}</div>
    </div>
  );
}

const APPS_SCRIPT_TEMPLATE = `// doggos · Sheets → JSON proxy
// Paste in Extensions → Apps Script of each sheet.
// 1) Change SECRET below.
// 2) Deploy → New deployment → Web app
//    · Execute as: Me
//    · Who has access: Anyone
// 3) Copy the /exec URL into the dashboard admin.

const SECRET = "doggos-ops-CHANGE-THIS";
const SHEET_NAME = "";  // empty = first sheet, or set tab name

function doGet(e) {
  if (e.parameter.key !== SECRET) {
    return out({ error: "unauthorized" });
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return out([]);

    // Disambiguate duplicate headers (e.g. two "Dirección" columns)
    const seen = {};
    const headers = data[0].map(h => {
      const name = String(h).trim();
      const count = (seen[name] || 0) + 1;
      seen[name] = count;
      return count === 1 ? name : name + " (" + count + ")";
    });

    const rows = data.slice(1)
      .filter(r => r.some(c => c !== "" && c !== null))
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => {
          let v = row[i];
          if (v instanceof Date) v = v.toISOString();
          obj[h] = v;
        });
        return obj;
      });
    return out(rows);
  } catch (err) {
    return out({ error: err.toString() });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;

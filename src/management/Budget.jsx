import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computePnL } from './PnL.jsx';
import { fetchBudget, saveBudget } from './budgetApi.js';

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

const zeros = () => Array(12).fill(0);
const daysInMonth = (year, m) => new Date(year, m + 1, 0).getDate();

// Revenue is budgeted in gross euros — the price the customer pays, IVA
// included — because that is the number anyone quoting a stay thinks in.
// Only the net part is revenue: the IVA is collected on behalf of Hacienda.
// Extracting it from a gross amount is a division, not a subtraction:
//   neto = bruto / 1,21     (100 € brutos → 82,64 € netos)
//   iva  = bruto − neto     (100 € brutos → 17,36 €, i.e. 17,36% of gross)
// Subtracting 21% of the gross instead would understate revenue by ~4%.
const IVA_PCT = 21;
const netOf = (gross) => gross / (1 + IVA_PCT / 100);

/* ------------------------------------------------------------------ *
 * Default skeleton — used the first time the budget is opened (or any
 * time the `budget` tab holds nothing for the year). Every label is
 * editable in the UI, so these are a starting point, not a schema.
 * ------------------------------------------------------------------ */

const DEFAULT_REVENUE_LINES = [
  { id: 'rev_transportes',   label: 'Transportes' },
  { id: 'rev_guarderia',     label: 'Guardería' },
  { id: 'rev_lavado',        label: 'Lavado' },
  { id: 'rev_late_checkout', label: 'Late checkout' },
  { id: 'rev_otros',         label: 'Otros ingresos' },
];

const DEFAULT_EXPENSE_SECTIONS = [
  { id: 'exp_personal', label: 'Personal', kind: 'expense', lines: [
    { id: 'exp_nominas',     label: 'Nóminas cuidadores' },
    { id: 'exp_direccion',   label: 'Nóminas dirección' },
    { id: 'exp_ss',          label: 'Seguridad Social' },
    { id: 'exp_formacion',   label: 'Formación y EPIs' },
  ]},
  { id: 'exp_instalacion', label: 'Instalación', kind: 'expense', lines: [
    { id: 'exp_alquiler',      label: 'Alquiler' },
    { id: 'exp_suministros',   label: 'Suministros (luz, agua, gas)' },
    { id: 'exp_telecom',       label: 'Internet y telefonía' },
    { id: 'exp_mantenimiento', label: 'Mantenimiento y reparaciones' },
    { id: 'exp_limpieza',      label: 'Limpieza y consumibles' },
  ]},
  { id: 'exp_animal', label: 'Operación animal', kind: 'expense', lines: [
    { id: 'exp_alimentacion', label: 'Alimentación' },
    { id: 'exp_veterinario',  label: 'Veterinario y medicación' },
    { id: 'exp_material',     label: 'Material (camas, juguetes)' },
    { id: 'exp_lavanderia',   label: 'Lavandería' },
  ]},
  { id: 'exp_transporte', label: 'Transporte', kind: 'expense', lines: [
    { id: 'exp_combustible',   label: 'Combustible y peajes' },
    { id: 'exp_veh_mant',      label: 'Mantenimiento vehículos' },
    { id: 'exp_veh_seguro',    label: 'Seguro vehículos' },
  ]},
  { id: 'exp_marketing', label: 'Marketing y ventas', kind: 'expense', lines: [
    { id: 'exp_ads',        label: 'Publicidad online (Google, Meta)' },
    { id: 'exp_contenido',  label: 'Contenido y agencia' },
    { id: 'exp_comisiones', label: 'Comisiones plataformas' },
  ]},
  { id: 'exp_admin', label: 'Administración', kind: 'expense', lines: [
    { id: 'exp_gestoria',  label: 'Gestoría y contabilidad' },
    { id: 'exp_software',  label: 'Software (Mews, HubSpot, etc.)' },
    { id: 'exp_seguros',   label: 'Seguros (RC, local)' },
    { id: 'exp_bancarios', label: 'Gastos bancarios y TPV' },
    { id: 'exp_otros',     label: 'Otros' },
  ]},
  { id: 'exp_amortizaciones', label: 'Amortizaciones', kind: 'amort', lines: [
    { id: 'exp_amort_inst', label: 'Amortización instalaciones' },
    { id: 'exp_amort_veh',  label: 'Amortización vehículos' },
  ]},
];

function defaultState() {
  return {
    occ: zeros(),
    adr: zeros(),
    revenue: DEFAULT_REVENUE_LINES.map((l) => ({ ...l, values: zeros() })),
    sections: DEFAULT_EXPENSE_SECTIONS.map((s) => ({
      ...s,
      lines: s.lines.map((l) => ({ ...l, values: zeros() })),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Wire format ↔ UI state
 * ------------------------------------------------------------------ */

export function toRows(state) {
  const rows = [
    { type: 'driver', sectionId: 'drivers', sectionLabel: 'Drivers', lineId: 'occ_pct', lineLabel: 'Ocupación %', values: state.occ },
    { type: 'driver', sectionId: 'drivers', sectionLabel: 'Drivers', lineId: 'adr',     lineLabel: 'ADR',         values: state.adr },
  ];
  for (const l of state.revenue) {
    rows.push({ type: 'revenue', sectionId: 'revenue', sectionLabel: 'Ingresos', lineId: l.id, lineLabel: l.label, values: l.values });
  }
  for (const s of state.sections) {
    for (const l of s.lines) {
      rows.push({ type: s.kind, sectionId: s.id, sectionLabel: s.label, lineId: l.id, lineLabel: l.label, values: l.values });
    }
  }
  return rows;
}

export function fromRows(rows) {
  if (!rows || rows.length === 0) return null;
  const st = { occ: zeros(), adr: zeros(), revenue: [], sections: [] };
  const bySection = new Map();

  for (const r of rows) {
    const values = Array.from({ length: 12 }, (_, i) => Number(r.values?.[i]) || 0);
    if (r.type === 'driver') {
      if (r.lineId === 'occ_pct') st.occ = values;
      if (r.lineId === 'adr') st.adr = values;
      continue;
    }
    if (r.type === 'revenue') {
      st.revenue.push({ id: r.lineId, label: r.lineLabel, values });
      continue;
    }
    if (r.type === 'expense' || r.type === 'amort') {
      if (!bySection.has(r.sectionId)) {
        bySection.set(r.sectionId, { id: r.sectionId, label: r.sectionLabel || r.sectionId, kind: r.type, lines: [] });
      }
      bySection.get(r.sectionId).lines.push({ id: r.lineId, label: r.lineLabel, values });
    }
  }

  st.sections = [...bySection.values()];
  // Amortizaciones (and anything else below EBITDA) always render last.
  st.sections.sort((a, b) => (a.kind === 'amort' ? 1 : 0) - (b.kind === 'amort' ? 1 : 0));
  return st;
}

/* ------------------------------------------------------------------ *
 * Seeding from history
 *
 * The budget starts from what actually happened, not from a blank grid.
 * For each month we take the occupancy and ADR of the best available
 * closed month: the same month of the current year if it has already
 * closed, else the same month a year earlier, else the average of the
 * months we do have. The chosen source is reported back so the UI can
 * say which months are real and which are filled in.
 * ------------------------------------------------------------------ */

export function seedFromHistory({ pnlA, pnlB, labelA, labelB, deltaOccPP = 0, deltaAdrPct = 0 }) {
  const pick = (pnl, m) => {
    if (!pnl) return null;
    const mm = pnl.months[m];
    if (!mm || !mm.is_actual || mm.room_nights <= 0) return null;
    return { occ: mm.occupancy_pct * 100, adr: mm.adr };
  };

  const base = Array.from({ length: 12 }, (_, m) => {
    const a = pick(pnlA, m);
    if (a) return { ...a, source: labelA };
    const b = pick(pnlB, m);
    if (b) return { ...b, source: labelB };
    return null;
  });

  const known = base.filter(Boolean);
  if (known.length === 0) return null;
  const avgOcc = known.reduce((s, k) => s + k.occ, 0) / known.length;
  const avgAdr = known.reduce((s, k) => s + k.adr, 0) / known.length;

  const filled = base.map((b) => b || { occ: avgOcc, adr: avgAdr, source: 'media' });

  return {
    occ: filled.map((b) => Math.max(0, Math.min(100, Math.round((b.occ + deltaOccPP) * 10) / 10))),
    adr: filled.map((b) => Math.max(0, Math.round(b.adr * (1 + deltaAdrPct / 100) * 10) / 10)),
    sources: filled.map((b) => b.source),
  };
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

function fmtEUR(n, { compact = false } = {}) {
  if (n == null || isNaN(n)) return '—';
  if (compact && Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${Math.round(n).toLocaleString('es-ES')}€`;
}
function fmtPct(p, decimals = 0) {
  if (p == null || isNaN(p)) return '—';
  return `${(p * 100).toFixed(decimals)}%`;
}
function fmtNum(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
/**
 * Accept what people actually type: "1234", "1.234", "1,5", "1.234,50",
 * "62.5", "1,234.50". Whichever separator comes last is the decimal one;
 * a lone dot or comma is a decimal point unless it looks like a thousands
 * group (exactly three digits after it, e.g. "1.234").
 */
function parseNum(s) {
  if (s == null) return 0;
  let t = String(s).replace(/[€%\s]/g, '');
  if (!t) return 0;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    t = t.slice(0, dec).replace(/[.,]/g, '') + '.' + t.slice(dec + 1).replace(/[.,]/g, '');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = t.split(sep);
    const tail = parts[parts.length - 1];
    const grouped = parts.length > 2 || (tail.length === 3 && parts[0].length > 0 && parts[0].length <= 3);
    t = grouped ? parts.join('') : parts.slice(0, -1).join('') + '.' + tail;
  }
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function Budget({
  year = 2027,
  reservations = [],
  reservations2025 = [],
  capacity = 42,
  now = new Date(),
  hubspotUrl = '',
  hubspotKey = '',
}) {
  const [state, setState] = useState(defaultState);
  const [status, setStatus] = useState('loading'); // loading | idle | saving | error
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedOcc, setSeedOcc] = useState('0');
  const [seedAdr, setSeedAdr] = useState('0');
  const [seedNote, setSeedNote] = useState(null);
  const loadedRef = useRef(false);

  const refYear = now.getFullYear();               // the year we compare against
  const pnlRef = useMemo(
    () => computePnL(reservations, refYear, capacity, now),
    [reservations, refYear, capacity, now],
  );
  const pnlPrev = useMemo(
    () => computePnL(reservations2025, refYear - 1, capacity, now),
    [reservations2025, refYear, capacity, now],
  );

  /* ---- load ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hubspotUrl) {
        setStatus('idle');
        setError('Sin URL del bridge de HubSpot: el presupuesto no se puede cargar ni guardar. Configúrala en admin.');
        loadedRef.current = true;
        return;
      }
      try {
        const rows = await fetchBudget(hubspotUrl, hubspotKey, year);
        if (cancelled) return;
        const loaded = fromRows(rows);
        if (loaded) {
          setState(loaded);
          setSavedAt(rows.map((r) => r.updatedAt).filter(Boolean).sort().pop() || null);
        }
        setStatus('idle');
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setStatus('idle');
        setError(`No se pudo cargar el presupuesto: ${e.message}`);
      } finally {
        loadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [hubspotUrl, hubspotKey, year]);

  /* ---- unsaved-changes guard ---- */
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const mutate = useCallback((fn) => {
    setState((prev) => {
      const next = fn(structuredClone(prev));
      return next;
    });
    setDirty(true);
  }, []);

  /* ---- derived numbers ---- */
  const calc = useMemo(() => {
    const avail = Array.from({ length: 12 }, (_, m) => capacity * daysInMonth(year, m));
    const roomNights = avail.map((a, m) => a * (state.occ[m] || 0) / 100);
    const lodging = roomNights.map((rn, m) => rn * (state.adr[m] || 0));

    const revenueExtra = Array.from({ length: 12 }, (_, m) =>
      state.revenue.reduce((s, l) => s + (l.values[m] || 0), 0));
    // Gross = what is typed in (IVA included). Net = what actually counts as
    // revenue, and what every margin below is measured against.
    const revenueGross = lodging.map((v, m) => v + revenueExtra[m]);
    const revenueNet = revenueGross.map(netOf);
    const iva = revenueGross.map((v, m) => v - revenueNet[m]);

    const sectionTotals = state.sections.map((s) =>
      Array.from({ length: 12 }, (_, m) => s.lines.reduce((acc, l) => acc + (l.values[m] || 0), 0)));

    const opex = Array.from({ length: 12 }, (_, m) =>
      state.sections.reduce((acc, s, i) => acc + (s.kind === 'expense' ? sectionTotals[i][m] : 0), 0));
    const amort = Array.from({ length: 12 }, (_, m) =>
      state.sections.reduce((acc, s, i) => acc + (s.kind === 'amort' ? sectionTotals[i][m] : 0), 0));

    const ebitda = revenueNet.map((v, m) => v - opex[m]);
    const ebit = ebitda.map((v, m) => v - amort[m]);
    const margin = revenueNet.map((v, m) => (v > 0 ? ebitda[m] / v : null));

    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const fy = {
      avail: sum(avail),
      roomNights: sum(roomNights),
      lodging: sum(lodging),
      revenueGross: sum(revenueGross),
      revenueNet:   sum(revenueNet),
      iva:          sum(iva),
      opex: sum(opex),
      amort: sum(amort),
      ebitda: sum(ebitda),
      ebit: sum(ebit),
    };
    fy.occ = fy.avail > 0 ? fy.roomNights / fy.avail : 0;
    fy.adr = fy.roomNights > 0 ? fy.lodging / fy.roomNights : 0;
    fy.revpar = fy.avail > 0 ? fy.revenueNet / fy.avail : 0;
    fy.margin = fy.revenueNet > 0 ? fy.ebitda / fy.revenueNet : null;

    return { avail, roomNights, lodging, revenueExtra, revenueGross, revenueNet, iva, sectionTotals, opex, amort, ebitda, ebit, margin, fy };
  }, [state, capacity, year]);

  // Mews totals are what the customer paid, i.e. gross, so the year-on-year
  // comparison is gross against gross. Comparing this year's net to last
  // year's gross would invent a ~17% drop out of nothing.
  const refRevenue = pnlRef.fy.projected || pnlRef.fy.rooms_revenue || 0;
  const growthVsRef = refRevenue > 0 ? calc.fy.revenueGross / refRevenue - 1 : null;

  /* ---- actions ---- */
  const onSave = async () => {
    if (!hubspotUrl) { setError('Falta la URL del bridge de HubSpot (admin).'); return; }
    setStatus('saving');
    setError(null);
    try {
      const res = await saveBudget(hubspotUrl, hubspotKey, year, toRows(state));
      setDirty(false);
      setSavedAt(res?.updated_at || new Date().toISOString());
      setStatus('idle');
    } catch (e) {
      setStatus('idle');
      setError(`No se pudo guardar: ${e.message}`);
    }
  };

  const applySeed = () => {
    const seeded = seedFromHistory({
      pnlA: pnlRef,
      pnlB: pnlPrev,
      labelA: String(refYear),
      labelB: String(refYear - 1),
      deltaOccPP: parseNum(seedOcc),
      deltaAdrPct: parseNum(seedAdr),
    });
    if (!seeded) {
      setSeedNote('No hay meses cerrados con datos suficientes para sembrar.');
      return;
    }
    mutate((s) => { s.occ = seeded.occ; s.adr = seeded.adr; return s; });
    const counts = seeded.sources.reduce((acc, src) => { acc[src] = (acc[src] || 0) + 1; return acc; }, {});
    setSeedNote(
      'Sembrado: ' + Object.entries(counts).map(([k, v]) => `${v} ${v === 1 ? 'mes' : 'meses'} de ${k}`).join(', ') + '.',
    );
  };

  const fillRight = (getter, setter) => {
    const v = getter()[0];
    setter(Array(12).fill(v));
  };

  const lastUpdated = savedAt
    ? new Date(savedAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={{ padding: '32px 32px 80px', maxWidth: 1600, margin: '0 auto' }}>
      <style>{`
        .bud-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
        .bud-table th, .bud-table td { padding: 6px 8px; text-align: right; white-space: nowrap; }
        .bud-table th.bud-label, .bud-table td.bud-label { text-align: left; font-weight: 700; }
        .bud-table thead th { font-family: 'GT Zirkon', sans-serif; font-weight: 700; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: ${C.ink}; opacity: 0.55; padding-top: 12px; padding-bottom: 12px; border-bottom: 1.5px solid ${C.ink}; background: ${C.cream}; position: sticky; top: 0; z-index: 2; }
        .bud-table thead th.bud-fy { background: rgba(33,57,44,0.10); opacity: 1; color: ${C.ink}; border-left: 1.5px solid ${C.ink15}; }
        .bud-section-row td { background: ${C.ink08}; color: ${C.ink}; font-family: 'GT Zirkon', sans-serif; font-weight: 700; font-size: 10px; letter-spacing: 0.20em; text-transform: uppercase; opacity: 0.75; padding-top: 14px; padding-bottom: 5px; }
        .bud-row td { border-bottom: 1px solid ${C.ink08}; }
        .bud-row.bud-bold td { font-weight: 700; border-top: 1.5px solid ${C.ink15}; }
        .bud-row.bud-key td { background: ${C.amarillo}; font-weight: 700; border-top: 1.5px solid ${C.ink}; }
        .bud-row.bud-sub td { font-weight: 700; background: rgba(33,57,44,0.04); }
        .bud-cell-fy { background: rgba(33,57,44,0.06); border-left: 1.5px solid ${C.ink15}; font-weight: 700; }
        .bud-row.bud-key td.bud-cell-fy { background: ${C.ocre}; color: ${C.ink}; }
        .bud-input { width: 100%; min-width: 58px; border: 1px solid transparent; background: transparent; font: inherit; font-size: 13px; color: ${C.ink}; text-align: right; padding: 2px 4px; border-radius: 4px; font-variant-numeric: tabular-nums; }
        .bud-input:hover { border-color: ${C.ink15}; }
        .bud-input:focus { outline: none; border-color: ${C.ink}; background: #fff; }
        .bud-label-input { width: 100%; min-width: 180px; border: 1px solid transparent; background: transparent; font: inherit; font-size: 13px; font-weight: 700; color: ${C.ink}; padding: 2px 4px; border-radius: 4px; }
        .bud-label-input:hover { border-color: ${C.ink15}; }
        .bud-label-input:focus { outline: none; border-color: ${C.ink}; background: #fff; }
        .bud-mini { border: 1px solid ${C.ink15}; background: transparent; color: ${C.ink}; border-radius: 4px; font-size: 10px; line-height: 1; padding: 3px 5px; cursor: pointer; opacity: 0.45; font-family: inherit; }
        .bud-mini:hover { opacity: 1; background: ${C.amarillo}; border-color: ${C.ink}; }
        .bud-add { border: 1px dashed ${C.ink15}; background: transparent; color: ${C.ink}; border-radius: 6px; font-size: 11px; padding: 5px 10px; cursor: pointer; opacity: 0.6; font-family: inherit; }
        .bud-add:hover { opacity: 1; border-color: ${C.ink}; background: rgba(245,245,61,0.25); }
        .bud-negative { color: ${C.brick}; }
      `}</style>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="display" style={{ fontSize: 52, lineHeight: 0.95, color: C.ink, marginBottom: 6 }}>
            Presupuesto {year}
          </h1>
          <div className="eyebrow" style={{ opacity: 0.65, fontSize: 11 }}>
            ENE {String(year).slice(2)} — DIC {String(year).slice(2)} · {capacity} PLAZAS ·{' '}
            {status === 'loading' ? 'CARGANDO…'
              : dirty ? 'CAMBIOS SIN GUARDAR'
              : lastUpdated ? `GUARDADO ${lastUpdated.toUpperCase()}`
              : 'SIN GUARDAR TODAVÍA'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setSeedOpen((v) => !v)}
            className="btn"
            style={{ background: 'transparent', border: `1.5px solid ${C.ink}`, color: C.ink, padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
          >
            Sembrar desde histórico
          </button>
          <button
            onClick={onSave}
            disabled={status === 'saving' || !dirty || !hubspotUrl}
            style={{
              background: dirty && hubspotUrl ? C.amarillo : 'transparent',
              border: `1.5px solid ${C.ink}`, color: C.ink,
              padding: '9px 18px', borderRadius: 8, fontWeight: 700, fontFamily: 'inherit', fontSize: 13,
              cursor: dirty && hubspotUrl ? 'pointer' : 'default',
              opacity: dirty && hubspotUrl ? 1 : 0.45,
            }}
          >
            {status === 'saving' ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </header>

      {error && (
        <div className="tile" style={{ padding: 12, marginBottom: 16, background: 'rgba(162,58,42,0.10)', border: `1.5px solid ${C.brick}`, fontSize: 12.5, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {/* Seed panel */}
      {seedOpen && (
        <div className="tile" style={{ padding: 16, marginBottom: 16, border: `1.5px solid ${C.ink}` }}>
          <div className="eyebrow eyebrow-sm" style={{ opacity: 0.7, marginBottom: 8 }}>SEMBRAR OCUPACIÓN Y ADR</div>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, opacity: 0.8, marginBottom: 12, maxWidth: 760 }}>
            Rellena los 12 meses de ocupación y ADR con lo que pasó de verdad: para cada mes se toma el mismo mes
            de {refYear} si ya está cerrado, si no el de {refYear - 1}, y si tampoco hay, la media de los meses
            disponibles. Después aplica tus incrementos. Sobrescribe los drivers actuales; los gastos no se tocan.
          </p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12 }}>
              <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginBottom: 4 }}>Δ OCUPACIÓN (PP)</div>
              <input value={seedOcc} onChange={(e) => setSeedOcc(e.target.value)} inputMode="decimal"
                style={{ width: 90, padding: '7px 9px', border: `1.5px solid ${C.ink15}`, borderRadius: 6, font: 'inherit', fontSize: 13 }} />
            </label>
            <label style={{ fontSize: 12 }}>
              <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginBottom: 4 }}>Δ ADR (%)</div>
              <input value={seedAdr} onChange={(e) => setSeedAdr(e.target.value)} inputMode="decimal"
                style={{ width: 90, padding: '7px 9px', border: `1.5px solid ${C.ink15}`, borderRadius: 6, font: 'inherit', fontSize: 13 }} />
            </label>
            <button onClick={applySeed}
              style={{ background: C.amarillo, border: `1.5px solid ${C.ink}`, color: C.ink, padding: '9px 16px', borderRadius: 8, fontWeight: 700, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>
              Aplicar
            </button>
            {seedNote && <span style={{ fontSize: 12, opacity: 0.7 }}>{seedNote}</span>}
          </div>
        </div>
      )}

      {/* Metric strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Metric label={`Ingresos netos ${year}`} value={fmtEUR(calc.fy.revenueNet, { compact: true })}
          sub={`${fmtEUR(calc.fy.revenueGross, { compact: true })} brutos${growthVsRef != null ? ` · ${growthVsRef >= 0 ? '+' : ''}${(growthVsRef * 100).toFixed(0)}% vs ${refYear}` : ''}`} />
        <Metric label="Gastos operativos" value={fmtEUR(calc.fy.opex, { compact: true })} />
        <Metric label="EBITDA" value={fmtEUR(calc.fy.ebitda, { compact: true })} negative={calc.fy.ebitda < 0} />
        <Metric label="Margen EBITDA" value={fmtPct(calc.fy.margin)} negative={(calc.fy.margin ?? 0) < 0} />
        <Metric label="Ocupación media" value={fmtPct(calc.fy.occ)} />
        <Metric label="ADR medio" value={fmtEUR(calc.fy.adr)} />
      </div>

      {/* Table */}
      <div className="tile" style={{ padding: 0, overflow: 'auto' }}>
        <table className="bud-table">
          <thead>
            <tr>
              <th className="bud-label" style={{ minWidth: 230 }}>Línea</th>
              {MONTHS_ES.map((m) => <th key={m}>{m}</th>)}
              <th className="bud-fy">FY</th>
            </tr>
          </thead>
          <tbody>
            {/* ---------------- Drivers ---------------- */}
            <SectionRow label="Drivers" />
            <EditRow
              label="Ocupación %"
              values={state.occ}
              decimals={1}
              onChange={(m, v) => mutate((s) => { s.occ[m] = Math.max(0, Math.min(100, v)); return s; })}
              onFill={() => mutate((s) => { s.occ = Array(12).fill(s.occ[0]); return s; })}
              fy={fmtPct(calc.fy.occ, 1)}
            />
            <EditRow
              label="ADR (€)"
              values={state.adr}
              decimals={1}
              onChange={(m, v) => mutate((s) => { s.adr[m] = Math.max(0, v); return s; })}
              onFill={() => mutate((s) => { s.adr = Array(12).fill(s.adr[0]); return s; })}
              fy={fmtEUR(calc.fy.adr)}
            />
            <CalcRow label="Plazas-noche disponibles" values={calc.avail.map((v) => fmtNum(v))} fy={fmtNum(calc.fy.avail)} muted />
            <CalcRow label="Plazas-noche vendidas" values={calc.roomNights.map((v) => fmtNum(v))} fy={fmtNum(calc.fy.roomNights)} />

            {/* ---------------- Ingresos ---------------- */}
            <SectionRow label="Ingresos" />
            <CalcRow label="Alojamiento" values={calc.lodging.map((v) => fmtEUR(v, { compact: true }))} fy={fmtEUR(calc.fy.lodging, { compact: true })} />
            {state.revenue.map((line, li) => (
              <EditRow
                key={line.id}
                editableLabel
                label={line.label}
                values={line.values}
                onLabel={(v) => mutate((s) => { s.revenue[li].label = v; return s; })}
                onChange={(m, v) => mutate((s) => { s.revenue[li].values[m] = v; return s; })}
                onFill={() => mutate((s) => { s.revenue[li].values = Array(12).fill(s.revenue[li].values[0]); return s; })}
                onDelete={() => mutate((s) => { s.revenue.splice(li, 1); return s; })}
                fy={fmtEUR(line.values.reduce((a, b) => a + b, 0), { compact: true })}
              />
            ))}
            <AddRow
              label="+ añadir línea de ingreso"
              onClick={() => mutate((s) => { s.revenue.push({ id: `rev_${Date.now()}`, label: 'Nueva línea', values: zeros() }); return s; })}
            />
            <CalcRow label="Total ingresos brutos" values={calc.revenueGross.map((v) => fmtEUR(v, { compact: true }))} fy={fmtEUR(calc.fy.revenueGross, { compact: true })} bold />
            <CalcRow label={`IVA (${IVA_PCT}%)`} values={calc.iva.map((v) => fmtEUR(-v, { compact: true }))} fy={fmtEUR(-calc.fy.iva, { compact: true })} signed />
            <CalcRow label="Total ingresos netos" values={calc.revenueNet.map((v) => fmtEUR(v, { compact: true }))} fy={fmtEUR(calc.fy.revenueNet, { compact: true })} sub />

            {/* ---------------- Gastos ---------------- */}
            {state.sections.filter((s) => s.kind === 'expense').map((section) => {
              const si = state.sections.indexOf(section);
              return (
                <SectionBlock
                  key={section.id}
                  section={section}
                  totals={calc.sectionTotals[si]}
                  mutate={mutate}
                  si={si}
                />
              );
            })}

            <AddRow
              label="+ añadir bloque de gastos"
              onClick={() => mutate((s) => {
                const idx = s.sections.findIndex((x) => x.kind === 'amort');
                const block = { id: `exp_${Date.now()}`, label: 'Nuevo bloque', kind: 'expense', lines: [{ id: `exp_${Date.now()}_1`, label: 'Nueva línea', values: zeros() }] };
                if (idx === -1) s.sections.push(block); else s.sections.splice(idx, 0, block);
                return s;
              })}
            />

            <CalcRow label="Total gastos operativos" values={calc.opex.map((v) => fmtEUR(v, { compact: true }))} fy={fmtEUR(calc.fy.opex, { compact: true })} bold />

            {/* ---------------- Resultado ---------------- */}
            <SectionRow label="Resultado" />
            <CalcRow label="EBITDA" values={calc.ebitda.map((v) => fmtEUR(v, { compact: true }))} fy={fmtEUR(calc.fy.ebitda, { compact: true })} keyRow signed />
            <CalcRow label="Margen EBITDA %" values={calc.margin.map((v) => fmtPct(v))} fy={fmtPct(calc.fy.margin)} />

            {state.sections.filter((s) => s.kind === 'amort').map((section) => {
              const si = state.sections.indexOf(section);
              return (
                <SectionBlock
                  key={section.id}
                  section={section}
                  totals={calc.sectionTotals[si]}
                  mutate={mutate}
                  si={si}
                  flat
                />
              );
            })}

            <CalcRow label="Resultado operativo (EBIT)" values={calc.ebit.map((v) => fmtEUR(v, { compact: true }))} fy={fmtEUR(calc.fy.ebit, { compact: true })} keyRow signed />
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, opacity: 0.55, letterSpacing: '0.02em', lineHeight: 1.6, maxWidth: 1000 }}>
        <strong>Alojamiento</strong> es calculado, no se teclea: plazas-noche disponibles ({capacity} × días del mes)
        × ocupación × ADR. El resto de líneas se teclean en euros del mes. El botón <em>→12</em> de cada fila copia
        el valor de enero a los doce meses (útil para costes fijos). Los nombres de línea y de bloque son
        editables; <em>+ añadir</em> crea líneas o bloques nuevos.{' '}
        <strong>Los ingresos se presupuestan en bruto</strong> (IVA incluido, el precio que paga el cliente).
        El neto se obtiene dividiendo entre {(1 + IVA_PCT / 100).toLocaleString('es-ES')} — no restando
        el {IVA_PCT}%: 100&nbsp;€ brutos son 82,64&nbsp;€ netos y 17,36&nbsp;€ de IVA. EBITDA, margen y
        RevPAR se calculan <strong>sobre el neto</strong>; la comparativa con {refYear} es bruto contra
        bruto, porque los importes de Mews también llevan IVA. Los gastos se teclean tal cual: si los
        anotas con IVA, el EBITDA sale conservador. EBITDA = ingresos netos − gastos operativos
        (amortizaciones aparte, debajo). Los cambios no se guardan solos: pulsa <strong>Guardar</strong> para
        escribir la pestaña <code>budget</code> de la hoja de HubSpot, que es lo que comparten todos los
        dispositivos.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Table pieces
 * ------------------------------------------------------------------ */

function SectionRow({ label }) {
  return (
    <tr className="bud-section-row">
      <td colSpan={14} className="bud-label">{label}</td>
    </tr>
  );
}

function SectionBlock({ section, totals, mutate, si, flat = false }) {
  return (
    <>
      <tr className="bud-section-row">
        <td colSpan={14} className="bud-label">
          <input
            className="bud-label-input"
            style={{ fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', minWidth: 220, width: 'auto' }}
            value={section.label}
            onChange={(e) => mutate((s) => { s.sections[si].label = e.target.value; return s; })}
          />
        </td>
      </tr>
      {section.lines.map((line, li) => (
        <EditRow
          key={line.id}
          editableLabel
          label={line.label}
          values={line.values}
          onLabel={(v) => mutate((s) => { s.sections[si].lines[li].label = v; return s; })}
          onChange={(m, v) => mutate((s) => { s.sections[si].lines[li].values[m] = v; return s; })}
          onFill={() => mutate((s) => { const vv = s.sections[si].lines[li].values[0]; s.sections[si].lines[li].values = Array(12).fill(vv); return s; })}
          onDelete={() => mutate((s) => { s.sections[si].lines.splice(li, 1); return s; })}
          fy={fmtEUR(line.values.reduce((a, b) => a + b, 0), { compact: true })}
        />
      ))}
      <AddRow
        label="+ añadir línea"
        onClick={() => mutate((s) => { s.sections[si].lines.push({ id: `l_${Date.now()}`, label: 'Nueva línea', values: zeros() }); return s; })}
        onDeleteSection={() => mutate((s) => { s.sections.splice(si, 1); return s; })}
      />
      {!flat && (
        <CalcRow
          label={`Total ${section.label.toLowerCase()}`}
          values={totals.map((v) => fmtEUR(v, { compact: true }))}
          fy={fmtEUR(totals.reduce((a, b) => a + b, 0), { compact: true })}
          sub
        />
      )}
      {flat && (
        <CalcRow
          label={`Total ${section.label.toLowerCase()}`}
          values={totals.map((v) => fmtEUR(v, { compact: true }))}
          fy={fmtEUR(totals.reduce((a, b) => a + b, 0), { compact: true })}
          bold
        />
      )}
    </>
  );
}

function CalcRow({ label, values, fy, bold, sub, keyRow, muted, signed }) {
  const cls = ['bud-row', bold ? 'bud-bold' : '', sub ? 'bud-sub' : '', keyRow ? 'bud-key' : ''].filter(Boolean).join(' ');
  return (
    <tr className={cls}>
      <td className="bud-label" style={muted ? { opacity: 0.55 } : undefined}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className="tabular" style={{
          opacity: muted ? 0.45 : 1,
          color: signed && typeof v === 'string' && v.trim().startsWith('-') ? C.brick : undefined,
        }}>{v}</td>
      ))}
      <td className="tabular bud-cell-fy" style={{
        color: signed && typeof fy === 'string' && fy.trim().startsWith('-') ? C.brick : undefined,
      }}>{fy}</td>
    </tr>
  );
}

function AddRow({ label, onClick, onDeleteSection }) {
  return (
    <tr className="bud-row">
      <td className="bud-label" colSpan={14} style={{ paddingTop: 4, paddingBottom: 6 }}>
        <button className="bud-add" onClick={onClick}>{label}</button>
        {onDeleteSection && (
          <button className="bud-add" onClick={onDeleteSection} style={{ marginLeft: 8 }} title="Eliminar este bloque entero">
            × eliminar bloque
          </button>
        )}
      </td>
    </tr>
  );
}

function EditRow({ label, values, onChange, onFill, onDelete, onLabel, editableLabel, fy, decimals = 0 }) {
  return (
    <tr className="bud-row">
      <td className="bud-label">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {editableLabel
            ? <input className="bud-label-input" value={label} onChange={(e) => onLabel(e.target.value)} />
            : <span style={{ minWidth: 180, display: 'inline-block' }}>{label}</span>}
          <button className="bud-mini" onClick={onFill} title="Copiar el valor de enero a los 12 meses">→12</button>
          {onDelete && <button className="bud-mini" onClick={onDelete} title="Eliminar esta línea">×</button>}
        </div>
      </td>
      {values.map((v, m) => (
        <td key={m} style={{ padding: '2px 4px' }}>
          <NumInput value={v} decimals={decimals} onChange={(nv) => onChange(m, nv)} />
        </td>
      ))}
      <td className="tabular bud-cell-fy">{fy}</td>
    </tr>
  );
}

/**
 * Numeric cell. Shows a thousands-separated value at rest and the raw number
 * while focused, so typing never fights the formatter.
 */
function NumInput({ value, onChange, decimals = 0 }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const display = focused
    ? draft
    : (value ? value.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: Math.max(decimals, 2) }) : '');

  return (
    <input
      className="bud-input tabular"
      inputMode="decimal"
      value={display}
      placeholder="0"
      onFocus={() => { setDraft(value ? String(value) : ''); setFocused(true); }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(parseNum(e.target.value));
      }}
    />
  );
}

function Metric({ label, value, sub, negative }) {
  return (
    <div className="tile dark" style={{ padding: 16 }}>
      <div className="eyebrow eyebrow-sm" style={{ color: C.cream, opacity: 0.7, fontSize: 10, letterSpacing: '0.2em' }}>{label}</div>
      <div className="display tabular" style={{ fontSize: 30, lineHeight: 1, marginTop: 6, color: negative ? '#E07A6A' : C.amarillo }}>{value}</div>
      {sub && <div style={{ color: C.cream, opacity: 0.6, fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

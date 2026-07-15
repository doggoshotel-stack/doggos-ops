import ManagementLogin, { checkMgmtAuth, clearMgmtAuth } from './Login.jsx';
import PnL from './PnL.jsx';
import Customers from './Customers.jsx';
import Seo from './Seo.jsx';

export { checkMgmtAuth, clearMgmtAuth, ManagementLogin };

const C = {
  cream:    '#EAE8DD',
  ink:      '#21392C',
  amarillo: '#F5F53D',
  ink15:    '#21392C26',
};

const MGMT_ROUTES = [
  { hash: '#/management',          label: 'P&L anual 2026',    comp: 'pnl' },
  { hash: '#/management/pnl-2025', label: 'P&L 2025',          comp: 'pnl2025' },
  { hash: '#/management/customers',label: 'Análisis clientes', comp: 'customers' },
  { hash: '#/management/seo',      label: 'SEO & Ads',         comp: 'seo' },
  // Pickup & pace / Forecast / Mews sync hidden for now (placeholders). The
  // ManagementRouter still renders them if navigated to directly, so they can
  // be re-enabled by adding their entries back here.
];

export const MGMT_NAV = MGMT_ROUTES;

export default function ManagementRouter({ route, reservations, reservations2025, capacity, now, seoData, seoError }) {
  const sub = MGMT_ROUTES.find(r => r.hash === route)?.comp || 'pnl';

  if (sub === 'pnl') {
    return <PnL reservations={reservations} capacity={capacity} now={now} year={2026} />;
  }

  if (sub === 'pnl2025') {
    // 2025 lives in its own Mews tab (12-month export limit), passed separately.
    return <PnL reservations={reservations2025 || []} capacity={capacity} now={now} year={2025} />;
  }

  if (sub === 'customers') {
    return <Customers reservations={reservations} now={now} />;
  }

  if (sub === 'seo') {
    return <Seo data={seoData} error={seoError} />;
  }

  // Placeholders for future sections
  const placeholderTitle = {
    pickup:   'Pickup & pace',
    forecast: 'Forecast',
    sync:     'Mews sync',
  }[sub];
  const placeholderNote = {
    pickup:   'Cuándo entran las reservas y cómo vamos respecto al mismo punto del año pasado. Requiere snapshots semanales.',
    forecast: 'Proyección de cierre por mes con escenarios. Requiere budget y curva histórica de pickup.',
    sync:     'Estado de la sincronización Mews → Google Sheet → app.',
  }[sub];

  return (
    <div style={{ padding: '40px 32px', maxWidth: 720, margin: '0 auto' }}>
      <div className="eyebrow eyebrow-sm" style={{ opacity: 0.6, marginBottom: 6 }}>MANAGEMENT</div>
      <h1 className="display" style={{ fontSize: 48, lineHeight: 1, color: C.ink, marginBottom: 12 }}>{placeholderTitle}</h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.75 }}>{placeholderNote}</p>
      <div className="tile" style={{ padding: 20, marginTop: 24, background: C.amarillo, border: `1.5px solid ${C.ink}` }}>
        <div className="eyebrow eyebrow-sm">PRÓXIMAMENTE</div>
        <div style={{ marginTop: 4, fontSize: 13 }}>Esta sección está reservada y se activa en una siguiente fase.</div>
      </div>
    </div>
  );
}

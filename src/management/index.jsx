import ManagementLogin, { checkMgmtAuth, clearMgmtAuth } from './Login.jsx';
import PnL from './PnL.jsx';

export { checkMgmtAuth, clearMgmtAuth, ManagementLogin };

const C = {
  cream:    '#EAE8DD',
  ink:      '#21392C',
  amarillo: '#F5F53D',
  ink15:    '#21392C26',
};

const MGMT_ROUTES = [
  { hash: '#/management',          label: 'P&L anual',     comp: 'pnl' },
  { hash: '#/management/pickup',   label: 'Pickup & pace', comp: 'pickup' },
  { hash: '#/management/forecast', label: 'Forecast',      comp: 'forecast' },
  { hash: '#/management/mews-sync',label: 'Mews sync',     comp: 'sync' },
];

export const MGMT_NAV = MGMT_ROUTES;

export default function ManagementRouter({ route, reservations, capacity, now }) {
  const sub = MGMT_ROUTES.find(r => r.hash === route)?.comp || 'pnl';

  if (sub === 'pnl') {
    return <PnL reservations={reservations} capacity={capacity} now={now} />;
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

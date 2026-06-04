// SEO & Ads — MOCKUP. All numbers below are sample data to agree on layout and
// KPIs. Real data would come from Google Search Console / Google Ads / Google
// Business Profile (see the plan in chat), most likely piped into a Google
// Sheet via n8n and read like the Mews bridge.

const C = {
  cream:    '#EAE8DD',
  ink:      '#21392C',
  amarillo: '#F5F53D',
  ocre:     '#BFB200',
  celeste:  '#78D9D8',
  lila:     '#AD95E6',
  brick:    '#A23A2A',
  ink15:    '#21392C26',
  ink08:    '#21392C14',
};

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ---- sample data ----------------------------------------------------------
const KEYWORDS = [
  { kw: 'guardería canina ullastrell', pos: 1, prev: 2, vol: 90 },
  { kw: 'guardería para perros terrassa', pos: 3, prev: 6, vol: 480 },
  { kw: 'hotel para perros terrassa', pos: 4, prev: 5, vol: 390 },
  { kw: 'residencia canina vallès', pos: 5, prev: 4, vol: 210 },
  { kw: 'guardería perros sabadell', pos: 6, prev: 9, vol: 320 },
  { kw: 'guardería de día para perros', pos: 7, prev: 11, vol: 720 },
  { kw: 'residència canina terrassa', pos: 8, prev: 8, vol: 170 },
  { kw: 'hotel canino barcelona', pos: 14, prev: 19, vol: 1300 },
  { kw: 'dónde dejar el perro en vacaciones', pos: 17, prev: 22, vol: 880 },
  // English — expat audience (Barcelona area)
  { kw: 'dog daycare barcelona', pos: 9, prev: 15, vol: 720 },
  { kw: 'dog boarding barcelona', pos: 12, prev: 18, vol: 1600 },
  { kw: 'dog hotel barcelona', pos: 13, prev: 16, vol: 590 },
  { kw: 'dog sitter terrassa', pos: 16, prev: 21, vol: 210 },
];

const ADS_BY_MONTH = [
  { m: 1, spend: 680, conv: 9 }, { m: 2, spend: 720, conv: 11 }, { m: 3, spend: 910, conv: 14 },
  { m: 4, spend: 1040, conv: 16 }, { m: 5, spend: 1180, conv: 19 }, { m: 6, spend: 1240, conv: 22 },
];

const ORGANIC_CLICKS = [
  { m: 1, clicks: 920 }, { m: 2, clicks: 1080 }, { m: 3, clicks: 1240 },
  { m: 4, clicks: 1390 }, { m: 5, clicks: 1610 }, { m: 6, clicks: 1820 },
];

const CAMPAIGNS = [
  { name: 'Search · Guardería', spend: 560, conv: 11 },
  { name: 'Search · Hotel canino', spend: 430, conv: 7 },
  { name: 'Performance Max', spend: 250, conv: 4 },
];

const GBP = { rating: 4.8, reviews: 126, mapViews: 5400, calls: 88, directions: 64 };

// ---------------------------------------------------------------------------
function fmtEUR(n, opts = {}) {
  if (n == null || isNaN(n)) return '—';
  if (opts.compact && Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${Math.round(n).toLocaleString('es-ES')}€`;
}

export default function Seo() {
  const spend = ADS_BY_MONTH[ADS_BY_MONTH.length - 1].spend;
  const adsConv = ADS_BY_MONTH[ADS_BY_MONTH.length - 1].conv;
  const cpa = adsConv > 0 ? spend / adsConv : 0;
  const clicks = ORGANIC_CLICKS[ORGANIC_CLICKS.length - 1].clicks;
  const avgPos = (KEYWORDS.reduce((a, k) => a + k.pos, 0) / KEYWORDS.length).toFixed(1);
  const improved = KEYWORDS.filter((k) => k.pos < k.prev).length;

  const spendMax = Math.max(...ADS_BY_MONTH.map((d) => d.spend));
  const clicksMax = Math.max(...ORGANIC_CLICKS.map((d) => d.clicks));
  const campMax = Math.max(...CAMPAIGNS.map((c) => c.spend));

  return (
    <div style={{ padding: '32px 32px 80px', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 className="display" style={{ fontSize: 52, lineHeight: 0.95, color: C.ink, marginBottom: 6 }}>
          SEO &amp; Ads
        </h1>
        <div className="eyebrow" style={{ opacity: 0.65, fontSize: 11 }}>
          VISIBILIDAD ORGÁNICA · CAMPAÑAS · POSICIONAMIENTO LOCAL
        </div>
      </header>

      {/* mockup banner */}
      <div className="tile" style={{ padding: '10px 14px', marginBottom: 20, background: C.amarillo, border: `1.5px solid ${C.ink}`, fontSize: 13 }}>
        <strong>Mockup.</strong> Datos de ejemplo para validar la estructura. Pendiente conectar Google Search Console, Google Ads y Google Business Profile.
      </div>

      {/* key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Metric label="Gasto en ads · mes" value={fmtEUR(spend)} sub={`${adsConv} conversiones`} />
        <Metric label="Coste por conversión" value={fmtEUR(cpa)} sub="CPA medio" highlight />
        <Metric label="Posición media" value={avgPos} sub={`${improved}/${KEYWORDS.length} mejoran`} />
        <Metric label="Clicks orgánicos · mes" value={clicks.toLocaleString('es-ES')} sub="Search Console" />
        <Metric label="Reseñas Google" value={`${GBP.rating}★`} sub={`${GBP.reviews} reseñas`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>
        {/* Rankings */}
        <Card title="Palabras clave · ranking" subtitle="Posición en Google y cambio vs mes anterior">
          {KEYWORDS.map((k) => {
            const delta = k.prev - k.pos; // positive = improved (moved up)
            return (
              <div key={k.kw} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.ink08}` }}>
                <span className="display tabular" style={{ fontSize: 20, width: 30, textAlign: 'right', color: k.pos <= 3 ? C.ink : 'rgba(33,57,44,0.6)' }}>{k.pos}</span>
                <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.kw}</span>
                <span className="eyebrow eyebrow-sm" style={{ opacity: 0.45, fontSize: 10 }}>{k.vol}/mes</span>
                <Delta delta={delta} />
              </div>
            );
          })}
        </Card>

        {/* Google Ads */}
        <Card title="Google Ads" subtitle="Gasto y conversiones · últimos 6 meses">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, marginBottom: 8 }}>
            {ADS_BY_MONTH.map((d) => (
              <div key={d.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 70 }}>
                  <div style={{ width: '100%', height: `${(d.spend / spendMax) * 100}%`, background: C.celeste, borderRadius: '4px 4px 0 0' }} />
                </div>
                <span className="eyebrow eyebrow-sm" style={{ fontSize: 9, opacity: 0.55 }}>{MONTHS_ES[d.m - 1]}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 6, flexWrap: 'wrap' }}>
            <MiniStat label="Gasto mes" value={fmtEUR(spend)} />
            <MiniStat label="Conversiones" value={String(adsConv)} />
            <MiniStat label="CPA" value={fmtEUR(cpa)} />
          </div>
          <div style={{ marginTop: 14 }}>
            {CAMPAIGNS.map((c) => (
              <BarRow key={c.name} label={c.name} value={c.spend} max={campMax} color={C.ink} valueLabel={fmtEUR(c.spend, { compact: true })} sub={`${c.conv} conv · ${fmtEUR(c.spend / c.conv)} CPA`} />
            ))}
          </div>
        </Card>

        {/* Local visibility */}
        <Card title="Visibilidad local · Google Business" subtitle="Ficha de empresa este mes">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span className="display tabular" style={{ fontSize: 40, lineHeight: 1, color: C.ink }}>{GBP.rating}</span>
            <span style={{ fontSize: 16, color: C.ocre }}>★★★★★</span>
            <span style={{ fontSize: 13, opacity: 0.6 }}>· {GBP.reviews} reseñas</span>
          </div>
          <BarRow label="Vistas en el mapa" value={GBP.mapViews} max={GBP.mapViews} color={C.celeste} valueLabel={GBP.mapViews.toLocaleString('es-ES')} />
          <BarRow label="Llamadas" value={GBP.calls} max={GBP.mapViews} color={C.ink} valueLabel={String(GBP.calls)} />
          <BarRow label="Cómo llegar" value={GBP.directions} max={GBP.mapViews} color={C.lila} valueLabel={String(GBP.directions)} />
        </Card>

        {/* Organic trend */}
        <Card title="Tendencia orgánica" subtitle="Clicks desde búsqueda · últimos 6 meses">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110 }}>
            {ORGANIC_CLICKS.map((d) => (
              <div key={d.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="tabular" style={{ fontSize: 10, opacity: 0.55 }}>{(d.clicks / 1000).toFixed(1)}k</span>
                <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 70 }}>
                  <div style={{ width: '100%', height: `${(d.clicks / clicksMax) * 100}%`, background: C.ink, opacity: 0.85, borderRadius: '4px 4px 0 0' }} />
                </div>
                <span className="eyebrow eyebrow-sm" style={{ fontSize: 9, opacity: 0.55 }}>{MONTHS_ES[d.m - 1]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, opacity: 0.55, lineHeight: 1.6 }}>
        Fuentes previstas: <strong>Google Search Console</strong> (clicks, impresiones, posición, queries),
        <strong> Google Ads</strong> (gasto, conversiones, CPA por campaña), <strong>Google Business Profile</strong>
        (reseñas, llamadas, cómo llegar) y opcionalmente un rank-tracker (SEMrush/Ahrefs) para posiciones por keyword.
      </div>
    </div>
  );
}

function Delta({ delta }) {
  if (delta === 0) return <span className="eyebrow eyebrow-sm" style={{ width: 44, textAlign: 'right', opacity: 0.4 }}>=</span>;
  const up = delta > 0;
  return (
    <span className="eyebrow eyebrow-sm tabular" style={{ width: 44, textAlign: 'right', fontWeight: 700, color: up ? C.ink : C.brick }}>
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  );
}

function Metric({ label, value, sub, highlight }) {
  return (
    <div className="tile dark" style={{ padding: 16 }}>
      <div className="eyebrow eyebrow-sm" style={{ color: C.cream, opacity: 0.7, fontSize: 10, letterSpacing: '0.2em' }}>{label}</div>
      <div className="display tabular" style={{ fontSize: 30, lineHeight: 1, marginTop: 6, color: highlight ? C.amarillo : C.cream }}>{value}</div>
      {sub && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, color: C.cream }}>{sub}</div>}
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="tile" style={{ padding: 20 }}>
      <h2 className="display" style={{ fontSize: 22, color: C.ink, margin: 0 }}>{title}</h2>
      {subtitle && <div className="eyebrow eyebrow-sm" style={{ opacity: 0.55, marginTop: 2, marginBottom: 14 }}>{subtitle}</div>}
      <div>{children}</div>
    </div>
  );
}

function BarRow({ label, value, max, color, valueLabel, sub }) {
  const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span className="tabular" style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{valueLabel}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: C.ink08, marginTop: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      {sub && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="display tabular" style={{ fontSize: 24, lineHeight: 1, color: C.ink }}>{value}</div>
      <div className="eyebrow eyebrow-sm" style={{ opacity: 0.55, marginTop: 4 }}>{label}</div>
    </div>
  );
}

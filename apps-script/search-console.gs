/**
 * doggos · Search Console bridge (Apps Script Web App)
 * --------------------------------------------------------------------------
 * Serves Google Search Console data for the dashboard's "SEO & Ads" section as
 * JSON, using the SAME /exec + secret-key pattern as the Mews bridge.
 *
 * It runs AS YOU (the property owner), so no API keys or passwords are needed —
 * just authorise the script once when you deploy.
 *
 * SETUP (one time)
 *  1. script.google.com → New project. Paste this file in Code.gs.
 *  2. Project Settings → "Show appsscript.json" → set oauthScopes to:
 *       [
 *         "https://www.googleapis.com/auth/webmasters.readonly",
 *         "https://www.googleapis.com/auth/script.external_request"
 *       ]
 *  3. Project Settings → Script properties → add:
 *       SECRET   = doggos-ops-<something-long>     (same idea as the Mews bridge)
 *       SITE_URL = sc-domain:doggoshotel.com       (your verified property)
 *  4. Deploy → New deployment → Web app
 *       Execute as: Me   ·   Who has access: Anyone
 *     Authorise when prompted. Copy the /exec URL.
 *  5. Paste the /exec URL + SECRET into the dashboard admin (SEO source).
 *
 * Test in the browser:  <exec-url>?key=<SECRET>
 */

var PROPS = PropertiesService.getScriptProperties();
var GSC = 'https://www.googleapis.com/webmasters/v3/sites/';

function doGet(e) {
  try {
    var secret = PROPS.getProperty('SECRET');
    if (secret && (!e || !e.parameter || e.parameter.key !== secret)) {
      return jsonOut_({ error: 'unauthorized' });
    }
    var site = PROPS.getProperty('SITE_URL');
    if (!site) return jsonOut_({ error: 'missing_SITE_URL' });

    var today = new Date();
    // Search Console data lags ~2-3 days; end the window 3 days back.
    var end = addDays_(today, -3);
    var start = addDays_(end, -27);        // trailing 28 days
    var prevEnd = addDays_(start, -1);
    var prevStart = addDays_(prevEnd, -27); // previous 28 days (for deltas)
    var trendStart = addDays_(end, -180);   // ~6 months for the monthly trend

    var summary = totals_(site, start, end);
    var prev = totals_(site, prevStart, prevEnd);
    var byMonth = monthly_(site, trendStart, end);
    var queries = topQueries_(site, start, end, 25);

    return jsonOut_({
      ok: true,
      site: site,
      range: { start: fmt_(start), end: fmt_(end) },
      summary: summary,        // { clicks, impressions, ctr, position }
      previous: prev,          // same shape, previous 28 days
      byMonth: byMonth,        // [{ month: 'YYYY-MM', clicks, impressions }]
      queries: queries,        // [{ query, clicks, impressions, ctr, position }]
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    return jsonOut_({ error: String(err) });
  }
}

/* ----------------------------- GSC queries ----------------------------- */

function query_(site, body) {
  var url = GSC + encodeURIComponent(site) + '/searchAnalytics/query';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('GSC ' + code + ': ' + res.getContentText());
  return JSON.parse(res.getContentText()).rows || [];
}

function totals_(site, start, end) {
  var rows = query_(site, { startDate: fmt_(start), endDate: fmt_(end), rowLimit: 1 });
  var r = rows[0] || {};
  return {
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0
  };
}

function monthly_(site, start, end) {
  var rows = query_(site, { startDate: fmt_(start), endDate: fmt_(end), dimensions: ['date'], rowLimit: 5000 });
  var byMonth = {};
  rows.forEach(function (r) {
    var key = String(r.keys[0]).slice(0, 7); // YYYY-MM
    if (!byMonth[key]) byMonth[key] = { month: key, clicks: 0, impressions: 0 };
    byMonth[key].clicks += r.clicks || 0;
    byMonth[key].impressions += r.impressions || 0;
  });
  return Object.keys(byMonth).sort().map(function (k) { return byMonth[k]; });
}

function topQueries_(site, start, end, limit) {
  var rows = query_(site, {
    startDate: fmt_(start), endDate: fmt_(end),
    dimensions: ['query'], rowLimit: limit
  });
  return rows.map(function (r) {
    return {
      query: r.keys[0],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: r.ctr || 0,
      position: r.position || 0
    };
  });
}

/* ----------------------------- helpers ----------------------------- */

function addDays_(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmt_(d) { return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'); }
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

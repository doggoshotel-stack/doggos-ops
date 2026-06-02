/**
 * doggos · Customer Portal backend (Google Apps Script Web App)
 * ------------------------------------------------------------------
 * Lets a customer log in with a magic link sent to their email and
 * read / update ONLY their own dog record(s) in the customers sheet.
 *
 * The ops dashboard keeps reading the same sheet, so this sheet is the
 * single source of truth — no HubSpot, no integration.
 *
 * SECURITY MODEL
 *   - The HMAC signing secret lives in Script Properties, never in the
 *     browser bundle. Tokens are signed + time-limited.
 *   - Every getRecord / saveRecord is scoped to the email inside the
 *     verified token, so a logged-in customer can never see or write
 *     another customer's row.
 *   - requestLink always returns {ok:true} (it does not reveal whether
 *     an email exists) to avoid account enumeration.
 *
 * DEPLOY
 *   1. Open the customers Google Sheet → Extensions → Apps Script.
 *   2. Paste this file. Save.
 *   3. Project Settings → Script Properties, add:
 *        PORTAL_SECRET  – a long random string (the signing key)
 *        SHEET_ID       – the spreadsheet id (from its URL)
 *        SHEET_NAME     – the tab name holding customer rows (e.g. "Intake")
 *        PORTAL_URL     – public portal URL, e.g.
 *                         https://doggos-ops-seven.vercel.app/portal
 *      Optional:
 *        FROM_NAME      – sender label for the email (default "doggos")
 *        LINK_TTL_MIN   – magic-link lifetime in minutes (default 60)
 *   4. Deploy → New deployment → Web app:
 *        Execute as: Me     Who has access: Anyone
 *      Copy the /exec URL — that's the portal's VITE_PORTAL_API URL.
 *
 * The browser POSTs JSON as text/plain so it skips the CORS preflight
 * that Apps Script cannot answer (same trick the ops dashboard uses).
 */

var PROPS = PropertiesService.getScriptProperties();

/* ----------------------------- entrypoints ----------------------------- */

function doGet(e) {
  // Simple health check.
  return jsonOut_({ ok: true, service: 'doggos-portal' });
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action;
    if (action === 'requestLink') return handleRequestLink_(body);
    if (action === 'getRecord')  return handleGetRecord_(body);
    if (action === 'saveRecord') return handleSaveRecord_(body);
    return jsonOut_({ error: 'Unknown action' });
  } catch (err) {
    return jsonOut_({ error: String(err && err.message || err) });
  }
}

/* ----------------------------- actions ----------------------------- */

// { action:'requestLink', email }
function handleRequestLink_(body) {
  var email = normEmail_(body.email);
  if (!email) return jsonOut_({ ok: true }); // don't reveal anything

  // Light throttle: one link per email per 60s.
  var cache = CacheService.getScriptCache();
  var throttleKey = 'rl_' + email;
  if (cache.get(throttleKey)) return jsonOut_({ ok: true });
  cache.put(throttleKey, '1', 60);

  var rows = findRowsByEmail_(email);
  if (rows.length === 0) return jsonOut_({ ok: true }); // unknown email → silent

  var token = sign_({ email: email, exp: Date.now() + ttlMs_() });
  var link = portalUrl_() + (portalUrl_().indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
  var fromName = PROPS.getProperty('FROM_NAME') || 'doggos';

  MailApp.sendEmail({
    to: email,
    name: fromName,
    subject: 'Tu acceso a la ficha de tu perro · doggos',
    htmlBody:
      '<div style="font-family:Arial,sans-serif;color:#21392C;line-height:1.6">' +
      '<p>Hola,</p>' +
      '<p>Pulsa el botón para acceder y actualizar la información de tu perro:</p>' +
      '<p style="margin:24px 0"><a href="' + link + '" ' +
      'style="background:#21392C;color:#EAE8DD;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Acceder a mi ficha</a></p>' +
      '<p style="font-size:13px;opacity:.7">Este enlace caduca en ' + ttlMin_() + ' minutos. Si no lo solicitaste, ignora este correo.</p>' +
      '</div>',
  });

  return jsonOut_({ ok: true });
}

// { action:'getRecord', token }
function handleGetRecord_(body) {
  var payload = verify_(body.token);
  if (!payload) return jsonOut_({ error: 'invalid_token' });
  var rows = findRowsByEmail_(payload.email);
  return jsonOut_({ ok: true, email: payload.email, records: rows.map(function (r) { return r.fields; }) });
}

// { action:'saveRecord', token, id, fields:{ <header>: value } }
function handleSaveRecord_(body) {
  var payload = verify_(body.token);
  if (!payload) return jsonOut_({ error: 'invalid_token' });

  var sheet = getSheet_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = pickHeader_(headers, ['Conversion ID', 'Contact ID']);
  var emailCol = pickHeader_(headers, ['Correo', 'Contact email']);
  if (emailCol < 0) return jsonOut_({ error: 'sheet_missing_email_column' });

  var incoming = body.fields || {};
  var targetId = String(body.id || '').trim();

  // Find the row that belongs to THIS customer (+ matching id when given).
  var rows = findRowsByEmail_(payload.email);
  var match = null;
  for (var i = 0; i < rows.length; i++) {
    if (!targetId || String(rows[i].id) === targetId) { match = rows[i]; break; }
  }

  if (match) {
    // Update only known, non-identity columns. Never let the client move a
    // row to a different email.
    for (var h = 0; h < headers.length; h++) {
      var header = headers[h];
      if (h === emailCol || h === idCol) continue;
      if (incoming.hasOwnProperty(header)) {
        sheet.getRange(match.rowIndex, h + 1).setValue(incoming[header]);
      }
    }
    return jsonOut_({ ok: true, rowIndex: match.rowIndex, id: match.id });
  }

  // No existing row → append a new dog for this customer.
  var newRow = new Array(headers.length).fill('');
  var newId = Utilities.getUuid();
  for (var c = 0; c < headers.length; c++) {
    var hd = headers[c];
    if (c === emailCol) newRow[c] = payload.email;
    else if (c === idCol) newRow[c] = newId;
    else if (incoming.hasOwnProperty(hd)) newRow[c] = incoming[hd];
  }
  sheet.appendRow(newRow);
  return jsonOut_({ ok: true, rowIndex: sheet.getLastRow(), id: newId, created: true });
}

/* ----------------------------- sheet helpers ----------------------------- */

function getSheet_() {
  var ss = SpreadsheetApp.openById(PROPS.getProperty('SHEET_ID'));
  var name = PROPS.getProperty('SHEET_NAME');
  var sheet = name ? ss.getSheetByName(name) : ss.getSheets()[0];
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

// Returns [{ rowIndex, id, fields:{header:value} }] for all rows whose email matches.
function findRowsByEmail_(email) {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var emailCol = pickHeader_(headers, ['Correo', 'Contact email']);
  var idCol = pickHeader_(headers, ['Conversion ID', 'Contact ID']);
  if (emailCol < 0) return [];

  var out = [];
  for (var r = 1; r < values.length; r++) {
    if (normEmail_(values[r][emailCol]) !== email) continue;
    var fields = {};
    for (var c = 0; c < headers.length; c++) fields[headers[c]] = values[r][c];
    out.push({
      rowIndex: r + 1, // 1-based, includes header row
      id: idCol >= 0 ? String(values[r][idCol] || '') : '',
      fields: fields,
    });
  }
  return out;
}

// Returns the column index of the first header that exists, else -1.
function pickHeader_(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = headers.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

/* ----------------------------- token helpers ----------------------------- */

function secret_() {
  var s = PROPS.getProperty('PORTAL_SECRET');
  if (!s) throw new Error('PORTAL_SECRET not set');
  return s;
}

function sign_(payloadObj) {
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify(payloadObj));
  var sigBytes = Utilities.computeHmacSha256Signature(payload, secret_());
  var sig = Utilities.base64EncodeWebSafe(sigBytes);
  return payload + '.' + sig;
}

function verify_(token) {
  if (!token || typeof token !== 'string') return null;
  var parts = token.split('.');
  if (parts.length !== 2) return null;
  var expectedBytes = Utilities.computeHmacSha256Signature(parts[0], secret_());
  var expected = Utilities.base64EncodeWebSafe(expectedBytes);
  if (parts[1] !== expected) return null;
  var json = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  var payload = JSON.parse(json);
  if (!payload || !payload.exp || payload.exp < Date.now()) return null;
  payload.email = normEmail_(payload.email);
  return payload;
}

/* ----------------------------- misc ----------------------------- */

function normEmail_(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function portalUrl_() {
  return PROPS.getProperty('PORTAL_URL') || '';
}

function ttlMin_() {
  return parseInt(PROPS.getProperty('LINK_TTL_MIN') || '60', 10);
}

function ttlMs_() {
  return ttlMin_() * 60 * 1000;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

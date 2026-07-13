/**
 * doggos · Room Board bridge (Google Apps Script Web App)
 * ------------------------------------------------------------------
 * Reads and writes the `room_board` tab in the HubSpot spreadsheet.
 * This is the operations-room whiteboard, digitised: which physical room
 * each dog is in, plus any per-stay feeding overrides.
 *
 * It is DELIBERATELY separate from portal.gs / the HubSpot proxy so it can
 * never touch the customer-portal photo & comments pipeline.
 *
 * KEY
 *   Rows are keyed by the Mews confirmation number (`reservation`), which is
 *   always present and unique per stay. Food/med DEFAULTS still come live
 *   from the HubSpot form in the dashboard — this tab only stores what staff
 *   change (the room, and any overridden feed amounts).
 *
 * COLUMNS (row 1, exact names)
 *   reservation | room | feed_9 | feed_14 | feed_20 | med_note | updated_at
 *
 * DEPLOY
 *   1. Open the HubSpot Google Sheet -> Extensions -> Apps Script.
 *   2. Add a new script file, paste this in. Save.
 *   3. Change SECRET below to a long random string.
 *   4. Deploy -> New deployment -> Web app:
 *        Execute as: Me     Who has access: Anyone
 *   5. Copy the /exec URL into the dashboard admin (Room board URL + key).
 *
 * The `room_board` tab is created automatically on first use if it does not
 * exist, so manual tab creation is optional (but if you do create it, use the
 * exact column names above in row 1).
 *
 * The browser POSTs JSON as text/plain so it skips the CORS preflight that
 * Apps Script cannot answer (same trick the rest of the dashboard uses).
 */

var SECRET = 'doggos-roomboard-CHANGE-THIS';
var SHEET_NAME = 'room_board';
var COLS = ['reservation', 'room', 'feed_9', 'feed_14', 'feed_20', 'med_note', 'updated_at'];
// Fields the dashboard may write. Updated only when present in the request,
// so a room move never blanks a feed override and vice-versa.
var EDITABLE = ['room', 'feed_9', 'feed_14', 'feed_20', 'med_note'];

/* ----------------------------- entrypoints ----------------------------- */

// GET ?key=SECRET  ->  full board as an array of row objects.
function doGet(e) {
  if (!e || !e.parameter || e.parameter.key !== SECRET) {
    return out_({ error: 'unauthorized' });
  }
  var sheet = getBoardSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return out_([]);
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    if (!String(values[r][0]).trim()) continue; // skip rows without a key
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var v = values[r][c];
      if (v instanceof Date) v = v.toISOString();
      obj[headers[c]] = v;
    }
    rows.push(obj);
  }
  return out_(rows);
}

// POST { key, reservation, room?, feed_9?, feed_14?, feed_20?, med_note? }
// Upserts the row for `reservation`, updating only the provided fields.
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // serialise concurrent edits (two staff at once)
  } catch (err) {
    return out_({ error: 'busy_try_again' });
  }
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    if (body.key !== SECRET) return out_({ error: 'unauthorized' });

    var reservation = String(body.reservation == null ? '' : body.reservation).trim();
    if (!reservation) return out_({ error: 'missing_reservation' });

    var sheet = getBoardSheet_();
    var values = sheet.getDataRange().getValues();
    var headers = values[0].map(function (h) { return String(h).trim(); });
    var colIdx = {};
    for (var c = 0; c < headers.length; c++) colIdx[headers[c]] = c;
    if (colIdx.reservation == null) return out_({ error: 'board_sheet_malformed' });

    var now = new Date().toISOString();

    // Locate an existing row for this reservation.
    var target = -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][colIdx.reservation]).trim() === reservation) { target = r; break; }
    }

    if (target >= 0) {
      for (var i = 0; i < EDITABLE.length; i++) {
        var f = EDITABLE[i];
        if (body.hasOwnProperty(f) && colIdx[f] != null) {
          sheet.getRange(target + 1, colIdx[f] + 1).setValue(str_(body[f]));
        }
      }
      if (colIdx.updated_at != null) sheet.getRange(target + 1, colIdx.updated_at + 1).setValue(now);
      return out_({ ok: true, reservation: reservation });
    }

    // No row yet -> append one.
    var newRow = new Array(headers.length).fill('');
    newRow[colIdx.reservation] = reservation;
    for (var j = 0; j < EDITABLE.length; j++) {
      var fld = EDITABLE[j];
      if (body.hasOwnProperty(fld) && colIdx[fld] != null) newRow[colIdx[fld]] = str_(body[fld]);
    }
    if (colIdx.updated_at != null) newRow[colIdx.updated_at] = now;
    sheet.appendRow(newRow);
    return out_({ ok: true, reservation: reservation, created: true });
  } catch (err2) {
    return out_({ error: String(err2 && err2.message || err2) });
  } finally {
    lock.releaseLock();
  }
}

/* ----------------------------- helpers ----------------------------- */

function getBoardSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]);
  }
  return sheet;
}

function str_(v) {
  return String(v == null ? '' : v);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

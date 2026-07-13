// doggos · HubSpot sheet → JSON proxy (reads + dog_extras writes + room_board writes)
// Keep SECRET identical to what was here before.
//
// This is the dashboard's HubSpot bridge. It:
//   · GET  ?key&sheet=NAME        → returns any tab as JSON rows (incl. room_board)
//   · POST {dog_id,comments,photo} → upserts the dog_extras tab (photos/comments)
//   · POST {action:'saveRoomBoard', reservation, room?, feed_*?, med_note?}
//                                  → upserts the room_board tab (ops room board)
// The room_board branch is fully separate from dog_extras — the photo/portal
// pipeline is untouched.

const SECRET = "hubspot-Bq3xR";
const DEFAULT_SHEET = "";          // empty = first tab (HubSpot intake) — unchanged behavior
const EXTRAS_SHEET = "dog_extras";

const ROOM_BOARD_SHEET = "room_board";
const ROOM_BOARD_COLS = ["reservation", "room", "feed_9", "feed_14", "feed_20", "med_note", "updated_at"];
// Fields the dashboard may write. Updated only when present in the request,
// so a room move never blanks a feed override and vice-versa.
const ROOM_BOARD_EDITABLE = ["room", "feed_9", "feed_14", "feed_20", "med_note"];

function doGet(e) {
  if (e.parameter.key !== SECRET) return out({ error: "unauthorized" });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var name = e.parameter.sheet || DEFAULT_SHEET;
    var sheet = name ? ss.getSheetByName(name) : ss.getSheets()[0];
    if (!sheet) return out([]);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return out([]);

    var seen = {};
    var headers = data[0].map(function (h) {
      var nm = String(h).trim();
      var c = (seen[nm] || 0) + 1; seen[nm] = c;
      return c === 1 ? nm : nm + " (" + c + ")";
    });

    var rows = data.slice(1)
      .filter(function (r) { return r.some(function (c) { return c !== "" && c !== null; }); })
      .map(function (row) {
        var obj = {};
        headers.forEach(function (h, i) {
          var v = row[i];
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

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return out({ error: "bad json" }); }

  if (body.key !== SECRET) return out({ error: "unauthorized" });

  // Room board writes are keyed by Mews confirmation number and live in their
  // own tab — routed off before the dog_extras logic so nothing there changes.
  if (body.action === "saveRoomBoard") return saveRoomBoard_(body);

  if (!body.dog_id) return out({ error: "missing dog_id" });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(EXTRAS_SHEET);
    if (!sheet) return out({ error: "no dog_extras tab" });

    if (sheet.getLastRow() < 1) {
      sheet.getRange(1, 1, 1, 4).setValues([["dog_id", "comments", "photo", "updated_at"]]);
    }

    var lastRow = sheet.getLastRow();
    var ids = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
    var rowIndex = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(body.dog_id)) { rowIndex = i + 2; break; }
    }

    var nowIso = new Date().toISOString();
    var values = [
      String(body.dog_id),
      body.comments != null ? String(body.comments) : "",
      body.photo != null ? String(body.photo) : "",
      nowIso
    ];

    if (rowIndex === -1) sheet.appendRow(values);
    else sheet.getRange(rowIndex, 1, 1, 4).setValues([values]);

    return out({ ok: true, updated_at: nowIso });
  } catch (err) {
    return out({ error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// Upsert one row of the room_board tab, keyed by Mews confirmation number.
// Only the fields present in the request are written (partial update), so the
// dashboard can send just {reservation, room} on a move or {reservation,
// feed_9} on a feed edit without clobbering the rest.
function saveRoomBoard_(body) {
  var reservation = String(body.reservation == null ? "" : body.reservation).trim();
  if (!reservation) return out({ error: "missing reservation" });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(ROOM_BOARD_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(ROOM_BOARD_SHEET);
      sheet.getRange(1, 1, 1, ROOM_BOARD_COLS.length).setValues([ROOM_BOARD_COLS]);
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function (h) { return String(h).trim(); });
    var colIdx = {};
    for (var c = 0; c < headers.length; c++) colIdx[headers[c]] = c;
    if (colIdx.reservation == null) return out({ error: "room_board malformed" });

    var nowIso = new Date().toISOString();
    var rowIndex = -1;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][colIdx.reservation]).trim() === reservation) { rowIndex = r + 1; break; }
    }

    if (rowIndex === -1) {
      var newRow = new Array(headers.length).fill("");
      newRow[colIdx.reservation] = reservation;
      for (var i = 0; i < ROOM_BOARD_EDITABLE.length; i++) {
        var f = ROOM_BOARD_EDITABLE[i];
        if (body.hasOwnProperty(f) && colIdx[f] != null) newRow[colIdx[f]] = String(body[f] == null ? "" : body[f]);
      }
      if (colIdx.updated_at != null) newRow[colIdx.updated_at] = nowIso;
      sheet.appendRow(newRow);
      return out({ ok: true, reservation: reservation, created: true });
    }

    for (var j = 0; j < ROOM_BOARD_EDITABLE.length; j++) {
      var fld = ROOM_BOARD_EDITABLE[j];
      if (body.hasOwnProperty(fld) && colIdx[fld] != null) {
        sheet.getRange(rowIndex, colIdx[fld] + 1).setValue(String(body[fld] == null ? "" : body[fld]));
      }
    }
    if (colIdx.updated_at != null) sheet.getRange(rowIndex, colIdx.updated_at + 1).setValue(nowIso);
    return out({ ok: true, reservation: reservation });
  } catch (err) {
    return out({ error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

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

// Signed convivencia consent forms (public /consentimiento page). One row per
// submission, append-only — nothing here is ever updated in place. The drawn
// signature is saved as a PNG to a Drive folder and only its link is stored.
const CONSENT_SHEET = "Consent";
const CONSENT_FOLDER = "Doggos · Consentimientos (firmas)";
const CONSENT_COLS = [
  "timestamp",               // server time the form was received (ISO)
  "nombre_tutor",            // §1
  "dni_nie",                 // §1
  "telefono",                // §1
  "email",                   // §1
  "perros",                  // §1 dog name(s)
  "duermen_juntos",          // §2 Sí / No
  "duermen_juntos_nombres",  // §2 dog names, if authorised
  "leido_seccion_2",         // §2 initials → Sí
  "leido_seccion_3",         // §3 initials → Sí
  "leido_seccion_4",         // §4 initials → Sí
  "es_rpp",                  // §3 raza potencialmente peligrosa: Sí / No
  "contacto_emergencia",     // §5
  "veterinario_habitual",    // §5
  "acepta_entorno_natural",  // §6 Sí
  "consent_datos",           // §7 RGPD Sí
  "lugar_fecha",             // §10
  "firma_url",               // Drive link to the signature PNG
  "user_agent"               // light audit trail
];

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

  // Signed consent forms append to their own tab — routed off before the
  // dog_extras logic so the photo/portal pipeline is untouched.
  if (body.action === "submitConsent") return submitConsent_(body);

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

// Append one signed consent form to the Consent tab. The signature arrives as
// a base64 PNG data URL; it is written to a Drive folder and only the file link
// is stored in the sheet (a data URL would blow past the cell size limit).
// Append-only: a customer re-signing simply adds a new, newer row.
function submitConsent_(body) {
  var d = body.data || {};

  // Minimal server-side guard: a real submission always has a signer name and
  // the three acceptance flags. Prevents empty/garbage rows.
  var nombre = String(d.nombre_tutor == null ? "" : d.nombre_tutor).trim();
  if (!nombre) return out({ error: "missing nombre_tutor" });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONSENT_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(CONSENT_SHEET);
      sheet.getRange(1, 1, 1, CONSENT_COLS.length).setValues([CONSENT_COLS]);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() < 1) {
      sheet.getRange(1, 1, 1, CONSENT_COLS.length).setValues([CONSENT_COLS]);
      sheet.setFrozenRows(1);
    }

    var nowIso = new Date().toISOString();

    // Persist the drawn signature to Drive, if present.
    var firmaUrl = "";
    if (d.firma_png) {
      try { firmaUrl = saveSignature_(d.firma_png, nombre, nowIso); }
      catch (sigErr) { firmaUrl = "ERROR: " + sigErr; }
    }

    // Build the row in the fixed CONSENT_COLS order.
    var record = {
      timestamp: nowIso,
      nombre_tutor: nombre,
      dni_nie: str_(d.dni_nie),
      telefono: str_(d.telefono),
      email: str_(d.email),
      perros: str_(d.perros),
      duermen_juntos: str_(d.duermen_juntos),
      duermen_juntos_nombres: str_(d.duermen_juntos_nombres),
      leido_seccion_2: str_(d.leido_seccion_2),
      leido_seccion_3: str_(d.leido_seccion_3),
      leido_seccion_4: str_(d.leido_seccion_4),
      es_rpp: str_(d.es_rpp),
      contacto_emergencia: str_(d.contacto_emergencia),
      veterinario_habitual: str_(d.veterinario_habitual),
      acepta_entorno_natural: str_(d.acepta_entorno_natural),
      consent_datos: str_(d.consent_datos),
      lugar_fecha: str_(d.lugar_fecha),
      firma_url: firmaUrl,
      user_agent: str_(d.user_agent)
    };
    var row = CONSENT_COLS.map(function (c) { return record[c] != null ? record[c] : ""; });
    sheet.appendRow(row);

    return out({ ok: true, timestamp: nowIso, firma_url: firmaUrl });
  } catch (err) {
    return out({ error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// Decode a "data:image/png;base64,..." string, store it in the consent Drive
// folder (created on first use), and return a shareable link.
function saveSignature_(dataUrl, nombre, nowIso) {
  var m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(String(dataUrl));
  if (!m) throw new Error("firma no es un data URL válido");

  var folder;
  var it = DriveApp.getFoldersByName(CONSENT_FOLDER);
  folder = it.hasNext() ? it.next() : DriveApp.createFolder(CONSENT_FOLDER);

  var safeName = String(nombre).replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60) || "firma";
  var stamp = nowIso.replace(/[:.]/g, "-");
  var fileName = "firma_" + safeName.replace(/\s+/g, "_") + "_" + stamp + ".png";

  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fileName);
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return file.getUrl();
}

function str_(v) { return v == null ? "" : String(v); }

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * StockFlow - Google Sheet sync.
 *
 * STOCK: one row per SKU+stockGroup+location, live-updated in place.
 * ORDERS / TRANSFERS / RETURNS: full history, a new tab each month.
 * MASTER: appends every task into the current month tab with a "task" column.
 *
 * Fill the workbook IDs below, Save, then Deploy > Manage deployments > Edit >
 * New version > Deploy.
 */

var WORKBOOKS = {
  Stock:     '1kh9FwqFmw0ZDNM1IbVjXAR37ZU73h8AMBUM5-zfleYs',
  Transfers: '1gZj8-aGo1kfEOScy6TkQUNCwYroScW-E1hSBqwbgeWI',
  Orders:    '1o-N_Nc6ISZsTe7pwryBBsd2ol14_Xv-453foZ9N1i5E',
  Returns:   '16lUaUAV-GzBz4uB7fIAmuD2xr5A8pdSdsAaEh9EutoE',
};
var MASTER_ID = '1FT9dUMXwQWVpdEaJc4R8nOekOmj7CkGRzliu4cbN_Ss';

function doGet() {
  return json({ ok: true, service: 'stockflow-sheet-sync' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var task = body.sheet || 'Stock';
    var row = body.row || {};
    var ssId = WORKBOOKS[task];
    if (!ssId) return json({ ok: false, error: 'Unknown task: ' + task });

    if (task === 'Stock') {
      var tab = String(row.location || 'Unknown');
      upsertRow(SpreadsheetApp.openById(ssId), tab, row, 'key');
    } else {
      appendRow(SpreadsheetApp.openById(ssId), monthTab(ssId), row);
    }

    if (MASTER_ID) {
      var m = { task: task };
      for (var k in row) m[k] = row[k];
      appendRow(SpreadsheetApp.openById(MASTER_ID), monthTab(MASTER_ID), m);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function monthTab(id) {
  return Utilities.formatDate(new Date(), SpreadsheetApp.openById(id).getSpreadsheetTimeZone(), 'yyyy-MM');
}

function getOrMakeSheet(ss, tabName, keys) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(keys);
    sheet.getRange(1, 1, 1, keys.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureHeader(sheet, keys) {
  var header = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  if (header.join('') === '') {
    sheet.getRange(1, 1, 1, keys.length).setValues([keys]).setFontWeight('bold');
    return keys.slice();
  }
  keys.forEach(function (k) {
    if (header.indexOf(k) === -1) {
      header.push(k);
      sheet.getRange(1, header.length).setValue(k).setFontWeight('bold');
    }
  });
  return header;
}

function appendRow(ss, tabName, row) {
  var keys = Object.keys(row);
  var sheet = getOrMakeSheet(ss, tabName, keys);
  var header = ensureHeader(sheet, keys);
  sheet.appendRow(header.map(function (h) { return row[h] !== undefined ? row[h] : ''; }));
}

function upsertRow(ss, tabName, row, keyCol) {
  var keys = Object.keys(row);
  var sheet = getOrMakeSheet(ss, tabName, keys);
  var header = ensureHeader(sheet, keys);
  var keyIdx = header.indexOf(keyCol);
  var out = header.map(function (h) { return row[h] !== undefined ? row[h] : ''; });

  var last = sheet.getLastRow();
  if (last > 1 && keyIdx > -1) {
    var colVals = sheet.getRange(2, keyIdx + 1, last - 1, 1).getValues();
    for (var i = 0; i < colVals.length; i++) {
      if (String(colVals[i][0]) === String(row[keyCol])) {
        sheet.getRange(i + 2, 1, 1, out.length).setValues([out]);
        return;
      }
    }
  }
  sheet.appendRow(out);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/****************************************************
 * H&D Recruitment. Sheet1 to PARiM Sheet2 API
 * Google Apps Script Web App
 *
 * What it does:
 * 1) GET  ?action=readSheet1&token=YOUR_TOKEN
 *    Returns all rows from tab "sheet1" as JSON.
 *
 * 2) POST ?action=writeSheet2&token=YOUR_TOKEN
 *    Body JSON: { "rows": [ {target header: value} ] }
 *    Rebuilds tab "sheet2" using PARiM target headers.
 ****************************************************/

const CONFIG = {
  SOURCE_SHEET_NAME: 'sheet1',
  TARGET_SHEET_NAME: 'sheet2',

  // Change this to a strong private token.
  // Keep the same value in your Python .env as GOOGLE_SCRIPT_TOKEN.
  API_TOKEN: 'hd_parim_2026_PRIVATE_934875923847'
};

const TARGET_HEADERS = [
  'Email Address (compulsory)',
  'First Name (compulsory)',
  'Last Name (compulsory)',
  'Full name',
  'Gender',
  'Title',
  'Date of Birth',
  'Nationality',
  'NI / Social Security number',
  'Tax Code',
  'UTR',
  'Department',
  "Mobile (enter ' then 0.)",
  'Landline',
  'ID No.',
  'Country',
  'City/ Town',
  'Street Name',
  'House No.',
  'Apartment No.',
  'Postcode',
  'County',
  'Contract No',
  'Contract Start',
  'Contract End',
  'Employment Type',
  'Passport / ID Card Document No',
  'Issuing Country',
  'Expiry Date',
  'Date of Issue',
  'Visa Expiry',
  'Visa Description',
  'Drivers Licence',
  'Drivers Licence Date',
  'Access to Car',
  'Account Number',
  'Sort Code',
  'SIA Badge',
  'SIA Badge Number',
  'SIA Expiry Date',
  'Emergency Contact Name',
  'Emergency Contact Last Name',
  'Emergency Phone No',
  'Emergency Relation to user',
  'Documents Folder Link',
  'Parim Completed',
  'Parim Message',
  'Parim Profile URL',
  'Parim Updated At'
];

function doGet(e) {
  try {
    checkToken_(e);
    const action = String((e.parameter && e.parameter.action) || '').trim();

    if (action === 'readSheet1') {
      return jsonOutput_({
        ok: true,
        sourceSheet: CONFIG.SOURCE_SHEET_NAME,
        headers: getSheetHeaders_(CONFIG.SOURCE_SHEET_NAME),
        rows: readSheetObjects_(CONFIG.SOURCE_SHEET_NAME)
      });
    }

    if (action === 'ping') {
      return jsonOutput_({ ok: true, message: 'Apps Script API is working.' });
    }

    return jsonOutput_({ ok: false, error: 'Unknown GET action.' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    checkToken_(e);
    const action = String((e.parameter && e.parameter.action) || '').trim();
    const bodyText = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(bodyText);

    if (action === 'writeSheet2') {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const result = writeSheet2_(rows);
      return jsonOutput_({ ok: true, result: result });
    }

    return jsonOutput_({ ok: false, error: 'Unknown POST action.' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function checkToken_(e) {
  const providedToken = String((e.parameter && e.parameter.token) || '').trim();
  if (!providedToken || providedToken !== CONFIG.API_TOKEN) {
    throw new Error('Unauthorised. Invalid or missing token.');
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(sheetName) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function getSheetHeaders_(sheetName) {
  const sheet = getOrCreateSheet_(sheetName);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return [];
  const rawHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  return makeUniqueHeaders_(rawHeaders);
}

function readSheetObjects_(sheetName) {
  const sheet = getOrCreateSheet_(sheetName);
  const values = sheet.getDataRange().getDisplayValues();

  if (!values || values.length < 2) return [];

  const headers = makeUniqueHeaders_(values[0]);
  const rows = [];

  for (let r = 1; r < values.length; r++) {
    const rowValues = values[r];
    const isBlank = rowValues.every(v => String(v || '').trim() === '');
    if (isBlank) continue;

    const obj = { _rowNumber: r + 1 };
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = rowValues[c] || '';
    }
    rows.push(obj);
  }

  return rows;
}

function writeSheet2_(rows) {
  const sheet = getOrCreateSheet_(CONFIG.TARGET_SHEET_NAME);
  sheet.clearContents();

  sheet.getRange(1, 1, 1, TARGET_HEADERS.length).setValues([TARGET_HEADERS]);
  sheet.getRange(1, 1, 1, TARGET_HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  if (!rows.length) {
    return { writtenRows: 0, targetSheet: CONFIG.TARGET_SHEET_NAME };
  }

  const output = rows.map(row => {
    return TARGET_HEADERS.map(header => {
      const value = row && Object.prototype.hasOwnProperty.call(row, header) ? row[header] : '';
      return value === null || value === undefined ? '' : value;
    });
  });

  sheet.getRange(2, 1, output.length, TARGET_HEADERS.length).setValues(output);
  sheet.autoResizeColumns(1, TARGET_HEADERS.length);

  return { writtenRows: output.length, targetSheet: CONFIG.TARGET_SHEET_NAME };
}

function makeUniqueHeaders_(rawHeaders) {
  const seen = {};

  return rawHeaders.map((header, index) => {
    let clean = String(header || '').trim();
    if (!clean) clean = 'Column_' + (index + 1);

    if (!seen[clean]) {
      seen[clean] = 1;
      return clean;
    }

    seen[clean] += 1;
    return clean + '__' + seen[clean];
  });
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/****************************************************
 * H&D PARiM Transformer Bridge. Pending Rows Only
 * Google Apps Script Web App
 *
 * Purpose:
 * 1) Python reads ONLY pending rows from SOURCE_SHEET_NAME.
 * 2) Pending means CONFIG.STATUS_COLUMN_NAME is not marked as Done.
 * 3) Python transforms only those rows into PARiM format.
 * 4) Python appends transformed rows into a DIFFERENT existing Google Sheet file.
 * 5) After successful append, Python asks Apps Script to mark those source rows as Done.
 *
 * Deploy as Web App:
 * Execute as: Me
 * Who has access: Anyone
 ****************************************************/

const CONFIG = {
  API_TOKEN: 'CHANGE_THIS_TO_A_LONG_SECRET_TOKEN_12345',

  // SOURCE_SPREADSHEET_ID:
  // Leave blank if this Apps Script is attached to the source Google Sheet.
  // Or paste the source spreadsheet ID if this is a standalone script.
  SOURCE_SPREADSHEET_ID: '',
  SOURCE_SHEET_NAME: 'sheet1',

  // This is the source column used to detect whether the row was already processed.
  // Your source header is: Parim format complete
  STATUS_COLUMN_NAME: 'Parim format complete',
  DONE_VALUE: 'Done',

  // Optional columns to update in source after successful processing.
  MESSAGE_COLUMN_NAME: 'Parim Message',
  UPDATED_AT_COLUMN_NAME: 'Parim Updated At',

  // TARGET_SPREADSHEET_ID:
  // Paste the ID of the different existing Google Sheet where PARiM data should go.
  TARGET_SPREADSHEET_ID: 'PASTE_TARGET_GOOGLE_SHEET_ID_HERE',
  TARGET_SHEET_NAME: 'sheet1'
};

function doGet(e) {
  try {
    checkToken_(e);

    const action = (e.parameter.action || '').trim();

    if (action === 'readPendingSource') {
      return json_({ ok: true, data: readPendingSource_() });
    }

    // Old action kept for testing/backward compatibility.
    if (action === 'readSource') {
      return json_({ ok: true, data: readSource_() });
    }

    return json_({ ok: false, error: 'Unknown GET action. Use action=readPendingSource' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    checkToken_(e);

    const action = (e.parameter.action || '').trim();
    const body = JSON.parse(e.postData.contents || '{}');

    if (action === 'appendTarget') {
      const result = appendTarget_(body.headers || [], body.rows || []);
      return json_({ ok: true, data: result });
    }

    if (action === 'markSourceDone') {
      const result = markSourceDone_(body.rowNumbers || []);
      return json_({ ok: true, data: result });
    }

    // Old action kept for testing/backward compatibility. This clears and rewrites target.
    if (action === 'writeTarget') {
      const result = writeTarget_(body.headers || [], body.rows || []);
      return json_({ ok: true, data: result });
    }

    return json_({ ok: false, error: 'Unknown POST action. Use action=appendTarget or action=markSourceDone' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function checkToken_(e) {
  const token = e && e.parameter ? e.parameter.token : '';

  if (!token || token !== CONFIG.API_TOKEN) {
    throw new Error('Unauthorised. Invalid or missing token.');
  }
}

function getSourceSpreadsheet_() {
  if (CONFIG.SOURCE_SPREADSHEET_ID && CONFIG.SOURCE_SPREADSHEET_ID.trim()) {
    return SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID.trim());
  }

  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSourceSheet_() {
  const ss = getSourceSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SOURCE_SHEET_NAME);

  if (!sheet) {
    throw new Error('Source sheet not found: ' + CONFIG.SOURCE_SHEET_NAME);
  }

  return sheet;
}

function readSource_() {
  const sheet = getSourceSheet_();
  const values = sheet.getDataRange().getValues();

  if (!values || values.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = normaliseHeaders_(values[0]);
  const rows = values.slice(1).filter(rowHasAnyValue_);

  return { headers: headers, rows: rows };
}

function readPendingSource_() {
  const sheet = getSourceSheet_();
  const values = sheet.getDataRange().getValues();

  if (!values || values.length === 0) {
    return { headers: [], rows: [], rowNumbers: [] };
  }

  const headers = normaliseHeaders_(values[0]);
  const statusIndex = findHeaderIndex_(headers, CONFIG.STATUS_COLUMN_NAME);

  if (statusIndex === -1) {
    throw new Error('Status column not found in source sheet: ' + CONFIG.STATUS_COLUMN_NAME);
  }

  const pendingRows = [];
  const rowNumbers = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    if (!rowHasAnyValue_(row)) {
      continue;
    }

    const status = String(row[statusIndex] || '').trim().toLowerCase();
    const doneValue = String(CONFIG.DONE_VALUE || 'Done').trim().toLowerCase();

    if (status !== doneValue) {
      pendingRows.push(row);
      rowNumbers.push(i + 1); // Google Sheets row number. Header is row 1.
    }
  }

  return {
    headers: headers,
    rows: pendingRows,
    rowNumbers: rowNumbers,
    statusColumnName: CONFIG.STATUS_COLUMN_NAME,
    doneValue: CONFIG.DONE_VALUE
  };
}

function appendTarget_(headers, rows) {
  if (!CONFIG.TARGET_SPREADSHEET_ID || CONFIG.TARGET_SPREADSHEET_ID === 'PASTE_TARGET_GOOGLE_SHEET_ID_HERE') {
    throw new Error('TARGET_SPREADSHEET_ID is not set in CONFIG.');
  }

  if (!headers || headers.length === 0) {
    throw new Error('No target headers received from Python.');
  }

  rows = rows || [];

  const targetSs = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID.trim());
  let targetSheet = targetSs.getSheetByName(CONFIG.TARGET_SHEET_NAME);

  if (!targetSheet) {
    targetSheet = targetSs.insertSheet(CONFIG.TARGET_SHEET_NAME);
  }

  const lastRow = targetSheet.getLastRow();

  if (lastRow === 0) {
    const headerRange = targetSheet.getRange(1, 1, 1, headers.length);
    headerRange.setNumberFormat('@');
    headerRange.setValues([headers]);
    targetSheet.setFrozenRows(1);
  } else {
    // If the target sheet has something but no matching header, keep existing content and append below it.
    // You can manually clear target sheet once if you want a clean first import.
  }

  if (rows.length > 0) {
    const startRow = targetSheet.getLastRow() + 1;
    const dataRange = targetSheet.getRange(startRow, 1, rows.length, headers.length);
    dataRange.setNumberFormat('@');
    dataRange.setValues(rows);
  }

  targetSheet.autoResizeColumns(1, headers.length);

  return {
    targetSpreadsheetId: CONFIG.TARGET_SPREADSHEET_ID,
    targetSheetName: CONFIG.TARGET_SHEET_NAME,
    rowsWritten: rows.length,
    columnsWritten: headers.length,
    mode: 'append'
  };
}

function markSourceDone_(rowNumbers) {
  if (!rowNumbers || rowNumbers.length === 0) {
    return { rowsMarked: 0 };
  }

  const sheet = getSourceSheet_();
  const values = sheet.getDataRange().getValues();

  if (!values || values.length === 0) {
    return { rowsMarked: 0 };
  }

  const headers = normaliseHeaders_(values[0]);
  const statusIndex = findHeaderIndex_(headers, CONFIG.STATUS_COLUMN_NAME);

  if (statusIndex === -1) {
    throw new Error('Status column not found in source sheet: ' + CONFIG.STATUS_COLUMN_NAME);
  }

  const messageIndex = findHeaderIndex_(headers, CONFIG.MESSAGE_COLUMN_NAME);
  const updatedAtIndexes = findAllHeaderIndexes_(headers, CONFIG.UPDATED_AT_COLUMN_NAME);
  const now = new Date();

  let rowsMarked = 0;

  rowNumbers.forEach(function (rowNumber) {
    rowNumber = Number(rowNumber);

    if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
      return;
    }

    sheet.getRange(rowNumber, statusIndex + 1).setValue(CONFIG.DONE_VALUE);

    if (messageIndex !== -1) {
      sheet.getRange(rowNumber, messageIndex + 1).setValue('Formatted successfully');
    }

    updatedAtIndexes.forEach(function (idx) {
      sheet.getRange(rowNumber, idx + 1).setValue(now);
    });

    rowsMarked++;
  });

  return {
    rowsMarked: rowsMarked,
    statusColumnName: CONFIG.STATUS_COLUMN_NAME,
    doneValue: CONFIG.DONE_VALUE
  };
}

// Old full rewrite function kept for compatibility.
function writeTarget_(headers, rows) {
  if (!CONFIG.TARGET_SPREADSHEET_ID || CONFIG.TARGET_SPREADSHEET_ID === 'PASTE_TARGET_GOOGLE_SHEET_ID_HERE') {
    throw new Error('TARGET_SPREADSHEET_ID is not set in CONFIG.');
  }

  if (!headers || headers.length === 0) {
    throw new Error('No target headers received from Python.');
  }

  const targetSs = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID.trim());
  let targetSheet = targetSs.getSheetByName(CONFIG.TARGET_SHEET_NAME);

  if (!targetSheet) {
    targetSheet = targetSs.insertSheet(CONFIG.TARGET_SHEET_NAME);
  }

  const output = [headers].concat(rows || []);

  targetSheet.clearContents();
  targetSheet.clearFormats();

  const range = targetSheet.getRange(1, 1, output.length, headers.length);
  range.setNumberFormat('@');
  range.setValues(output);

  targetSheet.setFrozenRows(1);
  targetSheet.autoResizeColumns(1, headers.length);

  return {
    targetSpreadsheetId: CONFIG.TARGET_SPREADSHEET_ID,
    targetSheetName: CONFIG.TARGET_SHEET_NAME,
    rowsWritten: rows.length,
    columnsWritten: headers.length,
    mode: 'clear_and_rewrite'
  };
}

function normaliseHeaders_(headerRow) {
  return headerRow.map(function (h) {
    return String(h || '').trim();
  });
}

function rowHasAnyValue_(row) {
  return row.some(function (cell) {
    return String(cell || '').trim() !== '';
  });
}

function findHeaderIndex_(headers, name) {
  const wanted = String(name || '').trim().toLowerCase();

  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim().toLowerCase() === wanted) {
      return i;
    }
  }

  return -1;
}

function findAllHeaderIndexes_(headers, name) {
  const wanted = String(name || '').trim().toLowerCase();
  const indexes = [];

  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim().toLowerCase() === wanted) {
      indexes.push(i);
    }
  }

  return indexes;
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

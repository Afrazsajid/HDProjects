/**
 * PARiM Daily Shifts Google Sheets receiver.
 *
 * Behaviour:
 * 1. Receives one day's PARiM shifts from the Python Selenium script.
 * 2. Writes Start time and End time as one 24-hour Shift Time value,
 *    for example: 0645 - 1900.
 * 3. Keeps every date in the same "Daily Shifts" sheet.
 * 4. Leaves two completely blank rows between date sections.
 * 5. Re-importing an existing date updates only that date and preserves
 *    manually entered Arrival / Status and Notes values.
 */

const CONFIG = Object.freeze({
  SHEET_NAME: 'Daily Shifts',
  LOG_SHEET_NAME: 'Import Log',
  TOKEN_PROPERTY: 'PARIM_API_TOKEN',
  TIMEZONE: 'Europe/London',
  MAX_IMPORT_ROWS: 5000,
  COLUMNS: 8,
  GAP_ROWS: 2,
  SECTION_MARKER_PREFIX: 'PARIM_DATE=',
});

/**
 * Run once from the Apps Script editor.
 * Use the same token in the Python .env file as PARIM_API_TOKEN.
 */
function setApiToken() {
  const token = 'CHANGE_THIS_TO_A_LONG_RANDOM_TOKEN';
  if (!token || token.indexOf('CHANGE_THIS') === 0) {
    throw new Error('Edit setApiToken() and enter your real API token first.');
  }
  PropertiesService.getScriptProperties().setProperty(CONFIG.TOKEN_PROPERTY, token);
  Logger.log('API token saved in Script Properties.');
}

/** Basic Web App health check. */
function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'PARiM Daily Shifts Sheet API',
    timestamp: new Date().toISOString(),
  });
}

/** Receives JSON from the Python script. */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const payload = parseRequest_(e);
    validateToken_(payload.token);

    // The old action remains accepted so an older Python file fails safely.
    if (
      payload.action !== 'upsertDailyShifts' &&
      payload.action !== 'replaceDailyShifts'
    ) {
      throw new Error('Unsupported action: ' + String(payload.action || ''));
    }

    const result = upsertDailyShifts_(payload);
    return jsonResponse_(Object.assign({ ok: true }, result));
  } catch (error) {
    console.error(error);
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {
      // Lock was not obtained.
    }
  }
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing request body.');
  }

  const contentType = String(e.postData.type || '').toLowerCase();
  if (contentType.indexOf('application/json') !== -1) {
    return JSON.parse(e.postData.contents);
  }

  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  throw new Error('Request must use application/json.');
}

function validateToken_(providedToken) {
  const expectedToken = PropertiesService.getScriptProperties().getProperty(
    CONFIG.TOKEN_PROPERTY
  );
  if (!expectedToken) {
    throw new Error('API token is not configured. Run setApiToken() once.');
  }
  if (!providedToken || String(providedToken) !== expectedToken) {
    throw new Error('Invalid API token.');
  }
}

function upsertDailyShifts_(payload) {
  const isoDate = normaliseIsoDate_(payload.date);
  const sourceFilename = cleanText_(payload.sourceFilename || '');
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];

  if (!rawRows.length) {
    throw new Error('No shift rows were supplied.');
  }
  if (rawRows.length > CONFIG.MAX_IMPORT_ROWS) {
    throw new Error(
      'Import has ' + rawRows.length + ' rows. Maximum is ' + CONFIG.MAX_IMPORT_ROWS + '.'
    );
  }

  const records = rawRows.map(function (row, index) {
    const startTime = normaliseTime_(
      row.StartTime || row['Start time'],
      'Start time',
      index + 1
    );
    const endTime = normaliseTime_(
      row.EndTime || row['End time'],
      'End time',
      index + 1
    );

    const record = {
      startTime: startTime,
      endTime: endTime,
      shiftTime: startTime + ' - ' + endTime,
      person: cleanText_(row.Person),
      phone: cleanText_(row.Phone),
      position: cleanText_(row.Position),
      location: cleanText_(row.Location),
    };

    if (
      !record.person &&
      !record.phone &&
      !record.position &&
      !record.location
    ) {
      throw new Error('Blank shift row received at item ' + (index + 1) + '.');
    }
    return record;
  });

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error(
      'No active spreadsheet. Install Code.gs through Extensions > Apps Script inside the target Google Sheet.'
    );
  }

  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }

  ensureGridSize_(sheet, Math.max(records.length + 4, 100), CONFIG.COLUMNS);

  // A sheet can only contain one standard filter. Remove the old single-day
  // filter because this version stores multiple date tables on the same sheet.
  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();

  const existingSection = findDateSection_(sheet, isoDate);
  let sectionStartRow;
  let preservedManualValues;
  let mode;

  if (existingSection) {
    sectionStartRow = existingSection.startRow;
    preservedManualValues = readManualValues_(sheet, existingSection);
    resizeExistingSection_(sheet, existingSection, records.length);
    mode = 'updated';
  } else {
    sectionStartRow = nextSectionStartRow_(sheet);
    ensureGridSize_(
      sheet,
      sectionStartRow + records.length + 1 + CONFIG.GAP_ROWS,
      CONFIG.COLUMNS
    );
    preservedManualValues = emptyManualStore_();
    mode = 'appended';
  }

  writeDailySection_(
    sheet,
    sectionStartRow,
    records,
    preservedManualValues,
    isoDate,
    sourceFilename
  );
  applySheetLayout_(sheet);
  applyStatusFormatting_(sheet);
  writeImportLog_(spreadsheet, isoDate, records.length, sourceFilename, mode);

  SpreadsheetApp.flush();

  return {
    rowCount: records.length,
    date: isoDate,
    mode: mode,
    sectionStartRow: sectionStartRow,
    sheetName: CONFIG.SHEET_NAME,
    sheetId: sheet.getSheetId(),
    spreadsheetUrl: spreadsheet.getUrl(),
  };
}

function ensureGridSize_(sheet, requiredRows, requiredColumns) {
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      requiredColumns - sheet.getMaxColumns()
    );
  }
}

/** Returns the first row for a new date, leaving exactly two empty rows. */
function nextSectionStartRow_(sheet) {
  const lastRow = sheet.getLastRow();
  return lastRow > 0 ? lastRow + CONFIG.GAP_ROWS + 1 : 1;
}

/** Finds an existing date block, including blocks made by the older script. */
function findDateSection_(sheet, isoDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return null;

  const titleToFind = formatTitleDate_(isoDate);
  const values = sheet.getRange(1, 1, lastRow, 1).getDisplayValues();
  const notes = sheet.getRange(1, 1, lastRow, 1).getNotes();

  let startRow = 0;
  for (let index = 0; index < lastRow; index += 1) {
    const note = String(notes[index][0] || '');
    const value = cleanText_(values[index][0]);
    if (
      note.indexOf(CONFIG.SECTION_MARKER_PREFIX + isoDate) !== -1 ||
      value === titleToFind
    ) {
      startRow = index + 1;
      break;
    }
  }

  if (!startRow) return null;

  const headerRow = startRow + 1;
  let dataEndRow = headerRow;
  let cursor = startRow + 2;
  while (cursor <= sheet.getLastRow()) {
    const numberValue = cleanText_(sheet.getRange(cursor, 1).getDisplayValue());
    if (!numberValue) break;
    dataEndRow = cursor;
    cursor += 1;
  }

  return {
    startRow: startRow,
    headerRow: headerRow,
    dataStartRow: startRow + 2,
    dataEndRow: dataEndRow,
    dataCount: Math.max(0, dataEndRow - (startRow + 2) + 1),
    totalRows: 2 + Math.max(0, dataEndRow - (startRow + 2) + 1),
  };
}

/**
 * Changes only the selected date block's row count. Other date blocks are
 * shifted as required and are never cleared.
 */
function resizeExistingSection_(sheet, section, newRecordCount) {
  const requiredRows = 2 + newRecordCount;
  const difference = requiredRows - section.totalRows;

  if (difference > 0) {
    sheet.insertRowsAfter(section.startRow + section.totalRows - 1, difference);
  } else if (difference < 0) {
    sheet.deleteRows(section.startRow + requiredRows, Math.abs(difference));
  }
}

function emptyManualStore_() {
  return {
    exact: new Map(),
    base: new Map(),
  };
}

/**
 * Reads manually entered values from an existing section. It supports both the
 * old seven-column table and the new eight-column table.
 */
function readManualValues_(sheet, section) {
  const store = emptyManualStore_();
  if (!section.dataCount) return store;

  const lastColumn = Math.max(sheet.getLastColumn(), CONFIG.COLUMNS);
  const headers = sheet
    .getRange(section.headerRow, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(cleanText_);
  const headerIndex = {};
  headers.forEach(function (header, index) {
    if (header) headerIndex[header.toLowerCase()] = index;
  });

  const rows = sheet
    .getRange(section.dataStartRow, 1, section.dataCount, lastColumn)
    .getDisplayValues();

  rows.forEach(function (row) {
    function getValue(headerName) {
      const index = headerIndex[headerName.toLowerCase()];
      return index === undefined ? '' : cleanText_(row[index]);
    }

    const item = {
      status: getValue('Arrival / Status'),
      notes: getValue('Notes'),
      used: false,
    };
    const person = getValue('Person');
    const phone = getValue('Phone');
    const shiftTime = getValue('Shift Time');
    const position = getValue('Position');
    const location = getValue('Location');

    const exactKey = exactRecordKey_(person, phone, shiftTime, position, location);
    const baseKey = baseRecordKey_(person, phone, position, location);

    if (!store.exact.has(exactKey)) store.exact.set(exactKey, []);
    store.exact.get(exactKey).push(item);

    if (!store.base.has(baseKey)) store.base.set(baseKey, []);
    store.base.get(baseKey).push(item);
  });

  return store;
}

function takeManualValues_(store, record) {
  const exactKey = exactRecordKey_(
    record.person,
    record.phone,
    record.shiftTime,
    record.position,
    record.location
  );
  const baseKey = baseRecordKey_(
    record.person,
    record.phone,
    record.position,
    record.location
  );

  const exactQueue = store.exact.get(exactKey) || [];
  let item = exactQueue.find(function (candidate) {
    return !candidate.used;
  });

  // This fallback preserves values when upgrading an old date block that did
  // not yet contain the Shift Time column.
  if (!item) {
    const baseQueue = store.base.get(baseKey) || [];
    item = baseQueue.find(function (candidate) {
      return !candidate.used;
    });
  }

  if (!item) return ['', ''];
  item.used = true;
  return [item.status || '', item.notes || ''];
}

function writeDailySection_(
  sheet,
  startRow,
  records,
  preservedManualValues,
  isoDate,
  sourceFilename
) {
  const requiredRows = records.length + 2;
  const sectionRange = sheet.getRange(startRow, 1, requiredRows, CONFIG.COLUMNS);
  sectionRange.breakApart();
  sectionRange.clear();

  const displayDate = formatTitleDate_(isoDate);
  const titleRange = sheet.getRange(startRow, 1, 1, CONFIG.COLUMNS);
  titleRange.merge();
  titleRange
    .setValue(displayDate)
    .setBackground('#B7D3EA')
    .setFontFamily('Arial')
    .setFontSize(13)
    .setFontWeight('bold')
    .setFontStyle('italic')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#000000',
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    )
    .setNote(
      CONFIG.SECTION_MARKER_PREFIX +
        isoDate +
        '\nLast imported: ' +
        Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss') +
        (sourceFilename ? '\nSource: ' + sourceFilename : '')
    );

  const headers = [[
    'No.',
    'Person',
    'Phone',
    'Shift Time',
    'Position',
    'Location',
    'Arrival / Status',
    'Notes',
  ]];
  const headerRange = sheet.getRange(startRow + 1, 1, 1, CONFIG.COLUMNS);
  headerRange
    .setValues(headers)
    .setBackground('#1F2937')
    .setFontColor('#FFFFFF')
    .setFontFamily('Arial')
    .setFontSize(10)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  const output = records.map(function (record, index) {
    const saved = takeManualValues_(preservedManualValues, record);
    return [
      index + 1,
      safeSheetText_(record.person),
      safeSheetText_(record.phone),
      safeSheetText_(record.shiftTime),
      safeSheetText_(record.position),
      safeSheetText_(record.location),
      safeSheetText_(saved[0]),
      safeSheetText_(saved[1]),
    ];
  });

  const dataStartRow = startRow + 2;
  const dataRange = sheet.getRange(
    dataStartRow,
    1,
    output.length,
    CONFIG.COLUMNS
  );

  // Protect leading zeroes in phone numbers and times.
  sheet.getRange(dataStartRow, 2, output.length, 7).setNumberFormat('@');
  dataRange
    .setValues(output)
    .setFontFamily('Arial')
    .setFontSize(10)
    .setFontStyle('italic')
    .setVerticalAlignment('middle')
    .setWrap(true);

  sheet.getRange(dataStartRow, 1, output.length, 1).setHorizontalAlignment('center');
  sheet.getRange(dataStartRow, 2, output.length, 1).setHorizontalAlignment('center');
  sheet.getRange(dataStartRow, 3, output.length, 1).setHorizontalAlignment('center');
  sheet
    .getRange(dataStartRow, 4, output.length, 1)
    .setHorizontalAlignment('center')
    .setFontWeight('bold');
  sheet.getRange(dataStartRow, 5, output.length, 1).setHorizontalAlignment('center');
  sheet.getRange(dataStartRow, 6, output.length, 1).setHorizontalAlignment('center');
  sheet
    .getRange(dataStartRow, 7, output.length, 1)
    .setHorizontalAlignment('center')
    .setFontWeight('bold');
  sheet.getRange(dataStartRow, 8, output.length, 1).setHorizontalAlignment('left');

  const tableRange = sheet.getRange(
    startRow + 1,
    1,
    output.length + 1,
    CONFIG.COLUMNS
  );
  tableRange.setBorder(
    true,
    true,
    true,
    true,
    true,
    true,
    '#000000',
    SpreadsheetApp.BorderStyle.SOLID
  );

  sheet.setRowHeight(startRow, 30);
  sheet.setRowHeight(startRow + 1, 28);
  sheet.setRowHeights(dataStartRow, output.length, 24);
  headerRange.getCell(1, 7).setNote(
    'Examples: Arrived @ 06:50, Late @ 07:15, Absent, Cancelled, On the way.'
  );
}

function applySheetLayout_(sheet) {
  sheet.setColumnWidth(1, 45);
  sheet.setColumnWidth(2, 270);
  sheet.setColumnWidth(3, 145);
  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 230);
  sheet.setColumnWidth(6, 315);
  sheet.setColumnWidth(7, 175);
  sheet.setColumnWidth(8, 285);
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);
  sheet.setTabColor('#1F4E78');
}

function applyStatusFormatting_(sheet) {
  if (sheet.getMaxRows() < 3) return;
  const statusRange = sheet.getRange(3, 7, sheet.getMaxRows() - 2, 1);
  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('Arrived')
      .setBackground('#D9EAD3')
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('Late')
      .setBackground('#F6B26B')
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('Absent')
      .setBackground('#F4CCCC')
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains('Cancelled')
      .setBackground('#D9D9D9')
      .setRanges([statusRange])
      .build(),
  ];
  sheet.setConditionalFormatRules(rules);
}

function writeImportLog_(spreadsheet, isoDate, rowCount, sourceFilename, mode) {
  let logSheet = spreadsheet.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!logSheet) {
    logSheet = spreadsheet.insertSheet(CONFIG.LOG_SHEET_NAME);
    logSheet
      .getRange(1, 1, 1, 5)
      .setValues([['Imported At', 'Shift Date', 'Rows', 'Mode', 'Source File']])
      .setBackground('#1F2937')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    logSheet.setFrozenRows(1);
    logSheet.setColumnWidth(1, 170);
    logSheet.setColumnWidth(2, 110);
    logSheet.setColumnWidth(3, 70);
    logSheet.setColumnWidth(4, 90);
    logSheet.setColumnWidth(5, 280);
  } else if (logSheet.getLastColumn() === 4) {
    // Older versions stored Source File in column D. Insert the new Mode
    // column before it so historical source filenames stay in Source File.
    logSheet.insertColumnBefore(4);
    logSheet.getRange(1, 1, 1, 5).setValues([
      ['Imported At', 'Shift Date', 'Rows', 'Mode', 'Source File'],
    ]);
  } else if (logSheet.getLastColumn() < 5) {
    logSheet.insertColumnsAfter(logSheet.getLastColumn(), 5 - logSheet.getLastColumn());
    logSheet.getRange(1, 1, 1, 5).setValues([
      ['Imported At', 'Shift Date', 'Rows', 'Mode', 'Source File'],
    ]);
  }

  logSheet.appendRow([new Date(), isoDate, rowCount, mode, sourceFilename]);
  const lastRow = logSheet.getLastRow();
  logSheet.getRange(lastRow, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  logSheet.getRange(lastRow, 2).setNumberFormat('@');
}

function baseRecordKey_(person, phone, position, location) {
  return [person, phone, position, location]
    .map(function (value) {
      return cleanText_(value).toLowerCase();
    })
    .join('|');
}

function exactRecordKey_(person, phone, shiftTime, position, location) {
  return [person, phone, shiftTime, position, location]
    .map(function (value) {
      return cleanText_(value).toLowerCase();
    })
    .join('|');
}

function cleanText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Prevents values beginning with '=' from becoming spreadsheet formulas. */
function safeSheetText_(value) {
  const text = cleanText_(value);
  return /^=/.test(text) ? "'" + text : text;
}

/** Accepts 06:45, 0645 or a full PARiM date/time and returns 0645. */
function normaliseTime_(value, fieldName, rowNumber) {
  const text = cleanText_(value);
  const match = text.match(/(?:^|\s)([01]?\d|2[0-3]):?([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) {
    throw new Error(
      'Could not read ' + fieldName + ' at item ' + rowNumber + ': ' + text
    );
  }
  return String(Number(match[1])).padStart(2, '0') + match[2];
}

function normaliseIsoDate_(value) {
  const text = cleanText_(value);
  let match = text.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (match) {
    validateDateParts_(Number(match[1]), Number(match[2]), Number(match[3]));
    return match[1] + '-' + match[2] + '-' + match[3];
  }

  match = text.match(/^(\d{2})\/(\d{2})\/(20\d{2})$/);
  if (match) {
    validateDateParts_(Number(match[3]), Number(match[2]), Number(match[1]));
    return match[3] + '-' + match[2] + '-' + match[1];
  }

  throw new Error('Date must be YYYY-MM-DD or DD/MM/YYYY.');
}

function validateDateParts_(year, month, day) {
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('Invalid shift date.');
  }
}

function formatTitleDate_(isoDate) {
  const parts = isoDate.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  return Utilities.formatDate(date, CONFIG.TIMEZONE, 'EEEE, MMMM d, yyyy');
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

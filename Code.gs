/**
 * EverydayWork (Engineering Trade Custom Build)
 * Production REST API Gateway
 * Copyright (c) 2026 EverydayBusinessApps. All Rights Reserved.
 */

function invoicePdfEngine_() {
  return "inv-template-plain";
}

// Closed beta access. Everyday Business owns this Sheet and this Apps Script
// project. The client is not the Apps Script owner. The web app runs as
// Everyday Business, so the client can use the app while the sheet is shared
// as Viewer. Share the sheet as Editor only when the client should change
// cells by hand.
//
// Apps Script web apps do not receive custom headers such as X-Client-Token,
// and sending one makes the browser issue a CORS preflight that Apps Script
// does not answer. POST requests carry clientToken in the JSON body. A GET
// health check carries clientToken as a query parameter.
// ContentService cannot set the HTTP status line, so a rejection is HTTP 200
// with JSON status 401 (missing) or 403 (wrong or unset). Callers must read
// that field. A missing or wrong token never opens the sheet.
var CLIENT_TOKEN_KEY_ = "CLIENT_TOKEN";

function jsonOut_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function scriptProperty_(name) {
  var props = (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties)
    ? PropertiesService.getScriptProperties()
    : null;
  if (!props || typeof props.getProperty !== "function") return "";
  return String(props.getProperty(name) || "").trim();
}

function expectedClientToken_() {
  return scriptProperty_(CLIENT_TOKEN_KEY_);
}

function tokenMatches_(given, expected) {
  var a = String(given);
  var b = String(expected);
  var length = Math.max(a.length, b.length);
  var diff = a.length === b.length ? 0 : 1;
  var i;
  for (i = 0; i < length; i++) {
    var ca = i < a.length ? a.charCodeAt(i) : 0;
    var cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= (ca ^ cb);
  }
  return diff === 0;
}

function presentedClientTokens_(e) {
  var found = [];
  if (e && e.parameter && e.parameter.clientToken != null && String(e.parameter.clientToken).trim() !== "") {
    found.push(String(e.parameter.clientToken).trim());
  }
  if (e && e.postData && e.postData.contents) {
    try {
      var data = JSON.parse(e.postData.contents);
      if (data && data.clientToken != null && String(data.clientToken).trim() !== "") {
        found.push(String(data.clientToken).trim());
      }
    } catch (err) {}
  }
  return found;
}

function clientTokenGate_(e) {
  var expected = expectedClientToken_();
  var found = presentedClientTokens_(e);
  if (!expected) {
    return { ok: false, status: 403, error: "Client token is not set on this web app." };
  }
  if (!found.length) {
    return { ok: false, status: 401, error: "Client token is missing." };
  }
  var i;
  for (i = 0; i < found.length; i++) {
    if (!tokenMatches_(found[i], expected)) {
      return { ok: false, status: 403, error: "Client token was not accepted." };
    }
  }
  return { ok: true };
}

function rejectClientToken_(gate) {
  return jsonOut_({ success: false, status: gate.status, error: gate.error });
}

// Open the workbook again so a web request sees edits made in the sheet.
function workbook_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active || typeof SpreadsheetApp.openById !== "function" || typeof active.getId !== "function") return active;
  try {
    if (typeof SpreadsheetApp.flush === "function") SpreadsheetApp.flush();
    const opened = SpreadsheetApp.openById(active.getId());
    return opened || active;
  } catch (err) {
    return active;
  }
}

function doGet(e) {
  var gate = clientTokenGate_(e);
  if (!gate.ok) return rejectClientToken_(gate);
  return jsonOut_({
    success: true,
    message: "EverydayWork is ready.",
    invoicePdf: invoicePdfEngine_(),
    emailCc: true
  });
}

function doPost(e) {
  if (e && e.parameter && String(e.parameter.stripeWebhook || "").trim()) {
    return jsonOut_(handleStripeWebhook_(e));
  }
  var gate = clientTokenGate_(e);
  if (!gate.ok) return rejectClientToken_(gate);
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Empty execution payload context received.");
    }
    
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    let responseData = {};

    if (action === "getInitialAppData") {
      responseData = fetchInitialAppData();
    } else if (action === "logTimeEntry") {
      responseData = executeTimeLog(requestData.payload);
    } else if (action === "getUnbilledSummary") {
      responseData = fetchUnbilledSummary(requestData.payload);
    } else if (action === "compileFinalInvoice") {
      responseData = processAccountInvoice(requestData.payload);
    } else if (action === "updateInvoiceStatus") {
      responseData = updateInvoiceStatus(requestData.payload);
    } else if (action === "getAppSnapshot") {
      responseData = fetchAppSnapshot();
    } else if (action === "getDashboard") {
      responseData = fetchDashboard();
    } else if (action === "getInvoiceDetail") {
      responseData = fetchInvoiceDetail(requestData.payload);
    } else if (action === "compileInvoice") {
      responseData = compileSingleInvoice(requestData.payload);
    } else if (action === "createPaymentLink") {
      responseData = createPaymentLink(requestData.payload);
    } else if (action === "exportInvoicePdf") {
      responseData = exportInvoicePdf(requestData.payload);
    } else if (action === "listClients") {
      responseData = listClientRecords();
    } else if (action === "saveClient") {
      responseData = saveClientRecord_(requestData.payload);
    } else if (action === "getSettings") {
      responseData = fetchSettings();
    } else if (action === "saveSettings") {
      responseData = saveSettings_(requestData.payload);
    } else {
      throw new Error("Invalid API action parameter mapping.");
    }

    return jsonOut_(responseData);

  } catch (err) {
    return jsonOut_({ success: false, error: err.toString() });
  }
}

/**
 * 1. Fetch Client Profiles and Invoice Headers for Web App Dropdowns
 */
function fetchInitialAppData() {
  const ss = workbook_();
  const clientSheet = ss.getSheetByName("ClientRecords");
  if (!clientSheet) return { success: false, error: "The client list is missing." };

  const clientRecords = readClientRows_(ss);
  const clients = clientRecords.map(function (row) { return { name: row.name }; });
  return { success: true, clients: clients, clientRecords: clientRecords, invoices: fetchInvoiceRecords() };
}

function fetchClientRecords() {
  return fetchInitialAppData();
}

function formatInvoiceDate_(value, timezone) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, timezone || Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "").trim();
}

function invoiceLabel_(id, status, dateStr) {
  let label = "Invoice " + id;
  if (status) label += " · " + status;
  if (dateStr) label += " · " + dateStr;
  return label;
}

/**
 * InvoiceList column I (Invoice Status), in this order:
 * Draft, Invoiced, Paid, Written off.
 * A draft can only become Invoiced. Invoiced can become Paid or Written off.
 * Paid and Written off stay there until Undo puts that invoice back to Invoiced.
 * Older sheet values Unpaid and Bad debt are read as Invoiced and Written off.
 * Time can only be added while the status is Draft.
 */
function displayStatus_(status) {
  const value = String(status || "").trim();
  if (!value) return "Draft";
  const key = value.toLowerCase();
  if (key === "draft") return "Draft";
  if (key === "invoiced" || key === "unpaid") return "Invoiced";
  if (key === "paid") return "Paid";
  if (key === "written off" || key === "bad debt") return "Written off";
  return value;
}

function normalizeInvoiceStatuses_(invoiceSheet) {
  if (!invoiceSheet) return;
  const last = lastFilledRow_(invoiceSheet, 9);
  if (last < 2) return;
  const count = last - 1;
  const values = invoiceSheet.getRange(2, 9, count, 1).getValues();
  const next = [];
  let changed = false;
  for (let i = 0; i < values.length; i++) {
    const raw = values[i][0];
    const text = String(raw == null ? "" : raw).trim();
    const key = text.toLowerCase();
    if (key !== "unpaid" && key !== "bad debt") {
      next.push([raw]);
      continue;
    }
    const formula = invoiceSheet.getRange(i + 2, 9).getFormula();
    if (formula) {
      next.push([raw]);
      continue;
    }
    next.push([displayStatus_(text)]);
    changed = true;
  }
  if (changed) invoiceSheet.getRange(2, 9, count, 1).setValues(next);
}

function isDraftStatus_(status) {
  return displayStatus_(status) === "Draft";
}

function findInvoiceListRow_(invoiceSheet, invoiceId) {
  if (!invoiceSheet) return 0;
  const target = String(invoiceId || "").trim();
  if (!target) return 0;
  const lastRow = invoiceSheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = invoiceSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === target) return i + 2;
  }
  return 0;
}

function guardDraftInvoice_(invoiceSheet, invoiceId) {
  const row = findInvoiceListRow_(invoiceSheet, invoiceId);
  if (!row) {
    return { ok: false, error: "That invoice is not on InvoiceList." };
  }
  const current = String(invoiceSheet.getRange(row, 9).getValue() || "").trim();
  if (!current) {
    // First time entry establishes column I.
    invoiceSheet.getRange(row, 9).setValue("Draft");
    return { ok: true, status: "Draft" };
  }
  if (!isDraftStatus_(current)) {
    return {
      ok: false,
      error: "Time can only be added while an invoice is Draft. Invoice " + invoiceId + " is " + displayStatus_(current) + "."
    };
  }
  return { ok: true, status: "Draft" };
}

function fetchInvoiceRecords() {
  const ss = workbook_();
  const timezone = ss.getSpreadsheetTimeZone();
  const byId = {};

  const invoiceSheet = ss.getSheetByName("InvoiceList");
  if (invoiceSheet) {
    const lastRow = invoiceSheet.getLastRow();
    if (lastRow >= 2) {
      const data = invoiceSheet.getRange(2, 1, lastRow - 1, 9).getValues();
      for (let i = 0; i < data.length; i++) {
        const id = String(data[i][0]).trim();
        if (!id) continue;
        const dateStr = formatInvoiceDate_(data[i][7], timezone);
        const status = displayStatus_(data[i][8]);
        const clientName = String(data[i][1] || "").trim();
        byId[id] = {
          id: id,
          clientName: clientName,
          status: status,
          date: dateStr,
          label: invoiceLabel_(id, status, dateStr)
        };
      }
    }
  }

  const timeSheet = ss.getSheetByName("Time&Attendance");
  if (timeSheet) {
    const lastRow = timeSheetLastRow_(timeSheet);
    if (lastRow >= 2) {
      const data = timeSheet.getRange(2, 3, lastRow - 1, 2).getValues(); // C InvoiceInt, D ClientID
      for (let i = 0; i < data.length; i++) {
        const id = String(data[i][0]).trim();
        const clientName = String(data[i][1] || "").trim();
        if (!id) continue;
        if (!byId[id]) {
          byId[id] = {
            id: id,
            clientName: clientName,
            status: "Draft",
            date: "",
            label: invoiceLabel_(id, "Draft", "")
          };
        } else if (!byId[id].clientName && clientName) {
          byId[id].clientName = clientName;
        }
      }
    }
  }

  return Object.keys(byId).map(function (key) { return byId[key]; });
}

function nextInvoiceInt_(invoiceSheet) {
  const invoiceValues = invoiceSheet.getRange("A2:A").getValues();
  let nextInvoiceInt = 1;
  for (let i = 0; i < invoiceValues.length; i++) {
    if (invoiceValues[i][0] !== "") {
      nextInvoiceInt++;
    }
  }
  return nextInvoiceInt;
}

function appendInvoiceListRow_(invoiceSheet, status) {
  const invLastValues = invoiceSheet.getRange("H1:H").getValues();
  let nextInvListRow = 1;
  while (invLastValues[nextInvListRow - 1] && invLastValues[nextInvListRow - 1][0] !== "") {
    nextInvListRow++;
  }
  invoiceSheet.getRange(nextInvListRow, 8).setValue(new Date());   // Column H: Invoice Date
  invoiceSheet.getRange(nextInvListRow, 9).setValue(status || "Draft"); // Column I: Invoice Status
  return nextInvListRow;
}

function createDraftInvoice_(invoiceSheet) {
  const invoiceId = nextInvoiceInt_(invoiceSheet);
  appendInvoiceListRow_(invoiceSheet, "Draft");
  return invoiceId;
}

/**
 * Clock time for Time&Attendance columns G and I.
 * Those columns are time-formatted. A day-fraction passed to setValue is
 * not kept, so the cell is =TIME(h,m,0). That result is below 1, which is
 * what the hours formula multiplies by 24. A calendar date is 1 or more,
 * so the shift length was stored as a fraction of a day. Overnight finishes
 * stay below 1; the formula adds 24 hours when finish is earlier than start.
 */
function clockParts_(timeStr) {
  const match = String(timeStr || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours: hours, minutes: minutes };
}

function writeClockTime_(cell, timeStr) {
  const clock = clockParts_(timeStr);
  if (!clock) return false;
  cell.setNumberFormat("hh:mm");
  cell.setFormula("=TIME(" + clock.hours + "," + clock.minutes + ",0)");
  return true;
}

function isOvernightTime(start, finish) {
  const parseMins = (value) => {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return (Number(match[1]) * 60) + Number(match[2]);
  };
  const startMins = parseMins(start);
  const finishMins = parseMins(finish);
  if (startMins == null || finishMins == null) return false;
  return finishMins <= startMins;
}

/**
 * 2. Commit Service Inputs (Inserts only to inputs, letting ARRAYFORMULAs compute the rest)
 */
function executeTimeLog(payload) {
  const ss = workbook_();
  const timeSheet = ss.getSheetByName("Time&Attendance");
  if (!timeSheet) return { success: false, error: "Missing Time&Attendance tab." };

  // The rate formula in column K runs to row 29544, so getLastRow() is not
  // the next empty shift. Walk the client column only as far as the last real one.
  const bound = Math.max(timeSheetLastRow_(timeSheet), 1);
  const values = timeSheet.getRange(1, 4, bound, 1).getValues();
  let nextRow = 1;
  while (values[nextRow - 1] && values[nextRow - 1][0] !== "") {
    nextRow++;
  }

  if (!clockParts_(payload.start) || !clockParts_(payload.finish)) {
    return { success: false, error: "Choose a start and finish time." };
  }

  const overnight = payload.overnight === true || isOvernightTime(payload.start, payload.finish);
  const invoiceSheet = ss.getSheetByName("InvoiceList");
  const mode = String(payload.invoiceMode || "new").toLowerCase();
  let invoiceId = "";

  // A repeat tap must not skip the draft rule. Check that first, then
  // treat an identical job from the last two minutes as the save that
  // already landed, before opening another draft.
  if (mode === "existing") {
    invoiceId = String(payload.invoiceId || "").trim();
    if (!invoiceId) return { success: false, error: "Choose an existing invoice." };
    if (!invoiceSheet) return { success: false, error: "Missing InvoiceList tab." };
    const draftGuard = guardDraftInvoice_(invoiceSheet, invoiceId);
    if (!draftGuard.ok) return { success: false, error: draftGuard.error };
  } else if (!invoiceSheet) {
    return { success: false, error: "Missing InvoiceList tab." };
  }

  const replay = recentMatchingEntry_(timeSheet, payload);
  if (replay) {
    return jobSavedResult_(mode, replay.invoiceId, overnight, true, null);
  }

  if (mode !== "existing") {
    invoiceId = createDraftInvoice_(invoiceSheet);
  }

  // Insert exactly into raw input cells matching your column layout coordinates
  timeSheet.getRange(nextRow, 3).setValue(Number(invoiceId) || invoiceId); // Col C: InvoiceInt
  timeSheet.getRange(nextRow, 4).setValue(payload.clientName); // Col D: ClientID
  timeSheet.getRange(nextRow, 5).setValue(payload.date);       // Col E: Date (shift start date)
  timeSheet.getRange(nextRow, 6).setValue(payload.jobDetails); // Col F: Job Details
  const startCell = timeSheet.getRange(nextRow, 7);
  const finishCell = timeSheet.getRange(nextRow, 9);
  if (!writeClockTime_(startCell, payload.start) || !writeClockTime_(finishCell, payload.finish)) {
    return { success: false, error: "Choose a start and finish time." };
  }
  timeSheet.getRange(nextRow, 8).setValue(payload.lunch);      // Col H: Lunch (String matching lookup e.g. 'half hour')
  timeSheet.getRange(nextRow, 13).setValue(new Date());        // Col M: Updated On Timestamp

  return jobSavedResult_(mode, invoiceId, overnight, false, loggedShiftAmount_(timeSheet, nextRow));
}

function loggedShiftAmount_(sheet, row) {
  if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.flush) SpreadsheetApp.flush();
  const charge = numberOrNull_(sheet.getRange(row, 12).getValue());
  if (charge != null) return charge;
  const hours = numberOrNull_(sheet.getRange(row, 10).getValue());
  const rate = numberOrNull_(sheet.getRange(row, 11).getValue());
  if (hours == null || rate == null) return null;
  return Math.round(hours * rate * 100) / 100;
}

function jobSavedResult_(mode, invoiceId, overnight, alreadySaved, amount) {
  const code = canonicalInvoiceCode_(invoiceId);
  let message;
  if (String(mode || "").toLowerCase() === "existing") {
    message = "Job added to invoice " + code + ".";
  } else if (overnight) {
    message = "Overnight job logged on invoice " + code + ".";
  } else {
    message = "Job logged on invoice " + code + ".";
  }
  const result = {
    success: true,
    message: message,
    invoiceId: String(invoiceId),
    invoiceCode: code,
    alreadySaved: !!alreadySaved
  };
  if (amount != null && isFinite(amount)) result.amount = amount;
  return result;
}

function sameClock_(cellValue, timeStr) {
  const clock = clockParts_(timeStr);
  if (!clock) return false;
  const want = clock.hours * 60 + clock.minutes;
  if (typeof cellValue === "number" && isFinite(cellValue)) {
    return Math.round(cellValue * 1440) === want;
  }
  if (isDateValue_(cellValue)) {
    return cellValue.getHours() * 60 + cellValue.getMinutes() === want;
  }
  const match = String(cellValue || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return false;
  return Number(match[1]) * 60 + Number(match[2]) === want;
}

// A second tap of the same job, before the first answer got back to the van,
// must not open another invoice.
function recentMatchingEntry_(sheet, payload) {
  const last = timeSheetLastRow_(sheet);
  if (last < 2) return null;
  const count = last - 1;
  const data = sheet.getRange(2, 3, count, 11).getValues();
  const wantClient = clientText_(payload.clientName);
  const wantJob = clientText_(payload.jobDetails);
  const wantLunch = clientText_(payload.lunch || "na");
  const wantDate = isoDate_(payload.date);
  const now = Date.now();
  for (let i = data.length - 1; i >= 0; i--) {
    const client = clientText_(data[i][1]);
    if (!client || client.toLowerCase() !== wantClient.toLowerCase()) continue;
    const updated = data[i][10];
    if (!isDateValue_(updated) || Math.abs(now - updated.getTime()) > 2 * 60 * 1000) return null;
    if (clientText_(data[i][3]) !== wantJob) return null;
    if (clientText_(data[i][5] || "na") !== wantLunch) return null;
    if (isoDate_(data[i][2]) !== wantDate) return null;
    if (!sameClock_(data[i][4], payload.start) || !sameClock_(data[i][6], payload.finish)) return null;
    return { invoiceId: data[i][0] };
  }
  return null;
}

/**
 * 3. Calculate Open Accrued Items (Checks for blank cells in Column C: InvoiceInt)
 */
function fetchUnbilledSummary(payload) {
  const ss = workbook_();
  const timeSheet = ss.getSheetByName("Time&Attendance");
  if (!timeSheet) return { success: false, error: "Time&Attendance tab missing." };

  const clientName = String(payload.clientName || "").trim();
  const invoiceSheet = ss.getSheetByName("InvoiceList");
  const statusById = {};
  if (invoiceSheet && invoiceSheet.getLastRow() >= 2) {
    const invoiceRows = invoiceSheet.getRange(2, 1, invoiceSheet.getLastRow() - 1, 9).getValues();
    for (let i = 0; i < invoiceRows.length; i++) {
      const id = String(invoiceRows[i][0]).trim();
      if (!id) continue;
      statusById[id] = displayStatus_(invoiceRows[i][8]);
    }
  }

  const lastRow = timeSheetLastRow_(timeSheet);
  let totalHours = 0;
  let totalAmount = 0;

  if (lastRow >= 2) {
    const data = timeSheet.getRange(2, 1, lastRow - 1, 12).getValues();
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const invoiceInt = String(row[2]).trim(); // Column C: InvoiceInt
      const rowClient = String(row[3]).trim();  // Column D: ClientID
      const hours = Number(row[9]) || 0;         // Column J: Hours (calculated by your formula)
      const charge = Number(row[11]) || 0;       // Column L: Billable Charge (calculated by your formula)
      if (rowClient !== clientName) continue;

      // Still open: legacy rows with no invoice, or time sitting on a Draft invoice.
      const status = invoiceInt ? (statusById[invoiceInt] || "Draft") : "Draft";
      if (invoiceInt === "" || isDraftStatus_(status)) {
        totalHours += hours;
        totalAmount += charge;
      }
    }
  }
  return { success: true, totalHours: totalHours, totalAmount: totalAmount };
}

function attachSnapshot_(ss, result) {
  if (!result || !result.success) return result;
  try {
    if (SpreadsheetApp.flush) SpreadsheetApp.flush();
    const snapshot = buildDashboardReport_(ss, new Date());
    if (snapshot && snapshot.success) result.snapshot = snapshot;
  } catch (err) {}
  return result;
}

/**
 * 4. Process Account Invoice (Pushes the next sequence number down to Column C: InvoiceInt)
 */
function processAccountInvoice(payload) {
  const ss = workbook_();
  const timeSheet = ss.getSheetByName("Time&Attendance");
  const invoiceSheet = ss.getSheetByName("InvoiceList");

  if (!timeSheet || !invoiceSheet) return { success: false, error: "Operational tables missing." };

  const clientName = String(payload.clientName || "").trim();
  if (!clientName) return { success: false, error: "Choose a client account first." };

  const marked = [];
  const records = fetchInvoiceRecords();
  for (let i = 0; i < records.length; i++) {
    const inv = records[i];
    if (inv.clientName !== clientName || !isDraftStatus_(inv.status)) continue;
    const row = findInvoiceListRow_(invoiceSheet, inv.id);
    if (!row) continue;
    invoiceSheet.getRange(row, 9).setValue("Invoiced"); // Column I: Invoice Status
    marked.push(String(inv.id));
  }

  // Legacy rows still waiting for an invoice number are closed onto a new Invoiced header.
  const nextInvoiceInt = nextInvoiceInt_(invoiceSheet);
  const timeLastRow = timeSheetLastRow_(timeSheet);
  let updatedRowsCount = 0;

  if (timeLastRow >= 2) {
    const range = timeSheet.getRange(2, 1, timeLastRow - 1, 4); // Target columns A to D
    const data = range.getValues();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const invoiceIntCell = String(row[2]).trim(); // Column C: InvoiceInt
      const clientNameCell = String(row[3]).trim(); // Column D: ClientID

      if (clientNameCell === clientName && invoiceIntCell === "") {
        data[i][2] = nextInvoiceInt;
        updatedRowsCount++;
      }
    }

    if (updatedRowsCount > 0) {
      range.setValues(data);
      appendInvoiceListRow_(invoiceSheet, "Invoiced");
      marked.push(String(nextInvoiceInt));
    }
  }

  if (marked.length === 0) {
    return { success: false, error: "No draft invoices or open unbilled items detected for this client profile." };
  }

  lockBilledTimeRates_(ss, { invoiceIds: marked });

  const label = marked.length === 1 ? ("Invoice " + marked[0]) : ("Invoices " + marked.join(", "));
  return attachSnapshot_(ss, {
    success: true,
    invoiceId: marked[marked.length - 1],
    status: "Invoiced",
    message: label + " set to Invoiced.",
    invoices: fetchInvoiceRecords()
  });
}

/**
 * Move one invoice along Draft → Invoiced → Paid or Written off.
 * Undo is only for Paid and Written off, and it returns the invoice to Invoiced.
 */
function updateInvoiceStatus(payload) {
  const ss = workbook_();
  const invoiceSheet = ss.getSheetByName("InvoiceList");
  if (!invoiceSheet) return { success: false, error: "Missing InvoiceList tab." };

  const invoiceId = String((payload && payload.invoiceId) || "").trim();
  const requested = String((payload && payload.status) || "").trim();
  if (!invoiceId) return { success: false, error: "Choose an invoice." };

  const row = findInvoiceListRow_(invoiceSheet, invoiceId);
  if (!row) return { success: false, error: "That invoice is not on InvoiceList." };

  const current = displayStatus_(invoiceSheet.getRange(row, 9).getValue());
  let next = "";
  if (requested === "Undo") {
    if (current !== "Paid" && current !== "Written off") {
      return { success: false, error: "Undo is for a paid or written-off invoice." };
    }
    next = "Invoiced";
  } else if (requested === "Paid" || requested === "Written off") {
    if (current !== "Invoiced") {
      return { success: false, error: "Mark the invoice invoiced before it can be " + requested.toLowerCase() + "." };
    }
    next = requested;
  } else {
    return { success: false, error: "Choose Paid, Written off, or Undo." };
  }

  invoiceSheet.getRange(row, 9).setValue(next);
  lockBilledTimeRates_(ss, { invoiceIds: [invoiceId] });
  const code = canonicalInvoiceCode_(invoiceId);
  const message = requested === "Undo"
    ? ("Invoice " + code + " back to invoiced.")
    : ("Invoice " + code + " marked " + next + ".");
  return {
    success: true,
    invoiceId: invoiceId,
    invoiceCode: code,
    status: next,
    message: message
  };
}

/**
 * Mark one draft Invoiced: InvoiceList column I becomes Invoiced.
 * A blank invoice date is stamped today so the period stats can place it.
 */
function compileSingleInvoice(payload) {
  const ss = workbook_();
  const invoiceSheet = ss.getSheetByName("InvoiceList");
  if (!invoiceSheet) return { success: false, error: "Missing InvoiceList tab." };

  const invoiceId = String((payload && payload.invoiceId) || "").trim();
  if (!invoiceId) return { success: false, error: "Choose an invoice." };

  const row = findInvoiceListRow_(invoiceSheet, invoiceId);
  if (!row) return { success: false, error: "That invoice is not on InvoiceList." };

  const status = displayStatus_(invoiceSheet.getRange(row, 9).getValue());
  if (status !== "Draft") {
    return { success: false, error: "Only a Draft invoice can be marked Invoiced. Invoice " + invoiceId + " is " + status + "." };
  }

  invoiceSheet.getRange(row, 9).setValue("Invoiced");
  if (!invoiceSheet.getRange(row, 8).getValue()) invoiceSheet.getRange(row, 8).setValue(new Date());
  lockBilledTimeRates_(ss, { invoiceIds: [invoiceId] });

  const code = canonicalInvoiceCode_(invoiceId);
  return {
    success: true,
    invoiceId: invoiceId,
    invoiceCode: code,
    status: "Invoiced",
    message: "Invoice " + code + " marked invoiced."
  };
}

function fetchDashboard() {
  return buildDashboardReport_(workbook_(), new Date());
}

function fetchAppSnapshot() {
  return fetchDashboard();
}

function fetchInvoiceDetail(payload) {
  const ss = workbook_();
  const report = buildDashboardReport_(ss, new Date());
  if (!report.success) return report;
  const invoiceId = String((payload && payload.invoiceId) || "").trim();
  const invoice = (report.invoices || []).filter(function (item) { return item.id === invoiceId; })[0];
  if (!invoice) return { success: false, error: "That invoice is not on the books." };
  if (!invoice.lines) invoice.lines = readInvoiceLines_(ss, invoice);
  return { success: true, invoice: invoice };
}

function roundMoney_(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function numberOrNull_(value) {
  if (value === "" || value == null) return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}

function isDateValue_(value) {
  return Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime());
}

function isoDate_(value, timezone) {
  if (isDateValue_(value)) {
    return Utilities.formatDate(value, timezone || "UTC", "yyyy-MM-dd");
  }
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return dmy[3] + "-" + String(dmy[2]).padStart(2, "0") + "-" + String(dmy[1]).padStart(2, "0");
  return "";
}

function serviceEndIso_(text) {
  const matches = String(text || "").match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/g);
  if (!matches || !matches.length) return "";
  return isoDate_(matches[matches.length - 1], "UTC");
}

function addDaysIso_(iso, days) {
  if (!iso) return "";
  const parts = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + (Number(days) || 0)));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function daysBetweenIso_(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const a = startIso.split("-").map(Number);
  const b = endIso.split("-").map(Number);
  const ms = Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2]);
  return Math.round(ms / 86400000);
}

function inIsoRange_(iso, start, end) {
  return !!(iso && start && end && iso >= start && iso <= end);
}

function invoiceKind_(status) {
  const label = displayStatus_(status);
  if (label === "Paid") return "paid";
  if (label === "Written off") return "writtenoff";
  if (label === "Draft") return "draft";
  return "due";
}

function canonicalInvoiceCode_(rawId, timeCodeByInt) {
  const text = String(rawId || "").trim();
  if (/^INV-/i.test(text)) return text;
  if (timeCodeByInt && timeCodeByInt[text]) return timeCodeByInt[text];
  const n = Number(text);
  if (text && String(n) === text && n > 0) {
    const whole = Math.trunc(n);
    const padded = whole < 1000 ? String(whole).padStart(3, "0") : String(whole);
    return "INV-JR26-" + padded;
  }
  return text;
}

function invoicePrintCode_(ss, invoiceId) {
  const text = String(invoiceId || "").trim();
  if (/^INV-/i.test(text)) return text;
  const timeCodeByInt = {};
  const timeSheet = ss.getSheetByName("Time&Attendance");
  const timeLast = timeSheet ? timeSheetLastRow_(timeSheet) : 0;
  if (timeSheet && timeLast >= 2) {
    const data = timeSheet.getRange(2, 2, timeLast - 1, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      const code = String(data[i][0] || "").trim();
      const intId = String(data[i][1] || "").trim();
      if (code && intId && !timeCodeByInt[intId]) timeCodeByInt[intId] = code;
    }
  }
  return canonicalInvoiceCode_(text, timeCodeByInt);
}

function lastDayOfMonth_(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function periodKeys_() {
  return ["week", "month", "quarter", "year"];
}

function monthNames_() {
  return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
}

function shortMonthNames_() {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
}

function shortDay_(iso) {
  const parts = String(iso || "").split("-");
  const names = shortMonthNames_();
  return Number(parts[2]) + " " + (names[Number(parts[1]) - 1] || parts[1]);
}

function rangeLabel_(start, end) {
  if (String(start).slice(0, 4) === String(end).slice(0, 4)) {
    return shortDay_(start) + " – " + shortDay_(end) + " " + end.slice(0, 4);
  }
  return shortDay_(start) + " " + start.slice(0, 4) + " – " + shortDay_(end) + " " + end.slice(0, 4);
}

function weekWindowFromIso_(iso) {
  const parts = String(iso || "").split("-").map(Number);
  const weekday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = addDaysIso_(iso, mondayOffset);
  const end = addDaysIso_(start, 6);
  return { key: "week", label: rangeLabel_(start, end), start: start, end: end };
}

function parseFinancialYearEnd_(value, timezone) {
  if (value == null || value === "") return null;
  if (isDateValue_(value)) {
    const iso = isoDate_(value, timezone || "UTC");
    if (!iso) return null;
    return checkedYearEnd_(Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
  }
  const text = String(value).trim().replace(/(\d+)(st|nd|rd|th)\b/gi, "$1");
  const months = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
    april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
    november: 11, nov: 11, december: 12, dec: 12
  };
  const named = text.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+\d{4})?$/);
  const namedRev = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+\d{4})?$/i);
  const slash = text.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.]\d{2,4})?$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (named && months[named[2].toLowerCase()]) return checkedYearEnd_(months[named[2].toLowerCase()], Number(named[1]));
  if (namedRev && months[namedRev[1].toLowerCase()]) return checkedYearEnd_(months[namedRev[1].toLowerCase()], Number(namedRev[2]));
  if (slash) return checkedYearEnd_(Number(slash[2]), Number(slash[1]));
  if (iso) return checkedYearEnd_(Number(iso[2]), Number(iso[3]));
  return null;
}

function checkedYearEnd_(month, day) {
  const lengths = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > lengths[month]) return null;
  return { month: month, day: day };
}

function yearEndIso_(year, month, day) {
  let used = day;
  if (month === 2 && day === 29) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (!leap) used = 28;
  }
  return year + "-" + String(month).padStart(2, "0") + "-" + String(used).padStart(2, "0");
}

function financialYearWindow_(iso, month, day) {
  const year = Number(String(iso).slice(0, 4));
  const endYear = iso <= yearEndIso_(year, month, day) ? year : year + 1;
  const end = yearEndIso_(endYear, month, day);
  const start = addDaysIso_(yearEndIso_(endYear - 1, month, day), 1);
  return { key: "year", label: rangeLabel_(start, end), start: start, end: end };
}

function financialYearEndParts_(ss) {
  if (!ss || typeof ss.getSheetByName !== "function") return null;
  const config = ss.getSheetByName("Config");
  if (!config || !config.getLastRow || config.getLastRow() < 1) return null;
  const timezone = (ss.getSpreadsheetTimeZone && ss.getSpreadsheetTimeZone()) || "UTC";
  const rows = config.getRange(1, 1, config.getLastRow(), 2).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (!/financial year/i.test(clientText_(rows[i][0]))) continue;
    return parseFinancialYearEnd_(rows[i][1], timezone);
  }
  return parseFinancialYearEnd_(config.getRange(3, 2).getValue(), timezone);
}

function financialYearEndText_(value, parts) {
  const names = monthNames_();
  if (isDateValue_(value)) return parts.day + " " + names[parts.month - 1];
  const text = clientText_(value);
  return text || (parts.day + " " + names[parts.month - 1]);
}

function periodWindowFromIso_(iso, key) {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const names = monthNames_();
  if (key === "week") return weekWindowFromIso_(iso);
  if (key === "month") {
    const last = lastDayOfMonth_(year, month);
    return {
      key: "month",
      label: names[month - 1] + " " + year,
      start: iso.slice(0, 7) + "-01",
      end: iso.slice(0, 7) + "-" + String(last).padStart(2, "0")
    };
  }
  if (key === "quarter") {
    const quarter = Math.floor((month - 1) / 3);
    const startMonth = quarter * 3 + 1;
    const endMonth = startMonth + 2;
    const last = lastDayOfMonth_(year, endMonth);
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return {
      key: "quarter",
      label: "Q" + (quarter + 1) + " " + year,
      start: year + "-" + pad(startMonth) + "-01",
      end: year + "-" + pad(endMonth) + "-" + pad(last)
    };
  }
  return { key: "year", label: String(year), start: year + "-01-01", end: year + "-12-31" };
}

function blankPeriod_(window) {
  return {
    key: window.key,
    label: window.label,
    start: window.start,
    end: window.end,
    hours: 0,
    shifts: 0,
    clients: 0,
    billable: 0,
    avgRate: 0,
    topClient: "",
    topClientHours: 0,
    paid: 0,
    paidCount: 0,
    sent: 0,
    sentCount: 0,
    due: 0,
    dueCount: 0,
    draft: 0,
    draftCount: 0,
    overdue: 0,
    overdueCount: 0,
    writtenOff: 0,
    writtenOffCount: 0
  };
}

function clientText_(value) {
  return String(value == null ? "" : value).trim();
}

function clientPhone_(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && isFinite(value)) {
    if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
    return String(value);
  }
  return String(value).trim();
}

function clientNumberOrBlank_(value) {
  if (value === "" || value == null) return "";
  if (typeof value === "number") return isFinite(value) ? value : "";
  const text = String(value).trim();
  if (!text) return "";
  const n = numberOrNull_(value);
  return n == null ? "" : n;
}

function parseClientNumber_(value, label) {
  if (value === "" || value == null) return { ok: true, value: "" };
  if (typeof value === "number") {
    if (!isFinite(value)) return { ok: false, error: label + " must be a number." };
    if (value < 0) return { ok: false, error: label + " cannot be negative." };
    return { ok: true, value: value };
  }
  const text = String(value).trim().replace(/[€£$]/g, "").replace(/,/g, "").replace(/\s/g, "");
  if (!text) return { ok: true, value: "" };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, error: label + " must be a number." };
  const n = Number(text);
  if (!isFinite(n)) return { ok: false, error: label + " must be a number." };
  if (n < 0) return { ok: false, error: label + " cannot be negative." };
  return { ok: true, value: n };
}

function readClientRows_(ss) {
  const sheet = ss.getSheetByName("ClientRecords");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const name = clientText_(data[i][0]);
    if (!name) continue;
    rows.push({
      name: name,
      address1: clientText_(data[i][1]),
      address2: clientText_(data[i][2]),
      address3: clientText_(data[i][3]),
      address4: clientText_(data[i][4]),
      rate: clientNumberOrBlank_(data[i][5]),
      contact: clientText_(data[i][6]),
      email: clientText_(data[i][7]),
      phone: clientPhone_(data[i][8]),
      terms: clientNumberOrBlank_(data[i][9])
    });
  }
  rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return rows;
}

function clientDirectoryFromRows_(rows) {
  const map = {};
  (rows || []).forEach(function (row) {
    const terms = Number(row.terms);
    map[row.name] = {
      email: row.email,
      terms: terms > 0 ? terms : 0,
      contact: row.contact || ""
    };
  });
  return map;
}

function readClientDirectory_(ss) {
  return clientDirectoryFromRows_(readClientRows_(ss));
}

function listClientRecords() {
  const ss = workbook_();
  if (!ss.getSheetByName("ClientRecords")) return { success: false, error: "The client list is missing." };
  return { success: true, clientRecords: readClientRows_(ss) };
}

function matchClientIndexes_(names, wanted) {
  const target = clientText_(wanted).toLowerCase();
  const hits = [];
  if (!target) return hits;
  for (let i = 0; i < names.length; i++) {
    const name = clientText_(names[i][0]);
    if (name && name.toLowerCase() === target) hits.push(i);
  }
  return hits;
}

function sameClientRate_(left, right) {
  const a = left === "" || left == null ? "" : Number(left);
  const b = right === "" || right == null ? "" : Number(right);
  if (a === "" && b === "") return true;
  if (a === "" || b === "") return false;
  if (isNaN(a) || isNaN(b)) return false;
  return a === b;
}

function billedRateFormula_() {
  return '=ARRAYFORMULA(IF(LEN(D2:D29544),IF(LEN(N2:N29544),N2:N29544,IFERROR(VLOOKUP(D2:D29544,ClientRecords!A:F,6,FALSE),DefaultHourlyRate)),""))';
}

function ensureBilledRateFormula_(timeSheet) {
  if (!timeSheet) return;
  const current = String(timeSheet.getRange("K2").getFormula() || "");
  if (current.indexOf("N2:N29544") !== -1) return;
  if (!clientText_(timeSheet.getRange(1, 14).getValue())) {
    timeSheet.getRange(1, 14).setValue("Billed Rate");
  }
  timeSheet.getRange("K2").setFormula(billedRateFormula_());
}

function lastFilledRow_(sheet, column) {
  const last = sheet.getLastRow();
  if (last < 1) return 0;
  const values = sheet.getRange(1, column, last, 1).getValues();
  let used = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] !== "" && values[i][0] != null) used = i + 1;
  }
  return used;
}

// Time&Attendance column K is an ARRAYFORMULA down to row 29544, so
// getLastRow() follows that formula. A shift stops at the last client or date.
function columnLastRow_(sheet, column) {
  if (!sheet) return 0;
  const direction = typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.Direction && SpreadsheetApp.Direction.UP;
  if (direction && sheet.getMaxRows) {
    try {
      const bottom = sheet.getRange(sheet.getMaxRows(), column);
      if (bottom.getNextDataCell) {
        const found = bottom.getNextDataCell(direction);
        const row = found.getRow();
        const value = found.getValue ? found.getValue() : sheet.getRange(row, column).getValue();
        if (value !== "" && value != null) return row;
        return 0;
      }
    } catch (err) {}
  }
  return lastFilledRow_(sheet, column);
}

function timeSheetLastRow_(sheet) {
  if (!sheet) return 0;
  return Math.max(columnLastRow_(sheet, 4), columnLastRow_(sheet, 5));
}

function invoiceStatusByKey_(invoiceSheet) {
  const map = {};
  if (!invoiceSheet || invoiceSheet.getLastRow() < 2) return map;
  const data = invoiceSheet.getRange(2, 1, invoiceSheet.getLastRow() - 1, 9).getValues();
  for (let i = 0; i < data.length; i++) {
    const id = clientText_(data[i][0]);
    if (!id) continue;
    map[id.toLowerCase()] = displayStatus_(data[i][8]);
  }
  return map;
}

function timeRowKeys_(code, invoiceInt) {
  const keys = [];
  const codeText = clientText_(code);
  const intText = clientText_(invoiceInt);
  if (codeText) keys.push(codeText.toLowerCase());
  if (intText && keys.indexOf(intText.toLowerCase()) === -1) keys.push(intText.toLowerCase());
  return keys;
}

function statusForTimeRow_(statusByKey, code, invoiceInt) {
  const keys = timeRowKeys_(code, invoiceInt);
  if (!keys.length) return "Draft";
  for (let i = 0; i < keys.length; i++) {
    if (statusByKey[keys[i]]) return statusByKey[keys[i]];
  }
  return "Draft";
}

// Column N keeps the rate for invoices that have left Draft. Column K
// uses that value, and still looks up ClientRecords for drafts and new shifts.
function lockBilledTimeRates_(ss, filter) {
  const timeSheet = ss.getSheetByName("Time&Attendance");
  if (!timeSheet) return 0;
  ensureBilledRateFormula_(timeSheet);
  const lastClientRow = timeSheetLastRow_(timeSheet);
  if (lastClientRow < 2) return 0;

  const count = lastClientRow - 1;
  const data = timeSheet.getRange(2, 2, count, 13).getValues();
  const statusByKey = invoiceStatusByKey_(ss.getSheetByName("InvoiceList"));
  const clientName = clientText_(filter && filter.clientName).toLowerCase();
  const invoiceIds = {};
  const requested = (filter && filter.invoiceIds) || [];
  for (let i = 0; i < requested.length; i++) {
    const id = clientText_(requested[i]).toLowerCase();
    if (id) invoiceIds[id] = true;
  }
  const useClient = !!clientName;
  const useInvoice = requested.length > 0;
  let lockedCount = 0;
  let changed = false;

  for (let i = 0; i < data.length; i++) {
    const client = clientText_(data[i][2]);
    if (useClient && client.toLowerCase() !== clientName) continue;
    const keys = timeRowKeys_(data[i][0], data[i][1]);
    if (useInvoice && !keys.some(function (key) { return invoiceIds[key]; })) continue;
    const status = statusForTimeRow_(statusByKey, data[i][0], data[i][1]);
    if (isDraftStatus_(status)) continue;
    if (data[i][12] !== "" && data[i][12] != null) continue;
    const rate = clientNumberOrBlank_(data[i][9]);
    if (rate === "") continue;
    data[i][12] = rate;
    lockedCount += 1;
    changed = true;
  }

  if (changed) {
    const locks = data.map(function (row) { return [row[12]]; });
    const range = timeSheet.getRange(2, 14, count, 1);
    range.setNumberFormat("0.00");
    range.setValues(locks);
  }
  return lockedCount;
}

function renameClientOnTimeSheet_(ss, fromName, toName) {
  const sheet = ss.getSheetByName("Time&Attendance");
  const last = sheet ? timeSheetLastRow_(sheet) : 0;
  if (!sheet || last < 2) return false;
  const range = sheet.getRange(2, 4, last - 1, 1);
  const values = range.getValues();
  const from = clientText_(fromName).toLowerCase();
  let changed = false;
  for (let i = 0; i < values.length; i++) {
    const current = clientText_(values[i][0]);
    if (current && current.toLowerCase() === from) {
      values[i][0] = toName;
      changed = true;
    }
  }
  if (changed) range.setValues(values);
  return changed;
}

function saveClientRecord_(payload) {
  const ss = workbook_();
  const sheet = ss.getSheetByName("ClientRecords");
  if (!sheet) return { success: false, error: "The client list is missing." };

  const source = payload || {};
  const originalName = clientText_(source.originalName);
  const name = clientText_(source.name);
  if (!name) return { success: false, error: "Enter a client name." };

  const rate = parseClientNumber_(source.rate, "Rate");
  if (!rate.ok) return { success: false, error: rate.error };
  const terms = parseClientNumber_(source.terms, "Payment terms");
  if (!terms.ok) return { success: false, error: terms.error };

  const last = sheet.getLastRow();
  const names = last >= 2 ? sheet.getRange(2, 1, last - 1, 1).getValues() : [];
  const originalHits = originalName ? matchClientIndexes_(names, originalName) : [];
  if (originalName && !originalHits.length) {
    return { success: false, error: "That client is no longer in the list." };
  }
  const rowIndex = originalName ? originalHits[0] : -1;
  const conflict = matchClientIndexes_(names, name).some(function (idx) { return idx !== rowIndex; });
  if (conflict) return { success: false, error: "That client is already in the list." };

  let targetRow;
  if (rowIndex >= 0) {
    targetRow = rowIndex + 2;
  } else {
    let lastUsed = 1;
    for (let i = 0; i < names.length; i++) {
      if (clientText_(names[i][0])) lastUsed = i + 2;
    }
    targetRow = lastUsed + 1;
  }

  const previousRate = rowIndex >= 0 ? sheet.getRange(targetRow, 6).getValue() : "";
  const rateChanged = rowIndex >= 0 && !sameClientRate_(previousRate, rate.value);
  if (rateChanged) lockBilledTimeRates_(ss, { clientName: originalName });

  const phone = clientPhone_(source.phone);
  sheet.getRange(targetRow, 9).setNumberFormat("@");
  sheet.getRange(targetRow, 1, 1, 10).setValues([[
    name,
    clientText_(source.address1),
    clientText_(source.address2),
    clientText_(source.address3),
    clientText_(source.address4),
    rate.value,
    clientText_(source.contact),
    clientText_(source.email),
    phone,
    terms.value
  ]]);

  let message = (originalName ? "Updated " : "Added ") + name + ".";
  if (originalName && originalName !== name && renameClientOnTimeSheet_(ss, originalName, name)) {
    message += " Time entries now use that name.";
  }
  if (rateChanged) {
    message += " Drafts and new shifts use this rate. Sent invoices keep the rate they were billed at.";
  }

  return attachSnapshot_(ss, {
    success: true,
    message: message,
    clientRecords: readClientRows_(ss)
  });
}

function readTimeRows_(ss, timezone) {
  const sheet = ss.getSheetByName("Time&Attendance");
  const last = sheet ? timeSheetLastRow_(sheet) : 0;
  if (!sheet || last < 2) return [];
  const data = sheet.getRange(2, 1, last - 1, 12).getValues();
  const rows = [];
  for (let i = 0; i < data.length; i++) {
    const client = String(data[i][3] || "").trim();
    const date = isoDate_(data[i][4], timezone);
    if (!client && !date) continue;
    const hours = numberOrNull_(data[i][9]) || 0;
    const rate = numberOrNull_(data[i][10]);
    let charge = numberOrNull_(data[i][11]);
    if (charge == null) charge = rate != null ? hours * rate : 0;
    rows.push({
      code: String(data[i][1] || "").trim(),
      intId: String(data[i][2] || "").trim(),
      client: client,
      date: date,
      details: String(data[i][5] || "").trim(),
      start: data[i][6],
      finish: data[i][8],
      hours: hours,
      rate: rate == null ? 0 : rate,
      charge: charge || 0
    });
  }
  return rows;
}

function clockLabel_(value, timezone) {
  if (isDateValue_(value)) {
    return Utilities.formatDate(value, timezone || "UTC", "HH:mm");
  }
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value || "").trim();
  return String(match[1]).padStart(2, "0") + ":" + match[2];
}

function buildDashboardReport_(ss, asOfDate) {
  const timezone = (ss.getSpreadsheetTimeZone && ss.getSpreadsheetTimeZone()) || "UTC";
  const today = Utilities.formatDate(asOfDate || new Date(), timezone, "yyyy-MM-dd");
  const timeSheet = ss.getSheetByName("Time&Attendance");
  if (!timeSheet) return { success: false, error: "Missing Time&Attendance tab." };

  const clientRows = readClientRows_(ss);
  const clients = clientDirectoryFromRows_(clientRows);
  const shifts = readTimeRows_(ss, timezone);
  const timeCodeByInt = {};
  shifts.forEach(function (shift) {
    if (shift.code && shift.intId && !timeCodeByInt[shift.intId]) timeCodeByInt[shift.intId] = shift.code;
  });

  const groups = {};
  function groupFor(code) {
    if (!groups[code]) {
      groups[code] = { code: code, shifts: [], list: null };
    }
    return groups[code];
  }
  shifts.forEach(function (shift) {
    const code = shift.code || canonicalInvoiceCode_(shift.intId, timeCodeByInt);
    if (!code) return;
    groupFor(code).shifts.push(shift);
  });

  const invoiceSheet = ss.getSheetByName("InvoiceList");
  normalizeInvoiceStatuses_(invoiceSheet);
  if (invoiceSheet && invoiceSheet.getLastRow() >= 2) {
    const data = invoiceSheet.getRange(2, 1, invoiceSheet.getLastRow() - 1, 9).getValues();
    for (let i = 0; i < data.length; i++) {
      const listId = String(data[i][0] || "").trim();
      if (!listId) continue;
      const code = canonicalInvoiceCode_(listId, timeCodeByInt);
      const group = groupFor(code || listId);
      if (group.list) continue;
      group.list = {
        id: listId,
        client: String(data[i][1] || "").trim(),
        job: String(data[i][2] || "").trim(),
        service: String(data[i][3] || "").trim(),
        hours: numberOrNull_(data[i][4]),
        rate: numberOrNull_(data[i][5]),
        total: numberOrNull_(data[i][6]),
        date: isoDate_(data[i][7], timezone),
        status: displayStatus_(data[i][8])
      };
    }
  }

  const yearEnd = financialYearEndParts_(ss);
  const windows = {
    week: weekWindowFromIso_(today),
    month: periodWindowFromIso_(today, "month"),
    quarter: periodWindowFromIso_(today, "quarter"),
    year: yearEnd ? financialYearWindow_(today, yearEnd.month, yearEnd.day) : periodWindowFromIso_(today, "year")
  };
  const periods = {};
  const clientHours = {};
  periodKeys_().forEach(function (key) {
    periods[key] = blankPeriod_(windows[key]);
    clientHours[key] = {};
  });

  shifts.forEach(function (shift) {
    if (!shift.date) return;
    periodKeys_().forEach(function (key) {
      if (!inIsoRange_(shift.date, windows[key].start, windows[key].end)) return;
      const bucket = periods[key];
      bucket.hours = roundMoney_(bucket.hours + shift.hours);
      bucket.shifts += 1;
      bucket.billable = roundMoney_(bucket.billable + shift.charge);
      if (shift.client) {
        clientHours[key][shift.client] = roundMoney_((clientHours[key][shift.client] || 0) + shift.hours);
      }
    });
  });

  periodKeys_().forEach(function (key) {
    const names = Object.keys(clientHours[key]);
    periods[key].clients = names.length;
    periods[key].avgRate = periods[key].hours ? roundMoney_(periods[key].billable / periods[key].hours) : 0;
    names.sort(function (a, b) {
      const diff = clientHours[key][b] - clientHours[key][a];
      return diff || a.localeCompare(b);
    });
    if (names.length) {
      periods[key].topClient = names[0];
      periods[key].topClientHours = clientHours[key][names[0]];
    }
  });

  const invoices = [];
  const open = {
    dueAmount: 0, dueCount: 0, overdueAmount: 0, overdueCount: 0,
    draftAmount: 0, draftCount: 0,
    paidAmount: 0, paidCount: 0,
    writtenOffAmount: 0, writtenOffCount: 0
  };

  Object.keys(groups).sort().forEach(function (code) {
    const group = groups[code];
    const list = group.list;
    const shiftRows = group.shifts;
    let client = list && list.client;
    if (!client) {
      const named = shiftRows.filter(function (shift) { return shift.client; })[0];
      client = named ? named.client : "";
    }
    const profile = clients[client] || { email: "", terms: 0, contact: "" };
    const shiftHours = shiftRows.reduce(function (sum, shift) { return sum + shift.hours; }, 0);
    const shiftCharge = shiftRows.reduce(function (sum, shift) { return sum + shift.charge; }, 0);
    const dates = shiftRows.map(function (shift) { return shift.date; }).filter(Boolean).sort();
    const status = list ? list.status : "Draft";
    const kind = invoiceKind_(status);
    const date = (list && list.date) || (dates.length ? dates[dates.length - 1] : "");
    const service = (list && list.service) || (dates.length ? (dates[0] === dates[dates.length - 1] ? dates[0] : dates[0] + " - " + dates[dates.length - 1]) : "");
    const anchor = date || serviceEndIso_(service) || (dates.length ? dates[dates.length - 1] : "");
    const dueDate = date && profile.terms ? addDaysIso_(date, profile.terms) : "";
    const overdue = kind === "due" && !!dueDate && dueDate < today;
    const total = list && list.total != null ? roundMoney_(list.total) : roundMoney_(shiftCharge);
    const hours = list && list.hours != null ? roundMoney_(list.hours) : roundMoney_(shiftHours);
    const job = (list && list.job) || (shiftRows.filter(function (shift) { return shift.details; }).map(function (shift) { return shift.details; })[0] || "");
    const lines = linesFromGroup_(shiftRows, timezone);

    const invoice = {
      id: list ? list.id : code,
      code: code,
      clientName: client,
      status: status,
      kind: kind,
      date: date,
      dueDate: dueDate,
      overdue: overdue,
      daysOverdue: overdue ? daysBetweenIso_(dueDate, today) : 0,
      hours: hours,
      total: total,
      rate: list && list.rate != null ? roundMoney_(list.rate) : 0,
      servicePeriod: service,
      jobDetails: job,
      email: profile.email,
      contact: profile.contact || "",
      terms: profile.terms,
      inWeek: inIsoRange_(anchor, windows.week.start, windows.week.end),
      inMonth: inIsoRange_(anchor, windows.month.start, windows.month.end),
      inQuarter: inIsoRange_(anchor, windows.quarter.start, windows.quarter.end),
      inYear: inIsoRange_(anchor, windows.year.start, windows.year.end),
      lines: lines
    };
    invoices.push(invoice);

    if (kind === "due") {
      open.dueAmount = roundMoney_(open.dueAmount + total);
      open.dueCount += 1;
      if (overdue) {
        open.overdueAmount = roundMoney_(open.overdueAmount + total);
        open.overdueCount += 1;
      }
    } else if (kind === "draft") {
      open.draftAmount = roundMoney_(open.draftAmount + total);
      open.draftCount += 1;
    } else if (kind === "paid") {
      open.paidAmount = roundMoney_(open.paidAmount + total);
      open.paidCount += 1;
    } else if (kind === "writtenoff") {
      open.writtenOffAmount = roundMoney_(open.writtenOffAmount + total);
      open.writtenOffCount += 1;
    }

    periodKeys_().forEach(function (key) {
      const flag = key === "week" ? invoice.inWeek : key === "month" ? invoice.inMonth : key === "quarter" ? invoice.inQuarter : invoice.inYear;
      if (!flag) return;
      const bucket = periods[key];
      if (kind !== "draft") {
        bucket.sent = roundMoney_(bucket.sent + total);
        bucket.sentCount += 1;
      }
      if (kind === "paid") {
        bucket.paid = roundMoney_(bucket.paid + total);
        bucket.paidCount += 1;
      } else if (kind === "due") {
        bucket.due = roundMoney_(bucket.due + total);
        bucket.dueCount += 1;
        if (overdue) {
          bucket.overdue = roundMoney_(bucket.overdue + total);
          bucket.overdueCount += 1;
        }
      } else if (kind === "draft") {
        bucket.draft = roundMoney_(bucket.draft + total);
        bucket.draftCount += 1;
      } else if (kind === "writtenoff") {
        bucket.writtenOff = roundMoney_(bucket.writtenOff + total);
        bucket.writtenOffCount += 1;
      }
    });
  });

  invoices.sort(function (a, b) {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const dueCmp = String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"));
    if (dueCmp) return dueCmp;
    return String(a.code).localeCompare(String(b.code));
  });

  const unbilled = {};
  function addUnbilled_(client, hours, amount) {
    const name = String(client || "").trim();
    if (!name) return;
    if (!unbilled[name]) unbilled[name] = { totalHours: 0, totalAmount: 0 };
    unbilled[name].totalHours = roundMoney_(unbilled[name].totalHours + (Number(hours) || 0));
    unbilled[name].totalAmount = roundMoney_(unbilled[name].totalAmount + (Number(amount) || 0));
  }
  shifts.forEach(function (shift) {
    const code = shift.code || canonicalInvoiceCode_(shift.intId, timeCodeByInt);
    if (!code) {
      addUnbilled_(shift.client, shift.hours, shift.charge);
      return;
    }
    const group = groups[code];
    const status = group && group.list ? group.list.status : "Draft";
    if (!String(shift.intId || "").trim() || isDraftStatus_(status)) {
      addUnbilled_(shift.client, shift.hours, shift.charge);
    }
  });

  const clientList = clientRows.map(function (row) { return { name: row.name }; });

  return {
    success: true,
    asOf: today,
    timezone: timezone,
    open: open,
    periods: periods,
    invoices: invoices,
    clients: clientList,
    clientRecords: clientRows,
    unbilled: unbilled,
    businessName: businessProfile_(ss).name,
    invoicePdf: invoicePdfEngine_(),
    emailCc: true
  };
}

function linesFromGroup_(shiftRows, timezone) {
  const rows = (shiftRows || []).slice();
  rows.sort(function (a, b) {
    const dateCmp = String(a.date).localeCompare(String(b.date));
    if (dateCmp) return dateCmp;
    return clockLabel_(a.start, timezone).localeCompare(clockLabel_(b.start, timezone));
  });
  return rows.map(function (shift) {
    return {
      date: shift.date,
      details: shift.details,
      start: clockLabel_(shift.start, timezone),
      finish: clockLabel_(shift.finish, timezone),
      hours: roundMoney_(shift.hours),
      rate: roundMoney_(shift.rate),
      amount: roundMoney_(shift.charge)
    };
  });
}

function readInvoiceLines_(ss, invoice) {
  const timezone = (ss.getSpreadsheetTimeZone && ss.getSpreadsheetTimeZone()) || "UTC";
  const shifts = readTimeRows_(ss, timezone).filter(function (shift) {
    return shift.code === invoice.code || shift.code === invoice.id || shift.intId === invoice.id || shift.intId === invoice.code;
  });
  shifts.sort(function (a, b) {
    const dateCmp = String(a.date).localeCompare(String(b.date));
    if (dateCmp) return dateCmp;
    return clockLabel_(a.start, timezone).localeCompare(clockLabel_(b.start, timezone));
  });
  return shifts.map(function (shift) {
    return {
      date: shift.date,
      details: shift.details,
      start: clockLabel_(shift.start, timezone),
      finish: clockLabel_(shift.finish, timezone),
      hours: roundMoney_(shift.hours),
      rate: roundMoney_(shift.rate),
      amount: roundMoney_(shift.charge)
    };
  });
}

/**
 * Run once from the Apps Script editor on the EverydayWork spreadsheet.
 * Click Run, choose Allow, then open Deploy, Manage deployments, edit the
 * web app, set Version to New version, and Deploy. Keep that web app URL.
 */
function authorizeEverydayWork() {
  const ss = workbook_();
  const fileName = DriveApp.getFileById(ss.getId()).getName();
  const remaining = MailApp.getRemainingDailyQuota();
  const sheet = ss.getSheetByName("INV-Template");
  if (sheet && sheet.setHiddenGridlines) sheet.setHiddenGridlines(true);
  UrlFetchApp.fetch(templatePdfUrl_(ss, sheet), {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  console.log("EverydayWork can save invoices for " + fileName + ". Mail remaining today: " + remaining + ". Invoice email is sent through Gmail. The invoice PDF is printed with the grid left off" + (sheet ? "" : ", and this workbook has no invoice to print") + ".");
}

/**
 * Write the selected invoice into INV-Template!B1, then print that sheet.
 * Row 1 is the on-sheet dropdown, so the PDF starts at row 2. The file is
 * the INV-Template page with the sheet grid left off, including the logo and bank block.
 */
function exportInvoicePdf(payload) {
  const ss = workbook_();
  const invoiceId = String((payload && payload.invoiceId) || "").trim();
  const mode = String((payload && payload.mode) || "download").toLowerCase();
  if (!invoiceId) return { success: false, error: "Choose an invoice." };
  if (mode !== "drive" && mode !== "download" && mode !== "email") {
    return { success: false, error: "Choose save, download, or email." };
  }

  const code = invoicePrintCode_(ss, invoiceId);
  const email = String((payload && payload.email) || "").trim();
  let cc = "";
  if (mode === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Enter an email address to send the PDF." };
  }
  if (mode === "email") {
    const parsed = invoiceCopyList_(payload && payload.cc, [email]);
    if (!parsed.ok) return { success: false, error: parsed.error };
    cc = parsed.list.join(", ");
  }

  const sheet = ss.getSheetByName("INV-Template");
  if (!sheet) return { success: false, error: "There is no invoice to print." };

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) {
    return { success: false, error: "The invoice template is busy. Try again in a moment." };
  }

  const previous = sheet.getRange("B1").getValue();
  try {
    widenInvoiceTotals_(sheet);
    sheet.getRange("B1").setValue(code);
    SpreadsheetApp.flush();
    Utilities.sleep(2000);

    const timezone = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
    const today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
    const fileName = invoicePdfName_(code, today);
    const blob = renderInvoicePdf_(ss, sheet).setName(fileName);
    let prepared = invoiceEmailText_(ss, invoiceId, payload && payload.message);
    let payUrl = "";
    let payLinkNote = "";
    if (mode === "email") {
      payUrl = acceptedPayUrl_(payload && payload.payUrl);
      if (payUrl) {
        prepared = { text: appendInvoicePayLink_(prepared.text, payUrl), contact: prepared.contact };
      } else if (payload && payload.skipPayLink) {
        if (payload.payLinkFailed) payLinkNote = " The pay link was not added.";
      } else {
        const linked = createInvoicePaymentLink_(ss, invoiceId);
        payUrl = linked.url || "";
        if (payUrl) prepared = { text: appendInvoicePayLink_(prepared.text, payUrl), contact: prepared.contact };
        else if (linked.error) payLinkNote = " The pay link was not added.";
      }
    }

    let copyTo = "";
    if (mode === "email") {
      copyTo = recordsEmail_(ss, email);
      if (copyTo) {
        cc = cc.split(", ").filter(function (item) {
          return item.toLowerCase() !== copyTo.toLowerCase();
        }).join(", ");
      }
      sendInvoiceEmail_(ss, email, code, blob, copyTo, prepared.text, prepared.contact, cc);
    }

    let stored = fileName;
    let url = "";
    if (mode === "drive") {
      const folder = invoicesFolder_(ss);
      stored = uniqueFileName_(folder, fileName);
      blob.setName(stored);
      const file = folder.createFile(blob);
      url = file.getUrl();
    }

    let marked = { changed: false, status: "" };
    if (mode === "email") {
      const invoiceSheet = ss.getSheetByName("InvoiceList");
      if (invoiceSheet) {
        let row = findInvoiceListRow_(invoiceSheet, invoiceId);
        if (!row && code && code !== String(invoiceId)) row = findInvoiceListRow_(invoiceSheet, code);
        if (row) marked.status = displayStatus_(invoiceSheet.getRange(row, 9).getValue());
      }
    } else {
      marked = markDraftInvoiced_(ss, invoiceId);
    }
    const issued = marked.changed ? " Invoice marked invoiced." : "";

    if (mode === "download") {
      return {
        success: true,
        mode: mode,
        fileName: fileName,
        pdfBase64: Utilities.base64Encode(blob.getBytes()),
        markedInvoiced: marked.changed,
        status: marked.status,
        message: fileName + " is the invoice PDF, ready to download." + issued
      };
    }

    if (mode === "email") {
      let message = "Emailed " + fileName + " to " + email + ".";
      if (cc) message += " Cc " + cc + ".";
      if (copyTo) message += " A copy went to " + copyTo + " for your records.";
      if (payUrl) message += " Pay online: " + payUrl;
      if (payLinkNote) message += payLinkNote;
      return {
        success: true,
        mode: mode,
        fileName: fileName,
        markedInvoiced: false,
        status: marked.status,
        message: message
      };
    }

    return {
      success: true,
      mode: mode,
      fileName: stored,
      url: url,
      markedInvoiced: marked.changed,
      status: marked.status,
      message: "Saved " + stored + " to the Invoices folder on Google Drive." + issued
    };
  } catch (err) {
    return { success: false, error: invoicePdfError_(err, mode) };
  } finally {
    sheet.getRange("B1").setValue(previous);
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function recordsEmail_(ss, clientEmail) {
  let found = "";
  try {
    found = String(Session.getEffectiveUser().getEmail() || "").trim();
  } catch (err) {
    found = "";
  }
  if (!found) found = businessProfile_(ss).email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(found)) return "";
  if (found.toLowerCase() === String(clientEmail || "").trim().toLowerCase()) return "";
  return found;
}

function fetchSettings() {
  const ss = workbook_();
  const read = readConfigSheet_(ss);
  if (!read.success) return read;
  read.logo = readInvoiceLogo_(ss.getSheetByName("INV-Template"), ss);
  return read;
}

function readConfigSheet_(ss) {
  const config = ss.getSheetByName("Config");
  if (!config) return { success: false, error: "Settings are missing." };
  const last = Math.max(config.getLastRow(), 1);
  const rows = config.getRange(1, 1, last, 2).getValues();
  const settings = [];
  const breaks = [];
  let mode = "settings";
  for (let i = 0; i < rows.length; i++) {
    const label = clientText_(rows[i][0]);
    if (!label) {
      if (mode === "breaks" && breaks.length) break;
      continue;
    }
    if (/^settings$/i.test(label)) continue;
    if (/^breaks$/i.test(label)) {
      mode = "breaks";
      continue;
    }
    if (/^(invoice status|draft|invoiced|paid|written off)$/i.test(label)) break;
    let shown = configText_(rows[i][1], mode === "breaks");
    if (mode !== "breaks" && /financial year/i.test(label)) {
      const parts = parseFinancialYearEnd_(rows[i][1], (ss.getSpreadsheetTimeZone && ss.getSpreadsheetTimeZone()) || "UTC");
      shown = parts ? financialYearEndText_(rows[i][1], parts) : clientText_(rows[i][1]);
    }
    const item = { row: i + 1, label: label, value: shown };
    if (mode === "breaks") breaks.push(item);
    else settings.push(item);
  }
  return { success: true, settings: settings, breaks: breaks, logo: "" };
}

function configText_(value, asTime) {
  if (value == null || value === "") return "";
  if (isDateValue_(value)) {
    return Utilities.formatDate(value, (Session.getScriptTimeZone && Session.getScriptTimeZone()) || "UTC", "HH:mm");
  }
  if (typeof value === "number" && isFinite(value)) {
    if (asTime || (value > 0 && value < 1)) {
      const total = Math.round(value * 1440);
      const hours = Math.floor(total / 60);
      const minutes = total % 60;
      return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
    }
    return String(value);
  }
  return String(value).trim();
}

function configFormulaLocked_(cell) {
  const formula = cell.getFormula ? String(cell.getFormula() || "") : "";
  if (!formula) return false;
  return !/^=TIME\(\d+,\d+,\d+\)$/i.test(formula);
}

function checkedConfigValue_(label, raw, isBreak) {
  const text = String(raw == null ? "" : raw).trim();
  if (/hourly rate/i.test(label)) {
    if (!text) return { ok: true, write: function (cell) { cell.setValue(""); } };
    const n = Number(String(text).replace(/[^0-9.-]/g, ""));
    if (!isFinite(n) || n < 0) return { ok: false, error: "Default hourly rate must be a number." };
    return { ok: true, write: function (cell) { cell.setValue(n); } };
  }
  if (/email/i.test(label) && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return { ok: false, error: "Business email needs to look like an email address." };
  }
  if (/financial year/i.test(label)) {
    if (text && !parseFinancialYearEnd_(text)) {
      return { ok: false, error: "Financial year end needs a day and month, for example 31 October." };
    }
    return { ok: true, write: function (cell) { cell.setValue(text); } };
  }
  if (isBreak) {
    if (!clockParts_(text)) return { ok: false, error: "Enter " + label + " as hours and minutes, for example 00:30." };
    return { ok: true, write: function (cell) { writeClockTime_(cell, text); } };
  }
  if (/phone|iban/i.test(label)) {
    return { ok: true, write: function (cell) { cell.setNumberFormat("@"); cell.setValue(text); } };
  }
  return { ok: true, write: function (cell) { cell.setValue(text); } };
}

function saveSettings_(payload) {
  const ss = workbook_();
  const config = ss.getSheetByName("Config");
  if (!config) return { success: false, error: "Settings are missing." };
  const source = payload || {};
  const settings = Array.isArray(source.settings) ? source.settings : [];
  const breaks = Array.isArray(source.breaks) ? source.breaks : [];
  const breakRows = {};
  breaks.forEach(function (item) { breakRows[Number(item && item.row)] = true; });
  let logoBlob = null;
  if (source.logo) {
    try {
      logoBlob = logoBlob_(source.logo);
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }
  const plan = [];
  const items = settings.concat(breaks);
  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    const row = Number(item.row);
    const label = clientText_(item.label);
    if (!row || !label) continue;
    const current = clientText_(config.getRange(row, 1).getValue());
    if (current.toLowerCase() !== label.toLowerCase()) {
      return { success: false, error: label + " is no longer on that row. Use Refresh and try again." };
    }
    const cell = config.getRange(row, 2);
    if (configFormulaLocked_(cell)) {
      return { success: false, error: label + " is a formula, so it was left as it is." };
    }
    const checked = checkedConfigValue_(label, item.value, !!breakRows[row]);
    if (!checked.ok) return { success: false, error: checked.error };
    plan.push({ cell: cell, write: checked.write });
  }
  plan.forEach(function (step) { step.write(step.cell); });
  let logoNote = "";
  if (logoBlob) {
    const template = ss.getSheetByName("INV-Template");
    if (!template) return { success: false, error: "Saved settings. There is no invoice for the logo." };
    try {
      placeInvoiceLogo_(template, logoBlob);
      logoNote = " The logo is on the invoice.";
    } catch (err) {
      return { success: false, error: "Saved settings. " + (err.message || err) };
    }
  }
  const read = readConfigSheet_(ss);
  const name = clientText_(config.getRange("B5").getValue());
  read.logo = readInvoiceLogo_(ss.getSheetByName("INV-Template"), ss);
  read.message = "Saved settings" + (name ? " for " + name : "") + "." + logoNote;
  read.success = true;
  return read;
}

function logoBlob_(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error("Choose a PNG or JPEG logo.");
  const mime = match[1] === "png" ? "image/png" : "image/jpeg";
  const bytes = Utilities.base64Decode(match[2].replace(/\s/g, ""));
  if (!bytes || !bytes.length) throw new Error("That logo file was empty.");
  if (bytes.length > 1500000) throw new Error("Choose a logo smaller than 1.5 MB.");
  const ext = mime === "image/png" ? "png" : "jpg";
  return Utilities.newBlob(bytes, mime, "everydaywork-logo." + ext);
}

function readInvoiceLogo_(sheet, ss) {
  const fromImages = logoFromImages_(sheet);
  if (fromImages) return fromImages;
  return logoFromWorkbookFile_(ss || (sheet && typeof sheet.getParent === "function" ? sheet.getParent() : null));
}

function logoFromImages_(sheet) {
  if (!sheet || typeof sheet.getImages !== "function") return "";
  let images;
  try {
    images = sheet.getImages() || [];
  } catch (err) {
    return "";
  }
  for (let i = 0; i < images.length; i++) {
    if (typeof images[i].getBlob !== "function") continue;
    const url = blobToDataUrl_(images[i].getBlob());
    if (url) return url;
  }
  return "";
}

function blobToDataUrl_(blob) {
  if (!blob || typeof blob.getBytes !== "function") return "";
  try {
    const bytes = blob.getBytes();
    if (!bytes || !bytes.length || bytes.length > 1500000) return "";
    let type = (blob.getContentType && blob.getContentType()) || "";
    const name = String((blob.getName && blob.getName()) || "");
    if (!/^image\//.test(type)) {
      if (/\.png$/i.test(name)) type = "image/png";
      else if (/\.jpe?g$/i.test(name)) type = "image/jpeg";
      else type = "image/png";
    }
    return "data:" + type + ";base64," + Utilities.base64Encode(bytes);
  } catch (err) {
    return "";
  }
}

function logoFromWorkbookFile_(ss) {
  if (!ss || typeof ss.getId !== "function") return "";
  if (typeof DriveApp === "undefined" || typeof DriveApp.getFileById !== "function") return "";
  if (typeof Utilities.unzip !== "function") return "";
  try {
    const file = DriveApp.getFileById(ss.getId());
    if (!file || typeof file.getBlob !== "function") return "";
    const parts = Utilities.unzip(file.getBlob());
    const files = {};
    for (let i = 0; i < parts.length; i++) {
      const name = String(parts[i].getName() || "").replace(/^\/+/, "");
      files[name] = parts[i];
    }
    return logoDataUrlFromFiles_(files);
  } catch (err) {
    return "";
  }
}

function logoDataUrlFromFiles_(files) {
  const workbookXml = zipText_(files["xl/workbook.xml"]);
  const workbookRels = zipText_(files["xl/_rels/workbook.xml.rels"]);
  const sheetTag = workbookXml.match(/<sheet\b[^>]*name="INV-Template"[^>]*\/?>/i);
  if (!sheetTag) return "";
  const rid = (sheetTag[0].match(/\br:id="([^"]+)"/) || [])[1];
  if (!rid) return "";
  const sheetRel = workbookRels.match(new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"'));
  if (!sheetRel) return "";
  let sheetPath = sheetRel[1].replace(/^\/+/, "");
  if (sheetPath.indexOf("xl/") !== 0) sheetPath = "xl/" + sheetPath.replace(/^\.\.\//, "");
  const sheetName = sheetPath.split("/").pop();
  const sheetRels = zipText_(files[sheetPath.replace(/[^/]+$/, "_rels/" + sheetName + ".rels")]);
  const drawing = sheetRels.match(/relationships\/drawing"[^>]*Target="([^"]+)"/);
  if (!drawing) return "";
  const drawingPath = resolveZipPath_(sheetPath, drawing[1]);
  const drawingName = drawingPath.split("/").pop();
  const drawingRels = zipText_(files[drawingPath.replace(/[^/]+$/, "_rels/" + drawingName + ".rels")]);
  const image = drawingRels.match(/relationships\/image"[^>]*Target="([^"]+)"/);
  if (!image) return "";
  return blobToDataUrl_(files[resolveZipPath_(drawingPath, image[1])]);
}

function zipText_(blob) {
  if (!blob || typeof blob.getDataAsString !== "function") return "";
  try { return String(blob.getDataAsString() || ""); } catch (err) { return ""; }
}

function resolveZipPath_(fromFile, target) {
  const raw = String(target || "").replace(/^\/+/, "");
  if (raw.indexOf("xl/") === 0) return raw;
  const dir = String(fromFile || "").split("/").slice(0, -1);
  raw.split("/").forEach(function (part) {
    if (part === "..") dir.pop();
    else if (part && part !== ".") dir.push(part);
  });
  return dir.join("/");
}

function placeInvoiceLogo_(sheet, blob) {
  let column = 1;
  let row = 3;
  let width = 160;
  let height = 70;
  if (typeof sheet.getImages === "function") {
    const images = sheet.getImages() || [];
    if (images.length) {
      const current = images[0];
      if (typeof current.getAnchorCell === "function") {
        const anchor = current.getAnchorCell();
        if (anchor && anchor.getColumn && anchor.getRow) {
          column = anchor.getColumn() || column;
          row = anchor.getRow() || row;
        }
      }
      if (typeof current.getWidth === "function" && current.getWidth()) width = current.getWidth();
      if (typeof current.getHeight === "function" && current.getHeight()) height = current.getHeight();
      if (typeof current.remove === "function") current.remove();
    }
  }
  if (typeof sheet.insertImage !== "function") {
    throw new Error("This spreadsheet cannot place a logo on the invoice.");
  }
  const image = sheet.insertImage(blob, column, row);
  if (image && typeof image.setWidth === "function") image.setWidth(width);
  if (image && typeof image.setHeight === "function") image.setHeight(height);
  return image;
}

function businessProfile_(ss) {
  const profile = { name: "", email: "" };
  const config = ss.getSheetByName("Config");
  if (!config) return profile;
  profile.name = clientText_(config.getRange("B5").getValue());
  const rows = config.getRange("A1:B60").getDisplayValues();
  for (let i = 0; i < rows.length; i++) {
    const key = String(rows[i][0] || "");
    const value = String(rows[i][1] || "").trim();
    if (/business email/i.test(key) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) profile.email = value;
  }
  return profile;
}

/**
 * Send through Gmail so the message is signed for the account that runs
 * EverydayWork. MailApp leaves the sender unverified, and Gmail files that as spam.
 */
function invoiceCopyList_(raw, skip) {
  const text = String(raw || "").trim();
  if (!text) return { ok: true, list: [] };
  const parts = text.split(/[;,]/).map(function (part) { return String(part || "").trim(); }).filter(Boolean);
  const skipSet = {};
  (skip || []).forEach(function (item) {
    const key = String(item || "").trim().toLowerCase();
    if (key) skipSet[key] = true;
  });
  const list = [];
  const seen = {};
  for (let i = 0; i < parts.length; i++) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parts[i])) {
      return { ok: false, error: "Enter a valid Cc address, or leave it blank." };
    }
    const key = parts[i].toLowerCase();
    if (skipSet[key] || seen[key]) continue;
    seen[key] = true;
    list.push(parts[i]);
  }
  return { ok: true, list: list };
}

// Stripe only collects the payment. EverydayWork keeps the job and the invoice status.
// The secret key stays in Script Properties. A test key (sk_test_) is the one this build calls.
var STRIPE_SECRET_KEY_ = "STRIPE_SECRET_KEY";
var STRIPE_WEBHOOK_TOKEN_ = "STRIPE_WEBHOOK_TOKEN";

function stripeSecret_() {
  var key = scriptProperty_(STRIPE_SECRET_KEY_);
  if (key.indexOf("sk_test_") !== 0) return "";
  return key;
}

function euroCents_(value) {
  var n = Number(value);
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100);
}

function stripeForm_(pairs) {
  return pairs.map(function (pair) {
    return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]);
  }).join("&");
}

function stripeRequest_(method, path, pairs) {
  var key = stripeSecret_();
  if (!key) return { ok: false, error: "Stripe test mode is not set." };
  var options = {
    method: method,
    headers: { Authorization: "Bearer " + key },
    muteHttpExceptions: true
  };
  if (pairs) {
    options.contentType = "application/x-www-form-urlencoded";
    options.payload = stripeForm_(pairs);
  }
  var response = UrlFetchApp.fetch("https://api.stripe.com" + path, options);
  var code = response.getResponseCode();
  var body = {};
  try { body = JSON.parse(response.getContentText() || "{}"); } catch (err) { body = {}; }
  if (code < 200 || code >= 300) {
    var message = body && body.error && body.error.message ? String(body.error.message) : "Stripe did not create the pay link.";
    if (message.indexOf("sk_") !== -1) message = "Stripe did not create the pay link.";
    return { ok: false, error: message };
  }
  return { ok: true, body: body };
}

function invoicePayAmount_(ss, invoiceId) {
  var invoiceSheet = ss.getSheetByName("InvoiceList");
  var code = invoicePrintCode_(ss, invoiceId);
  var row = invoiceSheet ? findInvoiceListRow_(invoiceSheet, invoiceId) : 0;
  if (!row && invoiceSheet && code && code !== String(invoiceId)) row = findInvoiceListRow_(invoiceSheet, code);
  if (!row) return { cents: 0, code: code, clientName: "" };
  var values = invoiceSheet.getRange(row, 1, 1, 9).getValues()[0];
  return {
    cents: euroCents_(values[6]),
    code: code,
    clientName: clientText_(values[1])
  };
}

function acceptedPayUrl_(value) {
  var link = String(value || "").trim();
  if (link.indexOf("https://buy.stripe.com/") === 0 || link.indexOf("https://book.stripe.com/") === 0) return link;
  return "";
}

function createPaymentLink(payload) {
  var invoiceId = String((payload && payload.invoiceId) || "").trim();
  if (!invoiceId) return { success: false, error: "Choose an invoice." };
  var linked = createInvoicePaymentLink_(workbook_(), invoiceId);
  if (linked.error) return { success: false, error: linked.error, payUrl: "" };
  return { success: true, payUrl: linked.url || "" };
}

function createInvoicePaymentLink_(ss, invoiceId) {
  if (!stripeSecret_()) return { url: "" };
  var amount = invoicePayAmount_(ss, invoiceId);
  if (amount.cents < 50) return { url: "" };
  var name = ("Invoice " + (amount.code || invoiceId)).slice(0, 200);
  var clientName = String(amount.clientName || "").slice(0, 500);
  var created = stripeRequest_("post", "/v1/payment_links", [
    ["line_items[0][price_data][currency]", "eur"],
    ["line_items[0][price_data][unit_amount]", String(amount.cents)],
    ["line_items[0][price_data][product_data][name]", name],
    ["line_items[0][quantity]", "1"],
    ["metadata[invoiceId]", String(invoiceId || "")],
    ["metadata[clientName]", clientName],
    ["metadata[sheetId]", String(ss.getId() || "")],
    ["restrictions[completed_sessions][limit]", "1"],
    ["invoice_creation[enabled]", "false"],
    ["automatic_tax[enabled]", "false"],
    ["after_completion[type]", "hosted_confirmation"],
    ["after_completion[hosted_confirmation][custom_message]", "Thank you. Everyday Business will record this payment."]
  ]);
  if (!created.ok) return { url: "", error: created.error };
  var url = created.body && created.body.url ? String(created.body.url) : "";
  if (url.indexOf("https://buy.stripe.com/") !== 0 && url.indexOf("https://book.stripe.com/") !== 0) {
    return { url: "", error: "Stripe did not return a pay link." };
  }
  return { url: url };
}

function appendInvoicePayLink_(text, url) {
  var link = String(url || "").trim();
  if (!link) return String(text || "");
  var letter = String(text || "");
  if (letter.indexOf(link) !== -1) return letter;
  var block = "Pay this invoice online:\n" + link + "\nBank transfer details are on the invoice.";
  if (letter.indexOf("\nKind Regards\n") !== -1) {
    return letter.replace("\nKind Regards\n", "\n" + block + "\n\nKind Regards\n");
  }
  return letter.replace(/\s+$/, "") + "\n\n" + block + "\n";
}

function handleStripeWebhook_(e) {
  var expected = scriptProperty_(STRIPE_WEBHOOK_TOKEN_);
  var given = String((e && e.parameter && e.parameter.stripeWebhook) || "").trim();
  if (!expected || !tokenMatches_(given, expected)) {
    return { success: false, status: 403, error: "Stripe webhook was not accepted." };
  }
  var payload = {};
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return { success: false, error: "Stripe webhook was not readable." };
  }
  var type = String(payload.type || "");
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return { success: true, ignored: true };
  }
  var sessionId = payload.data && payload.data.object && payload.data.object.id;
  if (!sessionId) return { success: false, error: "Stripe webhook had no checkout session." };
  var session = stripeRequest_("get", "/v1/checkout/sessions/" + encodeURIComponent(sessionId));
  if (!session.ok) return { success: false, error: "Stripe did not confirm the payment." };
  var paid = session.body || {};
  if (String(paid.payment_status || "") !== "paid") {
    return { success: true, ignored: true, paymentStatus: paid.payment_status || "" };
  }
  var meta = paid.metadata || {};
  var ss = workbook_();
  if (String(meta.sheetId || "") !== String(ss.getId() || "")) {
    return { success: false, error: "Payment was for a different workbook." };
  }
  var marked = markInvoicePaidFromPayment_(ss, meta.invoiceId);
  return marked;
}

function markInvoicePaidFromPayment_(ss, invoiceId) {
  var invoiceSheet = ss.getSheetByName("InvoiceList");
  if (!invoiceSheet) return { success: false, error: "Missing InvoiceList tab." };
  var code = invoicePrintCode_(ss, invoiceId);
  var row = findInvoiceListRow_(invoiceSheet, invoiceId);
  if (!row && code && code !== String(invoiceId)) row = findInvoiceListRow_(invoiceSheet, code);
  if (!row) return { success: false, error: "That invoice is not on InvoiceList." };
  var current = displayStatus_(invoiceSheet.getRange(row, 9).getValue());
  if (current === "Paid") return { success: true, status: "Paid", already: true, invoiceId: String(invoiceId || ""), invoiceCode: code };
  if (current === "Draft") {
    invoiceSheet.getRange(row, 9).setValue("Invoiced");
    if (!invoiceSheet.getRange(row, 8).getValue()) invoiceSheet.getRange(row, 8).setValue(new Date());
    lockBilledTimeRates_(ss, { invoiceIds: [invoiceId, code] });
  }
  invoiceSheet.getRange(row, 9).setValue("Paid");
  lockBilledTimeRates_(ss, { invoiceIds: [invoiceId, code] });
  return { success: true, status: "Paid", invoiceId: String(invoiceId || ""), invoiceCode: code, message: "Invoice " + code + " marked Paid." };
}

function sendInvoiceEmail_(ss, email, code, blob, copyTo, plain, contact, cc) {
  const profile = businessProfile_(ss);
  const sender = clientText_(profile.name) || "EverydayWork";
  const text = String(plain || "").trim() || invoiceEmailDraft_({ tradename: sender });
  const html = invoiceEmailHtml_(text);
  const options = {
    attachments: [blob],
    name: sender,
    htmlBody: html
  };
  if (copyTo) options.bcc = copyTo;
  if (cc) options.cc = cc;
  if (profile.email && profile.email.toLowerCase() !== String(email || "").toLowerCase()) options.replyTo = profile.email;
  GmailApp.sendEmail(invoiceRecipient_(email, contact), invoiceEmailSubject_(sender, code), text, options);
}

function invoiceRecipient_(email, contact) {
  const address = String(email || "").trim();
  const name = clientText_(contact).replace(/[\r\n<>"]/g, "").trim();
  if (!name) return address;
  return name + " <" + address + ">";
}

function invoiceEmailSubject_(name, code) {
  const business = clientText_(name);
  const invoice = clientText_(code);
  if (business && invoice) return business + " " + invoice;
  return business || invoice || "Invoice";
}

function invoiceEmailText_(ss, invoiceId, custom) {
  const parts = invoiceLetterParts_(ss, invoiceId);
  const written = String(custom || "").trim();
  return {
    text: written || invoiceEmailDraft_(parts),
    contact: parts.contact
  };
}

function invoiceEmailDraft_(parts) {
  const source = parts || {};
  const contact = clientText_(source.contact);
  const period = prettyPeriod_(source.period) || "this period";
  const amount = clientText_(source.amount) || "the amount on the invoice";
  const works = clientText_(source.works) || "the works listed";
  const name = clientText_(source.tradename) || "EverydayWork";
  return "To" + (contact ? " " + contact : "") + "\n"
    + "Please find attached invoice for " + period + "\n"
    + "Total owed " + amount + "\n"
    + "For works " + works + "\n"
    + "\n"
    + "Kind Regards\n"
    + name;
}

function invoiceEmailHtml_(plain) {
  return String(plain || "").split(/\n{2,}/).map(function (block) {
    const lines = block.split(/\n/).map(function (line) { return pdfEscapeHtml_(line); }).join("<br>");
    return "<p>" + lines + "</p>";
  }).join("");
}

function prettyPeriod_(value) {
  const raw = clientText_(value);
  if (!raw) return "";
  return raw.split(/\s+-\s+/).map(function (part) {
    const iso = isoDate_(part);
    if (!iso) return part;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const bits = iso.split("-");
    return Number(bits[2]) + " " + months[Number(bits[1]) - 1] + " " + bits[0];
  }).join(" – ");
}

function euroText_(value) {
  const n = Number(value);
  if (!isFinite(n)) return "";
  const sign = n < 0 ? "-" : "";
  const parts = Math.abs(n).toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return sign + "€" + parts[0] + "." + parts[1];
}

function invoiceLetterParts_(ss, invoiceId) {
  const profile = businessProfile_(ss);
  const parts = {
    contact: "",
    clientName: "",
    period: "",
    amount: "",
    works: "",
    tradename: profile.name || "EverydayWork"
  };
  const invoiceSheet = ss.getSheetByName("InvoiceList");
  const code = invoicePrintCode_(ss, invoiceId);
  let row = invoiceSheet ? findInvoiceListRow_(invoiceSheet, invoiceId) : 0;
  if (!row && invoiceSheet && code && code !== String(invoiceId)) row = findInvoiceListRow_(invoiceSheet, code);
  if (row) {
    const values = invoiceSheet.getRange(row, 1, 1, 9).getValues()[0];
    parts.clientName = clientText_(values[1]);
    parts.works = clientText_(values[2]);
    parts.period = clientText_(values[3]) || isoDate_(values[7]);
    if (values[6] !== "" && values[6] != null) parts.amount = euroText_(values[6]);
  }
  if (!parts.works) {
    const timeSheet = ss.getSheetByName("Time&Attendance");
    const last = timeSheet ? timeSheetLastRow_(timeSheet) : 0;
    if (timeSheet && last >= 2) {
      const data = timeSheet.getRange(2, 2, last - 1, 5).getValues();
      for (let i = 0; i < data.length; i++) {
        const rowCode = clientText_(data[i][0]);
        const intId = clientText_(data[i][1]);
        if (rowCode !== code && intId !== String(invoiceId) && rowCode !== String(invoiceId)) continue;
        const job = clientText_(data[i][4]);
        if (job) {
          parts.works = job;
          if (!parts.clientName) parts.clientName = clientText_(data[i][2]);
          if (!parts.period) parts.period = isoDate_(data[i][3]);
          break;
        }
      }
    }
  }
  parts.contact = contactForClient_(ss, parts.clientName);
  return parts;
}

function contactForClient_(ss, clientName) {
  const wanted = clientText_(clientName).toLowerCase();
  if (!wanted) return "";
  const clients = readClientRows_(ss);
  for (let i = 0; i < clients.length; i++) {
    if (clients[i].name.toLowerCase() === wanted) return clientText_(clients[i].contact);
  }
  return "";
}

function markDraftInvoiced_(ss, invoiceId) {
  const invoiceSheet = ss.getSheetByName("InvoiceList");
  if (!invoiceSheet) return { changed: false, status: "" };
  const code = invoicePrintCode_(ss, invoiceId);
  let row = findInvoiceListRow_(invoiceSheet, invoiceId);
  if (!row && code && code !== String(invoiceId)) row = findInvoiceListRow_(invoiceSheet, code);
  if (!row) return { changed: false, status: "" };
  const status = displayStatus_(invoiceSheet.getRange(row, 9).getValue());
  if (status !== "Draft") return { changed: false, status: status };
  invoiceSheet.getRange(row, 9).setValue("Invoiced");
  if (!invoiceSheet.getRange(row, 8).getValue()) invoiceSheet.getRange(row, 8).setValue(new Date());
  lockBilledTimeRates_(ss, { invoiceIds: [invoiceId, code] });
  return { changed: true, status: "Invoiced" };
}

function pdfEscapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function widenInvoiceTotals_(sheet) {
  const hoursFormula = String(sheet.getRange("E32").getFormula() || "");
  if (/E20:E24/i.test(hoursFormula)) sheet.getRange("E32").setFormula("=SUM(E20:E31)");
  const amountFormula = String(sheet.getRange("G32").getFormula() || "");
  if (/G20:G24/i.test(amountFormula)) sheet.getRange("G32").setFormula("=SUM(G20:G31)");
}

function invoicePdfError_(err, mode) {
  const text = String(err && err.message ? err.message : err);
  const denied = /permission|authorization/i.test(text);
  if (denied && mode === "email") {
    return "Could not create the invoice PDF. " + text
      + " In the Apps Script editor, select authorizeEverydayWork, click Run, and choose Allow email sending. Then open Deploy, Manage deployments, edit the web app, set Version to New version, and Deploy. Invoice email is sent through Gmail so your address can be verified.";
  }
  if (denied) {
    return "Could not create the invoice PDF. " + text + " " + templatePdfAuthHint_();
  }
  return "Could not create the invoice PDF. " + text;
}

function templatePdfAuthHint_() {
  return "Open the EverydayWork spreadsheet, choose Extensions, then Apps Script, and replace Code.gs. Select authorizeEverydayWork, click Run, and choose Allow. Then open Deploy, Manage deployments, edit the web app, set Version to New version, and Deploy. A New deployment uses a different URL, so this app would keep serving the previous PDF.";
}

/**
 * Print INV-Template with the sheet grid left off. The export asks for
 * gridlines=false. If that connection is not allowed yet, the spreadsheet
 * PDF is used after the grid is hidden on INV-Template.
 */
function renderInvoicePdf_(ss, sheet) {
  if (sheet.getName && sheet.getName() !== "INV-Template") {
    throw new Error("The invoice PDF was taken from " + sheet.getName() + " instead of the invoice.");
  }
  if (sheet.setHiddenGridlines) sheet.setHiddenGridlines(true);
  try {
    return fetchTemplatePdf_(ss, sheet);
  } catch (err) {
    const text = String(err && err.message ? err.message : err);
    if (!/permission|authorization|external_request|UrlFetchApp/i.test(text)) throw err;
    return renderInvoicePdfFromBlob_(ss, sheet);
  }
}

function fetchTemplatePdf_(ss, sheet) {
  SpreadsheetApp.flush();
  const response = UrlFetchApp.fetch(templatePdfUrl_(ss, sheet), {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const blob = response.getBlob();
  const bytes = blob && blob.getBytes ? blob.getBytes() : [];
  const header = [];
  for (let i = 0; i < bytes.length && i < 5; i++) header.push(String.fromCharCode(bytes[i] & 255));
  const pdf = header.join("").indexOf("%PDF") === 0;
  if (code === 401 || code === 403 || !pdf) {
    throw new Error("You do not have permission to call UrlFetchApp.fetch. The invoice could not be printed without the sheet grid (" + code + ").");
  }
  return blob;
}

function templatePdfUrl_(ss, sheet) {
  const params = [
    "format=pdf",
    "gridlines=false",
    "portrait=true",
    "size=letter",
    "scale=2",
    "fitw=true",
    "sheetnames=false",
    "title=false",
    "fzr=false",
    "fzc=false",
    "top_margin=0.75",
    "bottom_margin=0.75",
    "left_margin=0.7",
    "right_margin=0.7"
  ];
  if (sheet && sheet.getSheetId) {
    params.push("gid=" + sheet.getSheetId());
    params.push("r1=1");
    params.push("c1=0");
    params.push("r2=36");
    params.push("c2=7");
  }
  return "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?" + params.join("&");
}

/**
 * Print INV-Template from the spreadsheet file. getBlob() follows the first
 * visible sheet, so other tabs are hidden, the template moves to the first
 * tab, and row 1 (the dropdown) is hidden. Rows 2–36 and columns A–G stay
 * visible. Those tabs are put back after the bytes are read. The grid on
 * INV-Template stays hidden.
 */
function renderInvoicePdfFromBlob_(ss, sheet) {
  const state = {
    showedTemplate: false,
    hiddenSheets: [],
    picker: [],
    tail: [],
    columns: [],
    originalIndex: sheet.getIndex ? sheet.getIndex() : 1,
    previousSheet: ss.getActiveSheet ? ss.getActiveSheet() : null
  };
  try {
    if (sheet.isSheetHidden && sheet.isSheetHidden()) {
      sheet.showSheet();
      state.showedTemplate = true;
    }
    const all = ss.getSheets();
    for (let i = 0; i < all.length; i++) {
      const other = all[i];
      if (other.getSheetId() === sheet.getSheetId()) continue;
      if (other.isSheetHidden && other.isSheetHidden()) continue;
      other.hideSheet();
      state.hiddenSheets.push(other);
    }
    state.picker = concealForPdf_(sheet, 1, 1, "row");
    const maxRows = sheet.getMaxRows ? sheet.getMaxRows() : 36;
    if (maxRows > 36) state.tail = concealForPdf_(sheet, 37, maxRows - 36, "row");
    const maxCols = sheet.getMaxColumns ? sheet.getMaxColumns() : 7;
    if (maxCols > 7) state.columns = concealForPdf_(sheet, 8, maxCols - 7, "column");
    if (sheet.activate) sheet.activate();
    if (ss.setActiveSheet) ss.setActiveSheet(sheet);
    if (state.originalIndex !== 1 && ss.moveActiveSheet) ss.moveActiveSheet(1);
    SpreadsheetApp.flush();
    Utilities.sleep(800);
    const raw = ss.getBlob();
    if (!raw || !raw.getBytes) throw new Error("The spreadsheet did not return a PDF.");
    const bytes = raw.getBytes();
    if (!bytes || !bytes.length) throw new Error("The spreadsheet did not return a PDF.");
    const header = [];
    for (let i = 0; i < bytes.length && i < 5; i++) header.push(String.fromCharCode(bytes[i] & 255));
    if (header.join("").indexOf("%PDF") !== 0) throw new Error("The spreadsheet did not return a PDF.");
    const first = ss.getSheets()[0];
    if (!first || first.getSheetId() !== sheet.getSheetId()) {
      throw new Error("The invoice PDF was not taken from the invoice.");
    }
    return Utilities.newBlob(bytes, "application/pdf");
  } finally {
    restoreInvoicePdfView_(ss, sheet, state);
  }
}

function concealForPdf_(sheet, start, count, axis) {
  if (count < 1) return { mode: "none" };
  // One sheet call. Walking each row asks the spreadsheet once per row, and a
  // thousand of those calls holds the invoice lock until the download times out.
  if (count > 8) {
    if (axis === "row") sheet.hideRows(start, count);
    else sheet.hideColumns(start, count);
    return { mode: "bulk", start: start, count: count };
  }
  return { mode: "spans", spans: hideVisibleSpan_(sheet, start, count, axis) };
}

function revealForPdf_(sheet, hidden, axis) {
  if (!hidden || hidden.mode === "none") return;
  if (Array.isArray(hidden)) {
    showSpan_(sheet, hidden, axis);
    return;
  }
  if (hidden.mode === "bulk") {
    if (axis === "row") sheet.showRows(hidden.start, hidden.count);
    else sheet.showColumns(hidden.start, hidden.count);
    return;
  }
  showSpan_(sheet, hidden.spans || [], axis);
}

function hideVisibleSpan_(sheet, start, count, axis) {
  const rowAxis = axis === "row";
  const alreadyHidden = rowAxis
    ? function (index) { return sheet.isRowHiddenByUser(index); }
    : function (index) { return sheet.isColumnHiddenByUser(index); };
  const hide = rowAxis
    ? function (index, n) { sheet.hideRows(index, n); }
    : function (index, n) { sheet.hideColumns(index, n); };
  const spans = [];
  let runStart = 0;
  for (let offset = 0; offset <= count; offset++) {
    const atEnd = offset === count;
    const skip = !atEnd && alreadyHidden(start + offset);
    if (!atEnd && !skip) {
      if (!runStart) runStart = start + offset;
    } else if (runStart) {
      const n = (start + offset) - runStart;
      hide(runStart, n);
      spans.push({ start: runStart, count: n });
      runStart = 0;
    }
  }
  return spans;
}

function showSpan_(sheet, spans, axis) {
  const show = axis === "row"
    ? function (index, n) { sheet.showRows(index, n); }
    : function (index, n) { sheet.showColumns(index, n); };
  for (let i = spans.length - 1; i >= 0; i--) show(spans[i].start, spans[i].count);
}

function restoreInvoicePdfView_(ss, sheet, state) {
  if (state.columns) revealForPdf_(sheet, state.columns, "column");
  if (state.tail) revealForPdf_(sheet, state.tail, "row");
  if (state.picker) revealForPdf_(sheet, state.picker, "row");
  const hiddenSheets = state.hiddenSheets || [];
  for (let i = 0; i < hiddenSheets.length; i++) hiddenSheets[i].showSheet();
  if (state.originalIndex && sheet.getIndex && sheet.getIndex() !== state.originalIndex && ss.moveActiveSheet) {
    if (sheet.activate) sheet.activate();
    if (ss.setActiveSheet) ss.setActiveSheet(sheet);
    ss.moveActiveSheet(state.originalIndex);
  }
  if (state.showedTemplate) sheet.hideSheet();
  const previous = state.previousSheet;
  if (previous && previous.getSheetId() !== sheet.getSheetId() && !previous.isSheetHidden()) {
    if (previous.activate) previous.activate();
    else if (ss.setActiveSheet) ss.setActiveSheet(previous);
  }
}

function invoicePdfName_(code, isoDate) {
  const safe = String(code || "invoice").replace(/[^\w.-]+/g, "_");
  return safe + "_" + isoDate + ".pdf";
}

function uniqueFileName_(folder, name) {
  if (!folder.getFilesByName(name).hasNext()) return name;
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HHmm");
  return name.replace(/\.pdf$/i, "_" + stamp + ".pdf");
}

function invoicesFolder_(ss) {
  const ssFile = DriveApp.getFileById(ss.getId());
  const parents = ssFile.getParents();
  while (parents.hasNext()) {
    const parent = parents.next();
    const named = parent.getFoldersByName("Invoices");
    if (named.hasNext()) return named.next();
  }
  const any = DriveApp.getFoldersByName("Invoices");
  if (any.hasNext()) return any.next();
  const again = ssFile.getParents();
  if (again.hasNext()) return again.next().createFolder("Invoices");
  return DriveApp.createFolder("Invoices");
}
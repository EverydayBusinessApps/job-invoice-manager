/**
 * Everyday Job & Invoice Manager (Engineering Trade Custom Build)
 * Production REST API Gateway
 * Copyright (c) 2026 EverydayBusinessApps. All Rights Reserved.
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    message: "Engineering API Operational. Awaiting data vectors." 
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
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
    } else if (action === "getDashboard") {
      responseData = fetchDashboard();
    } else if (action === "getInvoiceDetail") {
      responseData = fetchInvoiceDetail(requestData.payload);
    } else if (action === "compileInvoice") {
      responseData = compileSingleInvoice(requestData.payload);
    } else if (action === "exportInvoicePdf") {
      responseData = exportInvoicePdf(requestData.payload);
    } else {
      throw new Error("Invalid API action parameter mapping.");
    }

    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 1. Fetch Client Profiles and Invoice Headers for Web App Dropdowns
 */
function fetchInitialAppData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const clientSheet = ss.getSheetByName("ClientRecords");
  if (!clientSheet) return { success: false, error: "Missing ClientRecords tab." };

  const lastRow = clientSheet.getLastRow();
  let clients = [];
  if (lastRow >= 2) {
    const data = clientSheet.getRange(2, 1, lastRow - 1, 1).getValues(); // Only need column A (Name) since Rate is sheet-automated
    clients = data.map(row => ({ name: String(row[0]).trim() })).filter(c => c.name !== "");
  }

  return { success: true, clients: clients, invoices: fetchInvoiceRecords() };
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
 * InvoiceList column I (Invoice Status):
 * Draft when the first time entry opens the invoice, Invoiced when
 * Compile Account Statement & Invoice runs, then Paid, Unpaid, or Bad debt
 * from the billing desk. Time can only be added while the status is Draft.
 */
function displayStatus_(status) {
  const value = String(status || "").trim();
  if (!value) return "Draft";
  const key = value.toLowerCase();
  if (key === "draft") return "Draft";
  if (key === "invoiced") return "Invoiced";
  if (key === "paid") return "Paid";
  if (key === "unpaid") return "Unpaid";
  if (key === "bad debt") return "Bad debt";
  return value;
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    const lastRow = timeSheet.getLastRow();
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
 * Combine YYYY-MM-DD + HH:MM into a spreadsheet datetime.
 * addDays=1 is used when a shift finishes after midnight.
 */
function sheetDateTime(dateStr, timeStr, addDays) {
  const ds = String(dateStr || "").trim();
  const ts = String(timeStr || "").trim();
  if (!ds || !ts) return ts;
  const dp = ds.split("-");
  const tp = ts.split(":");
  if (dp.length < 3 || tp.length < 2) return ts;
  return new Date(
    Number(dp[0]),
    Number(dp[1]) - 1,
    Number(dp[2]) + (addDays ? 1 : 0),
    Number(tp[0]),
    Number(tp[1] || 0),
    0
  );
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeSheet = ss.getSheetByName("Time&Attendance");
  if (!timeSheet) return { success: false, error: "Missing Time&Attendance tab." };

  // To bypass ARRAYFORMULA collision bounds, find the true physical empty row index location
  const values = timeSheet.getRange("D1:D").getValues();
  let nextRow = 1;
  while (values[nextRow - 1] && values[nextRow - 1][0] !== "") {
    nextRow++;
  }

  const overnight = payload.overnight === true || isOvernightTime(payload.start, payload.finish);
  const invoiceSheet = ss.getSheetByName("InvoiceList");
  const mode = String(payload.invoiceMode || "new").toLowerCase();
  let invoiceId = "";

  if (mode === "existing") {
    invoiceId = String(payload.invoiceId || "").trim();
    if (!invoiceId) return { success: false, error: "Choose an existing invoice." };
    if (!invoiceSheet) return { success: false, error: "Missing InvoiceList tab." };
    const draftGuard = guardDraftInvoice_(invoiceSheet, invoiceId);
    if (!draftGuard.ok) return { success: false, error: draftGuard.error };
  } else {
    if (!invoiceSheet) return { success: false, error: "Missing InvoiceList tab." };
    invoiceId = createDraftInvoice_(invoiceSheet);
  }

  // Insert exactly into raw input cells matching your column layout coordinates
  timeSheet.getRange(nextRow, 3).setValue(Number(invoiceId) || invoiceId); // Col C: InvoiceInt
  timeSheet.getRange(nextRow, 4).setValue(payload.clientName); // Col D: ClientID
  timeSheet.getRange(nextRow, 5).setValue(payload.date);       // Col E: Date (shift start date)
  timeSheet.getRange(nextRow, 6).setValue(payload.jobDetails); // Col F: Job Details
  timeSheet.getRange(nextRow, 7).setValue(sheetDateTime(payload.date, payload.start, false)); // Col G: Start
  timeSheet.getRange(nextRow, 8).setValue(payload.lunch);      // Col H: Lunch (String matching lookup e.g. 'half hour')
  timeSheet.getRange(nextRow, 9).setValue(sheetDateTime(payload.date, payload.finish, overnight)); // Col I: Finish (next calendar day when overnight)
  timeSheet.getRange(nextRow, 13).setValue(new Date());        // Col M: Updated On Timestamp

  const message = mode === "existing"
    ? ("Shift added to invoice " + invoiceId + ".")
    : (overnight
      ? ("Overnight shift logged on new invoice " + invoiceId + ".")
      : ("Shift logged on new invoice " + invoiceId + "."));

  return {
    success: true,
    message: message,
    invoiceId: invoiceId,
    invoices: fetchInvoiceRecords()
  };
}

/**
 * 3. Calculate Open Accrued Items (Checks for blank cells in Column C: InvoiceInt)
 */
function fetchUnbilledSummary(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

  const lastRow = timeSheet.getLastRow();
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

/**
 * 4. Process Account Invoice (Pushes the next sequence number down to Column C: InvoiceInt)
 */
function processAccountInvoice(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const timeLastRow = timeSheet.getLastRow();
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

  const label = marked.length === 1 ? ("Invoice " + marked[0]) : ("Invoices " + marked.join(", "));
  return {
    success: true,
    invoiceId: marked[marked.length - 1],
    status: "Invoiced",
    message: label + " set to Invoiced.",
    invoices: fetchInvoiceRecords()
  };
}

/**
 * Billing desk: mark an invoice Paid, Unpaid, or Bad debt (InvoiceList column I).
 */
function updateInvoiceStatus(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invoiceSheet = ss.getSheetByName("InvoiceList");
  if (!invoiceSheet) return { success: false, error: "Missing InvoiceList tab." };

  const invoiceId = String((payload && payload.invoiceId) || "").trim();
  const status = String((payload && payload.status) || "").trim();
  const allowed = { "Paid": true, "Unpaid": true, "Bad debt": true };
  if (!invoiceId) return { success: false, error: "Choose an invoice." };
  if (!allowed[status]) return { success: false, error: "Choose Paid, Unpaid, or Bad debt." };

  const row = findInvoiceListRow_(invoiceSheet, invoiceId);
  if (!row) return { success: false, error: "That invoice is not on InvoiceList." };

  invoiceSheet.getRange(row, 9).setValue(status); // Column I: Invoice Status
  return {
    success: true,
    invoiceId: invoiceId,
    status: status,
    message: "Invoice " + invoiceId + " marked " + status + ".",
    invoices: fetchInvoiceRecords()
  };
}

/**
 * Compile one draft: InvoiceList column I becomes Invoiced.
 * A blank invoice date is stamped today so the period stats can place it.
 */
function compileSingleInvoice(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invoiceSheet = ss.getSheetByName("InvoiceList");
  if (!invoiceSheet) return { success: false, error: "Missing InvoiceList tab." };

  const invoiceId = String((payload && payload.invoiceId) || "").trim();
  if (!invoiceId) return { success: false, error: "Choose an invoice." };

  const row = findInvoiceListRow_(invoiceSheet, invoiceId);
  if (!row) return { success: false, error: "That invoice is not on InvoiceList." };

  const status = displayStatus_(invoiceSheet.getRange(row, 9).getValue());
  if (status !== "Draft") {
    return { success: false, error: "Only a Draft invoice can be compiled. Invoice " + invoiceId + " is " + status + "." };
  }

  invoiceSheet.getRange(row, 9).setValue("Invoiced");
  if (!invoiceSheet.getRange(row, 8).getValue()) invoiceSheet.getRange(row, 8).setValue(new Date());

  return {
    success: true,
    invoiceId: invoiceId,
    status: "Invoiced",
    message: "Invoice " + invoiceId + " set to Invoiced. Save the PDF or download it to email.",
    invoices: fetchInvoiceRecords()
  };
}

function fetchDashboard() {
  return buildDashboardReport_(SpreadsheetApp.getActiveSpreadsheet(), new Date());
}

function fetchInvoiceDetail(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const report = buildDashboardReport_(ss, new Date());
  if (!report.success) return report;
  const invoiceId = String((payload && payload.invoiceId) || "").trim();
  const invoice = (report.invoices || []).filter(function (item) { return item.id === invoiceId; })[0];
  if (!invoice) return { success: false, error: "That invoice is not on the books." };
  invoice.lines = readInvoiceLines_(ss, invoice);
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
  if (label === "Bad debt") return "bad";
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
  if (timeSheet && timeSheet.getLastRow() >= 2) {
    const data = timeSheet.getRange(2, 2, timeSheet.getLastRow() - 1, 2).getValues();
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

function periodWindowFromIso_(iso, key) {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
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
    badDebt: 0,
    badDebtCount: 0
  };
}

function readClientDirectory_(ss) {
  const map = {};
  const sheet = ss.getSheetByName("ClientRecords");
  if (!sheet || sheet.getLastRow() < 2) return map;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  for (let i = 0; i < data.length; i++) {
    const name = String(data[i][0] || "").trim();
    if (!name) continue;
    const terms = Number(data[i][9]);
    map[name] = {
      email: String(data[i][7] || "").trim(),
      terms: terms > 0 ? terms : 0
    };
  }
  return map;
}

function readTimeRows_(ss, timezone) {
  const sheet = ss.getSheetByName("Time&Attendance");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
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

  const clients = readClientDirectory_(ss);
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

  const windows = {
    month: periodWindowFromIso_(today, "month"),
    quarter: periodWindowFromIso_(today, "quarter"),
    year: periodWindowFromIso_(today, "year")
  };
  const periods = {
    month: blankPeriod_(windows.month),
    quarter: blankPeriod_(windows.quarter),
    year: blankPeriod_(windows.year)
  };
  const clientHours = { month: {}, quarter: {}, year: {} };

  shifts.forEach(function (shift) {
    if (!shift.date) return;
    ["month", "quarter", "year"].forEach(function (key) {
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

  ["month", "quarter", "year"].forEach(function (key) {
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
  const open = { dueAmount: 0, dueCount: 0, overdueAmount: 0, overdueCount: 0, draftAmount: 0, draftCount: 0, badDebtAmount: 0, badDebtCount: 0 };

  Object.keys(groups).sort().forEach(function (code) {
    const group = groups[code];
    const list = group.list;
    const shiftRows = group.shifts;
    let client = list && list.client;
    if (!client) {
      const named = shiftRows.filter(function (shift) { return shift.client; })[0];
      client = named ? named.client : "";
    }
    const profile = clients[client] || { email: "", terms: 0 };
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
      terms: profile.terms,
      inMonth: inIsoRange_(anchor, windows.month.start, windows.month.end),
      inQuarter: inIsoRange_(anchor, windows.quarter.start, windows.quarter.end),
      inYear: inIsoRange_(anchor, windows.year.start, windows.year.end)
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
    } else if (kind === "bad") {
      open.badDebtAmount = roundMoney_(open.badDebtAmount + total);
      open.badDebtCount += 1;
    }

    ["month", "quarter", "year"].forEach(function (key) {
      const flag = key === "month" ? invoice.inMonth : key === "quarter" ? invoice.inQuarter : invoice.inYear;
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
      } else if (kind === "bad") {
        bucket.badDebt = roundMoney_(bucket.badDebt + total);
        bucket.badDebtCount += 1;
      }
    });
  });

  invoices.sort(function (a, b) {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const dueCmp = String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"));
    if (dueCmp) return dueCmp;
    return String(a.code).localeCompare(String(b.code));
  });

  return {
    success: true,
    asOf: today,
    timezone: timezone,
    open: open,
    periods: periods,
    invoices: invoices
  };
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
 * Fill INV-Template!B1 (the print dropdown) and export that sheet as PDF.
 * Rows 1–3 are the on-sheet picker, so the PDF starts at the INVOICE title.
 * Save into the Drive folder named Invoices, or return the file for download / email.
 */
function exportInvoicePdf(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invoiceId = String((payload && payload.invoiceId) || "").trim();
  const mode = String((payload && payload.mode) || "download").toLowerCase();
  if (!invoiceId) return { success: false, error: "Choose an invoice." };
  if (mode !== "drive" && mode !== "download" && mode !== "email") {
    return { success: false, error: "Choose save, download, or email." };
  }

  const code = invoicePrintCode_(ss, invoiceId);
  const email = String((payload && payload.email) || "").trim();
  if (mode === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Enter an email address to send the PDF." };
  }

  const sheet = ss.getSheetByName("INV-Template");
  if (!sheet) return { success: false, error: "The workbook has no INV-Template sheet." };

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

    if (mode === "download") {
      return {
        success: true,
        mode: mode,
        fileName: fileName,
        pdfBase64: Utilities.base64Encode(blob.getBytes()),
        message: fileName + " is ready to download and attach to an email."
      };
    }

    if (mode === "email") {
      MailApp.sendEmail({
        to: email,
        subject: "Invoice " + code,
        body: "Please find invoice " + code + " attached.\n\nJR Engineering",
        attachments: [blob]
      });
      return {
        success: true,
        mode: mode,
        fileName: fileName,
        message: "Emailed " + fileName + " to " + email + "."
      };
    }

    const folder = invoicesFolder_(ss);
    const stored = uniqueFileName_(folder, fileName);
    blob.setName(stored);
    const file = folder.createFile(blob);
    return {
      success: true,
      mode: mode,
      fileName: stored,
      url: file.getUrl(),
      message: "Saved " + stored + " to the Invoices folder on Google Drive."
    };
  } catch (err) {
    return { success: false, error: "Could not create the invoice PDF. " + err };
  } finally {
    sheet.getRange("B1").setValue(previous);
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function widenInvoiceTotals_(sheet) {
  const hoursFormula = String(sheet.getRange("E32").getFormula() || "");
  if (/E20:E24/i.test(hoursFormula)) sheet.getRange("E32").setFormula("=SUM(E20:E31)");
  const amountFormula = String(sheet.getRange("G32").getFormula() || "");
  if (/G20:G24/i.test(amountFormula)) sheet.getRange("G32").setFormula("=SUM(G20:G31)");
}

function renderInvoicePdf_(ss, sheet) {
  const url = ss.getUrl().replace(/\/edit.*$/, "") + "export?format=pdf&exportFormat=pdf"
    + "&gid=" + sheet.getSheetId()
    + "&range=" + encodeURIComponent("A4:G36")
    + "&size=letter&portrait=true&fitw=true"
    + "&sheetnames=false&printtitle=false&pagenumbers=false"
    + "&gridlines=false&fzr=false"
    + "&horizontal_alignment=CENTER&vertical_alignment=TOP"
    + "&top_margin=0.5&bottom_margin=0.5&left_margin=0.4&right_margin=0.4";
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  const blob = response.getBlob();
  const type = String(blob.getContentType() || "");
  if (response.getResponseCode() !== 200 || (type.indexOf("pdf") === -1 && type.indexOf("octet-stream") === -1)) {
    throw new Error("The spreadsheet export did not return a PDF. Redeploy the script and approve Drive access.");
  }
  return blob;
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

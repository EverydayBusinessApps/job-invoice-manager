/**
 * EverydayWork (Engineering Trade Custom Build)
 * Production REST API Gateway
 * Copyright (c) 2026 EverydayBusinessApps. All Rights Reserved.
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    message: "EverydayWork API operational. Awaiting data vectors." 
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
    } else if (action === "getAppSnapshot") {
      responseData = fetchAppSnapshot();
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

  return attachSnapshot_(ss, {
    success: true,
    message: message,
    invoiceId: invoiceId,
    invoices: fetchInvoiceRecords()
  });
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
  return attachSnapshot_(ss, {
    success: true,
    invoiceId: marked[marked.length - 1],
    status: "Invoiced",
    message: label + " set to Invoiced.",
    invoices: fetchInvoiceRecords()
  });
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
  return attachSnapshot_(ss, {
    success: true,
    invoiceId: invoiceId,
    status: status,
    message: "Invoice " + invoiceId + " marked " + status + ".",
    invoices: fetchInvoiceRecords()
  });
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

  return attachSnapshot_(ss, {
    success: true,
    invoiceId: invoiceId,
    status: "Invoiced",
    message: "Invoice " + invoiceId + " set to Invoiced. Save the PDF or download it to email.",
    invoices: fetchInvoiceRecords()
  });
}

function fetchDashboard() {
  return buildDashboardReport_(SpreadsheetApp.getActiveSpreadsheet(), new Date());
}

function fetchAppSnapshot() {
  return fetchDashboard();
}

function fetchInvoiceDetail(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
      terms: profile.terms,
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

  const clientList = Object.keys(clients).sort(function (a, b) { return a.localeCompare(b); }).map(function (name) {
    return { name: name };
  });

  return {
    success: true,
    asOf: today,
    timezone: timezone,
    open: open,
    periods: periods,
    invoices: invoices,
    clients: clientList,
    unbilled: unbilled
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
 * Run once from the Apps Script editor to approve Drive and Gmail.
 * Download does not need this. Save to Drive and Email do.
 * Click Run, choose Allow for Gmail sending, then deploy a new web app version.
 * Invoice email is sent with GmailApp so Gmail can sign it for your address.
 */
function authorizeEverydayWork() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fileName = DriveApp.getFileById(ss.getId()).getName();
  const remaining = MailApp.getRemainingDailyQuota();
  console.log("EverydayWork can save invoices for " + fileName + ". Mail remaining today: " + remaining + ". Invoice email is sent through Gmail.");
}

/**
 * Write the selected invoice into INV-Template!B1, then build the PDF from that
 * sheet. Row 1 is the on-sheet dropdown, so the PDF starts at row 2.
 * Download uses only the spreadsheet. Save to Drive and Email still need Drive and Gmail.
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
      const copyTo = recordsEmail_(ss, email);
      sendInvoiceEmail_(ss, email, code, blob, copyTo);
      return {
        success: true,
        mode: mode,
        fileName: fileName,
        message: copyTo
          ? "Emailed " + fileName + " to " + email + ". A copy went to " + copyTo + " for your records."
          : "Emailed " + fileName + " to " + email + "."
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

function businessProfile_(ss) {
  const profile = { name: "", email: "" };
  const config = ss.getSheetByName("Config");
  if (!config) return profile;
  const rows = config.getRange("A1:B60").getDisplayValues();
  for (let i = 0; i < rows.length; i++) {
    const key = String(rows[i][0] || "");
    const value = String(rows[i][1] || "").trim();
    if (/business name/i.test(key) && value) profile.name = value;
    if (/business email/i.test(key) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) profile.email = value;
  }
  return profile;
}

/**
 * Send through Gmail so the message is signed for the account that runs
 * EverydayWork. MailApp leaves the sender unverified, and Gmail files that as spam.
 */
function sendInvoiceEmail_(ss, email, code, blob, copyTo) {
  const profile = businessProfile_(ss);
  const sender = profile.name || "EverydayWork";
  const plain = "Please find invoice " + code + " attached.\n\n" + sender;
  const html = "<p>Please find invoice " + pdfEscapeHtml_(code) + " attached.</p><p>" + pdfEscapeHtml_(sender) + "</p>";
  const options = {
    attachments: [blob],
    name: sender,
    htmlBody: html
  };
  if (copyTo) options.bcc = copyTo;
  if (profile.email && profile.email.toLowerCase() !== String(email || "").toLowerCase()) options.replyTo = profile.email;
  GmailApp.sendEmail(email, "Invoice " + code, plain, options);
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
      + " In the Apps Script editor, select authorizeEverydayWork, click Run, and choose Allow for Gmail sending. Then deploy a new web app version. Invoice email is sent through Gmail so your address can be verified.";
  }
  if (denied && mode === "drive") {
    return "Could not create the invoice PDF. " + text
      + " In the Apps Script editor, select authorizeEverydayWork, click Run, choose Allow, then deploy a new web app version.";
  }
  return "Could not create the invoice PDF. " + text;
}

/**
 * Read INV-Template rows 2–36 after B1 has been set. Row 1 stays the dropdown.
 * The PDF follows the printed template: title, business block, invoice box,
 * work lines, totals, and the payment bar.
 */
function renderInvoicePdf_(ss, sheet) {
  if (sheet.getName && sheet.getName() !== "INV-Template") {
    throw new Error("The invoice PDF has to be INV-Template, not " + sheet.getName() + ".");
  }
  SpreadsheetApp.flush();
  const values = sheet.getRange("A2:G36").getDisplayValues();
  const pdf = buildInvoicePdf_(values, invoiceLogo_(sheet));
  return Utilities.newBlob(pdfToBytes_(pdf), "application/pdf", "invoice.pdf");
}

function invoiceLogo_(sheet) {
  try {
    if (!sheet.getImages) return null;
    const images = sheet.getImages() || [];
    for (let i = 0; i < images.length; i++) {
      const logo = invoiceImageLogo_(images[i]);
      if (logo) return logo;
    }
    return null;
  } catch (err) {
    return null;
  }
}

function invoiceImageLogo_(image) {
  try {
    if (!image || !image.getBlob) return null;
    const blob = image.getBlob();
    if (!blob) return null;
    const direct = logoFromBytes_(pdfByteList_(blob.getBytes()));
    if (direct) return direct;
    if (!blob.getAs) return null;
    const jpeg = blob.getAs("image/jpeg");
    return logoFromBytes_(pdfByteList_(jpeg.getBytes()));
  } catch (err) {
    return null;
  }
}

function pdfByteList_(raw) {
  const bytes = [];
  for (let i = 0; i < raw.length; i++) bytes.push(raw[i] & 255);
  return bytes;
}

function logoFromBytes_(bytes) {
  if (!bytes || bytes.length < 8) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    const size = jpegSize_(bytes);
    if (!size) return null;
    return { bytes: bytes, width: size.width, height: size.height, raw: false };
  }
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return pngLogo_(bytes);
  return null;
}

function jpegSize_(bytes) {
  let i = 2;
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker === 0xC0 || marker === 0xC2) {
      return {
        height: (bytes[i + 5] << 8) + bytes[i + 6],
        width: (bytes[i + 7] << 8) + bytes[i + 8]
      };
    }
    const len = (bytes[i + 2] << 8) + bytes[i + 3];
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function buildInvoicePdf_(rows, logo) {
  const grid = [];
  const source = rows || [];
  for (let r = 0; r < source.length; r++) {
    const line = [];
    const raw = source[r] || [];
    for (let c = 0; c < 7; c++) line.push(pdfText_(raw[c]));
    grid.push(line);
  }
  if (grid.length < 10) return pdfDocument_(simpleInvoiceStream_(grid), null);

  const commands = [];
  function round1(n) { return Math.round(n * 10) / 10; }
  function fill(x, top, w, h, r, g, b) {
    const y = 792 - (top + h);
    commands.push(r + " " + g + " " + b + " rg");
    commands.push(round1(x) + " " + round1(y) + " " + round1(w) + " " + round1(h) + " re f");
  }
  function stroke(x, top, w, h, width) {
    const y = 792 - (top + h);
    commands.push("0 0 0 RG");
    commands.push(width + " w");
    commands.push(round1(x) + " " + round1(y) + " " + round1(w) + " " + round1(h) + " re S");
  }
  function hline(x1, x2, top, width) {
    const y = 792 - top;
    commands.push("0 0 0 RG");
    commands.push(width + " w");
    commands.push(round1(x1) + " " + round1(y) + " m");
    commands.push(round1(x2) + " " + round1(y) + " l");
    commands.push("S");
  }
  function draw(text, x, yPos, size, bold, color) {
    const shown = pdfText_(text);
    if (!shown) return 0;
    commands.push((color || "0 0 0") + " rg");
    commands.push("BT");
    commands.push("/" + (bold ? "F2" : "F1") + " " + size + " Tf");
    commands.push("1 0 0 1 " + round1(x) + " " + round1(yPos) + " Tm");
    commands.push("(" + pdfEscape_(shown) + ") Tj");
    commands.push("ET");
    return pdfTextWidth_(shown, size);
  }
  function drawRight(text, edge, yPos, size, bold) {
    const shown = pdfText_(text);
    if (!shown) return;
    draw(shown, edge - pdfTextWidth_(shown, size), yPos, size, bold, "0 0 0");
  }

  fill(412.4, 99.7, 149.8, 105.8, 0.851, 0.851, 0.851);
  fill(50.1, 214.9, 512.1, 11.7, 0.965, 0.973, 0.976);
  fill(50.1, 235.9, 512.1, 11.7, 0.965, 0.973, 0.976);
  fill(50.1, 385.7, 188.2, 30.9, 0.851, 0.851, 0.851);
  fill(238.3, 385.7, 323.9, 30.9, 0.8, 0.8, 0.8);
  if (logo && logo.bytes && logo.width && logo.height) {
    const maxW = 74;
    const maxH = 56;
    const fit = Math.min(maxW / logo.width, maxH / logo.height);
    const dw = Math.max(1, logo.width * fit);
    const dh = Math.max(1, logo.height * fit);
    const top = 108 + (maxH - dh) / 2;
    const y = 792 - (top + dh);
    commands.push("q " + round1(dw) + " 0 0 " + round1(dh) + " 52 " + round1(y) + " cm /Im1 Do Q");
  }
  stroke(50.3, 53.8, 511.9, 362.8, 0.5);
  hline(50.1, 562.2, 90.1, 0.5);
  stroke(50.1, 247.4, 512.1, 118.4, 1.4);

  let namedCompany = false;
  for (let sheetRow = 2; sheetRow <= grid.length + 1 && sheetRow <= 36; sheetRow++) {
    const cells = grid[sheetRow - 2];
    if (!cells || !cells.some(Boolean)) continue;
    const y = 792 - pdfLineBottom_(sheetRow);
    if (sheetRow === 4 && /invoice/i.test(cells.filter(Boolean).join(" "))) {
      const title = "INVOICE";
      draw(title, 306 - pdfTextWidth_(title, 12) / 2, y, 12, true, "0 0 0");
      continue;
    }
    if (sheetRow === 17 && /work summary/i.test(cells.filter(Boolean).join(" "))) {
      const heading = "Work Summary";
      draw(heading, 306 - pdfTextWidth_(heading, 7.5) / 2, y, 7.5, true, "0 0 0");
      continue;
    }
    const table = sheetRow >= 19 && sheetRow <= 32;
    const payment = sheetRow >= 33;
    const header = sheetRow === 19;
    if (payment) {
      let label = "";
      let value = "";
      let onlyCol = -1;
      for (let c = 0; c < 7; c++) {
        const text = cells[c];
        if (!text || text === label || text === value) continue;
        if (!label) {
          label = text;
          onlyCol = c;
        } else {
          value = text;
          onlyCol = c;
        }
      }
      const size = 6.2;
      if (value) {
        const labelWidth = draw(label, 52, y, size, false, "0 0 0");
        const valueWidth = pdfTextWidth_(value, size);
        let valueX = 560 - valueWidth;
        const minX = 52 + labelWidth + 10;
        if (valueX < minX) valueX = minX;
        draw(value, valueX, y, size, false, "0 0 0");
      } else if (label && onlyCol >= 2) {
        drawRight(label, 560, y, size, false);
      } else if (label) {
        draw(label, 52, y, size, false, "0 0 0");
      }
      continue;
    }
    for (let c = 0; c < 7; c++) {
      if (!cells[c]) continue;
      const size = table ? (header ? 7 : 6.2) : (c === 1 && !payment ? 7.5 : 6.2);
      const bold = header || (!table && !payment && c === 5 && /^(invoice id|invoice date|service period|bill to)$/i.test(cells[c])) || (!table && !payment && c === 1 && !namedCompany);
      if (!table && !payment && c === 1 && !namedCompany) namedCompany = true;
      const link = /^www\.|^https?:/i.test(cells[c]);
      if (table && c >= 4) {
        const edge = c === 4 ? 411 : (c === 5 ? 482 : 560);
        drawRight(cells[c], edge, y, size, bold);
        continue;
      }
      if (c === 6) {
        drawRight(cells[c], 560, y, size, false);
        continue;
      }
      const left = [52, 128.7, 239.7, 315.1, 374.2, 414.3, 480][c];
      const width = draw(cells[c], left, y, size, bold, link ? "0.067 0.333 0.800" : "0 0 0");
      if (link) {
        commands.push("0.067 0.333 0.800 RG");
        commands.push("0.5 w");
        commands.push(round1(left) + " " + round1(y - 1) + " m");
        commands.push(round1(left + width) + " " + round1(y - 1) + " l");
        commands.push("S");
      }
    }
  }
  return pdfDocument_(commands.join("\n"), logo);
}

function simpleInvoiceStream_(grid) {
  const commands = [];
  let y = 750;
  for (let r = 0; r < grid.length; r++) {
    const line = grid[r].filter(Boolean).join("  ");
    if (!line) continue;
    commands.push("BT");
    commands.push("/F1 10 Tf");
    commands.push("1 0 0 1 40 " + y + " Tm");
    commands.push("(" + pdfEscape_(line) + ") Tj");
    commands.push("ET");
    y -= 14;
  }
  return commands.join("\n");
}

function pdfLineBottom_(sheetRow) {
  if (sheetRow >= 20) return 256.45 + (sheetRow - 20) * 9.87;
  const bottoms = {
    4: 87.71,
    6: 108.52,
    7: 119.76,
    8: 130.99,
    9: 142.03,
    10: 153.47,
    11: 164.7,
    12: 174.53,
    13: 184.36,
    14: 194.19,
    15: 204.02,
    17: 224.89,
    19: 244.88
  };
  return bottoms[sheetRow] || (100 + sheetRow * 10);
}

function pdfTextWidth_(text, size) {
  const widths = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  let width = 0;
  const value = String(text || "");
  for (let i = 0; i < value.length; i++) {
    let code = value.charCodeAt(i);
    if (code === 8364) code = 128;
    const units = code === 128 ? 556 : (widths[code - 32] || 500);
    width += units * size / 1000;
  }
  return width;
}

function pdfText_(value) {
  let text = String(value == null ? "" : value);
  text = text.replace(/[^\x20-\x7E\u20ac]/g, " ");
  return text.replace(/[ \t]+/g, " ").trim();
}

function pdfEscape_(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\u20ac/g, "\\200");
}

function pdfDocument_(stream, image) {
  const body = String(stream || "");
  const streamBody = body.charAt(body.length - 1) === "\n" ? body : body + "\n";
  const page = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >>"
    + (image ? " /XObject << /Im1 7 0 R >>" : "")
    + " >> >>";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    page,
    "<< /Length " + streamBody.length + " >>\nstream\n" + streamBody + "endstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += (i + 1) + " 0 obj\n" + objects[i] + "\nendobj\n";
  }
  if (image && image.bytes) {
    let binary = "";
    for (let i = 0; i < image.bytes.length; i++) binary += String.fromCharCode(image.bytes[i] & 255);
    offsets.push(pdf.length);
    pdf += "7 0 obj\n<< /Type /XObject /Subtype /Image /Width " + image.width
      + " /Height " + image.height
      + " /ColorSpace /DeviceRGB /BitsPerComponent 8"
      + (image.raw ? "" : " /Filter /DCTDecode")
      + " /Length " + image.bytes.length + " >>\nstream\n" + binary + "\nendstream\nendobj\n";
  }
  const xrefAt = pdf.length;
  pdf += "xref\n0 " + (objects.length + (image && image.bytes ? 2 : 1)) + "\n";
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += ("0000000000" + String(offsets[i])).slice(-10) + " 00000 n \n";
  }
  pdf += "trailer\n<< /Size " + (objects.length + (image && image.bytes ? 2 : 1)) + " /Root 1 0 R >>\n";
  pdf += "startxref\n" + xrefAt + "\n%%EOF\n";
  return pdf;
}

function pdfToBytes_(pdf) {
  const out = [];
  const text = String(pdf || "");
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 255);
  return out;
}

function PdfTree_() {
  this.table = new Uint16Array(16);
  this.trans = new Uint16Array(288);
}
function PdfInf_(source, dest) {
  this.source = source;
  this.sourceIndex = 0;
  this.tag = 0;
  this.bitcount = 0;
  this.dest = dest;
  this.destLen = 0;
  this.ltree = new PdfTree_();
  this.dtree = new PdfTree_();
}
var pdfSlTree_ = new PdfTree_();
var pdfSdTree_ = new PdfTree_();
var pdfLenBits_ = new Uint8Array(30);
var pdfLenBase_ = new Uint16Array(30);
var pdfDistBits_ = new Uint8Array(30);
var pdfDistBase_ = new Uint16Array(30);
var pdfClcIdx_ = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var pdfCodeTree_ = new PdfTree_();
var pdfLengths_ = new Uint8Array(320);
var pdfOffs_ = new Uint16Array(16);

function pdfBuildBits_(bits, base, delta, first) {
  var i, sum;
  for (i = 0; i < delta; ++i) bits[i] = 0;
  for (i = 0; i < 30 - delta; ++i) bits[i + delta] = i / delta | 0;
  for (sum = first, i = 0; i < 30; ++i) {
    base[i] = sum;
    sum += 1 << bits[i];
  }
}
function pdfBuildFixed_(lt, dt) {
  var i;
  for (i = 0; i < 7; ++i) lt.table[i] = 0;
  lt.table[7] = 24;
  lt.table[8] = 152;
  lt.table[9] = 112;
  for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
  for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
  for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
  for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;
  for (i = 0; i < 5; ++i) dt.table[i] = 0;
  dt.table[5] = 32;
  for (i = 0; i < 32; ++i) dt.trans[i] = i;
}
function pdfBuildTree_(t, lengths, off, num) {
  var i, sum;
  for (i = 0; i < 16; ++i) t.table[i] = 0;
  for (i = 0; i < num; ++i) t.table[lengths[off + i]]++;
  t.table[0] = 0;
  for (sum = 0, i = 0; i < 16; ++i) {
    pdfOffs_[i] = sum;
    sum += t.table[i];
  }
  for (i = 0; i < num; ++i) {
    if (lengths[off + i]) t.trans[pdfOffs_[lengths[off + i]]++] = i;
  }
}
function pdfGetBit_(d) {
  if (!d.bitcount--) {
    d.tag = d.source[d.sourceIndex++];
    d.bitcount = 7;
  }
  var bit = d.tag & 1;
  d.tag >>>= 1;
  return bit;
}
function pdfReadBits_(d, num, base) {
  if (!num) return base;
  while (d.bitcount < 24) {
    d.tag |= d.source[d.sourceIndex++] << d.bitcount;
    d.bitcount += 8;
  }
  var val = d.tag & (0xffff >>> (16 - num));
  d.tag >>>= num;
  d.bitcount -= num;
  return val + base;
}
function pdfDecodeSymbol_(d, t) {
  while (d.bitcount < 24) {
    d.tag |= d.source[d.sourceIndex++] << d.bitcount;
    d.bitcount += 8;
  }
  var sum = 0, cur = 0, len = 0;
  var tag = d.tag;
  do {
    cur = 2 * cur + (tag & 1);
    tag >>>= 1;
    ++len;
    sum += t.table[len];
    cur -= t.table[len];
  } while (cur >= 0);
  d.tag = tag;
  d.bitcount -= len;
  return t.trans[sum + cur];
}
function pdfDecodeTrees_(d, lt, dt) {
  var hlit = pdfReadBits_(d, 5, 257);
  var hdist = pdfReadBits_(d, 5, 1);
  var hclen = pdfReadBits_(d, 4, 4);
  var i, num, length;
  for (i = 0; i < 19; ++i) pdfLengths_[i] = 0;
  for (i = 0; i < hclen; ++i) pdfLengths_[pdfClcIdx_[i]] = pdfReadBits_(d, 3, 0);
  pdfBuildTree_(pdfCodeTree_, pdfLengths_, 0, 19);
  for (num = 0; num < hlit + hdist;) {
    var sym = pdfDecodeSymbol_(d, pdfCodeTree_);
    if (sym === 16) {
      var prev = pdfLengths_[num - 1];
      for (length = pdfReadBits_(d, 2, 3); length; --length) pdfLengths_[num++] = prev;
    } else if (sym === 17) {
      for (length = pdfReadBits_(d, 3, 3); length; --length) pdfLengths_[num++] = 0;
    } else if (sym === 18) {
      for (length = pdfReadBits_(d, 7, 11); length; --length) pdfLengths_[num++] = 0;
    } else {
      pdfLengths_[num++] = sym;
    }
  }
  pdfBuildTree_(lt, pdfLengths_, 0, hlit);
  pdfBuildTree_(dt, pdfLengths_, hlit, hdist);
}
function pdfInflateBlock_(d, lt, dt) {
  while (1) {
    var sym = pdfDecodeSymbol_(d, lt);
    if (sym === 256) return 0;
    if (sym < 256) {
      d.dest[d.destLen++] = sym;
    } else {
      sym -= 257;
      var length = pdfReadBits_(d, pdfLenBits_[sym], pdfLenBase_[sym]);
      var dist = pdfDecodeSymbol_(d, dt);
      var offs = d.destLen - pdfReadBits_(d, pdfDistBits_[dist], pdfDistBase_[dist]);
      for (var i = offs; i < offs + length; ++i) d.dest[d.destLen++] = d.dest[i];
    }
  }
}
function pdfInflateStored_(d) {
  while (d.bitcount > 8) {
    d.sourceIndex--;
    d.bitcount -= 8;
  }
  var length = d.source[d.sourceIndex + 1] * 256 + d.source[d.sourceIndex];
  var inv = d.source[d.sourceIndex + 3] * 256 + d.source[d.sourceIndex + 2];
  if (length !== (~inv & 65535)) return -3;
  d.sourceIndex += 4;
  for (var i = length; i; --i) d.dest[d.destLen++] = d.source[d.sourceIndex++];
  d.bitcount = 0;
  return 0;
}
function pdfInflate_(source, size) {
  var dest = [];
  if (size) dest.length = size;
  var d = new PdfInf_(source, dest);
  var bfinal, btype, res;
  do {
    bfinal = pdfGetBit_(d);
    btype = pdfReadBits_(d, 2, 0);
    if (btype === 0) res = pdfInflateStored_(d);
    else if (btype === 1) res = pdfInflateBlock_(d, pdfSlTree_, pdfSdTree_);
    else if (btype === 2) {
      pdfDecodeTrees_(d, d.ltree, d.dtree);
      res = pdfInflateBlock_(d, d.ltree, d.dtree);
    } else res = -3;
    if (res !== 0) throw new Error("Could not read the invoice logo.");
  } while (!bfinal);
  var out = [];
  for (var i = 0; i < d.destLen; i++) out.push(dest[i]);
  return out;
}
pdfBuildFixed_(pdfSlTree_, pdfSdTree_);
pdfBuildBits_(pdfLenBits_, pdfLenBase_, 4, 3);
pdfBuildBits_(pdfDistBits_, pdfDistBase_, 2, 1);
pdfLenBits_[28] = 0;
pdfLenBase_[28] = 258;


function pngLogo_(bytes) {
  try {
    let pos = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idat = [];
    let palette = null;
    while (pos + 12 <= bytes.length) {
      const len = bytes[pos] * 16777216 + bytes[pos + 1] * 65536 + bytes[pos + 2] * 256 + bytes[pos + 3];
      const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
      const start = pos + 8;
      const data = bytes.slice(start, start + len);
      pos = start + len + 4;
      if (type === "IHDR") {
        width = data[0] * 16777216 + data[1] * 65536 + data[2] * 256 + data[3];
        height = data[4] * 16777216 + data[5] * 65536 + data[6] * 256 + data[7];
        bitDepth = data[8];
        colorType = data[9];
      } else if (type === "PLTE") {
        palette = data;
      } else if (type === "IDAT") {
        for (let i = 0; i < data.length; i++) idat.push(data[i]);
      } else if (type === "IEND") {
        break;
      }
    }
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    if (bitDepth !== 8 || !channels || !width || !height) return null;
    const inflated = pdfInflate_(idat.slice(2), height * (1 + width * channels));
    const stride = width * channels;
    const rgb = [];
    let i = 0;
    let prev = [];
    for (let y = 0; y < height; y++) {
      const filter = inflated[i++];
      const row = [];
      for (let x = 0; x < stride; x++) {
        const raw = inflated[i++] || 0;
        const left = x >= channels ? row[x - channels] : 0;
        const up = prev[x] || 0;
        const upLeft = x >= channels ? (prev[x - channels] || 0) : 0;
        let value = raw;
        if (filter === 1) value = (raw + left) & 255;
        else if (filter === 2) value = (raw + up) & 255;
        else if (filter === 3) value = (raw + ((left + up) >> 1)) & 255;
        else if (filter === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pred = pa <= pb && pa <= pc ? left : (pb <= pc ? up : upLeft);
          value = (raw + pred) & 255;
        }
        row.push(value);
      }
      prev = row;
      for (let x = 0; x < width; x++) {
        if (colorType === 2) {
          rgb.push(row[x * 3], row[x * 3 + 1], row[x * 3 + 2]);
        } else if (colorType === 6) {
          const a = row[x * 4 + 3] / 255;
          rgb.push(
            Math.round(row[x * 4] * a + 255 * (1 - a)),
            Math.round(row[x * 4 + 1] * a + 255 * (1 - a)),
            Math.round(row[x * 4 + 2] * a + 255 * (1 - a))
          );
        } else if (colorType === 0) {
          rgb.push(row[x], row[x], row[x]);
        } else if (colorType === 3 && palette) {
          const p = row[x] * 3;
          rgb.push(palette[p] || 0, palette[p + 1] || 0, palette[p + 2] || 0);
        } else if (colorType === 4) {
          const a = row[x * 2 + 1] / 255;
          const g = Math.round(row[x * 2] * a + 255 * (1 - a));
          rgb.push(g, g, g);
        }
      }
    }
    const trimmed = pdfTrimRgb_(rgb, width, height);
    return pdfShrinkRgb_(trimmed.rgb, trimmed.width, trimmed.height, 160);
  } catch (err) {
    return null;
  }
}

function pdfTrimRgb_(rgb, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (rgb[i] < 248 || rgb[i + 1] < 248 || rgb[i + 2] < 248) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return { rgb: rgb, width: width, height: height };
  const pad = 1;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const nw = maxX - minX + 1;
  const nh = maxY - minY + 1;
  if (nw === width && nh === height) return { rgb: rgb, width: width, height: height };
  const out = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * width + x) * 3;
      out.push(rgb[i], rgb[i + 1], rgb[i + 2]);
    }
  }
  return { rgb: out, width: nw, height: nh };
}

function pdfShrinkRgb_(rgb, width, height, maxEdge) {
  const scale = Math.max(width, height) / maxEdge;
  if (scale <= 1) return { bytes: rgb, width: width, height: height, raw: true };
  const nw = Math.max(1, Math.round(width / scale));
  const nh = Math.max(1, Math.round(height / scale));
  const out = [];
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(height - 1, Math.floor(y * height / nh));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(width - 1, Math.floor(x * width / nw));
      const i = (sy * width + sx) * 3;
      out.push(rgb[i], rgb[i + 1], rgb[i + 2]);
    }
  }
  return { bytes: out, width: nw, height: nh, raw: true };
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

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

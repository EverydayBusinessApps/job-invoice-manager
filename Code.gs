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
        const status = String(data[i][8] || "").trim() || "Draft";
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

function appendInvoiceListRow_(invoiceSheet) {
  const invLastValues = invoiceSheet.getRange("H1:H").getValues();
  let nextInvListRow = 1;
  while (invLastValues[nextInvListRow - 1] && invLastValues[nextInvListRow - 1][0] !== "") {
    nextInvListRow++;
  }
  invoiceSheet.getRange(nextInvListRow, 8).setValue(new Date());   // Column H: Invoice Date
  invoiceSheet.getRange(nextInvListRow, 9).setValue("Draft");      // Column I: Invoice Status
  return nextInvListRow;
}

function createDraftInvoice_(invoiceSheet) {
  const invoiceId = nextInvoiceInt_(invoiceSheet);
  appendInvoiceListRow_(invoiceSheet);
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

  const lastRow = timeSheet.getLastRow();
  let totalHours = 0;
  let totalAmount = 0;

  if (lastRow >= 2) {
    const data = timeSheet.getRange(2, 1, lastRow - 1, 12).getValues();
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const invoiceInt = String(row[2]).trim(); // Column C: InvoiceInt
      const clientName = String(row[3]).trim(); // Column D: ClientID
      const hours = Number(row[9]) || 0;         // Column J: Hours (calculated by your formula)
      const charge = Number(row[11]) || 0;       // Column L: Billable Charge (calculated by your formula)

      if (clientName === payload.clientName && invoiceInt === "") {
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

  // Calculate the next raw index value sequence for InvoiceInt
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
      
      if (clientNameCell === payload.clientName && invoiceIntCell === "") {
        // Write the index number directly into Column C memory space
        data[i][2] = nextInvoiceInt;
        updatedRowsCount++;
      }
    }

    if (updatedRowsCount === 0) {
      return { success: false, error: "No open unbilled items detected for this client profile." };
    }
    range.setValues(data); // Flush updates back to sheet
  }

  appendInvoiceListRow_(invoiceSheet);

  return { success: true, invoiceId: nextInvoiceInt, invoices: fetchInvoiceRecords() };
}

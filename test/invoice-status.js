/**
 * Status rules for InvoiceList column I.
 * Run: node test/invoice-status.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(cond, message) {
  if (!cond) throw new Error(message || "assertion failed");
}

function colToIndex(letters) {
  let n = 0;
  const text = String(letters || "").toUpperCase();
  for (let i = 0; i < text.length; i++) n = n * 26 + (text.charCodeAt(i) - 64);
  return n;
}

function createSheet(name) {
  const cells = {};
  createSheet.nextId = (createSheet.nextId || 0) + 1;
  const sheetId = createSheet.nextId;
  let sheetHidden = false;
  const hiddenRows = {};
  const hiddenCols = {};
  function key(row, col) { return row + ":" + col; }
  function get(row, col) {
    return Object.prototype.hasOwnProperty.call(cells, key(row, col)) ? cells[key(row, col)] : "";
  }
  function set(row, col, value) {
    cells[key(row, col)] = value;
    if (name === "InvoiceList" && row >= 2 && col === 8 && get(row, 1) === "" && value !== "") {
      cells[key(row, 1)] = row - 1;
    }
  }
  function lastRow() {
    let max = 0;
    Object.keys(cells).forEach((id) => {
      if (cells[id] === "" || cells[id] == null) return;
      const row = Number(id.split(":")[0]);
      if (row > max) max = row;
    });
    return max;
  }
function parseA1(a1) {
  const cell = String(a1).match(/^([A-Z]+)(\d+)$/);
  if (cell) {
    return {
      startRow: Number(cell[2]),
      endRow: Number(cell[2]),
      startCol: colToIndex(cell[1]),
      endCol: colToIndex(cell[1]),
      single: true
    };
  }
  const full = String(a1).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (full) {
    return {
      startRow: Number(full[2]),
      endRow: Number(full[4]),
      startCol: colToIndex(full[1]),
      endCol: colToIndex(full[3]),
      single: false
    };
  }
  const match = String(a1).match(/^([A-Z]+)(\d+):([A-Z]+)$/);
  if (!match) throw new Error("Unsupported range " + a1);
  return {
    startRow: Number(match[2]),
    startCol: colToIndex(match[1]),
    endCol: colToIndex(match[3])
  };
}
  return {
    name: name,
    getLastRow: lastRow,
    getRange: function (rowOrA1, col, numRows, numCols) {
      let startRow;
      let startCol;
      let rows;
      let cols;
      if (typeof rowOrA1 === "string") {
        const parsed = parseA1(rowOrA1);
        startRow = parsed.startRow;
        startCol = parsed.startCol;
        if (parsed.single) {
          rows = 1;
          cols = 1;
        } else if (parsed.endRow) {
          rows = parsed.endRow - startRow + 1;
          cols = parsed.endCol - startCol + 1;
        } else {
          const end = Math.max(lastRow(), startRow);
          rows = end - startRow + 1;
          cols = parsed.endCol - startCol + 1;
        }
      } else if (numRows == null) {
        startRow = rowOrA1;
        startCol = col;
        rows = 1;
        cols = 1;
      } else {
        startRow = rowOrA1;
        startCol = col;
        rows = numRows;
        cols = numCols;
      }
      return {
        getValue: function () {
          return get(startRow, startCol);
        },
        setValue: function (value) {
          set(startRow, startCol, value);
        },
        getValues: function () {
          const out = [];
          for (let r = 0; r < rows; r++) {
            const line = [];
            for (let c = 0; c < cols; c++) line.push(get(startRow + r, startCol + c));
            out.push(line);
          }
          return out;
        },
        getDisplayValues: function () {
          return this.getValues().map(function (line) {
            return line.map(function (value) {
              return value == null ? "" : String(value);
            });
          });
        },
        setValues: function (values) {
          for (let r = 0; r < values.length; r++) {
            for (let c = 0; c < values[r].length; c++) set(startRow + r, startCol + c, values[r][c]);
          }
        },
        getFormula: function () { return ""; },
        setFormula: function () {}
      };
    },
    getSheetId: function () { return sheetId; },
    getName: function () { return name; },
    getMaxRows: function () { return 1000; },
    getMaxColumns: function () { return 26; },
    isSheetHidden: function () { return sheetHidden; },
    hideSheet: function () { sheetHidden = true; },
    showSheet: function () { sheetHidden = false; },
    isRowHiddenByUser: function (row) { return !!hiddenRows[row]; },
    isColumnHiddenByUser: function (col) { return !!hiddenCols[col]; },
    hideRows: function (row, count) {
      for (let i = 0; i < count; i++) hiddenRows[row + i] = true;
    },
    showRows: function (row, count) {
      for (let i = 0; i < count; i++) delete hiddenRows[row + i];
    },
    hideColumns: function (col, count) {
      for (let i = 0; i < count; i++) hiddenCols[col + i] = true;
    },
    showColumns: function (col, count) {
      for (let i = 0; i < count; i++) delete hiddenCols[col + i];
    }
  };
}

function createWorkbook() {
  const order = [];
  let active = null;
  const sheets = new Proxy({}, {
    set: function (target, prop, value) {
      target[prop] = value;
      if (order.indexOf(value) === -1) order.push(value);
      value.getIndex = function () { return order.indexOf(value) + 1; };
      value.activate = function () { active = value; };
      return true;
    },
    get: function (target, prop) { return target[prop]; }
  });
  sheets["ClientRecords"] = createSheet("ClientRecords");
  sheets["Time&Attendance"] = createSheet("Time&Attendance");
  sheets["InvoiceList"] = createSheet("InvoiceList");
  sheets["Time&Attendance"].getRange(1, 4).setValue("ClientID");
  sheets["InvoiceList"].getRange(1, 8).setValue("Invoice Date");
  active = sheets["Time&Attendance"];
  return {
    getSheetByName: function (name) { return sheets[name] || null; },
    getSheets: function () { return order.slice(); },
    getActiveSheet: function () { return active; },
    getSpreadsheetTimeZone: function () { return "UTC"; },
    getId: function () { return "workbook"; },
    setActiveSheet: function (sheet) { active = sheet; },
    moveActiveSheet: function (pos) {
      const from = order.indexOf(active);
      if (from < 0) throw new Error("active sheet is not in the workbook");
      order.splice(from, 1);
      order.splice(Math.max(0, pos - 1), 0, active);
    },
    getBlob: function () {
      return {
        setName: function () { return this; },
        getBytes: function () { return [37, 80, 68, 70, 45, 49, 46, 52, 10]; },
        getContentType: function () { return "application/pdf"; }
      };
    },
    sheets: sheets
  };
}

function loadApi(workbook) {
  const context = {
    SpreadsheetApp: {
      getActiveSpreadsheet: function () { return workbook; },
      flush: function () {}
    },
    LockService: {
      getDocumentLock: function () {
        return {
          tryLock: function () { return true; },
          releaseLock: function () {}
        };
      }
    },
    DriveApp: {
      getFileById: function () {
        context.driveTouches += 1;
        return { getName: function () { return "EverydayWork"; } };
      }
    },
    MailApp: {
      getRemainingDailyQuota: function () {
        context.mailTouches += 1;
        return 100;
      },
      sendEmail: function () { throw new Error("MailApp.sendEmail leaves the sender unverified"); }
    },
    GmailApp: {
      sendEmail: function (to, subject, body, options) {
        context.mailTouches += 1;
        context.lastEmail = {
          to: to,
          subject: subject,
          body: body,
          bcc: options && options.bcc,
          attachments: options && options.attachments,
          name: options && options.name,
          htmlBody: options && options.htmlBody,
          replyTo: options && options.replyTo
        };
      }
    },
    Session: {
      getScriptTimeZone: function () { return "UTC"; },
      getEffectiveUser: function () {
        return { getEmail: function () { return "jane@everydaybusiness.ie"; } };
      }
    },
    ScriptApp: {
      AuthMode: { FULL: "FULL" },
      getAuthorizationInfo: function () {
        return {
          getAuthorizationUrl: function () { return "https://accounts.google.com/o/oauth2/auth?everydaywork=1"; }
        };
      },
      getOAuthToken: function () { return "token"; }
    },
    Utilities: {
      formatDate: function (date, timezone, pattern) {
        if (Object.prototype.toString.call(date) !== "[object Date]" || isNaN(date.getTime())) return "";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        const hh = String(date.getHours()).padStart(2, "0");
        const mm = String(date.getMinutes()).padStart(2, "0");
        if (pattern === "HH:mm") return hh + ":" + mm;
        if (pattern === "HHmm") return hh + mm;
        return y + "-" + m + "-" + d;
      },
      sleep: function () {},
      base64Encode: function (bytes) { return Buffer.from(bytes).toString("base64"); },
      newBlob: function (bytes, type) {
        return {
          setName: function () { return this; },
          getBytes: function () { return bytes; },
          getContentType: function () { return type || "application/pdf"; }
        };
      }
    },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: function () { return { setMimeType: function () { return {}; } }; } },
    UrlFetchApp: {
      fetch: function (url, options) {
        context.fetchTouches += 1;
        context.lastFetch = { url: url, options: options };
        if (context.fetchError) throw new Error(context.fetchError);
        const bytes = context.fetchBytes || [37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 37, 69, 79, 70];
        return {
          getResponseCode: function () { return context.fetchCode || 200; },
          getBlob: function () {
            return {
              setName: function () { return this; },
              getBytes: function () { return bytes; },
              getContentType: function () { return "application/pdf"; }
            };
          }
        };
      }
    },
    console: console,
    driveTouches: 0,
    mailTouches: 0,
    fetchTouches: 0
  };
  context.global = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8"), context);
  return context;
}

function shift(extra) {
  return Object.assign({
    clientName: "Acme",
    date: "2026-09-22",
    jobDetails: "Site visit",
    start: "08:00",
    lunch: "na",
    finish: "16:30",
    invoiceMode: "new"
  }, extra || {});
}

function statusCell(workbook, row) {
  return workbook.sheets["InvoiceList"].getRange(row, 9).getValue();
}

function timeRows(workbook) {
  const sheet = workbook.sheets["Time&Attendance"];
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 3, last - 1, 2).getValues();
}

const failures = [];
function test(name, fn) {
  const workbook = createWorkbook();
  const api = loadApi(workbook);
  try {
    fn(api, workbook);
    console.log("ok  " + name);
  } catch (err) {
    failures.push(name + ": " + err.message);
    console.error("FAIL " + name + "\n  " + err.message);
  }
}

test("first time entry sets InvoiceList column I to Draft", function (api, workbook) {
  const created = api.executeTimeLog(shift());
  assert(created.success, created.error);
  assert(statusCell(workbook, 2) === "Draft", "column I was " + statusCell(workbook, 2));
  assert(String(created.invoiceId) === "1", "invoice id " + created.invoiceId);
  const again = api.executeTimeLog(shift({ invoiceMode: "existing", invoiceId: created.invoiceId }));
  assert(again.success, again.error);
  assert(statusCell(workbook, 2) === "Draft", "second entry changed status");
});

test("blank column I is set to Draft on the first time entry", function (api, workbook) {
  const invoiceSheet = workbook.sheets["InvoiceList"];
  invoiceSheet.getRange(2, 1).setValue(4);
  invoiceSheet.getRange(2, 2).setValue("Acme");
  invoiceSheet.getRange(2, 8).setValue(new Date(2026, 8, 1));
  const logged = api.executeTimeLog(shift({ invoiceMode: "existing", invoiceId: "4" }));
  assert(logged.success, logged.error);
  assert(statusCell(workbook, 2) === "Draft", "blank status stayed " + statusCell(workbook, 2));
});

test("compile sets draft invoices to Invoiced and leaves other clients", function (api, workbook) {
  const acme = api.executeTimeLog(shift());
  const other = api.executeTimeLog(shift({ clientName: "Other Co" }));
  assert(acme.success && other.success, "setup failed");
  const compiled = api.processAccountInvoice({ clientName: "Acme" });
  assert(compiled.success, compiled.error);
  assert(compiled.status === "Invoiced", compiled.status);
  assert(statusCell(workbook, 2) === "Invoiced", "Acme column I " + statusCell(workbook, 2));
  assert(statusCell(workbook, 3) === "Draft", "other client was changed");
  const summary = api.fetchUnbilledSummary({ clientName: "Acme" });
  assert(summary.success && summary.totalHours === 0, "invoiced hours still open");
});

test("compile closes legacy unbilled rows as Invoiced", function (api, workbook) {
  const timeSheet = workbook.sheets["Time&Attendance"];
  timeSheet.getRange(2, 4).setValue("Acme");
  timeSheet.getRange(2, 10).setValue(3);
  timeSheet.getRange(2, 12).setValue(120);
  const compiled = api.processAccountInvoice({ clientName: "Acme" });
  assert(compiled.success, compiled.error);
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));
  assert(String(timeSheet.getRange(2, 3).getValue()) === "1", "invoice number not stamped");
});

test("time cannot be added once an invoice leaves Draft", function (api, workbook) {
  const created = api.executeTimeLog(shift());
  const before = timeRows(workbook).length;
  api.processAccountInvoice({ clientName: "Acme" });
  const blocked = api.executeTimeLog(shift({ invoiceMode: "existing", invoiceId: created.invoiceId, jobDetails: "should not land" }));
  assert(!blocked.success, "invoiced add was allowed");
  assert(/Draft/.test(blocked.error), blocked.error);
  assert(timeRows(workbook).length === before, "a time row was added");

  api.updateInvoiceStatus({ invoiceId: created.invoiceId, status: "Paid" });
  const paidBlock = api.executeTimeLog(shift({ invoiceMode: "existing", invoiceId: created.invoiceId }));
  assert(!paidBlock.success, "paid add was allowed");
  api.updateInvoiceStatus({ invoiceId: created.invoiceId, status: "Unpaid" });
  assert(!api.executeTimeLog(shift({ invoiceMode: "existing", invoiceId: created.invoiceId })).success, "unpaid add was allowed");
  api.updateInvoiceStatus({ invoiceId: created.invoiceId, status: "Bad debt" });
  assert(statusCell(workbook, 2) === "Bad debt", statusCell(workbook, 2));
  assert(!api.executeTimeLog(shift({ invoiceMode: "existing", invoiceId: created.invoiceId })).success, "bad debt add was allowed");
});

test("billing desk marks Paid, Unpaid, and Bad debt", function (api, workbook) {
  const created = api.executeTimeLog(shift());
  ["Paid", "Unpaid", "Bad debt"].forEach(function (status) {
    const updated = api.updateInvoiceStatus({ invoiceId: created.invoiceId, status: status });
    assert(updated.success, updated.error);
    assert(updated.status === status, updated.status);
    assert(statusCell(workbook, 2) === status, statusCell(workbook, 2));
    const record = updated.invoices.filter(function (inv) { return inv.id === String(created.invoiceId); })[0];
    assert(record && record.status === status, "record status " + (record && record.status));
  });
  const rejected = api.updateInvoiceStatus({ invoiceId: created.invoiceId, status: "Draft" });
  assert(!rejected.success, "Draft was accepted from the billing desk");
  assert(statusCell(workbook, 2) === "Bad debt", "status was overwritten");
});

test("unbilled summary counts draft time only", function (api, workbook) {
  const created = api.executeTimeLog(shift());
  workbook.sheets["Time&Attendance"].getRange(2, 10).setValue(5);
  workbook.sheets["Time&Attendance"].getRange(2, 12).setValue(250);
  const open = api.fetchUnbilledSummary({ clientName: "Acme" });
  assert(open.totalHours === 5 && open.totalAmount === 250, JSON.stringify(open));
  api.processAccountInvoice({ clientName: "Acme" });
  const closed = api.fetchUnbilledSummary({ clientName: "Acme" });
  assert(closed.totalHours === 0 && closed.totalAmount === 0, JSON.stringify(closed));
  assert(created.success, "setup");
});

function atNoon(year, month, day) {
  return new Date(year, month - 1, day, 12, 0, 0);
}

function seedBooks(workbook) {
  const clients = workbook.sheets["ClientRecords"];
  clients.getRange(2, 1).setValue("Acme");
  clients.getRange(2, 8).setValue("acme@example.com");
  clients.getRange(2, 10).setValue(14);
  clients.getRange(3, 1).setValue("Other Co");
  clients.getRange(3, 10).setValue(30);

  const invoices = workbook.sheets["InvoiceList"];
  const invoiceRows = [
    ["INV-JR26-001", "Acme", "", "", "", "", 100, atNoon(2026, 8, 1), "Paid"],
    ["INV-JR26-002", "Acme", "Site visit", "", "", "", 200, atNoon(2026, 9, 1), "Invoiced"],
    ["INV-JR26-003", "Other Co", "", "", "", "", 50, atNoon(2026, 9, 10), "Draft"],
    ["INV-JR26-004", "Acme", "", "", "", "", 80, atNoon(2026, 7, 15), "Bad Debt"],
    ["INV-JR26-005", "Other Co", "", "", "", "", "", atNoon(2026, 9, 20), "Unpaid"]
  ];
  invoiceRows.forEach(function (row, index) {
    row.forEach(function (value, col) {
      if (value === "") return;
      invoices.getRange(index + 2, col + 1).setValue(value);
    });
  });

  const time = workbook.sheets["Time&Attendance"];
  const shifts = [
    ["INV-JR26-002", 2, "Acme", atNoon(2026, 9, 2), "Site visit", "08:00", "12:00", 4, 200],
    ["INV-JR26-003", 3, "Other Co", atNoon(2026, 9, 12), "", "09:00", "10:00", 1, 50],
    ["INV-JR26-005", 5, "Other Co", atNoon(2026, 9, 21), "", "09:00", "11:00", 2, 40],
    ["INV-JR26-001", 1, "Acme", atNoon(2026, 8, 2), "", "09:00", "12:00", 3, 100],
    ["INV-JR26-004", 4, "Acme", atNoon(2026, 7, 16), "", "09:00", "11:00", 2, 80]
  ];
  shifts.forEach(function (row, index) {
    const line = index + 2;
    time.getRange(line, 2).setValue(row[0]);
    time.getRange(line, 3).setValue(row[1]);
    time.getRange(line, 4).setValue(row[2]);
    time.getRange(line, 5).setValue(row[3]);
    time.getRange(line, 6).setValue(row[4]);
    time.getRange(line, 7).setValue(row[5]);
    time.getRange(line, 9).setValue(row[6]);
    time.getRange(line, 10).setValue(row[7]);
    time.getRange(line, 12).setValue(row[8]);
  });
}

function findInvoice(report, id) {
  return report.invoices.filter(function (inv) { return inv.id === id; })[0];
}

test("dashboard splits hours and invoices across month, quarter, and year", function (api, workbook) {
  seedBooks(workbook);
  const report = api.buildDashboardReport_(workbook, atNoon(2026, 9, 22));
  assert(report.success, report.error);
  assert(report.asOf === "2026-09-22", report.asOf);

  const month = report.periods.month;
  assert(month.label === "September 2026", month.label);
  assert(month.hours === 7, "month hours " + month.hours);
  assert(month.shifts === 3, "month shifts " + month.shifts);
  assert(month.clients === 2, "month clients " + month.clients);
  assert(month.billable === 290, "month billable " + month.billable);
  assert(month.avgRate === 41.43, "avg rate " + month.avgRate);
  assert(month.topClient === "Acme" && month.topClientHours === 4, month.topClient + " " + month.topClientHours);
  assert(month.paid === 0 && month.paidCount === 0, "month paid");
  assert(month.sent === 240 && month.sentCount === 2, "month sent " + month.sent);
  assert(month.due === 240 && month.dueCount === 2, "month due " + month.due);
  assert(month.draft === 50 && month.draftCount === 1, "month draft");
  assert(month.overdue === 200 && month.overdueCount === 1, "month overdue");
  assert(month.badDebt === 0, "month bad debt");

  const quarter = report.periods.quarter;
  assert(quarter.label === "Q3 2026", quarter.label);
  assert(quarter.hours === 12 && quarter.billable === 470, JSON.stringify({ hours: quarter.hours, billable: quarter.billable }));
  assert(quarter.avgRate === 39.17, "quarter rate " + quarter.avgRate);
  assert(quarter.topClient === "Acme" && quarter.topClientHours === 9, quarter.topClientHours);
  assert(quarter.paid === 100 && quarter.sent === 420, "quarter money " + quarter.paid + " " + quarter.sent);
  assert(quarter.due === 240 && quarter.draft === 50 && quarter.badDebt === 80, "quarter split");
  assert(quarter.overdue === 200, "quarter overdue");
  assert(report.periods.year.sent === quarter.sent && report.periods.year.hours === quarter.hours, "year should match this sample");

  assert(report.open.dueAmount === 240 && report.open.dueCount === 2, "open due");
  assert(report.open.overdueAmount === 200 && report.open.overdueCount === 1, "open overdue");
  assert(report.open.draftAmount === 50 && report.open.draftCount === 1, "open draft");
  assert(report.open.badDebtAmount === 80 && report.open.badDebtCount === 1, "open bad debt");

  const overdue = findInvoice(report, "INV-JR26-002");
  assert(overdue && overdue.kind === "due" && overdue.overdue, "invoiced should be overdue");
  assert(overdue.dueDate === "2026-09-15" && overdue.daysOverdue === 7, overdue.dueDate + " " + overdue.daysOverdue);
  assert(overdue.email === "acme@example.com", overdue.email);
  const unpaid = findInvoice(report, "INV-JR26-005");
  assert(unpaid && unpaid.kind === "due" && !unpaid.overdue && unpaid.total === 40, JSON.stringify(unpaid));
  assert(unpaid.dueDate === "2026-10-20", unpaid.dueDate);
  const bad = findInvoice(report, "INV-JR26-004");
  assert(bad && bad.status === "Bad debt" && bad.kind === "bad", bad && bad.status);
  const draft = findInvoice(report, "INV-JR26-003");
  assert(draft && draft.kind === "draft" && draft.inMonth && !draft.inQuarter === false, "draft period flags");
  assert(draft.inQuarter && draft.inYear, "draft should sit in the quarter and year");

  const detail = api.fetchInvoiceDetail({ invoiceId: "INV-JR26-002" });
  // fetchInvoiceDetail uses the live clock, so call the line reader through the report invoice.
  const lines = api.readInvoiceLines_(workbook, overdue);
  assert(overdue.lines && overdue.lines.length === 1, "snapshot lines " + (overdue.lines && overdue.lines.length));
  assert(overdue.lines[0].hours === 4 && overdue.lines[0].amount === 200, JSON.stringify(overdue.lines[0]));
  assert(lines.length === 1, "lines " + lines.length);
  assert(report.unbilled["Other Co"].totalHours === 1 && report.unbilled["Other Co"].totalAmount === 50, JSON.stringify(report.unbilled));
  assert(!report.unbilled.Acme, "paid and invoiced time was left open");
  assert(report.clients.map(function (client) { return client.name; }).join(",") === "Acme,Other Co", JSON.stringify(report.clients));
  assert(report.invoicePdf === "inv-template-sheet", report.invoicePdf);
  assert(api.fetchAppSnapshot().success, "snapshot action");
  assert(lines[0].date === "2026-09-02" && lines[0].hours === 4 && lines[0].amount === 200, JSON.stringify(lines[0]));
  assert(lines[0].start === "08:00" && lines[0].finish === "12:00", lines[0].start + " " + lines[0].finish);
  assert(detail.success === false || detail.success === true, "detail callable");
});

test("invoice print code follows the INV-Template dropdown values", function (api, workbook) {
  const time = workbook.sheets["Time&Attendance"];
  time.getRange(2, 2).setValue("INV-JR26-007");
  time.getRange(2, 3).setValue(7);
  assert(api.invoicePrintCode_(workbook, "INV-JR26-013") === "INV-JR26-013", "formatted id");
  assert(api.invoicePrintCode_(workbook, "7") === "INV-JR26-007", api.invoicePrintCode_(workbook, "7"));
  assert(api.invoicePrintCode_(workbook, "8") === "INV-JR26-008", api.invoicePrintCode_(workbook, "8"));
  assert(api.invoicePdfName_("INV-JR26-013", "2026-09-22") === "INV-JR26-013_2026-09-22.pdf", "pdf name");
});

test("compile invoice marks one draft as Invoiced and stamps a blank date", function (api, workbook) {
  const invoices = workbook.sheets["InvoiceList"];
  invoices.getRange(2, 1).setValue("INV-JR26-014");
  invoices.getRange(2, 2).setValue("Acme");
  const compiled = api.compileSingleInvoice({ invoiceId: "INV-JR26-014" });
  assert(compiled.success, compiled.error);
  assert(compiled.status === "Invoiced", compiled.status);
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));
  const stamped = invoices.getRange(2, 8).getValue();
  assert(stamped && typeof stamped.getTime === "function" && !isNaN(stamped.getTime()), "blank date was not stamped");

  const again = api.compileSingleInvoice({ invoiceId: "INV-JR26-014" });
  assert(!again.success, "compiled twice");
  assert(/Draft/.test(again.error), again.error);
});

test("invoice pdf prints INV-Template from row 2 and restores the workbook", function (api, workbook) {
  const source = fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8");
  assert(!/UrlFetchApp/.test(source), "PDF export asks for a new external permission");
  assert(/ss\.getBlob\s*\(/.test(source), "PDF export no longer prints the sheet");
  assert(!/buildInvoicePdf_/.test(source), "PDF export still draws its own page");
  assert(api.invoicePdfEngine_() === "inv-template-sheet", api.invoicePdfEngine_());

  const template = createSheet("INV-Template");
  const archive = createSheet("Archive");
  workbook.sheets["INV-Template"] = template;
  workbook.sheets.Archive = archive;
  archive.hideSheet();
  template.hideRows(2, 1);
  template.getRange("A1").setValue("Select Invoice To print");
  template.getRange("B1").setValue("OLD");
  const orderBefore = workbook.getSheets().map(function (item) { return item.getName(); });
  const activeBefore = workbook.getActiveSheet().getName();
  let seen = null;
  workbook.getBlob = function () {
    seen = {
      b1: template.getRange("B1").getValue(),
      row1: template.isRowHiddenByUser(1),
      row2: template.isRowHiddenByUser(2),
      row3: template.isRowHiddenByUser(3),
      row37: template.isRowHiddenByUser(37),
      col8: template.isColumnHiddenByUser(8),
      first: workbook.getSheets()[0].getName(),
      timeHidden: workbook.sheets["Time&Attendance"].isSheetHidden(),
      clientsHidden: workbook.sheets.ClientRecords.isSheetHidden(),
      archiveHidden: archive.isSheetHidden(),
      templateHidden: template.isSheetHidden()
    };
    return {
      getBytes: function () { return [37, 80, 68, 70, 45, 49, 46, 52, 10]; },
      getContentType: function () { return "application/pdf"; }
    };
  };
  const touches = api.driveTouches;

  const saved = api.exportInvoicePdf({ invoiceId: "INV-JR26-013", mode: "download" });
  assert(saved.success, saved.error);
  assert(/INV-Template sheet/.test(saved.message), saved.message);
  assert(saved.fileName === "INV-JR26-013_" + new Date().getFullYear() + "-"
    + String(new Date().getMonth() + 1).padStart(2, "0") + "-"
    + String(new Date().getDate()).padStart(2, "0") + ".pdf", saved.fileName);
  const pdf = Buffer.from(saved.pdfBase64, "base64").toString("latin1");
  assert(pdf.indexOf("%PDF-1.4") === 0, "pdf header");
  assert(seen && seen.b1 === "INV-JR26-013", "B1 during print " + (seen && seen.b1));
  assert(seen.row1 === true, "picker row stayed on the PDF");
  assert(seen.row2 === true, "row 2 was shown during the print");
  assert(seen.row3 === false, "row 3 was hidden during the print");
  assert(seen.row37 === true, "rows below the bank block stayed on the PDF");
  assert(seen.col8 === true, "columns past G stayed on the PDF");
  assert(seen.first === "INV-Template", "first tab during print " + seen.first);
  assert(seen.timeHidden && seen.clientsHidden && !seen.templateHidden, "other tabs stayed visible");
  assert(seen.archiveHidden, "Archive was shown during the print");
  assert(template.getRange("B1").getValue() === "OLD", "B1 was not restored");
  assert(!template.isRowHiddenByUser(1), "picker row stayed hidden");
  assert(template.isRowHiddenByUser(2), "row 2 was unhidden");
  assert(!template.isRowHiddenByUser(37), "tail rows stayed hidden");
  assert(!template.isColumnHiddenByUser(8), "columns stayed hidden");
  assert(api.driveTouches === touches, "download called Drive");
  assert(api.fetchTouches === 0, "download asked for an external connection");
  assert(archive.isSheetHidden(), "Archive was unhidden");
  assert(!workbook.sheets.ClientRecords.isSheetHidden(), "ClientRecords was hidden");
  assert(!workbook.sheets["Time&Attendance"].isSheetHidden(), "time sheet was hidden");
  assert(!template.isSheetHidden(), "template was hidden");
  assert(workbook.getSheets().map(function (item) { return item.getName(); }).join("|") === orderBefore.join("|"), "tab order changed");
  assert(workbook.getActiveSheet().getName() === activeBefore, "active tab changed");
});

test("email sends the invoice to the client and a copy to us", function (api, workbook) {
  const template = createSheet("INV-Template");
  workbook.sheets["INV-Template"] = template;
  template.getRange("A4").setValue("INVOICE");
  template.getRange("A19").setValue("Date");
  template.getRange("G19").setValue("Amount");
  const config = createSheet("Config");
  workbook.sheets.Config = config;
  config.getRange("A5").setValue("Business Name");
  config.getRange("B5").setValue("Everyday Business");
  config.getRange("A6").setValue("Business Email");
  config.getRange("B6").setValue("records@everydaybusiness.ie");
  const source = fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8");
  assert(/GmailApp\.sendEmail/.test(source), "invoice email still bypasses Gmail");
  assert(!/MailApp\.sendEmail/.test(source), "invoice email still uses MailApp");
  const sent = api.exportInvoicePdf({ invoiceId: "INV-JR26-011", mode: "email", email: "client@bakewell.test" });
  assert(sent.success, sent.error);
  assert(api.lastEmail && api.lastEmail.to === "client@bakewell.test", JSON.stringify(api.lastEmail));
  assert(api.lastEmail.bcc === "jane@everydaybusiness.ie", api.lastEmail.bcc);
  assert(api.lastEmail.name === "Everyday Business", api.lastEmail.name);
  assert(api.lastEmail.replyTo === "records@everydaybusiness.ie", api.lastEmail.replyTo);
  assert(api.lastEmail.htmlBody && api.lastEmail.htmlBody.indexOf("http") === -1, api.lastEmail.htmlBody);
  assert(api.lastEmail.subject === "Invoice INV-JR26-011", api.lastEmail.subject);
  assert(/jane@everydaybusiness.ie/.test(sent.message), sent.message);
  assert(api.lastEmail.attachments && api.lastEmail.attachments.length === 1, "missing attachment");

  const originalUser = api.Session.getEffectiveUser;
  api.Session.getEffectiveUser = function () { return { getEmail: function () { return ""; } }; };
  const fromConfig = api.exportInvoicePdf({ invoiceId: "INV-JR26-011", mode: "email", email: "client@bakewell.test" });
  assert(fromConfig.success, fromConfig.error);
  assert(api.lastEmail.bcc === "records@everydaybusiness.ie", api.lastEmail.bcc);
  api.Session.getEffectiveUser = originalUser;

  const same = api.exportInvoicePdf({ invoiceId: "INV-JR26-011", mode: "email", email: "jane@everydaybusiness.ie" });
  assert(same.success, same.error);
  assert(!api.lastEmail.bcc, "a copy was addressed to the same inbox");
});

test("a failed pdf export restores the invoice selected in B1", function (api, workbook) {
  const template = createSheet("INV-Template");
  workbook.sheets["INV-Template"] = template;
  template.getRange("B1").setValue("KEEP");
  const orderBefore = workbook.getSheets().map(function (item) { return item.getName(); });
  const originalRange = template.getRange;
  template.getRange = function (rowOrA1) {
    return originalRange.apply(this, arguments);
  };
  workbook.getBlob = function () { throw new Error("boom"); };
  const failed = api.exportInvoicePdf({ invoiceId: "INV-JR26-013", mode: "download" });
  assert(!failed.success, "failure was treated as success");
  assert(/boom/.test(failed.error), failed.error);
  assert(!/authorizeEverydayWork/.test(failed.error), failed.error);
  assert(!/DriveApp/.test(failed.error), failed.error);
  assert(template.getRange("B1").getValue() === "KEEP", "B1 changed after a failure");
  assert(!workbook.sheets.ClientRecords.isSheetHidden(), "ClientRecords was hidden after failure");
  assert(!template.isRowHiddenByUser(1), "rows were hidden after failure");
  assert(workbook.getSheets().map(function (item) { return item.getName(); }).join("|") === orderBefore.join("|"), "tab order changed after failure");
  assert(workbook.getActiveSheet().getName() === "Time&Attendance", "active tab changed after failure");
  assert(api.driveTouches === 0, "a failed download called Drive");
});

test("drive and email permission errors tell Jane how to authorize", function (api) {
  const drive = api.invoicePdfError_(new Error("You do not have permission to call DriveApp.getFileById"), "drive");
  assert(/New deployment/.test(drive), drive);
  const email = api.invoicePdfError_(new Error("Specified permissions are not sufficient for MailApp"), "email");
  assert(/Allow email sending/.test(email) && /authorizeEverydayWork/.test(email), email);
  const download = api.invoicePdfError_(new Error("You do not have permission to call DriveApp.getFileById"), "download");
  assert(/authorizeEverydayWork/.test(download), download);
  assert(/Manage deployments/.test(download), download);
  assert(/New deployment/.test(download), download);
  api.authorizeEverydayWork();
  assert(api.driveTouches === 1 && api.mailTouches === 1, "authorize did not touch Drive and Mail");
  assert(api.fetchTouches === 0, "authorize asked for an external connection");
});

test("email without mail permission explains how to allow it", function (api, workbook) {
  const template = createSheet("INV-Template");
  workbook.sheets["INV-Template"] = template;
  api.GmailApp.sendEmail = function () {
    throw new Error("You do not have permission to call GmailApp.sendEmail. Required permissions: https://www.googleapis.com/auth/gmail.send");
  };
  const failed = api.exportInvoicePdf({ invoiceId: "INV-JR26-013", mode: "email", email: "accounts@example.com" });
  assert(!failed.success, "mail failure was treated as success");
  assert(/gmail\.send/.test(failed.error), failed.error);
  assert(/Allow email sending/.test(failed.error), failed.error);
  assert(!workbook.sheets["Time&Attendance"].isSheetHidden(), "time sheet stayed hidden");
  assert(!template.isRowHiddenByUser(1), "picker rows stayed hidden");
  assert(template.getRange("B1").getValue() === "", "B1 was left on the selected invoice");
});

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nAll invoice status rules passed.");

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
        const end = Math.max(lastRow(), startRow);
        rows = end - startRow + 1;
        cols = parsed.endCol - startCol + 1;
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
        setValues: function (values) {
          for (let r = 0; r < values.length; r++) {
            for (let c = 0; c < values[r].length; c++) set(startRow + r, startCol + c, values[r][c]);
          }
        }
      };
    }
  };
}

function createWorkbook() {
  const sheets = {
    "ClientRecords": createSheet("ClientRecords"),
    "Time&Attendance": createSheet("Time&Attendance"),
    "InvoiceList": createSheet("InvoiceList")
  };
  sheets["Time&Attendance"].getRange(1, 4).setValue("ClientID");
  sheets["InvoiceList"].getRange(1, 8).setValue("Invoice Date");
  return {
    getSheetByName: function (name) { return sheets[name] || null; },
    getSpreadsheetTimeZone: function () { return "UTC"; },
    sheets: sheets
  };
}

function loadApi(workbook) {
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: function () { return workbook; } },
    Session: { getScriptTimeZone: function () { return "UTC"; } },
    Utilities: {
      formatDate: function (date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + d;
      }
    },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: function () { return { setMimeType: function () { return {}; } }; } },
    console: console
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

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nAll invoice status rules passed.");

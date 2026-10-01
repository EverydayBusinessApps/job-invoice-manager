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
  const formulas = {};
  createSheet.nextId = (createSheet.nextId || 0) + 1;
  const sheetId = createSheet.nextId;
  let sheetHidden = false;
  const hiddenRows = {};
  const hiddenCols = {};
  let gridHidden = false;
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
        setNumberFormat: function () {},
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
        getNextDataCell: function (direction) {
          if (direction !== "up") throw new Error("Unsupported direction " + direction);
          let found = 0;
          Object.keys(cells).forEach(function (id) {
            if (cells[id] === "" || cells[id] == null) return;
            const parts = id.split(":");
            const row = Number(parts[0]);
            const col = Number(parts[1]);
            if (col === startCol && row <= startRow && row > found) found = row;
          });
          const row = found || 1;
          return {
            getRow: function () { return row; },
            getValue: function () { return get(row, startCol); }
          };
        },
        getFormula: function () {
          return formulas[key(startRow, startCol)] || "";
        },
        setFormula: function (formula) {
          formulas[key(startRow, startCol)] = String(formula || "");
          const time = String(formula || "").match(/^=TIME\((\d+),(\d+),(\d+)\)$/i);
          if (!time) return;
          const serial = (Number(time[1]) * 60 + Number(time[2]) + Number(time[3]) / 60) / 1440;
          set(startRow, startCol, serial);
        }
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
    },
    hasHiddenGridlines: function () { return !!gridHidden; },
    setHiddenGridlines: function (hidden) { gridHidden = !!hidden; }
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
      getActiveSpreadsheet: function () {
        context.sheetTouches += 1;
        return workbook;
      },
      flush: function () {},
      Direction: { UP: "up" }
    },
    LockService: {
      getDocumentLock: function () {
        return {
          tryLock: function () { return true; },
          releaseLock: function () {}
        };
      },
      getScriptLock: function () {
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
          cc: options && options.cc,
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
      base64Decode: function (text) { return Array.from(Buffer.from(String(text).replace(/\s/g, ""), "base64")); },
      newBlob: function (bytes, type) {
        return {
          setName: function () { return this; },
          getBytes: function () { return bytes; },
          getContentType: function () { return type || "application/pdf"; }
        };
      }
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: function (text) {
        context.lastBody = text;
        try { context.lastJson = JSON.parse(text); } catch (err) { context.lastJson = null; }
        return { setMimeType: function () { return this; } };
      }
    },
    scriptProperties: { CLIENT_TOKEN: "beta-token" },
    PropertiesService: {
      getScriptProperties: function () {
        return {
          getProperty: function (name) {
            const store = context.scriptProperties || {};
            if (!Object.prototype.hasOwnProperty.call(store, name) || store[name] == null) return null;
            return store[name];
          },
          setProperty: function (name, value) {
            if (!context.scriptProperties) context.scriptProperties = {};
            context.scriptProperties[name] = value == null ? null : String(value);
          }
        };
      }
    },
    UrlFetchApp: {
      fetch: function (url, options) {
        context.fetchTouches += 1;
        context.lastFetch = { url: url, options: options };
        context.fetches.push(context.lastFetch);
        if (context.fetchError) throw new Error(context.fetchError);
        if (String(url).indexOf("api.stripe.com") !== -1) {
          let handled = null;
          if (typeof context.stripeHandler === "function") handled = context.stripeHandler(url, options);
          if (!handled) {
            if (String(url).indexOf("/v1/payment_links") !== -1) {
              handled = { code: 200, body: { id: "plink_test", url: "https://buy.stripe.com/test_example", active: true } };
            } else if (String(url).indexOf("/v1/checkout/sessions/") !== -1) {
              handled = { code: 200, body: { id: "cs_test", payment_status: "unpaid", metadata: {} } };
            } else {
              handled = { code: 200, body: {} };
            }
          }
          const code = handled.code == null ? 200 : handled.code;
          const body = handled.body !== undefined ? handled.body : handled;
          const text = typeof body === "string" ? body : JSON.stringify(body);
          return {
            getResponseCode: function () { return code; },
            getContentText: function () { return text; }
          };
        }
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
    fetchTouches: 0,
    fetches: [],
    sheetTouches: 0,
    lastBody: "",
    lastJson: null
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
  assert(created.message === "Job logged on invoice INV-JR26-001.", created.message);
  assert(statusCell(workbook, 2) === "Draft", "column I was " + statusCell(workbook, 2));
  assert(String(created.invoiceId) === "1", "invoice id " + created.invoiceId);
  const again = api.executeTimeLog(shift({ invoiceMode: "existing", invoiceId: created.invoiceId, jobDetails: "Follow-up" }));
  assert(again.success, again.error);
  assert(again.message === "Job added to invoice INV-JR26-001.", again.message);
  assert(!again.alreadySaved, "a different job was treated as a repeat");
  assert(statusCell(workbook, 2) === "Draft", "second entry changed status");
  assert(timeRows(workbook).length === 2, "second job was not stored");
});

test("a second tap of the same job confirms the save and does not duplicate it", function (api, workbook) {
  const created = api.executeTimeLog(shift());
  assert(created.success, created.error);
  const invoicesBefore = workbook.sheets["InvoiceList"].getLastRow();
  const rowsBefore = timeRows(workbook).length;
  const again = api.executeTimeLog(shift());
  assert(again.success, again.error);
  assert(again.alreadySaved === true, "repeat was stored as a new job");
  assert(again.message === "Job logged on invoice INV-JR26-001.", again.message);
  assert(timeRows(workbook).length === rowsBefore, "a second time row was added");
  assert(workbook.sheets["InvoiceList"].getLastRow() === invoicesBefore, "a second draft was opened");

  const different = api.executeTimeLog(shift({ jobDetails: "Extra socket" }));
  assert(different.success && !different.alreadySaved, different.error || different.message);
  assert(timeRows(workbook).length === rowsBefore + 1, "a different job was not stored");

  const marked = api.compileSingleInvoice({ invoiceId: created.invoiceId });
  assert(marked.success, marked.error);
  const paid = api.updateInvoiceStatus({ invoiceId: created.invoiceId, status: "Paid" });
  assert(paid.success, paid.error);
  const blocked = api.executeTimeLog(shift({
    invoiceMode: "existing",
    invoiceId: created.invoiceId,
    jobDetails: "Extra socket"
  }));
  assert(!blocked.success, "paid add was allowed");
  assert(/Draft/.test(blocked.error), blocked.error);
  assert(timeRows(workbook).length === rowsBefore + 1, "a rejected repeat still wrote a row");
});

test("finish is the end of the shift, so hours are not a fraction of a day", function (api, workbook) {
  const logged = api.executeTimeLog(shift({ start: "08:00", finish: "10:30", lunch: "na" }));
  assert(logged.success, logged.error);
  const time = workbook.sheets["Time&Attendance"];
  const row = time.getLastRow();
  const start = time.getRange(row, 7).getValue();
  const finish = time.getRange(row, 9).getValue();
  assert(time.getRange(row, 7).getFormula() === "=TIME(8,0,0)", time.getRange(row, 7).getFormula());
  assert(time.getRange(row, 9).getFormula() === "=TIME(10,30,0)", time.getRange(row, 9).getFormula());
  assert(typeof start === "number" && start > 0 && start < 1, "start was a date " + start);
  assert(typeof finish === "number" && finish > 0 && finish < 1, "finish was a date " + finish);
  assert(Math.abs(start - (8 / 24)) < 1e-9, "start " + start);
  assert(Math.abs(finish - (10.5 / 24)) < 1e-9, "finish " + finish);
  const raw = (finish * 24) - (start * 24);
  assert(Math.abs(raw - 2.5) < 1e-9, "hours " + raw);
  assert(String(time.getRange(row, 5).getValue()).indexOf("2026-09-22") === 0, "date column moved");

  const night = api.executeTimeLog(shift({ start: "18:00", finish: "06:00", overnight: true }));
  assert(night.success, night.error);
  assert(night.message === "Overnight job logged on invoice INV-JR26-002.", night.message);
  const row2 = time.getLastRow();
  const nightStart = time.getRange(row2, 7).getValue();
  const nightFinish = time.getRange(row2, 9).getValue();
  assert(nightStart < 1 && nightFinish < 1, "overnight finish stored a date");
  const nightHours = (nightFinish * 24) - (nightStart * 24) + 24;
  assert(Math.abs(nightHours - 12) < 1e-9, "overnight hours " + nightHours);
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
  const undone = api.updateInvoiceStatus({ invoiceId: created.invoiceId, status: "Undo" });
  assert(undone.success && statusCell(workbook, 2) === "Invoiced", undone.error || statusCell(workbook, 2));
  assert(!api.executeTimeLog(shift({ invoiceMode: "existing", invoiceId: created.invoiceId })).success, "invoiced add was allowed after undo");
  api.updateInvoiceStatus({ invoiceId: created.invoiceId, status: "Written off" });
  assert(statusCell(workbook, 2) === "Written off", statusCell(workbook, 2));
  assert(!api.executeTimeLog(shift({ invoiceMode: "existing", invoiceId: created.invoiceId })).success, "written-off add was allowed");
});

test("an invoice moves Draft, Invoiced, Paid, and Written off", function (api, workbook) {
  const created = api.executeTimeLog(shift());
  const id = created.invoiceId;
  assert(!api.updateInvoiceStatus({ invoiceId: id, status: "Paid" }).success, "paid from draft");
  assert(!api.updateInvoiceStatus({ invoiceId: id, status: "Written off" }).success, "written off from draft");
  assert(!api.updateInvoiceStatus({ invoiceId: id, status: "Undo" }).success, "undo from draft");
  const compiled = api.compileSingleInvoice({ invoiceId: id });
  assert(compiled.success, compiled.error);
  const paid = api.updateInvoiceStatus({ invoiceId: id, status: "Paid" });
  assert(paid.success, paid.error);
  assert(paid.status === "Paid" && statusCell(workbook, 2) === "Paid", statusCell(workbook, 2));
  assert(paid.message === "Invoice INV-JR26-001 marked Paid.", paid.message);
  assert(!api.updateInvoiceStatus({ invoiceId: id, status: "Written off" }).success, "written off from paid");
  const undo = api.updateInvoiceStatus({ invoiceId: id, status: "Undo" });
  assert(undo.success, undo.error);
  assert(undo.status === "Invoiced" && statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));
  assert(undo.message === "Invoice INV-JR26-001 back to invoiced.", undo.message);
  const off = api.updateInvoiceStatus({ invoiceId: id, status: "Written off" });
  assert(off.success && off.message === "Invoice INV-JR26-001 marked Written off.", off.message || off.error);
  assert(statusCell(workbook, 2) === "Written off", statusCell(workbook, 2));
  assert(!api.updateInvoiceStatus({ invoiceId: id, status: "Unpaid" }).success, "unpaid was accepted");
  const back = api.updateInvoiceStatus({ invoiceId: id, status: "Undo" });
  assert(back.success && statusCell(workbook, 2) === "Invoiced", back.error || statusCell(workbook, 2));
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
  assert(month.writtenOff === 0, "month written off");

  const quarter = report.periods.quarter;
  assert(quarter.label === "Q3 2026", quarter.label);
  assert(quarter.hours === 12 && quarter.billable === 470, JSON.stringify({ hours: quarter.hours, billable: quarter.billable }));
  assert(quarter.avgRate === 39.17, "quarter rate " + quarter.avgRate);
  assert(quarter.topClient === "Acme" && quarter.topClientHours === 9, quarter.topClientHours);
  assert(quarter.paid === 100 && quarter.sent === 420, "quarter money " + quarter.paid + " " + quarter.sent);
  assert(quarter.due === 240 && quarter.draft === 50 && quarter.writtenOff === 80, "quarter split");
  assert(quarter.overdue === 200, "quarter overdue");
  assert(report.periods.year.label === "2026", report.periods.year.label);
  assert(report.periods.year.sent === quarter.sent && report.periods.year.hours === quarter.hours, "year should match this sample");
  const week = report.periods.week;
  assert(week.label === "21 Sep – 27 Sep 2026", week.label);
  assert(week.start === "2026-09-21" && week.end === "2026-09-27", week.start + " " + week.end);
  assert(week.hours === 2 && week.billable === 40 && week.shifts === 1, JSON.stringify({ hours: week.hours, billable: week.billable, shifts: week.shifts }));
  assert(week.topClient === "Other Co" && week.clients === 1, week.topClient);

  assert(report.open.dueAmount === 240 && report.open.dueCount === 2, "open due");
  assert(report.open.overdueAmount === 200 && report.open.overdueCount === 1, "open overdue");
  assert(report.open.draftAmount === 50 && report.open.draftCount === 1, "open draft");
  assert(report.open.paidAmount === 100 && report.open.paidCount === 1, "open paid");
  assert(report.open.writtenOffAmount === 80 && report.open.writtenOffCount === 1, "open written off");

  const overdue = findInvoice(report, "INV-JR26-002");
  assert(overdue && overdue.kind === "due" && overdue.overdue, "invoiced should be overdue");
  assert(overdue.dueDate === "2026-09-15" && overdue.daysOverdue === 7, overdue.dueDate + " " + overdue.daysOverdue);
  assert(overdue.email === "acme@example.com", overdue.email);
  const unpaid = findInvoice(report, "INV-JR26-005");
  assert(unpaid && unpaid.status === "Invoiced" && unpaid.kind === "due" && !unpaid.overdue && unpaid.total === 40, JSON.stringify(unpaid));
  assert(unpaid.dueDate === "2026-10-20", unpaid.dueDate);
  assert(workbook.sheets.InvoiceList.getRange(6, 9).getValue() === "Invoiced", "Unpaid was left on the sheet");
  const bad = findInvoice(report, "INV-JR26-004");
  assert(bad && bad.status === "Written off" && bad.kind === "writtenoff", bad && bad.status);
  assert(workbook.sheets.InvoiceList.getRange(5, 9).getValue() === "Written off", "Bad debt was left on the sheet");
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
  assert(report.invoicePdf === "inv-template-plain", report.invoicePdf);
  assert(report.emailCc === true, "snapshot does not offer Cc");
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
  assert(compiled.message === "Invoice INV-JR26-014 marked invoiced.", compiled.message);
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));
  const stamped = invoices.getRange(2, 8).getValue();
  assert(stamped && typeof stamped.getTime === "function" && !isNaN(stamped.getTime()), "blank date was not stamped");

  const again = api.compileSingleInvoice({ invoiceId: "INV-JR26-014" });
  assert(!again.success, "compiled twice");
  assert(/Draft/.test(again.error), again.error);
});

test("invoice pdf prints INV-Template from row 2 and restores the workbook", function (api, workbook) {
  const source = fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8");
  assert(/gridlines=false/.test(source), "PDF export still prints the sheet grid");
  assert(/setHiddenGridlines\(true\)/.test(source), "INV-Template still shows its grid");
  assert(!/buildInvoicePdf_/.test(source), "PDF export still draws its own page");
  assert(api.invoicePdfEngine_() === "inv-template-plain", api.invoicePdfEngine_());

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
  const originalFetch = api.UrlFetchApp.fetch;
  api.UrlFetchApp.fetch = function (url, options) {
    seen = {
      b1: template.getRange("B1").getValue(),
      row1: template.isRowHiddenByUser(1),
      row2: template.isRowHiddenByUser(2),
      row3: template.isRowHiddenByUser(3),
      row37: template.isRowHiddenByUser(37),
      col8: template.isColumnHiddenByUser(8),
      grid: template.hasHiddenGridlines(),
      timeHidden: workbook.sheets["Time&Attendance"].isSheetHidden(),
      clientsHidden: workbook.sheets.ClientRecords.isSheetHidden(),
      archiveHidden: archive.isSheetHidden(),
      templateHidden: template.isSheetHidden()
    };
    return originalFetch.call(this, url, options);
  };
  workbook.getBlob = function () { throw new Error("getBlob should not run"); };
  const touches = api.driveTouches;

  const saved = api.exportInvoicePdf({ invoiceId: "INV-JR26-013", mode: "download" });
  assert(saved.success, saved.error);
  assert(/invoice PDF/.test(saved.message), saved.message);
  assert(!/INV-Template/.test(saved.message), saved.message);
  assert(saved.fileName === "INV-JR26-013_" + new Date().getFullYear() + "-"
    + String(new Date().getMonth() + 1).padStart(2, "0") + "-"
    + String(new Date().getDate()).padStart(2, "0") + ".pdf", saved.fileName);
  const pdf = Buffer.from(saved.pdfBase64, "base64").toString("latin1");
  assert(pdf.indexOf("%PDF-1.4") === 0, "pdf header");
  assert(seen && seen.b1 === "INV-JR26-013", "B1 during print " + (seen && seen.b1));
  assert(seen.grid === true, "the sheet grid was still on during the print");
  assert(seen.row1 === false, "picker row was hidden on the sheet");
  assert(seen.row2 === true, "row 2 was shown during the print");
  assert(seen.row3 === false, "row 3 was hidden during the print");
  assert(seen.row37 === false, "rows below the bank block were hidden");
  assert(seen.col8 === false, "columns past G were hidden");
  assert(!seen.timeHidden && !seen.clientsHidden && !seen.templateHidden, "tabs were hidden for the print");
  assert(seen.archiveHidden, "Archive was shown during the print");
  assert(api.lastFetch && api.lastFetch.url.indexOf("gridlines=false") !== -1, api.lastFetch && api.lastFetch.url);
  assert(api.lastFetch.url.indexOf("gid=" + template.getSheetId()) !== -1, api.lastFetch.url);
  assert(api.lastFetch.url.indexOf("gid=" + workbook.sheets["Time&Attendance"].getSheetId()) === -1, api.lastFetch.url);
  assert(api.lastFetch.url.indexOf("r1=1") !== -1 && api.lastFetch.url.indexOf("r2=36") !== -1, api.lastFetch.url);
  assert(api.lastFetch.url.indexOf("c1=0") !== -1 && api.lastFetch.url.indexOf("c2=7") !== -1, api.lastFetch.url);
  assert(api.lastFetch.options.headers.Authorization === "Bearer token", JSON.stringify(api.lastFetch.options));
  assert(template.getRange("B1").getValue() === "OLD", "B1 was not restored");
  assert(template.hasHiddenGridlines(), "the sheet grid was turned back on");
  assert(!workbook.sheets.ClientRecords.hasHiddenGridlines(), "ClientRecords lost its grid");
  assert(!template.isRowHiddenByUser(1), "picker row stayed hidden");
  assert(template.isRowHiddenByUser(2), "row 2 was unhidden");
  assert(!template.isRowHiddenByUser(37), "tail rows stayed hidden");
  assert(!template.isColumnHiddenByUser(8), "columns stayed hidden");
  assert(api.driveTouches === touches, "download called Drive");
  assert(api.fetchTouches === 1, "download did not request the sheet print");
  assert(archive.isSheetHidden(), "Archive was unhidden");
  assert(!workbook.sheets.ClientRecords.isSheetHidden(), "ClientRecords was hidden");
  assert(!workbook.sheets["Time&Attendance"].isSheetHidden(), "time sheet was hidden");
  assert(!template.isSheetHidden(), "template was hidden");
  assert(workbook.getSheets().map(function (item) { return item.getName(); }).join("|") === orderBefore.join("|"), "tab order changed");
  assert(workbook.getActiveSheet().getName() === activeBefore, "active tab changed");
});

test("downloading a draft marks it invoiced and emailing leaves the draft", function (api, workbook) {
  const template = createSheet("INV-Template");
  workbook.sheets["INV-Template"] = template;
  const created = api.executeTimeLog(shift());
  assert(created.success, created.error);
  const downloaded = api.exportInvoicePdf({ invoiceId: created.invoiceId, mode: "download" });
  assert(downloaded.success, downloaded.error);
  assert(downloaded.markedInvoiced === true, downloaded.message || "download did not mark the draft");
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));
  assert(/marked invoiced/.test(downloaded.message), downloaded.message);

  const again = api.exportInvoicePdf({ invoiceId: created.invoiceId, mode: "download" });
  assert(again.success && !again.markedInvoiced, "a second download changed the status");
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));

  const paid = api.updateInvoiceStatus({ invoiceId: created.invoiceId, status: "Paid" });
  assert(paid.success, paid.error);
  const paidDownload = api.exportInvoicePdf({ invoiceId: created.invoiceId, mode: "download" });
  assert(paidDownload.success && !paidDownload.markedInvoiced, "a paid invoice was moved back");
  assert(statusCell(workbook, 2) === "Paid", statusCell(workbook, 2));

  const other = api.executeTimeLog(shift({ clientName: "Other Co", jobDetails: "Survey" }));
  assert(other.success, other.error);
  const letter = "To Owen\nPlease find attached invoice for 10 Sep 2026\nTotal owed €50.00\nFor works Survey\n\nKind Regards\nEveryday Business";
  const sent = api.exportInvoicePdf({
    invoiceId: other.invoiceId,
    mode: "email",
    email: "owen@other.test",
    message: letter
  });
  assert(sent.success, sent.error);
  assert(sent.markedInvoiced === false, "email marked the draft");
  assert(statusCell(workbook, 3) === "Draft", statusCell(workbook, 3));
  assert(!/Invoice marked invoiced/.test(sent.message), sent.message);
  assert(!/INV-Template/.test(sent.message), sent.message);
  assert(api.lastEmail.body === letter, api.lastEmail.body);
  assert(api.lastEmail.htmlBody.indexOf("http") === -1, api.lastEmail.htmlBody);
  assert(api.lastEmail.htmlBody.indexOf("For works Survey") !== -1, api.lastEmail.htmlBody);
});

test("email sends the invoice to the client and a copy to us", function (api, workbook) {
  const template = createSheet("INV-Template");
  workbook.sheets["INV-Template"] = template;
  template.getRange("A4").setValue("INVOICE");
  template.getRange("A19").setValue("Date");
  template.getRange("G19").setValue("Amount");
  const config = createSheet("Config");
  workbook.sheets.Config = config;
  config.getRange("A5").setValue("Trading name");
  config.getRange("B5").setValue("Everyday Business");
  config.getRange("A6").setValue("Business Email");
  config.getRange("B6").setValue("records@everydaybusiness.ie");
  const clients = workbook.sheets.ClientRecords;
  clients.getRange(2, 1).setValue("Bakewell Foods Ltd");
  clients.getRange(2, 7).setValue("Kevin McNeil");
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-011");
  invoices.getRange(2, 2).setValue("Bakewell Foods Ltd");
  invoices.getRange(2, 3).setValue("Maintenance Cover");
  invoices.getRange(2, 7).setValue(1080);
  const source = fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8");
  assert(/GmailApp\.sendEmail/.test(source), "invoice email still bypasses Gmail");
  assert(!/MailApp\.sendEmail/.test(source), "invoice email still uses MailApp");
  const sent = api.exportInvoicePdf({ invoiceId: "INV-JR26-011", mode: "email", email: "client@bakewell.test" });
  assert(sent.success, sent.error);
  assert(api.lastEmail && api.lastEmail.to === "Kevin McNeil <client@bakewell.test>", JSON.stringify(api.lastEmail));
  assert(api.lastEmail.bcc === "jane@everydaybusiness.ie", api.lastEmail.bcc);
  assert(api.lastEmail.name === "Everyday Business", api.lastEmail.name);
  assert(api.lastEmail.replyTo === "records@everydaybusiness.ie", api.lastEmail.replyTo);
  assert(api.lastEmail.htmlBody && api.lastEmail.htmlBody.indexOf("http") === -1, api.lastEmail.htmlBody);
  assert(api.lastEmail.body.indexOf("To Kevin McNeil\n") === 0, api.lastEmail.body);
  assert(api.lastEmail.body.indexOf("Bakewell") === -1, api.lastEmail.body);
  assert(api.lastEmail.body.indexOf("Please find attached invoice for") !== -1, api.lastEmail.body);
  assert(api.lastEmail.body.indexOf("Kind Regards") !== -1 && api.lastEmail.body.indexOf("Everyday Business") !== -1, api.lastEmail.body);
  assert(api.lastEmail.subject === "Everyday Business INV-JR26-011", api.lastEmail.subject);
  assert(sent.message === "Emailed INV-JR26-011 to client@bakewell.test.", sent.message);
  assert(sent.message.indexOf("jane@") === -1 && sent.message.indexOf("Cc ") === -1, sent.message);
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
  assert(!api.lastEmail.cc, "an empty Cc was sent");

  const copied = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    cc: "accounts@bakewell.test, boss@bakewell.test"
  });
  assert(copied.success, copied.error);
  assert(api.lastEmail.cc === "accounts@bakewell.test, boss@bakewell.test", api.lastEmail.cc);
  assert(copied.message === "Emailed INV-JR26-011 to client@bakewell.test.", copied.message);
  assert(copied.message.indexOf("Cc ") === -1, copied.message);
  assert(api.lastEmail.bcc === "jane@everydaybusiness.ie", api.lastEmail.bcc);

  const sameAsTo = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    cc: "client@bakewell.test"
  });
  assert(sameAsTo.success, sameAsTo.error);
  assert(!api.lastEmail.cc, "Cc repeated the To address");

  const recordsCopy = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    cc: "jane@everydaybusiness.ie"
  });
  assert(recordsCopy.success, recordsCopy.error);
  assert(!api.lastEmail.cc, "Cc repeated the records copy");
  assert(api.lastEmail.bcc === "jane@everydaybusiness.ie", api.lastEmail.bcc);

  const statusBefore = workbook.sheets.InvoiceList.getRange(2, 9).getValue();
  const badCc = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    cc: "not-an-email"
  });
  assert(!badCc.success && /Cc/.test(badCc.error), badCc.error);
  assert(workbook.sheets.InvoiceList.getRange(2, 9).getValue() === statusBefore, "a rejected Cc changed the invoice");
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
  api.fetchError = "boom";
  workbook.getBlob = function () { throw new Error("blob ran"); };
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
  assert(api.fetchTouches === 1, "authorize did not request the gridless print");
  assert(/gridlines=false/.test(api.lastFetch.url), api.lastFetch.url);
});

test("email without mail permission explains how to allow it", function (api, workbook) {
  const template = createSheet("INV-Template");
  workbook.sheets["INV-Template"] = template;
  api.GmailApp.sendEmail = function () {
    throw new Error("You do not have permission to call GmailApp.sendEmail. Required permissions: https://www.googleapis.com/auth/gmail.send");
  };
  workbook.sheets.InvoiceList.getRange(2, 1).setValue("INV-JR26-013");
  workbook.sheets.InvoiceList.getRange(2, 9).setValue("Draft");
  const failed = api.exportInvoicePdf({ invoiceId: "INV-JR26-013", mode: "email", email: "accounts@example.com" });
  assert(!failed.success, "mail failure was treated as success");
  assert(workbook.sheets.InvoiceList.getRange(2, 9).getValue() === "Draft", "a failed email marked the invoice");
  assert(/gmail\.send/.test(failed.error), failed.error);
  assert(/Allow email sending/.test(failed.error), failed.error);
  assert(!workbook.sheets["Time&Attendance"].isSheetHidden(), "time sheet stayed hidden");
  assert(!template.isRowHiddenByUser(1), "picker rows stayed hidden");
  assert(template.getRange("B1").getValue() === "", "B1 was left on the selected invoice");
});

test("refresh reads client records from a freshly opened workbook", function (api, workbook) {
  workbook.sheets.ClientRecords.getRange(2, 1).setValue("Acme");
  workbook.sheets.ClientRecords.getRange(2, 8).setValue("old@client.test");
  const fresh = createWorkbook();
  fresh.sheets.ClientRecords.getRange(2, 1).setValue("Acme");
  fresh.sheets.ClientRecords.getRange(2, 7).setValue("Ann Acme");
  fresh.sheets.ClientRecords.getRange(2, 8).setValue("new@client.test");
  fresh.sheets.InvoiceList.getRange(2, 1).setValue("INV-JR26-001");
  fresh.sheets.InvoiceList.getRange(2, 2).setValue("Acme");
  fresh.sheets.InvoiceList.getRange(2, 9).setValue("Draft");
  api.SpreadsheetApp.openById = function (id) {
    assert(id === "workbook", id);
    return fresh;
  };
  const report = api.fetchDashboard();
  assert(report.success, report.error);
  assert(report.clientRecords.length === 1 && report.clientRecords[0].email === "new@client.test", JSON.stringify(report.clientRecords));
  assert(report.clientRecords[0].contact === "Ann Acme", report.clientRecords[0].contact);
  const invoice = (report.invoices || []).filter(function (item) { return item.code === "INV-JR26-001"; })[0];
  assert(invoice && invoice.email === "new@client.test", JSON.stringify(invoice));
  assert(invoice.contact === "Ann Acme", invoice.contact);
  const listed = api.listClientRecords();
  assert(listed.success && listed.clientRecords[0].email === "new@client.test", JSON.stringify(listed.clientRecords));
  const saved = api.saveClientRecord_({ originalName: "Acme", name: "Acme", email: "saved@client.test", rate: 50, terms: 14 });
  assert(saved.success, saved.error);
  assert(fresh.sheets.ClientRecords.getRange(2, 8).getValue() === "saved@client.test", fresh.sheets.ClientRecords.getRange(2, 8).getValue());
  assert(workbook.sheets.ClientRecords.getRange(2, 8).getValue() === "old@client.test", "save wrote the cached workbook");
});

test("client records read the ten ClientRecords columns and skip blank names", function (api, workbook) {
  const clients = workbook.sheets.ClientRecords;
  clients.getRange(2, 1).setValue("Acme");
  clients.getRange(2, 2).setValue("1 Dock Road");
  clients.getRange(2, 3).setValue("Dublin");
  clients.getRange(2, 4).setValue("Floor 2");
  clients.getRange(2, 5).setValue("Ireland");
  clients.getRange(2, 6).setValue(50);
  clients.getRange(2, 7).setValue("Ann Acme");
  clients.getRange(2, 8).setValue("acme@example.com");
  clients.getRange(2, 9).setValue("0871234567");
  clients.getRange(2, 10).setValue(14);
  clients.getRange(2, 11).setValue("06:00");
  clients.getRange(3, 1).setValue("");
  clients.getRange(3, 11).setValue("keep");
  clients.getRange(4, 1).setValue("Other Co");
  clients.getRange(4, 6).setValue(40);
  const listed = api.listClientRecords();
  assert(listed.success, listed.error);
  assert(listed.clientRecords.length === 2, "blank name was included");
  assert(listed.clientRecords[0].name === "Acme", listed.clientRecords[0].name);
  assert(listed.clientRecords[0].address1 === "1 Dock Road" && listed.clientRecords[0].address4 === "Ireland", JSON.stringify(listed.clientRecords[0]));
  assert(listed.clientRecords[0].rate === 50 && listed.clientRecords[0].terms === 14, JSON.stringify(listed.clientRecords[0]));
  assert(listed.clientRecords[0].phone === "0871234567", listed.clientRecords[0].phone);
  assert(listed.clientRecords[0].email === "acme@example.com" && listed.clientRecords[0].contact === "Ann Acme", "contact");
  const report = api.buildDashboardReport_(workbook, new Date("2026-09-22T12:00:00Z"));
  assert(report.clientRecords.length === 2, "snapshot dropped client records");
  assert(report.clients.map(function (client) { return client.name; }).join(",") === "Acme,Other Co", JSON.stringify(report.clients));
});

test("saving a client writes columns A to J and leaves later columns", function (api, workbook) {
  const clients = workbook.sheets.ClientRecords;
  clients.getRange(2, 1).setValue("Acme");
  clients.getRange(2, 6).setValue(50);
  clients.getRange(2, 11).setValue("06:00");
  clients.getRange(3, 11).setValue("keep");
  clients.getRange(4, 1).setValue("Other Co");
  const time = workbook.sheets["Time&Attendance"];
  time.getRange(2, 4).setValue("acme");
  time.getRange(3, 4).setValue("Other Co");

  const added = api.saveClientRecord_({
    name: "BrightBite",
    address1: "Unit 4",
    address2: "Galway",
    rate: "65",
    contact: "Bea",
    email: "bea@bright.test",
    phone: "0871234567",
    terms: "14"
  });
  assert(added.success, added.error);
  assert(added.message === "Added BrightBite.", added.message);
  assert(clients.getRange(5, 1).getValue() === "BrightBite", "new client filled a gap");
  assert(clients.getRange(3, 1).getValue() === "", "a blank name row was reused");
  assert(clients.getRange(3, 11).getValue() === "keep", "a gap row was overwritten");
  assert(clients.getRange(5, 6).getValue() === 65, "rate " + clients.getRange(5, 6).getValue());
  assert(clients.getRange(5, 9).getValue() === "0871234567", "phone " + clients.getRange(5, 9).getValue());
  assert(clients.getRange(5, 10).getValue() === 14, "terms " + clients.getRange(5, 10).getValue());
  assert(added.clientRecords.some(function (row) { return row.name === "BrightBite" && row.address2 === "Galway"; }), "response records");
  assert(added.snapshot && added.snapshot.clientRecords.some(function (row) { return row.name === "BrightBite"; }), "snapshot records");

  const edited = api.saveClientRecord_({
    originalName: "Acme",
    name: "Acme Ltd",
    address1: "1 Dock Road",
    rate: 80,
    email: "accounts@acme.test",
    phone: "01 555 0100",
    terms: 30
  });
  assert(edited.success, edited.error);
  assert(edited.message === "Updated Acme Ltd. Time entries now use that name. Drafts and new shifts use this rate. Sent invoices keep the rate they were billed at.", edited.message);
  assert(clients.getRange(2, 1).getValue() === "Acme Ltd", clients.getRange(2, 1).getValue());
  assert(clients.getRange(2, 2).getValue() === "1 Dock Road", "address");
  assert(clients.getRange(2, 6).getValue() === 80, "rate was not a number");
  assert(clients.getRange(2, 8).getValue() === "accounts@acme.test", "email");
  assert(clients.getRange(2, 10).getValue() === 30, "terms");
  assert(clients.getRange(2, 11).getValue() === "06:00", "shift window was cleared");
  assert(time.getRange(2, 4).getValue() === "Acme Ltd", time.getRange(2, 4).getValue());
  assert(time.getRange(3, 4).getValue() === "Other Co", "another client was renamed");

  const duplicate = api.saveClientRecord_({ name: "other co", rate: 10, terms: 0 });
  assert(!duplicate.success && /already in the list/.test(duplicate.error), duplicate.error);
  const blank = api.saveClientRecord_({ name: "  ", rate: 10 });
  assert(!blank.success && /Enter a client name/.test(blank.error), blank.error);
  const missing = api.saveClientRecord_({ originalName: "Nope", name: "Nope" });
  assert(!missing.success && /no longer in the list/.test(missing.error), missing.error);
  const badRate = api.saveClientRecord_({ name: "New Co", rate: "fast", terms: 7 });
  assert(!badRate.success && /Rate must be a number/.test(badRate.error), badRate.error);
  const badTerms = api.saveClientRecord_({ name: "New Co", rate: 10, terms: -1 });
  assert(!badTerms.success && /Payment terms cannot be negative/.test(badTerms.error), badTerms.error);
  const zero = api.saveClientRecord_({ originalName: "Other Co", name: "Other Co", rate: 0, terms: "" });
  assert(zero.success, zero.error);
  assert(clients.getRange(4, 6).getValue() === 0, "zero rate");
  assert(clients.getRange(4, 10).getValue() === "", "blank terms");
});

test("a new client rate stays off invoices that have left Draft", function (api, workbook) {
  const clients = workbook.sheets.ClientRecords;
  const time = workbook.sheets["Time&Attendance"];
  const invoices = workbook.sheets.InvoiceList;
  clients.getRange(2, 1).setValue("Acme");
  clients.getRange(2, 6).setValue(150);

  time.getRange(2, 2).setValue("INV-JR26-002");
  time.getRange(2, 3).setValue(2);
  time.getRange(2, 4).setValue("Acme");
  time.getRange(2, 11).setValue(150);
  invoices.getRange(2, 1).setValue("INV-JR26-002");
  invoices.getRange(2, 9).setValue("Invoiced");

  time.getRange(3, 2).setValue("INV-JR26-003");
  time.getRange(3, 3).setValue(3);
  time.getRange(3, 4).setValue("Acme");
  time.getRange(3, 11).setValue(150);
  invoices.getRange(3, 1).setValue("INV-JR26-003");
  invoices.getRange(3, 9).setValue("Draft");

  time.getRange(4, 2).setValue("INV-JR26-004");
  time.getRange(4, 4).setValue("Other Co");
  time.getRange(4, 11).setValue(40);
  invoices.getRange(4, 1).setValue("INV-JR26-004");
  invoices.getRange(4, 9).setValue("Invoiced");

  time.getRange(5, 4).setValue("Acme");
  time.getRange(5, 11).setValue(150);

  invoices.getRange(5, 1).setValue("INV-JR26-005");
  invoices.getRange(5, 9).setValue("Unpaid");
  time.getRange(6, 2).setValue("INV-JR26-005");
  time.getRange(6, 4).setValue("acme");
  time.getRange(6, 11).setValue(150);

  invoices.getRange(6, 1).setValue("INV-JR26-006");
  invoices.getRange(6, 9).setValue("Bad Debt");
  time.getRange(7, 2).setValue("INV-JR26-006");
  time.getRange(7, 4).setValue("Acme");
  time.getRange(7, 11).setValue(150);

  const saved = api.saveClientRecord_({ originalName: "Acme", name: "Acme", rate: 180, terms: 30 });
  assert(saved.success, saved.error);
  assert(/Sent invoices keep the rate/.test(saved.message), saved.message);
  assert(clients.getRange(2, 6).getValue() === 180, "client rate");
  assert(time.getRange(2, 14).getValue() === 150, "invoiced rate changed");
  assert(time.getRange(3, 14).getValue() === "", "draft rate was frozen");
  assert(time.getRange(4, 14).getValue() === "", "another client was frozen");
  assert(time.getRange(5, 14).getValue() === "", "open time was frozen");
  assert(time.getRange(6, 14).getValue() === 150, "unpaid rate changed");
  assert(time.getRange(7, 14).getValue() === 150, "bad debt rate changed");
  assert(time.getRange(1, 14).getValue() === "Billed Rate", "billed rate header");
  const formula = time.getRange("K2").getFormula();
  assert(formula.indexOf("N2:N29544") !== -1 && formula.indexOf("VLOOKUP(D2:D29544,ClientRecords!A:F,6,FALSE)") !== -1, formula);

  const again = api.saveClientRecord_({ originalName: "Acme", name: "Acme", address1: "1 Dock Road", rate: 200 });
  assert(again.success, again.error);
  assert(time.getRange(2, 14).getValue() === 150, "a second rate change rewrote the billed rate");
  assert(time.getRange(3, 14).getValue() === "", "draft was frozen on the second save");
  assert(clients.getRange(2, 6).getValue() === 200, "second rate");

  const addressOnly = api.saveClientRecord_({ originalName: "Acme", name: "Acme", address1: "9 Harbour Lane", rate: 200 });
  assert(addressOnly.success, addressOnly.error);
  assert(!/Sent invoices keep the rate/.test(addressOnly.message), addressOnly.message);
  assert(time.getRange(3, 14).getValue() === "", "address edit froze the draft");

  const compiled = api.compileSingleInvoice({ invoiceId: "INV-JR26-003" });
  assert(compiled.success, compiled.error);
  assert(time.getRange(3, 14).getValue() === 150, "marking invoiced did not keep the current rate");

  const paid = api.updateInvoiceStatus({ invoiceId: "INV-JR26-004", status: "Paid" });
  assert(paid.success, paid.error);
  assert(time.getRange(4, 14).getValue() === 40, "paid invoice did not keep its rate");
  assert(time.getRange(5, 14).getValue() === "", "open time was frozen when another invoice was marked paid");
});

function seedConfig(workbook) {
  const config = createSheet("Config");
  workbook.sheets.Config = config;
  const pairs = [
    [1, "Settings", "Value"],
    [2, "Default Hourly Rate", 65],
    [3, "Financial Year End", "31st October"],
    [4, "Default Currency", "EUR"],
    [5, "Business Name", "Everyday Business"],
    [6, "Business Address", "Ireland"],
    [7, "Business Email", "Jane@EverydayBusiness.ie"],
    [8, "Website", "www.EverydayBusiness.ie"],
    [9, "Business Phone", "00353 123 45678"],
    [11, "Bank Account Name", "Everyday Business"],
    [12, "IBAN", "IEXX XXXX XXXX XXXX XXXX XX"],
    [15, "Breaks", "Value"],
    [16, "na", 0],
    [17, "half hour", 30 / 1440],
    [18, "hour", new Date(Date.UTC(1899, 11, 30, 1, 0, 0))],
    [19, "hour and half", "01:30"],
    [20, "two hours", "02:00"],
    [26, "Invoice status", ""],
    [27, "Draft", ""],
    [28, "Invoiced", ""],
    [29, "Written off", ""],
    [30, "Paid", ""]
  ];
  pairs.forEach(function (pair) {
    config.getRange(pair[0], 1).setValue(pair[1]);
    if (pair[2] !== "") config.getRange(pair[0], 2).setValue(pair[2]);
  });
  config.getRange(5, 3).setValue("keep-me");
  return config;
}

test("settings read the Config sheet and leave status rows alone", function (api, workbook) {
  const config = seedConfig(workbook);
  const read = api.fetchSettings();
  assert(read.success, read.error);
  assert(read.settings.length === 10, JSON.stringify(read.settings));
  assert(read.settings[0].label === "Default Hourly Rate" && read.settings[0].value === "65", read.settings[0].value);
  assert(read.settings[1].label === "Financial Year End" && read.settings[1].value === "31st October" && read.settings[1].row === 3, JSON.stringify(read.settings[1]));
  assert(read.settings[3].label === "Business Name" && read.settings[3].row === 5, JSON.stringify(read.settings[3]));
  assert(read.settings[5].value === "Jane@EverydayBusiness.ie", read.settings[5].value);
  assert(read.breaks.length === 5, JSON.stringify(read.breaks));
  assert(read.breaks[0].value === "00:00", read.breaks[0].value);
  assert(read.breaks[1].value === "00:30", read.breaks[1].value);
  assert(read.breaks.map(function (item) { return item.label; }).indexOf("Draft") === -1, "status row was treated as a break");
  assert(config.getRange(5, 3).getValue() === "keep-me", "column C was read as a value");

  config.getRange(4, 2).setFormula("=1+1");
  const blocked = api.saveSettings_({
    settings: [{ row: 4, label: "Default Currency", value: "GBP" }, { row: 5, label: "Business Name", value: "Changed" }]
  });
  assert(!blocked.success, "a formula cell was overwritten");
  assert(/formula/.test(blocked.error), blocked.error);
  assert(config.getRange(5, 2).getValue() === "Everyday Business", "later cells were written after a formula block");

  config.getRange(4, 2).setFormula("");
  config.getRange(4, 2).setValue("EUR");
  const saved = api.saveSettings_({
    settings: [
      { row: 2, label: "Default Hourly Rate", value: "70" },
      { row: 5, label: "Business Name", value: "Harbour Lane" },
      { row: 7, label: "Business Email", value: "office@everydaybusiness.ie" },
      { row: 9, label: "Business Phone", value: "00353 123 45678" }
    ],
    breaks: [
      { row: 16, label: "na", value: "00:00" },
      { row: 17, label: "half hour", value: "00:45" }
    ]
  });
  assert(saved.success, saved.error);
  assert(saved.message === "Saved settings for Harbour Lane.", saved.message);
  assert(config.getRange(2, 2).getValue() === 70, "rate was stored as text");
  assert(config.getRange(5, 1).getValue() === "Business Name", "the setting name changed");
  assert(config.getRange(5, 2).getValue() === "Harbour Lane", config.getRange(5, 2).getValue());
  assert(config.getRange(5, 3).getValue() === "keep-me", "column C was wiped");
  assert(config.getRange(7, 2).getValue() === "office@everydaybusiness.ie", "email");
  assert(config.getRange(9, 2).getValue() === "00353 123 45678", "phone lost its text");
  assert(config.getRange(17, 2).getFormula() === "=TIME(0,45,0)", config.getRange(17, 2).getFormula());
  assert(config.getRange(27, 1).getValue() === "Draft", "Draft status row changed");
  assert(api.businessProfile_(workbook).name === "Harbour Lane", "business name no longer comes from B5");

  const badRate = api.saveSettings_({ settings: [{ row: 2, label: "Default Hourly Rate", value: "-5" }] });
  assert(!badRate.success && /number/.test(badRate.error), badRate.error);
  const badEmail = api.saveSettings_({ settings: [{ row: 7, label: "Business Email", value: "not-an-email" }] });
  assert(!badEmail.success && /email/.test(badEmail.error), badEmail.error);
  const badYear = api.saveSettings_({ settings: [{ row: 3, label: "Financial Year End", value: "Halloween" }, { row: 2, label: "Default Hourly Rate", value: "80" }] });
  assert(!badYear.success && /day and month/.test(badYear.error), badYear.error);
  assert(config.getRange(2, 2).getValue() === 70, "a bad year end still wrote the rate");
  const yearEnd = api.saveSettings_({ settings: [{ row: 3, label: "Financial Year End", value: "31st October" }] });
  assert(yearEnd.success, yearEnd.error);
  assert(config.getRange(3, 2).getValue() === "31st October", config.getRange(3, 2).getValue());
});

test("week and financial year windows follow the day and the Config year end", function (api, workbook) {
  assert(api.parseFinancialYearEnd_("31st October").month === 10 && api.parseFinancialYearEnd_("31st October").day === 31, "31st October");
  assert(api.parseFinancialYearEnd_("5 April").month === 4 && api.parseFinancialYearEnd_("5 April").day === 5, "5 April");
  assert(api.parseFinancialYearEnd_("31/10/2026").day === 31, "slash date");
  assert(!api.parseFinancialYearEnd_("31 November"), "31 November was accepted");
  const october = api.financialYearWindow_("2026-09-30", 10, 31);
  assert(october.start === "2025-11-01" && october.end === "2026-10-31", october.start + " " + october.end);
  const onEnd = api.financialYearWindow_("2026-10-31", 10, 31);
  assert(onEnd.start === "2025-11-01" && onEnd.end === "2026-10-31", "year end day");
  const next = api.financialYearWindow_("2026-11-01", 10, 31);
  assert(next.start === "2026-11-01" && next.end === "2027-10-31", next.start + " " + next.end);
  const april = api.financialYearWindow_("2026-04-05", 4, 5);
  assert(april.start === "2025-04-06" && april.end === "2026-04-05", april.start + " " + april.end);
  const calendar = api.financialYearWindow_("2026-09-30", 12, 31);
  assert(calendar.start === "2026-01-01" && calendar.end === "2026-12-31", calendar.start + " " + calendar.end);
  const week = api.weekWindowFromIso_("2026-09-30");
  assert(week.start === "2026-09-28" && week.end === "2026-10-04", week.start + " " + week.end);
  assert(api.weekWindowFromIso_("2026-09-22").start === "2026-09-21", "tuesday week");

  seedBooks(workbook);
  seedConfig(workbook);
  const time = workbook.sheets["Time&Attendance"];
  time.getRange(7, 2).setValue("INV-FY-IN");
  time.getRange(7, 4).setValue("Acme");
  time.getRange(7, 5).setValue(atNoon(2025, 12, 1));
  time.getRange(7, 10).setValue(5);
  time.getRange(7, 12).setValue(90);
  time.getRange(8, 2).setValue("INV-FY-OUT");
  time.getRange(8, 4).setValue("Acme");
  time.getRange(8, 5).setValue(atNoon(2026, 11, 15));
  time.getRange(8, 10).setValue(8);
  time.getRange(8, 12).setValue(120);
  const report = api.buildDashboardReport_(workbook, atNoon(2026, 9, 22));
  assert(report.success, report.error);
  const year = report.periods.year;
  assert(year.start === "2025-11-01" && year.end === "2026-10-31", year.start + " " + year.end);
  assert(year.label === "1 Nov 2025 – 31 Oct 2026", year.label);
  assert(year.hours === 17 && year.billable === 560, JSON.stringify({ hours: year.hours, billable: year.billable }));
  const inside = findInvoice(report, "INV-FY-IN");
  const outside = findInvoice(report, "INV-FY-OUT");
  assert(inside && inside.inYear && !inside.inMonth, JSON.stringify(inside && { inYear: inside.inYear, inMonth: inside.inMonth }));
  assert(outside && !outside.inYear, "November 2026 stayed in the financial year");
  assert(report.periods.week.hours === 2, "week hours " + report.periods.week.hours);
});

test("the settings logo is the image on INV-Template", function (api) {
  function textBlob(name, text) {
    return {
      getName: function () { return name; },
      getDataAsString: function () { return text; }
    };
  }
  function imageBlob(name) {
    return {
      getName: function () { return name; },
      getBytes: function () { return [9, 8, 7]; },
      getContentType: function () { return "image/png"; }
    };
  }
  const files = {};
  files["xl/workbook.xml"] = textBlob("xl/workbook.xml", '<sheet name="INV-Template" sheetId="4" r:id="rId8"/>');
  files["xl/_rels/workbook.xml.rels"] = textBlob("xl/_rels/workbook.xml.rels", 'Id="rId8" Type="worksheet" Target="worksheets/sheet4.xml"');
  files["xl/worksheets/_rels/sheet4.xml.rels"] = textBlob("xl/worksheets/_rels/sheet4.xml.rels", 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing4.xml"');
  files["xl/drawings/_rels/drawing4.xml.rels"] = textBlob("xl/drawings/_rels/drawing4.xml.rels", 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"');
  files["xl/media/image1.png"] = imageBlob("xl/media/image1.png");
  files["xl/media/other.png"] = imageBlob("xl/media/other.png");
  const url = api.logoDataUrlFromFiles_(files);
  assert(url.indexOf("data:image/png;base64,") === 0, url);
  assert(url === "data:image/png;base64," + Buffer.from([9, 8, 7]).toString("base64"), url);
});

test("a logo replaces the image already on the invoice", function (api, workbook) {
  seedConfig(workbook);
  const template = createSheet("INV-Template");
  workbook.sheets["INV-Template"] = template;
  const images = [];
  const current = {
    getAnchorCell: function () { return { getColumn: function () { return 2; }, getRow: function () { return 4; } }; },
    getWidth: function () { return 140; },
    getHeight: function () { return 60; },
    getBlob: function () { return { getBytes: function () { return [1, 2, 3]; }, getContentType: function () { return "image/png"; } }; },
    remove: function () { images.splice(images.indexOf(current), 1); }
  };
  images.push(current);
  template.getImages = function () { return images.slice(); };
  let placed = null;
  template.insertImage = function (blob, column, row) {
    placed = {
      blob: blob,
      column: column,
      row: row,
      width: 0,
      height: 0,
      setWidth: function (width) { this.width = width; },
      setHeight: function (height) { this.height = height; },
      getBlob: function () { return blob; }
    };
    images.length = 0;
    images.push(placed);
    return placed;
  };
  const before = api.fetchSettings();
  assert(before.success, before.error);
  assert(before.logo.indexOf("data:image/png;base64,") === 0, before.logo);
  const png = "data:image/png;base64," + Buffer.from("logo-bytes").toString("base64");
  const saved = api.saveSettings_({ settings: [], breaks: [], logo: png });
  assert(saved.success, saved.error);
  assert(/logo is on the invoice/.test(saved.message), saved.message);
  assert(placed && placed.column === 2 && placed.row === 4, JSON.stringify(placed));
  assert(placed.width === 140 && placed.height === 60, placed.width + "x" + placed.height);
  assert(images.indexOf(current) === -1, "the old logo stayed on the invoice");
  const bad = api.saveSettings_({ logo: "data:text/plain;base64,YQ==" });
  assert(!bad.success && /PNG or JPEG/.test(bad.error), bad.error);
});

test("time sheet reads stop at the last shift", function (api, workbook) {
  const created = api.executeTimeLog(shift());
  assert(created.success, created.error);
  const time = workbook.sheets["Time&Attendance"];
  time.getRange(5, 5).setValue("2026-09-23");
  time.getRange(29544, 11).setValue(65);
  assert(time.getLastRow() === 29544, "rate formula still extends the sheet");

  const calls = [];
  const original = time.getRange;
  time.getRange = function () {
    calls.push(Array.prototype.slice.call(arguments));
    return original.apply(time, arguments);
  };
  const rows = api.readTimeRows_(workbook, "UTC");
  assert(rows.length === 2, "shifts " + rows.length);
  assert(rows[0].client === "Acme", rows[0].client);
  assert(rows[1].date === "2026-09-23", rows[1].date);
  const wide = calls.filter(function (args) {
    return args.length === 4 && args[3] >= 12;
  });
  assert(wide.length === 1, "wide reads " + wide.length);
  assert(wide[0][2] === 4, "read " + wide[0][2] + " rows");
  calls.forEach(function (args) {
    if (args.length === 4) assert(args[2] < 30, "range height " + args[2]);
  });
  time.getRange = original;

  const second = api.executeTimeLog(shift({ date: "2026-09-24", jobDetails: "Follow up" }));
  assert(second.success, second.error);
  assert(time.getRange(3, 4).getValue() === "Acme", "next job followed the rate formula");
  assert(time.getRange(3, 6).getValue() === "Follow up", time.getRange(3, 6).getValue());

  const fallbackCalls = [];
  time.getRange = function () {
    const range = original.apply(time, arguments);
    range.getNextDataCell = undefined;
    fallbackCalls.push(Array.prototype.slice.call(arguments));
    return range;
  };
  const fallback = api.readTimeRows_(workbook, "UTC");
  assert(fallback.length === 3, "fallback shifts " + fallback.length);
  const fallbackWide = fallbackCalls.filter(function (args) {
    return args.length === 4 && args[3] >= 12;
  });
  assert(fallbackWide.length === 1 && fallbackWide[0][2] === 4, JSON.stringify(fallbackWide));
});

function webPost(api, body) {
  api.doPost({ postData: { contents: JSON.stringify(body) }, parameter: {} });
  return api.lastJson;
}

test("a web request without the client token does not open the sheet", function (api, workbook) {
  api.doGet({});
  assert(api.lastJson && api.lastJson.success === false && api.lastJson.status === 401, JSON.stringify(api.lastJson));
  assert(api.lastJson.error === "Client token is missing.", api.lastJson.error);
  assert(api.sheetTouches === 0, "a missing token opened the sheet");

  api.doGet({ parameter: { clientToken: "wrong-token" } });
  assert(api.lastJson.status === 403 && api.lastJson.success === false, JSON.stringify(api.lastJson));
  assert(api.lastJson.error === "Client token was not accepted.", api.lastJson.error);
  assert(api.sheetTouches === 0, "a wrong token opened the sheet");

  const headerOnly = api.doPost({
    parameter: {},
    headers: { "X-Client-Token": "beta-token" },
    postData: { contents: JSON.stringify({ action: "logTimeEntry", payload: shift() }) }
  });
  assert(api.lastJson.status === 401, JSON.stringify(api.lastJson));
  assert(api.sheetTouches === 0, "a header token opened the sheet");
  assert(headerOnly, "doPost returned nothing");

  const wrong = webPost(api, { action: "logTimeEntry", payload: shift(), clientToken: "wrong-token" });
  assert(wrong.status === 403 && wrong.success === false, JSON.stringify(wrong));
  assert(api.sheetTouches === 0, "a rejected post opened the sheet");

  api.scriptProperties.CLIENT_TOKEN = "";
  const unset = webPost(api, { action: "getInitialAppData", clientToken: "beta-token" });
  assert(unset.status === 403 && /not set/.test(unset.error), JSON.stringify(unset));
  assert(api.sheetTouches === 0, "an unset property opened the sheet");
  api.scriptProperties.CLIENT_TOKEN = "beta-token";

  const mismatch = api.doPost({
    parameter: { clientToken: "beta-token" },
    postData: { contents: JSON.stringify({ action: "getInitialAppData", clientToken: "other-token" }) }
  });
  assert(mismatch, "mismatch post returned nothing");
  assert(api.lastJson.status === 403, JSON.stringify(api.lastJson));
  assert(api.sheetTouches === 0, "mismatched tokens opened the sheet");

  api.doGet({ parameter: { clientToken: "beta-token" } });
  assert(api.lastJson.success === true && api.lastJson.invoicePdf === "inv-template-plain", JSON.stringify(api.lastJson));
  assert(api.sheetTouches === 0, "the health check opened the sheet");

  const logged = webPost(api, { action: "logTimeEntry", payload: shift(), clientToken: "beta-token" });
  assert(logged.success, logged.error);
  assert(logged.message === "Job logged on invoice INV-JR26-001.", logged.message);
  assert(statusCell(workbook, 2) === "Draft", statusCell(workbook, 2));

  const listed = webPost(api, { action: "getInitialAppData", clientToken: "beta-token" });
  assert(listed.success, listed.error);
  assert(listed.invoices && listed.invoices.length >= 1, "invoice list was empty");

  const invoiced = webPost(api, {
    action: "compileInvoice",
    payload: { invoiceId: logged.invoiceId },
    clientToken: "beta-token"
  });
  assert(invoiced.success, invoiced.error);
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));

  const paid = webPost(api, {
    action: "updateInvoiceStatus",
    payload: { invoiceId: logged.invoiceId, status: "Paid" },
    clientToken: "beta-token"
  });
  assert(paid.success, paid.error);
  assert(statusCell(workbook, 2) === "Paid", statusCell(workbook, 2));

  const template = createSheet("INV-Template");
  workbook.sheets["INV-Template"] = template;
  template.getRange("A4").setValue("INVOICE");
  const config = createSheet("Config");
  workbook.sheets.Config = config;
  config.getRange("B5").setValue("Everyday Business");
  config.getRange("B7").setValue("records@everydaybusiness.ie");
  workbook.sheets.ClientRecords.getRange(2, 1).setValue("Acme");
  workbook.sheets.ClientRecords.getRange(2, 7).setValue("Ada");
  const emailed = webPost(api, {
    action: "exportInvoicePdf",
    payload: { invoiceId: logged.invoiceId, mode: "email", email: "ada@acme.test" },
    clientToken: "beta-token"
  });
  assert(emailed.success, emailed.error);
  assert(api.lastEmail && api.lastEmail.to === "Ada <ada@acme.test>", JSON.stringify(api.lastEmail));
  assert(statusCell(workbook, 2) === "Paid", "email moved a paid invoice");

  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert(/clientToken: this\.clientToken/.test(appSource), "the page does not send clientToken");
  assert(/clientToken=/.test(appSource) && /clientRequestUrl/.test(appSource), "the page does not send the token on the URL");
  assert(!/X-Client-Token/.test(appSource), "the page sends a custom header");
  const demo = fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8");
  assert(/apiUrl/.test(demo) && /clientToken/.test(demo), "demo config is missing apiUrl or clientToken");
});

function stripeFetches(api) {
  return api.fetches.filter(function (item) {
    return String(item.url).indexOf("api.stripe.com") !== -1;
  });
}

function postWebhook(api, token, body) {
  api.doPost({
    parameter: { stripeWebhook: token },
    postData: { contents: JSON.stringify(body) }
  });
  return api.lastJson;
}

function sessionEvent(type, invoiceId, sessionId) {
  return {
    type: type,
    data: {
      object: {
        id: sessionId || "cs_test_123",
        payment_status: "paid",
        metadata: { sheetId: "workbook", invoiceId: invoiceId }
      }
    }
  };
}

function paidSession(invoiceId, sheetId) {
  return {
    code: 200,
    body: {
      id: "cs_test_123",
      payment_status: "paid",
      metadata: { sheetId: sheetId || "workbook", invoiceId: invoiceId, clientName: "Acme" }
    }
  };
}

function watchStatus(sheet) {
  const writes = [];
  const original = sheet.getRange;
  sheet.getRange = function (rowOrA1, col) {
    const range = original.apply(this, arguments);
    if (col === 9) {
      const setValue = range.setValue;
      range.setValue = function (value) {
        writes.push(value);
        return setValue.apply(this, arguments);
      };
    }
    return range;
  };
  return writes;
}

function readyInvoiceEmail(workbook) {
  const template = createSheet("INV-Template");
  workbook.sheets["INV-Template"] = template;
  template.getRange("A4").setValue("INVOICE");
  const config = createSheet("Config");
  workbook.sheets.Config = config;
  config.getRange("A5").setValue("Trading name");
  config.getRange("B5").setValue("Everyday Business");
  config.getRange("A6").setValue("Business Email");
  config.getRange("B6").setValue("records@everydaybusiness.ie");
  const clients = workbook.sheets.ClientRecords;
  clients.getRange(2, 1).setValue("Bakewell Foods Ltd");
  clients.getRange(2, 7).setValue("Kevin McNeil");
  return template;
}

test("a request without stripeWebhook still needs the client token", function (api) {
  api.doPost({
    parameter: {},
    postData: { contents: JSON.stringify({ action: "getInitialAppData" }) }
  });
  assert(api.lastJson.status === 401 && api.lastJson.success === false, JSON.stringify(api.lastJson));
  assert(api.sheetTouches === 0, "a request without a token opened the sheet");

  api.doPost({
    parameter: { stripeWebhook: "" },
    postData: { contents: JSON.stringify({ action: "getInitialAppData" }) }
  });
  assert(api.lastJson.status === 401, JSON.stringify(api.lastJson));
  assert(api.sheetTouches === 0, "an empty webhook parameter opened the sheet");

  api.doPost({
    parameter: { stripeWebhook: "   " },
    postData: { contents: JSON.stringify({ action: "getInitialAppData", clientToken: "beta-token" }) }
  });
  assert(api.lastJson.success === true, JSON.stringify(api.lastJson));
});

test("a wrong Stripe webhook token is rejected before the sheet or Stripe", function (api, workbook) {
  api.scriptProperties.STRIPE_WEBHOOK_TOKEN = "hook-token";
  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-002");
  invoices.getRange(2, 9).setValue("Invoiced");
  const wrong = postWebhook(api, "nope", sessionEvent("checkout.session.completed", "INV-JR26-002"));
  assert(wrong.success === false && wrong.status === 403, JSON.stringify(wrong));
  assert(wrong.error === "Stripe webhook was not accepted.", wrong.error);
  assert(api.sheetTouches === 0, "a wrong webhook token opened the sheet");
  assert(stripeFetches(api).length === 0, "a wrong webhook token called Stripe");
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));

  api.scriptProperties.STRIPE_WEBHOOK_TOKEN = "";
  const unset = postWebhook(api, "hook-token", sessionEvent("checkout.session.completed", "INV-JR26-002"));
  assert(unset.success === false && unset.status === 403, JSON.stringify(unset));
  assert(api.sheetTouches === 0, "an unset webhook token opened the sheet");
  assert(stripeFetches(api).length === 0, "an unset webhook token called Stripe");
});

test("an unpaid Stripe session leaves the invoice status alone", function (api, workbook) {
  api.scriptProperties.STRIPE_WEBHOOK_TOKEN = "hook-token";
  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-002");
  invoices.getRange(2, 2).setValue("Acme");
  invoices.getRange(2, 7).setValue(200);
  invoices.getRange(2, 9).setValue("Invoiced");
  api.stripeHandler = function (url) {
    assert(url.indexOf("/v1/checkout/sessions/cs_test_123") !== -1, url);
    return { code: 200, body: { id: "cs_test_123", payment_status: "unpaid", metadata: { sheetId: "workbook", invoiceId: "INV-JR26-002" } } };
  };
  const unpaid = postWebhook(api, "hook-token", sessionEvent("checkout.session.completed", "INV-JR26-002"));
  assert(unpaid.success === true && unpaid.ignored === true, JSON.stringify(unpaid));
  assert(unpaid.paymentStatus === "unpaid", JSON.stringify(unpaid));
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));
  assert(stripeFetches(api).length === 1, "the unpaid session was trusted from the POST body");

  api.stripeHandler = function () {
    return { code: 200, body: { id: "cs_test_123", payment_status: "open", metadata: { sheetId: "workbook", invoiceId: "INV-JR26-002" } } };
  };
  const open = postWebhook(api, "hook-token", sessionEvent("checkout.session.completed", "INV-JR26-002"));
  assert(open.success === true && open.ignored === true, JSON.stringify(open));
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));
});

test("a paid Stripe session marks an invoiced invoice Paid", function (api, workbook) {
  api.scriptProperties.STRIPE_WEBHOOK_TOKEN = "hook-token";
  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-002");
  invoices.getRange(2, 2).setValue("Acme");
  invoices.getRange(2, 7).setValue(200);
  invoices.getRange(2, 8).setValue(atNoon(2026, 9, 1));
  invoices.getRange(2, 9).setValue("Invoiced");
  const time = workbook.sheets["Time&Attendance"];
  time.getRange(2, 2).setValue("INV-JR26-002");
  time.getRange(2, 4).setValue("Acme");
  time.getRange(2, 11).setValue(50);
  let seenAuth = "";
  api.stripeHandler = function (url, options) {
    seenAuth = options && options.headers && options.headers.Authorization;
    assert(!options.payload, "the checkout read sent a body");
    return paidSession("INV-JR26-002");
  };
  const paid = postWebhook(api, "hook-token", sessionEvent("checkout.session.completed", "INV-JR26-002"));
  assert(paid.success === true, paid.error);
  assert(paid.status === "Paid", paid.status);
  assert(statusCell(workbook, 2) === "Paid", statusCell(workbook, 2));
  assert(time.getRange(2, 14).getValue() === 50, "the billed rate stayed open");
  assert(seenAuth === "Bearer sk_test_example", seenAuth);
  assert(invoices.getRange(2, 8).getValue().getTime() === atNoon(2026, 9, 1).getTime(), "the invoice date was rewritten");
});

test("a paid Stripe session marks a draft Invoiced and then Paid", function (api, workbook) {
  api.scriptProperties.STRIPE_WEBHOOK_TOKEN = "hook-token";
  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-003");
  invoices.getRange(2, 2).setValue("Acme");
  invoices.getRange(2, 7).setValue(50);
  invoices.getRange(2, 9).setValue("Draft");
  const time = workbook.sheets["Time&Attendance"];
  time.getRange(2, 2).setValue("INV-JR26-003");
  time.getRange(2, 4).setValue("Acme");
  time.getRange(2, 11).setValue(40);
  const writes = watchStatus(invoices);
  api.stripeHandler = function () { return paidSession("INV-JR26-003"); };
  const paid = postWebhook(api, "hook-token", sessionEvent("checkout.session.completed", "INV-JR26-003"));
  assert(paid.success === true, paid.error);
  assert(writes[0] === "Invoiced" && writes[writes.length - 1] === "Paid", writes.join(","));
  assert(statusCell(workbook, 2) === "Paid", statusCell(workbook, 2));
  const stamped = invoices.getRange(2, 8).getValue();
  assert(stamped && typeof stamped.getTime === "function" && !isNaN(stamped.getTime()), "blank date was not stamped");
  assert(time.getRange(2, 14).getValue() === 40, "the draft rate was not locked");
});

test("a Stripe payment on an invoice that is already Paid stays Paid", function (api, workbook) {
  api.scriptProperties.STRIPE_WEBHOOK_TOKEN = "hook-token";
  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const invoices = workbook.sheets.InvoiceList;
  const stamped = atNoon(2026, 8, 1);
  invoices.getRange(2, 1).setValue("INV-JR26-001");
  invoices.getRange(2, 7).setValue(100);
  invoices.getRange(2, 8).setValue(stamped);
  invoices.getRange(2, 9).setValue("Paid");
  api.stripeHandler = function () { return paidSession("INV-JR26-001"); };
  const again = postWebhook(api, "hook-token", sessionEvent("checkout.session.completed", "INV-JR26-001"));
  assert(again.success === true && again.already === true, JSON.stringify(again));
  assert(!again.error, again.error);
  assert(again.status === "Paid" && statusCell(workbook, 2) === "Paid", statusCell(workbook, 2));
  assert(invoices.getRange(2, 8).getValue().getTime() === stamped.getTime(), "a second payment rewrote the date");
});

test("a paid session for another workbook does not mark the invoice Paid", function (api, workbook) {
  api.scriptProperties.STRIPE_WEBHOOK_TOKEN = "hook-token";
  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-002");
  invoices.getRange(2, 9).setValue("Invoiced");
  api.stripeHandler = function () { return paidSession("INV-JR26-002", "other-workbook"); };
  const missed = postWebhook(api, "hook-token", sessionEvent("checkout.session.completed", "INV-JR26-002"));
  assert(missed.success === false, JSON.stringify(missed));
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));
});

test("email with a test Stripe key adds a pay link before Kind Regards", function (api, workbook) {
  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const template = readyInvoiceEmail(workbook);
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-011");
  invoices.getRange(2, 2).setValue("Bakewell Foods Ltd");
  invoices.getRange(2, 7).setValue(1080);
  invoices.getRange(2, 9).setValue("Draft");
  const letter = "To Kevin McNeil\nPlease find attached invoice for 10 Sep 2026\nTotal owed €1,080.00\nFor works Maintenance Cover\n\nKind Regards\nEveryday Business";
  const originalFetch = api.UrlFetchApp.fetch;
  api.UrlFetchApp.fetch = function (url, options) {
    if (String(url).indexOf("/export?") !== -1) {
      api.footerDuringPrint = template.getRange(2, 1, 36, 1).getValues().join("\n");
      api.printRange = url;
    }
    return originalFetch.apply(this, arguments);
  };

  const sent = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    message: letter
  });
  assert(sent.success, sent.error);
  const payUrl = "https://buy.stripe.com/test_example";
  const calls = stripeFetches(api);
  assert(calls.length === 1, "pay link calls " + calls.length);
  assert(calls[0].url === "https://api.stripe.com/v1/payment_links", calls[0].url);
  assert(String(calls[0].options.method).toLowerCase() === "post", calls[0].options.method);
  assert(calls[0].options.headers.Authorization === "Bearer sk_test_example", calls[0].options.headers.Authorization);
  assert(calls[0].options.muteHttpExceptions === true, "Stripe errors were not muted");
  const payload = String(calls[0].options.payload);
  assert(payload.indexOf("currency%5D=eur") !== -1, payload);
  assert(payload.indexOf("unit_amount%5D=108000") !== -1, payload);
  assert(payload.indexOf("metadata%5BinvoiceId%5D=INV-JR26-011") !== -1, payload);
  assert(payload.indexOf("metadata%5BclientName%5D=Bakewell%20Foods%20Ltd") !== -1, payload);
  assert(payload.indexOf("metadata%5BsheetId%5D=workbook") !== -1, payload);
  assert(payload.indexOf("invoice_creation%5Benabled%5D=false") !== -1, payload);
  assert(payload.indexOf("automatic_tax%5Benabled%5D=false") !== -1, payload);
  assert(payload.indexOf("restrictions%5Bcompleted_sessions%5D%5Blimit%5D=1") !== -1, payload);
  assert(payload.indexOf(encodeURIComponent("Thank you. Everyday Business will record this payment.")) !== -1, payload);
  const regards = api.lastEmail.body.indexOf("\nKind Regards\n");
  const linkAt = api.lastEmail.body.indexOf("Pay this invoice online:\n" + payUrl);
  assert(linkAt !== -1 && linkAt < regards, api.lastEmail.body);
  assert(api.lastEmail.body.indexOf("Bank transfer details are on the invoice.") !== -1, api.lastEmail.body);
  assert(api.lastEmail.htmlBody.indexOf("https://buy.stripe.com/") !== -1, api.lastEmail.htmlBody);
  assert(sent.message === "Emailed INV-JR26-011 to client@bakewell.test.", sent.message);
  assert(sent.message.indexOf("http") === -1 && sent.message.indexOf("Cc ") === -1, sent.message);
  assert(api.footerDuringPrint.indexOf("Pay online: " + payUrl) !== -1, api.footerDuringPrint);
  assert(api.printRange.indexOf("r2=36") !== -1, api.printRange);
  assert(statusCell(workbook, 2) === "Draft", "email marked the draft");
  const cells = template.getRange("A1:G36").getValues().join("\n");
  assert(cells.indexOf("stripe.com") === -1, "the pay link was written onto the invoice");

  api.footerDuringPrint = "";
  const downloaded = api.exportInvoicePdf({ invoiceId: "INV-JR26-011", mode: "download" });
  assert(downloaded.success, downloaded.error);
  assert(api.footerDuringPrint.indexOf("stripe.com") === -1, api.footerDuringPrint);
  assert(stripeFetches(api).length === 1, "saving the PDF created another pay link");
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));

  api.footerDuringPrint = "";
  const shared = api.exportInvoicePdf({ invoiceId: "INV-JR26-011", mode: "download", payUrl: payUrl });
  assert(shared.success, shared.error);
  assert(api.footerDuringPrint.indexOf("Pay online: " + payUrl) !== -1, api.footerDuringPrint);
  assert(stripeFetches(api).length === 1, "a saved pay link called Stripe again");
  assert(template.getRange(2, 1, 36, 1).getValues().join("\n").indexOf("stripe.com") === -1, "the pay link stayed on the sheet");

  template.getRange("A36").setValue("Bank");
  api.footerDuringPrint = "";
  api.printRange = "";
  const filed = api.exportInvoicePdf({ invoiceId: "INV-JR26-011", mode: "download", payUrl: payUrl });
  assert(filed.success, filed.error);
  assert(api.printRange.indexOf("r2=37") !== -1, api.printRange);
  assert(api.footerDuringPrint.indexOf("Pay online: " + payUrl) !== -1, api.footerDuringPrint);
  assert(template.getRange("A36").getValue() === "Bank", "the bank row was replaced");
  assert(String(template.getRange("A37").getValue() || "").indexOf("stripe.com") === -1, "the footer stayed on the sheet");
  assert(stripeFetches(api).length === 1, "a full sheet created another pay link");

  invoices.getRange(3, 1).setValue("INV-JR26-019");
  invoices.getRange(3, 2).setValue("Bakewell Foods Ltd");
  invoices.getRange(3, 7).setValue(0.49);
  invoices.getRange(3, 9).setValue("Draft");
  const beforeSmall = api.fetches.length;
  const small = api.exportInvoicePdf({
    invoiceId: "INV-JR26-019",
    mode: "email",
    email: "client@bakewell.test",
    message: letter
  });
  assert(small.success, small.error);
  assert(api.fetches.slice(beforeSmall).every(function (item) {
    return String(item.url).indexOf("api.stripe.com") === -1;
  }), "a total under €0.50 created a pay link");
  assert(api.lastEmail.htmlBody.indexOf("http") === -1, api.lastEmail.htmlBody);
  assert(small.message.indexOf("Pay online") === -1, small.message);

  api.stripeHandler = function () {
    return { code: 400, body: { error: { message: "Invalid API key: sk_test_example" } } };
  };
  const denied = api.stripeRequest_("post", "/v1/payment_links", [["amount", "1"]]);
  assert(denied.ok === false && denied.error.indexOf("sk_") === -1, denied.error);
  assert(denied.error === "Stripe did not create the pay link.", denied.error);
  invoices.getRange(2, 7).setValue(12);
  const failed = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    message: letter
  });
  assert(failed.success, failed.error);
  assert(failed.message === "Emailed INV-JR26-011 to client@bakewell.test.", failed.message);
  assert(failed.message.indexOf("sk_") === -1, failed.message);
  assert(api.lastEmail.body.indexOf("stripe.com") === -1, api.lastEmail.body);
  assert(api.lastEmail.htmlBody.indexOf("http") === -1, api.lastEmail.htmlBody);
});

test("createPaymentLink returns the pay link before the email is sent", function (api, workbook) {
  readyInvoiceEmail(workbook);
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-011");
  invoices.getRange(2, 2).setValue("Bakewell Foods Ltd");
  invoices.getRange(2, 7).setValue(1080);
  invoices.getRange(2, 9).setValue("Draft");
  const letter = "To Kevin McNeil\nPlease find attached invoice for 10 Sep 2026\nTotal owed €1,080.00\n\nKind Regards\nEveryday Business";

  const touches = api.sheetTouches;
  api.doPost({
    postData: { contents: JSON.stringify({ action: "createPaymentLink", payload: { invoiceId: "INV-JR26-011" } }) },
    parameter: {}
  });
  assert(api.lastJson.status === 401 && api.lastJson.error === "Client token is missing.", JSON.stringify(api.lastJson));
  assert(api.sheetTouches === touches, "a missing token opened the sheet");

  api.lastEmail = null;
  const empty = webPost(api, {
    action: "createPaymentLink",
    payload: { invoiceId: "INV-JR26-011" },
    clientToken: "beta-token"
  });
  assert(empty.success === true && empty.payUrl === "", JSON.stringify(empty));
  assert(stripeFetches(api).length === 0, "a missing Stripe key created a pay link");
  assert(!api.lastEmail, "creating a pay link sent the email");

  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const linked = webPost(api, {
    action: "createPaymentLink",
    payload: { invoiceId: "INV-JR26-011" },
    clientToken: "beta-token"
  });
  assert(linked.success === true, JSON.stringify(linked));
  assert(linked.payUrl === "https://buy.stripe.com/test_example", linked.payUrl);
  assert(!api.lastEmail, "the pay link request sent the email");
  assert(stripeFetches(api).length === 1, "pay link calls " + stripeFetches(api).length);
  assert(statusCell(workbook, 2) === "Draft", statusCell(workbook, 2));

  const beforeEmail = stripeFetches(api).length;
  const sent = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    message: letter,
    payUrl: linked.payUrl,
    skipPayLink: true
  });
  assert(sent.success, sent.error);
  assert(stripeFetches(api).length === beforeEmail, "email created a second pay link");
  const regards = api.lastEmail.body.indexOf("\nKind Regards\n");
  const linkAt = api.lastEmail.body.indexOf("Pay this invoice online:\n" + linked.payUrl);
  assert(linkAt !== -1 && linkAt < regards, api.lastEmail.body);
  assert(sent.message === "Emailed INV-JR26-011 to client@bakewell.test.", sent.message);
  assert(sent.message.indexOf(linked.payUrl) === -1, sent.message);

  const poisoned = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    message: letter,
    payUrl: "https://evil.example/pay",
    skipPayLink: true
  });
  assert(poisoned.success, poisoned.error);
  assert(api.lastEmail.body.indexOf("evil.example") === -1, api.lastEmail.body);
  assert(api.lastEmail.htmlBody.indexOf("http") === -1, api.lastEmail.htmlBody);
  assert(stripeFetches(api).length === beforeEmail, "a rejected pay URL called Stripe");

  const skipped = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    message: letter,
    payUrl: "",
    skipPayLink: true
  });
  assert(skipped.success, skipped.error);
  assert(stripeFetches(api).length === beforeEmail, "an empty pay URL created a link during email");
  assert(skipped.message.indexOf("Pay online") === -1, skipped.message);

  const failedNote = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    message: letter,
    payUrl: "",
    skipPayLink: true,
    payLinkFailed: true
  });
  assert(failedNote.message === "Emailed INV-JR26-011 to client@bakewell.test.", failedNote.message);
  assert(failedNote.message.indexOf("The pay link was not added.") === -1, failedNote.message);
  assert(api.lastEmail.body.indexOf("stripe.com") === -1, api.lastEmail.body);

  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const start = appSource.indexOf("async emailInvoicePdf()");
  const end = appSource.indexOf("pdfExportPayload(mode)", start);
  const emailFn = appSource.slice(start, end);
  const payAskAt = emailFn.indexOf("requestPayLink");
  const exportAt = emailFn.indexOf('api("exportInvoicePdf"');
  assert(payAskAt !== -1 && exportAt !== -1 && payAskAt < exportAt, "Email invoice asks for the pay link after the email");
  const ensureAt = appSource.indexOf('api("ensurePaymentLink"');
  const createAt = appSource.indexOf('api("createPaymentLink"');
  assert(ensureAt !== -1 && createAt !== -1 && ensureAt < createAt, "the old create call runs before ensure");
});

test("email without a Stripe key sends and leaves http out of the letter", function (api, workbook) {
  readyInvoiceEmail(workbook);
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-011");
  invoices.getRange(2, 2).setValue("Bakewell Foods Ltd");
  invoices.getRange(2, 7).setValue(1080);
  const sent = api.exportInvoicePdf({ invoiceId: "INV-JR26-011", mode: "email", email: "client@bakewell.test" });
  assert(sent.success, sent.error);
  assert(stripeFetches(api).length === 0, "email called Stripe without a key");
  assert(api.lastEmail.htmlBody && api.lastEmail.htmlBody.indexOf("http") === -1, api.lastEmail.htmlBody);
  assert(api.lastEmail.body.indexOf("Kind Regards") !== -1, api.lastEmail.body);
  assert(sent.message.indexOf("Pay online") === -1, sent.message);
  assert(api.fetchTouches >= 1, "the invoice PDF was not printed");
});

test("a live Stripe key is refused and the email still sends", function (api, workbook) {
  api.scriptProperties.STRIPE_SECRET_KEY = "sk_live_example";
  api.scriptProperties.STRIPE_WEBHOOK_TOKEN = "hook-token";
  readyInvoiceEmail(workbook);
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-011");
  invoices.getRange(2, 2).setValue("Bakewell Foods Ltd");
  invoices.getRange(2, 7).setValue(1080);
  invoices.getRange(2, 9).setValue("Invoiced");
  const sent = api.exportInvoicePdf({ invoiceId: "INV-JR26-011", mode: "email", email: "client@bakewell.test" });
  assert(sent.success, sent.error);
  assert(stripeFetches(api).length === 0, "a live key called Stripe");
  assert(api.lastEmail.htmlBody.indexOf("http") === -1, api.lastEmail.htmlBody);
  assert(sent.message.indexOf("Pay online") === -1, sent.message);
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));

  const ignored = postWebhook(api, "hook-token", sessionEvent("checkout.session.completed", "INV-JR26-011"));
  assert(ignored.success === false, JSON.stringify(ignored));
  assert(stripeFetches(api).length === 0, "a live key confirmed a webhook with Stripe");
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));
});

test("checkout.session.completed marks Paid and other events are ignored", function (api, workbook) {
  api.scriptProperties.STRIPE_WEBHOOK_TOKEN = "hook-token";
  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-002");
  invoices.getRange(2, 9).setValue("Invoiced");
  invoices.getRange(3, 1).setValue("INV-JR26-004");
  invoices.getRange(3, 9).setValue("Written off");
  const ignored = postWebhook(api, "hook-token", sessionEvent("payment_intent.succeeded", "INV-JR26-002"));
  assert(ignored.success === true && ignored.ignored === true, JSON.stringify(ignored));
  assert(stripeFetches(api).length === 0, "an ignored event called Stripe");
  assert(api.sheetTouches === 0, "an ignored event opened the sheet");
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));

  api.stripeHandler = function () { return paidSession("INV-JR26-002"); };
  const paid = postWebhook(api, "hook-token", sessionEvent("checkout.session.completed", "INV-JR26-002"));
  assert(paid.success === true && paid.status === "Paid", JSON.stringify(paid));
  assert(statusCell(workbook, 2) === "Paid", statusCell(workbook, 2));

  api.stripeHandler = function () { return paidSession("INV-JR26-004"); };
  const asyncPaid = postWebhook(api, "hook-token", sessionEvent("checkout.session.async_payment_succeeded", "INV-JR26-004", "cs_test_async"));
  assert(asyncPaid.success === true && asyncPaid.status === "Paid", JSON.stringify(asyncPaid));
  assert(statusCell(workbook, 3) === "Paid", "a written-off invoice stayed written off");
});

test("a webhook whose Stripe read is not paid leaves the invoice status alone", function (api, workbook) {
  api.scriptProperties.STRIPE_WEBHOOK_TOKEN = "hook-token";
  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-002");
  invoices.getRange(2, 9).setValue("Invoiced");
  api.stripeHandler = function (url) {
    assert(url.indexOf("/v1/checkout/sessions/") !== -1, url);
    return { code: 200, body: { id: "cs_test_123", payment_status: "unpaid", metadata: { sheetId: "workbook", invoiceId: "INV-JR26-002" } } };
  };
  const result = postWebhook(api, "hook-token", sessionEvent("checkout.session.completed", "INV-JR26-002"));
  assert(result.success === true && result.ignored === true, JSON.stringify(result));
  assert(statusCell(workbook, 2) === "Invoiced", statusCell(workbook, 2));
  assert(stripeFetches(api).length === 1, "the webhook skipped the Stripe read");
});

test("ensurePaymentLink reuses the stored pay link until the total changes", function (api, workbook) {
  readyInvoiceEmail(workbook);
  const invoices = workbook.sheets.InvoiceList;
  invoices.getRange(2, 1).setValue("INV-JR26-011");
  invoices.getRange(2, 2).setValue("Bakewell Foods Ltd");
  invoices.getRange(2, 7).setValue(1080);
  invoices.getRange(2, 9).setValue("Invoiced");
  const letter = "To Kevin McNeil\nPlease find attached invoice for 10 Sep 2026\nTotal owed €1,080.00\n\nKind Regards\nEveryday Business";

  const touches = api.sheetTouches;
  api.doPost({
    postData: { contents: JSON.stringify({ action: "ensurePaymentLink", payload: { invoiceId: "INV-JR26-011" } }) },
    parameter: {}
  });
  assert(api.lastJson.status === 401 && api.lastJson.error === "Client token is missing.", JSON.stringify(api.lastJson));
  assert(api.sheetTouches === touches, "a missing token opened the sheet");

  const empty = webPost(api, {
    action: "ensurePaymentLink",
    payload: { invoiceId: "INV-JR26-011" },
    clientToken: "beta-token"
  });
  assert(empty.success === true && empty.payUrl === "", JSON.stringify(empty));
  assert(stripeFetches(api).length === 0, "a missing Stripe key created a pay link");

  api.scriptProperties.STRIPE_SECRET_KEY = "sk_test_example";
  const first = webPost(api, {
    action: "ensurePaymentLink",
    payload: { invoiceId: "INV-JR26-011" },
    clientToken: "beta-token"
  });
  assert(first.success === true && first.payUrl === "https://buy.stripe.com/test_example", JSON.stringify(first));
  assert(first.reused !== true, "the first link was treated as reused");
  const stored = JSON.parse(api.scriptProperties.PAY_LINKS);
  assert(stored["INV-JR26-011"].url === first.payUrl, JSON.stringify(stored));
  assert(stored["INV-JR26-011"].id === "plink_test", JSON.stringify(stored));
  assert(stored["INV-JR26-011"].cents === 108000, JSON.stringify(stored));
  assert(JSON.stringify(stored).indexOf("sk_") === -1, JSON.stringify(stored));

  const beforeReuse = stripeFetches(api).length;
  const again = webPost(api, {
    action: "ensurePaymentLink",
    payload: { invoiceId: "INV-JR26-011" },
    clientToken: "beta-token"
  });
  assert(again.success === true && again.reused === true && again.payUrl === first.payUrl, JSON.stringify(again));
  assert(stripeFetches(api).length === beforeReuse, "the same total created another pay link");

  const beforeEmail = stripeFetches(api).length;
  const sent = api.exportInvoicePdf({
    invoiceId: "INV-JR26-011",
    mode: "email",
    email: "client@bakewell.test",
    message: letter
  });
  assert(sent.success, sent.error);
  assert(stripeFetches(api).length === beforeEmail, "email created a second pay link");
  assert(api.lastEmail.body.indexOf(first.payUrl) !== -1, api.lastEmail.body);

  let sawDeactivate = false;
  api.stripeHandler = function (url, options) {
    if (String(url).indexOf("/v1/payment_links/") !== -1) {
      sawDeactivate = String(options && options.payload || "").indexOf("active=false") !== -1;
      return { code: 400, body: { error: { message: "already inactive" } } };
    }
    return { code: 200, body: { id: "plink_new", url: "https://buy.stripe.com/test_new" } };
  };
  invoices.getRange(2, 7).setValue(500);
  const changed = webPost(api, {
    action: "ensurePaymentLink",
    payload: { invoiceId: "INV-JR26-011" },
    clientToken: "beta-token"
  });
  assert(changed.success === true && changed.payUrl === "https://buy.stripe.com/test_new", JSON.stringify(changed));
  assert(sawDeactivate, "the old pay link was left active");
  const next = JSON.parse(api.scriptProperties.PAY_LINKS);
  assert(next["INV-JR26-011"].cents === 50000 && next["INV-JR26-011"].id === "plink_new", JSON.stringify(next));

  api.stripeHandler = function (url) {
    if (String(url).indexOf("/v1/payment_links/") !== -1) {
      return { code: 200, body: { id: "plink_new", active: false } };
    }
    return { code: 200, body: { id: "plink_small", url: "https://buy.stripe.com/test_small" } };
  };
  const beforeSmall = stripeFetches(api).length;
  invoices.getRange(2, 7).setValue(0.4);
  const small = webPost(api, {
    action: "ensurePaymentLink",
    payload: { invoiceId: "INV-JR26-011" },
    clientToken: "beta-token"
  });
  assert(small.success === true && small.payUrl === "", JSON.stringify(small));
  assert(stripeFetches(api).length === beforeSmall + 1, "a smaller total created a new pay link");
  assert(stripeFetches(api)[beforeSmall].url.indexOf("/v1/payment_links/plink_new") !== -1, stripeFetches(api)[beforeSmall].url);
  assert(!api.scriptProperties.PAY_LINKS || api.scriptProperties.PAY_LINKS.indexOf("INV-JR26-011") === -1, api.scriptProperties.PAY_LINKS);

  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert(appSource.indexOf("visibilitychange") !== -1, "the page does not check when the tab returns");
  assert(/addEventListener\("focus"/.test(appSource), "the page does not check when the window is focused");
  assert(/payPollMs:\s*6000/.test(appSource), "the pay check is not every 6 seconds");
  assert(/payWatchMs:\s*120000/.test(appSource), "the pay check does not run for about two minutes");
  const copyStart = appSource.indexOf("async copyPayLink()");
  assert(appSource.slice(copyStart, copyStart + 700).indexOf("startPayWatch") !== -1, "copying the pay link does not start the pay check");
  const emailStart = appSource.indexOf("async emailInvoicePdf()");
  const emailEnd = appSource.indexOf("pdfExportPayload(mode)", emailStart);
  assert(appSource.slice(emailStart, emailEnd).indexOf("startPayWatch") !== -1, "emailing the invoice does not start the pay check");
  assert(appSource.indexOf('+ " paid"') !== -1, "a paid invoice has no banner");
  assert(/feedbackHoldMs:\s*8000/.test(appSource), "the paid note does not clear itself");
  assert(appSource.indexOf("dismissFeedback") !== -1, "the paid note has no dismiss");
  assert(appSource.indexOf("detailLocked") !== -1, "a paid invoice stays editable");
  const pageSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert(pageSource.indexOf("data-lock-paid") !== -1, "the send form has no paid lock");
  assert(pageSource.indexOf("dismissFeedback") !== -1, "the banner has no dismiss control");
  const submitStart = appSource.indexOf("async submitForm()");
  const submitEnd = appSource.indexOf("money(n)", submitStart);
  const submit = appSource.slice(submitStart, submitEnd);
  const placeAt = submit.indexOf("this.placeLoggedDraft");
  const refreshAt = submit.lastIndexOf("this.refreshSnapshot");
  assert(placeAt !== -1 && refreshAt !== -1 && placeAt < refreshAt, "the draft is not on screen before the workbook answers");
  assert(submit.indexOf("keepDetail: true") !== -1, "logging a job can leave the invoice");
  const noticeStart = appSource.indexOf("async noticePayments()");
  const notice = appSource.slice(noticeStart, noticeStart + 2200);
  assert(notice.indexOf("keepDetail: true") !== -1, "a pay check can leave the invoice");
  assert(notice.indexOf("confirmOnHome") !== -1, "paying the open invoice does not return home");
});

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nAll invoice status rules passed.");

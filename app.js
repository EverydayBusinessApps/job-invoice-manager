/**
 * EverydayWork Custom Polyfill Core & Controller
 * Built for EverydayBusinessApps
 */

window.Alpine = {
  directives: {}, dataStore: {},
  directive(name, callback) { this.directives[name] = callback; },
  data(name, callback) { this.dataStore[name] = callback; },
  getPath(obj, path) {
    if (obj == null || path == null || path === '') return undefined;
    return String(path).split('.').reduce((curr, key) => (curr == null ? undefined : curr[key]), obj);
  },
  setPath(obj, path, value) {
    const parts = String(path).split('.');
    const last = parts.pop();
    const target = parts.length ? this.getPath(obj, parts.join('.')) : obj;
    if (target == null || last === undefined) return;
    target[last] = value;
  },
  scopedGet(state, itemName, item, expr) {
    if (!expr) return undefined;
    const path = String(expr).trim();
    if (path === itemName) return item;
    if (path.startsWith(itemName + '.')) return this.getPath(item, path.slice(itemName.length + 1));
    return this.getPath(state, path);
  },
  applyLoopBindings(node, state, itemName, item) {
    const visit = (el) => {
      if (!el || el.nodeType !== 1) return;
      Array.from(el.attributes || []).forEach((attr) => {
        if (attr.name === ':class' || attr.name === 'x-bind:class') {
          const val = this.scopedGet(state, itemName, item, attr.value);
          if (!el.hasAttribute('data-base-class')) el.setAttribute('data-base-class', el.getAttribute('class') || '');
          const base = el.getAttribute('data-base-class') || '';
          const extra = val == null ? '' : String(val);
          el.className = [base, extra].filter(Boolean).join(' ').trim();
          el.removeAttribute(attr.name);
          return;
        }
        if (attr.name.charAt(0) === ':' && attr.name !== ':value') {
          const real = attr.name.slice(1);
          const val = this.scopedGet(state, itemName, item, attr.value);
          el.setAttribute(real, val == null ? '' : String(val));
          el.removeAttribute(attr.name);
        }
      });
      const textExpr = el.getAttribute('x-text');
      if (textExpr) {
        const val = this.scopedGet(state, itemName, item, textExpr);
        el.textContent = val == null ? '' : String(val);
        el.removeAttribute('x-text');
      }
      const bindValue = el.getAttribute(':value') || el.getAttribute('x-bind:value');
      if (bindValue) {
        const val = this.scopedGet(state, itemName, item, bindValue);
        const str = val == null ? '' : String(val);
        el.setAttribute('value', str);
        el.value = str;
        el.removeAttribute(':value');
        el.removeAttribute('x-bind:value');
      }
      Array.from(el.children).forEach(visit);
    };
    if (node.nodeType === 11) Array.from(node.children).forEach(visit);
    else visit(node);
  },
  optionFromItem(item) {
    const name = item == null
      ? ''
      : (typeof item === 'string' ? item : (item.name || item.Name || item.clientName || ''));
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    return opt;
  },
  renderFor(root, state) {
    root.querySelectorAll('template[x-for]').forEach(tpl => {
      const expr = (tpl.getAttribute('x-for') || '').trim();
      const match = expr.match(/^(\w+)\s+in\s+(.+)$/);
      if (!match || !tpl.parentNode) return;
      const itemName = match[1];
      const list = this.getPath(state, match[2].trim());
      const items = Array.isArray(list) ? Array.from(list) : [];

      Array.from(tpl.parentNode.children).forEach(child => {
        if (child === tpl) return;
        const generated = child.getAttribute('data-x-for') === expr;
        const hoistedLoopOption = child.tagName === 'OPTION' && (
          child.hasAttribute(':value') || child.hasAttribute('x-bind:value')
        );
        if (generated || hoistedLoopOption) child.remove();
      });

      items.forEach(item => {
        const frag = tpl.content.cloneNode(true);
        const hasElements = frag.querySelector('*') || frag.children.length;
        if (!hasElements) {
          const opt = this.optionFromItem(item);
          opt.setAttribute('data-x-for', expr);
          tpl.parentNode.insertBefore(opt, tpl);
          return;
        }
        this.applyLoopBindings(frag, state, itemName, item);
        Array.from(frag.childNodes).forEach(child => {
          if (child.nodeType !== 1) return;
          child.setAttribute('data-x-for', expr);
          tpl.parentNode.insertBefore(child, tpl);
        });
      });
    });
  },
  syncModels(root, state) {
    root.querySelectorAll('select[x-model], input[x-model], textarea[x-model]').forEach(input => {
      const model = input.getAttribute('x-model');
      const current = this.getPath(state, model);
      const next = current == null ? '' : String(current);
      if (input.value !== next) input.value = next;
    });
  },
  start() {
    document.querySelectorAll('[x-data]').forEach(el => {
      const expr = el.getAttribute('x-data');
      const factory = this.dataStore[expr];
      if (typeof factory !== 'function') return;
      const state = factory();
      let proxyState;
      const render = () => this.renderDOM(el, proxyState);
      const binder = (target) => {
        if (target === null || typeof target !== 'object') return target;
        if (Array.isArray(target)) return target;
        return new Proxy(target, {
          get: (obj, prop) => {
            const val = obj[prop];
            if (typeof val === 'function') {
              return val.bind(Array.isArray(obj) ? obj : proxyState);
            }
            if (val && typeof val === 'object') return binder(val);
            return val;
          },
          set: (obj, prop, val) => {
            obj[prop] = val;
            render();
            return true;
          }
        });
      };
      proxyState = binder(state);

      el.querySelectorAll('select, input, textarea').forEach(input => {
        const model = input.getAttribute('x-model');
        if (model) {
          const current = this.getPath(proxyState, model);
          input.value = current == null ? '' : current;
          input.addEventListener('input', (e) => {
            this.setPath(proxyState, model, e.target.value);
          });
          if (input.tagName === 'SELECT') {
            input.addEventListener('change', (e) => {
              this.setPath(proxyState, model, e.target.value);
            });
          }
        }
      });

      el.addEventListener('click', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
        if (!btn || !el.contains(btn) || btn.disabled) return;
        const name = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id') || '';
        if (typeof proxyState[name] === 'function') proxyState[name](id);
      });

      el.querySelectorAll('button, a, select, input, textarea').forEach(btn => {
        const hasClick = btn.hasAttribute('@click') || btn.hasAttribute('x-on:click');
        if (hasClick) {
          const clickExpr = btn.getAttribute('@click') || btn.getAttribute('x-on:click');
          btn.addEventListener('click', () => {
            if (btn.disabled) return;
            const funcName = clickExpr.replace('()', '').trim();
            if (typeof proxyState[funcName] === 'function') proxyState[funcName]();
          });
        }
        const hasChange = btn.hasAttribute('@change') || btn.hasAttribute('x-on:change');
        if (hasChange) {
          const changeExpr = btn.getAttribute('@change') || btn.getAttribute('x-on:change');
          btn.addEventListener('change', () => {
            const funcName = changeExpr.replace('()', '').trim();
            if (typeof proxyState[funcName] === 'function') proxyState[funcName]();
          });
        }
        const hasInput = btn.hasAttribute('@input') || btn.hasAttribute('x-on:input');
        if (hasInput) {
          const inputExpr = btn.getAttribute('@input') || btn.getAttribute('x-on:input');
          btn.addEventListener('input', () => {
            const funcName = inputExpr.replace('()', '').trim();
            if (typeof proxyState[funcName] === 'function') proxyState[funcName]();
          });
        }
      });
      render();
      if (typeof proxyState.init === 'function') proxyState.init();
    });
  },
  renderDOM(root, state) {
    if (!root || !state) return;
    this.renderFor(root, state);
    root.querySelectorAll('[x-text]').forEach(el => {
      const expr = el.getAttribute('x-text');
      const val = this.getPath(state, expr);
      el.innerText = typeof val === 'number' && expr.includes('Amount') ? "€" + val.toFixed(2) : (val == null ? '' : val);
    });
    root.querySelectorAll('[x-show]').forEach(item => {
      const showExpr = item.getAttribute('x-show');
      const showParts = showExpr.split('===');
      if(showParts.length > 1) {
        const targetVal = showParts[1].replace(/['"]/g, "").trim();
        item.style.display = this.getPath(state, showParts[0].trim()) === targetVal ? 'block' : 'none';
      } else {
        item.style.display = this.getPath(state, showExpr) ? 'block' : 'none';
      }
    });
    this.applyClassBindings(root, state);
    this.syncModels(root, state);
    root.querySelectorAll('[data-disable-when]').forEach((item) => {
      item.disabled = !!this.getPath(state, item.getAttribute('data-disable-when'));
    });
    root.querySelectorAll('[data-pay-link]').forEach((el) => {
      const url = this.getPath(state, 'detailPayUrl') || '';
      if (url) el.setAttribute('href', url);
      else el.removeAttribute('href');
    });
    root.removeAttribute('x-cloak');
  },
  applyClassBindings(root, state) {
    root.querySelectorAll('[\\:class], [x-bind\\:class]').forEach(el => {
      const expr = el.getAttribute(':class') || el.getAttribute('x-bind:class');
      if (!expr) return;
      if (!el.hasAttribute('data-base-class')) {
        el.setAttribute('data-base-class', el.getAttribute('class') || '');
      }
      const base = el.getAttribute('data-base-class') || '';
      const ternary = expr.match(/^(.+?)\s*\?\s*['"]([^'"]*)['"]\s*:\s*['"]([^'"]*)['"]$/);
      const extra = ternary ? (this.getPath(state, ternary[1].trim()) ? ternary[2] : ternary[3]) : '';
      el.className = [base, extra].filter(Boolean).join(' ').trim();
    });
  }
};

document.addEventListener('DOMContentLoaded', () => window.Alpine.start());

function sampleDashboard() {
  const row = (extra) => Object.assign({
    email: "", terms: 0, rate: 0, jobDetails: "", servicePeriod: "", lines: [],
    inWeek: false, inMonth: false, inQuarter: true, inYear: true, overdue: false, daysOverdue: 0
  }, extra);
  return {
    success: true,
    asOf: "2026-09-22",
    open: {
      dueAmount: 286, dueCount: 2,
      overdueAmount: 246, overdueCount: 1,
      draftAmount: 50, draftCount: 1,
      paidAmount: 100, paidCount: 1,
      writtenOffAmount: 80, writtenOffCount: 1
    },
    periods: {
      week: { label: "21 Sep – 27 Sep 2026", hours: 2, shifts: 1, clients: 1, billable: 40, avgRate: 20, topClient: "Other Co", topClientHours: 2, paid: 0, paidCount: 0, sent: 40, sentCount: 1, due: 40, dueCount: 1, draft: 0, draftCount: 0, overdue: 0, overdueCount: 0, badDebt: 0, badDebtCount: 0 },
      month: { label: "September 2026", hours: 7, shifts: 3, clients: 2, billable: 290, avgRate: 41.43, topClient: "Acme", topClientHours: 4, paid: 0, paidCount: 0, sent: 240, sentCount: 2, due: 240, dueCount: 2, draft: 50, draftCount: 1, overdue: 200, overdueCount: 1, badDebt: 0, badDebtCount: 0 },
      quarter: { label: "Q3 2026", hours: 12, shifts: 5, clients: 2, billable: 470, avgRate: 39.17, topClient: "Acme", topClientHours: 9, paid: 100, paidCount: 1, sent: 420, sentCount: 4, due: 240, dueCount: 2, draft: 50, draftCount: 1, overdue: 200, overdueCount: 1, badDebt: 80, badDebtCount: 1 },
      year: { label: "1 Nov 2025 – 31 Oct 2026", hours: 12, shifts: 5, clients: 2, billable: 470, avgRate: 39.17, topClient: "Acme", topClientHours: 9, paid: 100, paidCount: 1, sent: 420, sentCount: 4, due: 240, dueCount: 2, draft: 50, draftCount: 1, overdue: 200, overdueCount: 1, badDebt: 80, badDebtCount: 1 }
    },
    invoices: [
      row({ id: "INV-EB-002", code: "INV-EB-002", clientName: "Acme", contact: "Ann Acme", status: "Invoiced", kind: "due", date: "2026-09-01", dueDate: "2026-09-15", overdue: true, daysOverdue: 7, hours: 4, total: 200, vatApplied: "Y", vatRate: 23, vat: 46, gross: 246, email: "acme@example.com", terms: 14, payUrl: "https://example.com/pay/INV-EB-002", jobDetails: "Site visit", inMonth: true, lines: [{ date: "2026-09-02", details: "Site visit", start: "08:00", finish: "12:00", hours: 4, amount: 200, materials: 30, hired: 12, mileageKm: 50, mileageRate: 0.25, loadedHourly: 10 }] }),
      row({ id: "INV-EB-005", code: "INV-EB-005", clientName: "Other Co", contact: "Owen Other", status: "Invoiced", kind: "due", date: "2026-09-20", dueDate: "2026-10-20", hours: 2, total: 40, terms: 30, payUrl: "https://example.com/pay/INV-EB-005", inWeek: true, inMonth: true, lines: [{ date: "2026-09-21", details: "Callout", start: "09:00", finish: "11:00", hours: 2, amount: 40 }] }),
      row({ id: "INV-EB-003", code: "INV-EB-003", clientName: "Other Co", contact: "Old Contact", status: "Draft", kind: "draft", date: "2026-09-10", dueDate: "2026-10-10", hours: 1, total: 50, email: "stale@other.test", terms: 30, payUrl: "https://example.com/pay/INV-EB-003", inMonth: true, lines: [{ date: "2026-09-12", details: "Survey", start: "09:00", finish: "10:00", hours: 1, amount: 50 }] }),
      row({ id: "INV-EB-001", code: "INV-EB-001", clientName: "Acme", contact: "Ann Acme", status: "Paid", kind: "paid", date: "2026-08-01", dueDate: "2026-08-15", hours: 3, total: 100, email: "acme@example.com", terms: 14, lines: [{ date: "2026-08-02", details: "Install", start: "09:00", finish: "12:00", hours: 3, amount: 100 }] }),
      row({ id: "INV-EB-004", code: "INV-EB-004", clientName: "Acme", contact: "Ann Acme", status: "Written off", kind: "writtenoff", date: "2026-07-15", dueDate: "2026-07-29", hours: 2, total: 80, email: "acme@example.com", terms: 14, lines: [{ date: "2026-07-16", details: "Repair", start: "09:00", finish: "11:00", hours: 2, amount: 80 }] }),
      row({ id: "INV-EB-006", code: "INV-EB-006", clientName: "Acme", contact: "Ann Acme", status: "Quote", kind: "quote", date: "2026-09-18", hours: 3, rate: 50, total: 150, email: "acme@example.com", terms: 14, jobDetails: "Boiler service", servicePeriod: "2026-09-18", inMonth: true, lines: [{ date: "2026-09-18", details: "Boiler service", start: "09:00", finish: "12:00", hours: 3, rate: 50, amount: 150 }] }),
      row({ id: "INV-EB-DEP", code: "INV-EB-DEP", clientName: "Acme", contact: "Ann Acme", status: "Invoiced", kind: "due", date: "2026-09-18", dueDate: "2026-10-18", hours: 0, total: 500, email: "acme@example.com", terms: 14, payUrl: "https://example.com/pay/INV-EB-DEP", jobName: "Cathedral View", jobDetails: "Deposit", lines: [{ date: "2026-09-18", details: "Deposit", hours: 0, amount: 500, materials: 360 }] }),
      row({ id: "INV-EB-BAL", code: "INV-EB-BAL", clientName: "Acme", contact: "Ann Acme", status: "Draft", kind: "draft", date: "2026-09-20", dueDate: "2026-10-20", hours: 0, total: 750, email: "acme@example.com", terms: 14, payUrl: "https://example.com/pay/INV-EB-BAL", jobName: "Cathedral View", jobDetails: "Balance", lines: [{ date: "2026-09-20", details: "Balance", hours: 0, amount: 750, materials: 620 }] }),
      row({ id: "INV-EB-OS", code: "INV-EB-OS", clientName: "Acme", contact: "Ann Acme", status: "Invoiced", kind: "due", date: "2026-09-19", dueDate: "2026-10-19", hours: 1, total: 90, email: "acme@example.com", terms: 14, payUrl: "https://example.com/pay/INV-EB-OS", jobName: "Other Site", jobDetails: "Other site visit", lines: [{ date: "2026-09-19", details: "Other site visit", hours: 1, amount: 90 }] })
    ],
    businessName: "Everyday Business",
    clients: [{ name: "Acme" }, { name: "Other Co" }],
    clientRecords: [
      { name: "Acme", address1: "1 Dock Road", address2: "Dublin", address3: "", address4: "", rate: 50, contact: "Ann Acme", email: "acme@example.com", phone: "01 555 0100", terms: 14 },
      { name: "Other Co", address1: "22 Quay Street", address2: "Cork", address3: "", address4: "", rate: 40, contact: "Owen Other", email: "owen@other.test", phone: "021 555 0199", terms: 30 }
    ],
    unbilled: { "Other Co": { totalHours: 1, totalAmount: 50 } }
  };
}

function displayIsoDate(iso) {
  const match = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return "";
  return String(day).padStart(2, "0") + "/" + String(month).padStart(2, "0") + "/" + year;
}

function invoiceHoursLabel(n) {
  const value = Math.round((Number(n) || 0) * 10) / 10;
  const text = Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1);
  return text + " h";
}

function briefWorkText(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= 90) return clean;
  const cut = clean.slice(0, 87);
  const space = cut.lastIndexOf(" ");
  return (space > 40 ? cut.slice(0, space) : cut).trim() + "…";
}

function invoiceNumberKey(raw) {
  const text = String(raw || "").trim();
  if (/^\d+(?:\.0+)?$/.test(text)) {
    const n = parseInt(text, 10);
    return n > 0 ? String(n) : "";
  }
  const tail = text.match(/^INV-[A-Za-z0-9]+-0*(\d+)$/i);
  if (!tail) return "";
  const n = parseInt(tail[1], 10);
  return n > 0 ? String(n) : "";
}

function invoiceStatusRank(status) {
  const label = String(status || "").trim();
  if (label === "Paid") return 3;
  if (label === "Written off" || label === "Bad debt" || label === "Bad Debt") return 2;
  if (label === "Invoiced" || label === "Unpaid") return 1;
  if (label === "Quote") return -1;
  if (label === "Converted") return -2;
  return 0;
}

function preferInvoiceLabel(current, candidate) {
  const a = String(current || "").trim();
  const b = String(candidate || "").trim();
  if (!a) return b;
  if (!b) return a;
  const aInv = /^INV-/i.test(a);
  const bInv = /^INV-/i.test(b);
  if (aInv && !bInv) return a;
  if (bInv && !aInv) return b;
  const aEb = /^INV-EB-/i.test(a);
  const bEb = /^INV-EB-/i.test(b);
  if (aEb && !bEb) return a;
  if (bEb && !aEb) return b;
  return a;
}

function kindForStatus(status) {
  const label = String(status || "").trim();
  if (label === "Quote") return "quote";
  if (label === "Converted") return "converted";
  const rank = invoiceStatusRank(status);
  if (rank === 3) return "paid";
  if (rank === 2) return "writtenoff";
  if (rank === 1) return "due";
  return "draft";
}

function vatOnInvoiced(rows) {
  let total = 0;
  (rows || []).forEach((row) => {
    if (!row || row.inYear === false) return;
    const kind = row.kind || kindForStatus(row.status);
    if (kind !== "due" && kind !== "paid") return;
    if (String(row.vatApplied || "").trim().toUpperCase() !== "Y") return;
    const amount = Number(row.vat);
    if (!isFinite(amount)) return;
    total += amount;
  });
  return Math.round(total * 100) / 100;
}

function csvField(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function accountantCsvFromRows(rows) {
  const headers = ["Invoice", "Client", "Job", "Period", "Hours", "Rate", "Total Due", "Invoice Date", "Invoice Status", "VAT Applied", "VAT Rate", "VAT Amount", "Gross Total"];
  const lines = [headers.join(",")];
  (rows || []).forEach((row) => {
    if (!row) return;
    const id = row.code || row.id;
    if (!id) return;
    const cells = [
      id,
      row.clientName || "",
      row.jobDetails && row.jobDetails !== "—" ? row.jobDetails : "",
      row.servicePeriod && row.servicePeriod !== "—" ? row.servicePeriod : "",
      row.hours == null ? "" : row.hours,
      row.rate == null ? "" : row.rate,
      row.total == null ? "" : row.total,
      row.date || "",
      row.status || "",
      row.vatApplied || "",
      row.vatRate == null ? "" : row.vatRate,
      row.vat == null ? "" : row.vat,
      row.gross == null ? "" : row.gross
    ];
    lines.push(cells.map(csvField).join(","));
  });
  return lines.join("\n") + "\n";
}

function whatsAppInvoiceText(code, amount, payUrl, overdueLine) {
  const lines = [
    "Invoice " + String(code || "invoice").trim(),
    "Amount due " + String(amount || "").trim()
  ];
  const link = String(payUrl || "").trim();
  if (link) lines.push(link);
  lines.push("PDF downloaded, attach it");
  if (overdueLine) lines.push(String(overdueLine));
  return lines.join("\n");
}

function invoiceIsOverdue(row, asOf) {
  if (!row) return false;
  const kind = row.kind || kindForStatus(row.status);
  if (kind !== "due") return false;
  if (row.overdue === true) return true;
  const due = String(row.dueDate || "");
  const today = String(asOf || "");
  return !!(due && today && due < today);
}

function whatsAppLink(text) {
  return "https://wa.me/?text=" + encodeURIComponent(String(text || ""));
}

function quoteShareText(code, amount) {
  return whatsAppInvoiceText(code, amount, "");
}

function cloneInvoiceRow(row) {
  const copy = Object.assign({}, row || {});
  if (Array.isArray(row && row.lines)) copy.lines = row.lines.map((line) => Object.assign({}, line));
  return copy;
}

function nextPreviewInvoiceCode(rows) {
  let max = 0;
  (rows || []).forEach((row) => {
    const number = Number(invoiceNumberKey(row && row.id) || invoiceNumberKey(row && row.code) || 0);
    if (number > max) max = number;
  });
  const next = max + 1;
  return "INV-EB-" + String(next).padStart(3, "0");
}

function convertQuoteRows(rows, quoteId) {
  const list = (Array.isArray(rows) ? rows : []).map(cloneInvoiceRow);
  const wanted = String(quoteId || "").trim();
  const quote = list.find((item) => {
    if (!item) return false;
    if (item.id !== wanted && item.code !== wanted) return false;
    const status = String(item.status || "");
    return status === "Quote" || status === "Converted" || item.kind === "quote" || item.kind === "converted";
  });
  if (!quote) {
    return { rows: collapseInvoiceRows(list), stored: list, invoiceId: "", created: false };
  }
  if (quote.convertedId) {
    quote.status = "Converted";
    quote.kind = "converted";
    return { rows: collapseInvoiceRows(list), stored: list, invoiceId: quote.convertedId, created: false };
  }
  const code = nextPreviewInvoiceCode(list);
  const invoice = cloneInvoiceRow(quote);
  invoice.id = code;
  invoice.code = code;
  invoice.status = "Draft";
  invoice.kind = "draft";
  invoice.payUrl = "";
  quote.status = "Converted";
  quote.kind = "converted";
  quote.convertedId = code;
  list.push(invoice);
  return { rows: collapseInvoiceRows(list), stored: list, invoiceId: code, created: true };
}

// Shared job names match after trim, ignoring case. A blank name matches nothing.
function jobNameKey(raw) {
  return String(raw == null ? "" : raw).trim().toLowerCase();
}

function relatedPayWord(row) {
  const kind = (row && row.kind) || kindForStatus(row && row.status);
  if (kind === "paid") return "Paid";
  if (kind === "writtenoff") return "Written off";
  if (kind === "draft") return "Not sent";
  if (kind === "due") return "Unpaid";
  return "";
}

function isLiveBill(row) {
  const kind = (row && row.kind) || kindForStatus(row && row.status);
  return kind === "draft" || kind === "due" || kind === "paid" || kind === "writtenoff";
}

function relatedInvoices(rows, current) {
  const key = jobNameKey(current && current.jobName);
  if (!key || !isLiveBill(current)) return [];
  const list = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || row === current || !isLiveBill(row)) return;
    if (jobNameKey(row.jobName) !== key) return;
    if (sameInvoiceNumber(row, current.id, current.code)) return;
    const pay = invoicePayable(row);
    list.push({
      id: row.id,
      code: row.code || row.id,
      status: row.status || "",
      amount: pay.payable,
      payWord: relatedPayWord(row),
      payUrl: String(row.payUrl || "")
    });
  });
  return list;
}

function invoicePayable(row) {
  const net = Number(row && row.total);
  const netMoney = isFinite(net) ? net : 0;
  const applied = String(row && row.vatApplied || "").trim().toUpperCase() === "Y";
  if (!applied) return { showsVat: false, net: netMoney, payable: netMoney, vat: null, rate: null };
  const vat = Number(row && row.vat);
  const gross = Number(row && row.gross);
  return {
    showsVat: true,
    net: netMoney,
    vat: isFinite(vat) ? vat : null,
    rate: row.vatRate,
    payable: isFinite(gross) ? gross : netMoney
  };
}

function blankCost(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return isFinite(n) ? n : 0;
}

function jobCostParts(line) {
  const source = line || {};
  const materials = blankCost(source.materials);
  const hired = blankCost(source.hired);
  const km = blankCost(source.mileageKm);
  const mileageRate = blankCost(source.mileageRate);
  const loadedHourly = blankCost(source.loadedHourly);
  const hours = blankCost(source.hours);
  const mileageMoney = roundCents(km * mileageRate);
  const loadedMoney = roundCents(loadedHourly * hours);
  return {
    materials: materials,
    hired: hired,
    km: km,
    mileageRate: mileageRate,
    loadedHourly: loadedHourly,
    hours: hours,
    mileageMoney: mileageMoney,
    loadedMoney: loadedMoney,
    costs: roundCents(materials + hired + mileageMoney + loadedMoney)
  };
}

function stampedVatFraction(invoice) {
  const rate = Number(invoice && invoice.vatRate);
  if (!isFinite(rate) || rate <= 0) return 0;
  if (rate > 1) return rate / 100;
  return rate;
}

function jobAmountDue(line, invoice, lineCount) {
  const charge = roundCents(line && line.amount != null ? line.amount : (line && line.charge));
  const count = lineCount == null ? 1 : lineCount;
  if (count <= 1) return invoicePayable(invoice).payable;
  const applied = String(invoice && invoice.vatApplied || "").trim().toUpperCase() === "Y";
  if (!applied) return charge;
  return roundCents(charge * (1 + stampedVatFraction(invoice)));
}

function invoiceJobProfit(invoice) {
  const source = invoice || {};
  const lines = Array.isArray(source.lines) ? source.lines : [];
  const count = lines.length;
  const jobs = lines.map((line) => {
    const parts = jobCostParts(line);
    const due = jobAmountDue(line, source, count);
    return Object.assign({}, parts, {
      due: due,
      profit: roundCents(due - parts.costs),
      details: (line && line.details) || "",
      date: (line && line.date) || "",
      clientName: source.clientName || "",
      code: source.code || source.id || ""
    });
  });
  const costs = roundCents(jobs.reduce((sum, job) => sum + job.costs, 0));
  const due = invoicePayable(source).payable;
  return { due: due, costs: costs, profit: roundCents(due - costs), jobs: jobs };
}

function jobsByProfit(invoices) {
  const jobs = [];
  (Array.isArray(invoices) ? invoices : []).forEach((invoice) => {
    invoiceJobProfit(invoice).jobs.forEach((job) => jobs.push(job));
  });
  jobs.sort((a, b) => {
    if (b.profit !== a.profit) return b.profit - a.profit;
    const client = String(a.clientName).localeCompare(String(b.clientName));
    if (client) return client;
    return String(a.date).localeCompare(String(b.date));
  });
  return jobs;
}

function vatRateLabel(rate) {
  if (rate == null || rate === "") return "VAT";
  const n = Number(rate);
  if (!isFinite(n)) return "VAT";
  const shown = Math.abs(n - Math.round(n)) < 0.001 ? String(Math.round(n)) : String(Math.round(n * 100) / 100);
  return "VAT " + shown + "%";
}

function vatPercentText(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return "";
  const n = Number(text.replace(/[^0-9.-]/g, ""));
  if (!isFinite(n) || n < 0) return text;
  if (n > 0 && n <= 1) return String(Math.round(n * 10000) / 100);
  return String(n);
}

function collapseInvoiceRows(rows) {
  const merged = {};
  const order = [];
  (Array.isArray(rows) ? rows : []).filter((row) => kindForStatus(row && row.status) !== "converted").forEach((row) => {
    if (!row) return;
    const number = invoiceNumberKey(row.code) || invoiceNumberKey(row.id);
    const key = number || ("row:" + String(row.id || row.code || order.length));
    if (!merged[key]) {
      const copy = Object.assign({}, row);
      copy.kind = kindForStatus(copy.status);
      merged[key] = copy;
      order.push(key);
      return;
    }
    const dest = merged[key];
    const incomingBetter = invoiceStatusRank(row.status) > invoiceStatusRank(dest.status);
    const winner = incomingBetter ? row : dest;
    const loser = incomingBetter ? dest : row;
    const next = Object.assign({}, winner);
    next.id = preferInvoiceLabel(winner.id, loser.id) || winner.id;
    next.code = preferInvoiceLabel(winner.code, loser.code) || winner.code;
    next.kind = kindForStatus(next.status);
    if ((!next.lines || !next.lines.length) && loser.lines && loser.lines.length) next.lines = loser.lines;
    if (!jobNameKey(next.jobName) && jobNameKey(loser.jobName)) next.jobName = loser.jobName;
    merged[key] = next;
  });
  return order.map((key) => merged[key]);
}

function sameInvoiceNumber(item, id, code) {
  if (!item) return false;
  const wanted = [id, code].filter(Boolean);
  if (wanted.indexOf(item.id) !== -1 || wanted.indexOf(item.code) !== -1) return true;
  const number = invoiceNumberKey(id) || invoiceNumberKey(code);
  if (!number) return false;
  return invoiceNumberKey(item.id) === number || invoiceNumberKey(item.code) === number;
}

function invoiceCardFacts(row) {
  const source = row || {};
  const lines = Array.isArray(source.lines) ? source.lines : [];
  const dates = [];
  lines.forEach((line) => {
    const iso = String((line && line.date) || "").trim();
    if (iso) dates.push(iso);
  });
  if (!dates.length && source.servicePeriod) {
    String(source.servicePeriod).split(/\s+[–-]\s+/).forEach((part) => {
      const iso = part.trim();
      if (iso) dates.push(iso);
    });
  }
  const valid = dates.filter((iso) => displayIsoDate(iso)).sort();
  let period = "—";
  if (valid.length) {
    const start = displayIsoDate(valid[0]);
    const end = displayIsoDate(valid[valid.length - 1]);
    period = start === end ? start : (start + " – " + end);
  }
  const distinct = [];
  const seen = {};
  lines.forEach((line) => {
    const text = String((line && line.details) || "").replace(/\s+/g, " ").trim();
    if (!text || text === "—") return;
    const key = text.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    distinct.push(text);
  });
  const job = String(source.jobDetails || "").replace(/\s+/g, " ").trim();
  let work = "";
  if (distinct.length > 1) work = distinct.join(", ");
  else if (job && job !== "—") work = job;
  else if (distinct.length === 1) work = distinct[0];
  let hours = source.hours;
  if (hours == null || hours === "") {
    hours = lines.reduce((sum, line) => sum + (Number(line && line.hours) || 0), 0);
  }
  return {
    period: period,
    when: displayIsoDate(source.date) || "—",
    hours: invoiceHoursLabel(hours),
    work: work ? briefWorkText(work) : "—"
  };
}

function yearEndParts(value) {
  const text = String(value || "").trim().replace(/(\d+)(st|nd|rd|th)\b/gi, "$1");
  const months = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
    april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
    november: 11, nov: 11, december: 12, dec: 12
  };
  const lengths = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let month = 0;
  let day = 0;
  const named = text.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+\d{4})?$/);
  const namedRev = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s+\d{4})?$/);
  const slash = text.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.]\d{2,4})?$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (named && months[named[2].toLowerCase()]) {
    day = Number(named[1]);
    month = months[named[2].toLowerCase()];
  } else if (namedRev && months[namedRev[1].toLowerCase()]) {
    month = months[namedRev[1].toLowerCase()];
    day = Number(namedRev[2]);
  } else if (slash) {
    day = Number(slash[1]);
    month = Number(slash[2]);
  } else if (iso) {
    month = Number(iso[2]);
    day = Number(iso[3]);
  }
  if (!month || day < 1 || day > lengths[month]) return null;
  return { month: month, day: day };
}

function roundCents(value) {
  const n = Number(value);
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function priceNumber_(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const n = Number(text.replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : null;
}

function priceClockMinutes_(value) {
  if (value == null || value === "") return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function priceCountText_(value) {
  const n = Math.round(Number(value) * 100) / 100;
  if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
  return String(n);
}

function priceRateText_(value) {
  const n = Math.round(Number(value) * 100) / 100;
  if (Math.abs(n - Math.round(n)) < 0.001) return "€" + Math.round(n);
  return "€" + n.toFixed(2);
}

function priceDailyLabel_(days, length, rate) {
  const dayLabel = priceCountText_(days) + (Number(days) === 1 ? " day" : " days");
  return dayLabel + " × " + priceCountText_(length) + " h × " + priceRateText_(rate);
}

function priceJobPreview(input) {
  const source = input || {};
  const mode = String(source.priceMode || "hourly").trim().toLowerCase();
  if (mode === "daily") {
    const days = priceNumber_(source.days);
    const length = priceNumber_(source.dayLength);
    const rate = priceNumber_(source.rate);
    if (days == null || days <= 0) return { ok: false, mode: "daily", total: 0, hours: 0, label: "", error: "Enter the number of days." };
    if (length !== 8 && length !== 10 && length !== 12) return { ok: false, mode: "daily", total: 0, hours: 0, label: "", error: "Choose a day length of 8, 10, or 12 hours." };
    if (rate == null || rate < 0) return { ok: false, mode: "daily", total: 0, hours: 0, label: "", error: "Enter the hourly rate." };
    const hours = Math.round(days * length * 100) / 100;
    const total = Math.round(hours * rate * 100) / 100;
    return { ok: true, mode: "daily", total: total, hours: hours, rate: rate, label: priceDailyLabel_(days, length, rate), error: "" };
  }
  if (mode === "job" || mode === "job price" || mode === "jobprice") {
    const raw = source.jobPrice != null && String(source.jobPrice).trim() !== "" ? source.jobPrice : source.amount;
    const amount = priceNumber_(raw);
    if (amount == null || amount < 0) return { ok: false, mode: "job", total: 0, hours: 0, label: "", error: "Enter the job price." };
    const total = Math.round(amount * 100) / 100;
    return { ok: true, mode: "job", total: total, hours: 0, rate: 0, label: "Job price", error: "" };
  }
  const start = priceClockMinutes_(source.start);
  const finish = priceClockMinutes_(source.finish);
  let hours = 0;
  if (start != null && finish != null) {
    let minutes = finish - start;
    if (minutes <= 0) minutes += 24 * 60;
    const breaks = { na: 0, "half hour": 30, hour: 60, "hour and half": 90, "two hours": 120 };
    const lunch = breaks[source.lunch] || 0;
    hours = Math.max(0, Math.round((minutes - lunch) / 6) / 10);
  }
  const rate = priceNumber_(source.rate);
  const total = rate == null ? 0 : Math.round(hours * rate * 100) / 100;
  return { ok: true, mode: "hourly", total: total, hours: hours, rate: rate || 0, label: "", error: "" };
}

function estimateSoleTraderTax(profit) {
  const income = Math.max(0, roundCents(profit));
  const standard = Math.min(income, 44000);
  const higher = Math.max(0, income - 44000);
  const incomeTax = roundCents(Math.max(0, standard * 0.2 + higher * 0.4 - 4000));
  let usc = 0;
  if (income > 13000) {
    const bands = [
      [12012, 0.005],
      [16688, 0.02],
      [41344, 0.03],
      [29956, 0.08]
    ];
    let left = income;
    bands.forEach(function (band) {
      const slice = Math.min(left, band[0]);
      usc += slice * band[1];
      left = Math.max(0, left - band[0]);
    });
    if (left > 0) usc += left * 0.11;
    usc = roundCents(usc);
  }
  const prsi = income >= 5000 ? roundCents(Math.max(650, income * 0.042)) : 0;
  return {
    profit: income,
    incomeTax: incomeTax,
    usc: usc,
    prsi: prsi,
    total: roundCents(incomeTax + usc + prsi)
  };
}

function expenseAmount(value) {
  const text = String(value == null ? "" : value).replace(/,/g, "").trim();
  if (!text) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return null;
  return roundCents(text);
}

// ==========================================
// APPLICATION CONTROLLER STATE MACHINE
// ==========================================
window.Alpine.data('appState', () => ({
  loading: false,
  loadingLabel: "Updating…",
  saving: false,
  sharingWhatsApp: false,
  savePdfLabel: "Save in Drive",
  downloadPdfLabel: "Download PDF",
  emailPdfLabel: "Send email",
  logButtonLabel: "Log a job",
  logTitle: "Log a job",
  viewLoggedLabel: "View invoice",
  quoteMode: false,
  showJobInvoice: true,
  quoteHint: "",
  quoteBookReady: false,
  quoteBookRows: null,
  clientButtonLabel: "Save client",
  settingsButtonLabel: "Save settings",
  currentTab: 'dashboard',
  feedback: { text: '', isError: false },
  clients: [],
  clientRecords: [],
  clientRecordsEmpty: true,
  clientDetailsLive: false,
  clientView: "list",
  clientFormTitle: "New client",
  clientForm: {
    originalName: "",
    name: "",
    address1: "",
    address2: "",
    address3: "",
    address4: "",
    rate: "",
    contact: "",
    email: "",
    phone: "",
    terms: ""
  },
  
  apiUrl: "",
  clientToken: "",

  invoices: [],
  clientInvoices: [],
  showExistingInvoices: false,
  invoiceHint: 'This starts a new invoice. You can add more jobs to it before you send it.',
  overnight: false,
  overnightLabel: '',
  previewMode: /(?:\?|&)preview=1(?:&|$)/.test(typeof location !== "undefined" ? location.search : ""),
  mailAuthUrl: "",
  unbilled: {},
  dashboardLive: false,
  dashboardNote: "",
  period: "month",
  periodData: {},
  invoiceRows: [],
  visibleInvoices: [],
  dashView: "home",
  invoiceFilter: "due",
  listScope: "open",
  listTitle: "Invoices",
  listHint: "",
  listShowsSend: false,
  listShowsCollect: false,
  listShowsDone: false,
  listShowsQuote: false,
  listEmpty: false,
  listEmptyLabel: "Nothing waiting here.",
  listShowsHint: false,
  periodWeekClass: "",
  periodMonthClass: "seg-on",
  periodQuarterClass: "",
  periodYearClass: "",
  /*periodNote: "Hours and value are for this month only.",*/
  tabDashClass: "nav-on",
  tabClientsClass: "",
  tabTrackerClass: "",
  tabSummaryClass: "",
  tabSettingsClass: "",
  taxRatesOpen: false,
  taxRatesLabel: "See more",
  taxExpenses: "",
  summaryPeriod: "Financial year",
  summaryWork: "€0.00",
  summaryHours: "0 shifts",
  summaryPaid: "€0.00",
  summaryDue: "€0.00",
  summaryWrittenOff: "€0.00",
  summaryVat: "€0.00",
  summaryProfit: "€0.00",
  summaryIncomeTax: "€0.00",
  summaryUsc: "€0.00",
  summaryPrsi: "€0.00",
  summaryTax: "€0.00",
  summaryExpenseNote: "",
  logoPreview: "logo.png?v=1",
  logoDirty: false,
  logoEmpty: false,
  extraSettings: [],
  settingsMeta: {},
  vatOn: false,
  vatSwitchLabel: "Off",
  settingsShow: {
    rate: true, yearEnd: true, currency: true, name: true, address: true, email: true,
    website: true, phone: true, bank: true, iban: true, vat: true, vatApplied: true, vatRate: true,
    paymentTerms: true, loadedCost: true, mileageRate: true
  },
  settingsForm: {
    rate: "", yearEnd: "", currency: "", name: "", address: "", email: "",
    website: "", phone: "", bank: "", iban: "", vatApplied: "N", vatRate: "", paymentTerms: "14",
    loadedCost: "", mileageRate: ""
  },
  asOf: "",
  openSendAmount: "€0.00",
  openSendCount: "0 invoices",
  openSendHas: false,
  openSendEmpty: true,
  openCollectAmount: "€0.00",
  openCollectCount: "0 invoices",
  openCollectHas: false,
  openCollectEmpty: true,
  openDoneAmount: "€0.00",
  openDoneCount: "0 invoices",
  openQuoteAmount: "€0.00",
  openQuoteCount: "0 quotes",
  openDoneHas: false,
  openDoneEmpty: true,
  openOverdueAmount: "€0.00",
  openOverdueCount: "0 invoices",
  activeLabel: "",
  activeHours: "0",
  activeShifts: "0 shifts",
  activeClients: "0 clients",
  activeBillable: "€0.00",
  activeAvg: "€0.00",
  activeTop: "—",
  activePaid: "€0.00",
  activePaidCount: "0 invoices",
  activeSent: "€0.00",
  activeSentCount: "0 invoices",
  activeDue: "€0.00",
  activeDueCount: "0 invoices",
  activeDraft: "€0.00",
  activeDraftCount: "0 invoices",
  activeOverdue: "€0.00",
  activeOverdueCount: "0 invoices",
  activeBad: "€0.00",
  activeBadCount: "0 invoices",
  detailId: "",
  detailCode: "",
  detailClient: "",
  detailStatus: "",
  detailWhen: "",
  detailDue: "",
  detailDueDate: "—",
  detailWork: "",
  detailHours: "",
  detailTotal: "",
  detailService: "",
  detailJob: "",
  detailEmail: "",
  detailCc: "",
  ccNeedsDeploy: false,
  detailFrom: "",
  detailSubject: "",
  detailMessage: "",
  detailMessageAuto: "",
  detailNet: "",
  detailVat: "",
  detailVatLabel: "VAT",
  detailShowsVat: false,
  detailPeriod: "—",
  detailJobShow: false,
  emailOpen: false,
  emailToggleLabel: "Email",
  detailShowPay: false,
  detailShowShare: false,
  detailShowEmail: false,
  detailIsQuote: false,
  detailOverdue: false,
  detailPayUrl: "",
  payCopied: false,
  payPollMs: 6000,
  payWatchMs: 120000,
  payWatchUntil: 0,
  payWatchTimer: null,
  payWatchBound: false,
  payKinds: {},
  payLinkSlot: null,
  payChecking: false,
  payReturnAt: 0,
  businessName: "EverydayWork",
  detailIsDraft: false,
  detailCanSavePdf: false,
  detailCanFinish: false,
  detailCanUndo: false,
  detailLines: [],
  detailLinesRaw: [],
  detailLinesEmpty: true,
  detailJobName: "",
  detailJobNameShow: false,
  detailRelatedLead: "",
  detailRelated: [],
  detailHasRelated: false,
  detailProfit: "€0.00",
  detailProfitNote: "",
  profitJobs: [],
  profitJobsEmpty: true,
  driveUrl: "",
  jobLogged: { text: "", id: "", code: "" },
  showHourlyFields: true,
  showDailyFields: false,
  showJobFields: false,
  priceHourlyOn: true,
  priceDailyOn: false,
  priceJobOn: false,
  showPricePreview: false,
  pricePreviewLabel: "",
  pricePreviewAmount: "",
  priceSummary: "Pricing",
  form: { clientName: '', date: (() => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + now.getFullYear();
  })(), jobDetails: '', jobName: '', start: '08:00', lunch: 'na', finish: '16:30', invoiceMode: 'new', invoiceId: '', materials: '', hired: '', mileageKm: '', priceMode: 'hourly', days: '', dayLength: '8', dailyRate: '', jobPrice: '' },

  timeToMinutes(value) {
    if (value == null || value === '') return null;
    const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return (Number(match[1]) * 60) + Number(match[2]);
  },
  isOvernightShift(start, finish) {
    const startMins = this.timeToMinutes(start);
    const finishMins = this.timeToMinutes(finish);
    if (startMins == null || finishMins == null) return false;
    return finishMins <= startMins;
  },
  jobDateParts(text) {
    const raw = String(text || "").trim();
    const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let day;
    let month;
    let year;
    if (dmy) {
      day = Number(dmy[1]);
      month = Number(dmy[2]);
      year = Number(dmy[3]);
    } else if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else return null;
    const dt = new Date(year, month - 1, day);
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
    const dd = String(day).padStart(2, "0");
    const mm = String(month).padStart(2, "0");
    return { iso: year + "-" + mm + "-" + dd, label: dd + "/" + mm + "/" + year, year: year, month: month, day: day };
  },
  nextDayLabel(dateStr) {
    const parts = this.jobDateParts(dateStr);
    if (!parts) return "the next day";
    const next = new Date(parts.year, parts.month - 1, parts.day + 1);
    const dd = String(next.getDate()).padStart(2, "0");
    const mm = String(next.getMonth() + 1).padStart(2, "0");
    return dd + "/" + mm + "/" + next.getFullYear();
  },
  syncOvernight() {
    const overnight = this.isOvernightShift(this.form.start, this.form.finish);
    this.overnight = overnight;
    this.overnightLabel = overnight
      ? ('Overnight shift · finishes ' + this.nextDayLabel(this.form.date))
      : '';
  },
  normalizeJobDate() {
    const parts = this.jobDateParts(this.form.date);
    if (parts) this.form.date = parts.label;
    this.syncOvernight();
  },

  isDraftStatus(status) {
    return !status || String(status).trim().toLowerCase() === 'draft';
  },
  mapInvoices(list) {
    return (Array.isArray(list) ? list : []).map((inv) => {
      if (inv == null || typeof inv !== 'object') return null;
      const id = String(inv.id || inv.invoiceId || '').trim();
      if (!id) return null;
      const status = String(inv.status || 'Draft').trim();
      const date = String(inv.date || '').trim();
      const label = inv.label || ('Invoice ' + id + (status ? ' · ' + status : '') + (date ? ' · ' + date : ''));
      return { id: id, clientName: String(inv.clientName || inv.client || '').trim(), status: status, date: date, label: label };
    }).filter(Boolean);
  },
  refreshClientInvoices() {
    const name = this.form.clientName;
    const forClient = (this.invoices || []).filter((inv) => !name || !inv.clientName || inv.clientName === name);
    this.clientInvoices = forClient.filter((inv) => this.isDraftStatus(inv.status));
    if (this.form.invoiceId && !this.clientInvoices.some((inv) => inv.id === this.form.invoiceId)) {
      this.form.invoiceId = '';
    }
    this.syncInvoiceHint();
  },
  syncInvoiceHint() {
    if (this.quoteMode) {
      this.showExistingInvoices = false;
      this.showJobInvoice = false;
      this.invoiceHint = "";
      this.quoteHint = "This starts a quote. A pay link is added when you turn it into an invoice.";
      return;
    }
    this.quoteHint = "";
    this.showJobInvoice = true;
    const existing = this.form.invoiceMode === 'existing';
    this.showExistingInvoices = existing;
    if (!existing) {
      this.invoiceHint = 'This starts a new invoice. You can add more jobs to it before you send it.';
      return;
    }
    if (!this.form.clientName) {
      this.invoiceHint = 'Choose a client to see their draft invoices.';
      return;
    }
    if (!this.clientInvoices.length) {
      const named = (this.invoices || []).filter((inv) => !inv.clientName || inv.clientName === this.form.clientName);
      this.invoiceHint = named.length
        ? "No draft invoices left for this client. Time can't be added once an invoice leaves Draft."
        : 'No invoices yet for this client. Start a new one.';
      return;
    }
    this.invoiceHint = this.form.invoiceId
      ? ('This job will be added to invoice ' + this.form.invoiceId + '.')
      : "Choose a draft invoice. Time can't be added once an invoice leaves Draft.";
  },
  onClientChange() {
    this.form.invoiceId = '';
    this.refreshClientInvoices();
    if (this.form.priceMode === "daily" && !String(this.form.dailyRate || "").trim()) this.fillDailyRate();
  },
  fillDailyRate() {
    const record = this.clientRecordFor(this.form.clientName);
    if (!record || record.rate === "" || record.rate == null) return;
    this.form.dailyRate = String(record.rate);
    this.syncPricePreview();
  },
  setPriceMode(id) {
    const mode = id === "daily" || id === "job" ? id : "hourly";
    this.form.priceMode = mode;
    this.showHourlyFields = mode === "hourly";
    this.showDailyFields = mode === "daily";
    this.showJobFields = mode === "job";
    this.priceHourlyOn = mode === "hourly";
    this.priceDailyOn = mode === "daily";
    this.priceJobOn = mode === "job";
    this.priceSummary = mode === "daily" ? "Pricing · Daily" : mode === "job" ? "Pricing · Job price" : "Pricing";
    if (mode === "daily" && !String(this.form.dailyRate || "").trim()) this.fillDailyRate();
    this.syncPricePreview();
  },
  syncPricePreview() {
    const priced = priceJobPreview({
      priceMode: this.form.priceMode,
      days: this.form.days,
      dayLength: this.form.dayLength,
      rate: this.form.dailyRate,
      jobPrice: this.form.jobPrice
    });
    const active = this.form.priceMode === "daily" || this.form.priceMode === "job";
    this.showPricePreview = active && priced.ok;
    this.pricePreviewLabel = priced.ok ? priced.label : "";
    this.pricePreviewAmount = priced.ok ? this.money(priced.total) : "";
  },
  onInvoiceModeChange() {
    if (this.form.invoiceMode !== 'existing') this.form.invoiceId = '';
    this.syncInvoiceHint();
    this.syncLogButton();
  },
  syncLogButton() {
    this.syncInvoiceHint();
    this.viewLoggedLabel = this.quoteMode ? "View quote" : "View invoice";
    this.logTitle = this.quoteMode ? "Log a quote" : "Log a job";
    if (this.saving) {
      this.logButtonLabel = "Saving…";
      return;
    }
    if (this.quoteMode) {
      this.logButtonLabel = "Log a quote";
      return;
    }
    this.logButtonLabel = this.form.invoiceMode === "existing" ? "Add to invoice" : "Log a job";
  },
  unreachableMessage(writing) {
    return writing
      ? "The workbook didn't confirm the save. Refresh and check it isn't already there before you try again."
      : "Couldn't reach the workbook. Try Refresh.";
  },
  failMessage(res, fallback) {
    if (res && res.error) return String(res.error);
    return fallback;
  },
  readClientConfig() {
    const cfg = (typeof window !== "undefined" && window.EVERYDAYWORK_CONFIG) || {};
    this.apiUrl = String(cfg.apiUrl || "").trim();
    this.clientToken = String(cfg.clientToken || "").trim();
  },
  clientRequestUrl() {
    // Apps Script answers the browser from a redirect. With the token only in
    // the body, that redirect comes back empty and the page shows "Client token
    // is missing" even after the email has already been sent. The same token
    // on the URL lets the reply come back.
    const join = this.apiUrl.indexOf("?") === -1 ? "?" : "&";
    return this.apiUrl + join + "clientToken=" + encodeURIComponent(this.clientToken);
  },
  async api(actionName, payloadData = {}, opts) {
    const quiet = opts && opts.quiet;
    const writing = !!(opts && opts.write);
    const timeoutMs = (opts && opts.timeoutMs) || 40000;
    this.readClientConfig();
    if (!this.apiUrl || !this.clientToken) {
      return {
        success: false,
        status: 401,
        error: "This EverydayWork copy has no client token. Add it to the client config before using the live books."
      };
    }
    if (!quiet) this.loading = true;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (controller) controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(this.clientRequestUrl(), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: actionName, payload: payloadData, clientToken: this.clientToken }),
        signal: controller ? controller.signal : undefined
      });
      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (err) {
        result = { success: false, error: this.unreachableMessage(writing), unconfirmed: writing };
      }
      return result;
    } catch (err) {
      if (timedOut || (err && err.name === "AbortError")) {
        return {
          success: false,
          timedOut: true,
          error: "That took too long, so it was stopped. Check the invoice before you try again."
        };
      }
      return { success: false, error: this.unreachableMessage(writing), unconfirmed: writing };
    } finally {
      clearTimeout(timer);
      if (!quiet) this.loading = false;
    }
  },
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  syncPdfLabels(active) {
    this.savePdfLabel = active === "Saving the PDF…" ? "Saving…" : "Save in Drive";
    this.downloadPdfLabel = active === "Downloading the PDF…" ? "Downloading…" : "Download PDF";
    this.emailPdfLabel = active === "Sending the invoice…" ? "Sending…" : active === "Creating the pay link…" ? "Creating…" : "Send email";
  },
  syncEmailToggle() {
    this.emailToggleLabel = this.emailOpen ? "Hide email" : "Email";
  },
  async withInvoiceWait(label, fn) {
    if (this.saving) return;
    this.saving = true;
    this.loading = true;
    this.loadingLabel = label;
    this.syncPdfLabels(label);
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve("timeout"), 60000);
    });
    try {
      const outcome = await Promise.race([
        Promise.resolve().then(fn).then(() => "done"),
        timeout
      ]);
      if (outcome === "timeout") {
        this.setFeedback("That took too long, so it was stopped. Check the invoice before you try again.", true);
      }
    } finally {
      clearTimeout(timer);
      this.saving = false;
      this.loading = false;
      this.loadingLabel = "Updating…";
      this.syncPdfLabels("");
    }
  },
  startupTab() {
    const search = typeof location !== "undefined" ? location.search : "";
    const match = /(?:\?|&)tab=([^&]*)/.exec(search);
    if (!match) return "";
    let value = match[1] || "";
    try { value = decodeURIComponent(value.replace(/\+/g, " ")); } catch (err) {}
    return String(value).trim().toLowerCase();
  },
  openStartupTab() {
    const tab = this.startupTab();
    if (tab === "clients") this.setClientsTab();
    else if (tab === "log") this.setTrackerTab();
    else if (tab === "summary") this.setSummaryTab();
    else if (tab === "home") this.setDashTab();
  },
  async init() {
    if (this.previewMode) {
      const helpLink = document.querySelector("a.help-mark");
      if (helpLink) helpLink.setAttribute("href", "help.html?preview=1");
    }
    this.syncTabClasses();
    this.syncPeriodClasses();
    this.syncOvernight();
    this.syncLogButton();
    this.syncInvoiceHint();
    if (this.previewMode) {
      await this.loadDashboard();
      this.openStartupTab();
      return;
    }
    const stored = this.storedSnapshot();
    if (stored) this.applySnapshot(stored, true);
    await this.refreshSnapshot({ quiet: !!stored, announce: !stored, resync: true });
    this.installPayWatch();
    this.openStartupTab();
    if (this.payWatchRelevant()) this.startPayWatch();
  },
  scrollPage() {
    try { window.scrollTo(0, 0); } catch (err) {}
  },
  syncTabClasses() {
    this.tabDashClass = this.currentTab === "dashboard" ? "nav-on" : "";
    this.tabClientsClass = this.currentTab === "clients" ? "nav-on" : "";
    this.tabTrackerClass = this.currentTab === "tracker" ? "nav-on" : "";
    this.tabSummaryClass = this.currentTab === "summary" ? "nav-on" : "";
    this.tabSettingsClass = this.currentTab === "settings" ? "nav-on" : "";
  },
  setDashTab() {
    this.currentTab = "dashboard";
    this.dashView = "home";
    this.syncTabClasses();
    this.clearFeedback();
    this.scrollPage();
    this.startPayWatch();
  },
  setClientsTab() {
    this.stopPayWatch();
    this.currentTab = "clients";
    this.clientView = "list";
    this.syncTabClasses();
    this.clearFeedback();
    this.scrollPage();
  },
  setTrackerTab() {
    this.stopPayWatch();
    this.quoteMode = false;
    this.currentTab = "tracker";
    this.syncTabClasses();
    this.clearFeedback();
    this.syncLogButton();
    this.scrollPage();
  },
  setQuoteTab() {
    this.stopPayWatch();
    this.quoteMode = true;
    this.currentTab = "tracker";
    this.form.invoiceMode = "new";
    this.form.invoiceId = "";
    this.syncTabClasses();
    this.clearFeedback();
    this.syncLogButton();
    this.scrollPage();
  },
  setSummaryTab() {
    this.stopPayWatch();
    this.currentTab = "summary";
    this.taxRatesOpen = false;
    this.taxRatesLabel = "See more";
    this.syncTabClasses();
    this.clearFeedback();
    this.syncSummary();
    this.scrollPage();
  },
  toggleTaxRates() {
    this.taxRatesOpen = !this.taxRatesOpen;
    this.taxRatesLabel = this.taxRatesOpen ? "See less" : "See more";
  },
  async setSettingsTab() {
    this.stopPayWatch();
    this.currentTab = "settings";
    this.syncTabClasses();
    this.clearFeedback();
    this.scrollPage();
    await this.loadSettings();
  },
  blankClientForm() {
    return {
      originalName: "",
      name: "",
      address1: "",
      address2: "",
      address3: "",
      address4: "",
      rate: "",
      contact: "",
      email: "",
      phone: "",
      terms: ""
    };
  },
  clientField(value) {
    return String(value == null ? "" : value).trim();
  },
  clientAmount(value) {
    if (value === "" || value == null) return { ok: true, value: "" };
    const text = String(value).trim().replace(/[€£$]/g, "").replace(/,/g, "").replace(/\s/g, "");
    if (!text) return { ok: true, value: "" };
    if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, error: "Enter a number." };
    const n = Number(text);
    if (!isFinite(n)) return { ok: false, error: "Enter a number." };
    if (n < 0) return { ok: false, error: "Cannot be negative." };
    return { ok: true, value: n };
  },
  decorateClientRecords(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const name = this.clientField(row && row.name);
      if (!name) return null;
      const email = this.clientField(row.email);
      const contact = this.clientField(row.contact);
      const who = email || contact;
      const termsRaw = row.terms === "" || row.terms == null ? "" : Number(row.terms);
      const termsLabel = termsRaw === "" || Number.isNaN(termsRaw) ? "" : (termsRaw + (Number(termsRaw) === 1 ? " day" : " days"));
      const rateRaw = row.rate === "" || row.rate == null ? "" : Number(row.rate);
      const rateLabel = rateRaw === "" || Number.isNaN(rateRaw) ? "No rate" : (this.money(rateRaw) + "/h");
      return {
        name: name,
        address1: this.clientField(row.address1),
        address2: this.clientField(row.address2),
        address3: this.clientField(row.address3),
        address4: this.clientField(row.address4),
        rate: rateRaw,
        contact: contact,
        email: email,
        phone: this.clientField(row.phone),
        terms: termsRaw,
        meta: [who, termsLabel].filter(Boolean).join(" · ") || "No contact yet",
        rateLabel: rateLabel,
        partial: !!row.partial
      };
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  },
  clientRecordFor(name) {
    const wanted = this.clientField(name).toLowerCase();
    if (!wanted) return null;
    return (this.clientRecords || []).find((item) => this.clientField(item.name).toLowerCase() === wanted) || null;
  },
  invoiceAddress(row) {
    const record = this.clientRecordFor(row && row.clientName);
    if (record && !record.partial) return this.clientField(record.email);
    return this.clientField(row && row.email);
  },
  invoiceLetterRow(row) {
    const record = this.clientRecordFor(row && row.clientName);
    if (!record || record.partial) return row || {};
    return Object.assign({}, row, {
      contact: this.clientField(record.contact),
      email: this.clientField(record.email)
    });
  },
  applyClientRecords(rows) {
    const decorated = this.decorateClientRecords(rows);
    this.clientRecords = decorated;
    this.clientRecordsEmpty = decorated.length === 0;
    this.clientDetailsLive = !decorated.some((row) => row.partial);
    this.applyClientList(decorated);
    this.syncOpenClientForm();
    this.syncOpenInvoiceAddress();
  },
  syncOpenClientForm() {
    if (this.currentTab !== "clients" || this.clientView !== "form") return;
    const original = this.clientField(this.clientForm && this.clientForm.originalName);
    if (!original) return;
    const row = this.clientRecordFor(original);
    if (!row || row.partial) return;
    this.clientForm = {
      originalName: row.name,
      name: row.name,
      address1: row.address1 || "",
      address2: row.address2 || "",
      address3: row.address3 || "",
      address4: row.address4 || "",
      rate: row.rate === "" || row.rate == null ? "" : String(row.rate),
      contact: row.contact || "",
      email: row.email || "",
      phone: row.phone || "",
      terms: row.terms === "" || row.terms == null ? "" : String(row.terms)
    };
  },
  syncOpenInvoiceAddress() {
    if (this.dashView !== "detail") return;
    const row = (this.invoiceRows || []).find((item) => item.id === this.detailId) || { clientName: this.detailClient, email: this.detailEmail };
    this.detailEmail = this.invoiceAddress(row);
  },
  newClient() {
    this.clientForm = this.blankClientForm();
    this.clientFormTitle = "New client";
    this.clientView = "form";
    this.clearFeedback();
  },
  editClient(name) {
    const wanted = this.clientField(name);
    const row = (this.clientRecords || []).find((item) => item.name === wanted);
    if (!row) return;
    if (row.partial) {
      this.setFeedback("Client details load after Code.gs is pasted into Apps Script and deployed. Then use Refresh.", true);
      return;
    }
    this.clientForm = {
      originalName: row.name,
      name: row.name,
      address1: row.address1 || "",
      address2: row.address2 || "",
      address3: row.address3 || "",
      address4: row.address4 || "",
      rate: row.rate === "" || row.rate == null ? "" : String(row.rate),
      contact: row.contact || "",
      email: row.email || "",
      phone: row.phone || "",
      terms: row.terms === "" || row.terms == null ? "" : String(row.terms)
    };
    this.clientFormTitle = "Edit client";
    this.clientView = "form";
    this.clearFeedback();
  },
  showClientList() {
    this.clientView = "list";
    this.clearFeedback();
  },
  clientPayload() {
    const form = this.clientForm || {};
    return {
      originalName: this.clientField(form.originalName),
      name: this.clientField(form.name),
      address1: this.clientField(form.address1),
      address2: this.clientField(form.address2),
      address3: this.clientField(form.address3),
      address4: this.clientField(form.address4),
      rate: this.clientField(form.rate),
      contact: this.clientField(form.contact),
      email: this.clientField(form.email),
      phone: this.clientField(form.phone),
      terms: this.clientField(form.terms)
    };
  },
  clientSavedMessage(payload) {
    const name = payload && payload.name ? payload.name : "the client";
    return (payload && payload.originalName ? "Updated client " : "Saved client ") + name + ".";
  },
  async saveClient() {
    if (this.saving) return;
    this.clearFeedback();
    const payload = this.clientPayload();
    if (!payload.name) {
      this.setFeedback("Could not save the client. Enter a client name.", true);
      return;
    }
    const rate = this.clientAmount(payload.rate);
    if (!rate.ok) {
      this.setFeedback(rate.error === "Cannot be negative." ? "Could not save " + payload.name + ". Rate cannot be negative." : "Could not save " + payload.name + ". Rate must be a number.", true);
      return;
    }
    const terms = this.clientAmount(payload.terms);
    if (!terms.ok) {
      this.setFeedback(terms.error === "Cannot be negative." ? "Could not save " + payload.name + ". Payment terms cannot be negative." : "Could not save " + payload.name + ". Payment terms must be a number.", true);
      return;
    }
    payload.rate = rate.value;
    payload.terms = terms.value;
    this.saving = true;
    this.loading = true;
    this.loadingLabel = "Saving the client…";
    this.clientButtonLabel = "Saving…";
    try {
      if (this.previewMode) {
        await this.wait(800);
        const records = (this.clientRecords || []).map((row) => Object.assign({}, row));
        const original = payload.originalName.toLowerCase();
        const duplicate = records.find((row) => row.name.toLowerCase() === payload.name.toLowerCase() && row.name.toLowerCase() !== original);
        if (duplicate) {
          this.setFeedback("Could not save " + payload.name + ". That client is already in the list.", true);
          return;
        }
        const next = {
          name: payload.name,
          address1: payload.address1,
          address2: payload.address2,
          address3: payload.address3,
          address4: payload.address4,
          rate: payload.rate,
          contact: payload.contact,
          email: payload.email,
          phone: payload.phone,
          terms: payload.terms
        };
        if (payload.originalName) {
          const index = records.findIndex((row) => row.name.toLowerCase() === original);
          if (index < 0) {
            this.setFeedback("Could not save " + payload.name + ". That client is no longer in the list.", true);
            return;
          }
          records[index] = next;
        } else {
          records.push(next);
        }
        this.applyClientRecords(records);
        this.clientView = "list";
        this.setFeedback(this.clientSavedMessage(payload), false);
        return;
      }
      const res = await this.api("saveClient", payload, { write: true });
      if (res && /Invalid API action/.test(String(res.error || ""))) {
        this.setFeedback("Could not save " + payload.name + ". The live script does not save clients yet. Open the EverydayWork spreadsheet, Extensions, Apps Script, and replace Code.gs. Run authorizeEverydayWork and choose Allow. Open Deploy, Manage deployments, edit this web app, set Version to New version, and Deploy.", true);
        return;
      }
      if (res && res.success) {
        if (Array.isArray(res.clientRecords)) this.applyClientRecords(res.clientRecords);
        this.adoptWrite(res);
        this.clientView = "list";
        const named = res.message && String(res.message).indexOf(payload.name) !== -1
          ? res.message
          : this.clientSavedMessage(payload);
        this.setFeedback(named, false);
        return;
      }
      this.setFeedback(this.failMessage(res, "Could not save client " + payload.name + "."), true);
    } catch (err) {
      this.setFeedback("Could not save client " + payload.name + ".", true);
    } finally {
      this.saving = false;
      this.loading = false;
      this.loadingLabel = "Updating…";
      this.clientButtonLabel = "Save client";
    }
  },

  rememberLoggedJob(code, rawId, status) {
    const id = String(code || rawId || "").trim();
    if (!id) return;
    const raw = String(rawId || "").trim();
    if (this.invoices.some((inv) => inv.id === id || (raw && inv.id === raw))) return;
    const parts = this.jobDateParts(this.form.date);
    const labelStatus = status || "Draft";
    this.invoices = this.invoices.concat([{
      id: id,
      clientName: this.form.clientName,
      status: labelStatus,
      date: parts ? parts.iso : this.form.date,
      label: (labelStatus === "Quote" ? "Quote " : "Invoice ") + id + " · " + labelStatus
    }]);
    this.refreshClientInvoices();
  },
  todayLabel() {
    const now = new Date();
    return String(now.getDate()).padStart(2, "0") + "/" + String(now.getMonth() + 1).padStart(2, "0") + "/" + now.getFullYear();
  },
  jobHours() {
    const start = this.timeToMinutes(this.form.start);
    const finish = this.timeToMinutes(this.form.finish);
    if (start == null || finish == null) return 0;
    let minutes = finish - start;
    if (minutes <= 0) minutes += 24 * 60;
    const breaks = { na: 0, "half hour": 30, hour: 60, "hour and half": 90, "two hours": 120 };
    const lunch = breaks[this.form.lunch] || 0;
    return Math.max(0, Math.round((minutes - lunch) / 6) / 10);
  },
  jobCharge() {
    const record = this.clientRecordFor(this.form.clientName);
    const rate = record && record.rate !== "" && record.rate != null ? Number(record.rate) : 0;
    if (!isFinite(rate)) return 0;
    return Math.round(this.jobHours() * rate * 100) / 100;
  },
  loggedJobSnapshot(amount, costs) {
    const parts = this.jobDateParts(this.form.date);
    const record = this.clientRecordFor(this.form.clientName);
    const extra = costs || {};
    return {
      client: this.form.clientName,
      iso: parts ? parts.iso : "",
      jobDetails: this.form.jobDetails,
      jobName: String(this.form.jobName || "").trim(),
      start: this.form.start,
      finish: this.form.finish,
      hours: this.jobHours(),
      amount: amount,
      rate: record && record.rate !== "" && record.rate != null ? Number(record.rate) : 0,
      email: record && record.email ? record.email : "",
      materials: extra.materials || 0,
      hired: extra.hired || 0,
      mileageKm: extra.mileageKm || 0,
      mileageRate: expenseAmount(this.settingsForm.mileageRate) || 0,
      loadedHourly: expenseAmount(this.settingsForm.loadedCost) || 0
    };
  },
  showLoggedJob(code, rawId, amount) {
    const label = String(code || rawId || "").trim();
    const lead = this.quoteMode ? "Quote logged" : "Job logged";
    this.jobLogged = {
      text: lead + " · " + label + " · " + this.money(amount),
      id: String(rawId || code || "").trim(),
      code: label
    };
  },
  placeLoggedDraft(code, rawId, snapshot, status) {
    const label = String(code || rawId || "").trim();
    const id = String(rawId || code || "").trim();
    if (!label) return;
    const labelStatus = status || "Draft";
    const rows = (this.previewMode && Array.isArray(this.quoteBookRows) ? this.quoteBookRows : (this.invoiceRows || [])).slice();
    let row = rows.find((item) => sameInvoiceNumber(item, id, label));
    const line = {
      date: snapshot.iso,
      details: snapshot.jobDetails,
      start: snapshot.start,
      finish: snapshot.finish,
      hours: snapshot.hours,
      rate: snapshot.rate,
      amount: snapshot.amount,
      priceLabel: snapshot.priceLabel || "",
      materials: snapshot.materials || 0,
      hired: snapshot.hired || 0,
      mileageKm: snapshot.mileageKm || 0,
      mileageRate: snapshot.mileageRate || 0,
      loadedHourly: snapshot.loadedHourly || 0
    };
    if (!row) {
      rows.push({
        id: id,
        code: label,
        clientName: snapshot.client,
        status: labelStatus,
        kind: kindForStatus(labelStatus),
        date: snapshot.iso,
        dueDate: "",
        hours: snapshot.hours,
        total: snapshot.amount,
        rate: snapshot.rate || 0,
        jobDetails: snapshot.jobDetails || "",
        jobName: snapshot.jobName || "",
        servicePeriod: snapshot.iso,
        email: snapshot.email || "",
        lines: [line]
      });
    } else if (this.previewMode && Array.isArray(row.lines)) {
      if (snapshot.jobName && !jobNameKey(row.jobName)) row.jobName = snapshot.jobName;
      row.lines = row.lines.concat([line]);
      row.hours = row.lines.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
      row.total = row.lines.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }
    if (this.previewMode) {
      this.quoteBookRows = rows;
      this.quoteBookReady = true;
      this.invoiceRows = collapseInvoiceRows(rows);
    } else {
      this.invoiceRows = rows;
    }
    this.recomputeOpenPiles();
  },
  resetJobForm() {
    const client = this.form.clientName;
    this.form.clientName = client;
    this.form.date = this.todayLabel();
    this.form.jobDetails = "";
    this.form.jobName = "";
    this.form.start = "08:00";
    this.form.lunch = "na";
    this.form.finish = "16:30";
    this.form.materials = "";
    this.form.hired = "";
    this.form.mileageKm = "";
    this.form.invoiceMode = "new";
    this.form.invoiceId = "";
    this.form.days = "";
    this.form.dayLength = "8";
    this.form.dailyRate = "";
    this.form.jobPrice = "";
    this.setPriceMode("hourly");
    this.syncOvernight();
    this.refreshClientInvoices();
    this.syncLogButton();
  },
  viewLoggedInvoice() {
    const logged = this.jobLogged || {};
    const row = (this.invoiceRows || []).find((item) => sameInvoiceNumber(item, logged.id, logged.code));
    const id = row ? row.id : (logged.id || logged.code);
    if (!id) return;
    this.currentTab = "dashboard";
    this.syncTabClasses();
    this.jobLogged = { text: "", id: "", code: "" };
    this.openInvoice(id);
  },
  async submitForm() {
    if (this.saving) return;
    this.clearFeedback();
    const noun = this.quoteMode ? "quote" : "job";
    if (!this.form.clientName) {
      this.setFeedback("Could not log the " + noun + ". Choose a client.", true);
      return;
    }
    const jobDate = this.jobDateParts(this.form.date);
    if (!jobDate) {
      this.setFeedback("Could not log the " + noun + ". Enter the date as day/month/year, for example 30/09/2026.", true);
      return;
    }
    this.form.date = jobDate.label;
    const priceMode = this.form.priceMode || "hourly";
    const priced = priceJobPreview({
      priceMode: priceMode,
      days: this.form.days,
      dayLength: this.form.dayLength,
      rate: this.form.dailyRate,
      jobPrice: this.form.jobPrice,
      start: this.form.start,
      finish: this.form.finish,
      lunch: this.form.lunch
    });
    if (priceMode === "hourly") {
      if (this.timeToMinutes(this.form.start) == null || this.timeToMinutes(this.form.finish) == null) {
        this.setFeedback("Could not log the " + noun + ". Choose a start and finish time.", true);
        return;
      }
    } else if (!priced.ok) {
      this.setFeedback("Could not log the " + noun + ". " + priced.error, true);
      return;
    }
    if (!this.quoteMode && this.form.invoiceMode === 'existing' && !this.form.invoiceId) {
      this.setFeedback("Could not log the job. Choose a draft invoice, or start a new one.", true);
      return;
    }
    if (!this.quoteMode && this.form.invoiceMode === 'existing') {
      const chosen = (this.invoices || []).find((inv) => inv.id === String(this.form.invoiceId));
      if (chosen && !this.isDraftStatus(chosen.status)) {
        this.setFeedback("Could not log the job. Time can't be added once an invoice leaves Draft. Invoice " + chosen.id + " is " + chosen.status + ".", true);
        return;
      }
    }
    const materials = expenseAmount(this.form.materials);
    const hired = expenseAmount(this.form.hired);
    const mileageKm = expenseAmount(this.form.mileageKm);
    if (materials == null || hired == null || mileageKm == null) {
      this.setFeedback("Could not log the job. Enter materials, hired equipment, and mileage as numbers, or leave them blank.", true);
      return;
    }
    this.syncOvernight();
    this.saving = true;
    this.loading = true;
    this.loadingLabel = this.quoteMode ? "Saving the quote…" : "Saving the job…";
    this.syncLogButton();
    const adding = !this.quoteMode && this.form.invoiceMode === "existing";
    const chosenId = this.form.invoiceId;
    try {
      const estimate = priceMode === "hourly" ? this.jobCharge() : priced.total;
      const snapshot = this.loggedJobSnapshot(estimate, { materials: materials, hired: hired, mileageKm: mileageKm });
      if (priceMode === "daily") {
        snapshot.hours = priced.hours;
        snapshot.rate = priced.rate;
        snapshot.priceLabel = priced.label;
        snapshot.start = "";
        snapshot.finish = "";
      }
      if (priceMode === "job") {
        snapshot.hours = 0;
        snapshot.rate = 0;
        snapshot.priceLabel = "Job price";
        snapshot.start = "";
        snapshot.finish = "";
      }
      if (this.previewMode) {
        await this.wait(800);
        const code = this.quoteMode ? "INV-EB-019" : (adding && chosenId ? chosenId : "INV-EB-018");
        this.rememberLoggedJob(code, code, this.quoteMode ? "Quote" : "Draft");
        this.showLoggedJob(code, code, estimate);
        this.placeLoggedDraft(code, code, snapshot, this.quoteMode ? "Quote" : "Draft");
        this.resetJobForm();
        return;
      }
      const entry = {
        clientName: this.form.clientName,
        date: jobDate.iso,
        jobDetails: this.form.jobDetails,
        jobName: String(this.form.jobName || "").trim(),
        start: this.form.start,
        lunch: this.form.lunch,
        finish: this.form.finish,
        overnight: this.overnight,
        invoiceMode: this.quoteMode ? "quote" : this.form.invoiceMode,
        invoiceId: this.quoteMode ? "" : this.form.invoiceId,
        materials: materials,
        hired: hired,
        mileageKm: mileageKm,
        priceMode: priceMode,
        days: this.form.days,
        dayLength: this.form.dayLength,
        rate: this.form.dailyRate,
        jobPrice: this.form.jobPrice
      };
      if (this.quoteMode) entry.entry = "quote";
      const result = await this.api('logTimeEntry', entry, { write: true });
      if (result && result.success) {
        const amount = result.amount != null && isFinite(Number(result.amount)) ? Number(result.amount) : estimate;
        const code = result.invoiceCode || result.invoiceId;
        const rawId = result.invoiceId || code;
        snapshot.amount = amount;
        this.rememberLoggedJob(code, rawId, this.quoteMode ? "Quote" : "Draft");
        this.showLoggedJob(code, rawId, amount);
        this.resetJobForm();
        await this.refreshSnapshot({ quiet: true, announce: false, resync: true });
        const found = (this.invoiceRows || []).some((item) => sameInvoiceNumber(item, rawId, code));
        if (!found) this.placeLoggedDraft(code, rawId, snapshot, this.quoteMode ? "Quote" : "Draft");
        return;
      }
      this.setFeedback(this.failMessage(result, "Could not log the " + noun + " for " + this.form.clientName + " on " + jobDate.label + ". " + this.unreachableMessage(true)), true);
    } finally {
      this.saving = false;
      this.loading = false;
      this.loadingLabel = "Updating…";
      this.syncLogButton();
    }
  },

  money(n) {
    const value = Number(n) || 0;
    const sign = value < 0 ? "-" : "";
    const parts = Math.abs(value).toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return sign + "€" + parts[0] + "." + parts[1];
  },
  hoursText(n) {
    const value = Math.round((Number(n) || 0) * 10) / 10;
    return Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1);
  },
  countLabel(n, singular, plural) {
    const value = Number(n) || 0;
    return value + " " + (value === 1 ? singular : plural);
  },
  prettyDate(iso) {
    if (!iso) return "—";
    const parts = String(iso).split("-");
    if (parts.length < 3) return String(iso);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[Number(parts[1]) - 1] || parts[1];
    return Number(parts[2]) + " " + month + " " + parts[0];
  },
  syncPeriodClasses() {
    this.periodWeekClass = this.period === "week" ? "seg-on" : "";
    this.periodMonthClass = this.period === "month" ? "seg-on" : "";
    this.periodQuarterClass = this.period === "quarter" ? "seg-on" : "";
    this.periodYearClass = this.period === "year" ? "seg-on" : "";
  },
  syncActive() {
    const period = (this.periodData && this.periodData[this.period]) || {};
    this.activeLabel = period.label || "";
    this.activeHours = this.hoursText(period.hours);
    this.activeShifts = this.countLabel(period.shifts, "shift", "shifts");
    this.activeClients = this.countLabel(period.clients, "client", "clients");
    this.activeBillable = this.money(period.billable);
    this.activeAvg = this.money(period.avgRate);
    this.activeTop = period.topClient ? (period.topClient + " · " + this.hoursText(period.topClientHours) + " h") : "—";
   /* const notes = {
      week: "Hours and value are for this week only.",
      month: "Hours and value are for this month only.",
      quarter: "Hours and value are for this quarter only.",
      year: "Hours and value are for this financial year."
    };
    this.periodNote = notes[this.period] || notes.month;*/
    this.syncSummary();
  },
  syncSummary() {
    const year = (this.periodData && this.periodData.year) || {};
    const work = roundCents(year.billable);
    const writtenOff = roundCents(year.writtenOff != null ? year.writtenOff : year.badDebt);
    const expenses = expenseAmount(this.taxExpenses);
    const profit = expenses == null ? null : roundCents(work - writtenOff - expenses);
    const tax = estimateSoleTraderTax(profit == null ? 0 : profit);
    this.summaryPeriod = year.label || "Financial year";
    this.summaryWork = this.money(work);
    this.summaryHours = this.countLabel(year.shifts, "shift", "shifts");
    this.summaryPaid = this.money(year.paid);
    this.summaryDue = this.money(year.due);
    this.summaryWrittenOff = this.money(writtenOff);
    this.summaryVat = this.money(vatOnInvoiced(this.invoiceRows));
    this.summaryExpenseNote = expenses == null ? "Enter expenses as a number, for example 1500." : "";
    this.summaryProfit = profit == null ? "—" : this.money(profit);
    this.summaryIncomeTax = this.money(tax.incomeTax);
    this.summaryUsc = this.money(tax.usc);
    this.summaryPrsi = this.money(tax.prsi);
    this.summaryTax = this.money(profit == null ? 0 : tax.total);
  },
  dueNote(row) {
    if (!row || !row.dueDate) return row && row.kind === "draft" ? "Not sent" : "";
    let note = "Due " + this.prettyDate(row.dueDate);
    if (row.overdue) {
      const days = Number(row.daysOverdue) || 0;
      note += " · " + days + (days === 1 ? " day overdue" : " days overdue");
    } else if (row.kind === "due" && row.dueDate === this.asOf) {
      note += " · due today";
    }
    return note;
  },
  invoiceMeta(row) {
    const bits = [];
    if (row.clientName) bits.push(row.clientName);
    if (row.date) bits.push(this.prettyDate(row.date));
    const due = this.dueNote(row);
    if (due) bits.push(due);
    return bits.join(" · ");
  },
  syncVisibleInvoices() {
    const flags = { week: "inWeek", month: "inMonth", quarter: "inQuarter", year: "inYear" };
    const flag = flags[this.period] || "inMonth";
    let rows = this.invoiceRows || [];
    if (this.listScope === "period") rows = rows.filter((row) => row[flag]);
    const filter = this.invoiceFilter;
    if (filter === "due") rows = rows.filter((row) => row.kind === "due");
    else if (filter === "overdue") rows = rows.filter((row) => invoiceIsOverdue(row, this.asOf));
    else if (filter === "send" || filter === "draft") rows = rows.filter((row) => row.kind === "draft");
    else if (filter === "done") rows = rows.filter((row) => row.kind === "paid" || row.kind === "writtenoff");
    else if (filter === "quote") rows = rows.filter((row) => row.kind === "quote" || row.status === "Quote");
    const showStatus = filter === "send" || filter === "draft" || filter === "done" || filter === "quote";
    this.listShowsSend = filter === "send" || filter === "draft";
    this.listShowsCollect = filter === "due" || filter === "overdue";
    this.listShowsDone = filter === "done";
    this.listShowsQuote = filter === "quote";
    this.visibleInvoices = rows.map((row) => {
      const code = row.code || row.id;
      const status = row.status || "Draft";
      const facts = invoiceCardFacts(row);
      return {
        id: row.id,
        client: row.clientName || "No client",
        line: showStatus ? (code + " · " + status) : code,
        period: facts.period,
        when: facts.when,
        hours: facts.hours,
        work: facts.work,
        amount: this.money(invoicePayable(row).payable)
      };
    });
    this.listEmpty = this.visibleInvoices.length === 0;
    this.listEmptyLabel = filter === "overdue" ? "Nothing is overdue." : "Nothing waiting here.";
    this.listShowsHint = !this.listEmpty && !!this.listHint;
  },
  applyDashboard(res, keepEmail) {
    const keepView = this.dashView;
    const keepId = this.detailId;
    if (res.businessName) this.businessName = res.businessName;
    this.asOf = res.asOf || "";
    this.periodData = res.periods || {};
    const incoming = Array.isArray(res.invoices) ? res.invoices : [];
    if (this.previewMode && !this.quoteBookReady) {
      this.quoteBookRows = incoming.map(cloneInvoiceRow);
      this.quoteBookReady = true;
    }
    const source = this.previewMode && Array.isArray(this.quoteBookRows) ? this.quoteBookRows : incoming;
    this.invoiceRows = collapseInvoiceRows(source);
    const open = res.open || {};
    this.openSendAmount = this.money(open.draftAmount);
    this.openSendCount = this.countLabel(open.draftCount, "invoice", "invoices");
    this.openCollectAmount = this.money(open.dueAmount);
    let collect = this.countLabel(open.dueCount, "invoice", "invoices");
    if (open.overdueCount) collect += " · " + this.countLabel(open.overdueCount, "overdue", "overdue");
    this.openCollectCount = collect;
    const doneBits = [];
    if (open.paidCount) doneBits.push(this.countLabel(open.paidCount, "paid", "paid"));
    if (open.writtenOffCount) doneBits.push(this.countLabel(open.writtenOffCount, "written off", "written off"));
    this.openDoneAmount = this.money(open.paidAmount);
    this.openDoneCount = doneBits.length ? doneBits.join(" · ") : "0 invoices";
    this.recomputeOpenPiles();
    this.syncPeriodClasses();
    this.syncActive();
    this.syncVisibleInvoices();
    this.syncProfitJobs();
    if (keepView === "detail" && keepId) {
      const row = this.invoiceRows.find((item) => sameInvoiceNumber(item, keepId, keepId));
      if (row) this.fillDetail(row, row.lines || this.detailLinesRaw || [], keepEmail);
      else this.dashView = "home";
    } else {
      this.dashView = keepView || "home";
    }
  },
  snapshotKey() { return "everydaywork-snapshot-v1"; },
  storedSnapshot() {
    try {
      if (typeof localStorage === "undefined") return null;
      const parsed = JSON.parse(localStorage.getItem(this.snapshotKey()) || "null");
      if (!parsed || !parsed.res || !parsed.res.success || !parsed.res.periods) return null;
      return parsed.res;
    } catch (err) {
      return null;
    }
  },
  rememberSnapshot(res) {
    try {
      if (typeof localStorage === "undefined" || !res || !res.success) return;
      localStorage.setItem(this.snapshotKey(), JSON.stringify({ savedAt: Date.now(), res: res }));
    } catch (err) {}
  },
  takeSnapshot(res) {
    if (res && res.snapshot && res.snapshot.success && res.snapshot.periods) return res.snapshot;
    if (res && res.success && res.periods && Array.isArray(res.invoices)) return res;
    return null;
  },
  applyClientList(list) {
    this.clients = (Array.isArray(list) ? list : []).map((c) => {
      if (typeof c === "string") return { name: c };
      return { name: (c && (c.name || c.Name || c.clientName)) || "" };
    }).filter((c) => c.name);
  },
  applySnapshot(res, keepEmail) {
    if (Array.isArray(res.clientRecords)) this.applyClientRecords(res.clientRecords);
    else if (Array.isArray(res.clients) && res.clients.length && !this.clientDetailsLive) {
      this.applyClientRecords(res.clients.map((client) => ({
        name: typeof client === "string" ? client : ((client && (client.name || client.Name || client.clientName)) || ""),
        partial: true
      })));
    } else if (Array.isArray(res.clients) && res.clients.length) this.applyClientList(res.clients);
    this.unbilled = res.unbilled || {};
    this.applyDashboard(res, keepEmail);
    if (Array.isArray(res.invoices)) {
      this.invoices = this.mapInvoices(res.invoices);
      this.refreshClientInvoices();
    }
    this.ccNeedsDeploy = !this.previewMode && res.emailCc !== true;
    if (!this.previewMode && res.invoicePdf !== "inv-template-plain") {
      this.dashboardNote = "The invoice still shows the sheet grid. Open the EverydayWork spreadsheet https://docs.google.com/spreadsheets/d/1YN1xWdA7OScbXZj72yB5EyjrYA2zsJqwTTJ7-VdTxhM/edit then Extensions, Apps Script, and replace Code.gs. Run authorizeEverydayWork and choose Allow. Open Deploy, Manage deployments, edit the web app, set Version to New version, and Deploy. Keep this web app URL.";
    }
  },
  adoptWrite(res) {
    const snapshot = this.takeSnapshot(res);
    if (!snapshot) return false;
    this.dashboardLive = true;
    this.dashboardNote = "";
    this.applySnapshot(snapshot, true);
    this.rememberSnapshot(snapshot);
    return true;
  },
  async refreshBooks() {
    if (this.previewMode) return;
    await this.refreshSnapshot({ quiet: false, announce: true, resync: true });
    if (this.currentTab === "settings") await this.loadSettings();
  },
  async refreshSnapshot(opts) {
    const quiet = !!(opts && opts.quiet);
    const announce = !opts || opts.announce !== false;
    if (this.previewMode) {
      await this.loadDashboard();
      return;
    }
    try {
      let res = await this.api("getAppSnapshot", {}, { quiet: quiet });
      if (res && (res.status === 401 || res.status === 403)) {
        if (!(opts && opts.background)) this.noteResyncFailed(res);
        return;
      }
      if (res && /Invalid API action/.test(String(res.error || ""))) {
        if (!this.clients.length) {
          const initial = await this.api("getInitialAppData", {}, { quiet: quiet });
          if (initial && initial.success) {
            if (Array.isArray(initial.clientRecords)) this.applyClientRecords(initial.clientRecords);
            else this.applyClientList(initial.clients);
            this.invoices = this.mapInvoices(initial.invoices);
            this.refreshClientInvoices();
          }
        }
        res = await this.api("getDashboard", {}, { quiet: quiet });
      }
      const snapshot = this.takeSnapshot(res);
      if (snapshot) {
        this.dashboardLive = true;
        this.dashboardNote = "";
        this.applySnapshot(snapshot, true);
        this.rememberSnapshot(snapshot);
        this.clearUnreachableFeedback();
        if (announce && !quiet) this.setFeedback((this.activeLabel || "Dashboard") + " is loaded.", false);
        return;
      }
      if (res && /Invalid API action/.test(String(res.error || ""))) {
        this.dashboardLive = false;
        this.dashboardNote = "The live script does not have the dashboard yet. Replace Code.gs in Apps Script, deploy a new version, and approve Drive access.";
        this.setFeedback(this.dashboardNote, true);
      } else if (!quiet || (opts && opts.resync)) {
        this.noteResyncFailed(res);
      }
    } catch (err) {
      if (!quiet || (opts && opts.resync)) this.noteResyncFailed(null);
    }
  },
  noteResyncFailed(res) {
    const message = this.failMessage(res, "Could not read the client list. Use Refresh.");
    if (this.feedback.text && !this.feedback.isError) {
      this.setFeedback(this.feedback.text + " " + message, true);
      return;
    }
    this.setFeedback(message, true);
  },
  async loadDashboard(opts) {
    const quiet = opts && opts.quiet;
    if (this.previewMode) {
      this.dashboardLive = false;
      this.dashboardNote = "Sample figures for the layout. Live totals appear after Code.gs is pasted into Apps Script and deployed.";
      const sample = sampleDashboard();
      this.unbilled = sample.unbilled || {};
      this.applyClientRecords(sample.clientRecords || sample.clients || []);
      this.invoices = this.mapInvoices(sample.invoices);
      this.refreshClientInvoices();
      this.applyDashboard(sample, true);
      return;
    }
    try {
      const res = await this.api("getDashboard");
      if (res && res.success) {
        this.dashboardLive = true;
        this.dashboardNote = "";
        this.applyDashboard(res, true);
        if (!quiet) this.setFeedback((this.activeLabel || "Dashboard") + " is loaded.", false);
      } else if (res && /Invalid API action/.test(String(res.error || ""))) {
        this.dashboardLive = false;
        this.dashboardNote = "The live script does not have the dashboard yet. Replace Code.gs in Apps Script, deploy a new version, and approve Drive access.";
        this.setFeedback(this.dashboardNote, true);
      } else {
        this.setFeedback(this.failMessage(res, "Could not load the dashboard."), true);
      }
    } catch (err) {
      if (!quiet) this.setFeedback("Could not load the dashboard.", true);
    }
  },
  setPeriod(id) {
    if (id !== "week" && id !== "month" && id !== "quarter" && id !== "year") return;
    this.period = id;
    this.syncPeriodClasses();
    this.syncActive();
    if (this.dashView === "list" && this.listScope === "period") this.openList("period-" + this.invoiceFilter);
    else this.syncVisibleInvoices();
  },
  openList(filter) {
    const periodScoped = String(filter).indexOf("period-") === 0;
    const kind = periodScoped ? String(filter).slice(7) : String(filter);
    this.invoiceFilter = kind;
    this.listScope = periodScoped ? "period" : "open";
    const titles = {
      due: "Invoices to collect",
      overdue: "Overdue",
      send: "Invoices to send",
      draft: "Invoices to send",
      done: "Finished invoices",
      quote: "Quotes"
    };
    this.listTitle = (titles[kind] || "Invoices") + (periodScoped && this.activeLabel ? " · " + this.activeLabel : "");
    const hints = {
      due: "Tap an invoice to check it, or mark it paid.",
      overdue: "These invoices are past the due date. Open one to remind the client.",
      send: "Tap an invoice to check it, then mark it invoiced.",
      draft: "Tap an invoice to check it, then mark it invoiced.",
      done: "Tap an invoice to check it. Undo puts it back to collect.",
      quote: "Open a quote, then turn it into an invoice."
    };
    this.listHint = hints[kind] || "";
    this.dashView = "list";
    this.driveUrl = "";
    this.clearFeedback();
    this.syncVisibleInvoices();
    this.scrollPage();
    if (kind === "due" || kind === "overdue" || kind === "send" || kind === "draft") this.startPayWatch();
    else this.stopPayWatch();
  },
  openProfitList() {
    this.syncProfitJobs();
    this.dashView = "profit";
    this.driveUrl = "";
    this.clearFeedback();
    this.scrollPage();
    this.stopPayWatch();
  },
  syncProfitJobs() {
    const jobs = jobsByProfit(this.invoiceRows);
    this.profitJobs = jobs.map((job) => ({
      title: (job.clientName || "No client") + (job.details ? " · " + job.details : ""),
      meta: [job.code, job.date ? this.prettyDate(job.date) : ""].filter(Boolean).join(" · "),
      profit: this.money(job.profit),
      due: this.money(job.due),
      materials: this.money(job.materials),
      hired: this.money(job.hired),
      mileage: job.km + " km × " + this.money(job.mileageRate) + " = " + this.money(job.mileageMoney),
      loaded: this.money(job.loadedHourly) + " × " + this.hoursText(job.hours) + " h = " + this.money(job.loadedMoney)
    }));
    this.profitJobsEmpty = this.profitJobs.length === 0;
  },
  profitSentence(figured) {
    const jobs = (figured && figured.jobs) || [];
    const materials = roundCents(jobs.reduce((sum, job) => sum + job.materials, 0));
    const hired = roundCents(jobs.reduce((sum, job) => sum + job.hired, 0));
    const mileageMoney = roundCents(jobs.reduce((sum, job) => sum + job.mileageMoney, 0));
    const loadedMoney = roundCents(jobs.reduce((sum, job) => sum + job.loadedMoney, 0));
    let mileage = this.money(mileageMoney);
    let loaded = this.money(loadedMoney);
    if (jobs.length === 1) {
      const job = jobs[0];
      mileage = this.money(job.mileageMoney) + " (" + job.km + " km × " + this.money(job.mileageRate) + ")";
      loaded = this.money(job.loadedMoney) + " (" + this.money(job.loadedHourly) + " × " + this.hoursText(job.hours) + " h)";
    }
    return this.money(figured.due) + " due, minus " + this.money(materials) + " materials, " + this.money(hired) + " hired equipment, " + mileage + " mileage, and " + loaded + " loaded cost.";
  },
  showDashHome() {
    this.dashView = "home";
    this.driveUrl = "";
    this.clearFeedback();
    this.scrollPage();
    this.startPayWatch();
  },
  showDashList() {
    this.dashView = "list";
    this.driveUrl = "";
    this.clearFeedback();
    this.syncVisibleInvoices();
    this.scrollPage();
  },
  prettyPeriod(text) {
    const raw = String(text || "").trim();
    if (!raw || raw === "—") return "";
    return raw.split(/\s+-\s+/).map((part) => {
      const pretty = this.prettyDate(part.trim());
      return pretty === "—" ? part.trim() : pretty;
    }).join(" – ");
  },
  ccList(to) {
    const text = String(this.detailCc || "").trim();
    if (!text) return { ok: true, value: "" };
    const skip = String(to || "").trim().toLowerCase();
    const parts = text.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
    const kept = [];
    const seen = {};
    for (let i = 0; i < parts.length; i++) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parts[i])) {
        return { ok: false, error: "Enter a valid Cc address, or leave it blank." };
      }
      const key = parts[i].toLowerCase();
      if (key === skip || seen[key]) continue;
      seen[key] = true;
      kept.push(parts[i]);
    }
    return { ok: true, value: kept.join(", ") };
  },
  invoiceEmailSubject(name, code) {
    const business = String(name || "").trim();
    const invoice = String(code || "").trim();
    if (business && invoice) return business + " " + invoice;
    return business || invoice || "Invoice";
  },
  invoiceEmailDraft(row) {
    const lines = row.lines || [];
    const works = row.jobDetails || (lines[0] && lines[0].details) || "";
    const period = this.prettyPeriod(row.servicePeriod) || (row.date ? this.prettyDate(row.date) : "");
    const contact = String(row.contact || "").trim();
    const name = this.businessName || "EverydayWork";
    return [
      "To" + (contact ? " " + contact : ""),
      "Please find attached invoice for " + (period || "this period"),
      "Total owed " + this.money(invoicePayable(row).payable),
      "For works " + (works || "the works listed"),
      "",
      "Kind Regards",
      name
    ].join("\n");
  },
  noteIssued(res) {
    if (res && res.markedInvoiced) this.setDetailPhase("Invoiced");
  },
  previewIssue() {
    if (this.detailIsQuote) {
      this.setFeedback("Preview cannot print the PDF.", false);
      return;
    }
    const wasDraft = this.detailIsDraft;
    if (wasDraft) this.restampInvoice(this.detailId, "Invoiced");
    this.setFeedback(wasDraft
      ? "Preview cannot print the PDF. Invoice marked invoiced."
      : "Preview cannot print the PDF.", false);
  },
  homeStatusMessage(status) {
    if (status === "Paid") return "Marked paid.";
    if (status === "Written off") return "Written off.";
    if (status === "Undo") return "Back in invoices to collect.";
    return "Marked invoiced.";
  },
  noteInvoiceUpdated(message) {
    this.setFeedback(message, false);
    if (this.dashView !== "detail") return;
    setTimeout(() => {
      const node = document.querySelector(".invoice-sheet");
      if (!node) return;
      try { node.scrollIntoView({ block: "start" }); } catch (err) {}
    }, 60);
  },
  confirmOnHome(message) {
    this.currentTab = "dashboard";
    this.dashView = "home";
    this.syncTabClasses();
    this.scrollPage();
    this.setFeedback(message, false);
    setTimeout(() => this.scrollPage(), 120);
  },
  revealMarkInvoiced() {
    const go = () => {
      const node = document.getElementById("mark-invoiced");
      if (!node) return;
      try { node.scrollIntoView({ block: "center" }); } catch (err) {}
    };
    go();
    setTimeout(go, 120);
  },
  restampInvoice(id, status) {
    const rows = (this.invoiceRows || []).slice();
    const label = status === "Undo" ? "Invoiced" : status;
    let touched = false;
    rows.forEach((item) => {
      if (!sameInvoiceNumber(item, id, id)) return;
      touched = true;
      item.status = label;
      item.kind = kindForStatus(label);
    });
    if (!touched) return;
    this.invoiceRows = collapseInvoiceRows(rows);
    this.recomputeOpenPiles();
    this.syncVisibleInvoices();
    const open = (this.invoiceRows || []).find((item) => sameInvoiceNumber(item, id, id));
    if (open && (this.detailId === id || this.detailId === open.id)) {
      this.detailId = open.id;
      this.setDetailPhase(label);
    }
  },
  recomputeOpenPiles() {
    const rows = this.invoiceRows || [];
    const ofKind = (kind) => rows.filter((row) => row.kind === kind);
    const sum = (kind) => ofKind(kind).reduce((total, row) => total + invoicePayable(row).payable, 0);
    this.openSendAmount = this.money(sum("draft"));
    this.openSendCount = this.countLabel(ofKind("draft").length, "invoice", "invoices");
    const due = ofKind("due");
    const overdueRows = due.filter((row) => invoiceIsOverdue(row, this.asOf));
    const overdue = overdueRows.length;
    let collect = this.countLabel(due.length, "invoice", "invoices");
    if (overdue) collect += " · " + this.countLabel(overdue, "overdue", "overdue");
    this.openCollectAmount = this.money(sum("due"));
    this.openCollectCount = collect;
    const overdueSum = overdueRows.reduce((total, row) => total + invoicePayable(row).payable, 0);
    this.openOverdueAmount = this.money(overdueSum);
    this.openOverdueCount = this.countLabel(overdue, "invoice", "invoices");
    const quotes = ofKind("quote");
    this.openQuoteAmount = this.money(quotes.reduce((total, row) => total + invoicePayable(row).payable, 0));
    this.openQuoteCount = this.countLabel(quotes.length, "quote", "quotes");
    const paid = ofKind("paid");
    const written = ofKind("writtenoff");
    const doneBits = [];
    if (paid.length) doneBits.push(this.countLabel(paid.length, "paid", "paid"));
    if (written.length) doneBits.push(this.countLabel(written.length, "written off", "written off"));
    this.openDoneAmount = this.money(sum("paid"));
    this.openDoneCount = doneBits.length ? doneBits.join(" · ") : "0 invoices";
    this.syncOpenPiles(ofKind("draft").length, due.length, paid.length + written.length);
  },
  syncOpenPiles(sendCount, collectCount, doneCount) {
    const send = Number(sendCount) || 0;
    const collect = Number(collectCount) || 0;
    const done = Number(doneCount) || 0;
    this.openSendHas = send > 0;
    this.openSendEmpty = send < 1;
    this.openCollectHas = collect > 0;
    this.openCollectEmpty = collect < 1;
    this.openDoneHas = done > 0;
    this.openDoneEmpty = done < 1;
  },
  focusInvoice(id) {
    const row = (this.invoiceRows || []).find((item) => item.id === id);
    if (!row) return null;
    this.detailId = row.id;
    this.detailCode = row.code || row.id;
    return row;
  },
  fillDetail(row, lines, keepEmail) {
    const sameInvoice = !!keepEmail && this.detailId === row.id;
    this.detailId = row.id;
    this.detailCode = row.code || row.id;
    this.detailClient = row.clientName || "No client";
    this.detailStatus = row.status || "Draft";
    this.detailWhen = row.date ? this.prettyDate(row.date) : "—";
    this.detailDue = row.dueDate ? this.dueNote(row) : "No due date yet";
    this.detailDueDate = row.dueDate ? this.prettyDate(row.dueDate) : "—";
    this.detailHours = this.hoursText(row.hours) + " h";
    const pay = invoicePayable(row);
    this.detailShowsVat = pay.showsVat;
    this.detailNet = this.money(pay.net);
    this.detailVat = pay.showsVat && pay.vat != null ? this.money(pay.vat) : "";
    this.detailVatLabel = vatRateLabel(pay.rate);
    const fromSheet = this.prettyPeriod(row.servicePeriod);
    const facts = invoiceCardFacts({ servicePeriod: row.servicePeriod, lines: lines, date: row.date, hours: row.hours, jobDetails: row.jobDetails });
    this.detailPeriod = fromSheet || (facts.period && facts.period !== "—" ? facts.period : "—");
    this.detailJobShow = !!(row.jobDetails && row.jobDetails !== "—");
    const fromLine = (lines || []).map((line) => line && line.details).filter(Boolean)[0] || "";
    const job = row.jobDetails && row.jobDetails !== "—" ? row.jobDetails : fromLine;
    this.detailWork = job ? (job + " · " + this.detailHours) : this.detailHours;
    this.detailTotal = this.money(pay.payable);
    const figured = invoiceJobProfit(Object.assign({}, row, { lines: lines || row.lines || [] }));
    this.detailProfit = this.money(figured.profit);
    this.detailProfitNote = this.profitSentence(figured);
    this.detailService = row.servicePeriod || "—";
    this.detailJob = row.jobDetails || "—";
    this.detailJobName = String(row.jobName || "").trim();
    this.detailJobNameShow = !!this.detailJobName;
    const related = relatedInvoices(this.invoiceRows, row);
    this.detailRelatedLead = this.detailJobName ? ("Same job · " + this.detailJobName) : "";
    this.detailRelated = related.map((item) => ({
      id: item.id,
      code: item.code,
      status: item.status,
      amount: this.money(item.amount),
      payWord: item.payWord
    }));
    this.detailHasRelated = this.detailRelated.length > 0;
    const letterRow = this.invoiceLetterRow(row);
    const drafted = this.invoiceEmailDraft(letterRow);
    this.detailEmail = this.invoiceAddress(row);
    if (!sameInvoice) {
      this.detailCc = "";
      this.detailPayUrl = "";
      this.payCopied = false;
      this.emailOpen = false;
    }
    this.syncEmailToggle();
    if (row.kind === "paid" || row.kind === "writtenoff" || row.kind === "quote") {
      this.detailPayUrl = "";
      this.payCopied = false;
    } else if (!sameInvoice && row.payUrl) {
      this.detailPayUrl = String(row.payUrl).trim();
    }
    this.detailFrom = this.businessName || "EverydayWork";
    this.detailSubject = this.invoiceEmailSubject(this.detailFrom, this.detailCode);
    this.syncDetailChrome(row.status || "Draft");
    this.detailOverdue = invoiceIsOverdue(row, this.asOf);
    if (!sameInvoice || this.detailMessage === this.detailMessageAuto) {
      this.detailMessage = drafted;
      this.detailMessageAuto = drafted;
    }
    this.detailLinesRaw = lines || [];
    this.detailLines = this.detailLinesRaw.map((line) => ({
      when: this.prettyDate(line.date),
      details: line.details || "—",
      span: [line.start, line.finish].filter(Boolean).join("–"),
      hours: this.hoursText(line.hours) + " h",
      meta: (line.priceLabel
        ? [this.prettyDate(line.date), line.priceLabel]
        : [this.prettyDate(line.date), [line.start, line.finish].filter(Boolean).join("–"), this.hoursText(line.hours) + " h", line.rate ? (this.money(line.rate) + "/h") : ""]
      ).filter((part) => part && part !== "—").join(" · "),
      amount: this.money(line.amount)
    }));
    this.detailLinesEmpty = this.detailLines.length === 0;
    this.dashView = "detail";
    if (!keepEmail) this.scrollPage();
  },
  installPayWatch() {
    if (this.payWatchBound || this.previewMode) return;
    this.payWatchBound = true;
    const self = this;
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) return;
        self.onPayWatchReturn();
      });
    }
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("focus", function () {
        self.onPayWatchReturn();
      });
    }
  },
  payWatchRelevant() {
    if (this.previewMode || this.currentTab !== "dashboard") return false;
    if (this.dashView === "home") return true;
    if (this.dashView === "list") {
      return this.invoiceFilter === "due" || this.invoiceFilter === "overdue" || this.invoiceFilter === "send" || this.invoiceFilter === "draft";
    }
    if (this.dashView === "detail") {
      const row = (this.invoiceRows || []).find((item) => item.id === this.detailId);
      if (!row) return !!(this.detailIsDraft || this.detailCanFinish);
      return row.kind === "draft" || row.kind === "due";
    }
    return false;
  },
  rememberPayKinds() {
    const map = {};
    (this.invoiceRows || []).forEach((row) => {
      if (row && row.id) map[row.id] = row.kind || "";
    });
    this.payKinds = map;
  },
  startPayWatch() {
    if (this.previewMode) return;
    this.installPayWatch();
    this.payWatchUntil = Date.now() + this.payWatchMs;
    this.rememberPayKinds();
    if (this.payWatchTimer) return;
    const self = this;
    this.payWatchTimer = setInterval(function () { self.tickPayWatch(); }, this.payPollMs);
  },
  stopPayWatch() {
    if (this.payWatchTimer) {
      clearInterval(this.payWatchTimer);
      this.payWatchTimer = null;
    }
  },
  tickPayWatch() {
    if (this.previewMode || Date.now() > this.payWatchUntil || !this.payWatchRelevant()) {
      this.stopPayWatch();
      return;
    }
    if ((typeof document !== "undefined" && document.hidden) || this.saving || this.loading || this.payChecking) return;
    this.noticePayments();
  },
  onPayWatchReturn() {
    if (this.previewMode || !this.payWatchRelevant()) return;
    if ((typeof document !== "undefined" && document.hidden) || this.saving || this.loading) return;
    const now = Date.now();
    if (now - (this.payReturnAt || 0) < 1500) return;
    this.payReturnAt = now;
    this.noticePayments();
  },
  async noticePayments() {
    if (this.previewMode || this.payChecking || this.saving || this.loading) return;
    if (!this.payWatchRelevant()) return;
    this.payChecking = true;
    const before = this.payKinds || {};
    try {
      await this.refreshSnapshot({ quiet: true, announce: false, background: true });
      const notes = [];
      (this.invoiceRows || []).forEach((row) => {
        if (!row || !row.id) return;
        const was = before[row.id];
        if (was && was !== "paid" && row.kind === "paid") notes.push((row.code || row.id) + " paid");
      });
      if (notes.length) this.setFeedback(notes.join(" · "), false);
      this.rememberPayKinds();
    } finally {
      this.payChecking = false;
    }
  },
  watchInvoicePayment(row) {
    if (!row || (row.kind !== "draft" && row.kind !== "due")) return;
    this.startPayWatch();
    if (this.previewMode) return;
    this.requestPayLink(row.id || this.detailId);
  },
  applyPayUrl(invoiceId, payUrl) {
    const link = String(payUrl || "").trim();
    if (!link || this.detailId !== invoiceId) return;
    const row = (this.invoiceRows || []).find((item) => item.id === invoiceId);
    if (row && row.kind !== "draft" && row.kind !== "due") return;
    this.detailPayUrl = link;
  },
  async requestPayLink(invoiceId) {
    const id = String(invoiceId || "").trim();
    if (!id || this.previewMode) return { payUrl: "", skip: true };
    const current = this.payLinkSlot;
    if (current && current[0] === id) return current[1];
    const promise = this.fetchPayLink(id);
    const slot = [id, promise];
    this.payLinkSlot = slot;
    try {
      return await promise;
    } finally {
      if (this.payLinkSlot === slot) this.payLinkSlot = null;
    }
  },
  async fetchPayLink(invoiceId) {
    const linked = await this.api("ensurePaymentLink", { invoiceId: invoiceId }, { quiet: true, timeoutMs: 30000, write: true });
    if (!linked || linked.timedOut) return { timedOut: true, payUrl: "", skip: false };
    if (linked.success) {
      const payUrl = String(linked.payUrl || "");
      this.applyPayUrl(invoiceId, payUrl);
      return { payUrl: payUrl, skip: true };
    }
    if (String(linked.error || "").indexOf("Invalid API action") !== -1) {
      const created = await this.api("createPaymentLink", { invoiceId: invoiceId }, { quiet: true, timeoutMs: 30000, write: true });
      if (!created || created.timedOut) return { timedOut: true, payUrl: "", skip: false };
      if (String(created.error || "").indexOf("Invalid API action") !== -1) return { payUrl: "", skip: false };
      if (created.success) {
        const payUrl = String(created.payUrl || "");
        this.applyPayUrl(invoiceId, payUrl);
        return { payUrl: payUrl, skip: true };
      }
      return { payUrl: "", skip: true, failed: true };
    }
    return { payUrl: "", skip: true, failed: true };
  },
  toggleEmail() {
    this.emailOpen = !this.emailOpen;
    this.syncEmailToggle();
    if (!this.emailOpen) return;
    setTimeout(() => {
      const node = document.querySelector("#email-sheet button");
      if (!node) return;
      try { node.scrollIntoView({ block: "nearest" }); } catch (err) {}
    }, 60);
  },
  async openInvoice(id) {
    if (this.saving) return;
    const row = (this.invoiceRows || []).find((item) => item.id === id);
    if (!row) return;
    this.driveUrl = "";
    this.clearFeedback();
    if (this.previewMode || Array.isArray(row.lines)) {
      this.fillDetail(row, row.lines || []);
      this.watchInvoicePayment(row);
      return;
    }
    this.fillDetail(row, []);
    this.watchInvoicePayment(row);
    try {
      const res = await this.api("getInvoiceDetail", { invoiceId: id });
      if (res && res.success && res.invoice) {
        const merged = Object.assign({}, row, res.invoice);
        this.fillDetail(merged, res.invoice.lines || []);
        this.watchInvoicePayment(merged);
      } else {
        this.setFeedback(this.failMessage(res, "Could not load the invoice lines."), true);
      }
    } catch (err) {
      this.setFeedback("Could not load the invoice lines.", true);
    }
  },
  pdfSavedMessage(res) {
    const code = this.detailCode || this.detailId || "";
    const file = (res && res.fileName) || (code ? code + ".pdf" : "the invoice PDF");
    if (res && res.message && String(res.message).indexOf(file) !== -1) return res.message;
    let msg = "Saved " + file + " to the Invoices folder.";
    if (res && res.markedInvoiced && code) msg += " Invoice " + code + " marked invoiced.";
    return msg;
  },
  async saveInvoicePdf() {
    if (this.saving || !this.detailId) return;
    const code = this.detailCode || this.detailId;
    if (this.previewMode) {
      await this.withInvoiceWait("Saving the PDF…", () => this.wait(1500));
      this.setFeedback(this.pdfSavedMessage({ fileName: code + ".pdf" }), false);
      return;
    }
    this.clearFeedback();
    await this.withInvoiceWait("Saving the PDF…", async () => {
      try {
        const res = await this.api("exportInvoicePdf", this.pdfExportPayload("drive"), { quiet: true, timeoutMs: 60000, write: true });
        if (res && res.success) {
          this.driveUrl = res.url || "";
          this.noteIssued(res);
          this.setFeedback(this.pdfSavedMessage(res), false);
          if (res.markedInvoiced) {
            this.restampInvoice(this.detailId, "Invoiced");
            await this.refreshSnapshot({ quiet: true, announce: false, resync: true });
          }
        } else {
          this.showPdfError(res, "Could not save " + code + " to the Invoices folder.");
        }
      } catch (err) {
        this.setFeedback("Could not save " + code + " to the Invoices folder.", true);
      }
    });
  },
  async downloadInvoicePdf() {
    if (this.saving || !this.detailId) return;
    if (this.previewMode) {
      await this.withInvoiceWait("Downloading the PDF…", () => this.wait(1500));
      this.previewIssue();
      return;
    }
    this.clearFeedback();
    await this.withInvoiceWait("Downloading the PDF…", async () => {
      try {
        const res = await this.api("exportInvoicePdf", this.pdfExportPayload("download"), { quiet: true, timeoutMs: 60000, write: true });
        if (res && res.success && res.pdfBase64) {
          this.savePdfFile(res.fileName, res.pdfBase64);
          this.noteIssued(res);
          this.setFeedback(res.message || "PDF downloaded. Attach it to your email.", false);
          if (res.markedInvoiced) {
            this.restampInvoice(this.detailId, "Invoiced");
            await this.refreshSnapshot({ quiet: true, announce: false, resync: true });
          }
        } else {
          this.setFeedback(this.failMessage(res, "Could not download the PDF."), true);
        }
      } catch (err) {
        this.setFeedback("Could not download the PDF.", true);
      }
    });
  },
  async emailInvoicePdf() {
    if (this.saving || !this.detailId) return;
    const email = String(this.detailEmail || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.setFeedback("Enter an email address to send the invoice.", true);
      return;
    }
    const cc = this.ccList(email);
    if (!cc.ok) {
      this.setFeedback(cc.error, true);
      return;
    }
    if (this.previewMode) {
      await this.withInvoiceWait("Sending the invoice…", () => this.wait(1500));
      this.emailOpen = false;
      this.syncEmailToggle();
      this.setFeedback(this.emailedBanner(email), false);
      this.revealMarkInvoiced();
      return;
    }
    this.clearFeedback();
    this.saving = true;
    this.loading = true;
    let payUrl = "";
    let skipPayLink = false;
    let payLinkFailed = false;
    try {
      this.loadingLabel = this.detailPayUrl ? "Sending the invoice…" : "Creating the pay link…";
      this.syncPdfLabels(this.loadingLabel);
      const linked = await this.requestPayLink(this.detailId);
      if (!linked || linked.timedOut) {
        this.setFeedback("That took too long, so it was stopped. Check the invoice before you try again.", true);
        return;
      }
      payUrl = String(linked.payUrl || "");
      skipPayLink = !!linked.skip;
      payLinkFailed = !!linked.failed;
      this.loadingLabel = "Sending the invoice…";
      this.syncPdfLabels(this.loadingLabel);
      const payload = {
        invoiceId: this.detailId,
        mode: "email",
        email: email,
        cc: cc.value,
        message: this.detailMessage
      };
      if (skipPayLink) {
        payload.payUrl = payUrl;
        payload.skipPayLink = true;
        if (payLinkFailed) payload.payLinkFailed = true;
      }
      const res = await this.api("exportInvoicePdf", payload, { quiet: true, timeoutMs: 60000, write: true });
      if (res && res.success) {
        if (res.payUrl) this.applyPayUrl(this.detailId, res.payUrl);
        this.emailOpen = false;
        this.syncEmailToggle();
        this.setFeedback(this.emailedBanner(email), false);
        this.revealMarkInvoiced();
        this.startPayWatch();
      } else if (res && res.timedOut) {
        this.setFeedback("The email took too long to confirm. Check whether it arrived before you send it again.", true);
      } else {
        this.showPdfError(res, "Could not email the invoice.");
      }
    } catch (err) {
      this.setFeedback("Could not email the invoice.", true);
    } finally {
      this.saving = false;
      this.loading = false;
      this.loadingLabel = "Updating…";
      this.syncPdfLabels("");
    }
  },
  pdfExportPayload(mode) {
    const payload = { invoiceId: this.detailId, mode: mode };
    if (this.detailPayUrl) payload.payUrl = this.detailPayUrl;
    return payload;
  },
  emailedBanner(email) {
    const code = this.detailCode || this.detailId || "the invoice";
    return "Emailed " + code + " to " + String(email || "").trim() + ".";
  },
  async copyPayLink() {
    if (!String(this.detailPayUrl || "").trim() && !this.previewMode) {
      await this.requestPayLink(this.detailId);
    }
    const url = String(this.detailPayUrl || "").trim();
    if (!url) {
      this.setFeedback(this.previewMode ? "Preview has no pay link." : "No pay link on this invoice yet.", true);
      return;
    }
    const copied = await this.writeClipboard(url);
    if (!copied) {
      this.setFeedback("Could not copy the pay link.", true);
      return;
    }
    this.payCopied = true;
    this.startPayWatch();
    const self = this;
    setTimeout(function () { self.payCopied = false; }, 1600);
  },
  openBlankTab() {
    try {
      const tab = window.open("about:blank", "_blank");
      if (tab) {
        try { tab.opener = null; } catch (err) {}
      }
      return tab || null;
    } catch (err) {
      return null;
    }
  },
  closeTab(tab) {
    if (!tab) return;
    try { tab.close(); } catch (err) {}
  },
  phoneShareSheet() {
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  },
  async presentWhatsApp(text, reserved) {
    const url = whatsAppLink(text);
    if (reserved && !reserved.closed) {
      try {
        reserved.location.href = url;
        return "tab";
      } catch (err) {
        this.closeTab(reserved);
      }
    } else {
      this.closeTab(reserved);
    }
    let tab = null;
    try { tab = window.open(url, "_blank"); } catch (err) { tab = null; }
    if (tab) {
      try { tab.opener = null; } catch (err) {}
      return "tab";
    }
    if (this.phoneShareSheet() && typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: text });
        return "sheet";
      } catch (err) {
        if (err && err.name === "AbortError") return "sheet";
      }
    }
    const copied = await this.writeClipboard(text);
    return copied ? "copy" : "";
  },
  async shareOnWhatsApp() {
    this.whatsAppOverdueLine = "";
    return this.handInvoiceToWhatsApp();
  },
  async remindOnWhatsApp() {
    if (!this.detailOverdue) return;
    this.whatsAppOverdueLine = "This invoice is overdue.";
    return this.handInvoiceToWhatsApp();
  },
  openEmailReminder() {
    if (!this.detailOverdue || this.saving) return;
    const line = "This invoice is overdue.";
    const note = String(this.detailMessage || "");
    if (note.indexOf(line) === -1) this.detailMessage = line + (note ? "\n\n" + note : "");
    this.emailOpen = true;
    this.syncEmailToggle();
    setTimeout(() => {
      const node = document.querySelector("#email-sheet button");
      if (!node) return;
      try { node.scrollIntoView({ block: "nearest" }); } catch (err) {}
    }, 60);
  },
  async handInvoiceToWhatsApp() {
    if (this.saving || this.sharingWhatsApp || !this.detailId || !this.detailShowShare) return;
    this.sharingWhatsApp = true;
    try {
      const quoting = !!this.detailIsQuote;
      let reserved = null;
      if (!quoting && !String(this.detailPayUrl || "").trim() && !this.previewMode) reserved = this.openBlankTab();
      if (!quoting && !String(this.detailPayUrl || "").trim() && !this.previewMode) {
        const linked = await this.requestPayLink(this.detailId);
        if (!linked || linked.timedOut) {
          this.closeTab(reserved);
          this.setFeedback("That took too long, so it was stopped. Check the invoice before you try again.", true);
          return;
        }
      }
      const payUrl = quoting ? "" : String(this.detailPayUrl || "").trim();
      if (!quoting && !payUrl) {
        this.closeTab(reserved);
        this.setFeedback(this.previewMode ? "Preview has no pay link." : "No pay link on this invoice yet.", true);
        return;
      }
      const row = (this.invoiceRows || []).find((item) => item.id === this.detailId) || {};
      const amount = this.money(invoicePayable(row).payable);
      const text = quoting
        ? quoteShareText(this.detailCode || this.detailId, amount)
        : whatsAppInvoiceText(this.detailCode || this.detailId, amount, payUrl, this.whatsAppOverdueLine);
      this.lastWhatsAppText = text;
      const how = await this.presentWhatsApp(text, reserved);
      await this.downloadInvoicePdf();
      const lead = how === "copy" ? "Copied the WhatsApp message." : how === "sheet" ? "Opened the share sheet." : how ? "Opened WhatsApp." : "";
      const prior = (this.feedback && this.feedback.text) || "";
      if (this.feedback && this.feedback.isError) {
        if (lead) this.setFeedback(lead + " " + prior, true);
        return;
      }
      const pdfNote = this.previewMode
        ? (prior || "Preview cannot print the PDF.")
        : ("PDF downloaded, attach it." + (/marked invoiced/i.test(prior) ? " Invoice marked invoiced." : ""));
      if (!lead) {
        this.setFeedback("Could not open WhatsApp. " + pdfNote, true);
        return;
      }
      this.setFeedback(lead + " " + pdfNote, false);
      if (!quoting) this.startPayWatch();
    } finally {
      this.sharingWhatsApp = false;
    }
  },
  async writeClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {}
    try {
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "readonly");
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      return !!ok;
    } catch (err) {
      return false;
    }
  },
  savePdfFile(fileName, b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "invoice.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  openDriveLink() {
    if (this.driveUrl) window.open(this.driveUrl, "_blank", "noopener");
  },
  downloadTextFile(fileName, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "InvoiceList.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  async exportAccountantCsv() {
    if (this.saving) return;
    if (this.previewMode) {
      this.downloadTextFile("InvoiceList.csv", "\uFEFF" + accountantCsvFromRows(this.invoiceRows));
      this.setFeedback("Downloaded InvoiceList.csv.", false);
      return;
    }
    this.clearFeedback();
    this.saving = true;
    this.loading = true;
    this.loadingLabel = "Preparing the CSV…";
    try {
      const res = await this.api("exportAccountantCsv", {}, { quiet: true, timeoutMs: 30000 });
      if (res && /Invalid API action/.test(String(res.error || ""))) {
        this.setFeedback("Could not export the invoice list. Open the EverydayWork spreadsheet, Extensions, Apps Script, and replace Code.gs. Run authorizeEverydayWork and choose Allow. Open Deploy, Manage deployments, edit this web app, set Version to New version, and Deploy.", true);
        return;
      }
      if (res && res.success && res.csv) {
        this.downloadTextFile(res.fileName || "InvoiceList.csv", "\uFEFF" + res.csv);
        this.setFeedback("Downloaded " + (res.fileName || "InvoiceList.csv") + ".", false);
        return;
      }
      this.setFeedback(this.failMessage(res, "Could not export the invoice list."), true);
    } catch (err) {
      this.setFeedback("Could not export the invoice list.", true);
    } finally {
      this.saving = false;
      this.loading = false;
      this.loadingLabel = "Updating…";
    }
  },
  async convertQuote() {
    if (this.saving || !this.detailId || !this.detailIsQuote) return;
    this.saving = true;
    this.loading = true;
    this.loadingLabel = "Turning the quote into an invoice…";
    this.clearFeedback();
    const quoteId = this.detailId;
    try {
      if (this.previewMode) {
        await this.wait(400);
        const source = Array.isArray(this.quoteBookRows) ? this.quoteBookRows : (this.invoiceRows || []);
        const result = convertQuoteRows(source, quoteId);
        this.quoteBookRows = result.stored;
        this.quoteBookReady = true;
        this.invoiceRows = result.rows;
        this.recomputeOpenPiles();
        this.syncVisibleInvoices();
        const invoice = (this.invoiceRows || []).find((item) => item.id === result.invoiceId || item.code === result.invoiceId);
        if (invoice) this.fillDetail(invoice, invoice.lines || []);
        const code = invoice ? (invoice.code || invoice.id) : result.invoiceId;
        this.setFeedback(code ? ("Quote turned into invoice " + code + ".") : "The invoice is ready.", false);
        return;
      }
      const res = await this.api("convertQuote", { invoiceId: quoteId }, { write: true });
      if (res && /Invalid API action/.test(String(res.error || ""))) {
        this.setFeedback("Turn into invoice is ready after you paste Code.gs and deploy a new version.", true);
        return;
      }
      if (res && res.success) {
        this.adoptWrite(res);
        const row = (this.invoiceRows || []).find((item) => sameInvoiceNumber(item, res.invoiceId, res.invoiceCode));
        if (row) this.fillDetail(row, row.lines || []);
        this.setFeedback(res.message || ("Quote turned into invoice " + (res.invoiceCode || res.invoiceId) + "."), false);
        return;
      }
      this.setFeedback(this.failMessage(res, "Could not turn the quote into an invoice."), true);
    } finally {
      this.saving = false;
      this.loading = false;
      this.loadingLabel = "Updating…";
    }
  },
  async compileOpenInvoice() {
    if (this.saving || !this.detailId) return;
    if (this.previewMode) {
      this.restampInvoice(this.detailId, "Invoiced");
      this.noteInvoiceUpdated("Marked invoiced.");
      return;
    }
    this.saving = true;
    this.loadingLabel = "Saving the invoice…";
    this.clearFeedback();
    try {
      const res = await this.api("compileInvoice", { invoiceId: this.detailId }, { write: true });
      if (res && res.success) {
        this.restampInvoice(this.detailId, "Invoiced");
        this.setDetailPhase("Invoiced");
        this.noteInvoiceUpdated("Marked invoiced.");
        this.watchInvoicePayment({ id: this.detailId, kind: "due" });
        await this.refreshSnapshot({ quiet: true, announce: false, resync: true });
        return;
      }
      this.setFeedback(this.failMessage(res, this.unreachableMessage(true)), true);
    } finally {
      this.saving = false;
      this.loadingLabel = "Updating…";
    }
  },
  async markDetailPaid() { return this.markDetailStatus("Paid"); },
  async markDetailWrittenOff() { return this.markDetailStatus("Written off"); },
  async undoDetailStatus() { return this.markDetailStatus("Undo"); },
  async markListInvoiced(id) {
    if (this.saving || !this.focusInvoice(id)) return;
    return this.compileOpenInvoice();
  },
  async markListPaid(id) {
    if (this.saving || !this.focusInvoice(id)) return;
    return this.markDetailStatus("Paid");
  },
  async markListWrittenOff(id) {
    if (this.saving || !this.focusInvoice(id)) return;
    return this.markDetailStatus("Written off");
  },
  async undoListStatus(id) {
    if (this.saving || !this.focusInvoice(id)) return;
    return this.markDetailStatus("Undo");
  },
  syncDetailChrome(status) {
    const label = String(status || "").trim();
    const kind = kindForStatus(label);
    this.detailStatus = label || "Draft";
    this.detailIsQuote = kind === "quote";
    this.detailIsDraft = kind === "draft";
    this.detailCanSavePdf = kind === "due" || kind === "paid" || kind === "writtenoff";
    this.detailCanFinish = kind === "due";
    this.detailCanUndo = kind === "paid" || kind === "writtenoff";
    this.detailShowPay = kind === "draft" || kind === "due";
    this.detailShowShare = this.detailShowPay || kind === "quote";
    this.detailShowEmail = kind !== "quote" && kind !== "converted";
    if (!this.detailShowPay) {
      this.detailPayUrl = "";
      this.payCopied = false;
    }
    if (!this.detailShowEmail) this.emailOpen = false;
    this.syncEmailToggle();
  },
  setDetailPhase(status) {
    this.syncDetailChrome(status);
    const openRow = (this.invoiceRows || []).find((item) => item.id === this.detailId);
    this.detailOverdue = status === "Invoiced" && invoiceIsOverdue(openRow, this.asOf);
  },
  async markDetailStatus(status) {
    if (this.saving || !this.detailId) return;
    if (this.previewMode) {
      this.restampInvoice(this.detailId, status);
      this.noteInvoiceUpdated(this.homeStatusMessage(status));
      return;
    }
    this.saving = true;
    this.loadingLabel = "Saving the invoice…";
    this.clearFeedback();
    try {
      const res = await this.api("updateInvoiceStatus", { invoiceId: this.detailId, status: status }, { write: true });
      if (res && res.success) {
        const next = res.status || (status === "Undo" ? "Invoiced" : status);
        this.restampInvoice(this.detailId, status === "Undo" ? "Undo" : next);
        this.setDetailPhase(next);
        this.noteInvoiceUpdated(this.homeStatusMessage(status));
        await this.refreshSnapshot({ quiet: true, announce: false, resync: true });
        return;
      }
      this.setFeedback(this.failMessage(res, this.unreachableMessage(true)), true);
    } finally {
      this.saving = false;
      this.loadingLabel = "Updating…";
    }
  },
  setFeedback(msg, isErr) {
    this.feedback.text = msg;
    this.feedback.isError = !!isErr;
    setTimeout(() => {
      const node = document.getElementById("save-feedback");
      if (!node || node.style.display === "none") return;
      try { node.scrollIntoView({ block: "center" }); } catch (err) {}
    }, 30);
  },
  showPdfError(res, fallback) {
    this.setFeedback(this.failMessage(res, fallback), true);
    this.mailAuthUrl = (res && res.authUrl) || "";
    if (res && res.pdfBase64) this.savePdfFile(res.fileName, res.pdfBase64);
  },
  openMailAuth() {
    if (this.mailAuthUrl) window.open(this.mailAuthUrl, "_blank", "noopener");
  },
  clearFeedback() {
    this.feedback.text = '';
    this.feedback.isError = false;
    this.mailAuthUrl = "";
    if (this.jobLogged && this.jobLogged.text) this.jobLogged = { text: "", id: "", code: "" };
  },
  clearUnreachableFeedback() {
    if (!this.feedback || !this.feedback.isError) return;
    if (this.feedback.text !== this.unreachableMessage(false)) return;
    this.feedback.text = "";
    this.feedback.isError = false;
  },
  sampleSettings() {
    const row = (n, label, value) => ({ row: n, label: label, value: value });
    return {
      success: true,
      logo: "",
      settings: [
        row(2, "Default Hourly Rate", "65"),
        row(3, "Financial Year End", "31st October"),
        row(4, "Default Currency", "EUR"),
        row(5, "Business Name", "Everyday Business"),
        row(6, "Business Address", "Ireland"),
        row(7, "Business Email", "Jane@EverydayBusiness.ie"),
        row(8, "Website", "www.EverydayBusiness.ie"),
        row(9, "Business Phone", "00353 123 45678"),
        row(11, "Bank Account Name", "Everyday Business"),
        row(12, "IBAN", "IEXX XXXX XXXX XXXX XXXX XX"),
        row(22, "vatApplied", "N"),
        row(23, "vatRate", "23"),
        row(24, "paymentTerms", "14"),
        row(25, "Loaded hourly cost", "18"),
        row(26, "Mileage rate", "0.40")
      ]
    };
  },
  settingKey(label) {
    const name = String(label || "").trim().toLowerCase();
    const settings = {
      "default hourly rate": "rate",
      "financial year end": "yearEnd",
      "default currency": "currency",
      "business name": "name",
      "business address": "address",
      "business email": "email",
      website: "website",
      "business phone": "phone",
      "bank account name": "bank",
      iban: "iban",
      vatapplied: "vatApplied",
      vatrate: "vatRate",
      "payment terms": "paymentTerms",
      paymentterms: "paymentTerms",
      "loaded hourly cost": "loadedCost",
      "mileage rate": "mileageRate"
    };
    if (settings[name]) return { key: settings[name], kind: "setting" };
    return null;
  },
  settingsSnapshot() {
    try { return JSON.stringify(this.settingsForm); } catch (err) { return ""; }
  },
  settingsEdits(before) {
    let prior = {};
    try { prior = JSON.parse(before || "{}"); } catch (err) { prior = {}; }
    const keep = {};
    Object.keys(this.settingsForm || {}).forEach((key) => {
      const now = this.settingsForm[key] == null ? "" : String(this.settingsForm[key]);
      const then = prior[key] == null ? "" : String(prior[key]);
      if (now !== then) keep[key] = true;
    });
    return keep;
  },
  applySettings(res, keep) {
    const locked = keep || {};
    const show = {
      rate: false, yearEnd: false, currency: false, name: false, address: false, email: false,
      website: false, phone: false, bank: false, iban: false, vat: false, vatApplied: false, vatRate: false,
      paymentTerms: true, loadedCost: true, mileageRate: true
    };
    const meta = {};
    const extra = [];
    (Array.isArray(res && res.settings) ? res.settings : []).forEach((row) => {
      const mapped = this.settingKey(row && row.label);
      if (!mapped || mapped.kind !== "setting") {
        if (row && row.label) extra.push({ row: row.row, label: row.label, value: row.value == null ? "" : String(row.value) });
        return;
      }
      show[mapped.key] = true;
      if (mapped.key === "vatApplied" || mapped.key === "vatRate") show.vat = true;
      meta[mapped.key] = { row: row.row, label: row.label, kind: "setting" };
      if (locked[mapped.key]) return;
      if (mapped.key === "vatApplied") {
        const mark = /^y/i.test(String(row.value || "").trim()) ? "Y" : "N";
        this.settingsForm.vatApplied = mark;
        this.vatOn = mark === "Y";
        this.vatSwitchLabel = this.vatOn ? "On" : "Off";
      } else if (mapped.key === "vatRate") {
        this.settingsForm.vatRate = vatPercentText(row.value);
      } else {
        this.settingsForm[mapped.key] = row.value == null ? "" : String(row.value);
      }
    });
    if (!meta.paymentTerms && !locked.paymentTerms) this.settingsForm.paymentTerms = this.settingsForm.paymentTerms || "14";
    this.settingsShow = show;
    this.settingsMeta = meta;
    this.extraSettings = extra;
    this.renderExtraSettings(extra);
    if (res && res.logo && !this.logoDirty) {
      this.logoPreview = res.logo;
    }
    if (this.settingsForm.name) this.businessName = this.settingsForm.name;
    this.syncLogoPreview();
  },
  renderExtraSettings(rows) {
    const host = document.getElementById("settings-extra");
    if (!host) return;
    host.innerHTML = "";
    (rows || []).forEach((row, index) => {
      const group = document.createElement("div");
      group.className = "form-group";
      const label = document.createElement("label");
      label.textContent = row.label;
      const input = document.createElement("input");
      input.type = "text";
      input.value = row.value || "";
      input.addEventListener("input", () => {
        if (this.extraSettings[index]) this.extraSettings[index].value = input.value;
      });
      group.appendChild(label);
      group.appendChild(input);
      host.appendChild(group);
    });
  },
  syncLogoPreview() {
    const img = document.getElementById("logo-preview");
    const wrap = document.getElementById("logo-wrap");
    this.logoEmpty = !this.logoPreview;
    if (!img || !wrap) return;
    if (this.logoPreview) {
      img.src = this.logoPreview;
      wrap.style.display = "block";
    } else {
      img.removeAttribute("src");
      wrap.style.display = "none";
    }
  },
  onLogoPicked() {
    const input = document.getElementById("logo-file");
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      this.setFeedback("Choose a PNG or JPEG logo.", true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.fitLogo(String(reader.result || ""), file.type);
    reader.readAsDataURL(file);
  },
  fitLogo(dataUrl, type) {
    const image = new Image();
    image.onload = () => {
      const max = 720;
      let width = image.width || max;
      let height = image.height || max;
      const scale = Math.min(1, max / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, width, height);
      const mime = type === "image/png" ? "image/png" : "image/jpeg";
      this.logoPreview = canvas.toDataURL(mime, 0.85);
      this.logoDirty = true;
      this.syncLogoPreview();
    };
    image.src = dataUrl;
  },
  settingsPayload() {
    const settings = [];
    Object.keys(this.settingsMeta || {}).forEach((key) => {
      const meta = this.settingsMeta[key];
      if (!meta || !meta.row) return;
      settings.push({ row: meta.row, label: meta.label, value: this.settingsForm[key] });
    });
    (this.extraSettings || []).forEach((row) => {
      if (row && row.row && row.label) settings.push({ row: row.row, label: row.label, value: row.value });
    });
    if (!this.settingsMeta.paymentTerms) {
      settings.push({ row: 0, label: "paymentTerms", value: this.settingsForm.paymentTerms || "14" });
    }
    if (!this.settingsMeta.loadedCost) {
      settings.push({ row: 0, label: "Loaded hourly cost", value: this.settingsForm.loadedCost || "0" });
    }
    if (!this.settingsMeta.mileageRate) {
      settings.push({ row: 0, label: "Mileage rate", value: this.settingsForm.mileageRate || "0" });
    }
    const payload = { settings: settings };
    if (this.logoDirty && this.logoPreview) payload.logo = this.logoPreview;
    return payload;
  },
  settingsProblem(payload) {
    const rate = (this.settingsForm.rate || "").trim();
    if (this.settingsShow.rate && rate && !/^\d+(\.\d+)?$/.test(rate)) return "Default hourly rate must be a number.";
    const email = (this.settingsForm.email || "").trim();
    if (this.settingsShow.email && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Business email needs to look like an email address.";
    const yearEnd = (this.settingsForm.yearEnd || "").trim();
    if (this.settingsShow.yearEnd && yearEnd && !yearEndParts(yearEnd)) return "Financial year end needs a day and month, for example 31 October.";
    const vatRate = (this.settingsForm.vatRate || "").trim();
    if (this.settingsShow.vatRate && vatRate && !/^\d+(\.\d+)?$/.test(vatRate)) return "VAT rate must be a number, for example 23.";
    const terms = (this.settingsForm.paymentTerms || "").trim();
    if (terms && !/^\d+$/.test(terms)) return "Payment terms need a whole number of days, for example 14.";
    const loadedCost = (this.settingsForm.loadedCost || "").trim();
    if (loadedCost && !/^\d+(\.\d+)?$/.test(loadedCost.replace(/,/g, ""))) return "Loaded hourly cost must be a number.";
    const mileageRate = (this.settingsForm.mileageRate || "").trim();
    if (mileageRate && !/^\d+(\.\d+)?$/.test(mileageRate.replace(/,/g, ""))) return "Mileage rate must be a number.";
    return "";
  },
  toggleVat() {
    const on = this.settingsForm.vatApplied !== "Y";
    this.settingsForm.vatApplied = on ? "Y" : "N";
    this.vatOn = on;
    this.vatSwitchLabel = on ? "On" : "Off";
  },
  settingsSavedMessage() {
    const name = String(this.settingsForm.name || "").trim();
    let message = "Saved settings" + (name ? " for " + name : "") + ".";
    if (this.logoDirty && this.logoPreview) message += " The logo is on the invoice.";
    return message;
  },
  async loadSettings() {
    if (this.previewMode) {
      this.applySettings(this.sampleSettings());
      return;
    }
    const before = this.settingsSnapshot();
    try {
      const res = await this.api("getSettings", { skipLogo: true }, { quiet: true });
      if (res && /Invalid API action/.test(String(res.error || ""))) {
        const blank = this.sampleSettings();
        blank.settings.forEach((row) => { row.value = ""; });
        this.applySettings(blank, this.settingsEdits(before));
        this.setFeedback("Could not read settings. Open the EverydayWork spreadsheet, Extensions, Apps Script, and replace Code.gs. Run authorizeEverydayWork and choose Allow. Open Deploy, Manage deployments, edit this web app, set Version to New version, and Deploy.", true);
        return;
      }
      if (res && res.success) {
        this.applySettings(res, this.settingsEdits(before));
        if (!res.logo) this.loadSettingsLogo();
        return;
      }
      this.setFeedback(this.failMessage(res, "Could not read settings. Try Refresh."), true);
    } catch (err) {
      this.setFeedback("Could not read settings. Try Refresh.", true);
    }
  },
  async loadSettingsLogo() {
    try {
      const res = await this.api("getSettings", { logoOnly: true }, { quiet: true });
      if (!res || !res.logo || this.logoDirty) return;
      this.logoPreview = res.logo;
      this.syncLogoPreview();
    } catch (err) {}
  },
  async saveSettings() {
    if (this.saving) return;
    this.clearFeedback();
    const payload = this.settingsPayload();
    if (!payload.settings.length && !payload.logo) {
      this.setFeedback("Could not save settings. Open Settings again so settings can load.", true);
      return;
    }
    const problem = this.settingsProblem(payload);
    if (problem) {
      this.setFeedback("Could not save settings. " + problem, true);
      return;
    }
    const named = this.settingsSavedMessage();
    this.saving = true;
    this.loading = true;
    this.loadingLabel = "Saving settings…";
    this.settingsButtonLabel = "Saving…";
    try {
      if (this.previewMode) {
        await this.wait(800);
        this.logoDirty = false;
        this.setFeedback(named, false);
        return;
      }
      const res = await this.api("saveSettings", payload, { write: true, quiet: true, timeoutMs: 60000 });
      if (res && /Invalid API action/.test(String(res.error || ""))) {
        this.setFeedback("Could not save settings. Open the EverydayWork spreadsheet, Extensions, Apps Script, and replace Code.gs. Run authorizeEverydayWork and choose Allow. Open Deploy, Manage deployments, edit this web app, set Version to New version, and Deploy.", true);
        return;
      }
      if (res && res.success) {
        this.applySettings(res);
        this.setFeedback(res.message || named, false);
        return;
      }
      this.setFeedback(this.failMessage(res, "Could not save settings."), true);
    } catch (err) {
      this.setFeedback("Could not save settings.", true);
    } finally {
      this.saving = false;
      this.loading = false;
      this.loadingLabel = "Updating…";
      this.settingsButtonLabel = "Save settings";
    }
  }
}));

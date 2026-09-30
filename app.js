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
    inMonth: false, inQuarter: true, inYear: true, overdue: false, daysOverdue: 0
  }, extra);
  return {
    success: true,
    asOf: "2026-09-22",
    open: {
      dueAmount: 240, dueCount: 2,
      overdueAmount: 200, overdueCount: 1,
      draftAmount: 50, draftCount: 1,
      paidAmount: 100, paidCount: 1,
      writtenOffAmount: 80, writtenOffCount: 1
    },
    periods: {
      month: { label: "September 2026", hours: 7, shifts: 3, clients: 2, billable: 290, avgRate: 41.43, topClient: "Acme", topClientHours: 4, paid: 0, paidCount: 0, sent: 240, sentCount: 2, due: 240, dueCount: 2, draft: 50, draftCount: 1, overdue: 200, overdueCount: 1, badDebt: 0, badDebtCount: 0 },
      quarter: { label: "Q3 2026", hours: 12, shifts: 5, clients: 2, billable: 470, avgRate: 39.17, topClient: "Acme", topClientHours: 9, paid: 100, paidCount: 1, sent: 420, sentCount: 4, due: 240, dueCount: 2, draft: 50, draftCount: 1, overdue: 200, overdueCount: 1, badDebt: 80, badDebtCount: 1 },
      year: { label: "2026", hours: 12, shifts: 5, clients: 2, billable: 470, avgRate: 39.17, topClient: "Acme", topClientHours: 9, paid: 100, paidCount: 1, sent: 420, sentCount: 4, due: 240, dueCount: 2, draft: 50, draftCount: 1, overdue: 200, overdueCount: 1, badDebt: 80, badDebtCount: 1 }
    },
    invoices: [
      row({ id: "INV-JR26-002", code: "INV-JR26-002", clientName: "Acme", contact: "Ann Acme", status: "Invoiced", kind: "due", date: "2026-09-01", dueDate: "2026-09-15", overdue: true, daysOverdue: 7, hours: 4, total: 200, email: "acme@example.com", terms: 14, jobDetails: "Site visit", inMonth: true, lines: [{ date: "2026-09-02", details: "Site visit", start: "08:00", finish: "12:00", hours: 4, amount: 200 }] }),
      row({ id: "INV-JR26-005", code: "INV-JR26-005", clientName: "Other Co", contact: "Owen Other", status: "Invoiced", kind: "due", date: "2026-09-20", dueDate: "2026-10-20", hours: 2, total: 40, terms: 30, inMonth: true, lines: [{ date: "2026-09-21", details: "Callout", start: "09:00", finish: "11:00", hours: 2, amount: 40 }] }),
      row({ id: "INV-JR26-003", code: "INV-JR26-003", clientName: "Other Co", contact: "Old Contact", status: "Draft", kind: "draft", date: "2026-09-10", dueDate: "2026-10-10", hours: 1, total: 50, email: "stale@other.test", terms: 30, inMonth: true, lines: [{ date: "2026-09-12", details: "Survey", start: "09:00", finish: "10:00", hours: 1, amount: 50 }] }),
      row({ id: "INV-JR26-001", code: "INV-JR26-001", clientName: "Acme", contact: "Ann Acme", status: "Paid", kind: "paid", date: "2026-08-01", dueDate: "2026-08-15", hours: 3, total: 100, email: "acme@example.com", terms: 14, lines: [{ date: "2026-08-02", details: "Install", start: "09:00", finish: "12:00", hours: 3, amount: 100 }] }),
      row({ id: "INV-JR26-004", code: "INV-JR26-004", clientName: "Acme", contact: "Ann Acme", status: "Written off", kind: "writtenoff", date: "2026-07-15", dueDate: "2026-07-29", hours: 2, total: 80, email: "acme@example.com", terms: 14, lines: [{ date: "2026-07-16", details: "Repair", start: "09:00", finish: "11:00", hours: 2, amount: 80 }] })
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

// ==========================================
// APPLICATION CONTROLLER STATE MACHINE
// ==========================================
window.Alpine.data('appState', () => ({
  loading: false,
  loadingLabel: "Updating…",
  saving: false,
  savePdfLabel: "Save PDF to Drive",
  downloadPdfLabel: "Download PDF",
  emailPdfLabel: "Email PDF",
  logButtonLabel: "Log a job",
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
  
  apiUrl: "https://script.google.com/macros/s/AKfycbzVJ3wV-heWwuT0xD5uKQum8xMp9NJ165pTWESf170vNvsgpI6ApGIX2BjoyuW5Z3tS/exec",

  invoices: [],
  clientInvoices: [],
  showExistingInvoices: false,
  invoiceHint: 'This job will open a new draft invoice.',
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
  listEmpty: false,
  listEmptyLabel: "Nothing in this list.",
  periodMonthClass: "seg-on",
  periodQuarterClass: "",
  periodYearClass: "",
  tabDashClass: "nav-on",
  tabClientsClass: "",
  tabTrackerClass: "",
  tabSettingsClass: "",
  logoPreview: "",
  logoDirty: false,
  logoEmpty: true,
  extraSettings: [],
  settingsMeta: {},
  settingsShow: {
    rate: false, currency: false, name: false, address: false, email: false,
    website: false, phone: false, bank: false, iban: false,
    na: false, half: false, hour: false, hourHalf: false, two: false
  },
  settingsForm: {
    rate: "", currency: "", name: "", address: "", email: "",
    website: "", phone: "", bank: "", iban: ""
  },
  breakForm: { na: "", half: "", hour: "", hourHalf: "", two: "" },
  asOf: "",
  openSendAmount: "€0.00",
  openSendCount: "0 invoices",
  openCollectAmount: "€0.00",
  openCollectCount: "0 invoices",
  openDoneAmount: "€0.00",
  openDoneCount: "0 invoices",
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
  detailHours: "",
  detailTotal: "",
  detailService: "",
  detailJob: "",
  detailEmail: "",
  detailFrom: "",
  detailSubject: "",
  detailMessage: "",
  detailMessageAuto: "",
  businessName: "EverydayWork",
  detailIsDraft: false,
  detailCanSavePdf: false,
  detailCanFinish: false,
  detailCanUndo: false,
  detailLines: [],
  detailLinesRaw: [],
  detailLinesEmpty: true,
  driveUrl: "",
  form: { clientName: '', date: (() => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + now.getFullYear();
  })(), jobDetails: '', start: '08:00', lunch: 'na', finish: '16:30', invoiceMode: 'new', invoiceId: '' },

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
    const existing = this.form.invoiceMode === 'existing';
    this.showExistingInvoices = existing;
    if (!existing) {
      this.invoiceHint = 'This job will open a new draft invoice.';
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
  },
  onInvoiceModeChange() {
    if (this.form.invoiceMode !== 'existing') this.form.invoiceId = '';
    this.syncInvoiceHint();
    this.syncLogButton();
  },
  syncLogButton() {
    if (this.saving) {
      this.logButtonLabel = "Saving…";
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
  async api(actionName, payloadData = {}, opts) {
    const quiet = opts && opts.quiet;
    const writing = !!(opts && opts.write);
    const timeoutMs = (opts && opts.timeoutMs) || 40000;
    if (!quiet) this.loading = true;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (controller) controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: actionName, payload: payloadData }),
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
    this.savePdfLabel = active === "Saving the PDF…" ? "Saving…" : "Save PDF to Drive";
    this.downloadPdfLabel = active === "Downloading the PDF…" ? "Downloading…" : "Download PDF";
    this.emailPdfLabel = active === "Sending the invoice…" ? "Sending…" : "Email PDF";
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
  async init() {
    this.syncTabClasses();
    this.syncPeriodClasses();
    this.syncOvernight();
    this.syncLogButton();
    this.syncInvoiceHint();
    if (this.previewMode) {
      await this.loadDashboard();
      return;
    }
    const stored = this.storedSnapshot();
    if (stored) this.applySnapshot(stored, true);
    await this.refreshSnapshot({ quiet: !!stored, announce: !stored, resync: true });
  },
  syncTabClasses() {
    this.tabDashClass = this.currentTab === "dashboard" ? "nav-on" : "";
    this.tabClientsClass = this.currentTab === "clients" ? "nav-on" : "";
    this.tabTrackerClass = this.currentTab === "tracker" ? "nav-on" : "";
    this.tabSettingsClass = this.currentTab === "settings" ? "nav-on" : "";
  },
  setDashTab() {
    this.currentTab = "dashboard";
    this.syncTabClasses();
    this.clearFeedback();
  },
  setClientsTab() {
    this.currentTab = "clients";
    this.clientView = "list";
    this.syncTabClasses();
    this.clearFeedback();
  },
  setTrackerTab() { this.currentTab = 'tracker'; this.syncTabClasses(); this.clearFeedback(); },
  async setSettingsTab() {
    this.currentTab = "settings";
    this.syncTabClasses();
    this.clearFeedback();
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
          this.setFeedback("Could not save " + payload.name + ". A client with that name is already on ClientRecords.", true);
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
            this.setFeedback("Could not save " + payload.name + ". That client is no longer on ClientRecords.", true);
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

  rememberLoggedJob(code, rawId) {
    const id = String(code || rawId || "").trim();
    if (!id) return;
    const raw = String(rawId || "").trim();
    if (this.invoices.some((inv) => inv.id === id || (raw && inv.id === raw))) return;
    const parts = this.jobDateParts(this.form.date);
    this.invoices = this.invoices.concat([{
      id: id,
      clientName: this.form.clientName,
      status: "Draft",
      date: parts ? parts.iso : this.form.date,
      label: "Invoice " + id + " · Draft"
    }]);
    this.refreshClientInvoices();
  },
  savedJobMessage(result, adding) {
    const parts = this.jobDateParts(this.form.date);
    const when = parts ? parts.label : String(this.form.date || "").trim();
    const who = this.form.clientName || "the client";
    const code = (result && (result.invoiceCode || result.invoiceId)) || (adding ? this.form.invoiceId : "");
    const invoice = code ? ("invoice " + code) : "the invoice";
    if (result && result.alreadySaved) {
      return "Already saved. The job for " + who + " on " + when + " is on " + invoice + ".";
    }
    if (adding) return "Saved. Job added to " + invoice + " for " + who + " on " + when + ".";
    if (this.overnight) return "Saved. Overnight job logged on " + invoice + " for " + who + " on " + when + ".";
    return "Saved. Job logged on " + invoice + " for " + who + " on " + when + ".";
  },
  async submitForm() {
    if (this.saving) return;
    this.clearFeedback();
    if (!this.form.clientName) {
      this.setFeedback("Could not log the job. Choose a client.", true);
      return;
    }
    const jobDate = this.jobDateParts(this.form.date);
    if (!jobDate) {
      this.setFeedback("Could not log the job. Enter the date as day/month/year, for example 30/09/2026.", true);
      return;
    }
    this.form.date = jobDate.label;
    if (this.timeToMinutes(this.form.start) == null || this.timeToMinutes(this.form.finish) == null) {
      this.setFeedback("Could not log the job. Choose a start and finish time.", true);
      return;
    }
    if (this.form.invoiceMode === 'existing' && !this.form.invoiceId) {
      this.setFeedback("Could not log the job. Choose a draft invoice, or start a new one.", true);
      return;
    }
    if (this.form.invoiceMode === 'existing') {
      const chosen = (this.invoices || []).find((inv) => inv.id === String(this.form.invoiceId));
      if (chosen && !this.isDraftStatus(chosen.status)) {
        this.setFeedback("Could not log the job. Time can't be added once an invoice leaves Draft. Invoice " + chosen.id + " is " + chosen.status + ".", true);
        return;
      }
    }
    this.syncOvernight();
    this.saving = true;
    this.loading = true;
    this.loadingLabel = "Saving the job…";
    this.syncLogButton();
    const adding = this.form.invoiceMode === "existing";
    const chosenId = this.form.invoiceId;
    try {
      if (this.previewMode) {
        await this.wait(800);
        const code = adding && chosenId ? chosenId : "INV-JR26-018";
        this.form.jobDetails = "";
        this.rememberLoggedJob(code);
        this.setFeedback(this.savedJobMessage({ invoiceCode: code }, adding), false);
        return;
      }
      const result = await this.api('logTimeEntry', {
        clientName: this.form.clientName,
        date: jobDate.iso,
        jobDetails: this.form.jobDetails,
        start: this.form.start,
        lunch: this.form.lunch,
        finish: this.form.finish,
        overnight: this.overnight,
        invoiceMode: this.form.invoiceMode,
        invoiceId: this.form.invoiceId
      }, { write: true });
      if (result && result.success) {
        this.form.jobDetails = "";
        this.rememberLoggedJob(result.invoiceCode || result.invoiceId, result.invoiceId);
        this.setFeedback(this.savedJobMessage(result, adding), false);
        await this.refreshSnapshot({ quiet: true, announce: false, resync: true });
        return;
      }
      this.setFeedback(this.failMessage(result, "Could not log the job for " + this.form.clientName + " on " + jobDate.label + ". " + this.unreachableMessage(true)), true);
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
    const flag = this.period === "quarter" ? "inQuarter" : this.period === "year" ? "inYear" : "inMonth";
    let rows = this.invoiceRows || [];
    if (this.listScope === "period") rows = rows.filter((row) => row[flag]);
    const filter = this.invoiceFilter;
    if (filter === "due") rows = rows.filter((row) => row.kind === "due");
    else if (filter === "send" || filter === "draft") rows = rows.filter((row) => row.kind === "draft");
    else if (filter === "done") rows = rows.filter((row) => row.kind === "paid" || row.kind === "writtenoff");
    this.visibleInvoices = rows.map((row) => ({
      id: row.id,
      title: row.code || row.id,
      meta: this.invoiceMeta(row),
      amount: this.money(row.total),
      pill: row.status || "Draft",
      pillClass: "pill-" + (row.kind || "due")
    }));
    this.listEmpty = this.visibleInvoices.length === 0;
    this.listEmptyLabel = "Nothing in this list.";
  },
  applyDashboard(res, keepEmail) {
    const keepView = this.dashView;
    const keepId = this.detailId;
    if (res.businessName) this.businessName = res.businessName;
    this.asOf = res.asOf || "";
    this.periodData = res.periods || {};
    this.invoiceRows = Array.isArray(res.invoices) ? res.invoices : [];
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
    this.syncPeriodClasses();
    this.syncActive();
    this.syncVisibleInvoices();
    if (keepView === "detail" && keepId) {
      const row = this.invoiceRows.find((item) => item.id === keepId);
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
    const message = this.failMessage(res, "Could not read ClientRecords from the spreadsheet. Use Refresh.");
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
    if (id !== "month" && id !== "quarter" && id !== "year") return;
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
      due: "Still to collect",
      send: "Still to send",
      draft: "Still to send",
      done: "Done"
    };
    this.listTitle = (titles[kind] || "Invoices") + (periodScoped && this.activeLabel ? " · " + this.activeLabel : "");
    const hints = {
      due: "Sent, and not paid yet. Open one to mark it paid or written off.",
      send: "Not sent yet. Open one and mark it invoiced, then create the PDF.",
      draft: "Not sent yet. Open one and mark it invoiced, then create the PDF.",
      done: "Paid or written off. Undo puts one back to invoiced."
    };
    this.listHint = hints[kind] || "";
    this.dashView = "list";
    this.driveUrl = "";
    this.clearFeedback();
    this.syncVisibleInvoices();
  },
  showDashHome() {
    this.dashView = "home";
    this.driveUrl = "";
    this.clearFeedback();
  },
  showDashList() {
    this.dashView = "list";
    this.driveUrl = "";
    this.clearFeedback();
    this.syncVisibleInvoices();
  },
  prettyPeriod(text) {
    const raw = String(text || "").trim();
    if (!raw || raw === "—") return "";
    return raw.split(/\s+-\s+/).map((part) => {
      const pretty = this.prettyDate(part.trim());
      return pretty === "—" ? part.trim() : pretty;
    }).join(" – ");
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
      "Total owed " + this.money(row.total),
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
    const wasDraft = this.detailIsDraft;
    if (wasDraft) this.setDetailPhase("Invoiced");
    this.setFeedback(wasDraft
      ? "Preview cannot print the PDF. Invoice marked invoiced."
      : "Preview cannot print the PDF. Saving, downloading, or emailing it marks a draft invoiced.", false);
  },
  fillDetail(row, lines, keepEmail) {
    const sameInvoice = !!keepEmail && this.detailId === row.id;
    this.detailId = row.id;
    this.detailCode = row.code || row.id;
    this.detailClient = row.clientName || "No client";
    this.detailStatus = row.status || "Draft";
    this.detailWhen = row.date ? this.prettyDate(row.date) : "No invoice date";
    this.detailDue = row.dueDate ? this.dueNote(row) : "No due date yet";
    this.detailHours = this.hoursText(row.hours) + " h";
    this.detailTotal = this.money(row.total);
    this.detailService = row.servicePeriod || "—";
    this.detailJob = row.jobDetails || "—";
    const letterRow = this.invoiceLetterRow(row);
    const drafted = this.invoiceEmailDraft(letterRow);
    this.detailEmail = this.invoiceAddress(row);
    this.detailFrom = this.businessName || "EverydayWork";
    this.detailSubject = this.invoiceEmailSubject(this.detailFrom, this.detailCode);
    this.detailIsDraft = row.kind === "draft";
    this.detailCanSavePdf = row.kind !== "draft";
    this.detailCanFinish = row.kind === "due";
    this.detailCanUndo = row.kind === "paid" || row.kind === "writtenoff";
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
      amount: this.money(line.amount)
    }));
    this.detailLinesEmpty = this.detailLines.length === 0;
    this.dashView = "detail";
  },
  async openInvoice(id) {
    const row = (this.invoiceRows || []).find((item) => item.id === id);
    if (!row) return;
    this.driveUrl = "";
    this.clearFeedback();
    if (this.previewMode || Array.isArray(row.lines)) {
      this.fillDetail(row, row.lines || []);
      return;
    }
    this.fillDetail(row, []);
    try {
      const res = await this.api("getInvoiceDetail", { invoiceId: id });
      if (res && res.success && res.invoice) {
        this.fillDetail(Object.assign({}, row, res.invoice), res.invoice.lines || []);
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
    if (this.saving || !this.detailId || !this.detailCanSavePdf) return;
    const code = this.detailCode || this.detailId;
    if (this.previewMode) {
      await this.withInvoiceWait("Saving the PDF…", () => this.wait(1500));
      this.setFeedback(this.pdfSavedMessage({ fileName: code + ".pdf" }), false);
      return;
    }
    this.clearFeedback();
    await this.withInvoiceWait("Saving the PDF…", async () => {
      try {
        const res = await this.api("exportInvoicePdf", { invoiceId: this.detailId, mode: "drive" }, { quiet: true, timeoutMs: 60000, write: true });
        if (res && res.success) {
          this.driveUrl = res.url || "";
          this.noteIssued(res);
          this.setFeedback(this.pdfSavedMessage(res), false);
          if (res.markedInvoiced) await this.refreshSnapshot({ quiet: true, announce: false, resync: true });
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
        const res = await this.api("exportInvoicePdf", { invoiceId: this.detailId, mode: "download" }, { quiet: true, timeoutMs: 60000, write: true });
        if (res && res.success && res.pdfBase64) {
          this.savePdfFile(res.fileName, res.pdfBase64);
          this.noteIssued(res);
          this.setFeedback(res.message || "PDF downloaded. Attach it to your email.", false);
          if (res.markedInvoiced) await this.refreshSnapshot({ quiet: true, announce: false, resync: true });
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
      this.setFeedback("Enter an email address to send the PDF.", true);
      return;
    }
    if (this.previewMode) {
      await this.withInvoiceWait("Sending the invoice…", () => this.wait(1500));
      this.previewIssue();
      return;
    }
    this.clearFeedback();
    await this.withInvoiceWait("Sending the invoice…", async () => {
      try {
        const res = await this.api("exportInvoicePdf", {
          invoiceId: this.detailId,
          mode: "email",
          email: email,
          message: this.detailMessage
        }, { quiet: true, timeoutMs: 60000, write: true });
        if (res && res.success) {
          this.noteIssued(res);
          this.setFeedback(res.message || "Invoice emailed.", false);
          if (res.markedInvoiced) await this.refreshSnapshot({ quiet: true, announce: false, resync: true });
        } else this.showPdfError(res, "Could not email the PDF.");
      } catch (err) {
        this.setFeedback("Could not email the PDF.", true);
      }
    });
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
  async compileOpenInvoice() {
    if (this.saving || !this.detailId) return;
    if (this.previewMode) {
      this.setDetailPhase("Invoiced");
      this.setFeedback("Invoice " + (this.detailCode || this.detailId) + " marked invoiced.", false);
      return;
    }
    this.saving = true;
    this.loadingLabel = "Saving the invoice…";
    this.clearFeedback();
    try {
      const res = await this.api("compileInvoice", { invoiceId: this.detailId }, { write: true });
      if (res && res.success) {
        this.setDetailPhase("Invoiced");
        this.setFeedback(res.message || "Invoice marked invoiced.", false);
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
  setDetailPhase(status) {
    this.detailStatus = status;
    this.detailIsDraft = status === "Draft";
    this.detailCanSavePdf = status !== "Draft";
    this.detailCanFinish = status === "Invoiced";
    this.detailCanUndo = status === "Paid" || status === "Written off";
  },
  async markDetailStatus(status) {
    if (this.saving || !this.detailId) return;
    const code = this.detailCode || this.detailId;
    const previewMessage = status === "Undo"
      ? ("Invoice " + code + " back to invoiced.")
      : ("Invoice " + code + " marked " + status + ".");
    if (this.previewMode) {
      this.setDetailPhase(status === "Undo" ? "Invoiced" : status);
      this.setFeedback(previewMessage, false);
      return;
    }
    this.saving = true;
    this.loadingLabel = "Saving the invoice…";
    this.clearFeedback();
    try {
      const res = await this.api("updateInvoiceStatus", { invoiceId: this.detailId, status: status }, { write: true });
      if (res && res.success) {
        this.setDetailPhase(res.status || (status === "Undo" ? "Invoiced" : status));
        this.setFeedback(res.message || previewMessage, false);
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
  clearFeedback() { this.feedback.text = ''; this.feedback.isError = false; this.mailAuthUrl = ""; },
  sampleSettings() {
    const row = (n, label, value) => ({ row: n, label: label, value: value });
    return {
      success: true,
      logo: "",
      settings: [
        row(2, "Default Hourly Rate", "65"),
        row(4, "Default Currency", "EUR"),
        row(5, "Business Name", "Everyday Business"),
        row(6, "Business Address", "Ireland"),
        row(7, "Business Email", "Jane@EverydayBusiness.ie"),
        row(8, "Website", "www.EverydayBusiness.ie"),
        row(9, "Business Phone", "00353 123 45678"),
        row(11, "Bank Account Name", "Everyday Business"),
        row(12, "IBAN", "IEXX XXXX XXXX XXXX XXXX XX")
      ],
      breaks: [
        row(16, "na", "00:00"),
        row(17, "half hour", "00:30"),
        row(18, "hour", "01:00"),
        row(19, "hour and half", "01:30"),
        row(20, "two hours", "02:00")
      ]
    };
  },
  settingKey(label) {
    const name = String(label || "").trim().toLowerCase();
    const settings = {
      "default hourly rate": "rate",
      "default currency": "currency",
      "business name": "name",
      "business address": "address",
      "business email": "email",
      website: "website",
      "business phone": "phone",
      "bank account name": "bank",
      iban: "iban"
    };
    const breaks = { na: "na", "half hour": "half", hour: "hour", "hour and half": "hourHalf", "two hours": "two" };
    if (settings[name]) return { key: settings[name], kind: "setting" };
    if (breaks[name]) return { key: breaks[name], kind: "break" };
    return null;
  },
  applySettings(res) {
    const show = {
      rate: false, currency: false, name: false, address: false, email: false,
      website: false, phone: false, bank: false, iban: false,
      na: false, half: false, hour: false, hourHalf: false, two: false
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
      meta[mapped.key] = { row: row.row, label: row.label, kind: "setting" };
      this.settingsForm[mapped.key] = row.value == null ? "" : String(row.value);
    });
    (Array.isArray(res && res.breaks) ? res.breaks : []).forEach((row) => {
      const mapped = this.settingKey(row && row.label);
      if (!mapped || mapped.kind !== "break") return;
      show[mapped.key] = true;
      meta[mapped.key] = { row: row.row, label: row.label, kind: "break" };
      this.breakForm[mapped.key] = row.value == null ? "" : String(row.value);
    });
    this.settingsShow = show;
    this.settingsMeta = meta;
    this.extraSettings = extra;
    this.renderExtraSettings(extra);
    this.logoPreview = (res && res.logo) || "";
    this.logoDirty = false;
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
    const breaks = [];
    Object.keys(this.settingsMeta || {}).forEach((key) => {
      const meta = this.settingsMeta[key];
      if (!meta || !meta.row) return;
      const value = meta.kind === "break" ? this.breakForm[key] : this.settingsForm[key];
      const item = { row: meta.row, label: meta.label, value: value };
      if (meta.kind === "break") breaks.push(item);
      else settings.push(item);
    });
    (this.extraSettings || []).forEach((row) => {
      if (row && row.row && row.label) settings.push({ row: row.row, label: row.label, value: row.value });
    });
    const payload = { settings: settings, breaks: breaks };
    if (this.logoDirty && this.logoPreview) payload.logo = this.logoPreview;
    return payload;
  },
  settingsProblem(payload) {
    const rate = (this.settingsForm.rate || "").trim();
    if (this.settingsShow.rate && rate && !/^\d+(\.\d+)?$/.test(rate)) return "Default hourly rate must be a number.";
    const email = (this.settingsForm.email || "").trim();
    if (this.settingsShow.email && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Business email needs to look like an email address.";
    const breaks = payload.breaks || [];
    for (let i = 0; i < breaks.length; i++) {
      const text = String(breaks[i].value || "").trim();
      if (!/^\d{1,2}:\d{2}$/.test(text)) return "Enter " + breaks[i].label + " as hours and minutes, for example 00:30.";
      const parts = text.split(":");
      if (Number(parts[0]) > 23 || Number(parts[1]) > 59) return "Enter " + breaks[i].label + " as hours and minutes, for example 00:30.";
    }
    return "";
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
    this.loading = true;
    this.loadingLabel = "Loading settings…";
    try {
      const res = await this.api("getSettings", {}, { quiet: true });
      if (res && /Invalid API action/.test(String(res.error || ""))) {
        const blank = this.sampleSettings();
        blank.settings.forEach((row) => { row.value = ""; });
        blank.breaks.forEach((row) => { row.value = ""; });
        this.applySettings(blank);
        this.setFeedback("Could not read settings. Open the EverydayWork spreadsheet, Extensions, Apps Script, and replace Code.gs. Run authorizeEverydayWork and choose Allow. Open Deploy, Manage deployments, edit this web app, set Version to New version, and Deploy.", true);
        return;
      }
      if (res && res.success) {
        this.applySettings(res);
        return;
      }
      this.setFeedback(this.failMessage(res, "Could not read settings. Try Refresh."), true);
    } catch (err) {
      this.setFeedback("Could not read settings. Try Refresh.", true);
    } finally {
      this.loading = false;
      this.loadingLabel = "Updating…";
    }
  },
  async saveSettings() {
    if (this.saving) return;
    this.clearFeedback();
    const payload = this.settingsPayload();
    if (!payload.settings.length && !payload.breaks.length && !payload.logo) {
      this.setFeedback("Could not save settings. Open Settings again so the Config sheet can load.", true);
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

/**
 * FlexiTrack Custom Polyfill Core & Controller
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
        if (!btn || !el.contains(btn)) return;
        const name = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id') || '';
        if (typeof proxyState[name] === 'function') proxyState[name](id);
      });

      el.querySelectorAll('button, a, select, input, textarea').forEach(btn => {
        const hasClick = btn.hasAttribute('@click') || btn.hasAttribute('x-on:click');
        if (hasClick) {
          const clickExpr = btn.getAttribute('@click') || btn.getAttribute('x-on:click');
          btn.addEventListener('click', () => {
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
      badDebtAmount: 80, badDebtCount: 1
    },
    periods: {
      month: { label: "September 2026", hours: 7, shifts: 3, clients: 2, billable: 290, avgRate: 41.43, topClient: "Acme", topClientHours: 4, paid: 0, paidCount: 0, sent: 240, sentCount: 2, due: 240, dueCount: 2, draft: 50, draftCount: 1, overdue: 200, overdueCount: 1, badDebt: 0, badDebtCount: 0 },
      quarter: { label: "Q3 2026", hours: 12, shifts: 5, clients: 2, billable: 470, avgRate: 39.17, topClient: "Acme", topClientHours: 9, paid: 100, paidCount: 1, sent: 420, sentCount: 4, due: 240, dueCount: 2, draft: 50, draftCount: 1, overdue: 200, overdueCount: 1, badDebt: 80, badDebtCount: 1 },
      year: { label: "2026", hours: 12, shifts: 5, clients: 2, billable: 470, avgRate: 39.17, topClient: "Acme", topClientHours: 9, paid: 100, paidCount: 1, sent: 420, sentCount: 4, due: 240, dueCount: 2, draft: 50, draftCount: 1, overdue: 200, overdueCount: 1, badDebt: 80, badDebtCount: 1 }
    },
    invoices: [
      row({ id: "INV-JR26-002", code: "INV-JR26-002", clientName: "Acme", status: "Invoiced", kind: "due", date: "2026-09-01", dueDate: "2026-09-15", overdue: true, daysOverdue: 7, hours: 4, total: 200, email: "acme@example.com", terms: 14, jobDetails: "Site visit", inMonth: true, lines: [{ date: "2026-09-02", details: "Site visit", start: "08:00", finish: "12:00", hours: 4, amount: 200 }] }),
      row({ id: "INV-JR26-005", code: "INV-JR26-005", clientName: "Other Co", status: "Unpaid", kind: "due", date: "2026-09-20", dueDate: "2026-10-20", hours: 2, total: 40, terms: 30, inMonth: true, lines: [{ date: "2026-09-21", details: "Callout", start: "09:00", finish: "11:00", hours: 2, amount: 40 }] }),
      row({ id: "INV-JR26-003", code: "INV-JR26-003", clientName: "Other Co", status: "Draft", kind: "draft", date: "2026-09-10", dueDate: "2026-10-10", hours: 1, total: 50, terms: 30, inMonth: true, lines: [{ date: "2026-09-12", details: "Survey", start: "09:00", finish: "10:00", hours: 1, amount: 50 }] }),
      row({ id: "INV-JR26-001", code: "INV-JR26-001", clientName: "Acme", status: "Paid", kind: "paid", date: "2026-08-01", dueDate: "2026-08-15", hours: 3, total: 100, email: "acme@example.com", terms: 14, lines: [{ date: "2026-08-02", details: "Install", start: "09:00", finish: "12:00", hours: 3, amount: 100 }] }),
      row({ id: "INV-JR26-004", code: "INV-JR26-004", clientName: "Acme", status: "Bad debt", kind: "bad", date: "2026-07-15", dueDate: "2026-07-29", hours: 2, total: 80, email: "acme@example.com", terms: 14, lines: [{ date: "2026-07-16", details: "Repair", start: "09:00", finish: "11:00", hours: 2, amount: 80 }] })
    ]
  };
}

// ==========================================
// APPLICATION CONTROLLER STATE MACHINE
// ==========================================
window.Alpine.data('appState', () => ({
  loading: false,
  currentTab: 'dashboard',
  feedback: { text: '', isError: false },
  clients: [],
  
  apiUrl: "https://script.google.com/macros/s/AKfycbzM1KFqXeRKFyE6Cx0Ov0moPMzLdrnjmseu-tC3kMaibM_oYuOEgfWNcDK3R55-aiQ/exec",

  invoiceForm: { clientName: '' },
  unbilledData: { totalHours: 0, totalAmount: 0 },
  invoices: [],
  clientInvoices: [],
  draftInvoices: [],
  showDraftList: false,
  noDraftInvoices: false,
  noDraftLabel: '',
  billing: { invoiceId: '', statusLabel: '—' },
  showExistingInvoices: false,
  invoiceHint: 'This shift will open a new draft invoice.',
  overnight: false,
  overnightLabel: '',
  previewMode: /(?:\?|&)preview=1(?:&|$)/.test(typeof location !== "undefined" ? location.search : ""),
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
  tabTrackerClass: "",
  tabInvoicerClass: "",
  tabBillingClass: "",
  asOf: "",
  openDueAmount: "€0.00",
  openDueCount: "0 invoices",
  openOverdueAmount: "€0.00",
  openOverdueCount: "0 invoices",
  openDraftAmount: "€0.00",
  openDraftCount: "0 invoices",
  openBadAmount: "€0.00",
  openBadCount: "0 invoices",
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
  detailIsDraft: false,
  detailLines: [],
  detailLinesRaw: [],
  detailLinesEmpty: true,
  driveUrl: "",
  form: { clientName: '', date: (() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + mm + '-' + dd;
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
  nextDayLabel(dateStr) {
    if (!dateStr) return 'the next day';
    const parts = String(dateStr).split('-').map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return 'the next day';
    const next = new Date(parts[0], parts[1] - 1, parts[2] + 1);
    return next.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  },
  syncOvernight() {
    const overnight = this.isOvernightShift(this.form.start, this.form.finish);
    this.overnight = overnight;
    this.overnightLabel = overnight
      ? ('Overnight shift · finishes ' + this.nextDayLabel(this.form.date))
      : '';
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
  refreshDraftInvoices() {
    const name = this.invoiceForm.clientName;
    this.showDraftList = !!name;
    this.draftInvoices = !name ? [] : (this.invoices || []).filter((inv) => {
      return inv.clientName === name && this.isDraftStatus(inv.status);
    });
    this.noDraftInvoices = !!(name && !this.draftInvoices.length);
    this.noDraftLabel = this.noDraftInvoices
      ? 'No draft invoices for this account. Compile still closes unbilled time that has no invoice yet.'
      : '';
  },
  syncInvoiceHint() {
    const existing = this.form.invoiceMode === 'existing';
    this.showExistingInvoices = existing;
    if (!existing) {
      this.invoiceHint = 'This shift will open a new draft invoice.';
      return;
    }
    if (!this.form.clientName) {
      this.invoiceHint = 'Choose a client to see their draft invoices.';
      return;
    }
    if (!this.clientInvoices.length) {
      const named = (this.invoices || []).filter((inv) => !inv.clientName || inv.clientName === this.form.clientName);
      this.invoiceHint = named.length
        ? 'No draft invoices left for this client. Time cannot be added once an invoice leaves Draft.'
        : 'No invoices yet for this client. Create a new one instead.';
      return;
    }
    this.invoiceHint = this.form.invoiceId
      ? ('This shift will be added to draft invoice ' + this.form.invoiceId + '.')
      : 'Choose a draft invoice. Time cannot be added once an invoice leaves Draft.';
  },
  syncBillingStatus() {
    const id = this.billing.invoiceId;
    const inv = (this.invoices || []).find((item) => item.id === String(id));
    this.billing.statusLabel = inv ? (inv.status || 'Draft') : '—';
  },
  onClientChange() {
    this.form.invoiceId = '';
    this.refreshClientInvoices();
  },
  onInvoiceModeChange() {
    if (this.form.invoiceMode !== 'existing') this.form.invoiceId = '';
    this.syncInvoiceHint();
  },
  failMessage(res, fallback) {
    if (res && res.error) return String(res.error);
    return fallback;
  },
  async api(actionName, payloadData = {}) {
    this.loading = true;
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: actionName, payload: payloadData })
      });
      const result = await response.json();
      this.loading = false;
      return result;
    } catch (err) {
      this.loading = false;
      this.setFeedback("Database transmission failure.", true);
      throw err;
    }
  },
  async init() {
    this.syncTabClasses();
    this.syncPeriodClasses();
    this.syncOvernight();
    if (this.previewMode) {
      await this.loadDashboard();
      return;
    }
    try {
      const res = await this.api('getInitialAppData');
      if (res && res.success) {
        this.clients = (Array.isArray(res.clients) ? res.clients : []).map(c => {
          if (typeof c === 'string') return { name: c };
          return { name: (c && (c.name || c.Name || c.clientName)) || '' };
        }).filter(c => c.name);
        this.invoices = this.mapInvoices(res.invoices);
        this.refreshClientInvoices();
      } else if (!this.previewMode) {
        this.setFeedback(this.failMessage(res, "Cloud synchronization offline."), true);
      }
    } catch (err) {
      if (!this.previewMode) this.setFeedback("Cloud synchronization offline.", true);
    }
    await this.loadDashboard();
  },
  syncTabClasses() {
    this.tabDashClass = this.currentTab === "dashboard" ? "nav-on" : "";
    this.tabTrackerClass = this.currentTab === "tracker" ? "nav-on" : "";
    this.tabInvoicerClass = this.currentTab === "invoicer" ? "nav-on" : "";
    this.tabBillingClass = this.currentTab === "billing" ? "nav-on" : "";
  },
  setDashTab() {
    this.currentTab = "dashboard";
    this.syncTabClasses();
    this.clearFeedback();
    this.loadDashboard({ quiet: true });
  },
  setTrackerTab() { this.currentTab = 'tracker'; this.syncTabClasses(); this.clearFeedback(); },
  setInvoicerTab() {
    this.currentTab = 'invoicer';
    this.syncTabClasses();
    this.clearFeedback();
    this.refreshDraftInvoices();
    if (this.invoiceForm.clientName) this.loadUnbilledEntries();
    else this.unbilledData = { totalHours: 0, totalAmount: 0 };
  },
  setBillingTab() {
    this.currentTab = 'billing';
    this.syncTabClasses();
    this.clearFeedback();
    this.syncBillingStatus();
  },

  async submitForm() {
    this.clearFeedback();
    if (!this.form.clientName) {
      this.setFeedback("Choose a client account first.", true);
      return;
    }
    if (this.timeToMinutes(this.form.start) == null || this.timeToMinutes(this.form.finish) == null) {
      this.setFeedback("Choose a start and finish time.", true);
      return;
    }
    if (this.form.invoiceMode === 'existing' && !this.form.invoiceId) {
      this.setFeedback("Choose a draft invoice, or create a new one.", true);
      return;
    }
    if (this.form.invoiceMode === 'existing') {
      const chosen = (this.invoices || []).find((inv) => inv.id === String(this.form.invoiceId));
      if (chosen && !this.isDraftStatus(chosen.status)) {
        this.setFeedback("Time can only be added while an invoice is Draft. Invoice " + chosen.id + " is " + chosen.status + ".", true);
        return;
      }
    }
    this.syncOvernight();
    try {
      const result = await this.api('logTimeEntry', {
        clientName: this.form.clientName,
        date: this.form.date,
        jobDetails: this.form.jobDetails,
        start: this.form.start,
        lunch: this.form.lunch,
        finish: this.form.finish,
        overnight: this.overnight,
        invoiceMode: this.form.invoiceMode,
        invoiceId: this.form.invoiceId
      });
      if (result && result.success) {
        this.setFeedback(result.message || "Shift records submitted to ledger!", false);
        this.form.jobDetails = '';
        if (result.invoices) this.invoices = this.mapInvoices(result.invoices);
        else if (result.invoiceId) {
          const id = String(result.invoiceId);
          if (!this.invoices.some((inv) => inv.id === id)) {
            this.invoices = this.invoices.concat([{
              id: id,
              clientName: this.form.clientName,
              status: 'Draft',
              date: this.form.date,
              label: 'Invoice ' + id + ' · Draft'
            }]);
          }
        }
        this.refreshClientInvoices();
        this.refreshDraftInvoices();
      } else {
        this.setFeedback(this.failMessage(result, "API Connection dropped."), true);
      }
    } catch (e) {
      this.setFeedback("API Connection dropped.", true);
    }
  },
  async loadUnbilledEntries() {
    this.refreshDraftInvoices();
    if (!this.invoiceForm.clientName) { this.unbilledData = { totalHours: 0, totalAmount: 0 }; return; }
    try {
      const res = await this.api('getUnbilledSummary', { clientName: this.invoiceForm.clientName });
      if (res && res.success) {
        this.unbilledData.totalHours = Number(res.totalHours) || 0;
        this.unbilledData.totalAmount = Number(res.totalAmount) || 0;
      } else {
        this.setFeedback(this.failMessage(res, "Metrics sync failed."), true);
      }
    } catch (err) {
      this.setFeedback("Metrics sync failed.", true);
    }
  },
  async processInvoice() {
    this.clearFeedback();
    if (!this.invoiceForm.clientName) {
      this.setFeedback("Choose a client account first.", true);
      return;
    }
    try {
      const res = await this.api('compileFinalInvoice', { clientName: this.invoiceForm.clientName });
      if (res && res.success) {
        this.setFeedback(res.message || ("Invoice Ref: " + res.invoiceId + " set to Invoiced."), false);
        this.invoiceForm.clientName = '';
        this.unbilledData = { totalHours: 0, totalAmount: 0 };
        if (res.invoices) {
          this.invoices = this.mapInvoices(res.invoices);
          this.refreshClientInvoices();
        }
        this.refreshDraftInvoices();
        this.syncBillingStatus();
      } else {
        this.setFeedback(this.failMessage(res, "Processing timeout."), true);
      }
    } catch (err) {
      this.setFeedback("Processing timeout.", true);
    }
  },
  async markInvoiceStatus(status) {
    this.clearFeedback();
    if (!this.billing.invoiceId) {
      this.setFeedback("Choose an invoice first.", true);
      return;
    }
    try {
      const res = await this.api('updateInvoiceStatus', {
        invoiceId: this.billing.invoiceId,
        status: status
      });
      if (res && res.success) {
        if (res.invoices) this.invoices = this.mapInvoices(res.invoices);
        this.refreshClientInvoices();
        this.refreshDraftInvoices();
        this.syncBillingStatus();
        if (this.dashboardLive) await this.loadDashboard({ quiet: true });
        this.setFeedback(res.message || ("Invoice " + this.billing.invoiceId + " marked " + status + "."), false);
      } else {
        this.setFeedback(this.failMessage(res, "Could not update invoice status."), true);
      }
    } catch (err) {
      this.setFeedback("Could not update invoice status.", true);
    }
  },
  markPaid() { return this.markInvoiceStatus('Paid'); },
  markUnpaid() { return this.markInvoiceStatus('Unpaid'); },
  markBadDebt() { return this.markInvoiceStatus('Bad debt'); },

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
    this.activePaid = this.money(period.paid);
    this.activePaidCount = this.countLabel(period.paidCount, "invoice", "invoices");
    this.activeSent = this.money(period.sent);
    this.activeSentCount = this.countLabel(period.sentCount, "invoice", "invoices");
    this.activeDue = this.money(period.due);
    this.activeDueCount = this.countLabel(period.dueCount, "invoice", "invoices");
    this.activeDraft = this.money(period.draft);
    this.activeDraftCount = this.countLabel(period.draftCount, "invoice", "invoices");
    this.activeOverdue = this.money(period.overdue);
    this.activeOverdueCount = this.countLabel(period.overdueCount, "invoice", "invoices");
    this.activeBad = this.money(period.badDebt);
    this.activeBadCount = this.countLabel(period.badDebtCount, "invoice", "invoices");
  },
  invoiceMeta(row) {
    const bits = [];
    if (row.clientName) bits.push(row.clientName);
    if (row.date) bits.push(this.prettyDate(row.date));
    if (row.dueDate) bits.push("Due " + this.prettyDate(row.dueDate));
    else if (row.kind === "draft") bits.push("Not sent");
    return bits.join(" · ");
  },
  syncVisibleInvoices() {
    const flag = this.period === "quarter" ? "inQuarter" : this.period === "year" ? "inYear" : "inMonth";
    let rows = this.invoiceRows || [];
    if (this.listScope === "period") rows = rows.filter((row) => row[flag]);
    const filter = this.invoiceFilter;
    if (filter === "due") rows = rows.filter((row) => row.kind === "due");
    else if (filter === "overdue") rows = rows.filter((row) => row.overdue);
    else if (filter === "draft") rows = rows.filter((row) => row.kind === "draft");
    else if (filter === "paid") rows = rows.filter((row) => row.kind === "paid");
    else if (filter === "bad") rows = rows.filter((row) => row.kind === "bad");
    else if (filter === "sent") rows = rows.filter((row) => row.kind !== "draft");
    this.visibleInvoices = rows.map((row) => ({
      id: row.id,
      title: row.code || row.id,
      meta: this.invoiceMeta(row),
      amount: this.money(row.total),
      pill: row.overdue ? "Overdue" : (row.kind === "due" && row.dueDate && row.dueDate === this.asOf ? "Due today" : row.status),
      pillClass: row.overdue ? "pill-overdue" : ("pill-" + (row.kind || "due"))
    }));
    this.listEmpty = this.visibleInvoices.length === 0;
    this.listEmptyLabel = "Nothing in this list.";
  },
  applyDashboard(res, keepEmail) {
    const keepView = this.dashView;
    const keepId = this.detailId;
    this.asOf = res.asOf || "";
    this.periodData = res.periods || {};
    this.invoiceRows = Array.isArray(res.invoices) ? res.invoices : [];
    const open = res.open || {};
    this.openDueAmount = this.money(open.dueAmount);
    this.openDueCount = this.countLabel(open.dueCount, "invoice", "invoices");
    this.openOverdueAmount = this.money(open.overdueAmount);
    this.openOverdueCount = this.countLabel(open.overdueCount, "invoice", "invoices");
    this.openDraftAmount = this.money(open.draftAmount);
    this.openDraftCount = this.countLabel(open.draftCount, "invoice", "invoices");
    this.openBadAmount = this.money(open.badDebtAmount);
    this.openBadCount = this.countLabel(open.badDebtCount, "invoice", "invoices");
    this.syncPeriodClasses();
    this.syncActive();
    this.syncVisibleInvoices();
    if (keepView === "detail" && keepId) {
      const row = this.invoiceRows.find((item) => item.id === keepId);
      if (row) this.fillDetail(row, this.detailLinesRaw || [], keepEmail);
      else this.dashView = "home";
    } else {
      this.dashView = keepView || "home";
    }
  },
  async loadDashboard(opts) {
    const quiet = opts && opts.quiet;
    if (this.previewMode) {
      this.dashboardLive = false;
      this.dashboardNote = "Sample figures for the layout. Live totals appear after Code.gs is pasted into Apps Script and deployed.";
      this.applyDashboard(sampleDashboard(), true);
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
      overdue: "Overdue",
      draft: "Ready to compile",
      paid: "Paid",
      sent: "Sent",
      bad: "Bad debt"
    };
    this.listTitle = (titles[kind] || "Invoices") + (periodScoped && this.activeLabel ? " · " + this.activeLabel : "");
    const hints = {
      due: "Sent, and not paid yet. Open one to download the PDF or mark it paid.",
      overdue: "Past the client payment terms. Open one to chase it.",
      draft: "Not sent yet. Compile marks the draft as Invoiced, then create the PDF.",
      paid: "Invoices in this period that are marked Paid.",
      sent: "Issued in this period, including ones later paid or written off.",
      bad: "Written off. These are not included in still to collect."
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
  fillDetail(row, lines, keepEmail) {
    this.detailId = row.id;
    this.detailCode = row.code || row.id;
    this.detailClient = row.clientName || "No client";
    this.detailStatus = row.overdue
      ? (row.status + " · " + row.daysOverdue + (row.daysOverdue === 1 ? " day overdue" : " days overdue"))
      : (row.status || "Draft");
    this.detailWhen = row.date ? this.prettyDate(row.date) : "No invoice date";
    this.detailDue = row.dueDate ? ("Due " + this.prettyDate(row.dueDate)) : "No due date yet";
    this.detailHours = this.hoursText(row.hours) + " h";
    this.detailTotal = this.money(row.total);
    this.detailService = row.servicePeriod || "—";
    this.detailJob = row.jobDetails || "—";
    this.detailIsDraft = row.kind === "draft";
    if (!keepEmail) this.detailEmail = row.email || "";
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
    if (this.previewMode) {
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
  previewPdfNote() {
    this.setFeedback("The PDF is built from INV-Template after Code.gs is deployed.", false);
  },
  async saveInvoicePdf() {
    if (!this.detailId) return;
    if (this.previewMode) return this.previewPdfNote();
    this.clearFeedback();
    try {
      const res = await this.api("exportInvoicePdf", { invoiceId: this.detailId, mode: "drive" });
      if (res && res.success) {
        this.driveUrl = res.url || "";
        this.setFeedback(res.message || "Saved to the Invoices folder.", false);
      } else {
        this.setFeedback(this.failMessage(res, "Could not save the PDF."), true);
      }
    } catch (err) {
      this.setFeedback("Could not save the PDF.", true);
    }
  },
  async downloadInvoicePdf() {
    if (!this.detailId) return;
    if (this.previewMode) return this.previewPdfNote();
    this.clearFeedback();
    try {
      const res = await this.api("exportInvoicePdf", { invoiceId: this.detailId, mode: "download" });
      if (res && res.success && res.pdfBase64) {
        this.savePdfFile(res.fileName, res.pdfBase64);
        this.setFeedback(res.message || "PDF downloaded. Attach it to your email.", false);
      } else {
        this.setFeedback(this.failMessage(res, "Could not download the PDF."), true);
      }
    } catch (err) {
      this.setFeedback("Could not download the PDF.", true);
    }
  },
  async emailInvoicePdf() {
    if (!this.detailId) return;
    const email = String(this.detailEmail || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.setFeedback("Enter an email address to send the PDF.", true);
      return;
    }
    if (this.previewMode) return this.previewPdfNote();
    this.clearFeedback();
    try {
      const res = await this.api("exportInvoicePdf", { invoiceId: this.detailId, mode: "email", email: email });
      if (res && res.success) this.setFeedback(res.message || "Invoice emailed.", false);
      else this.setFeedback(this.failMessage(res, "Could not email the PDF."), true);
    } catch (err) {
      this.setFeedback("Could not email the PDF.", true);
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
  async compileOpenInvoice() {
    if (!this.detailId) return;
    if (this.previewMode) {
      this.setFeedback("Compile marks this draft as Invoiced after the script is updated.", false);
      return;
    }
    this.clearFeedback();
    try {
      const res = await this.api("compileInvoice", { invoiceId: this.detailId });
      if (res && res.success) {
        if (res.invoices) this.invoices = this.mapInvoices(res.invoices);
        this.refreshClientInvoices();
        this.refreshDraftInvoices();
        await this.loadDashboard({ quiet: true });
        const row = (this.invoiceRows || []).find((item) => item.id === this.detailId);
        if (row) this.fillDetail(row, this.detailLinesRaw || [], true);
        this.setFeedback(res.message || "Invoice set to Invoiced.", false);
      } else {
        this.setFeedback(this.failMessage(res, "Could not compile that invoice."), true);
      }
    } catch (err) {
      this.setFeedback("Could not compile that invoice.", true);
    }
  },
  async markDetailPaid() { return this.markDetailStatus("Paid"); },
  async markDetailUnpaid() { return this.markDetailStatus("Unpaid"); },
  async markDetailBad() { return this.markDetailStatus("Bad debt"); },
  async markDetailStatus(status) {
    if (!this.detailId) return;
    if (this.previewMode) {
      this.setFeedback("Status is saved on InvoiceList after the script is updated.", false);
      return;
    }
    this.clearFeedback();
    try {
      const res = await this.api("updateInvoiceStatus", { invoiceId: this.detailId, status: status });
      if (res && res.success) {
        if (res.invoices) this.invoices = this.mapInvoices(res.invoices);
        this.refreshClientInvoices();
        this.refreshDraftInvoices();
        this.syncBillingStatus();
        await this.loadDashboard({ quiet: true });
        const row = (this.invoiceRows || []).find((item) => item.id === this.detailId);
        if (row) this.fillDetail(row, this.detailLinesRaw || [], true);
        this.setFeedback(res.message || ("Invoice marked " + status + "."), false);
      } else {
        this.setFeedback(this.failMessage(res, "Could not update invoice status."), true);
      }
    } catch (err) {
      this.setFeedback("Could not update invoice status.", true);
    }
  },
  setFeedback(msg, isErr) { this.feedback.text = msg; this.feedback.isError = isErr; },
  clearFeedback() { this.feedback.text = ''; this.feedback.isError = false; }
}));

/**
 * FlexiTrack Custom Polyfill Core & Controller
 * Built for EverydayBusinessApps
 */

window.Alpine = {
  directives: {}, dataStore: {},
  directive(name, callback) { this.directives[name] = callback; },
  data(name, callback) { this.dataStore[name] = callback; },
  start() {
    document.querySelectorAll('[x-data]').forEach(el => {
      const expr = el.getAttribute('x-data');
      const state = this.dataStore[expr]();
      const binder = (target) => new Proxy(target, {
        set: (obj, prop, val) => { obj[prop] = val; this.renderDOM(el, binder(obj)); return true; }
      });
      const proxyState = binder(state);
      
      el.querySelectorAll('select, input, textarea').forEach(input => {
        const model = input.getAttribute('x-model');
        if (model) {
          const parts = model.split('.');
          input.value = parts.length > 1 ? proxyState[parts][parts] : proxyState[model];
          input.addEventListener('input', (e) => {
            if (parts.length > 1) proxyState[parts][parts] = e.target.value;
            else proxyState[model] = e.target.value;
          });
        }
      });

      el.querySelectorAll('button, a, select').forEach(btn => {
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
      });
      proxyState.init();
    });
  },
  renderDOM(root, state) {
    root.querySelectorAll('[x-text]').forEach(el => {
      const expr = el.getAttribute('x-text');
      const parts = expr.split('.');
      const val = parts.length > 1 ? state[parts][parts] : state[expr];
      el.innerText = typeof val === 'number' && expr.includes('Amount') ? "€" + val.toFixed(2) : val;
    });
    root.querySelectorAll('[x-show]').forEach(item => {
      const showExpr = item.getAttribute('x-show');
      const showParts = showExpr.split('===');
      if(showParts.length > 1) {
        const targetVal = showParts[1].replace(/['"]/g, "").trim();
        item.style.display = state[showParts[0].trim()] === targetVal ? 'block' : 'none';
      } else {
        item.style.display = state[showExpr] ? 'block' : 'none';
      }
    });
    root.removeAttribute('x-cloak');
  }
};

document.addEventListener('DOMContentLoaded', () => window.Alpine.start());

// ==========================================
// APPLICATION CONTROLLER STATE MACHINE
// ==========================================
window.Alpine.data('appState', () => ({
  loading: false,
  currentTab: 'tracker',
  feedback: { text: '', isError: false },
  clients: [],
  
  apiUrl: "https://google.com",

  invoiceForm: { clientName: '' },
  unbilledData: { totalHours: 0, totalAmount: 0 },
  form: { clientName: '', date: new Date().toISOString().substring(0, 10), jobDetails: '', start: '08:00', lunch: 'na', finish: '16:30' },

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
    try {
      const res = await this.api('getInitialAppData');
      if (res && res.success) {
        this.clients = Array.isArray(res.clients) ? res.clients : [];
        this.setFeedback("Everyday Job & Invoice Manager Active.", false);
      }
    } catch (err) {
      this.setFeedback("Cloud synchronization offline.", true);
    }
  },
  setTrackerTab() { this.currentTab = 'tracker'; this.clearFeedback(); },
  setInvoicerTab() { this.currentTab = 'invoicer'; this.clearFeedback(); this.unbilledData = { totalHours: 0, totalAmount: 0 }; },
  
  onClientSelect() {
    const selected = this.clients.find(c => c.name === this.form.clientName);
    this.form.rate = selected ? selected.rate : 0;
  },
  async submitForm() {
    this.clearFeedback();
    try {
      const result = await this.api('logTimeEntry', { ...this.form });
      if (result && result.success) {
        this.setFeedback("Success! Event appended to ledger.", false);
        this.form.jobDetails = '';
      }
    } catch (e) {
      this.setFeedback("API Connection dropped.", true);
    }
  },
  async loadUnbilledEntries() {
    if (!this.invoiceForm.clientName) { this.unbilledData = { totalHours: 0, totalAmount: 0 }; return; }
    try {
      const res = await this.api('getUnbilledSummary', { clientName: this.invoiceForm.clientName });
      if (res && res.success) {
        this.unbilledData.totalHours = res.totalHours;
        this.unbilledData.totalAmount = res.totalAmount;
      }
    } catch (err) {
      this.setFeedback("Metrics sync failed.", true);
    }
  },
  async processInvoice() {
    this.clearFeedback();
    try {
      const res = await this.api('compileFinalInvoice', { clientName: this.invoiceForm.clientName });
      if (res && res.success) {
        this.setFeedback("Invoice Ref: " + res.invoiceId + " logged. Ready on INV-Template.", false);
        this.invoiceForm.clientName = '';
        this.unbilledData = { totalHours: 0, totalAmount: 0 };
      }
    } catch (err) {
      this.setFeedback("Processing timeout.", true);
    }
  },
  setFeedback(msg, isErr) { this.feedback.text = msg; this.feedback.isError = isErr; },
  clearFeedback() { this.feedback.text = ''; this.feedback.isError = false; }
}));

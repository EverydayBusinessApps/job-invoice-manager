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
    this.syncModels(root, state);
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
  
  apiUrl: "https://script.google.com/macros/s/AKfycbzM1KFqXeRKFyE6Cx0Ov0moPMzLdrnjmseu-tC3kMaibM_oYuOEgfWNcDK3R55-aiQ/exec",

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
        this.clients = (Array.isArray(res.clients) ? res.clients : []).map(c => {
          if (typeof c === 'string') return { name: c, rate: 0 };
          if (!c || typeof c !== 'object') return { name: '', rate: 0 };
          return {
            name: c.name || c.Name || c.clientName || '',
            rate: c.rate || c.Rate || 0
          };
        }).filter(c => c.name);
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

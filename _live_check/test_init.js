const fs = require('fs');
const vm = require('vm');
const path = __dirname + '/';

function makeEl(id) {
  const o = {
    id,
    value: '',
    innerHTML: '',
    textContent: '',
    hidden: false,
    className: '',
    checked: false,
    type: 'text',
    tagName: 'INPUT',
    children: [],
    style: {},
    dataset: {},
    attributes: {},
    classList: {
      _s: new Set(),
      toggle(c, f) {
        if (f === false) this._s.delete(c);
        else if (f === true) this._s.add(c);
        else if (this._s.has(c)) this._s.delete(c);
        else this._s.add(c);
      },
      add(c) {
        this._s.add(c);
      },
      remove(c) {
        this._s.delete(c);
      },
      contains(c) {
        return this._s.has(c);
      },
    },
    addEventListener() {},
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    getAttribute(k) {
      return this.attributes[k] ?? null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    appendChild() {},
    focus() {},
    options: [],
    selectedIndex: 0,
  };
  return new Proxy(o, {
    get(t, p) {
      if (p in t) return t[p];
      return () => null;
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
}

const oldStore = {
  version: 1,
  activeEmployeeId: 'e1',
  activeYear: 2026,
  activeMonth: 8,
  employees: [
    {
      id: 'e1',
      name: 'Иванов',
      months: {
        '2026-8': {
          grade: 'grade1',
          salonsTotal: 2,
          salonsList: [
            {
              name: 'Березники',
              operator: 'tele2',
              photoPassed: true,
              servicePassed: false,
              txvPassed: false,
              kpis: {},
            },
            {
              name: 'Кунгур',
              operator: 'mts',
              photoPassed: false,
              servicePassed: true,
              txvPassed: false,
              kpis: {},
            },
          ],
          administrative: {
            recommendations: { plan: 100, fact: 100 },
            cardShare: { plan: 25, fact: 20 },
            dovChecklist: { plan: 1, fact: 1 },
            monthlyTesting: { plan: 1, fact: 0 },
            photoReportPassed: 1,
            servicePassed: 1,
            txvPassed: 0,
          },
          economy: {},
          salesValues: {},
          operatorSalesValues: {},
          blackList: {},
        },
      },
    },
  ],
};

const els = {};
const document = {
  getElementById(id) {
    if (!els[id]) els[id] = makeEl(id);
    return els[id];
  },
  querySelector() {
    return makeEl('q');
  },
  querySelectorAll() {
    return [makeEl('p1'), makeEl('p2')];
  },
  addEventListener(type, fn) {
    if (type === 'DOMContentLoaded') {
      try {
        fn();
        console.log('DOMContentLoaded OK');
      } catch (e) {
        console.error('DOMContentLoaded FAIL', e.stack || e);
      }
    }
  },
  body: { addEventListener() {} },
};

const ls = {
  _d: { rtt_manager_salary_calculator_v1: JSON.stringify(oldStore) },
  getItem(k) {
    return this._d[k] ?? null;
  },
  setItem(k, v) {
    this._d[k] = String(v);
  },
  removeItem(k) {
    delete this._d[k];
  },
};

const sandbox = {
  localStorage: ls,
  document,
  console,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Date,
  JSON,
  Map,
  Set,
  Promise,
  parseInt,
  parseFloat,
  isNaN,
  Infinity,
  NaN,
  undefined,
  alert() {},
  confirm() {
    return true;
  },
  prompt() {
    return null;
  },
  encodeURIComponent,
  decodeURIComponent,
  setTimeout,
  clearTimeout,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

try {
  for (const f of ['data.js', 'calculator.js', 'storage.js', 'ui.js', 'script.js']) {
    console.log('load', f);
    vm.runInNewContext(fs.readFileSync(path + f, 'utf8'), sandbox, { filename: f });
  }
  console.log('employeeList:', String(els.employeeList?.innerHTML || '').slice(0, 120));
  console.log('employeeName:', els.employeeName?.value);
  console.log('analytics:', String(els.analyticsCards?.innerHTML || '').slice(0, 80));
} catch (e) {
  console.error('TOP FAIL', e.stack || e);
  process.exit(1);
}

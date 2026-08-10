/**
 * LocalStorage: сотрудники и помесячные расчёты.
 */

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultStore();
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (e) {
    console.warn('Не удалось прочитать LocalStorage, создаём новое хранилище', e);
    return createDefaultStore();
  }
}

function createDefaultStore() {
  const now = new Date();
  const employee = createEmptyEmployee('Новый руководитель');
  const key = periodKey(now.getFullYear(), now.getMonth() + 1);
  employee.months[key] = createEmptyMonthData();

  return {
    employees: [employee],
    activeEmployeeId: employee.id,
    activeYear: now.getFullYear(),
    activeMonth: now.getMonth() + 1,
  };
}

function normalizeStore(store) {
  if (!store || !Array.isArray(store.employees)) {
    return createDefaultStore();
  }

  store.employees = store.employees.map((emp) => {
    const normalized = {
      id: emp.id || `emp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: emp.name || 'Без имени',
      months: emp.months && typeof emp.months === 'object' ? emp.months : {},
    };

    Object.keys(normalized.months).forEach((key) => {
      normalized.months[key] = mergeMonthData(normalized.months[key]);
    });

    return normalized;
  });

  if (!store.employees.length) {
    return createDefaultStore();
  }

  if (!store.employees.some((e) => e.id === store.activeEmployeeId)) {
    store.activeEmployeeId = store.employees[0].id;
  }

  const now = new Date();
  store.activeYear = Number(store.activeYear) || now.getFullYear();
  store.activeMonth = Number(store.activeMonth) || now.getMonth() + 1;

  return store;
}

function mergeMonthData(data) {
  const base = createEmptyMonthData();
  if (!data || typeof data !== 'object') return base;

  const salonsTotal = Math.max(0, Math.floor(Number(data.salonsTotal) || 0));
  let salonsComboDone = Math.max(0, Math.floor(Number(data.salonsComboDone) || 0));
  if (salonsComboDone > salonsTotal) salonsComboDone = salonsTotal;

  return {
    grade: data.grade && managerGrades[data.grade] ? data.grade : base.grade,
    salesValues: { ...base.salesValues, ...(data.salesValues || {}) },
    operatorSalesValues: {
      ...base.operatorSalesValues,
      ...(data.operatorSalesValues || {}),
    },
    salonsTotal,
    salonsComboDone,
    creditPlanPercent:
      data.creditPlanPercent === undefined || data.creditPlanPercent === null
        ? base.creditPlanPercent
        : Number(data.creditPlanPercent),
    attachment:
      data.attachment === undefined || data.attachment === null
        ? base.attachment
        : Number(data.attachment),
    economy: {
      ...Object.fromEntries(
        economyKpiDefs.map((k) => [
          k.id,
          {
            plan: Number(data.economy?.[k.id]?.plan) || 0,
            fact: Number(data.economy?.[k.id]?.fact) || 0,
          },
        ])
      ),
    },
    administrative: mergeAdministrativeData(data.administrative, salonsTotal),
    operator: mergeOperatorData(data.operator, salonsTotal),
    blackList: { ...(data.blackList || {}) },
  };
}

function mergeAdministrativeData(raw, salonsTotal) {
  const base = createEmptyAdministrativeData();
  const src = raw && typeof raw === 'object' ? raw : {};

  administrativeRules.forEach((rule) => {
    if (rule.type === 'averageBudget') {
      base[rule.id] = {
        plan: Number(src[rule.id]?.plan) || 0,
        fact: Number(src[rule.id]?.fact) || 0,
      };
    }
  });

  let photo = Math.max(0, Math.floor(Number(src.photoReportPassed) || 0));
  let service = Math.max(0, Math.floor(Number(src.servicePassed) || 0));
  let txv = Math.max(0, Math.floor(Number(src.txvPassed) || 0));
  if (photo > salonsTotal) photo = salonsTotal;
  if (service > salonsTotal) service = salonsTotal;
  if (txv > salonsTotal) txv = salonsTotal;

  base.photoReportPassed = photo;
  base.servicePassed = service;
  base.txvPassed = txv;
  return base;
}

function mergeOperatorData(raw, salonsTotal) {
  const src = raw && typeof raw === 'object' ? raw : {};
  // Не обрезаем Tele2 здесь: превышение ловит валидация расчёта
  const tele2Salons = Math.max(0, Math.floor(Number(src.tele2Salons) || 0));

  const existing = Array.isArray(src.salons) ? src.salons : [];
  const salons = [];
  for (let i = 0; i < tele2Salons; i += 1) {
    const prev = existing[i]?.kpis || {};
    const kpis = createEmptyTele2SalonKpis();
    operatorTele2Kpis.forEach((kpi) => {
      kpis[kpi.id] = Boolean(prev[kpi.id]);
    });
    salons.push({ kpis });
  }

  return { tele2Salons, salons };
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function getActiveEmployee(store) {
  return store.employees.find((e) => e.id === store.activeEmployeeId) || store.employees[0];
}

function getActivePeriodKey(store) {
  return periodKey(store.activeYear, store.activeMonth);
}

function ensureActiveMonthData(store) {
  const employee = getActiveEmployee(store);
  const key = getActivePeriodKey(store);
  if (!employee.months[key]) {
    employee.months[key] = createEmptyMonthData();
  } else {
    employee.months[key] = mergeMonthData(employee.months[key]);
  }
  return employee.months[key];
}

function getActiveMonthData(store) {
  return ensureActiveMonthData(store);
}

function setActiveEmployee(store, employeeId) {
  if (store.employees.some((e) => e.id === employeeId)) {
    store.activeEmployeeId = employeeId;
    ensureActiveMonthData(store);
    saveStore(store);
  }
}

function setActivePeriod(store, year, month) {
  store.activeYear = Number(year);
  store.activeMonth = Number(month);
  ensureActiveMonthData(store);
  saveStore(store);
}

function addEmployee(store, name) {
  const employee = createEmptyEmployee(name || 'Новый руководитель');
  const key = getActivePeriodKey(store);
  employee.months[key] = createEmptyMonthData();
  store.employees.push(employee);
  store.activeEmployeeId = employee.id;
  saveStore(store);
  return employee;
}

function updateEmployeeName(store, employeeId, name) {
  const employee = store.employees.find((e) => e.id === employeeId);
  if (!employee) return;
  employee.name = name.trim() || 'Без имени';
  saveStore(store);
}

function deleteEmployee(store, employeeId) {
  if (store.employees.length <= 1) {
    return { ok: false, message: 'Нельзя удалить единственного сотрудника' };
  }

  store.employees = store.employees.filter((e) => e.id !== employeeId);
  if (store.activeEmployeeId === employeeId) {
    store.activeEmployeeId = store.employees[0].id;
  }
  ensureActiveMonthData(store);
  saveStore(store);
  return { ok: true };
}

function updateMonthField(store, updater) {
  const data = ensureActiveMonthData(store);
  updater(data);

  // Единые ограничения по количеству салонов
  data.salonsTotal = Math.max(0, Math.floor(Number(data.salonsTotal) || 0));
  if (data.salonsComboDone > data.salonsTotal) {
    data.salonsComboDone = data.salonsTotal;
  }

  data.administrative = mergeAdministrativeData(data.administrative, data.salonsTotal);
  data.operator = mergeOperatorData(data.operator, data.salonsTotal);

  // Пересохраняем нормализованный месяц
  const employee = getActiveEmployee(store);
  const key = getActivePeriodKey(store);
  employee.months[key] = mergeMonthData(data);

  saveStore(store);
  return employee.months[key];
}

function searchEmployees(store, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return store.employees;
  return store.employees.filter((e) => e.name.toLowerCase().includes(q));
}

function getEmployeePeriods(employee) {
  return Object.keys(employee.months || {})
    .map((key) => {
      const [year, month] = key.split('-').map(Number);
      return { key, year, month };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}
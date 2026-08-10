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
    uiCollapse: {},
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
  if (!store.uiCollapse || typeof store.uiCollapse !== 'object') {
    store.uiCollapse = {};
  }

  return store;
}

function mergeMonthData(data) {
  const base = createEmptyMonthData();
  if (!data || typeof data !== 'object') return base;

  const salonsTotal = Math.max(0, Math.floor(Number(data.salonsTotal) || 0));
  let salonsComboDone = Math.max(0, Math.floor(Number(data.salonsComboDone) || 0));
  if (salonsComboDone > salonsTotal) salonsComboDone = salonsTotal;

  const salonsList = mergeSalonsList(data, salonsTotal);
  const administrative = mergeAdministrativeData(data.administrative, salonsList);
  const operator = syncOperatorFromSalonsList(salonsList);

  return {
    grade: data.grade && managerGrades[data.grade] ? data.grade : base.grade,
    salesValues: { ...base.salesValues, ...(data.salesValues || {}) },
    operatorSalesValues: {
      ...base.operatorSalesValues,
      ...(data.operatorSalesValues || {}),
    },
    salonsTotal,
    salonsList,
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
    administrative,
    operator,
    blackList: { ...(data.blackList || {}) },
  };
}

/**
 * Список салонов: имя, оператор, флаги админки, KPI Tele2.
 * Миграция со старых tele2Salons / photoReportPassed.
 */
function mergeSalonsList(data, salonsTotal) {
  const existing = Array.isArray(data.salonsList) ? data.salonsList : [];
  const oldTele2 = Array.isArray(data.operator?.salons) ? data.operator.salons : [];
  const oldTele2Count = Math.max(0, Math.floor(Number(data.operator?.tele2Salons) || 0));
  const admin = data.administrative || {};

  // Миграция: если списка нет, но есть старые Tele2 KPI
  let source = existing;
  if (!existing.length && salonsTotal > 0) {
    source = [];
    for (let i = 0; i < salonsTotal; i += 1) {
      const salon = createEmptySalon();
      if (i < oldTele2Count) {
        salon.operator = 'tele2';
        const prev = oldTele2[i]?.kpis || {};
        operatorTele2Kpis.forEach((kpi) => {
          salon.kpis[kpi.id] = Boolean(prev[kpi.id]);
        });
      } else {
        salon.operator = 'other';
      }
      source.push(salon);
    }

    // Миграция счётчиков фото/сервис/тхв → первые N флагов
    const photoN = Math.max(0, Math.floor(Number(admin.photoReportPassed) || 0));
    const serviceN = Math.max(0, Math.floor(Number(admin.servicePassed) || 0));
    const txvN = Math.max(0, Math.floor(Number(admin.txvPassed) || 0));
    source.forEach((salon, i) => {
      salon.photoPassed = i < photoN;
      salon.servicePassed = i < serviceN;
      salon.txvPassed = i < txvN;
    });
  }

  const list = [];
  for (let i = 0; i < salonsTotal; i += 1) {
    const prev = source[i] || createEmptySalon();
    const operatorId = salonOperators.some((o) => o.id === prev.operator)
      ? prev.operator
      : 'tele2';
    const kpis = createEmptyTele2SalonKpis();
    operatorTele2Kpis.forEach((kpi) => {
      kpis[kpi.id] = Boolean(prev.kpis?.[kpi.id]);
    });
    list.push({
      name: String(prev.name || ''),
      operator: operatorId,
      photoPassed: Boolean(prev.photoPassed),
      servicePassed: Boolean(prev.servicePassed),
      txvPassed: Boolean(prev.txvPassed),
      kpis,
    });
  }
  return list;
}

function mergeAdministrativeData(raw, salonsList) {
  const base = createEmptyAdministrativeData();
  const src = raw && typeof raw === 'object' ? raw : {};
  const list = Array.isArray(salonsList) ? salonsList : [];

  administrativeRules.forEach((rule) => {
    if (rule.type === 'averageBudget') {
      base[rule.id] = {
        plan: Number(src[rule.id]?.plan) || 0,
        fact: Number(src[rule.id]?.fact) || 0,
      };
    }
  });

  // Счётчики синхронизируются из флагов салонов (формулы используют те же числа)
  base.photoReportPassed = list.filter((s) => s.photoPassed).length;
  base.servicePassed = list.filter((s) => s.servicePassed).length;
  base.txvPassed = list.filter((s) => s.txvPassed).length;
  return base;
}

/** Операторский блок: только салоны с оператором Tele2. */
function syncOperatorFromSalonsList(salonsList) {
  const tele2 = (salonsList || []).filter((s) => s.operator === 'tele2');
  return {
    tele2Salons: tele2.length,
    salons: tele2.map((s) => ({
      kpis: { ...s.kpis },
      name: s.name,
      sourceIndex: undefined,
    })),
  };
}

/**
 * Собирает operator.salons с привязкой к индексам salonsList для UI-имён.
 */
function getTele2SalonsWithMeta(salonsList) {
  const result = [];
  (salonsList || []).forEach((salon, index) => {
    if (salon.operator !== 'tele2') return;
    result.push({
      listIndex: index,
      name: salon.name,
      displayName: getSalonDisplayName(salon, index),
      title: getSalonTitle(salon, index),
      kpis: { ...salon.kpis },
    });
  });
  return result;
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

  data.salonsTotal = Math.max(0, Math.floor(Number(data.salonsTotal) || 0));
  if (!Array.isArray(data.salonsList)) data.salonsList = [];

  // Подгоняем длину списка салонов под количество
  while (data.salonsList.length < data.salonsTotal) {
    data.salonsList.push(createEmptySalon());
  }
  if (data.salonsList.length > data.salonsTotal) {
    data.salonsList = data.salonsList.slice(0, data.salonsTotal);
  }

  if (data.salonsComboDone > data.salonsTotal) {
    data.salonsComboDone = data.salonsTotal;
  }

  data.administrative = mergeAdministrativeData(data.administrative, data.salonsList);
  data.operator = syncOperatorFromSalonsList(data.salonsList);

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
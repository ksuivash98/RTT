/**
 * UI-слой калькулятора ЗП руководителя РТТ.
 */

const UI = {
  store: null,
  recalculating: false,
};

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.hidden = false;
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function statusClass(value, { invert = false } = {}) {
  const n = Number(value) || 0;
  if (Math.abs(n) < 0.0001) return 'is-warning';
  const positive = invert ? n < 0 : n > 0;
  return positive ? 'is-positive' : 'is-negative';
}

function initPeriodSelects() {
  const monthSelect = document.getElementById('monthSelect');
  const yearSelect = document.getElementById('yearSelect');

  monthSelect.innerHTML = MONTHS.map(
    (m) => `<option value="${m.value}">${m.name}</option>`
  ).join('');

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - 3; y <= currentYear + 2; y += 1) years.push(y);
  yearSelect.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
}

function renderGradeSelector(activeGrade) {
  const root = document.getElementById('gradeSelector');
  root.innerHTML = Object.values(managerGrades)
    .map((g) => {
      const fixed = g.salary + g.allowance;
      return `
        <button type="button" class="grade-card ${g.id === activeGrade ? 'is-active' : ''}" data-grade="${g.id}">
          <strong>${g.name}</strong>
          <span>Ставка ${formatMoney(g.salary)}</span>
          <span>Надбавка ${formatMoney(g.allowance)}</span>
          <span>Фикс. ${formatMoney(fixed)}</span>
        </button>
      `;
    })
    .join('');
}

function renderEmployeeList() {
  const query = document.getElementById('employeeSearch').value;
  const list = searchEmployees(UI.store, query);
  const root = document.getElementById('employeeList');

  if (!list.length) {
    root.innerHTML = '<li><button type="button" disabled>Никого не найдено</button></li>';
    return;
  }

  root.innerHTML = list
    .map(
      (emp) => `
      <li>
        <button type="button" data-employee-id="${emp.id}" class="${
        emp.id === UI.store.activeEmployeeId ? 'is-active' : ''
      }">${escapeHtml(emp.name)}</button>
      </li>`
    )
    .join('');
}

function renderPeriodsChips() {
  const employee = getActiveEmployee(UI.store);
  const periods = getEmployeePeriods(employee);
  const activeKey = getActivePeriodKey(UI.store);
  const root = document.getElementById('periodsChips');

  if (!periods.length) {
    root.innerHTML = '<span class="pill is-neutral">Пока нет сохранённых периодов</span>';
    return;
  }

  root.innerHTML = periods
    .map((p) => {
      const monthName = MONTHS.find((m) => m.value === p.month)?.name || p.month;
      return `<button type="button" class="chip ${p.key === activeKey ? 'is-active' : ''}" data-period="${p.key}">${monthName} ${p.year}</button>`;
    })
    .join('');
}

function fillFormFromData(data) {
  UI.recalculating = true;

  document.getElementById('employeeName').value = getActiveEmployee(UI.store).name;
  document.getElementById('monthSelect').value = String(UI.store.activeMonth);
  document.getElementById('yearSelect').value = String(UI.store.activeYear);
  document.getElementById('salonsTotal').value = data.salonsTotal;
  document.getElementById('salonsComboDone').value = data.salonsComboDone;
  document.getElementById('creditPlanPercent').value = data.creditPlanPercent;
  document.getElementById('attachment').value = data.attachment;

  renderGradeSelector(data.grade);
  renderSalesTables(data);
  renderEconomyKpiInputs(data);

  UI.recalculating = false;
}

function renderSalesTables(data) {
  const salesBody = document.querySelector('#salesProductsTable tbody');
  salesBody.innerHTML = salesProducts
    .map((p) => {
      const value = data.salesValues?.[p.id] || 0;
      return `
        <tr>
          <td>${escapeHtml(p.name)}</td>
          <td>${formatPercent(p.rate * 100, 2)}</td>
          <td>
            <input class="inline-input" type="number" min="0" step="0.01"
              data-sales-id="${p.id}" value="${value}" />
          </td>
          <td class="bonus-cell" data-sales-bonus="${p.id}">—</td>
        </tr>`;
    })
    .join('');

  const opBody = document.querySelector('#operatorSalesTable tbody');
  opBody.innerHTML = operatorSalesItems
    .map((item) => {
      const value = data.operatorSalesValues?.[item.id] || 0;
      const rateLabel =
        item.type === 'fixed'
          ? formatMoney(item.rate)
          : formatPercent(item.rate * 100, 2);
      return `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${rateLabel}</td>
          <td>
            <input class="inline-input" type="number" step="any"
              data-opsales-id="${item.id}" value="${value}" />
          </td>
          <td class="bonus-cell" data-opsales-bonus="${item.id}">—</td>
        </tr>`;
    })
    .join('');
}

function renderEconomyKpiInputs(data) {
  const root = document.getElementById('economyKpiList');
  root.innerHTML = economyKpiDefs
    .map((def) => {
      const kpi = data.economy?.[def.id] || { plan: 0, fact: 0 };
      return `
        <article class="kpi-card" data-kpi-id="${def.id}">
          <div class="kpi-card-head">
            <h3>${escapeHtml(def.name)}</h3>
            <span class="pill is-neutral" data-kpi-completion="${def.id}">—</span>
          </div>
          ${def.note ? `<p class="kpi-note">${escapeHtml(def.note)}</p>` : ''}
          <div class="kpi-inputs">
            <label class="field">
              <span>План</span>
              <input type="number" min="0" step="0.01" data-kpi-plan="${def.id}" value="${kpi.plan}" />
            </label>
            <label class="field">
              <span>Факт</span>
              <input type="number" min="0" step="0.01" data-kpi-fact="${def.id}" value="${kpi.fact}" />
            </label>
          </div>
          <div class="kpi-metrics" data-kpi-metrics="${def.id}"></div>
        </article>`;
    })
    .join('');
}

function renderConfigBlocks(result) {
  renderExtensibleBlock('adminBlock', administrativeRules, result.administrative, 'administrative');
  renderExtensibleBlock('operatorBlock', operatorRules, result.operator, 'operator');
  renderBlackListBlock(result.blackList);
}

function renderExtensibleBlock(rootId, rules, calc, storeKey) {
  const root = document.getElementById(rootId);
  if (!rules.length) {
    root.className = 'empty-config';
    root.innerHTML = `<p>Правила ещё не заданы. Добавьте KPI в <code>${
      storeKey === 'administrative' ? 'administrativeRules' : 'operatorRules'
    }</code> в файле <code>data.js</code>.</p>`;
    return;
  }

  root.className = 'kpi-list';
  root.innerHTML = calc.items
    .map((item) => {
      const data = getActiveMonthData(UI.store)[storeKey]?.[item.id] || {};
      return `
        <article class="kpi-card">
          <div class="kpi-card-head">
            <h3>${escapeHtml(item.name)}</h3>
            <span class="pill ${statusClass(item.bonus)}">${formatMoney(item.bonus)}</span>
          </div>
          <div class="kpi-inputs">
            <label class="field">
              <span>План</span>
              <input type="number" min="0" step="0.01" data-ext-plan="${storeKey}:${item.id}" value="${Number(data.plan) || 0}" />
            </label>
            <label class="field">
              <span>Факт</span>
              <input type="number" min="0" step="0.01" data-ext-fact="${storeKey}:${item.id}" value="${Number(data.fact) || 0}" />
            </label>
          </div>
          <div class="kpi-metrics">
            <div class="kpi-metric"><span class="label">Выполнение</span><span class="value">${formatPercent(item.completion)}</span></div>
            <div class="kpi-metric"><span class="label">Коэффициент</span><span class="value">×${formatCoeff(item.coefficient)}</span></div>
            <div class="kpi-metric is-brand"><span class="label">Бонус</span><span class="value">${formatMoney(item.bonus)}</span></div>
            <div class="kpi-metric is-negative"><span class="label">Потеря</span><span class="value">${formatMoney(item.loss)}</span></div>
          </div>
        </article>`;
    })
    .join('');
}

function renderBlackListBlock(calc) {
  const root = document.getElementById('blackListBlock');
  if (!blackListRules.length) {
    root.className = 'empty-config';
    root.innerHTML =
      '<p>Условия ещё не заданы. Добавьте правила в <code>blackListRules</code> в файле <code>data.js</code>.</p>';
    return;
  }

  root.className = 'kpi-list';
  root.innerHTML = calc.items
    .map((item) => {
      return `
        <article class="kpi-card">
          <div class="kpi-card-head">
            <h3>${escapeHtml(item.name)}</h3>
            <span class="pill ${item.violated ? 'is-negative' : 'is-positive'}">${
              item.violated ? 'Нарушение' : 'Ок'
            }</span>
          </div>
          <p class="kpi-note">${escapeHtml(item.description || '')}</p>
          <label class="field">
            <span>
              <input type="checkbox" data-blacklist-id="${item.id}" ${item.violated ? 'checked' : ''} />
              Есть нарушение
            </span>
          </label>
          <div class="kpi-metrics" style="margin-top:12px">
            <div class="kpi-metric is-negative"><span class="label">Штраф</span><span class="value">${formatMoney(item.penalty)}</span></div>
            <div class="kpi-metric"><span class="label">Влияние</span><span class="value">${escapeHtml(item.impact || '—')}</span></div>
          </div>
        </article>`;
    })
    .join('');
}

function renderAnalytics(result) {
  const cards = [
    { label: 'Текущая зарплата', value: result.totalPay, cls: 'is-brand' },
    { label: 'Оклад', value: result.fixedSalary, cls: '' },
    { label: 'Общий бонус', value: result.totalBonus, cls: 'is-positive' },
    { label: 'Потери', value: result.totalLoss, cls: 'is-negative' },
    { label: 'Потенциальный доп. доход', value: result.potentialExtra, cls: 'is-warning' },
    { label: 'Макс. возможная зарплата', value: result.maxSalary, cls: 'is-positive' },
  ];

  document.getElementById('analyticsCards').innerHTML = cards
    .map(
      (c) => `
      <article class="stat-card ${c.cls}">
        <span class="label">${c.label}</span>
        <div class="value">${formatMoney(c.value)}</div>
      </article>`
    )
    .join('');
}

function renderSalarySummary(result) {
  document.getElementById('salarySummary').innerHTML = `
    <div class="metric">
      <span class="label">Ставка</span>
      <div class="value">${formatMoney(result.rate)}</div>
    </div>
    <div class="metric">
      <span class="label">Надбавка</span>
      <div class="value">${formatMoney(result.allowance)}</div>
    </div>
    <div class="metric is-highlight">
      <span class="label">Фиксированная часть</span>
      <div class="value">${formatMoney(result.fixedSalary)}</div>
    </div>`;
}

function renderSalesResults(result) {
  const sales = result.sales;
  const info = sales.seasonalityInfo;

  document.getElementById('seasonalityBar').innerHTML = `
    <span class="pill is-neutral"><span class="dot"></span>${info.period}</span>
    <span class="pill ${sales.seasonality >= 1 ? 'is-positive' : 'is-warning'}">
      Сезонность ${info.label} (×${formatCoeff(sales.seasonality)})
    </span>
    <span class="pill is-neutral">Лимит ${formatMoney(SALES_BONUS_MAX)}</span>
  `;

  sales.productLines.forEach((line) => {
    const cell = document.querySelector(`[data-sales-bonus="${line.id}"]`);
    if (!cell) return;
    cell.textContent = formatMoney(line.bonus);
    cell.classList.toggle('is-positive', line.bonus > 0);
    cell.classList.toggle('is-negative', line.bonus < 0);
  });

  sales.operatorLines.forEach((line) => {
    const cell = document.querySelector(`[data-opsales-bonus="${line.id}"]`);
    if (!cell) return;
    cell.textContent = formatMoney(line.bonus);
    cell.classList.toggle('is-positive', line.bonus > 0);
    cell.classList.toggle('is-negative', line.bonus < 0);
  });

  document.getElementById('salesResultStrip').innerHTML = `
    <div class="result-item">
      <span class="label">До сезонности</span>
      <div class="value">${formatMoney(sales.beforeSeasonality)}</div>
    </div>
    <div class="result-item">
      <span class="label">После сезонности</span>
      <div class="value">${formatMoney(sales.afterSeasonality)}</div>
    </div>
    <div class="result-item is-brand">
      <span class="label">🟢 Текущий бонус</span>
      <div class="value">${formatMoney(sales.total)}</div>
    </div>
    <div class="result-item is-positive">
      <span class="label">Максимум</span>
      <div class="value">${formatMoney(sales.maxBonus)}</div>
    </div>
    <div class="result-item is-negative">
      <span class="label">🔴 Потеря от лимита</span>
      <div class="value">${formatMoney(sales.lossFromCap)}</div>
    </div>
    <div class="result-item is-warning">
      <span class="label">🟡 Можно получить</span>
      <div class="value">${formatMoney(sales.potentialPlus)}</div>
    </div>`;
}

function renderEconomyResults(result) {
  const economy = result.economy;

  document.getElementById('coeffRow').innerHTML = `
    <span class="pill is-neutral">Кредиты ×${formatCoeff(economy.creditCoeff)}</span>
    <span class="pill is-neutral">Аттачмент ×${formatCoeff(economy.attachmentCoeff)}</span>
  `;

  const combo = economy.combo;
  document.getElementById('comboCard').innerHTML = `
    <div class="result-item">
      <span class="label">Салонов в подчинении</span>
      <div class="value">${combo.salonsTotal}</div>
    </div>
    <div class="result-item is-positive">
      <span class="label">Выполнили KPI</span>
      <div class="value">${combo.salonsComboDone}</div>
    </div>
    <div class="result-item is-negative">
      <span class="label">Не выполнили KPI</span>
      <div class="value">${combo.salonsNotDone}</div>
    </div>
    <div class="result-item is-brand">
      <span class="label">Бонус Комбо</span>
      <div class="value">${formatMoney(combo.bonus)}</div>
    </div>`;

  economy.kpis.forEach((kpi) => {
    const completionEl = document.querySelector(`[data-kpi-completion="${kpi.id}"]`);
    if (completionEl) {
      completionEl.textContent = `Выполнение ${formatPercent(kpi.completion)}`;
      completionEl.className = `pill ${
        kpi.completion >= 100 ? 'is-positive' : kpi.completion >= 85 ? 'is-warning' : 'is-negative'
      }`;
    }

    const metrics = document.querySelector(`[data-kpi-metrics="${kpi.id}"]`);
    if (!metrics) return;

    metrics.innerHTML = `
      <div class="kpi-metric">
        <span class="label">Базовая сумма</span>
        <span class="value">${formatMoney(kpi.baseAmount)}</span>
      </div>
      <div class="kpi-metric">
        <span class="label">${kpi.usesCredit ? 'Кредиты' : kpi.usesAttachment ? 'Аттачмент' : 'Коэфф.'}</span>
        <span class="value">×${formatCoeff(kpi.firstCoeff)}</span>
      </div>
      <div class="kpi-metric">
        <span class="label">Эффективность</span>
        <span class="value">×${formatCoeff(kpi.efficiencyCoeff)}</span>
      </div>
      <div class="kpi-metric is-brand">
        <span class="label">🟢 Итог</span>
        <span class="value">${formatMoney(kpi.bonus)}</span>
      </div>
      <div class="kpi-metric is-positive">
        <span class="label">Максимум</span>
        <span class="value">${formatMoney(kpi.maxBonus)}</span>
      </div>
      <div class="kpi-metric is-negative">
        <span class="label">🔴 Потеря</span>
        <span class="value">${formatMoney(kpi.loss)}</span>
      </div>
      <div class="kpi-metric is-warning">
        <span class="label">🟡 Можно получить</span>
        <span class="value">${formatMoney(kpi.potentialPlus)}</span>
      </div>
      <div class="kpi-metric">
        <span class="label">След. порог</span>
        <span class="value">${
          kpi.nextThreshold.nextThreshold == null
            ? 'Достигнут'
            : `${formatPercent(kpi.nextThreshold.nextThreshold, 0)} (+${formatNumber(
                kpi.nextThreshold.percentNeeded,
                1
              )} п.п.)`
        }</span>
      </div>`;
  });

  document.getElementById('economyResultStrip').innerHTML = `
    <div class="result-item is-brand">
      <span class="label">🟢 Бонус экономики</span>
      <div class="value">${formatMoney(economy.bonus)}</div>
    </div>
    <div class="result-item is-positive">
      <span class="label">Максимум</span>
      <div class="value">${formatMoney(economy.maxBonus)}</div>
    </div>
    <div class="result-item is-negative">
      <span class="label">🔴 Потеря</span>
      <div class="value">${formatMoney(economy.loss)}</div>
    </div>
    <div class="result-item is-warning">
      <span class="label">🟡 Можно получить</span>
      <div class="value">${formatMoney(economy.potentialPlus)}</div>
    </div>`;
}

function renderLosses(result) {
  const rows = [];

  result.economy.kpis.forEach((kpi) => {
    rows.push({
      title: kpi.name,
      completion: kpi.completion,
      efficiency: kpi.efficiencyCoeff,
      current: kpi.bonus,
      next: kpi.nextThreshold.nextThreshold,
      needed: kpi.nextThreshold.percentNeeded,
      max: kpi.maxBonus,
      plus: kpi.potentialPlus,
    });
  });

  rows.push({
    title: 'Бонус за продажи',
    completion: null,
    efficiency: result.sales.seasonality,
    current: result.sales.total,
    next: null,
    needed: null,
    max: result.sales.maxBonus,
    plus: result.sales.potentialPlus,
  });

  if (result.administrative.items.length) {
    result.administrative.items.forEach((item) => {
      rows.push({
        title: item.name,
        completion: item.completion,
        efficiency: item.coefficient,
        current: item.bonus,
        next: null,
        needed: null,
        max: item.maxBonus,
        plus: item.potentialPlus,
      });
    });
  }

  if (result.operator.items.length) {
    result.operator.items.forEach((item) => {
      rows.push({
        title: item.name,
        completion: item.completion,
        efficiency: item.coefficient,
        current: item.bonus,
        next: null,
        needed: null,
        max: item.maxBonus,
        plus: item.potentialPlus,
      });
    });
  }

  document.getElementById('lossesBlock').innerHTML = `
    <div class="loss-grid">
      ${rows
        .map(
          (r) => `
        <article class="loss-card">
          <h3>${escapeHtml(r.title)}</h3>
          <div class="loss-metrics">
            ${
              r.completion == null
                ? ''
                : `<div class="kpi-metric"><span class="label">Выполнение</span><span class="value">${formatPercent(
                    r.completion
                  )}</span></div>`
            }
            <div class="kpi-metric"><span class="label">Коэффициент</span><span class="value">×${formatCoeff(
              r.efficiency
            )}</span></div>
            <div class="kpi-metric is-brand"><span class="label">🟢 Текущий бонус</span><span class="value">${formatMoney(
              r.current
            )}</span></div>
            <div class="kpi-metric"><span class="label">Ближайший порог</span><span class="value">${
              r.next == null ? '—' : formatPercent(r.next, 0)
            }</span></div>
            <div class="kpi-metric"><span class="label">До порога</span><span class="value">${
              r.needed == null ? '—' : `${formatNumber(r.needed, 1)} п.п.`
            }</span></div>
            <div class="kpi-metric is-positive"><span class="label">Максимум</span><span class="value">${formatMoney(
              r.max
            )}</span></div>
            <div class="kpi-metric is-warning"><span class="label">🟡 Потенциальный плюс</span><span class="value">${formatMoney(
              r.plus
            )}</span></div>
          </div>
        </article>`
        )
        .join('')}
    </div>`;
}

function renderTotal(result) {
  const monthName = MONTHS.find((m) => m.value === result.month)?.name || result.month;
  document.getElementById('headerPeriodLabel').textContent = `${getActiveEmployee(UI.store).name} · ${monthName} ${result.year}`;

  document.getElementById('totalBlock').innerHTML = `
    <div class="total-grid">
      <div class="total-row">
        <span class="label">Окладная часть</span>
        <span class="value">${formatMoney(result.fixedSalary)}</span>
      </div>
      <div class="total-row is-positive">
        <span class="label">Бонус за продажи</span>
        <span class="value">${formatMoney(result.sales.total)}</span>
      </div>
      <div class="total-row is-positive">
        <span class="label">Бонус экономического блока</span>
        <span class="value">${formatMoney(result.economy.bonus)}</span>
      </div>
      <div class="total-row is-positive">
        <span class="label">Бонус административного блока</span>
        <span class="value">${formatMoney(result.administrative.bonus)}</span>
      </div>
      <div class="total-row is-positive">
        <span class="label">Бонус операторского блока</span>
        <span class="value">${formatMoney(result.operator.bonus)}</span>
      </div>
      <div class="total-row is-negative">
        <span class="label">Штрафы чёрного списка</span>
        <span class="value">−${formatMoney(result.totalPenalties)}</span>
      </div>
      <div class="total-row">
        <span class="label">Общий бонус</span>
        <span class="value">${formatMoney(result.totalBonus)}</span>
      </div>
      <div class="total-row grand">
        <span class="label">ИТОГО К ВЫПЛАТЕ</span>
        <span class="value">${formatMoney(result.totalPay)}</span>
      </div>
    </div>`;
}

function recalculate() {
  if (UI.recalculating) return;

  const data = getActiveMonthData(UI.store);
  const result = calculateTotalSalary(data, UI.store.activeYear, UI.store.activeMonth);

  renderAnalytics(result);
  renderSalarySummary(result);
  renderSalesResults(result);
  renderEconomyResults(result);
  renderConfigBlocks(result);
  renderLosses(result);
  renderTotal(result);
  renderPeriodsChips();
}

function bindEvents() {
  document.getElementById('employeeSearch').addEventListener('input', renderEmployeeList);

  document.getElementById('employeeList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-employee-id]');
    if (!btn) return;
    setActiveEmployee(UI.store, btn.dataset.employeeId);
    syncAll();
  });

  document.getElementById('periodsChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-period]');
    if (!chip) return;
    const [year, month] = chip.dataset.period.split('-').map(Number);
    setActivePeriod(UI.store, year, month);
    syncAll();
  });

  document.getElementById('btnAddEmployee').addEventListener('click', () => {
    const name = prompt('ФИО нового руководителя:', 'Новый руководитель');
    if (name === null) return;
    addEmployee(UI.store, name);
    showToast('Сотрудник создан');
    syncAll();
  });

  document.getElementById('btnEditEmployee').addEventListener('click', () => {
    const employee = getActiveEmployee(UI.store);
    const name = prompt('Изменить ФИО:', employee.name);
    if (name === null) return;
    updateEmployeeName(UI.store, employee.id, name);
    showToast('ФИО обновлено');
    syncAll();
  });

  document.getElementById('btnDeleteEmployee').addEventListener('click', () => {
    const employee = getActiveEmployee(UI.store);
    if (!confirm(`Удалить сотрудника «${employee.name}» и все его периоды?`)) return;
    const result = deleteEmployee(UI.store, employee.id);
    if (!result.ok) {
      showToast(result.message, true);
      return;
    }
    showToast('Сотрудник удалён');
    syncAll();
  });

  document.getElementById('employeeName').addEventListener('change', (e) => {
    updateEmployeeName(UI.store, UI.store.activeEmployeeId, e.target.value);
    renderEmployeeList();
    recalculate();
  });

  document.getElementById('monthSelect').addEventListener('change', (e) => {
    setActivePeriod(UI.store, UI.store.activeYear, Number(e.target.value));
    syncAll();
  });

  document.getElementById('yearSelect').addEventListener('change', (e) => {
    setActivePeriod(UI.store, Number(e.target.value), UI.store.activeMonth);
    syncAll();
  });

  document.getElementById('gradeSelector').addEventListener('click', (e) => {
    const card = e.target.closest('[data-grade]');
    if (!card) return;
    updateMonthField(UI.store, (data) => {
      data.grade = card.dataset.grade;
    });
    renderGradeSelector(card.dataset.grade);
    recalculate();
  });

  const numberFields = [
    ['salonsTotal', 'salonsTotal', true],
    ['salonsComboDone', 'salonsComboDone', true],
    ['creditPlanPercent', 'creditPlanPercent', false],
    ['attachment', 'attachment', false],
  ];

  numberFields.forEach(([id, key, integer]) => {
    document.getElementById(id).addEventListener('input', (e) => {
      updateMonthField(UI.store, (data) => {
        let value = Number(e.target.value);
        if (!Number.isFinite(value)) value = 0;
        if (integer) value = Math.max(0, Math.floor(value));
        data[key] = value;

        if (key === 'salonsTotal' && data.salonsComboDone > data.salonsTotal) {
          data.salonsComboDone = data.salonsTotal;
          document.getElementById('salonsComboDone').value = data.salonsComboDone;
        }
        if (key === 'salonsComboDone' && data.salonsComboDone > data.salonsTotal) {
          data.salonsComboDone = data.salonsTotal;
          e.target.value = data.salonsComboDone;
        }
      });
      recalculate();
    });
  });

  document.getElementById('section-sales').addEventListener('input', (e) => {
    const salesInput = e.target.closest('[data-sales-id]');
    if (salesInput) {
      updateMonthField(UI.store, (data) => {
        data.salesValues[salesInput.dataset.salesId] = Number(salesInput.value) || 0;
      });
      recalculate();
      return;
    }

    const opInput = e.target.closest('[data-opsales-id]');
    if (opInput) {
      updateMonthField(UI.store, (data) => {
        data.operatorSalesValues[opInput.dataset.opsalesId] = Number(opInput.value) || 0;
      });
      recalculate();
    }
  });

  document.getElementById('economyKpiList').addEventListener('input', (e) => {
    const planInput = e.target.closest('[data-kpi-plan]');
    const factInput = e.target.closest('[data-kpi-fact]');
    if (!planInput && !factInput) return;

    const id = planInput?.dataset.kpiPlan || factInput?.dataset.kpiFact;
    updateMonthField(UI.store, (data) => {
      if (!data.economy[id]) data.economy[id] = { plan: 0, fact: 0 };
      if (planInput) data.economy[id].plan = Number(planInput.value) || 0;
      if (factInput) data.economy[id].fact = Number(factInput.value) || 0;
    });
    recalculate();
  });

  document.body.addEventListener('input', (e) => {
    const plan = e.target.closest('[data-ext-plan]');
    const fact = e.target.closest('[data-ext-fact]');
    if (plan || fact) {
      const raw = (plan || fact).dataset[plan ? 'extPlan' : 'extFact'];
      const [storeKey, id] = raw.split(':');
      updateMonthField(UI.store, (data) => {
        if (!data[storeKey][id]) data[storeKey][id] = { plan: 0, fact: 0 };
        if (plan) data[storeKey][id].plan = Number(plan.value) || 0;
        if (fact) data[storeKey][id].fact = Number(fact.value) || 0;
      });
      recalculate();
    }
  });

  document.body.addEventListener('change', (e) => {
    const box = e.target.closest('[data-blacklist-id]');
    if (!box) return;
    updateMonthField(UI.store, (data) => {
      if (!data.blackList[box.dataset.blacklistId]) {
        data.blackList[box.dataset.blacklistId] = {};
      }
      data.blackList[box.dataset.blacklistId].violated = box.checked;
    });
    recalculate();
  });

  document.getElementById('btnRunChecks').addEventListener('click', () => {
    const results = runSelfChecks();
    const failed = results.filter((r) => !r.ok).length;
    showToast(failed ? `Ошибок в проверках: ${failed}` : 'Все тестовые проверки пройдены', Boolean(failed));
  });
}

function syncAll() {
  const data = getActiveMonthData(UI.store);
  renderEmployeeList();
  fillFormFromData(data);
  recalculate();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initApp() {
  UI.store = loadStore();
  ensureActiveMonthData(UI.store);
  saveStore(UI.store);

  initPeriodSelects();
  bindEvents();
  syncAll();
}
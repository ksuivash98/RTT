/**
 * UI-слой калькулятора ЗП руководителя РТТ.
 */

const UI = {
  store: null,
  recalculating: false,
  collapse: {
    salary: false,
    economy: false,
    admin: false,
    operator: false,
    blacklist: false,
    sales: false,
  },
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
  const list = UI.store.employees || [];
  const root = document.getElementById('employeeList');

  if (!list.length) {
    root.innerHTML = '<li><button type="button" disabled>Нет сотрудников</button></li>';
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
  renderSalonCards(data);
  renderSalesTables(data);
  renderEconomyKpiInputs(data);
  renderAdminBlock(data);
  renderOperatorBlock(data);
  renderBlackListBlock(data);
  applyCollapseState();

  UI.recalculating = false;
}

function renderSalonCards(data) {
  const root = document.getElementById('salonCards');
  if (!root) return;
  const list = data.salonsList || [];
  if (!list.length) {
    root.innerHTML = '<p class="kpi-note">Укажите количество салонов, чтобы добавить карточки</p>';
    return;
  }

  root.innerHTML = list
    .map((salon, index) => {
      const options = salonOperators
        .map(
          (op) =>
            `<option value="${op.id}" ${salon.operator === op.id ? 'selected' : ''}>${escapeHtml(
              op.name
            )}</option>`
        )
        .join('');
      return `
        <article class="kpi-card salon-identity-card">
          <div class="kpi-card-head">
            <h3>Салон №${index + 1}</h3>
            <span class="pill is-neutral">${escapeHtml(getSalonTitle(salon, index))}</span>
          </div>
          <div class="form-grid form-grid-2">
            <label class="field">
              <span>Название салона</span>
              <input type="text" data-salon-name="${index}" value="${escapeHtml(salon.name)}" placeholder="Например, Березники" />
            </label>
            <label class="field">
              <span>Оператор</span>
              <select data-salon-operator="${index}">${options}</select>
            </label>
          </div>
        </article>`;
    })
    .join('');
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
  updateAdminBlockResults(result.administrative);
  updateOperatorBlockResults(result.operator);
  updateBlackListResults(result.blackList);
}

function renderBlackListBlock(data) {
  const root = document.getElementById('blackListBlock');
  if (!root) return;
  const list = data.salonsList || [];
  const monthBl = data.blackList || createEmptyMonthBlackList();

  const salonRows = list
    .map((salon, index) => {
      const bl = salon.blackList || createEmptySalonBlackList();
      const opTarget = BLACK_LIST.operatorKpi.targets[salon.operator];
      const opLabel = opTarget
        ? `${opTarget.label}, % (цель ≥${opTarget.target})`
        : 'Ключевой KPI оператора (нет для «Другой»)';

      return `
        <article class="kpi-card">
          <div class="kpi-card-head">
            <h3>${escapeHtml(getSalonTitle(salon, index))}</h3>
          </div>
          <div class="bl-salon-sections">
            <div class="bl-mini-section">
              <h4>Работа с SIM</h4>
              <div class="form-grid form-grid-2">
                <label class="field">
                  <span>Выполнение плана SIM, %</span>
                  <input type="number" min="0" step="0.1" data-bl-salon="${index}" data-bl-field="simPlanPercent" value="${bl.simPlanPercent}" />
                </label>
                <label class="field">
                  <span>Не выполнен план одной декады по SIM</span>
                  <select data-bl-salon="${index}" data-bl-field="simDecadeFailed">
                    <option value="0" ${!bl.simDecadeFailed ? 'selected' : ''}>Нет</option>
                    <option value="1" ${bl.simDecadeFailed ? 'selected' : ''}>Да</option>
                  </select>
                </label>
              </div>
            </div>
            <div class="bl-mini-section">
              <h4>Качество и стандарты</h4>
              <div class="form-grid form-grid-2">
                <label class="field">
                  <span>BMP текущего месяца, %</span>
                  <input type="number" min="0" step="0.1" data-bl-salon="${index}" data-bl-field="bmpPercent" value="${bl.bmpPercent}" />
                </label>
                <label class="field">
                  <span>BMP предыдущего месяца, %</span>
                  <input type="number" min="0" step="0.1" data-bl-salon="${index}" data-bl-field="bmpPrevPercent" value="${bl.bmpPrevPercent}" />
                </label>
                <label class="field">
                  <span>Q2M за март прошлого месяца (для Т2)</span>
                  <select data-bl-salon="${index}" data-bl-field="q2mPassed">
                    <option value="1" ${bl.q2mPassed ? 'selected' : ''}>Выполнен</option>
                    <option value="0" ${!bl.q2mPassed ? 'selected' : ''}>Не выполнен</option>
                  </select>
                </label>
              </div>
            </div>
            <div class="bl-mini-section">
              <h4>Ключевые KPI оператора</h4>
              <div class="form-grid form-grid-2">
                <label class="field">
                  <span>${escapeHtml(opLabel)}</span>
                  <input type="number" min="0" step="0.1" data-bl-salon="${index}" data-bl-field="operatorKpiPercent" value="${bl.operatorKpiPercent}" ${
        opTarget ? '' : 'disabled'
      } />
                </label>
              </div>
            </div>
            <div class="bl-mini-section">
              <h4>Положительные корректировки</h4>
              <div class="form-grid form-grid-2">
                <label class="field">
                  <span>Качество SIM 4M без Экстра, %</span>
                  <input type="number" min="0" step="0.1" data-bl-salon="${index}" data-bl-field="simQuality4mPercent" value="${bl.simQuality4mPercent}" />
                </label>
                <p class="kpi-note">SIM 110%+ и BMP ≥90% два месяца берутся из полей выше.</p>
              </div>
            </div>
          </div>
        </article>`;
    })
    .join('');

  root.innerHTML = `
    <div class="form-grid form-grid-2" style="margin-bottom:14px">
      <label class="field">
        <span>Превышение лимита Экстра (один раз на все салоны)</span>
        <select id="blExtraLimit">
          <option value="0" ${!monthBl.extraLimitExceeded ? 'selected' : ''}>Нет</option>
          <option value="1" ${monthBl.extraLimitExceeded ? 'selected' : ''}>Да</option>
        </select>
      </label>
      <div class="field">
        <span>Диапазон коэффициента</span>
        <div class="hint-box">мин 0,575 · макс 1,10 · старт 1,00 · только к бонусам</div>
      </div>
    </div>
    <h3 class="subhead">Показатели по салонам</h3>
    <div class="kpi-list">${salonRows || '<p class="kpi-note">Добавьте салоны в начале калькулятора</p>'}</div>
    <h3 class="subhead">Расшифровка</h3>
    <div id="blackListBreakdown"></div>`;
}

function updateBlackListResults(bl) {
  const breakdown = document.getElementById('blackListBreakdown');
  const strip = document.getElementById('blackListResultStrip');
  if (!bl || !breakdown || !strip) return;

  const reasonsBlock = (title, penaltyLabel, reasons) => `
    <div class="bl-section ${reasons.length ? 'has-issues' : ''}">
      <h4>${title} <span>${penaltyLabel}</span></h4>
      ${
        reasons.length
          ? `<ul class="bl-reasons">${reasons
              .map(
                (r) =>
                  `<li class="${r.severity === 'positive' ? 'is-positive' : 'is-negative'}">${escapeHtml(
                    r.text
                  )}</li>`
              )
              .join('')}</ul>`
          : '<p class="kpi-note">Нарушений нет</p>'
      }
    </div>`;

  breakdown.innerHTML = `
    <div class="bl-summary-card">
      <div class="kpi-metrics-grid">
        <div class="kpi-metric"><span class="label">Исходный коэффициент</span><span class="value">×${formatCoeff(bl.startCoefficient)}</span></div>
        <div class="kpi-metric is-negative"><span class="label">Работа с SIM</span><span class="value">−${formatPercent(bl.simPenalty * 100, 2)}</span></div>
        <div class="kpi-metric is-negative"><span class="label">Качество и стандарты</span><span class="value">−${formatPercent(bl.qualityPenalty * 100, 2)}</span></div>
        <div class="kpi-metric is-negative"><span class="label">Ключевые KPI</span><span class="value">−${formatPercent(bl.kpiPenalty * 100, 2)}</span></div>
        <div class="kpi-metric is-positive"><span class="label">Положительные корректировки</span><span class="value">+${formatPercent(bl.positiveBonus * 100, 2)}</span></div>
        <div class="kpi-metric is-brand"><span class="label">ИТОГОВЫЙ КОЭФФИЦИЕНТ</span><span class="value">×${formatCoeff(bl.coefficient)}</span></div>
      </div>
      ${bl.clamped ? `<p class="kpi-note">Применено ограничение диапазона (было ×${formatCoeff(bl.rawCoefficient)})</p>` : ''}
    </div>
    ${reasonsBlock('🔴 Работа с SIM', `−${formatPercent(bl.simPenalty * 100, 2)}`, bl.simReasons || [])}
    ${reasonsBlock('🔴 Качество и стандарты', `−${formatPercent(bl.qualityPenalty * 100, 2)}`, bl.qualityReasons || [])}
    ${reasonsBlock('🔴 Ключевые KPI', `−${formatPercent(bl.kpiPenalty * 100, 2)}`, bl.kpiReasons || [])}
    ${reasonsBlock('🟢 Положительные корректировки', `+${formatPercent(bl.positiveBonus * 100, 2)}`, bl.positiveReasons || [])}
  `;

  strip.innerHTML = `
    <div class="result-item"><span class="label">Бонус до чёрного списка</span><div class="value">${formatMoney(bl.bonusBefore || 0)}</div></div>
    <div class="result-item"><span class="label">Коэффициент</span><div class="value">×${formatCoeff(bl.coefficient)}</div></div>
    <div class="result-item is-brand"><span class="label">🟢 Бонус после</span><div class="value">${formatMoney(bl.bonusAfter || 0)}</div></div>
    <div class="result-item is-negative"><span class="label">🔴 Потеря</span><div class="value">−${formatMoney(bl.loss || 0)}</div></div>
    <div class="result-item is-warning"><span class="label">При коэфф. 1,00</span><div class="value">${formatMoney(bl.bonusAtOne || 0)}</div></div>
    <div class="result-item is-warning"><span class="label">🟡 Можно вернуть</span><div class="value">+${formatMoney(bl.potentialPlus || 0)}</div></div>`;
}

function renderAdminBlock(data) {
  const root = document.getElementById('adminBlock');
  const admin = data.administrative || createEmptyAdministrativeData();
  const list = data.salonsList || [];

  const binaryCards = administrativeRules
    .filter((r) => r.type === 'binaryDone')
    .map((rule) => {
      const passed = Boolean(admin[rule.id]?.passed);
      return `
        <article class="kpi-card" data-admin-id="${rule.id}">
          <div class="kpi-card-head">
            <h3>${escapeHtml(rule.name)}</h3>
            <span class="pill is-neutral">Бюджет ${formatMoney(rule.budget)}</span>
          </div>
          <label class="field">
            <span>Результат</span>
            <select data-admin-done="${rule.id}">
              <option value="1" ${passed ? 'selected' : ''}>✅ Выполнено</option>
              <option value="0" ${!passed ? 'selected' : ''}>❌ Не выполнено</option>
            </select>
          </label>
          <div class="kpi-metrics" data-admin-metrics="${rule.id}"></div>
        </article>`;
    })
    .join('');

  const photoRows = list
    .map((salon, index) => {
      const performer = salon.photoPerformer === 'other' ? 'other' : 'manager';
      const isManager = performer === 'manager';
      return `
        <article class="photo-salon-card">
          <div class="kpi-card-head">
            <h3>${escapeHtml(getSalonDisplayName(salon, index))}</h3>
          </div>
          <label class="field">
            <span>Кто проводил фотоотчет?</span>
            <select data-photo-performer="${index}">
              <option value="manager" ${isManager ? 'selected' : ''}>Руководитель</option>
              <option value="other" ${!isManager ? 'selected' : ''}>Другой сотрудник</option>
            </select>
          </label>
          ${
            isManager
              ? `<label class="salon-flag ${salon.photoPassed ? 'is-done' : 'is-fail'}">
                  <input type="checkbox" data-salon-flag="photoPassed" data-salon-index="${index}" ${
                  salon.photoPassed ? 'checked' : ''
                } />
                  <span>${salon.photoPassed ? '✅ Выполнено' : '❌ Не выполнено'}</span>
                </label>`
              : `<p class="kpi-note">Фотоотчет выполнял другой сотрудник · бонус руководителя 0 ₽ · штраф 0 ₽</p>`
          }
        </article>`;
    })
    .join('');

  const serviceRows = list
    .map(
      (salon, index) => `
      <label class="salon-flag ${salon.servicePassed ? 'is-done' : 'is-fail'}">
        <input type="checkbox" data-salon-flag="servicePassed" data-salon-index="${index}" ${
        salon.servicePassed ? 'checked' : ''
      } />
        <span>${escapeHtml(getSalonDisplayName(salon, index))} — ${
        salon.servicePassed ? '✅ Выполнил' : '❌ Не выполнил'
      }</span>
      </label>`
    )
    .join('');

  const txvRows = list
    .map(
      (salon, index) => `
      <label class="salon-flag ${salon.txvPassed ? 'is-done' : 'is-fail'}">
        <input type="checkbox" data-salon-flag="txvPassed" data-salon-index="${index}" ${
        salon.txvPassed ? 'checked' : ''
      } />
        <span>${escapeHtml(getSalonDisplayName(salon, index))} — ${
        salon.txvPassed ? '✅ Выполнил' : '❌ Не выполнил'
      }</span>
      </label>`
    )
    .join('');

  root.className = 'kpi-list';
  root.innerHTML = `
    ${binaryCards}
    <article class="kpi-card">
      <div class="kpi-card-head">
        <h3>Фотоотчет (Т2 &gt;=100%)</h3>
        <span class="pill is-neutral">Руководитель: +2000 / −1000 · другой: 0</span>
      </div>
      <div class="salon-flags photo-salon-list">${photoRows || '<p class="kpi-note">Добавьте салоны</p>'}</div>
      <div class="kpi-metrics" data-admin-metrics="photoReport"></div>
    </article>
    <article class="kpi-card">
      <div class="kpi-card-head">
        <h3>Выполнение критериев получения Бонуса за сервис</h3>
        <span class="pill is-neutral">+2000 ₽ / салон</span>
      </div>
      <div class="salon-flags">${serviceRows || '<p class="kpi-note">Добавьте салоны</p>'}</div>
      <div class="kpi-metrics" data-admin-metrics="serviceBonus"></div>
    </article>
    <article class="kpi-card">
      <div class="kpi-card-head">
        <h3>Доля проверок ТхВ от WS &gt;=40%</h3>
        <span class="pill is-neutral">+2000 ₽ / салон</span>
      </div>
      <div class="salon-flags">${txvRows || '<p class="kpi-note">Добавьте салоны</p>'}</div>
      <div class="kpi-metrics" data-admin-metrics="txvChecks"></div>
    </article>`;
}

function updateAdminBlockResults(adminResult) {
  const byId = Object.fromEntries((adminResult.items || []).map((i) => [i.id, i]));

  administrativeRules
    .filter((r) => r.type === 'binaryDone')
    .forEach((rule) => {
      const item = byId[rule.id];
      const el = document.querySelector(`[data-admin-metrics="${rule.id}"]`);
      if (!el || !item) return;
      el.innerHTML = `
        <div class="kpi-metric"><span class="label">Статус</span><span class="value">${
          item.done ? '✅ Выполнено' : '❌ Не выполнено'
        }</span></div>
        <div class="kpi-metric is-brand"><span class="label">🟢 Бонус</span><span class="value">${formatMoney(
          item.bonus
        )}</span></div>
        <div class="kpi-metric is-positive"><span class="label">Максимум</span><span class="value">${formatMoney(
          item.maxBonus
        )}</span></div>`;
    });

  const photo = byId.photoReport;
  const photoEl = document.querySelector('[data-admin-metrics="photoReport"]');
  if (photoEl && photo) {
    photoEl.innerHTML = `
      <div class="kpi-metric is-positive"><span class="label">Руководитель выполнил</span><span class="value">${photo.passed}</span></div>
      <div class="kpi-metric is-negative"><span class="label">Руководитель не выполнил</span><span class="value">${photo.failed}</span></div>
      <div class="kpi-metric"><span class="label">Другой сотрудник</span><span class="value">${photo.otherCount || 0}</span></div>
      <div class="kpi-metric is-brand"><span class="label">🟢 Бонус</span><span class="value">${formatMoney(photo.bonus)}</span></div>
      <div class="kpi-metric is-warning"><span class="label">Максимум</span><span class="value">${formatMoney(photo.maxBonus)}</span></div>`;
  }

  ['serviceBonus', 'txvChecks'].forEach((id) => {
    const item = byId[id];
    const el = document.querySelector(`[data-admin-metrics="${id}"]`);
    if (!el || !item) return;
    el.innerHTML = `
      <div class="kpi-metric is-positive"><span class="label">Выполнили</span><span class="value">${item.passed}</span></div>
      <div class="kpi-metric is-negative"><span class="label">Не выполнили</span><span class="value">${item.failed}</span></div>
      <div class="kpi-metric is-brand"><span class="label">🟢 Бонус</span><span class="value">${formatMoney(item.bonus)}</span></div>
      <div class="kpi-metric is-warning"><span class="label">Максимум</span><span class="value">${formatMoney(item.maxBonus)}</span></div>`;
  });

  const labels = {
    recommendations: '1. Рекомендации',
    cardShare: '2. Доля продаж по карте',
    dovChecklist: '3. Чек-лист ДОВ',
    monthlyTesting: '4. Ежемесячное тестирование',
    photoReport: '5. Фотоотчет',
    serviceBonus: '6. Бонус за сервис',
    txvChecks: '7. ТхВ',
  };

  document.getElementById('adminResultStrip').innerHTML = `
    ${administrativeRules
      .map((rule) => {
        const item = byId[rule.id];
        return `<div class="result-item">
          <span class="label">${labels[rule.id] || rule.name}</span>
          <div class="value">${formatMoney(item?.bonus || 0)}</div>
        </div>`;
      })
      .join('')}
    <div class="result-item is-brand" style="flex:1 1 100%">
      <span class="label">ИТОГО АДМИНИСТРАТИВНЫЙ БОНУС</span>
      <div class="value">${formatMoney(adminResult.bonus)}</div>
    </div>`;
}

function renderOperatorBlock(data) {
  const root = document.getElementById('operatorBlock');
  const list = data.salonsList || [];
  const tele2 = getTele2SalonsWithMeta(list);

  const salonCards = tele2
    .map((salon) => {
      const toggles = operatorTele2Kpis
        .map((kpi) => {
          const checked = Boolean(salon.kpis?.[kpi.id]);
          return `
            <label class="kpi-toggle ${checked ? 'is-done' : 'is-fail'}">
              <input type="checkbox" data-tele2-list-index="${salon.listIndex}" data-tele2-kpi="${kpi.id}" ${
            checked ? 'checked' : ''
          } />
              <span>${escapeHtml(kpi.name)}</span>
            </label>`;
        })
        .join('');
      return `
        <article class="kpi-card tele2-salon-card">
          <div class="kpi-card-head">
            <h3>${escapeHtml(salon.title)}</h3>
          </div>
          <div class="tele2-toggles">${toggles}</div>
        </article>`;
    })
    .join('');

  root.innerHTML = `
    <div class="form-grid form-grid-2" style="margin-bottom:14px">
      <div class="field">
        <span>Салонов T2 (авто)</span>
        <div class="hint-box">${tele2.length}</div>
      </div>
      <div class="field">
        <span>Салонов в подчинении</span>
        <div class="hint-box">${data.salonsTotal || 0}</div>
      </div>
    </div>
    <div id="tele2Validation" class="validation-msg" hidden></div>
    <div class="kpi-list" id="tele2SalonCards">${
      salonCards ||
      '<p class="kpi-note">Нет салонов T2. Выберите оператора T2 в карточках салонов выше.</p>'
    }</div>
    <div id="operatorFailedKpis" class="failed-kpis"></div>`;
}

function updateOperatorBlockResults(op) {
  const validation = document.getElementById('tele2Validation');
  const salonsValidation = document.getElementById('salonsValidation');

  if (salonsValidation) {
    if ((op.salonsTotal || 0) < 1) {
      salonsValidation.hidden = false;
      salonsValidation.textContent =
        'Количество салонов должно быть целым числом ≥ 1 для корректного расчёта.';
      salonsValidation.className = 'validation-msg is-warning';
    } else {
      salonsValidation.hidden = true;
    }
  }

  if (validation) {
    if (op.invalidTele2) {
      validation.hidden = false;
      validation.className = 'validation-msg is-error';
      validation.textContent =
        'Количество салонов T2 не может превышать общее количество салонов.';
    } else if (!op.budgetDefined && op.salonsTotal > 0) {
      validation.hidden = false;
      validation.className = 'validation-msg is-warning';
      validation.textContent = `Бюджет для ${op.salonsTotal} салонов не задан. Добавьте значение в operatorBudgetBySalons.`;
    } else {
      validation.hidden = true;
    }
  }

  const failedRoot = document.getElementById('operatorFailedKpis');
  if (failedRoot) {
    if (!op.failedBySalon?.length) {
      failedRoot.innerHTML = `<div class="why-row is-ok"><div class="why-body"><div class="why-title">🟢 Невыполненных KPI нет</div></div></div>`;
    } else {
      failedRoot.innerHTML = `
        <h3 class="subhead">Не выполненные KPI</h3>
        ${op.failedBySalon
          .map((salon) =>
            salon.failed
              .map(
                (f) =>
                  `<div class="failed-salon"><div class="why-title">🔴 ${escapeHtml(
                    salon.displayName || salon.name
                  )} — ${escapeHtml(f.name)}</div></div>`
              )
              .join('')
          )
          .join('')}`;
    }
  }

  document.getElementById('operatorResultStrip').innerHTML = `
    <div class="result-item"><span class="label">Бюджет</span><div class="value">${formatMoney(op.budget)}</div></div>
    <div class="result-item"><span class="label">Всего KPI</span><div class="value">${op.totalKpis}</div></div>
    <div class="result-item is-positive"><span class="label">Выполнено</span><div class="value">${op.doneKpis}</div></div>
    <div class="result-item is-negative"><span class="label">Не выполнено</span><div class="value">${op.failedKpis}</div></div>
    <div class="result-item"><span class="label">Выполнение</span><div class="value">${formatPercent(op.completion, 2)}</div></div>
    <div class="result-item"><span class="label">Коэффициент</span><div class="value">×${formatCoeff(op.coefficient)}</div></div>
    <div class="result-item is-brand"><span class="label">🟢 Текущий бонус</span><div class="value">${formatMoney(op.bonus)}</div></div>
    <div class="result-item is-negative"><span class="label">🔴 Потеря к бюджету</span><div class="value">−${formatMoney(op.loss)}</div></div>`;
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
  const analytics = economy.analytics;

  document.getElementById('coeffRow').innerHTML = `
    <span class="pill is-neutral">Кредиты ×${formatCoeff(economy.creditCoeff)}</span>
    <span class="pill is-neutral">Аттачмент ×${formatCoeff(economy.attachmentCoeff)}</span>
  `;

  renderComboAnalytics(economy.combo);
  renderEconomyKpiAnalytics(economy.kpis);
  renderWhyLosing(analytics);
  renderEconomySummary(economy, analytics);
}

function renderComboAnalytics(combo) {
  const lossClass = combo.loss > 0 ? 'is-negative' : 'is-positive';
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
      <span class="label">🟢 Бонус Комбо</span>
      <div class="value">${formatMoney(combo.bonus)}</div>
    </div>
    <div class="result-item is-positive">
      <span class="label">Максимум</span>
      <div class="value">${formatMoney(combo.maxBonus)}</div>
    </div>
    <div class="result-item ${lossClass}">
      <span class="label">${combo.loss > 0 ? '🔴 Потеря' : '🟢 Потеря'}</span>
      <div class="value">${combo.loss > 0 ? '−' : ''}${formatMoney(combo.loss)}</div>
    </div>
    <div class="result-item is-warning">
      <span class="label">🟡 Можно получить</span>
      <div class="value">+${formatMoney(combo.potentialPlus)}</div>
    </div>
    ${
      combo.primaryReason
        ? `<div class="result-item ${
            combo.primaryReason.severity === 'positive' ? 'is-positive' : 'is-negative'
          }" style="flex:1 1 100%">
            <span class="label">Причина</span>
            <div class="value" style="font-size:0.95rem;font-weight:700">${escapeHtml(
              combo.primaryReason.summary
            )}</div>
          </div>`
        : ''
    }`;
}

function renderProgressBar(percent) {
  const capped = Math.min(120, Math.max(0, Number(percent) || 0));
  const width = Math.min(100, (capped / 120) * 100);
  let tone = 'is-negative';
  if (capped >= 120) tone = 'is-positive';
  else if (capped >= 85) tone = 'is-warning';
  else if (capped >= 75) tone = 'is-warning';

  return `
    <div class="progress-wrap ${tone}">
      <div class="progress-meta">
        <span>Выполнение ${formatPercent(percent)}</span>
        <span>${formatPercent(Math.min(capped, 120), 0)} / 120%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${width}%"></div>
        <span class="progress-mark" style="left:62.5%" title="75%"></span>
        <span class="progress-mark" style="left:70.83%" title="85%"></span>
        <span class="progress-mark is-end" style="left:100%" title="120%"></span>
      </div>
    </div>`;
}

function renderFactorBlock(title, factor, extraHtml = '') {
  if (!factor) return '';
  const hasLoss = factor.loss > 0.009;
  return `
    <div class="factor-card ${hasLoss ? 'is-negative' : 'is-positive'}">
      <h4>${hasLoss ? '🔴' : '🟢'} ${escapeHtml(title)}</h4>
      <div class="factor-grid">
        <div><span class="label">Текущий коэфф.</span><strong>×${formatCoeff(factor.currentCoeff)}</strong></div>
        <div><span class="label">Макс. коэфф.</span><strong>×${formatCoeff(factor.maxCoeff)}</strong></div>
        <div><span class="label">${hasLoss ? 'Влияние на бонус' : 'Статус'}</span>
          <strong>${hasLoss ? '−' + formatMoney(factor.loss) : 'Ок'}</strong>
        </div>
        ${
          factor.next && factor.next.nextThreshold != null
            ? `<div><span class="label">След. порог</span><strong>${
                typeof factor.next.nextThreshold === 'number' && factor.next.nextThreshold >= 10
                  ? formatPercent(factor.next.nextThreshold, 0)
                  : formatNumber(factor.next.nextThreshold, 2)
              }</strong></div>
              <div><span class="label">След. коэфф.</span><strong>×${formatCoeff(
                factor.next.nextCoefficient
              )}</strong></div>
              <div><span class="label">🟡 Ближайший плюс</span><strong>+${formatMoney(
                factor.nextGain
              )}</strong></div>`
            : `<div><span class="label">Порог</span><strong>Достигнут</strong></div>`
        }
      </div>
      ${extraHtml}
    </div>`;
}

function renderEconomyKpiAnalytics(kpis) {
  kpis.forEach((kpi) => {
    const completionEl = document.querySelector(`[data-kpi-completion="${kpi.id}"]`);
    if (completionEl) {
      const tone =
        kpi.loss < 0.01
          ? 'is-positive'
          : kpi.completion < 75
            ? 'is-negative'
            : kpi.completion >= 100
              ? 'is-warning'
              : 'is-negative';
      completionEl.textContent = `Выполнение ${formatPercent(kpi.completion)}`;
      completionEl.className = `pill ${tone}`;
    }

    const metrics = document.querySelector(`[data-kpi-metrics="${kpi.id}"]`);
    if (!metrics) return;

    const firstTitle = kpi.usesCredit ? 'Кредиты' : 'Аттачмент';
    const firstExtra =
      kpi.firstFactor && kpi.firstFactor.kind === 'attachment'
        ? `<p class="factor-note">Текущий аттачмент: <strong>${formatNumber(
            kpi.firstFactor.inputValue,
            2
          )}</strong>. Максимальный уровень: 3,6 (×1,1).</p>`
        : kpi.firstFactor && kpi.firstFactor.kind === 'credit'
          ? `<p class="factor-note">Выполнение доли кредитов: <strong>${formatPercent(
              kpi.firstFactor.inputValue
            )}</strong>. Максимум коэффициента при ≥110%.</p>`
          : '';

    const reasonsHtml = (kpi.reasons || [])
      .map((r) => {
        const icon = r.severity === 'positive' ? '🟢' : r.severity === 'critical' ? '🔴' : r.amount > 0 ? '🔴' : '🟡';
        return `<div class="reason-line ${
          r.severity === 'positive' ? 'is-positive' : r.amount > 0 ? 'is-negative' : 'is-warning'
        }">
          <div class="reason-title">${icon} ${escapeHtml(r.title)}</div>
          <div class="reason-text">${escapeHtml(r.text)}</div>
          ${r.amount > 0 ? `<div class="reason-amount">−${formatMoney(r.amount)}</div>` : ''}
        </div>`;
      })
      .join('');

    const actionsHtml = (kpi.actions || [])
      .map(
        (a) => `
        <div class="action-card">
          <div class="action-title">Что сделать: ${escapeHtml(a.title)}</div>
          <div class="action-grid">
            <div><span class="label">Сейчас</span><strong>${escapeHtml(a.currentLabel)}</strong></div>
            <div><span class="label">Следующий порог</span><strong>${escapeHtml(a.nextLabel)}</strong></div>
            <div><span class="label">Нужно</span><strong>${escapeHtml(a.needLabel)}</strong></div>
            <div><span class="label">🟡 Плюс</span><strong>+${formatMoney(a.potentialPlus)}</strong></div>
          </div>
          <p class="factor-note">${escapeHtml(a.detail)}</p>
        </div>`
      )
      .join('');

    metrics.innerHTML = `
      ${renderProgressBar(kpi.completion)}
      <div class="kpi-metrics-grid">
        <div class="kpi-metric">
          <span class="label">Базовая сумма</span>
          <span class="value">${formatMoney(kpi.baseAmount)}</span>
        </div>
        <div class="kpi-metric">
          <span class="label">${firstTitle}</span>
          <span class="value">×${formatCoeff(kpi.firstCoeff)}</span>
        </div>
        <div class="kpi-metric">
          <span class="label">Эффективность</span>
          <span class="value">×${formatCoeff(kpi.efficiencyCoeff)}</span>
        </div>
        <div class="kpi-metric is-brand">
          <span class="label">🟢 Текущий бонус</span>
          <span class="value">${formatMoney(kpi.bonus)}</span>
        </div>
        <div class="kpi-metric is-positive">
          <span class="label">Максимум при текущем ${firstTitle.toLowerCase()}</span>
          <span class="value">${formatMoney(kpi.maxBonus)}</span>
        </div>
        <div class="kpi-metric">
          <span class="label">Абсолютный максимум</span>
          <span class="value">${formatMoney(kpi.absoluteMaxBonus)}</span>
        </div>
        <div class="kpi-metric is-negative">
          <span class="label">🔴 Общая потеря</span>
          <span class="value">−${formatMoney(kpi.loss)}</span>
        </div>
        <div class="kpi-metric is-warning">
          <span class="label">🟡 Можно получить</span>
          <span class="value">+${formatMoney(kpi.potentialPlus)}</span>
        </div>
      </div>

      <div class="breakdown-title">Из-за чего потеряно</div>
      <div class="reasons-list">${reasonsHtml || '<p class="factor-note">Потерь нет</p>'}</div>

      <div class="factors-row">
        ${renderFactorBlock('Эффективность', kpi.efficiencyFactor)}
        ${renderFactorBlock(firstTitle, kpi.firstFactor, firstExtra)}
      </div>

      ${
        actionsHtml
          ? `<div class="breakdown-title">Что сделать</div><div class="actions-list">${actionsHtml}</div>`
          : ''
      }`;

    // Растягиваем контейнер метрик на полную ширину карточки
    metrics.classList.add('kpi-analytics');
  });
}

function renderWhyLosing(analytics) {
  const root = document.getElementById('economyWhyLosing');
  if (!root || !analytics) return;

  const rows = analytics.sortedLosses.length
    ? analytics.sortedLosses
        .map(
          (item, index) => `
        <div class="why-row">
          <div class="why-rank">${index + 1}</div>
          <div class="why-body">
            <div class="why-title">🔴 ${escapeHtml(item.name)}</div>
            <div class="why-reason">${escapeHtml(item.primaryReason?.summary || 'Есть потеря')}</div>
            ${
              item.primaryReason?.detail
                ? `<div class="why-detail">${escapeHtml(item.primaryReason.detail)}</div>`
                : ''
            }
          </div>
          <div class="why-amount">−${formatMoney(item.loss)}</div>
        </div>`
        )
        .join('')
    : `<div class="why-row is-ok">
        <div class="why-body">
          <div class="why-title">🟢 Потерь в экономическом блоке нет</div>
          <div class="why-reason">Все показатели на максимуме</div>
        </div>
      </div>`;

  root.innerHTML = `
    <div class="why-losing-card">
      <div class="why-losing-head">
        <h3>Из-за чего я теряю деньги</h3>
        <p>Отсортировано по размеру потери — сначала самое важное</p>
      </div>
      <div class="why-list">${rows}</div>
      <div class="why-totals">
        <div class="kpi-metric is-negative">
          <span class="label">Общие потери экономического блока</span>
          <span class="value">−${formatMoney(analytics.totalLoss)}</span>
        </div>
        <div class="kpi-metric is-warning">
          <span class="label">💰 Можно дополнительно получить</span>
          <span class="value">+${formatMoney(analytics.totalPotential)}</span>
        </div>
      </div>
    </div>`;
}

function renderEconomySummary(economy, analytics) {
  const main = analytics?.mainCause;
  document.getElementById('economyResultStrip').innerHTML = `
    <div class="result-item is-brand">
      <span class="label">🟢 Бонус экономики</span>
      <div class="value">${formatMoney(economy.bonus)}</div>
    </div>
    <div class="result-item is-positive">
      <span class="label">Максимум (при текущих коэфф.)</span>
      <div class="value">${formatMoney(economy.maxBonusAtCurrentCoeffs)}</div>
    </div>
    <div class="result-item">
      <span class="label">Абсолютный максимум</span>
      <div class="value">${formatMoney(economy.maxBonus)}</div>
    </div>
    <div class="result-item is-negative">
      <span class="label">🔴 Потеря</span>
      <div class="value">−${formatMoney(economy.loss)}</div>
    </div>
    <div class="result-item is-warning">
      <span class="label">🟡 Можно дополнительно получить</span>
      <div class="value">+${formatMoney(economy.potentialPlus)}</div>
    </div>
    ${
      main
        ? `<div class="result-item is-negative" style="flex:1 1 100%">
            <span class="label">Основная причина потерь</span>
            <div class="value" style="font-size:1rem">
              ${escapeHtml(main.name)} · +${formatMoney(main.potentialPlus)}
            </div>
          </div>`
        : `<div class="result-item is-positive" style="flex:1 1 100%">
            <span class="label">Основная причина потерь</span>
            <div class="value" style="font-size:1rem">Нет — блок на максимуме</div>
          </div>`
    }`;
}

function renderLosses(result) {
  const economyRows = (result.economy.analytics?.kpiAnalytics || result.economy.kpis).map((kpi) => ({
    title: kpi.name,
    completion: kpi.completion,
    efficiency: kpi.efficiencyCoeff,
    current: kpi.bonus,
    next: kpi.nextThreshold?.nextThreshold ?? null,
    needed: kpi.nextThreshold?.percentNeeded ?? null,
    max: kpi.maxBonus,
    plus: kpi.potentialPlus,
    reason: kpi.primaryReason?.summary || '',
  }));

  if (result.economy.combo) {
    economyRows.push({
      title: 'Комбо 40%+',
      completion: null,
      efficiency: null,
      current: result.economy.combo.bonus,
      next: null,
      needed: null,
      max: result.economy.combo.maxBonus,
      plus: result.economy.combo.potentialPlus,
      reason: result.economy.combo.primaryReason?.summary || '',
    });
  }

  const rows = [...economyRows];

  rows.push({
    title: 'Бонус за продажи',
    completion: null,
    efficiency: result.sales.seasonality,
    current: result.sales.total,
    next: null,
    needed: null,
    max: result.sales.maxBonus,
    plus: result.sales.potentialPlus,
    reason: '',
  });

  if (result.administrative.items.length) {
    result.administrative.items.forEach((item) => {
      rows.push({
        title: item.name,
        completion: item.completion,
        efficiency: null,
        current: item.bonus,
        next: null,
        needed: null,
        max: item.maxBonus,
        plus: item.potentialPlus,
        reason: '',
      });
    });
  }

  if (result.operator) {
    rows.push({
      title: 'Операторский блок (T2)',
      completion: result.operator.completion,
      efficiency: result.operator.coefficient,
      current: result.operator.bonus,
      next: null,
      needed: null,
      max: result.operator.maxBonus,
      plus: result.operator.potentialPlus,
      reason: result.operator.invalidTele2
        ? 'T2 больше общего числа салонов'
        : `${result.operator.doneKpis}/${result.operator.totalKpis} KPI`,
    });
  }

  if (result.blackList) {
    rows.push({
      title: 'Чёрный список (к бонусам)',
      completion: null,
      efficiency: result.blackList.coefficient,
      current: result.blackList.bonusAfter,
      next: null,
      needed: null,
      max: result.blackList.bonusAtOne,
      plus: result.blackList.potentialPlus,
      reason: `До ×1,00: ${formatMoney(result.blackList.bonusBefore)} · потеря ${formatMoney(
        result.blackList.loss
      )}`,
    });
  }

  document.getElementById('lossesBlock').innerHTML = `
    <div class="loss-grid">
      ${rows
        .map(
          (r) => `
        <article class="loss-card">
          <h3>${escapeHtml(r.title)}</h3>
          ${r.reason ? `<p class="kpi-note">${escapeHtml(r.reason)}</p>` : ''}
          <div class="loss-metrics">
            ${
              r.completion == null
                ? ''
                : `<div class="kpi-metric"><span class="label">Выполнение</span><span class="value">${formatPercent(
                    r.completion
                  )}</span></div>`
            }
            ${
              r.efficiency == null
                ? ''
                : `<div class="kpi-metric"><span class="label">Коэффициент</span><span class="value">×${formatCoeff(
                    r.efficiency
                  )}</span></div>`
            }
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

  const bl = result.blackList;
  document.getElementById('totalBlock').innerHTML = `
    <div class="total-grid">
      <div class="total-row">
        <span class="label">Окладная часть</span>
        <span class="value">${formatMoney(result.fixedSalary)}</span>
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
      <div class="total-row is-positive">
        <span class="label">Бонус за продажи</span>
        <span class="value">${formatMoney(result.sales.total)}</span>
      </div>
      <div class="total-row">
        <span class="label">Бонусная часть до чёрного списка</span>
        <span class="value">${formatMoney(bl.bonusBefore)}</span>
      </div>
      <div class="total-row">
        <span class="label">Коэффициент чёрного списка</span>
        <span class="value">×${formatCoeff(bl.coefficient)}</span>
      </div>
      <div class="total-row is-brand">
        <span class="label">Бонусная часть после чёрного списка</span>
        <span class="value">${formatMoney(bl.bonusAfter)}</span>
      </div>
      <div class="total-row is-negative">
        <span class="label">Потеря из-за чёрного списка</span>
        <span class="value">−${formatMoney(bl.loss)}</span>
      </div>
      <div class="total-row is-warning">
        <span class="label">Можно вернуть (при ×1,00)</span>
        <span class="value">+${formatMoney(bl.potentialPlus)}</span>
      </div>
      <div class="total-row grand">
        <span class="label">ИТОГОВАЯ ЗАРПЛАТА</span>
        <span class="value">${formatMoney(result.totalPay)}</span>
      </div>
    </div>`;

  document.getElementById('compositionBlock').innerHTML = `
    <div class="total-grid">
      <div class="total-row"><span class="label">Окладная часть</span><span class="value">${formatMoney(result.fixedSalary)}</span></div>
      <div class="total-row is-positive"><span class="label">Бонусы до чёрного списка</span><span class="value">${formatMoney(bl.bonusBefore)}</span></div>
      <div class="total-row"><span class="label">× Коэффициент чёрного списка</span><span class="value">×${formatCoeff(bl.coefficient)}</span></div>
      <div class="total-row is-brand"><span class="label">Бонусы после чёрного списка</span><span class="value">${formatMoney(bl.bonusAfter)}</span></div>
      <div class="total-row is-negative"><span class="label">Потеря</span><span class="value">−${formatMoney(bl.loss)}</span></div>
      <div class="total-row grand"><span class="label">ИТОГО (оклад + бонус после)</span><span class="value">${formatMoney(result.totalPay)}</span></div>
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
  updatePanelSums(result);
  renderPeriodsChips();
}

function updatePanelSums(result) {
  const map = {
    salary: result.fixedSalary,
    economy: result.economy.bonus,
    admin: result.administrative.bonus,
    operator: result.operator.bonus,
    sales: result.sales.total,
  };
  Object.entries(map).forEach(([key, value]) => {
    const el = document.querySelector(`[data-panel-sum="${key}"]`);
    if (!el) return;
    el.textContent = formatMoney(value);
  });

  const blSum = document.querySelector('[data-panel-sum="blacklist"]');
  if (blSum) {
    blSum.textContent = `×${formatCoeff(result.blackList?.coefficient ?? 1)}`;
  }
}

function applyCollapseState() {
  Object.keys(UI.collapse).forEach((key) => {
    setPanelCollapsed(key, Boolean(UI.collapse[key]), false);
  });
}

function setPanelCollapsed(key, collapsed, save = true) {
  UI.collapse[key] = collapsed;
  const panel = document.querySelector(`[data-panel="${key}"]`);
  const btn = document.querySelector(`[data-panel-toggle="${key}"]`);
  if (!panel || !btn) return;
  panel.classList.toggle('is-collapsed', collapsed);
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const icon = btn.querySelector('.collapse-icon');
  if (icon) icon.textContent = collapsed ? '▶' : '▼';
  if (save) {
    if (!UI.store.uiCollapse) UI.store.uiCollapse = {};
    UI.store.uiCollapse[key] = collapsed;
    saveStore(UI.store);
  }
}

function initCollapse() {
  if (UI.store.uiCollapse && typeof UI.store.uiCollapse === 'object') {
    Object.keys(UI.collapse).forEach((key) => {
      if (typeof UI.store.uiCollapse[key] === 'boolean') {
        UI.collapse[key] = UI.store.uiCollapse[key];
      }
    });
  }
  applyCollapseState();

  document.querySelectorAll('[data-panel-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.panelToggle;
      setPanelCollapsed(key, !UI.collapse[key], true);
    });
  });
}

function bindEvents() {
  const on = (id, event, handler) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`Элемент #${id} не найден, обработчик ${event} пропущен`);
      return;
    }
    el.addEventListener(event, handler);
  };

  on('employeeList', 'click', (e) => {
    const btn = e.target.closest('[data-employee-id]');
    if (!btn) return;
    setActiveEmployee(UI.store, btn.dataset.employeeId);
    syncAll();
  });

  on('periodsChips', 'click', (e) => {
    const chip = e.target.closest('[data-period]');
    if (!chip) return;
    const [year, month] = chip.dataset.period.split('-').map(Number);
    setActivePeriod(UI.store, year, month);
    syncAll();
  });

  on('btnAddEmployee', 'click', () => {
    const name = prompt('ФИО нового руководителя:', 'Новый руководитель');
    if (name === null) return;
    addEmployee(UI.store, name);
    showToast('Сотрудник создан');
    syncAll();
  });

  on('btnEditEmployee', 'click', () => {
    const employee = getActiveEmployee(UI.store);
    const name = prompt('Изменить ФИО:', employee.name);
    if (name === null) return;
    updateEmployeeName(UI.store, employee.id, name);
    showToast('ФИО обновлено');
    syncAll();
  });

  on('btnDeleteEmployee', 'click', () => {
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

  on('employeeName', 'change', (e) => {
    updateEmployeeName(UI.store, UI.store.activeEmployeeId, e.target.value);
    renderEmployeeList();
    recalculate();
  });

  on('monthSelect', 'change', (e) => {
    setActivePeriod(UI.store, UI.store.activeYear, Number(e.target.value));
    syncAll();
  });

  on('yearSelect', 'change', (e) => {
    setActivePeriod(UI.store, Number(e.target.value), UI.store.activeMonth);
    syncAll();
  });

  on('gradeSelector', 'click', (e) => {
    const card = e.target.closest('[data-grade]');
    if (!card) return;
    updateMonthField(UI.store, (data) => {
      data.grade = card.dataset.grade;
    });
    renderGradeSelector(card.dataset.grade);
    recalculate();
  });

  const numberFields = [
    ['salonsComboDone', 'salonsComboDone', true],
    ['creditPlanPercent', 'creditPlanPercent', false],
    ['attachment', 'attachment', false],
  ];

  numberFields.forEach(([id, key, integer]) => {
    on(id, 'input', (e) => {
      updateMonthField(UI.store, (data) => {
        let value = Number(e.target.value);
        if (!Number.isFinite(value)) value = 0;
        if (integer) value = Math.max(0, Math.floor(value));
        data[key] = value;
        if (key === 'salonsComboDone' && data.salonsComboDone > data.salonsTotal) {
          data.salonsComboDone = data.salonsTotal;
          e.target.value = data.salonsComboDone;
        }
      });
      recalculate();
    });
  });

  on('salonsTotal', 'change', (e) => {
    let value = Math.max(0, Math.floor(Number(e.target.value) || 0));
    const current = getActiveMonthData(UI.store).salonsTotal;

    if (value < current) {
      const ok = confirm(
        'При уменьшении количества салонов данные по удаляемым салонам будут удалены. Продолжить?'
      );
      if (!ok) {
        e.target.value = current;
        return;
      }
    }

    e.target.value = value;
    updateMonthField(UI.store, (data) => {
      data.salonsTotal = value;
    });
    const data = getActiveMonthData(UI.store);
    const comboEl = document.getElementById('salonsComboDone');
    if (comboEl) comboEl.value = data.salonsComboDone;
    UI.recalculating = true;
    renderSalonCards(data);
    renderAdminBlock(data);
    renderOperatorBlock(data);
    renderBlackListBlock(data);
    UI.recalculating = false;
    recalculate();
  });

  on('section-salons', 'input', (e) => {
    const nameInput = e.target.closest('[data-salon-name]');
    if (nameInput) {
      const index = Number(nameInput.dataset.salonName);
      updateMonthField(UI.store, (data) => {
        if (data.salonsList[index]) data.salonsList[index].name = nameInput.value;
      });
      const card = nameInput.closest('.salon-identity-card');
      const pill = card?.querySelector('.pill');
      const data = getActiveMonthData(UI.store);
      if (pill && data.salonsList[index]) {
        pill.textContent = getSalonTitle(data.salonsList[index], index);
      }
      recalculate();
    }
  });

  on('section-salons', 'change', (e) => {
    const nameInput = e.target.closest('[data-salon-name]');
    if (nameInput) {
      const data = getActiveMonthData(UI.store);
      UI.recalculating = true;
      renderAdminBlock(data);
      renderOperatorBlock(data);
      renderBlackListBlock(data);
      UI.recalculating = false;
      recalculate();
      return;
    }

    const opSelect = e.target.closest('[data-salon-operator]');
    if (!opSelect) return;
    const index = Number(opSelect.dataset.salonOperator);
    updateMonthField(UI.store, (data) => {
      if (data.salonsList[index]) data.salonsList[index].operator = opSelect.value;
    });
    const data = getActiveMonthData(UI.store);
    UI.recalculating = true;
    renderSalonCards(data);
    renderAdminBlock(data);
    renderOperatorBlock(data);
    renderBlackListBlock(data);
    UI.recalculating = false;
    recalculate();
  });

  on('section-blacklist', 'input', (e) => {
    const field = e.target.closest('[data-bl-salon][data-bl-field]');
    if (!field || field.tagName === 'SELECT') return;
    const index = Number(field.dataset.blSalon);
    const key = field.dataset.blField;
    updateMonthField(UI.store, (data) => {
      if (!data.salonsList[index]) return;
      if (!data.salonsList[index].blackList) {
        data.salonsList[index].blackList = createEmptySalonBlackList();
      }
      data.salonsList[index].blackList[key] = Number(field.value) || 0;
    });
    recalculate();
  });

  on('section-blacklist', 'change', (e) => {
    if (e.target.id === 'blExtraLimit') {
      updateMonthField(UI.store, (data) => {
        if (!data.blackList) data.blackList = createEmptyMonthBlackList();
        data.blackList.extraLimitExceeded = e.target.value === '1';
      });
      recalculate();
      return;
    }

    const field = e.target.closest('[data-bl-salon][data-bl-field]');
    if (!field) return;
    const index = Number(field.dataset.blSalon);
    const key = field.dataset.blField;
    updateMonthField(UI.store, (data) => {
      if (!data.salonsList[index]) return;
      if (!data.salonsList[index].blackList) {
        data.salonsList[index].blackList = createEmptySalonBlackList();
      }
      if (key === 'simDecadeFailed' || key === 'q2mPassed') {
        data.salonsList[index].blackList[key] = field.value === '1';
      } else {
        data.salonsList[index].blackList[key] = Number(field.value) || 0;
      }
    });
    recalculate();
  });

  on('section-sales', 'input', (e) => {
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

  on('economyKpiList', 'input', (e) => {
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

  on('section-admin', 'change', (e) => {
    const doneSelect = e.target.closest('[data-admin-done]');
    if (doneSelect) {
      const id = doneSelect.dataset.adminDone;
      updateMonthField(UI.store, (data) => {
        if (!data.administrative[id]) data.administrative[id] = { passed: false };
        data.administrative[id].passed = doneSelect.value === '1';
      });
      recalculate();
      return;
    }

    const performer = e.target.closest('[data-photo-performer]');
    if (performer) {
      const index = Number(performer.dataset.photoPerformer);
      updateMonthField(UI.store, (data) => {
        if (!data.salonsList[index]) return;
        data.salonsList[index].photoPerformer =
          performer.value === 'other' ? 'other' : 'manager';
      });
      const data = getActiveMonthData(UI.store);
      UI.recalculating = true;
      renderAdminBlock(data);
      UI.recalculating = false;
      recalculate();
      return;
    }

    const flag = e.target.closest('[data-salon-flag]');
    if (flag) {
      const index = Number(flag.dataset.salonIndex);
      const key = flag.dataset.salonFlag;
      updateMonthField(UI.store, (data) => {
        if (data.salonsList[index]) data.salonsList[index][key] = flag.checked;
      });
      const label = flag.closest('.salon-flag');
      if (label) {
        label.classList.toggle('is-done', flag.checked);
        label.classList.toggle('is-fail', !flag.checked);
        const span = label.querySelector('span');
        const data = getActiveMonthData(UI.store);
        const salon = data.salonsList[index];
        if (span && salon) {
          const name = getSalonDisplayName(salon, index);
          if (key === 'photoPassed') {
            span.textContent = flag.checked ? '✅ Выполнено' : '❌ Не выполнено';
          } else {
            span.textContent = `${name} — ${flag.checked ? '✅ Выполнил' : '❌ Не выполнил'}`;
          }
        }
      }
      recalculate();
    }
  });

  on('section-operator', 'change', (e) => {
    const toggle = e.target.closest('[data-tele2-list-index][data-tele2-kpi]');
    if (!toggle) return;
    const listIndex = Number(toggle.dataset.tele2ListIndex);
    const kpiId = toggle.dataset.tele2Kpi;
    updateMonthField(UI.store, (data) => {
      if (!data.salonsList[listIndex]) return;
      data.salonsList[listIndex].kpis[kpiId] = toggle.checked;
    });
    const label = toggle.closest('.kpi-toggle');
    if (label) {
      label.classList.toggle('is-done', toggle.checked);
      label.classList.toggle('is-fail', !toggle.checked);
    }
    recalculate();
  });

  on('btnRunChecks', 'click', () => {
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
  let bootError = null;
  try {
    UI.store = loadStore();
    if (!UI.store.uiCollapse) UI.store.uiCollapse = {};
    ensureActiveMonthData(UI.store);
    saveStore(UI.store);
  } catch (e) {
    bootError = e;
    console.error('Ошибка загрузки данных', e);
    if (!UI.store) UI.store = createDefaultStore();
  }

  try {
    initPeriodSelects();
    bindEvents();
    initCollapse();
    syncAll();
  } catch (e) {
    bootError = e;
    console.error('Ошибка запуска интерфейса', e);
  }

  if (bootError) {
    const root = document.getElementById('analyticsCards') || document.body;
    const box = document.createElement('div');
    box.className = 'validation-msg is-error';
    box.style.margin = '12px 0';
    box.textContent =
      'Часть данных не загрузилась. Нажмите Ctrl+F5. Если кнопки не работают — очистите кэш для ksuivash98.github.io.';
    root.prepend(box);
    try {
      showToast('Ошибка запуска. Попробуйте Ctrl+F5', true);
    } catch (_) {
      /* ignore */
    }
  }
}
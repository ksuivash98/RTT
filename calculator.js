/**
 * Функции расчёта зарплаты руководителя РТТ.
 * Формулы не дублируются — единый источник логики.
 */

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getFixedSalary(gradeId) {
  const grade = managerGrades[gradeId] || managerGrades.grade3;
  return grade.salary + grade.allowance;
}

function getGrade(gradeId) {
  return managerGrades[gradeId] || managerGrades.grade3;
}

/**
 * Кредиты.
 * <100% → 0.8 | 100–109.9% → 1.0 | ≥110% → 1.1
 */
function getCreditCoefficient(percent) {
  const p = Number(percent);
  if (!Number.isFinite(p) || p < 100) return 0.8;
  if (p < 110) return 1.0;
  return 1.1;
}

/**
 * Аттачмент.
 * ≤2.29 → 0.8 | 2.3–3.59 → 1.0 | ≥3.6 → 1.1
 */
function getAttachmentCoefficient(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 2.29) return 0.8;
  if (v < 3.6) return 1.0;
  return 1.1;
}

/**
 * Коэффициент эффективности.
 * <75% → 0 | 75–84.9% → 0.75 | 85–119.9% → percent/100 | ≥120% → 1.2
 */
function getEfficiencyCoefficient(percent) {
  const p = Number(percent);
  if (!Number.isFinite(p) || p < 75) return 0;
  if (p < 85) return 0.75;
  if (p < 120) return p / 100;
  return 1.2;
}

/**
 * Коэффициент сезонности для бонуса продаж.
 * Январь–июнь: 1.10 | Июль–декабрь: 0.90
 */
function getSeasonalityCoefficient(month) {
  const m = Number(month);
  if (SEASONALITY.firstHalf.months.includes(m)) {
    return SEASONALITY.firstHalf.coefficient;
  }
  return SEASONALITY.secondHalf.coefficient;
}

function getSeasonalityInfo(month) {
  const m = Number(month);
  if (SEASONALITY.firstHalf.months.includes(m)) {
    return { ...SEASONALITY.firstHalf, period: 'Январь–июнь' };
  }
  return { ...SEASONALITY.secondHalf, period: 'Июль–декабрь' };
}

function calcCompletionPercent(plan, fact) {
  const p = Number(plan);
  const f = Number(fact);
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (!Number.isFinite(f)) return 0;
  return (f / p) * 100;
}

/**
 * Бонус Комбо — отдельно, без Кредитов / аттачмента / эффективности.
 * Бонус = выполнившие × 2000
 */
function calculateComboBonus(salonsTotal, salonsComboDone) {
  const total = Math.max(0, Math.floor(Number(salonsTotal) || 0));
  let done = Math.max(0, Math.floor(Number(salonsComboDone) || 0));
  if (done > total) done = total;

  return {
    salonsTotal: total,
    salonsComboDone: done,
    salonsNotDone: Math.max(0, total - done),
    bonus: roundMoney(done * COMBO_BONUS_PER_SALON),
  };
}

/**
 * Максимально возможный бонус KPI при идеальных коэффициентах.
 * Кредиты/аттачмент max = 1.1, эффективность max = 1.2
 */
function getMaxEconomyBonus(baseAmount, usesCredit, usesAttachment) {
  const firstCoeff = usesCredit || usesAttachment ? 1.1 : 1;
  const efficiencyMax = 1.2;
  return baseAmount * firstCoeff * efficiencyMax;
}

/**
 * Ближайший порог эффективности.
 */
function getNextEfficiencyThreshold(completionPercent) {
  const p = Number(completionPercent) || 0;

  if (p < 75) {
    return {
      currentLabel: '<75%',
      nextThreshold: 75,
      percentNeeded: Math.max(0, 75 - p),
      nextCoefficient: 0.75,
    };
  }
  if (p < 85) {
    return {
      currentLabel: '75–84,9%',
      nextThreshold: 85,
      percentNeeded: Math.max(0, 85 - p),
      nextCoefficient: 0.85,
    };
  }
  if (p < 120) {
    return {
      currentLabel: '85–119,9%',
      nextThreshold: 120,
      percentNeeded: Math.max(0, 120 - p),
      nextCoefficient: 1.2,
    };
  }
  return {
    currentLabel: '≥120%',
    nextThreshold: null,
    percentNeeded: 0,
    nextCoefficient: 1.2,
  };
}

/**
 * Расчёт одного экономического KPI.
 * Порядок: сначала Кредиты/аттачмент, затем эффективность.
 */
function calculateSingleEconomyKpi(def, baseAmount, plan, fact, creditCoeff, attachmentCoeff) {
  const completion = calcCompletionPercent(plan, fact);
  const efficiencyCoeff = getEfficiencyCoefficient(completion);

  let firstCoeff = 1;
  let firstCoeffLabel = '—';
  if (def.usesCredit) {
    firstCoeff = creditCoeff;
    firstCoeffLabel = `Кредиты ×${formatCoeff(creditCoeff)}`;
  } else if (def.usesAttachment) {
    firstCoeff = attachmentCoeff;
    firstCoeffLabel = `Аттачмент ×${formatCoeff(attachmentCoeff)}`;
  }

  const bonus = roundMoney(baseAmount * firstCoeff * efficiencyCoeff);
  const maxBonus = roundMoney(getMaxEconomyBonus(baseAmount, def.usesCredit, def.usesAttachment));
  const loss = roundMoney(Math.max(0, maxBonus - bonus));
  const potentialPlus = loss;
  const nextThreshold = getNextEfficiencyThreshold(completion);

  return {
    id: def.id,
    name: def.name,
    note: def.note || '',
    plan: Number(plan) || 0,
    fact: Number(fact) || 0,
    completion,
    baseAmount,
    usesCredit: def.usesCredit,
    usesAttachment: def.usesAttachment,
    firstCoeff,
    firstCoeffLabel,
    creditCoeff: def.usesCredit ? creditCoeff : null,
    attachmentCoeff: def.usesAttachment ? attachmentCoeff : null,
    efficiencyCoeff,
    bonus,
    maxBonus,
    loss,
    potentialPlus,
    nextThreshold,
  };
}

/**
 * Экономический блок (все KPI + Комбо).
 */
function calculateEconomyKpi(monthData) {
  const grade = getGrade(monthData.grade);
  const creditCoeff = getCreditCoefficient(monthData.creditPlanPercent);
  const attachmentCoeff = getAttachmentCoefficient(monthData.attachment);

  const kpis = economyKpiDefs.map((def) => {
    const baseAmount = grade.economy[def.baseKey] || 0;
    const kpiData = monthData.economy?.[def.id] || { plan: 0, fact: 0 };
    return calculateSingleEconomyKpi(
      def,
      baseAmount,
      kpiData.plan,
      kpiData.fact,
      creditCoeff,
      attachmentCoeff
    );
  });

  const combo = calculateComboBonus(monthData.salonsTotal, monthData.salonsComboDone);
  const kpisBonus = roundMoney(kpis.reduce((sum, k) => sum + k.bonus, 0));
  const kpisMax = roundMoney(kpis.reduce((sum, k) => sum + k.maxBonus, 0));
  const kpisLoss = roundMoney(kpis.reduce((sum, k) => sum + k.loss, 0));

  return {
    creditCoeff,
    attachmentCoeff,
    kpis,
    combo,
    bonus: roundMoney(kpisBonus + combo.bonus),
    maxBonus: roundMoney(kpisMax + combo.bonus),
    loss: kpisLoss,
    potentialPlus: kpisLoss,
  };
}

/**
 * Бонус за продажи (товары + операторские продажи) с сезонностью и лимитом 9000.
 */
function calculateSalesBonus(monthData, month) {
  let beforeSeasonality = 0;
  const productLines = [];

  salesProducts.forEach((product) => {
    const amount = Number(monthData.salesValues?.[product.id]) || 0;
    const bonus = roundMoney(amount * product.rate);
    beforeSeasonality += bonus;
    productLines.push({
      id: product.id,
      name: product.name,
      type: product.type,
      rate: product.rate,
      input: amount,
      bonus,
    });
  });

  const operatorLines = [];
  operatorSalesItems.forEach((item) => {
    const input = Number(monthData.operatorSalesValues?.[item.id]) || 0;
    const bonus = roundMoney(input * item.rate);
    beforeSeasonality += bonus;
    operatorLines.push({
      id: item.id,
      name: item.name,
      type: item.type,
      rate: item.rate,
      input,
      bonus,
    });
  });

  const seasonality = getSeasonalityCoefficient(month);
  const seasonalityInfo = getSeasonalityInfo(month);
  const afterSeasonality = roundMoney(beforeSeasonality * seasonality);
  const total = roundMoney(Math.min(SALES_BONUS_MAX, afterSeasonality));
  const capped = afterSeasonality > SALES_BONUS_MAX;
  const lossFromCap = roundMoney(Math.max(0, afterSeasonality - SALES_BONUS_MAX));
  const maxBonus = SALES_BONUS_MAX;
  const potentialPlus = roundMoney(Math.max(0, maxBonus - total));

  return {
    productLines,
    operatorLines,
    beforeSeasonality: roundMoney(beforeSeasonality),
    seasonality,
    seasonalityInfo,
    afterSeasonality,
    total,
    maxBonus,
    capped,
    lossFromCap,
    loss: roundMoney(potentialPlus + lossFromCap),
    potentialPlus,
  };
}

/**
 * Административный блок — по пустой конфигурации administrativeRules.
 */
function calculateAdministrativeBonus(monthData) {
  if (!administrativeRules.length) {
    return {
      items: [],
      bonus: 0,
      maxBonus: 0,
      loss: 0,
      potentialPlus: 0,
    };
  }

  const items = administrativeRules.map((rule) => {
    const data = monthData.administrative?.[rule.id] || {};
    const plan = Number(data.plan) || 0;
    const fact = Number(data.fact) || 0;
    const completion = calcCompletionPercent(plan, fact);
    const coefficient = typeof rule.getCoefficient === 'function'
      ? rule.getCoefficient(completion, data)
      : 1;
    const base = Number(rule.baseBonus) || 0;
    const bonus = roundMoney(base * coefficient);
    const maxBonus = roundMoney(Number(rule.maxBonus) || base);
    const loss = roundMoney(Math.max(0, maxBonus - bonus));

    return {
      id: rule.id,
      name: rule.name,
      plan,
      fact,
      completion,
      coefficient,
      bonus,
      maxBonus,
      loss,
      potentialPlus: loss,
    };
  });

  return {
    items,
    bonus: roundMoney(items.reduce((s, i) => s + i.bonus, 0)),
    maxBonus: roundMoney(items.reduce((s, i) => s + i.maxBonus, 0)),
    loss: roundMoney(items.reduce((s, i) => s + i.loss, 0)),
    potentialPlus: roundMoney(items.reduce((s, i) => s + i.potentialPlus, 0)),
  };
}

/**
 * Операторский блок KPI — по пустой конфигурации operatorRules.
 */
function calculateOperatorBonus(monthData) {
  if (!operatorRules.length) {
    return {
      items: [],
      bonus: 0,
      maxBonus: 0,
      loss: 0,
      potentialPlus: 0,
    };
  }

  const items = operatorRules.map((rule) => {
    const data = monthData.operator?.[rule.id] || {};
    const plan = Number(data.plan) || 0;
    const fact = Number(data.fact) || 0;
    const completion = calcCompletionPercent(plan, fact);
    const coefficient = typeof rule.getCoefficient === 'function'
      ? rule.getCoefficient(completion, data)
      : 1;
    const base = Number(rule.baseBonus) || 0;
    const bonus = roundMoney(base * coefficient);
    const maxBonus = roundMoney(Number(rule.maxBonus) || base);
    const loss = roundMoney(Math.max(0, maxBonus - bonus));

    return {
      id: rule.id,
      name: rule.name,
      plan,
      fact,
      completion,
      coefficient,
      bonus,
      maxBonus,
      loss,
      potentialPlus: loss,
    };
  });

  return {
    items,
    bonus: roundMoney(items.reduce((s, i) => s + i.bonus, 0)),
    maxBonus: roundMoney(items.reduce((s, i) => s + i.maxBonus, 0)),
    loss: roundMoney(items.reduce((s, i) => s + i.loss, 0)),
    potentialPlus: roundMoney(items.reduce((s, i) => s + i.potentialPlus, 0)),
  };
}

/**
 * Чёрный список — по пустой конфигурации blackListRules.
 */
function calculateBlackListPenalties(monthData) {
  if (!blackListRules.length) {
    return {
      items: [],
      totalPenalty: 0,
    };
  }

  const items = blackListRules.map((rule) => {
    const data = monthData.blackList?.[rule.id] || {};
    const violated = Boolean(data.violated);
    const penalty = violated ? (Number(rule.penalty) || 0) : 0;

    return {
      id: rule.id,
      name: rule.name,
      description: rule.description || '',
      violated,
      penalty,
      impact: rule.impact || '',
    };
  });

  return {
    items,
    totalPenalty: items.reduce((s, i) => s + i.penalty, 0),
  };
}

/**
 * Итоговый расчёт зарплаты.
 */
function calculateTotalSalary(monthData, year, month) {
  const grade = getGrade(monthData.grade);
  const fixedSalary = getFixedSalary(monthData.grade);
  const sales = calculateSalesBonus(monthData, month);
  const economy = calculateEconomyKpi(monthData);
  const administrative = calculateAdministrativeBonus(monthData);
  const operator = calculateOperatorBonus(monthData);
  const blackList = calculateBlackListPenalties(monthData);

  const totalBonus = roundMoney(
    sales.total +
      economy.bonus +
      administrative.bonus +
      operator.bonus
  );

  const totalPenalties = roundMoney(blackList.totalPenalty);

  const totalPay = roundMoney(fixedSalary + totalBonus - totalPenalties);

  const maxSalary = roundMoney(
    fixedSalary +
      sales.maxBonus +
      economy.maxBonus +
      administrative.maxBonus +
      operator.maxBonus
  );

  const totalLoss = roundMoney(
    sales.maxBonus -
      sales.total +
      economy.loss +
      administrative.loss +
      operator.loss +
      totalPenalties
  );

  const potentialExtra = roundMoney(Math.max(0, maxSalary - totalPay));

  return {
    grade,
    fixedSalary,
    rate: grade.salary,
    allowance: grade.allowance,
    sales,
    economy,
    administrative,
    operator,
    blackList,
    totalBonus,
    totalPenalties,
    totalPay,
    maxSalary,
    totalLoss,
    potentialExtra,
    year,
    month,
  };
}

function formatCoeff(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatMoney(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

function formatPercent(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;
}

function formatNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/** Экспорт для автотестов в консоли. */
function runSelfChecks() {
  const results = [];
  const check = (name, actual, expected) => {
    const ok = Math.abs(actual - expected) < 0.0001;
    results.push({ name, actual, expected, ok });
    return ok;
  };

  check('Оклад Грейд 3', getFixedSalary('grade3'), 25000);
  check('Оклад Грейд 2', getFixedSalary('grade2'), 28000);
  check('Оклад Грейд 1', getFixedSalary('grade1'), 31000);
  check('Оклад Флагман', getFixedSalary('flagman'), 34000);

  check('Кредиты 95%', getCreditCoefficient(95), 0.8);
  check('Кредиты 100%', getCreditCoefficient(100), 1.0);
  check('Кредиты 105%', getCreditCoefficient(105), 1.0);
  check('Кредиты 109.9%', getCreditCoefficient(109.9), 1.0);
  check('Кредиты 110%', getCreditCoefficient(110), 1.1);
  check('Кредиты 120%', getCreditCoefficient(120), 1.1);

  check('Аттачмент 2.0', getAttachmentCoefficient(2.0), 0.8);
  check('Аттачмент 2.29', getAttachmentCoefficient(2.29), 0.8);
  check('Аттачмент 2.3', getAttachmentCoefficient(2.3), 1.0);
  check('Аттачмент 3.0', getAttachmentCoefficient(3.0), 1.0);
  check('Аттачмент 3.59', getAttachmentCoefficient(3.59), 1.0);
  check('Аттачмент 3.6', getAttachmentCoefficient(3.6), 1.1);
  check('Аттачмент 4.0', getAttachmentCoefficient(4.0), 1.1);

  check('Эфф. 70%', getEfficiencyCoefficient(70), 0);
  check('Эфф. 75%', getEfficiencyCoefficient(75), 0.75);
  check('Эфф. 80%', getEfficiencyCoefficient(80), 0.75);
  check('Эфф. 84.9%', getEfficiencyCoefficient(84.9), 0.75);
  check('Эфф. 85%', getEfficiencyCoefficient(85), 0.85);
  check('Эфф. 90%', getEfficiencyCoefficient(90), 0.9);
  check('Эфф. 100%', getEfficiencyCoefficient(100), 1.0);
  check('Эфф. 119.9%', getEfficiencyCoefficient(119.9), 1.199);
  check('Эфф. 120%', getEfficiencyCoefficient(120), 1.2);
  check('Эфф. 150%', getEfficiencyCoefficient(150), 1.2);

  // Экономика: Грейд 1, телефоны 6000 × 1.1 × 0.90 = 5940
  const phones = 6000 * 1.1 * 0.9;
  check('Телефоны пример', phones, 5940);

  // Аксессуары: 8500 × 1.1 × 0.90 = 8415
  const acc = 8500 * 1.1 * 0.9;
  check('Аксессуары пример', acc, 8415);

  // Комбо: 3 × 2000 = 6000
  const combo = calculateComboBonus(5, 3);
  check('Комбо бонус', combo.bonus, 6000);
  check('Комбо не выполнили', combo.salonsNotDone, 2);

  // Сезонность
  check('Сезонность январь', getSeasonalityCoefficient(1), 1.1);
  check('Сезонность июнь', getSeasonalityCoefficient(6), 1.1);
  check('Сезонность июль', getSeasonalityCoefficient(7), 0.9);
  check('Сезонность декабрь', getSeasonalityCoefficient(12), 0.9);

  // Лимит продаж
  const capped = Math.min(9000, 10000);
  check('Лимит продаж 10000→9000', capped, 9000);

  const failed = results.filter((r) => !r.ok);
  console.group('RTT Calculator self-checks');
  results.forEach((r) => {
    console[r.ok ? 'log' : 'error'](
      `${r.ok ? '✓' : '✗'} ${r.name}: ${r.actual} (ожидалось ${r.expected})`
    );
  });
  console.log(failed.length ? `Ошибок: ${failed.length}` : 'Все проверки пройдены');
  console.groupEnd();
  return results;
}
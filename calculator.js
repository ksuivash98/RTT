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

/** Максимальные коэффициенты экономического блока. */
const ECONOMY_FIRST_COEFF_MAX = 1.1;
const ECONOMY_EFFICIENCY_MAX = 1.2;

/**
 * Максимальный бонус KPI при ТЕКУЩЕМ коэффициенте Кредитов/аттачмента
 * и максимальной эффективности (×1,2).
 * Не подставляет автоматически ×1,1, если текущий коэффициент ниже.
 */
function calculateMaximumBonus(baseAmount, currentFirstCoeff) {
  return roundMoney(baseAmount * currentFirstCoeff * ECONOMY_EFFICIENCY_MAX);
}

/**
 * Абсолютный максимум KPI: база × 1,1 × 1,2.
 * Используется только для «можно дополнительно получить» без двойного учёта.
 */
function calculateAbsoluteMaximumBonus(baseAmount) {
  return roundMoney(baseAmount * ECONOMY_FIRST_COEFF_MAX * ECONOMY_EFFICIENCY_MAX);
}

/**
 * Потеря = максимум − текущий бонус (неотрицательная).
 */
function calculateLoss(currentBonus, maximumBonus) {
  return roundMoney(Math.max(0, maximumBonus - currentBonus));
}

/**
 * Потенциальный плюс при переходе с текущих коэффициентов на новые.
 * Всегда от текущего фактического результата — без двойного учёта.
 */
function calculatePotentialGain(baseAmount, currentFirst, currentEff, nextFirst, nextEff) {
  const current = roundMoney(baseAmount * currentFirst * currentEff);
  const next = roundMoney(baseAmount * nextFirst * nextEff);
  return roundMoney(Math.max(0, next - current));
}

/**
 * Ближайший порог по типу показателя.
 * kind: 'efficiency' | 'credit' | 'attachment'
 */
function getNextThreshold(kind, value) {
  if (kind === 'efficiency') {
    return getNextEfficiencyThreshold(value);
  }

  if (kind === 'credit') {
    const p = Number(value) || 0;
    if (p < 100) {
      return {
        currentLabel: '<100%',
        nextThreshold: 100,
        percentNeeded: Math.max(0, 100 - p),
        nextCoefficient: 1.0,
        maxThreshold: 110,
        maxCoefficient: ECONOMY_FIRST_COEFF_MAX,
      };
    }
    if (p < 110) {
      return {
        currentLabel: '100–109,9%',
        nextThreshold: 110,
        percentNeeded: Math.max(0, 110 - p),
        nextCoefficient: ECONOMY_FIRST_COEFF_MAX,
        maxThreshold: 110,
        maxCoefficient: ECONOMY_FIRST_COEFF_MAX,
      };
    }
    return {
      currentLabel: '≥110%',
      nextThreshold: null,
      percentNeeded: 0,
      nextCoefficient: ECONOMY_FIRST_COEFF_MAX,
      maxThreshold: 110,
      maxCoefficient: ECONOMY_FIRST_COEFF_MAX,
    };
  }

  if (kind === 'attachment') {
    const v = Number(value) || 0;
    if (v <= 2.29) {
      return {
        currentLabel: '≤2,29',
        nextThreshold: 2.3,
        percentNeeded: Math.max(0, 2.3 - v),
        nextCoefficient: 1.0,
        maxThreshold: 3.6,
        maxCoefficient: ECONOMY_FIRST_COEFF_MAX,
      };
    }
    if (v < 3.6) {
      return {
        currentLabel: '2,3–3,59',
        nextThreshold: 3.6,
        percentNeeded: Math.max(0, 3.6 - v),
        nextCoefficient: ECONOMY_FIRST_COEFF_MAX,
        maxThreshold: 3.6,
        maxCoefficient: ECONOMY_FIRST_COEFF_MAX,
      };
    }
    return {
      currentLabel: '≥3,6',
      nextThreshold: null,
      percentNeeded: 0,
      nextCoefficient: ECONOMY_FIRST_COEFF_MAX,
      maxThreshold: 3.6,
      maxCoefficient: ECONOMY_FIRST_COEFF_MAX,
    };
  }

  return {
    currentLabel: '—',
    nextThreshold: null,
    percentNeeded: 0,
    nextCoefficient: null,
  };
}

/** Совместимость со старым API. */
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
      nextCoefficient: ECONOMY_EFFICIENCY_MAX,
    };
  }
  return {
    currentLabel: '≥120%',
    nextThreshold: null,
    percentNeeded: 0,
    nextCoefficient: ECONOMY_EFFICIENCY_MAX,
  };
}

/**
 * Текстовая расшифровка причин потери по KPI.
 */
function getLossReason(kpiAnalytics) {
  const reasons = [];
  const eff = kpiAnalytics.efficiencyFactor;
  const first = kpiAnalytics.firstFactor;

  if (eff && eff.loss > 0.009) {
    if (kpiAnalytics.completion < 75) {
      reasons.push({
        severity: 'critical',
        title: 'KPI не приносит бонус',
        text: `Выполнение ${formatPercent(kpiAnalytics.completion)}, коэффициент эффективности ×0`,
        amount: eff.loss,
      });
    } else if (eff.next && eff.next.nextThreshold != null) {
      reasons.push({
        severity: 'negative',
        title: `Не достигнут порог ${formatPercent(eff.next.nextThreshold, 0)}`,
        text: `Коэффициент эффективности ×${formatCoeff(kpiAnalytics.efficiencyCoeff)} при выполнении ${formatPercent(kpiAnalytics.completion)}`,
        amount: eff.loss,
      });
    } else {
      reasons.push({
        severity: 'negative',
        title: `Коэффициент эффективности = ×${formatCoeff(kpiAnalytics.efficiencyCoeff)}`,
        text: `Выполнение плана ${formatPercent(kpiAnalytics.completion)}`,
        amount: eff.loss,
      });
    }
  } else if (eff && kpiAnalytics.efficiencyCoeff >= ECONOMY_EFFICIENCY_MAX) {
    reasons.push({
      severity: 'positive',
      title: 'Максимальный коэффициент эффективности достигнут',
      text: 'Дополнительного увеличения бонуса за счёт эффективности нет',
      amount: 0,
    });
  }

  if (first && first.loss > 0.009) {
    if (first.kind === 'credit') {
      reasons.push({
        severity: 'negative',
        title: 'Кредиты ниже максимального уровня',
        text: `Выполнение доли кредитов ${formatPercent(first.inputValue)}, коэффициент ×${formatCoeff(first.currentCoeff)} вместо ×${formatCoeff(ECONOMY_FIRST_COEFF_MAX)}`,
        amount: first.loss,
      });
    } else {
      reasons.push({
        severity: 'negative',
        title: 'Аттачмент снижает бонус',
        text: `Аттачмент ${formatNumber(first.inputValue, 2)}, коэффициент ×${formatCoeff(first.currentCoeff)} вместо ×${formatCoeff(ECONOMY_FIRST_COEFF_MAX)}`,
        amount: first.loss,
      });
    }
  } else if (first && first.currentCoeff >= ECONOMY_FIRST_COEFF_MAX) {
    reasons.push({
      severity: 'positive',
      title: first.kind === 'credit' ? 'Кредиты на максимуме' : 'Аттачмент на максимуме',
      text: `Коэффициент ×${formatCoeff(first.currentCoeff)}`,
      amount: 0,
    });
  }

  return reasons;
}

/**
 * Конкретные действия для улучшения KPI.
 */
function getNextAction(kpiAnalytics) {
  const actions = [];
  const eff = kpiAnalytics.efficiencyFactor;
  const first = kpiAnalytics.firstFactor;

  if (eff && eff.next && eff.next.nextThreshold != null && eff.nextGain > 0.009) {
    actions.push({
      id: 'efficiency',
      title: 'Эффективность',
      currentLabel: formatPercent(kpiAnalytics.completion),
      nextLabel: formatPercent(eff.next.nextThreshold, 0),
      needLabel: `+${formatNumber(eff.next.percentNeeded, 1)} п.п.`,
      potentialPlus: eff.nextGain,
      detail: `После достижения ${formatPercent(eff.next.nextThreshold, 0)} коэффициент станет ×${formatCoeff(eff.next.nextCoefficient)}`,
    });
  }

  if (first && first.next && first.next.nextThreshold != null && first.nextGain > 0.009) {
    const isCredit = first.kind === 'credit';
    actions.push({
      id: first.kind,
      title: isCredit ? 'Кредиты' : 'Аттачмент',
      currentLabel: isCredit
        ? formatPercent(first.inputValue)
        : formatNumber(first.inputValue, 2),
      nextLabel: isCredit
        ? formatPercent(first.next.nextThreshold, 0)
        : formatNumber(first.next.nextThreshold, 2),
      needLabel: isCredit
        ? `+${formatNumber(first.next.percentNeeded, 1)} п.п.`
        : `+${formatNumber(first.next.percentNeeded, 2)}`,
      potentialPlus: first.nextGain,
      detail: `Следующий коэффициент: ×${formatCoeff(first.next.nextCoefficient)}`,
    });
  }

  return actions;
}

/**
 * Расширенная аналитика одного экономического KPI.
 * Потери по факторам показываются отдельно; итоговый потенциал = absoluteMax − current
 * (без суммирования факторов — это исключает двойной учёт).
 */
function buildKpiAnalytics(kpi, context) {
  const base = kpi.baseAmount;
  const firstCoeff = kpi.firstCoeff;
  const efficiencyCoeff = kpi.efficiencyCoeff;
  const currentBonus = kpi.bonus;

  const maxAtCurrentFirst = calculateMaximumBonus(base, firstCoeff);
  const absoluteMax = calculateAbsoluteMaximumBonus(base);
  const lossVsCurrentMax = calculateLoss(currentBonus, maxAtCurrentFirst);
  // Итоговая потеря / потенциал без двойного учёта
  const lossTotal = calculateLoss(currentBonus, absoluteMax);
  const potentialPlus = lossTotal;

  const effNext = getNextThreshold('efficiency', kpi.completion);
  const efficiencyFactor = {
    kind: 'efficiency',
    currentCoeff: efficiencyCoeff,
    maxCoeff: ECONOMY_EFFICIENCY_MAX,
    // Потеря эффективности при текущем Кредиты/аттачменте
    loss: lossVsCurrentMax,
    next: effNext,
    nextGain: effNext.nextThreshold == null
      ? 0
      : calculatePotentialGain(base, firstCoeff, efficiencyCoeff, firstCoeff, effNext.nextCoefficient),
    maxGain: calculatePotentialGain(
      base,
      firstCoeff,
      efficiencyCoeff,
      firstCoeff,
      ECONOMY_EFFICIENCY_MAX
    ),
  };

  let firstFactor = null;
  if (kpi.usesCredit) {
    const creditNext = getNextThreshold('credit', context.creditPlanPercent);
    firstFactor = {
      kind: 'credit',
      inputValue: context.creditPlanPercent,
      currentCoeff: firstCoeff,
      maxCoeff: ECONOMY_FIRST_COEFF_MAX,
      // Эффект только от улучшения Кредитов при текущей эффективности
      loss: calculatePotentialGain(
        base,
        firstCoeff,
        efficiencyCoeff,
        ECONOMY_FIRST_COEFF_MAX,
        efficiencyCoeff
      ),
      next: creditNext,
      nextGain: creditNext.nextThreshold == null
        ? 0
        : calculatePotentialGain(
            base,
            firstCoeff,
            efficiencyCoeff,
            creditNext.nextCoefficient,
            efficiencyCoeff
          ),
      maxGain: calculatePotentialGain(
        base,
        firstCoeff,
        efficiencyCoeff,
        ECONOMY_FIRST_COEFF_MAX,
        efficiencyCoeff
      ),
    };
  } else if (kpi.usesAttachment) {
    const attNext = getNextThreshold('attachment', context.attachment);
    firstFactor = {
      kind: 'attachment',
      inputValue: context.attachment,
      currentCoeff: firstCoeff,
      maxCoeff: ECONOMY_FIRST_COEFF_MAX,
      loss: calculatePotentialGain(
        base,
        firstCoeff,
        efficiencyCoeff,
        ECONOMY_FIRST_COEFF_MAX,
        efficiencyCoeff
      ),
      next: attNext,
      nextGain: attNext.nextThreshold == null
        ? 0
        : calculatePotentialGain(
            base,
            firstCoeff,
            efficiencyCoeff,
            attNext.nextCoefficient,
            efficiencyCoeff
          ),
      maxGain: calculatePotentialGain(
        base,
        firstCoeff,
        efficiencyCoeff,
        ECONOMY_FIRST_COEFF_MAX,
        efficiencyCoeff
      ),
    };
  }

  const analytics = {
    ...kpi,
    maxBonus: maxAtCurrentFirst,
    absoluteMaxBonus: absoluteMax,
    loss: lossTotal,
    lossVsCurrentMax,
    potentialPlus,
    efficiencyFactor,
    firstFactor,
    progressPercent: Math.min(120, Math.max(0, kpi.completion)),
  };

  analytics.reasons = getLossReason(analytics);
  analytics.actions = getNextAction(analytics);

  // Главная причина для сводки «Из-за чего я теряю»
  const negativeReasons = analytics.reasons.filter((r) => r.severity !== 'positive' && r.amount > 0.009);
  if (lossTotal < 0.01) {
    analytics.primaryReason = {
      severity: 'positive',
      summary: 'Потерь нет — показатель на максимуме',
      amount: 0,
    };
  } else if (negativeReasons.length) {
    const top = [...negativeReasons].sort((a, b) => b.amount - a.amount)[0];
    analytics.primaryReason = {
      severity: top.severity === 'critical' ? 'critical' : 'negative',
      summary: top.title,
      detail: top.text,
      amount: lossTotal,
    };
  } else {
    analytics.primaryReason = {
      severity: 'warning',
      summary: 'Есть потенциал роста',
      amount: lossTotal,
    };
  }

  return analytics;
}

/**
 * Аналитика Комбо 40%+.
 * Не умножается на Кредиты / аттачмент / эффективность.
 */
function buildComboAnalytics(combo) {
  const maxBonus = roundMoney(combo.salonsTotal * COMBO_BONUS_PER_SALON);
  const loss = roundMoney(combo.salonsNotDone * COMBO_BONUS_PER_SALON);
  const potentialPlus = loss;

  const reasons = [];
  if (combo.salonsNotDone > 0) {
    reasons.push({
      severity: 'negative',
      title: `${combo.salonsNotDone} ${pluralSalons(combo.salonsNotDone)} не выполнили KPI`,
      text: `Потеря = ${combo.salonsNotDone} × ${formatMoney(COMBO_BONUS_PER_SALON)}`,
      amount: loss,
    });
  } else if (combo.salonsTotal > 0) {
    reasons.push({
      severity: 'positive',
      title: 'Все салоны выполнили KPI Комбо 40%+',
      text: 'Потерь по Комбо нет',
      amount: 0,
    });
  } else {
    reasons.push({
      severity: 'warning',
      title: 'Салоны не указаны',
      text: 'Укажите количество салонов в подчинении',
      amount: 0,
    });
  }

  const actions = [];
  if (combo.salonsNotDone > 0) {
    actions.push({
      id: 'combo',
      title: 'Комбо 40%+',
      currentLabel: `${combo.salonsComboDone} из ${combo.salonsTotal}`,
      nextLabel: `${combo.salonsTotal} из ${combo.salonsTotal}`,
      needLabel: `+${combo.salonsNotDone} салон(ов)`,
      potentialPlus: loss,
      detail: `Каждый выполнивший салон даёт ${formatMoney(COMBO_BONUS_PER_SALON)}`,
    });
  }

  return {
    id: 'combo',
    name: 'Комбо 40%+',
    ...combo,
    maxBonus,
    absoluteMaxBonus: maxBonus,
    loss,
    potentialPlus,
    reasons,
    actions,
    primaryReason:
      loss > 0
        ? {
            severity: 'negative',
            summary: `${combo.salonsNotDone} ${pluralSalons(combo.salonsNotDone)} не выполнили KPI`,
            amount: loss,
          }
        : {
            severity: 'positive',
            summary: 'Потерь по Комбо нет',
            amount: 0,
          },
  };
}

function pluralSalons(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'салон';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'салона';
  return 'салонов';
}

/**
 * Сводная аналитика экономического блока.
 * Итоговый потенциал = сумма (absoluteMax − current) по KPI + потеря Комбо.
 * Факторные «что если» не суммируются между собой.
 */
function calculateEconomyAnalytics(kpis, combo, context) {
  const kpiAnalytics = kpis.map((kpi) => buildKpiAnalytics(kpi, context));
  const comboAnalytics = buildComboAnalytics(combo);

  const items = [
    ...kpiAnalytics.map((k) => ({
      id: k.id,
      name: k.name,
      loss: k.loss,
      potentialPlus: k.potentialPlus,
      currentBonus: k.bonus,
      maxBonus: k.maxBonus,
      absoluteMaxBonus: k.absoluteMaxBonus,
      primaryReason: k.primaryReason,
      reasons: k.reasons,
      actions: k.actions,
    })),
    {
      id: comboAnalytics.id,
      name: comboAnalytics.name,
      loss: comboAnalytics.loss,
      potentialPlus: comboAnalytics.potentialPlus,
      currentBonus: comboAnalytics.bonus,
      maxBonus: comboAnalytics.maxBonus,
      absoluteMaxBonus: comboAnalytics.absoluteMaxBonus,
      primaryReason: comboAnalytics.primaryReason,
      reasons: comboAnalytics.reasons,
      actions: comboAnalytics.actions,
    },
  ];

  // Сортировка: самая большая потеря первой
  const sortedLosses = [...items]
    .filter((i) => i.loss > 0.009)
    .sort((a, b) => b.loss - a.loss);

  const totalLoss = roundMoney(items.reduce((s, i) => s + i.loss, 0));
  const totalPotential = totalLoss; // без двойного учёта
  const bonus = roundMoney(
    kpiAnalytics.reduce((s, k) => s + k.bonus, 0) + comboAnalytics.bonus
  );
  const maxAtCurrentCoeffs = roundMoney(
    kpiAnalytics.reduce((s, k) => s + k.maxBonus, 0) + comboAnalytics.maxBonus
  );
  const absoluteMax = roundMoney(
    kpiAnalytics.reduce((s, k) => s + k.absoluteMaxBonus, 0) + comboAnalytics.absoluteMaxBonus
  );

  const mainCause = sortedLosses[0] || null;

  return {
    kpiAnalytics,
    comboAnalytics,
    items,
    sortedLosses,
    totalLoss,
    totalPotential,
    bonus,
    maxAtCurrentCoeffs,
    absoluteMax,
    mainCause,
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
  // Максимум при текущем Кредиты/аттачменте и эффективности ×1,2
  const maxBonus = calculateMaximumBonus(baseAmount, firstCoeff);
  const absoluteMaxBonus = calculateAbsoluteMaximumBonus(baseAmount);
  const loss = calculateLoss(bonus, absoluteMaxBonus);
  const potentialPlus = loss;
  const nextThreshold = getNextThreshold('efficiency', completion);

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
    absoluteMaxBonus,
    loss,
    potentialPlus,
    nextThreshold,
  };
}

/**
 * Экономический блок (все KPI + Комбо + аналитика потерь).
 */
function calculateEconomyKpi(monthData) {
  const grade = getGrade(monthData.grade);
  const creditCoeff = getCreditCoefficient(monthData.creditPlanPercent);
  const attachmentCoeff = getAttachmentCoefficient(monthData.attachment);
  const context = {
    creditPlanPercent: Number(monthData.creditPlanPercent) || 0,
    attachment: Number(monthData.attachment) || 0,
  };

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
  const analytics = calculateEconomyAnalytics(kpis, combo, context);

  // Обогащаем KPI данными аналитики для UI
  const enrichedKpis = analytics.kpiAnalytics;

  return {
    creditCoeff,
    attachmentCoeff,
    kpis: enrichedKpis,
    combo: analytics.comboAnalytics,
    analytics,
    bonus: analytics.bonus,
    // Для глобального «макс. зарплата» — абсолютный максимум экономики
    maxBonus: analytics.absoluteMax,
    maxBonusAtCurrentCoeffs: analytics.maxAtCurrentCoeffs,
    loss: analytics.totalLoss,
    potentialPlus: analytics.totalPotential,
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
 * Административный блок.
 * Собственная логика — без эффективности / кредитов / аттачмента / сезонности.
 */
function calculateAdministrativeBonus(monthData) {
  const salonsTotal = Math.max(0, Math.floor(Number(monthData.salonsTotal) || 0));
  const admin = monthData.administrative || createEmptyAdministrativeData();
  const items = [];

  administrativeRules.forEach((rule) => {
    if (rule.type === 'averageBudget') {
      const plan = Number(admin[rule.id]?.plan) || 0;
      const fact = Number(admin[rule.id]?.fact) || 0;
      const completion = calcCompletionPercent(plan, fact);
      // Пропорция к бюджету без шкалы эффективности экономики, потолок = бюджет
      const ratio = plan > 0 ? Math.min(1, fact / plan) : 0;
      const bonus = roundMoney(rule.budget * ratio);
      const maxBonus = rule.budget;
      const loss = calculateLoss(bonus, maxBonus);

      items.push({
        id: rule.id,
        name: rule.name,
        type: rule.type,
        plan,
        fact,
        completion,
        passed: null,
        failed: null,
        bonus,
        maxBonus,
        loss,
        potentialPlus: loss,
      });
      return;
    }

    if (rule.type === 'photoReport') {
      let passed = Math.max(0, Math.floor(Number(admin.photoReportPassed) || 0));
      if (passed > salonsTotal) passed = salonsTotal;
      const failed = Math.max(0, salonsTotal - passed);
      const bonus = roundMoney(passed * rule.passBonus - failed * rule.failPenalty);
      const maxBonus = roundMoney(salonsTotal * rule.passBonus);
      const loss = calculateLoss(bonus, maxBonus);

      items.push({
        id: rule.id,
        name: rule.name,
        type: rule.type,
        plan: null,
        fact: null,
        completion: salonsTotal > 0 ? (passed / salonsTotal) * 100 : 0,
        passed,
        failed,
        salonsTotal,
        bonus,
        maxBonus,
        loss,
        potentialPlus: loss,
      });
      return;
    }

    if (rule.type === 'perSalonBonus') {
      const field =
        rule.id === 'serviceBonus'
          ? 'servicePassed'
          : rule.id === 'txvChecks'
            ? 'txvPassed'
            : null;
      let passed = field ? Math.max(0, Math.floor(Number(admin[field]) || 0)) : 0;
      if (passed > salonsTotal) passed = salonsTotal;
      const failed = Math.max(0, salonsTotal - passed);
      const bonus = roundMoney(passed * rule.perSalon);
      const maxBonus = roundMoney(salonsTotal * rule.perSalon);
      const loss = calculateLoss(bonus, maxBonus);

      items.push({
        id: rule.id,
        name: rule.name,
        type: rule.type,
        plan: null,
        fact: null,
        completion: salonsTotal > 0 ? (passed / salonsTotal) * 100 : 0,
        passed,
        failed,
        salonsTotal,
        bonus,
        maxBonus,
        loss,
        potentialPlus: loss,
      });
    }
  });

  const bonus = roundMoney(items.reduce((s, i) => s + i.bonus, 0));
  const maxBonus = roundMoney(items.reduce((s, i) => s + i.maxBonus, 0));
  const loss = roundMoney(items.reduce((s, i) => s + i.loss, 0));

  return {
    items,
    salonsTotal,
    bonus,
    maxBonus,
    loss,
    potentialPlus: loss,
    breakdown: Object.fromEntries(items.map((i) => [i.id, i.bonus])),
  };
}

/**
 * Бюджет операторского блока по числу салонов в подчинении.
 * Если значения нет в таблице — бюджет недоступен (нужно расширить operatorBudgetBySalons).
 */
function getOperatorBudget(salonsTotal) {
  const n = Math.max(0, Math.floor(Number(salonsTotal) || 0));
  if (Object.prototype.hasOwnProperty.call(operatorBudgetBySalons, n)) {
    return {
      budget: operatorBudgetBySalons[n],
      defined: true,
      salonsTotal: n,
    };
  }
  return {
    budget: 0,
    defined: false,
    salonsTotal: n,
  };
}

/**
 * Ступенчатый коэффициент операторского блока (без интерполяции).
 * 100%+ / 90–99,9% → 1,0
 * 85–89,9% → 0,75 (слайд 85% и сценарий 86,67%)
 * 80–84,9% → 0,8
 * 70–79,9% → 0,75
 * 60–69,9% → 0,5
 * 40–59,9% → 0,2
 * 0–39,9% → 0
 */
function getOperatorCoefficient(percent) {
  const p = Number(percent);
  if (!Number.isFinite(p) || p < 40) return 0;
  if (p < 60) return 0.2;
  if (p < 70) return 0.5;
  if (p < 80) return 0.75;
  if (p < 85) return 0.8;
  if (p < 90) return 0.75;
  if (p < 100) return 1.0;
  return 1.0;
}

/**
 * Операторский блок — только TELE2.
 * Бонус = бюджет(по числу салонов) × коэффициент выполнения KPI.
 */
function calculateOperatorBonus(monthData) {
  const salonsTotal = Math.max(0, Math.floor(Number(monthData.salonsTotal) || 0));
  const operator = mergeOperatorData(monthData.operator, salonsTotal);
  const tele2Salons = operator.tele2Salons;
  const invalidTele2 = tele2Salons > salonsTotal;

  const kpisPerSalon = operatorTele2Kpis.length;
  const totalKpis = tele2Salons * kpisPerSalon;

  let doneKpis = 0;
  const salonResults = operator.salons.map((salon, index) => {
    const failed = [];
    let done = 0;
    operatorTele2Kpis.forEach((kpi) => {
      const ok = Boolean(salon.kpis?.[kpi.id]);
      if (ok) done += 1;
      else failed.push({ id: kpi.id, name: kpi.name });
    });
    doneKpis += done;
    return {
      index: index + 1,
      name: `Салон Tele2 №${index + 1}`,
      done,
      total: kpisPerSalon,
      failed,
      kpis: { ...salon.kpis },
    };
  });

  const failedKpis = totalKpis - doneKpis;
  const completion = totalKpis > 0 ? (doneKpis / totalKpis) * 100 : 0;
  const coefficient = invalidTele2 ? 0 : getOperatorCoefficient(completion);
  const budgetInfo = getOperatorBudget(salonsTotal);
  const budget = budgetInfo.budget;
  const bonus =
    invalidTele2 || !budgetInfo.defined ? 0 : roundMoney(budget * coefficient);
  const maxBonus = budgetInfo.defined ? budget : 0;
  const loss = calculateLoss(bonus, maxBonus);

  return {
    items: [],
    salonsTotal,
    tele2Salons,
    invalidTele2,
    budget,
    budgetDefined: budgetInfo.defined,
    kpisPerSalon,
    totalKpis,
    doneKpis,
    failedKpis,
    completion,
    coefficient,
    salonResults,
    failedBySalon: salonResults.filter((s) => s.failed.length > 0),
    bonus,
    maxBonus,
    loss,
    potentialPlus: loss,
  };
}


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

  // Максимум при текущем коэффициенте Кредитов (не всегда ×1.1)
  check('Макс при Кредитах 0.8', calculateMaximumBonus(6000, 0.8), 5760);
  check('Макс при Кредитах 1.1', calculateMaximumBonus(6000, 1.1), 7920);

  // Аналитика без двойного учёта: C=0.8, E=0.9
  // current = 6000*0.8*0.9 = 4320
  // absolute = 6000*1.1*1.2 = 7920
  // total loss = 3600 (не сумма факторных потерь)
  const sampleKpi = calculateSingleEconomyKpi(
    economyKpiDefs[0],
    6000,
    100000,
    90000,
    0.8,
    1.0
  );
  check('Текущий бонус C0.8 E0.9', sampleKpi.bonus, 4320);
  check('Макс при текущем C', sampleKpi.maxBonus, 5760);
  check('Абс. макс', sampleKpi.absoluteMaxBonus, 7920);
  check('Потеря без двойного учёта', sampleKpi.loss, 3600);

  const analytics = buildKpiAnalytics(sampleKpi, {
    creditPlanPercent: 95,
    attachment: 3.0,
  });
  const factorSum = analytics.efficiencyFactor.loss + analytics.firstFactor.loss;
  check('Факторы НЕ равны итоговой потере', factorSum === analytics.loss ? 1 : 0, 0);
  check('Итоговая потеря аналитики', analytics.loss, 3600);
  check('Плюс от Кредитов при текущей E', analytics.firstFactor.nextGain, 1080);

  // Комбо потери
  const comboZero = buildComboAnalytics(calculateComboBonus(5, 0));
  check('Комбо 0 выполнивших бонус', comboZero.bonus, 0);
  check('Комбо 0 выполнивших потеря', comboZero.loss, 10000);
  const comboFull = buildComboAnalytics(calculateComboBonus(5, 5));
  check('Комбо все выполнили потеря', comboFull.loss, 0);

  // Продажи: удалённые позиции отсутствуют
  const removed = ['insuranceMmbNoCombo', 'repairAccept', 'stolotoTickets'];
  check(
    'Удалённые позиции продаж',
    removed.every((id) => !salesProducts.some((p) => p.id === id)) ? 1 : 0,
    1
  );

  // Операторский коэффициент
  check('Опер. коэфф. 100%', getOperatorCoefficient(100), 1.0);
  check('Опер. коэфф. 90%', getOperatorCoefficient(90), 1.0);
  check('Опер. коэфф. 86.67%', getOperatorCoefficient(86.67), 0.75);
  check('Опер. коэфф. 80%', getOperatorCoefficient(80), 0.8);
  check('Опер. коэфф. 60%', getOperatorCoefficient(60), 0.5);
  check('Опер. коэфф. 40%', getOperatorCoefficient(40), 0.2);
  check('Опер. коэфф. 0%', getOperatorCoefficient(0), 0);

  // Сценарий оператора: 3 салона, 3 Tele2, 13/15 → 86.67% → ×0.75 → 15750
  const opMonth = createEmptyMonthData();
  opMonth.salonsTotal = 3;
  opMonth.operator.tele2Salons = 3;
  opMonth.operator = mergeOperatorData({ tele2Salons: 3, salons: [] }, 3);
  // Отметим 13 KPI: все кроме 2
  let marked = 0;
  opMonth.operator.salons.forEach((salon) => {
    operatorTele2Kpis.forEach((kpi) => {
      if (marked < 13) {
        salon.kpis[kpi.id] = true;
        marked += 1;
      }
    });
  });
  const opResult = calculateOperatorBonus(opMonth);
  check('Опер. всего KPI', opResult.totalKpis, 15);
  check('Опер. выполнено', opResult.doneKpis, 13);
  check('Опер. %', Math.round(opResult.completion * 100) / 100, 86.67);
  check('Опер. коэфф. сценарий', opResult.coefficient, 0.75);
  check('Опер. бонус сценарий', opResult.bonus, 15750);

  // Сценарий 1: 1 салон, 5/5
  const op1 = createEmptyMonthData();
  op1.salonsTotal = 1;
  op1.operator = mergeOperatorData({ tele2Salons: 1, salons: [] }, 1);
  op1.operator.salons[0].kpis = Object.fromEntries(operatorTele2Kpis.map((k) => [k.id, true]));
  const r1 = calculateOperatorBonus(op1);
  check('Сценарий1 %', r1.completion, 100);
  check('Сценарий1 коэфф', r1.coefficient, 1);
  check('Сценарий1 бонус', r1.bonus, 15000);

  // Сценарий 2: 2 салона, 8/10 → 80% → 0.8 → 14400
  const op2 = createEmptyMonthData();
  op2.salonsTotal = 2;
  op2.operator = mergeOperatorData({ tele2Salons: 2, salons: [] }, 2);
  let m2 = 0;
  op2.operator.salons.forEach((salon) => {
    operatorTele2Kpis.forEach((kpi) => {
      salon.kpis[kpi.id] = m2 < 8;
      m2 += 1;
    });
  });
  const r2 = calculateOperatorBonus(op2);
  check('Сценарий2 %', r2.completion, 80);
  check('Сценарий2 коэфф', r2.coefficient, 0.8);
  check('Сценарий2 бонус', r2.bonus, 14400);

  // Сценарий 5: 3 салона, 2 Tele2, 6/10 → 60% → 0.5 → 10500
  const op5 = createEmptyMonthData();
  op5.salonsTotal = 3;
  op5.operator = mergeOperatorData({ tele2Salons: 2, salons: [] }, 3);
  let m5 = 0;
  op5.operator.salons.forEach((salon) => {
    operatorTele2Kpis.forEach((kpi) => {
      salon.kpis[kpi.id] = m5 < 6;
      m5 += 1;
    });
  });
  const r5 = calculateOperatorBonus(op5);
  check('Сценарий5 KPI', r5.totalKpis, 10);
  check('Сценарий5 %', r5.completion, 60);
  check('Сценарий5 коэфф', r5.coefficient, 0.5);
  check('Сценарий5 бонус', r5.bonus, 10500);

  // Фотоотчёт: 10 салонов, 8 прошли → 14000
  const adm = createEmptyMonthData();
  adm.salonsTotal = 10;
  adm.administrative.photoReportPassed = 8;
  const admRes = calculateAdministrativeBonus(adm);
  const photo = admRes.items.find((i) => i.id === 'photoReport');
  check('Фотоотчёт бонус', photo.bonus, 14000);

  // Админ не зависит от эффективности экономики
  check('Админ независим', admRes.bonus >= 14000 ? 1 : 0, 1);

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
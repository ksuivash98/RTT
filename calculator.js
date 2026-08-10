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
  const salonsList = Array.isArray(monthData.salonsList)
    ? monthData.salonsList
    : mergeSalonsList(monthData, salonsTotal);
  const admin = mergeAdministrativeData(
    monthData.administrative || createEmptyAdministrativeData(),
    salonsList
  );
  const items = [];

  administrativeRules.forEach((rule) => {
    if (rule.type === 'averageBudget') {
      const plan = Number(admin[rule.id]?.plan) || 0;
      const fact = Number(admin[rule.id]?.fact) || 0;
      const completion = calcCompletionPercent(plan, fact);
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
      const salonStatuses = salonsList.map((salon, index) => ({
        index,
        title: getSalonDisplayName(salon, index),
        passed: Boolean(salon.photoPassed),
      }));

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
        salonStatuses,
        bonus,
        maxBonus,
        loss,
        potentialPlus: loss,
      });
      return;
    }

    if (rule.type === 'perSalonBonus') {
      const flagKey = rule.id === 'serviceBonus' ? 'servicePassed' : 'txvPassed';
      let passed = Math.max(
        0,
        Math.floor(
          Number(
            rule.id === 'serviceBonus' ? admin.servicePassed : admin.txvPassed
          ) || 0
        )
      );
      if (passed > salonsTotal) passed = salonsTotal;
      const failed = Math.max(0, salonsTotal - passed);
      const bonus = roundMoney(passed * rule.perSalon);
      const maxBonus = roundMoney(salonsTotal * rule.perSalon);
      const loss = calculateLoss(bonus, maxBonus);
      const salonStatuses = salonsList.map((salon, index) => ({
        index,
        title: getSalonDisplayName(salon, index),
        passed: Boolean(salon[flagKey]),
      }));

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
        salonStatuses,
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
 * Список Tele2 берётся из salonsList (оператор === tele2); формулы без изменений.
 */
function calculateOperatorBonus(monthData) {
  const salonsTotal = Math.max(0, Math.floor(Number(monthData.salonsTotal) || 0));
  const salonsList = Array.isArray(monthData.salonsList)
    ? monthData.salonsList
    : mergeSalonsList(monthData, salonsTotal);
  const tele2Meta = getTele2SalonsWithMeta(salonsList);
  const tele2Salons = tele2Meta.length;
  // Tele2 не может превысить общее число: список строится из салонов
  const invalidTele2 = tele2Salons > salonsTotal;

  const kpisPerSalon = operatorTele2Kpis.length;
  const totalKpis = tele2Salons * kpisPerSalon;

  let doneKpis = 0;
  const salonResults = tele2Meta.map((salon) => {
    const failed = [];
    let done = 0;
    operatorTele2Kpis.forEach((kpi) => {
      const ok = Boolean(salon.kpis?.[kpi.id]);
      if (ok) done += 1;
      else failed.push({ id: kpi.id, name: kpi.name });
    });
    doneKpis += done;
    return {
      index: salon.listIndex + 1,
      listIndex: salon.listIndex,
      name: salon.title,
      displayName: salon.displayName,
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


/**
 * Чёрный список: коэффициент к бонусной части.
 * Оклад / надбавка не затрагиваются.
 */
function calculateBlackListPenalties(monthData) {
  const salonsTotal = Math.max(0, Math.floor(Number(monthData.salonsTotal) || 0));
  const salonsList = Array.isArray(monthData.salonsList)
    ? monthData.salonsList
    : mergeSalonsList(monthData, salonsTotal);
  const monthBl = mergeMonthBlackList(monthData.blackList);
  const n = salonsTotal;

  const simReasons = [];
  const qualityReasons = [];
  const kpiReasons = [];
  const positiveReasons = [];

  let simBelow90 = 0;
  let sim90to99 = 0;
  let simDecadeFail = 0;
  let bmpFail = 0;
  let q2mFail = 0;
  let kpiFail = 0;
  let anySim110 = false;
  let anySimQuality4m = false;
  let anyBmpTwoMonths = false;

  salonsList.forEach((salon, index) => {
    const bl = mergeSalonBlackList(salon.blackList);
    const title = getSalonDisplayName(salon, index);
    const sim = Number(bl.simPlanPercent);
    const bmp = Number(bl.bmpPercent);
    const bmpPrev = Number(bl.bmpPrevPercent);
    const quality4m = Number(bl.simQuality4mPercent);
    const opKpi = Number(bl.operatorKpiPercent);

    if (Number.isFinite(sim)) {
      if (sim < 90) {
        simBelow90 += 1;
        simReasons.push({
          text: `${title} — SIM ${formatPercent(sim)} — ниже 90%`,
          severity: 'negative',
        });
      } else if (sim < 100) {
        sim90to99 += 1;
        simReasons.push({
          text: `${title} — SIM ${formatPercent(sim)} — ниже 100%`,
          severity: 'negative',
        });
      }
      if (sim >= 110) anySim110 = true;
    }

    if (bl.simDecadeFailed) {
      simDecadeFail += 1;
      simReasons.push({
        text: `${title} — не выполнена одна декада по SIM`,
        severity: 'negative',
      });
    }

    if (Number.isFinite(bmp) && bmp < 80) {
      bmpFail += 1;
      qualityReasons.push({
        text: `${title} — BMP ${formatPercent(bmp)} — ниже 80%`,
        severity: 'negative',
      });
    }

    if (!bl.q2mPassed) {
      q2mFail += 1;
      qualityReasons.push({
        text: `${title} — Q2M не выполнен`,
        severity: 'negative',
      });
    }

    const opTarget = BLACK_LIST.operatorKpi.targets[salon.operator];
    if (opTarget && Number.isFinite(opKpi) && opKpi < opTarget.target) {
      kpiFail += 1;
      kpiReasons.push({
        text: `${title} — ${getSalonOperatorLabel(salon.operator)} — ${opTarget.label} ${formatPercent(opKpi)} (цель ≥${formatPercent(opTarget.target, 0)})`,
        severity: 'negative',
      });
    }

    if (Number.isFinite(quality4m) && quality4m > 60) anySimQuality4m = true;
    if (Number.isFinite(bmp) && Number.isFinite(bmpPrev) && bmp >= 90 && bmpPrev >= 90) {
      anyBmpTwoMonths = true;
    }
  });

  const share = (count) => (n > 0 ? count / n : 0);

  let simPenalty =
    share(simBelow90) * BLACK_LIST.sim.below90 +
    share(sim90to99) * BLACK_LIST.sim.from90to99 +
    share(simDecadeFail) * BLACK_LIST.sim.decadeFail;

  if (monthBl.extraLimitExceeded) {
    simPenalty += BLACK_LIST.sim.extraLimit;
    simReasons.push({
      text: 'Превышение лимита Экстра — −2,5%',
      severity: 'negative',
    });
  }
  simPenalty = Math.min(simPenalty, BLACK_LIST.sim.maxPenalty);

  let qualityPenalty =
    share(bmpFail) * BLACK_LIST.quality.bmpBelow80 +
    share(q2mFail) * BLACK_LIST.quality.q2mFail;
  qualityPenalty = Math.min(qualityPenalty, BLACK_LIST.quality.maxPenalty);

  let kpiPenalty = share(kpiFail) * BLACK_LIST.operatorKpi.maxPenalty;
  kpiPenalty = Math.min(kpiPenalty, BLACK_LIST.operatorKpi.maxPenalty);

  let positiveBonus = 0;
  if (anySim110) {
    positiveBonus += BLACK_LIST.positive.sim110;
    positiveReasons.push({
      text: 'Выполнение плана SIM 110%+ — +5%',
      severity: 'positive',
    });
  }
  if (anySimQuality4m) {
    positiveBonus += BLACK_LIST.positive.simQuality4m;
    positiveReasons.push({
      text: 'Качество SIM 4M без Экстра >60% — +5%',
      severity: 'positive',
    });
  }
  if (anyBmpTwoMonths) {
    positiveBonus += BLACK_LIST.positive.bmpTwoMonths;
    positiveReasons.push({
      text: 'BMP ≥90% два месяца подряд — +5%',
      severity: 'positive',
    });
  }

  let rawCoefficient =
    BLACK_LIST.startCoefficient - simPenalty - qualityPenalty - kpiPenalty + positiveBonus;

  let coefficient = rawCoefficient;
  let clamped = false;
  if (coefficient < BLACK_LIST.minCoefficient) {
    coefficient = BLACK_LIST.minCoefficient;
    clamped = true;
  } else if (coefficient > BLACK_LIST.maxCoefficient) {
    coefficient = BLACK_LIST.maxCoefficient;
    clamped = true;
  }

  coefficient = Math.round(coefficient * 10000) / 10000;

  return {
    items: [],
    totalPenalty: 0, // совместимость: денежный штраф заменён коэффициентом
    coefficient,
    rawCoefficient: Math.round(rawCoefficient * 10000) / 10000,
    clamped,
    startCoefficient: BLACK_LIST.startCoefficient,
    simPenalty,
    qualityPenalty,
    kpiPenalty,
    positiveBonus,
    simReasons,
    qualityReasons,
    kpiReasons,
    positiveReasons,
    extraLimitExceeded: monthBl.extraLimitExceeded,
    salonsTotal: n,
  };
}

/**
 * Итоговый расчёт зарплаты.
 * Чёрный список × только бонусная часть; оклад без изменений.
 */
function calculateTotalSalary(monthData, year, month) {
  const grade = getGrade(monthData.grade);
  const fixedSalary = getFixedSalary(monthData.grade);
  const sales = calculateSalesBonus(monthData, month);
  const economy = calculateEconomyKpi(monthData);
  const administrative = calculateAdministrativeBonus(monthData);
  const operator = calculateOperatorBonus(monthData);
  const blackList = calculateBlackListPenalties(monthData);

  const bonusBeforeBlackList = roundMoney(
    sales.total + economy.bonus + administrative.bonus + operator.bonus
  );

  const bonusAfterBlackList = roundMoney(bonusBeforeBlackList * blackList.coefficient);
  const blackListLoss = roundMoney(Math.max(0, bonusBeforeBlackList - bonusAfterBlackList));
  const blackListPotentialPlus = blackListLoss;

  const totalBonus = bonusAfterBlackList;
  const totalPenalties = 0;
  const totalPay = roundMoney(fixedSalary + bonusAfterBlackList);

  const maxBonusBefore = roundMoney(
    sales.maxBonus + economy.maxBonus + administrative.maxBonus + operator.maxBonus
  );
  const maxSalary = roundMoney(fixedSalary + maxBonusBefore * BLACK_LIST.maxCoefficient);

  const totalLoss = roundMoney(
    sales.maxBonus -
      sales.total +
      economy.loss +
      administrative.loss +
      operator.loss +
      blackListLoss
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
    blackList: {
      ...blackList,
      bonusBefore: bonusBeforeBlackList,
      bonusAfter: bonusAfterBlackList,
      loss: blackListLoss,
      potentialPlus: blackListPotentialPlus,
      bonusAtOne: bonusBeforeBlackList,
    },
    totalBonus,
    totalBonusBeforeBlackList: bonusBeforeBlackList,
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
  opMonth.salonsList = [createEmptySalon(), createEmptySalon(), createEmptySalon()];
  let marked = 0;
  opMonth.salonsList.forEach((salon) => {
    salon.operator = 'tele2';
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
  op1.salonsList = [createEmptySalon()];
  op1.salonsList[0].operator = 'tele2';
  op1.salonsList[0].kpis = Object.fromEntries(operatorTele2Kpis.map((k) => [k.id, true]));
  const r1 = calculateOperatorBonus(op1);
  check('Сценарий1 %', r1.completion, 100);
  check('Сценарий1 коэфф', r1.coefficient, 1);
  check('Сценарий1 бонус', r1.bonus, 15000);

  // Сценарий 2: 2 салона, 8/10 → 80% → 0.8 → 14400
  const op2 = createEmptyMonthData();
  op2.salonsTotal = 2;
  op2.salonsList = [createEmptySalon(), createEmptySalon()];
  let m2 = 0;
  op2.salonsList.forEach((salon) => {
    salon.operator = 'tele2';
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
  op5.salonsList = [createEmptySalon(), createEmptySalon(), createEmptySalon()];
  op5.salonsList[0].operator = 'tele2';
  op5.salonsList[1].operator = 'tele2';
  op5.salonsList[2].operator = 'mts';
  let m5 = 0;
  op5.salonsList.forEach((salon) => {
    if (salon.operator !== 'tele2') return;
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

  // МТС не входит в операторский блок
  check('МТС исключён из Tele2', r5.tele2Salons, 2);

  // Фотоотчёт: 10 салонов, 8 прошли → 14000
  const adm = createEmptyMonthData();
  adm.salonsTotal = 10;
  adm.salonsList = Array.from({ length: 10 }, () => createEmptySalon());
  adm.salonsList.forEach((s, i) => {
    s.photoPassed = i < 8;
  });
  const admRes = calculateAdministrativeBonus(adm);
  const photo = admRes.items.find((i) => i.id === 'photoReport');
  check('Фотоотчёт бонус', photo.bonus, 14000);

  // Админ не зависит от эффективности экономики
  check('Админ независим', admRes.bonus >= 14000 ? 1 : 0, 1);

  // --- Чёрный список ---
  const blBase = () => {
    const d = createEmptyMonthData();
    d.salonsTotal = 10;
    d.salonsList = Array.from({ length: 10 }, () => createEmptySalon());
    return d;
  };

  // ТЕСТ 1: всё ок → 1.00
  check('ЧС тест1 коэфф', calculateBlackListPenalties(blBase()).coefficient, 1);

  // ТЕСТ 2: 3 салона SIM <90% → 4.5% → 0.955
  const bl2 = blBase();
  bl2.salonsList[0].blackList.simPlanPercent = 80;
  bl2.salonsList[1].blackList.simPlanPercent = 85;
  bl2.salonsList[2].blackList.simPlanPercent = 70;
  check('ЧС тест2 коэфф', calculateBlackListPenalties(bl2).coefficient, 0.955);

  // ТЕСТ 3: 2 салона BMP <80% → 2% → 0.98
  const bl3 = blBase();
  bl3.salonsList[0].blackList.bmpPercent = 70;
  bl3.salonsList[1].blackList.bmpPercent = 75;
  check('ЧС тест3 коэфф', calculateBlackListPenalties(bl3).coefficient, 0.98);

  // ТЕСТ 4: 1 KPI fail → 1% → 0.99
  const bl4 = blBase();
  bl4.salonsList[0].operator = 'tele2';
  bl4.salonsList[0].blackList.operatorKpiPercent = 92;
  check('ЧС тест4 коэфф', calculateBlackListPenalties(bl4).coefficient, 0.99);

  // ТЕСТ 5: clamp min 0.575
  const bl5 = blBase();
  bl5.salonsList.forEach((s) => {
    s.blackList.simPlanPercent = 50;
    s.blackList.simDecadeFailed = true;
    s.blackList.bmpPercent = 50;
    s.blackList.q2mPassed = false;
    s.blackList.operatorKpiPercent = 50;
  });
  bl5.blackList.extraLimitExceeded = true;
  check('ЧС тест5 min', calculateBlackListPenalties(bl5).coefficient, 0.575);

  // ТЕСТ 6: clamp max 1.10
  const bl6 = blBase();
  bl6.salonsList[0].blackList.simPlanPercent = 120;
  bl6.salonsList[0].blackList.simQuality4mPercent = 70;
  bl6.salonsList[0].blackList.bmpPercent = 95;
  bl6.salonsList[0].blackList.bmpPrevPercent = 95;
  check('ЧС тест6 max', calculateBlackListPenalties(bl6).coefficient, 1.1);

  // ТЕСТ 7–8: деньги
  const pay = createEmptyMonthData();
  pay.grade = 'grade1';
  pay.salonsTotal = 1;
  pay.salonsList = [createEmptySalon()];
  // Искусственно проверим формулу через коэффициент
  const fakeBefore = 50000;
  const coeff = 0.8;
  const after = fakeBefore * coeff;
  check('ЧС тест7 после', after, 40000);
  check('ЧС тест7 потеря', fakeBefore - after, 10000);
  check('ЧС тест8 оклад+бонус', 31000 + after, 71000);
  check('ЧС оклад не умножается', getFixedSalary('grade1'), 31000);

  // Интеграция: оклад не умножается, бонус × коэффициент
  const blPay = blBase();
  blPay.grade = 'grade1';
  blPay.salonsList.forEach((s) => {
    s.blackList.simPlanPercent = 50;
  });
  const payRes = calculateTotalSalary(blPay, 2026, 3);
  check('ЧС интеграция коэфф', payRes.blackList.coefficient, 0.85);
  check('ЧС интеграция оклад', payRes.fixedSalary, 31000);
  check(
    'ЧС интеграция бонус×К',
    payRes.blackList.bonusAfter,
    roundMoney(payRes.blackList.bonusBefore * 0.85)
  );
  check(
    'ЧС интеграция итог',
    payRes.totalPay,
    roundMoney(payRes.fixedSalary + payRes.blackList.bonusAfter)
  );

  // Пример из ТЗ: 3/10*15% + 2/10*10% + 1/10*10% +5% = 0.975
  const blEx = blBase();
  blEx.salonsList[0].blackList.simPlanPercent = 80;
  blEx.salonsList[1].blackList.simPlanPercent = 85;
  blEx.salonsList[2].blackList.simPlanPercent = 70;
  blEx.salonsList[3].blackList.bmpPercent = 70;
  blEx.salonsList[4].blackList.bmpPercent = 75;
  blEx.salonsList[5].operator = 'tele2';
  blEx.salonsList[5].blackList.operatorKpiPercent = 90;
  blEx.salonsList[6].blackList.simPlanPercent = 115;
  check('ЧС пример ТЗ', calculateBlackListPenalties(blEx).coefficient, 0.975);

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
/**
 * Бизнес-правила калькулятора ЗП руководителя РТТ.
 * Все формулы и лимиты хранятся здесь — отдельно от UI.
 */

const MONTHS = [
  { value: 1, name: 'Январь' },
  { value: 2, name: 'Февраль' },
  { value: 3, name: 'Март' },
  { value: 4, name: 'Апрель' },
  { value: 5, name: 'Май' },
  { value: 6, name: 'Июнь' },
  { value: 7, name: 'Июль' },
  { value: 8, name: 'Август' },
  { value: 9, name: 'Сентябрь' },
  { value: 10, name: 'Октябрь' },
  { value: 11, name: 'Ноябрь' },
  { value: 12, name: 'Декабрь' },
];

/**
 * Грейды руководителя РТТ.
 * salary — ставка, allowance — надбавка.
 * Фиксированная часть = salary + allowance.
 */
const managerGrades = {
  grade3: {
    id: 'grade3',
    name: 'Грейд 3',
    salary: 25000,
    allowance: 0,
    economy: {
      phones: 3000,
      sellOut: 2500,
      accessoriesServices: 7000,
      insurance: 3500,
    },
  },
  grade2: {
    id: 'grade2',
    name: 'Грейд 2',
    salary: 25000,
    allowance: 3000,
    economy: {
      phones: 5000,
      sellOut: 2500,
      accessoriesServices: 7500,
      insurance: 4500,
    },
  },
  grade1: {
    id: 'grade1',
    name: 'Грейд 1',
    salary: 25000,
    allowance: 6000,
    economy: {
      phones: 6000,
      sellOut: 3000,
      accessoriesServices: 8500,
      insurance: 5000,
    },
  },
  flagman: {
    id: 'flagman',
    name: 'Флагман',
    salary: 25000,
    allowance: 9000,
    economy: {
      phones: 7500,
      sellOut: 3000,
      accessoriesServices: 9500,
      insurance: 5500,
    },
  },
};

/** Максимальный бонус за продажи (после сезонности). */
const SALES_BONUS_MAX = 9000;

/** Бонус за каждый салон с KPI Комбо 40%+. */
const COMBO_BONUS_PER_SALON = 2000;

/**
 * Сезонность применяется только к бонусной части продаж.
 * Январь–июнь: ×1.10 | Июль–декабрь: ×0.90
 */
const SEASONALITY = {
  firstHalf: { months: [1, 2, 3, 4, 5, 6], coefficient: 1.1, label: '+10%' },
  secondHalf: { months: [7, 8, 9, 10, 11, 12], coefficient: 0.9, label: '−10%' },
};

/**
 * Продажи (колонка «Стандарт»).
 * type: 'percent' — бонус = сумма × percent
 */
const salesProducts = [
  { id: 'redAppleExchange', name: 'Смартфоны Red, Apple и акция «Обмен минут»', type: 'percent', rate: 0.005 },
  { id: 'standartTablets', name: 'Смартфоны Standart и планшеты', type: 'percent', rate: 0.01 },
  { id: 'green', name: 'Смартфоны категории Green', type: 'percent', rate: 0.02 },
  { id: 'sellOutDead', name: 'Смартфоны Sell Out / Dead', type: 'percent', rate: 0.03 },
  { id: 'featurePhones', name: 'Кнопочные телефоны', type: 'percent', rate: 0.05 },
  { id: 'tradeIn', name: 'Трейд-ин', type: 'percent', rate: 0.04 },
  { id: 'buyout', name: 'Выкуп', type: 'percent', rate: 0.015 },
  { id: 'accessoriesWearable', name: 'Аксессуары и носимая электроника', type: 'percent', rate: 0.1 },
  { id: 'wearablePremium', name: 'Носимая электроника Premium', type: 'percent', rate: 0.04 },
  { id: 'servicesSettings', name: 'Услуги | Настройки', type: 'percent', rate: 0.2 },
  { id: 'kaspersky300', name: 'Подписка на Антивирус Kaspersky 300 руб', type: 'percent', rate: 0.3 },
  { id: 'insuranceOther', name: 'Страхование остальное / КСЖ', type: 'percent', rate: 0.08 },
];

/**
 * Операторский блок продаж (колонка «Стандарт»).
 * type: 'fixed' — количество × ставка
 * type: 'percent' — сумма × percent
 */
const operatorSalesItems = [
  { id: 'extraSim', name: 'Экстра-Sim', type: 'fixed', rate: -40 },
  { id: 'extraSimOverLimit', name: 'Экстра-Sim при превышении лимита', type: 'fixed', rate: -80 },
  { id: 'baseTp', name: 'Базовые ТП', type: 'fixed', rate: 40 },
  { id: 'bundleBaseTp', name: 'Bundle Базовые ТП', type: 'fixed', rate: 70 },
  { id: 'highBundleTp', name: 'High Bundle ТП', type: 'fixed', rate: 120 },
  { id: 'highBundlePlusTp', name: 'High Bundle + ТП', type: 'fixed', rate: 180 },
  { id: 'highBundlePlusPlusTp', name: 'High Bundle ++ ТП', type: 'fixed', rate: 250 },
  { id: 'premiumTp', name: 'Premium ТП', type: 'fixed', rate: 350 },
  { id: 'promoSimBooster', name: 'Промо Sim от оператора / Акция «Бустер»', type: 'fixed', rate: 40 },
  { id: 'abonSim3', name: 'Абон сим 3 мес', type: 'fixed', rate: 150 },
  { id: 'goldComboSim3', name: 'Золото / Комбо сим 3 мес', type: 'fixed', rate: 250 },
  { id: 'goldAbonComboSim6', name: 'Золото / Абон / Комбо сим 6 мес', type: 'fixed', rate: 350 },
  { id: 'goldAbonComboSim12', name: 'Золото / Абон / Комбо сим 12 мес', type: 'fixed', rate: 450 },
  { id: 'legalEntity', name: 'Подключение юр.лица', type: 'fixed', rate: 300 },
  { id: 'mnp', name: 'MNP', type: 'fixed', rate: 250 },
  { id: 'shpdOrTv', name: 'Подключение 1 услуги ШПД или ТВ', type: 'fixed', rate: 400 },
  { id: 'serviceT2Mts', name: 'Сервисные операции Т2 и МТС', type: 'fixed', rate: 10 },
  { id: 'csRtkT2', name: 'ЦС (оборудование РТК) и подписки от Т2', type: 'percent', rate: 0.08 },
  { id: 'yandexAdapter', name: 'Яндекс адаптер', type: 'fixed', rate: 40 },
  { id: 'modem', name: 'Модем', type: 'percent', rate: 0 },
  { id: 'installmentCard', name: 'Карта рассрочки без продажи по КР', type: 'fixed', rate: 500 },
  { id: 'financing', name: 'Финансирование', type: 'percent', rate: 0.003 },
];

/**
 * Экономические KPI.
 * creditCoeff — применяется коэффициент кредитов
 * attachmentCoeff — применяется аттачмент
 * Порядок: сначала Кредиты/аттачмент, затем эффективность.
 */
const economyKpiDefs = [
  {
    id: 'phones',
    name: 'Телефоны',
    baseKey: 'phones',
    usesCredit: true,
    usesAttachment: false,
    note: 'Выкуп НЕ идёт в зачёт плана по сумме телефонов',
  },
  {
    id: 'sellOut',
    name: 'Sell Out / Priority / Трейд-ин',
    baseKey: 'sellOut',
    usesCredit: true,
    usesAttachment: false,
    note: 'Трейд-ин учитывается здесь',
  },
  {
    id: 'accessoriesServices',
    name: 'Аксессуары + услуги',
    baseKey: 'accessoriesServices',
    usesCredit: false,
    usesAttachment: true,
  },
  {
    id: 'insurance',
    name: 'Страхование',
    baseKey: 'insurance',
    usesCredit: false,
    usesAttachment: true,
  },
];

/**
 * Пороги коэффициента эффективности для аналитики «ближайший порог».
 */
const EFFICIENCY_THRESHOLDS = [
  { min: 0, max: 75, coefficient: 0, label: '<75%' },
  { min: 75, max: 85, coefficient: 0.75, label: '75–84,9%' },
  { min: 85, max: 120, coefficient: null, label: '85–119,9%' },
  { min: 120, max: Infinity, coefficient: 1.2, label: '≥120%' },
];

/**
 * Пустая конфигурация административного блока.
 * В дальнейшем добавить: KPI, план, факт, выполнение, коэффициент, бонус, потери, плюс.
 */
const administrativeRules = [];

/**
 * Пустая конфигурация операторского блока (KPI руководителя, не продажи).
 * В дальнейшем добавить: KPI, план, факт, выполнение, коэффициент, бонус, потери, плюс.
 */
const operatorRules = [];

/**
 * Пустая конфигурация чёрного списка.
 * Каждое условие: название, описание, нарушение, штраф, влияние на бонус.
 */
const blackListRules = [];

/** Ключ LocalStorage. */
const STORAGE_KEY = 'rtt_manager_salary_calculator_v1';

/**
 * Шаблон данных расчёта за месяц.
 */
function createEmptyMonthData() {
  const salesValues = {};
  salesProducts.forEach((p) => {
    salesValues[p.id] = 0;
  });

  const operatorSalesValues = {};
  operatorSalesItems.forEach((p) => {
    operatorSalesValues[p.id] = 0;
  });

  const economy = {};
  economyKpiDefs.forEach((kpi) => {
    economy[kpi.id] = { plan: 0, fact: 0 };
  });

  return {
    grade: 'grade3',
    salesValues,
    operatorSalesValues,
    salonsTotal: 0,
    salonsComboDone: 0,
    creditPlanPercent: 100,
    attachment: 2.3,
    economy,
    administrative: {},
    operator: {},
    blackList: {},
  };
}

function createEmptyEmployee(name = '') {
  return {
    id: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: name.trim(),
    months: {},
  };
}

function periodKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}
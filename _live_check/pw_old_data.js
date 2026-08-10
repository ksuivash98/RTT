const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Realistic old store from before binary admin / photoPerformer / detailed blackList
  await page.addInitScript(() => {
    localStorage.setItem(
      'rtt_manager_salary_calculator_v1',
      JSON.stringify({
        employees: [
          {
            id: 'emp_old',
            name: 'Старикова Ксения',
            months: {
              '2026-07': {
                grade: 'grade1',
                salonsTotal: 2,
                salonsList: [
                  {
                    name: 'Березники',
                    operator: 'tele2',
                    photoPassed: true,
                    servicePassed: true,
                    txvPassed: false,
                    kpis: {
                      csSubscriptions: true,
                      shpdT2: true,
                      znAbonFtp: true,
                      mnp: false,
                      controlPlanTt: true,
                    },
                  },
                  {
                    name: 'Соликамск',
                    operator: 'mts',
                    photoPassed: false,
                    servicePassed: false,
                    txvPassed: true,
                    kpis: {},
                  },
                ],
                salonsComboDone: 1,
                creditPlanPercent: 105,
                attachment: 2.5,
                administrative: {
                  recommendations: { plan: 100, fact: 100 },
                  cardShare: { plan: 25, fact: 20 },
                  dovChecklist: { plan: 1, fact: 1 },
                  monthlyTesting: { plan: 1, fact: 1 },
                  photoReportPassed: 1,
                  servicePassed: 1,
                  txvPassed: 1,
                },
                economy: {
                  phones: { plan: 100, fact: 90 },
                },
                salesValues: { phones: 50000 },
                operatorSalesValues: {},
                operator: { tele2Salons: 1, salons: [{ kpis: {} }] },
                blackList: { someOldRule: { violated: true } },
              },
            },
          },
        ],
        activeEmployeeId: 'emp_old',
        activeYear: 2026,
        activeMonth: 7,
        uiCollapse: { economy: true },
      })
    );
  });

  await page.goto('https://ksuivash98.github.io/RTT/', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(1000);

  const state = await page.evaluate(async () => {
    const salonsInput = document.getElementById('salonsTotal');
    salonsInput.value = '3';
    salonsInput.dispatchEvent(new Event('change', { bubbles: true }));

    // try typing name
    const name = document.getElementById('employeeName');
    name.value = 'Новое имя';
    name.dispatchEvent(new Event('change', { bubbles: true }));

    return {
      employeeName: document.getElementById('employeeName').value,
      salonsTotal: document.getElementById('salonsTotal').value,
      analytics: document.getElementById('analyticsCards').innerText.slice(0, 120),
      adminHtmlLen: document.getElementById('adminBlock').innerHTML.length,
      gradeCount: document.querySelectorAll('[data-grade]').length,
      storeName: UI.store.employees[0].name,
      monthSalons: getActiveMonthData(UI.store).salonsTotal,
      adminRec: getActiveMonthData(UI.store).administrative.recommendations,
      panelSum: document.querySelector('[data-panel-sum="salary"]')?.textContent,
    };
  });

  // click grade
  await page.click('[data-grade="grade2"]');
  await page.waitForTimeout(200);
  const afterGrade = await page.evaluate(() => ({
    grade: getActiveMonthData(UI.store).grade,
    salarySum: document.querySelector('[data-panel-sum="salary"]')?.textContent,
  }));

  console.log(JSON.stringify({ errors, consoleErrors, state, afterGrade }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

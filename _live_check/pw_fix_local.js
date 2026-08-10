const { chromium } = require('playwright');
const fs = require('fs');
const path = 'd:/1ксю/RTT/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript(() => {
    const rawSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).includes('rtt_manager_salary_calculator_v1') && !String(k).includes('backup')) {
        throw new Error('QuotaExceededError mock');
      }
      return rawSet.call(this, k, v);
    };
    rawSet.call(
      localStorage,
      'rtt_manager_salary_calculator_v1',
      JSON.stringify({
        employees: [
          {
            id: 'e1',
            name: 'Сохранённый',
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
                    txvPassed: true,
                    kpis: {},
                  },
                ],
                salonsComboDone: 0,
                creditPlanPercent: 100,
                attachment: 2.3,
                administrative: {},
                economy: {},
                salesValues: {},
                operatorSalesValues: {},
                blackList: {},
              },
            },
          },
        ],
        activeEmployeeId: 'e1',
        activeYear: 2026,
        activeMonth: 8,
        uiCollapse: {},
      })
    );
  });

  const html = fs.readFileSync(path + 'index.html', 'utf8');
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  for (const f of ['data.js', 'calculator.js', 'storage.js', 'ui.js', 'script.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path + f, 'utf8') });
  }
  await page.evaluate(() => {
    if (typeof initApp === 'function') initApp();
  });
  await page.waitForTimeout(400);

  const state = await page.evaluate(() => ({
    name: document.getElementById('employeeName')?.value,
    salons: document.getElementById('salonsTotal')?.value,
    employeeHtml: document.getElementById('employeeList')?.innerText,
    analytics: document.getElementById('analyticsCards')?.innerText?.slice(0, 100),
    monthKeys: UI?.store ? Object.keys(UI.store.employees[0].months) : null,
    salonNames:
      typeof getActiveMonthData === 'function'
        ? getActiveMonthData(UI.store).salonsList.map((s) => s.name)
        : null,
  }));

  page.once('dialog', async (d) => d.accept('Новый'));
  await page.click('#btnAddEmployee');
  await page.waitForTimeout(200);
  const afterClick = await page.evaluate(() => UI.store.employees.map((e) => e.name));

  console.log(JSON.stringify({ errors, state, afterClick }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

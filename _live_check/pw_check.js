const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const logs = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('requestfailed', (req) => {
    logs.push(`[fail] ${req.url()} ${req.failure()?.errorText}`);
  });

  await page.goto('https://ksuivash98.github.io/RTT/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => {
    const list = document.getElementById('employeeList');
    const analytics = document.getElementById('analyticsCards');
    const grade = document.getElementById('gradeSelector');
    return {
      employeeHtml: list ? list.innerHTML.slice(0, 200) : null,
      analyticsHtml: analytics ? analytics.innerHTML.slice(0, 200) : null,
      gradeHtml: grade ? grade.innerHTML.slice(0, 200) : null,
      hasInit: typeof initApp === 'function',
      hasUI: typeof UI !== 'undefined',
      storeEmployees: typeof UI !== 'undefined' && UI.store ? UI.store.employees.length : null,
      localStorageKeys: Object.keys(localStorage),
      storageSample: localStorage.getItem('rtt_manager_salary_calculator_v1')?.slice(0, 100) || null,
    };
  });

  // try click create
  let clickError = null;
  try {
    page.once('dialog', async (d) => {
      await d.dismiss();
    });
    await page.click('#btnAddEmployee');
  } catch (e) {
    clickError = String(e);
  }

  console.log(JSON.stringify({ errors, logs, state, clickError }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('SCRIPT FAIL', e);
  process.exit(1);
});

import dayjs from 'dayjs';
import 'dayjs/locale/es.js';
import { chromium as lambdaChromium } from 'playwright-aws-lambda';    // binario listo
import playwright from 'playwright-core';                               // API

dayjs.locale('es');

const parseHour = s => {
  const [time, period] = s.split(' ');
  let [h] = time.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h;
};

const scrapeFor = async (page, dateObj) => {
  const fecha = dayjs(dateObj).format('D [de] MMMM [de] YYYY');

  await page.goto('https://guacharoactivo.com.ve/resultados', {
    waitUntil: 'networkidle',
    timeout: 15_000,
  });

  await page.click('button[aria-haspopup="dialog"]');
  await page.waitForSelector('div[role="dialog"] button', { timeout: 10_000 });

  await page.$$eval(
    'div[role="dialog"] button',
    (btns, target) =>
      btns.find(b => b.textContent.trim() === target)?.click(),
    fecha
  );

  await page.waitForSelector('section .grid > div', { timeout: 10_000 });

  return page.$$eval('section .grid > div', divs =>
    divs.map(el => {
      const img    = el.querySelector('img')?.src ?? '';
      const hora   = el.querySelector('p.text-yellow-500')?.textContent.trim() ?? '';
      const spans  = [...el.querySelectorAll('span')].map(s => s.textContent.trim());
      const [numero, animal] = spans;
      return { img, hora, numero, animal };
    })
  );
};

export default async function handler(req, res) {
  let browser;
  try {
    browser = await playwright.chromium.launch({
      args: [...chromeLambda.args, '--no-sandbox'],
      executablePath: await lambdaChromium.executablePath(),
      headless: true,
    });
    console.log(await chromeLambda.executablePath())
    const page = await browser.newPage();

    // HOY
    let data = await scrapeFor(page, new Date());
    let filtrados = data.filter(d => {
      const h = parseHour(d.hora);
      return h >= 8 && h <= 19;
    }).slice(0, 12);

    // AYER si procede
    const hNow = new Date().getHours();
    if (hNow < 8 || hNow > 19 || filtrados.length === 0) {
      const ayer = dayjs().subtract(1, 'day').toDate();
      data = await scrapeFor(page, ayer);
      filtrados = data.filter(d => {
        const h = parseHour(d.hora);
        return h >= 8 && h <= 19;
      }).slice(0, 12);
    }

    res.status(200).json(filtrados);
  } catch (err) {
    console.error('🚨 Playwright fail:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
}

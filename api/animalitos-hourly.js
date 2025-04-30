import dayjs from 'dayjs';
import 'dayjs/locale/es.js';
import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

dayjs.locale('es');

const parseHour = s => {
  const [[h0, m], period] = s.split(/[: ]/g);
  let h = +h0;
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h;
};

const scrapFor = async (page, dateObj) => {
  const fecha = dayjs(dateObj).format('D [de] MMMM [de] YYYY');

  await page.goto('https://guacharoactivo.com.ve/resultados', {
    waitUntil: 'networkidle2', timeout: 15_000
  });

  await page.click('button[aria-haspopup="dialog"]');
  await page.waitForSelector('div[role="dialog"] button', { timeout: 10_000 });

  await page.$$eval(
    'div[role="dialog"] button',
    (btns, target) => btns.find(b => b.textContent.trim() === target)?.click(),
    fecha
  );

  await page.waitForSelector('section .grid > div', { timeout: 10_000 });

  return page.$$eval('section .grid > div', divs =>
    divs.map(el => {
      const img    = el.querySelector('img')?.src    ?? '';
      const hora   = el.querySelector('p.text-yellow-500')?.textContent.trim() ?? '';
      const [numero, animal] = [...el.querySelectorAll('span')].map(n => n.textContent.trim());
      return { img, hora, numero, animal };
    })
  );
};

export default async function handler(req, res) {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(), // ¡EL () ES CLAVE!
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // --- scrape hoy ---
    let data = await scrapFor(page, new Date());
    let filtrados = data.filter(d => {
      const h = parseHour(d.hora);
      return h >= 8 && h <= 19;
    }).slice(0, 12);

    // --- si fuera de rango o vacío -> ayer ---
    const nowH = new Date().getHours();
    if (nowH < 8 || nowH > 19 || filtrados.length === 0) {
      const ayer = dayjs().subtract(1, 'day').toDate();
      data = await scrapFor(page, ayer);
      filtrados = data.filter(d => {
        const h = parseHour(d.hora);
        return h >= 8 && h <= 19;
      }).slice(0, 12);
    }

    return res.status(200).json(filtrados);
  } catch (err) {
    console.error('❌ Scrape fail:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
}

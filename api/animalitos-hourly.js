// api/animalitos-hourly.js
import dayjs from 'dayjs';
import 'dayjs/locale/es.js';
import chromium from 'chrome-aws-lambda';

dayjs.locale('es');

// Parsea "10:30 PM" → 22
function parseHour(horaStr) {
  const [time, period] = horaStr.split(' ');
  let [h] = time.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h;
}

// Scrapea un día concreto
async function scrapFor(page, dateObj) {
  const dateStr = dayjs(dateObj).format('D [de] MMMM [de] YYYY');
  await page.goto('https://guacharoactivo.com.ve/resultados', {
    waitUntil: 'networkidle2',
    timeout: 15000,
  });
  await page.click('button[aria-haspopup="dialog"]');
  await page.waitForSelector('div[role="dialog"] button', { timeout: 10000 });
  await page.$$eval(
    'div[role="dialog"] button',
    (btns, ds) => {
      const match = btns.find(b => b.textContent.trim() === ds);
      if (match) match.click();
    },
    dateStr
  );
  await page.waitForSelector('section .grid > div', { timeout: 10000 });

  return page.$$eval('section .grid > div', divs =>
    divs.map(el => {
      const img    = el.querySelector('img')?.src    || '';
      const hora   = el.querySelector('p.text-yellow-500')?.textContent.trim() || '';
      const spans  = el.querySelectorAll('span');
      const numero = spans[0]?.textContent.trim()    || '';
      const animal = spans[1]?.textContent.trim()    || '';
      return { img, hora, numero, animal };
    })
  );
}

export default async function handler(req, res) {
  const isVercel = !!process.env.VERCEL; // Vercel setea esta var
  // Import dinámico según entorno
  const { default: puppeteer } = isVercel
    ? await import('puppeteer-core')
    : await import('puppeteer');

  // Opciones de lanzamiento
  const launchOpts = isVercel
    ? {
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
      }
    : { headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] };

  let browser;
  try {
    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();

    // 1) Hoy
    let raw = await scrapFor(page, new Date());
    let filtrados = raw
      .filter(i => {
        const h = parseHour(i.hora);
        return h >= 8 && h <= 19;
      })
      .slice(0, 12);

    // 2) Si no hay o fuera de hora, prueba ayer
    const nowHour = new Date().getHours();
    if (nowHour < 8 || nowHour > 19 || filtrados.length === 0) {
      const ayer = dayjs().subtract(1, 'day').toDate();
      const rawY = await scrapFor(page, ayer);
      filtrados = rawY
        .filter(i => {
          const h = parseHour(i.hora);
          return h >= 8 && h <= 19;
        })
        .slice(0, 12);
    }

    return res.status(200).json(filtrados);
  } catch (err) {
    console.error('❌ Error scraping:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
}

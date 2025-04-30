import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import dayjs from 'dayjs';
import 'dayjs/locale/es.js';



const app = express();

app.use(cors())

const PORT = 3000;

function parseHour(horaStr) {
 const [time, period] = horaStr.split(' ');
 let [h] = time.split(':').map(Number);
 if (period === 'PM' && h !== 12) h += 12;
 if (period === 'AM' && h === 12) h = 0;
 return h;
}

dayjs.locale('es');

app.get('/api/animalitos-hourly', async (_, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Función que raspa para una fecha dada (Date objeto)
    async function scrapFor(dateObj) {
      // 1) Abre la página
      await page.goto('https://guacharoactivo.com.ve/resultados', {
        waitUntil: 'networkidle2',
        timeout: 15000
      });
      // 2) Abre el selector de fecha
      await page.click('button[aria-haspopup="dialog"]');
      // 3) Construye texto del día: "27 de abril de 2025"
      const dateStr = dayjs(dateObj).format('D [de] MMMM [de] YYYY');
      // 4) Selecciona el botón de esa fecha
      await page.waitForSelector('div[role="dialog"] button'); 
      await page.$$eval(
        'div[role="dialog"] button',
        (btns, dateStr) => {
          const match = btns.find(b => b.textContent.trim() === dateStr);
          if (match) match.click();
        },
        dateStr
      );
      // 5) Espera al grid
      await page.waitForSelector('section .grid > div', { timeout: 10000 });

      // 6) Extrae datos
      const resultados = await page.$$eval('section .grid > div', divs =>
        divs.map(el => {
          const img    = el.querySelector('img')?.src    || '';
          const hora   = el.querySelector('p.text-yellow-500')?.textContent.trim() || '';
          const spans  = el.querySelectorAll('span');
          const numero = spans[0]?.textContent.trim()    || '';
          const animal = spans[1]?.textContent.trim()    || '';
          return { img, hora, numero, animal };
        })
      );
      return resultados;
    }

    // 1️⃣ Primero scrapea para hoy
    let raw = await scrapFor(new Date());
    // Filtra 8–19 y toma 12
    let filtrados = raw
      .filter(i => {
        const h = parseHour(i.hora);
        return h >= 8 && h <= 19;
      })
      .slice(0, 12);

    // 2️⃣ Si ya pasó de las 19 h o no hay resultados, prueba ayer
    const now = new Date();
    const currentHour = now.getHours();

    // Si estamos fuera de la ventana [8,19] o no hay resultados:
    if (currentHour < 8 || currentHour > 19 || filtrados.length === 0) {
      console.log(
        `🔄 Fuera de horario (${currentHour}h) o sin datos → raspando ayer`
      );
      const yesterday = dayjs().subtract(1, 'day').toDate();
      const rawY = await scrapFor(yesterday);
      filtrados = rawY
        .filter(i => {
          const h = parseHour(i.hora);
          return h >= 8 && h <= 19;
        })
        .slice(0, 12);
    }

    return res.json(filtrados);

  } catch (err) {
    console.error('❌ Error scraping:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});


app.listen(PORT, () => console.log(`🚀 Backend escuchando en http://localhost:${PORT}`))
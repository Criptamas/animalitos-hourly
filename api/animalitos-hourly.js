import axios from 'axios';
import * as cheerio from 'cheerio';

export async function handler(_, res) {
  console.log('✨ [api] handler invocado');        // 1️⃣
  try {
    const { data } = await axios.get(
      'https://guacharoactivo.com.ve/resultados',
      { 
        timeout: 8000,                            // 2️⃣ evita hang eterno
        headers: { 'User-Agent': 'Mozilla/5.0' }  // 3️⃣ máscara de navegador
      }
    );
    console.log('📥 HTML length:', data.length);  // 4️⃣ confirmamos llegada

    const $ = cheerio.load(data);
    const resultados = [];
    $('section.min-h-[100vh] .grid > div').each((i, el) => {
      const img    = $(el).find('img').attr('src');
      const hora   = $(el).find('p.text-yellow-500').text().trim();
      const numero = $(el).find('span').first().text().trim();
      const animal = $(el).find('span').last().text().trim();
      resultados.push({ img, hora, numero, animal });
    });
    console.log('🔍 items scrapeados:', resultados.length); // 5️⃣

    return res.status(200).json({ htmlLength: data.length });
  } catch (err) {
    console.error('❌ error scraping:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
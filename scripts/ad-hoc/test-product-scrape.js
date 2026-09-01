import axios from 'axios';
import * as cheerio from 'cheerio';

async function inspectHtmlPrices(code) {
  const url = `https://tn.oriflame.com/products/product?code=${code}&store=TN-oriflame_1`;
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data);
  $('span, p, div').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes('54.9') || text.includes('89.9') || text.includes('54,9') || text.includes('89,9')) {
      const cls = $(el).attr('class') || '';
      console.log(`Tag: ${el.tagName}, Class: "${cls}", Text: "${text}"`);
    }
  });
}

inspectHtmlPrices('23378').then(() => process.exit(0));

import axios from 'axios';
import * as cheerio from 'cheerio';

async function checkDetails() {
  const codes = ['35681', '46980', '35759'];
  for (const code of codes) {
    const url = `https://tn.oriflame.com/products/product?code=${code}`;
    try {
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(res.data);
      const nextDataStr = $('#__NEXT_DATA__').html();
      const nextData = nextDataStr ? JSON.parse(nextDataStr) : null;
      
      const pd = nextData?.props?.pageProps?.productDetailData;
      const jsonLd = pd?.application?.productDetailPage?.metadata?.jsonLd;
      const variants = pd?.product?.variants || [];
      const v0 = variants[0] || {};
      
      console.log(`=== CODE ${code} ===`);
      console.log('jsonLd availability:', jsonLd?.offers?.availability);
      console.log('variant inventory/stock info:', {
        canOrder: v0.canOrder,
        isAvailable: v0.isAvailable,
        inStock: v0.inStock,
        backInStockNotification: v0.backInStockAvailability,
        status: v0.status
      });
      console.log('HTML buttons:', $('button').map((i, el) => $(el).text().trim()).get().filter(t => t.length > 0));
    } catch (e) {
      console.log('Err for', code, e.message);
    }
  }
}

checkDetails();

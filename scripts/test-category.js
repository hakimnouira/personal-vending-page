import axios from 'axios';
import * as cheerio from 'cheerio';

async function testAllCategories() {
  const urls = [
    'https://tn.oriflame.com/bestsellers?store=TN-oriflame_1',
    'https://tn.oriflame.com/fragrance?store=TN-oriflame_1',
    'https://tn.oriflame.com/skincare?store=TN-oriflame_1',
    'https://tn.oriflame.com/makeup?store=TN-oriflame_1',
    'https://tn.oriflame.com/wellness?store=TN-oriflame_1',
    'https://tn.oriflame.com/hair?store=TN-oriflame_1',
    'https://tn.oriflame.com/body?store=TN-oriflame_1',
    'https://tn.oriflame.com/men?store=TN-oriflame_1'
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(res.data);
      const nextDataStr = $('#__NEXT_DATA__').html();
      if (nextDataStr) {
        const nextData = JSON.parse(nextDataStr);
        const contentItems = nextData.props?.pageProps?.data?.application?.editorialPage?.contentItems || [];
        contentItems.forEach(ci => {
          if (ci.__typename === 'EditorialPlpRows' && ci.content?.rows) {
            ci.content.rows.forEach(r => {
              const prods = Array.isArray(r.content) ? r.content : [r.content];
              prods.forEach(p => {
                if (p && p.productCode) {
                  const hasBuyOption = (p.labels || []).some(l => l.labelKey === 'AddToBasketVisible');
                  const isOffStock = p.isOffStock === true;
                  const showNotify = p.backInStockAvailability?.showBackInStockNotification === true;
                  const inStock = hasBuyOption && !isOffStock && !showNotify;
                  
                  if (!inStock || p.productCode === '35681') {
                    console.log(`Product ${p.productCode} (${p.concept?.name}): inStock=${inStock} [hasBuy=${hasBuyOption}, isOffStock=${isOffStock}, showNotify=${showNotify}]`);
                  }
                }
              });
            });
          }
        });
      }
    } catch (e) {
      console.log('Error for', url, e.message);
    }
  }
}

testAllCategories();

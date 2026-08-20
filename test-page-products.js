import axios from 'axios';
import * as cheerio from 'cheerio';

async function inspectPageProducts(pageNum) {
  const url = `https://tn.oriflame.com/catalogue?cataloguecode=2026008&PageNumber=${pageNum}&store=TN-oriflame_1`;
  console.log("Fetching:", url);
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(res.data);
    const nextDataStr = $('#__NEXT_DATA__').html();
    if (!nextDataStr) {
      console.log("No Next Data found");
      return;
    }

    const nextData = JSON.parse(nextDataStr);
    const pageProps = nextData.props?.pageProps;
    
    console.log("Page Number:", pageProps?.pageNumber);
    console.log("Catalogue Code:", pageProps?.catalogueCode);
    
    // Look for product list or rows on this specific page
    const contentItems = pageProps?.content?.contentItems || [];
    console.log("Content items count:", contentItems.length);
    
    contentItems.forEach((item, idx) => {
      const rows = item?.content?.rows || [];
      console.log(`Content item ${idx} rows count:`, rows.length);
      rows.forEach(r => {
        const p = r?.content;
        if (p) {
          console.log(`Found Product on Page ${pageNum}:`, {
            id: p.code || p.productId || p.sku,
            name: p.title || p.name,
            price: p.price?.price?.currentPrice,
            original_price: p.price?.price?.basicCataloguePrice,
            category: p.categoryName || p.primaryCategory?.name
          });
        }
      });
    });

  } catch (e) {
    console.error("Error:", e.message);
  }
}

async function testMultiplePages() {
  await inspectPageProducts(146);
  await inspectPageProducts(4);
  await inspectPageProducts(6);
}

testMultiplePages();

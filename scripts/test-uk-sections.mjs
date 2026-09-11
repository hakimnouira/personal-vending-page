import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectSections(code) {
  const url = `https://uk.oriflame.com/products/product?code=${code}`;
  const res = await axios.get(url, {
    httpsAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const $ = cheerio.load(res.data);
  const nextData = JSON.parse($('#__NEXT_DATA__').html());
  const pdp = nextData.props?.pageProps?.productDetailData;
  console.log('--- additionalInformation ---');
  console.log(JSON.stringify(pdp?.application?.productDetailPage?.sections?.additionalInformation, null, 2));

  console.log('--- All headings and content on page ---');
  $('h2, h3, h4, [data-testid], section').each((i, el) => {
    const text = $(el).text().trim();
    if (text.toLowerCase().includes('use') || text.toLowerCase().includes('apply') || text.toLowerCase().includes('how')) {
      console.log('Found element with text:', text.slice(0, 150));
    }
  });

  // Also check product concept or other fields
  console.log('Concept keys:', Object.keys(pdp?.product?.concept || {}));
  console.log('Concept howToUse:', pdp?.product?.concept?.howToUse || pdp?.product?.howToUse);
  console.log('Product keys:', Object.keys(pdp?.product || {}));
}

await inspectSections('40683');

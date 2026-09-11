import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testUK(code) {
  try {
    const url = `https://uk.oriflame.com/products/product?code=${code}`;
    console.log('Fetching:', url);
    const res = await axios.get(url, {
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9'
      },
      timeout: 10000,
      validateStatus: () => true
    });
    console.log('Status:', res.status);
    if (res.status === 200) {
      const $ = cheerio.load(res.data);
      const nextDataStr = $('#__NEXT_DATA__').html();
      console.log('Has __NEXT_DATA__:', !!nextDataStr);
      if (nextDataStr) {
        const nextData = JSON.parse(nextDataStr);
        const pdp = nextData.props?.pageProps?.productDetailData;
        console.log('PDP keys:', Object.keys(pdp || {}));
        const concept = pdp?.product?.concept;
        console.log('Concept description:', concept?.description?.slice(0, 150));
        const sections = pdp?.application?.productDetailPage?.sections;
        console.log('Sections keys:', Object.keys(sections || {}));
        if (sections?.howToUse) console.log('howToUse section:', JSON.stringify(sections.howToUse).slice(0, 200));
        if (sections?.description) console.log('description section:', JSON.stringify(sections.description).slice(0, 200));
      }
      console.log('Title:', $('h1').text().trim());
      console.log('Description in meta:', $('meta[name="description"]').attr('content')?.slice(0, 150));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

await testUK('47724');
await testUK('40683');
await testUK('46980');

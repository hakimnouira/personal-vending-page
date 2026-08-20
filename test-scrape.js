import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugRowsContent() {
  const url = 'https://tn.oriflame.com/bestsellers?store=TN-oriflame_1';
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
    }
  });

  const $ = cheerio.load(res.data);
  const nextData = JSON.parse($('#__NEXT_DATA__').html());
  const rows = nextData.props?.pageProps?.data?.application?.editorialPage?.contentItems[1]?.content?.rows || [];
  
  rows.forEach((row, i) => {
    console.log(`row[${i}].content isArray:`, Array.isArray(row.content), typeof row.content);
    if (Array.isArray(row.content)) {
      console.log(`row[${i}].content length:`, row.content.length);
      console.log(`First product:`, row.content[0]?.concept?.name, row.content[0]?.productCode, row.content[0]?.price?.price);
    }
  });
}

debugRowsContent();

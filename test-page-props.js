import axios from 'axios';
import * as cheerio from 'cheerio';

async function checkProps() {
  const url = `https://tn.oriflame.com/catalogue?cataloguecode=2026008&PageNumber=146&store=TN-oriflame_1`;
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data);
  const nextData = JSON.parse($('#__NEXT_DATA__').html());
  console.log("pageProps keys:", Object.keys(nextData.props.pageProps));
  console.log("pageProps:", JSON.stringify(nextData.props.pageProps, null, 2).substring(0, 1000));
}

checkProps();

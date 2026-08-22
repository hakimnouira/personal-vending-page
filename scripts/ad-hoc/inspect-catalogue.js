import axios from 'axios';

async function main() {
  try {
    const res = await axios.get('https://tn.oriflame.com/catalogue?cataloguecode=2026008&PageNumber=1&store=TN-oriflame_1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = res.data;
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      const parsed = JSON.parse(nextDataMatch[1]);
      console.log('pageProps:', JSON.stringify(parsed.props?.pageProps, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}

main();

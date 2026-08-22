import axios from 'axios';

async function main() {
  const htmlRes = await axios.get('https://tn.oriflame.com/catalogue?cataloguecode=2026008&store=TN-oriflame_1');
  const html = htmlRes.data;
  const scriptUrls = [...html.matchAll(/src="(\/_next\/static\/[^"]+)"/g)].map(m => m[1]);
  console.log('Scripts found:', scriptUrls);

  for (const sUrl of scriptUrls) {
    if (sUrl.includes('catalogue') || sUrl.includes('pages')) {
      const fullUrl = 'https://tn.oriflame.com' + sUrl;
      const sRes = await axios.get(fullUrl);
      console.log('Script:', sUrl, 'length:', sRes.data.length);
      const ipaperMatches = sRes.data.match(/(https?:\/\/[^\s"']*(?:ipaper|flipbook|cdn\.ipaper\.io)[^\s"']*)/g);
      console.log('iPaper matches in script:', ipaperMatches);
      const apiMatches = sRes.data.match(/\/api\/[a-zA-Z0-9_\-\/]+/g);
      console.log('API matches in script:', apiMatches);
    }
  }
}

main().catch(console.error);

import axios from 'axios';

async function main() {
  const res = await axios.get('https://tn-catalogue.oriflame.com/fr-TN/2026008-brp?HideStandardUI=true&Page=1', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const html = res.data;
  
  // Extract staticSettings
  const match = html.match(/window\.staticSettings\s*=\s*(\{[\s\S]*?\});\s*(?:window\.|$)/);
  if (match) {
    const settings = JSON.parse(match[1]);
    console.log('Keys:', Object.keys(settings));
    console.log('paperId:', settings.paperId);
    console.log('account:', settings.account);
    console.log('aws:', settings.aws);
    console.log('security:', settings.security);
    console.log('enrichments.chunkUrls:', settings.enrichments?.chunkUrls);
  }

  // Look for any image token or security object
  const allTokens = html.match(/token=([a-zA-Z0-9_-]+)/g);
  console.log('All tokens in HTML:', allTokens);
  
  const allExpires = html.match(/expires=([0-9]+)/g);
  console.log('All expires in HTML:', allExpires);
}

main().catch(console.error);

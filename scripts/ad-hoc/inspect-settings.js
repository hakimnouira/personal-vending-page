import axios from 'axios';

async function main() {
  const res = await axios.get('https://tn-catalogue.oriflame.com/fr-TN/2026008-brp?HideStandardUI=true&Page=1', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const html = res.data;
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);

  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    if (s.includes('staticSettings') || s.includes('dynamicSettings') || s.includes('PaperId') || s.includes('token')) {
      console.log(`=== SCRIPT ${i} ===`);
      // Find all global object assignments
      const objMatches = [...s.matchAll(/window\.([a-zA-Z0-9_]+)\s*=\s*(\{[\s\S]*?\});/g)];
      objMatches.forEach(m => {
        console.log(`Global: window.${m[1]}`);
        try {
          const parsed = JSON.parse(m[2]);
          console.log(`window.${m[1]} keys:`, Object.keys(parsed));
          if (parsed.security) console.log('security:', parsed.security);
          if (parsed.cdn) console.log('cdn:', parsed.cdn);
          if (parsed.enrichments) console.log('enrichments:', parsed.enrichments);
          if (parsed.image) console.log('image:', parsed.image);
          if (parsed.media) console.log('media:', parsed.media);
          if (parsed.video) console.log('video:', parsed.video);
        } catch (e) {
          console.log(`Failed to JSON.parse window.${m[1]}, raw:`, m[2].slice(0, 300));
        }
      });
    }
  }
}

main().catch(console.error);

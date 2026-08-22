import axios from 'axios';

async function main() {
  const res = await axios.get('https://tn-catalogue.oriflame.com/fr-TN/2026008-brp?HideStandardUI=true&Page=1', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const html = res.data;
  
  // Search for JavaScript configuration objects
  const jsMatch = html.match(/var\s+config\s*=\s*(\{[\s\S]*?\});|var\ publication\s*=\s*(\{[\s\S]*?\});|window\.iPaper\s*=\s*(\{[\s\S]*?\});/i);
  if (jsMatch) {
    console.log('Matched config:', (jsMatch[1] || jsMatch[2] || jsMatch[3]).slice(0, 500));
  }

  // Look for all script contents
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  console.log('Found scripts count:', scripts.length);

  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    if (s.includes('PaperId') || s.includes('paperId') || s.includes('token') || s.includes('6c400931')) {
      console.log(`Script ${i} length: ${s.length}`);
      console.log(`Script ${i} excerpt:`, s.slice(0, 1500));
    }
  }
}

main().catch(console.error);

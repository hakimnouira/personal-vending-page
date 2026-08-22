import axios from 'axios';

async function main() {
  try {
    // Check content API or catalogue API
    const res = await axios.get('https://api-content.oriflame.com/api/v1/tn/catalogues/2026008', {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    }).catch(e => e.response || { status: e.message });
    console.log('Catalogue endpoint status:', res.status, res.data);

    // Or check we-api or static api
    const res2 = await axios.get('https://we-api.oriflame.com/live/catalogues/tn/2026008').catch(e => e.response || { status: e.message });
    console.log('Live catalogue status:', res2.status, res2.data);
  } catch (err) {
    console.error(err);
  }
}

main();

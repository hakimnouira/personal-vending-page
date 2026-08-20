import axios from 'axios';

async function testIPaperApi() {
  try {
    const paperId = 'd0d0293a-cd77-4ae7-a290-7861d5c8ff08';
    const oldPaperId = '6c400931-2ccc-40e7-b3f5-40f381af161e';
    const apiSecret = 'O57BnqYGNioH3FgYXoU0MEdrTUTKfAssTh7WVw7FuOo_';

    const testEndpoints = [
      `https://cdn.ipaper.io/api/v1/papers/${paperId}`,
      `https://cdn.ipaper.io/api/v1/papers/${oldPaperId}`,
      `https://cdn.ipaper.io/api/v1/papers/${paperId}/pages`,
      `https://cdn.ipaper.io/api/v1/papers/${oldPaperId}/pages`,
      `https://cdn.ipaper.io/api/v1/papers/${paperId}?secret=${apiSecret}`,
      `https://cdn.ipaper.io/api/v1/papers/${oldPaperId}?secret=${apiSecret}`
    ];

    for (const endpoint of testEndpoints) {
      try {
        console.log("Testing iPaper API Endpoint:", endpoint);
        const res = await axios.get(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'X-iPaper-Secret': apiSecret
          },
          timeout: 5000
        });
        console.log("-> SUCCESS! Status:", res.status, "Data keys:", Object.keys(res.data || {}));
        console.log(JSON.stringify(res.data).slice(0, 500));
      } catch (e) {
        console.log("-> Failed:", e.message, e.response?.status || '');
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testIPaperApi();

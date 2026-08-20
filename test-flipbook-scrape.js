import axios from 'axios';

async function testIPaperApi() {
  const secret = 'O57BnqYGNioH3FgYXoU0MEdrTUTKfAssTh7WVw7FuOo_';
  const endpoints = [
    `https://cdn.ipaper.io/api/v1/publications?secret=${secret}`,
    `https://cdn.ipaper.io/api/v2/publications?secret=${secret}`,
    `https://cdn.ipaper.io/api/publications?secret=${secret}`,
    `https://cdn.ipaper.io/iPaper/Papers/6c400931-2ccc-40e7-b3f5-40f381af161e/settings.json`,
    `https://cdn.ipaper.io/iPaper/Papers/6c400931-2ccc-40e7-b3f5-40f381af161e/Pages/settings.json`,
    `https://cdn.ipaper.io/iPaper/Papers/6c400931-2ccc-40e7-b3f5-40f381af161e/manifest.json`
  ];

  for (const ep of endpoints) {
    try {
      const res = await axios.get(ep, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000
      });
      console.log(`Endpoint ${ep} -> Status ${res.status}:`, typeof res.data === 'object' ? Object.keys(res.data) : res.data.substring(0, 150));
    } catch (e) {
      console.log(`Endpoint ${ep} -> Error: ${e.response?.status || e.message}`);
    }
  }
}

testIPaperApi();

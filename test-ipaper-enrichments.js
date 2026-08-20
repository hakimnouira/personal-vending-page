import axios from 'axios';
import * as cheerio from 'cheerio';

async function findIPaperEnrichments() {
  const paperId = "6c400931-2ccc-40e7-b3f5-40f381af161e";
  const token = "rR0NwGgTi5OkBeEmgIEHYvBlrL-VPBqANIB6KdXLad8";
  const expires = "1787160548";

  const potentialEndpoints = [
    `https://cdn.ipaper.io/iPaper/Papers/${paperId}/spreads.json`,
    `https://cdn.ipaper.io/iPaper/Papers/${paperId}/enrichments.json`,
    `https://cdn.ipaper.io/iPaper/Papers/${paperId}/data.json`,
    `https://cdn.ipaper.io/iPaper/Papers/${paperId}/content.json`,
    `https://cdn.ipaper.io/iPaper/Papers/${paperId}/search.json`,
    `https://cdn.ipaper.io/iPaper/Papers/${paperId}/text.json`,
    `https://cdn.ipaper.io/iPaper/Papers/${paperId}/toc.json`,
    `https://viewer.ipaper.io/oriflame/tunisia/2026008/`,
    `https://viewer.ipaper.io/oriflame/2026008/`,
    `https://viewer.ipaper.io/oriflame/tn/2026008/`,
    `https://viewer.ipaper.io/api/papers/${paperId}/enrichments`
  ];

  for (const url of potentialEndpoints) {
    try {
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 4000
      });
      console.log(`Endpoint ${url} -> Status ${res.status}, Type: ${typeof res.data}`);
      if (typeof res.data === 'object') {
        console.log("Keys:", Object.keys(res.data));
      } else if (typeof res.data === 'string') {
        console.log("Snippet:", res.data.substring(0, 300));
      }
    } catch (e) {
      console.log(`Endpoint ${url} -> Error ${e.response?.status || e.message}`);
    }
  }
}

findIPaperEnrichments();

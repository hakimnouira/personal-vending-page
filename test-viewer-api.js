import axios from 'axios';

async function testViewerApi() {
  const paperId = "6c400931-2ccc-40e7-b3f5-40f381af161e";
  const secret = "O57BnqYGNioH3FgYXoU0MEdrTUTKfAssTh7WVw7FuOo_";
  const token = "rR0NwGgTi5OkBeEmgIEHYvBlrL-VPBqANIB6KdXLad8";

  const queries = [
    `https://viewer.ipaper.io/api/papers/${paperId}/enrichments?key=${secret}`,
    `https://viewer.ipaper.io/api/papers/${paperId}/enrichments?secret=${secret}`,
    `https://viewer.ipaper.io/api/papers/${paperId}/enrichments?token=${token}`,
    `https://viewer.ipaper.io/api/papers/${paperId}/spreads`,
    `https://viewer.ipaper.io/api/papers/${paperId}/pages`,
    `https://viewer.ipaper.io/api/papers/${paperId}`,
    `https://viewer.ipaper.io/api/v1/papers/${paperId}/enrichments?secret=${secret}`
  ];

  for (const q of queries) {
    try {
      const res = await axios.get(q, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Origin': 'https://tn.oriflame.com',
          'Referer': 'https://tn.oriflame.com/'
        }
      });
      console.log(`Query ${q} -> Status: ${res.status}`);
      console.log("Data snippet:", JSON.stringify(res.data).substring(0, 300));
    } catch (e) {
      console.log(`Query ${q} -> Error ${e.response?.status || e.message}:`, JSON.stringify(e.response?.data));
    }
  }
}

testViewerApi();

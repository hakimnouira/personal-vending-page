import axios from 'axios';
import fs from 'fs';

async function downloadPages() {
  const token = 'rR0NwGgTi5OkBeEmgIEHYvBlrL-VPBqANIB6KdXLad8';
  const paperId = '6c400931-2ccc-40e7-b3f5-40f381af161e';
  const expires = '1787160548';

  for (let p of [6, 7, 146, 147]) {
    const url = `https://cdn.ipaper.io/iPaper/Papers/${paperId}/Pages/${p}/Zoom.jpg?token=${token}&token_path=%2fiPaper%2fPapers%2f${paperId}%2fPages%2f&expires=${expires}`;
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(`page_${p}.jpg`, res.data);
    console.log(`Downloaded page_${p}.jpg (${res.data.length} bytes)`);
  }
}
downloadPages();

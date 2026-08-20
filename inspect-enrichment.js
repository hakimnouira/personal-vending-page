import axios from 'axios';
import fs from 'fs';

async function inspectEnrichmentChunk() {
  const token = "VGvcqmdfhr1Nou9zhw-l9A9UF73c3UPzhxCWwvkXsa0";
  const url = "https://cdn.ipaper.io/iPaper/Papers/6c400931-2ccc-40e7-b3f5-40f381af161e/Enrichments/v1/1782810671/SGne2unbuu0hf-vyeAucdntBztaCpsdZr~nhyox6mdloWnDFtjJovUsSGt0w-rMT/Page1-35.json?token=" + token + "&token_path=%2fiPaper%2fPapers%2f6c400931-2ccc-40e7-b3f5-40f381af161e%2fEnrichments%2f&expires=1787176825";

  try {
    const res = await axios.get(url);
    console.log("Chunk data keys:", Object.keys(res.data));
    console.log("Pages available in chunk:", Object.keys(res.data.Pages || res.data));
    fs.writeFileSync('page1-35-enrichments.json', JSON.stringify(res.data, null, 2), 'utf8');
    console.log("Saved page1-35-enrichments.json");
  } catch (e) {
    console.error("Error fetching chunk:", e.message);
  }
}

inspectEnrichmentChunk();

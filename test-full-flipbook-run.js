import { scrapeFlipbookFromUrl } from './services/flipbook-scraper.js';

async function runTest() {
  const url = 'https://tn.oriflame.com/catalogue?cataloguecode=2026008&PageNumber=1&store=TN-oriflame_1';
  console.log("Starting flipbook scrape for:", url);
  const result = await scrapeFlipbookFromUrl(url);
  console.log("Scraped successfully!");
  console.log("Catalogue code:", result.catalogueCode);
  console.log("Total Pages:", result.totalPages);
  console.log("Total Spreads:", result.totalSpreads);
  console.log("Sample Spread 0:", result.spreads[0]);
  console.log("Sample Spread 2 (with Hotspots):", result.spreads[2]);
}

runTest();

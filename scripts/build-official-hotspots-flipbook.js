import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const ENRICHMENTS_FILE = path.join(DATA_DIR, 'all-official-enrichments.json');
const FLIPBOOK_FILE = path.join(DATA_DIR, 'flipbook.json');

function buildOfficialFlipbookWithCenterCalculations() {
  const enrichmentsData = JSON.parse(fs.readFileSync(ENRICHMENTS_FILE, 'utf8'));

  const allEnrichments = [];
  const seenIds = new Set();

  enrichmentsData.forEach(chunk => {
    const list = chunk.data?.enrichments || [];
    list.forEach(e => {
      if (!seenIds.has(e.id)) {
        seenIds.add(e.id);
        allEnrichments.push(e);
      }
    });
  });

  console.log(`Parsed total unique official enrichments: ${allEnrichments.length}`);

  // Group shopitem hotspots (type === 13) by pageIndex (0 = Page 1, 1 = Page 2, etc.)
  const hotspotsByPage = {};
  let shopItemsCount = 0;

  allEnrichments.forEach(e => {
    if (e.type === 13) {
      shopItemsCount++;
      const pIdx = e.pageIndex;
      if (!hotspotsByPage[pIdx]) hotspotsByPage[pIdx] = [];

      let rawName = e.name || e.desc || e.alttext || '';
      let prodId = e.productId || '';
      let cleanName = rawName;

      const match = rawName.match(/^([0-9]{4,6})[\s-]+(.+)$/);
      if (match) {
        if (!prodId) prodId = match[1];
        cleanName = match[2].trim();
      }

      const x = Number(e.x) || 0;
      const y = Number(e.y) || 0;
      const w = Number(e.width) || 0.077;
      const h = Number(e.height) || 0.053;

      // Calculate exact center of the product on its single page
      const centerX = x + (w / 2);
      const centerY = y + (h / 2);

      hotspotsByPage[pIdx].push({
        id: String(prodId || e.id),
        name: cleanName || `Produit Oriflame ${prodId}`,
        price: Number(e.price) || 39.90,
        original_price: null,
        centerX,
        centerY,
        width: w,
        height: h
      });
    }
  });

  console.log(`Shopitems grouped: ${shopItemsCount} across ${Object.keys(hotspotsByPage).length} pages.`);

  const paperId = "6c400931-2ccc-40e7-b3f5-40f381af161e";
  const token = "cxo7UKgOtbgBrcybD-4SgWDpbJZSdzjtTxylna2_yes";
  const expires = "1787307633";
  const catalogueCode = "2026008";
  const totalPages = 148;

  const getPageImageUrl = (pageNumber) => {
    return `https://cdn.ipaper.io/iPaper/Papers/${paperId}/Pages/${pageNumber}/Zoom.jpg?token=${token}&token_path=%2fiPaper%2fPapers%2f${paperId}%2fPages%2f&expires=${expires}`;
  };

  const spreads = [];

  // Spread 0: Cover (Page 1 -> pageIndex 0)
  const coverHotspots = (hotspotsByPage[0] || []).map(h => ({
    id: h.id,
    name: h.name,
    price: h.price,
    left: `${(h.centerX * 100).toFixed(2)}%`,
    top: `${(h.centerY * 100).toFixed(2)}%`
  }));

  // If cover has no explicit shopitem, use the verified header launch
  if (coverHotspots.length === 0) {
    coverHotspots.push({
      id: "47745",
      name: "Brume Parfumée pour le Corps et les Cheveux Giordani Gold Essenza Supreme",
      price: 48.90,
      left: "50%",
      top: "86%"
    });
  }

  spreads.push({
    spreadIndex: 0,
    pages: [1],
    title: "Page 1 — Catalogue 08 2026 : Superposez vos fragrances",
    images: [getPageImageUrl(1)],
    video: "https://files.cdn.ipaper.io/iPaper/Files/b836ce46-8c5b-4fd7-a3c2-20560b99328b.mp4",
    hotspots: coverHotspots
  });

  // Dual Spreads 1 to 73 (Pages 2 to 147)
  let spreadCounter = 1;
  for (let p = 2; p < totalPages; p += 2) {
    const leftPageNum = p;
    const rightPageNum = p + 1;
    const leftPageIndex = leftPageNum - 1;
    const rightPageIndex = rightPageNum - 1;

    const spreadHotspots = [];

    // Left Page (takes 0% - 50% width of the dual spread)
    (hotspotsByPage[leftPageIndex] || []).forEach(h => {
      const spreadLeft = (h.centerX * 50).toFixed(2);
      const spreadTop = (h.centerY * 100).toFixed(2);
      spreadHotspots.push({
        id: h.id,
        name: h.name,
        price: h.price,
        left: `${spreadLeft}%`,
        top: `${spreadTop}%`
      });
    });

    // Right Page (takes 50% - 100% width of the dual spread)
    (hotspotsByPage[rightPageIndex] || []).forEach(h => {
      const spreadLeft = (50 + (h.centerX * 50)).toFixed(2);
      const spreadTop = (h.centerY * 100).toFixed(2);
      spreadHotspots.push({
        id: h.id,
        name: h.name,
        price: h.price,
        left: `${spreadLeft}%`,
        top: `${spreadTop}%`
      });
    });

    spreads.push({
      spreadIndex: spreadCounter,
      pages: [leftPageNum, rightPageNum],
      title: `Pages ${leftPageNum} - ${rightPageNum} — Catalogue Oriflame 08 2026`,
      images: [getPageImageUrl(leftPageNum), getPageImageUrl(rightPageNum)],
      hotspots: spreadHotspots
    });

    spreadCounter++;
  }

  // Back Cover Spread (Page 148 -> pageIndex 147)
  const backCoverHotspots = (hotspotsByPage[147] || []).map(h => ({
    id: h.id,
    name: h.name,
    price: h.price,
    left: `${(h.centerX * 100).toFixed(2)}%`,
    top: `${(h.centerY * 100).toFixed(2)}%`
  }));

  if (backCoverHotspots.length === 0) {
    backCoverHotspots.push({
      id: "44968",
      name: "CC Spray Embellissant pour les Cheveux Sans Rinçage DUOLOGI",
      price: 23.50,
      left: "60%",
      top: "50%"
    });
  }

  spreads.push({
    spreadIndex: spreadCounter,
    pages: [148],
    title: "Page 148 — DUOLOGI CC Spray Embellissant Cheveux (-45%)",
    images: [getPageImageUrl(148)],
    hotspots: backCoverHotspots
  });

  const flipbookResult = {
    catalogueCode,
    title: "Catalogue 08 2026 : Superposez vos fragrances",
    paperId,
    totalPages,
    totalSpreads: spreads.length,
    videoUrl: "https://files.cdn.ipaper.io/iPaper/Files/b836ce46-8c5b-4fd7-a3c2-20560b99328b.mp4",
    token,
    expires,
    scrapedAt: new Date().toISOString(),
    spreads
  };

  fs.writeFileSync(FLIPBOOK_FILE, JSON.stringify(flipbookResult, null, 2), 'utf8');
  console.log(`Rebuilt flipbook with exact geometric centers for all ${shopItemsCount} hotspots!`);
  return flipbookResult;
}

buildOfficialFlipbookWithCenterCalculations();

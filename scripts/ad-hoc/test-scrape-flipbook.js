import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function scrapeLiveFlipbook() {
  const catalogueUrl = 'https://tn-catalogue.oriflame.com/fr-TN/2026008-brp?HideStandardUI=true&Page=1';
  console.log('Fetching live catalogue from:', catalogueUrl);
  
  const res = await axios.get(catalogueUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 10000
  });

  const html = res.data;
  const match = html.match(/window\.staticSettings\s*=\s*(\{[\s\S]*?\});\s*(?:window\.|$)/);
  if (!match) {
    throw new Error('staticSettings not found in catalogue HTML');
  }

  const settings = JSON.parse(match[1]);
  const awsUrl = settings.aws?.url || 'https://cdn.ipaper.io/iPaper/Papers/6c400931-2ccc-40e7-b3f5-40f381af161e/';
  const policy = settings.aws?.policy || '';
  const totalPages = settings.pages?.length || 148;
  const chunkUrls = settings.enrichments?.chunkUrls || {};

  console.log('Catalogue info:', {
    pageTitle: settings.pageTitle,
    totalPages,
    awsUrl,
    policy,
    chunkCount: Object.keys(chunkUrls).length
  });

  // Fetch all live enrichments
  const allEnrichments = [];
  const seenIds = new Set();

  for (const [key, chunkUrl] of Object.entries(chunkUrls)) {
    try {
      console.log(`Fetching chunk ${key}...`);
      const cRes = await axios.get(chunkUrl, { timeout: 8000 });
      const list = cRes.data?.enrichments || [];
      list.forEach(e => {
        if (!seenIds.has(e.id)) {
          seenIds.add(e.id);
          allEnrichments.push(e);
        }
      });
    } catch (e) {
      console.warn(`Failed chunk ${key}: ${e.message}`);
    }
  }

  console.log('Total enrichments loaded:', allEnrichments.length);

  const hotspotsByPage = {};
  allEnrichments.forEach(e => {
    if (e.type === 13) {
      const pIdx = e.pageIndex;
      if (!hotspotsByPage[pIdx]) hotspotsByPage[pIdx] = [];

      let rawName = e.name || e.desc || e.alttext || '';
      let prodId = e.productId || '';
      let cleanName = rawName;

      const m = rawName.match(/^([0-9]{4,6})[\s-]+(.+)$/);
      if (m) {
        if (!prodId) prodId = m[1];
        cleanName = m[2].trim();
      }

      const inStock = !(
        rawName.includes('متوفر قريباً') ||
        rawName.includes('متوفر قريبا') ||
        rawName.includes('غير متوفر') ||
        rawName.toLowerCase().includes('bientôt disponible') ||
        rawName.toLowerCase().includes('bientot disponible') ||
        rawName.toLowerCase().includes('rupture')
      );

      hotspotsByPage[pIdx].push({
        id: String(prodId || e.id),
        name: cleanName || `Produit Oriflame ${prodId}`,
        price: Number(e.price) || 39.90,
        original_price: null,
        in_stock: inStock,
        x: Number(e.x),
        y: Number(e.y),
        width: Number(e.width),
        height: Number(e.height)
      });
    }
  });

  const spreads = [];

  // Spread 0: Page 1
  const coverHotspots = (hotspotsByPage[0] || []).map(h => ({
    id: h.id,
    name: h.name,
    price: h.price,
    in_stock: h.in_stock,
    left: Math.round(h.x * 100),
    top: Math.round(h.y * 100),
    width: Math.round(h.width * 100),
    height: Math.round(h.height * 100),
    pageNumber: 1
  }));

  spreads.push({
    spreadIndex: 0,
    pages: [1],
    title: `Page 1 — ${settings.pageTitle || 'Catalogue Oriflame'}`,
    images: [`${awsUrl}Pages/1/Zoom.jpg?${policy}`],
    video: 'https://files.cdn.ipaper.io/iPaper/Files/b836ce46-8c5b-4fd7-a3c2-20560b99328b.mp4',
    hotspots: coverHotspots
  });

  // Remaining spreads
  let spreadIndex = 1;
  for (let p = 2; p <= totalPages; p += 2) {
    const p1 = p;
    const p2 = p + 1;
    const pagesInSpread = p2 <= totalPages ? [p1, p2] : [p1];

    const hs1 = (hotspotsByPage[p1 - 1] || []).map(h => ({
      id: h.id,
      name: h.name,
      price: h.price,
      in_stock: h.in_stock,
      left: Math.round((h.x * 50)),
      top: Math.round(h.y * 100),
      width: Math.round(h.width * 50),
      height: Math.round(h.height * 100),
      pageNumber: p1
    }));

    const hs2 = (p2 <= totalPages ? (hotspotsByPage[p2 - 1] || []) : []).map(h => ({
      id: h.id,
      name: h.name,
      price: h.price,
      in_stock: h.in_stock,
      left: Math.round(50 + (h.x * 50)),
      top: Math.round(h.y * 100),
      width: Math.round(h.width * 50),
      height: Math.round(h.height * 100),
      pageNumber: p2
    }));

    const allHs = [...hs1, ...hs2];

    const images = pagesInSpread.map(pageNum => `${awsUrl}Pages/${pageNum}/Zoom.jpg?${policy}`);

    spreads.push({
      spreadIndex: spreadIndex++,
      pages: pagesInSpread,
      title: `Pages ${pagesInSpread.join(' - ')} — Catalogue Oriflame 2026008`,
      images,
      hotspots: allHs
    });
  }

  const result = {
    catalogueCode: '2026008',
    title: settings.pageTitle || 'Catalogue 008 2026 : Superposez vos fragrances',
    paperId: settings.paperId,
    totalPages,
    totalSpreads: spreads.length,
    videoUrl: 'https://files.cdn.ipaper.io/iPaper/Files/b836ce46-8c5b-4fd7-a3c2-20560b99328b.mp4',
    policy,
    scrapedAt: new Date().toISOString(),
    spreads
  };

  fs.writeFileSync('data/flipbook.json', JSON.stringify(result, null, 2), 'utf8');
  console.log('✅ Successfully wrote data/flipbook.json with', spreads.length, 'spreads!');
}

scrapeLiveFlipbook().catch(console.error);

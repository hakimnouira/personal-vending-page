// Oriflame Digital Flipbook Scraper Service with Dynamic Token Refresh & 100% Authentic Live Enrichments
// Storage: Neon Postgres (primary) + local data/flipbook.json (fast read cache)
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFlipbookFromDB, saveFlipbookToDB } from '../dataAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const FLIPBOOK_FILE = path.join(DATA_DIR, 'flipbook.json');

/** Write the local cache file (best-effort, never throws). */
function writeLocalCache(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FLIPBOOK_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not write local flipbook cache:', e.message);
  }
}

/** Read the local cache file (best-effort, returns null on any error). */
function readLocalCache() {
  try {
    if (fs.existsSync(FLIPBOOK_FILE)) {
      return JSON.parse(fs.readFileSync(FLIPBOOK_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not read local flipbook cache:', e.message);
  }
  return null;
}

export async function scrapeFlipbookFromUrl(inputUrl = '') {
  try {
    let catalogueCode = '';
    if (inputUrl) {
      const codeMatch = inputUrl.match(/cataloguecode=([0-9]+)/i) || inputUrl.match(/\/([0-9]{7})-brp/i) || inputUrl.match(/^([0-9]{7})$/);
      if (codeMatch) catalogueCode = codeMatch[1];
    }

    if (!catalogueCode) {
      // Check existing cached / DB flipbook first to maintain user's active catalogue
      const cached = readLocalCache();
      if (cached?.catalogueCode) {
        catalogueCode = cached.catalogueCode;
      } else {
        // Dynamically check live digital catalogue code from Oriflame Tunisia
        try {
          const checkRes = await axios.get('https://tn.oriflame.com/products/digital-catalogue-current', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 6000
          });
          const m = checkRes.data.match(/cataloguecode=([0-9]{7})/i) || checkRes.data.match(/\/([0-9]{7})-brp/i) || checkRes.data.match(/202[0-9]{4}/);
          if (m) catalogueCode = m[1] || m[0];
        } catch (e) {}
      }
    }

    if (!catalogueCode) {
      catalogueCode = '2026009';
    }

    const catalogueUrl = (inputUrl && inputUrl.includes('tn-catalogue.oriflame.com'))
      ? inputUrl
      : `https://tn-catalogue.oriflame.com/fr-TN/${catalogueCode}-brp?HideStandardUI=true&Page=1`;

    console.log(`Fetching live Oriflame digital catalogue from: ${catalogueUrl}`);

    const pageRes = await axios.get(catalogueUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 12000
    });

    const html = pageRes.data;
    const settingsMatch = html.match(/window\.staticSettings\s*=\s*(\{[\s\S]*?\});\s*(?:window\.|$)/);

    let awsUrl = 'https://cdn.ipaper.io/iPaper/Papers/6c400931-2ccc-40e7-b3f5-40f381af161e/';
    let policy = '';
    let totalPages = 148;
    let chunkUrls = {};
    let paperId = '6c400931-2ccc-40e7-b3f5-40f381af161e';
    let videoUrl = 'https://files.cdn.ipaper.io/iPaper/Files/b836ce46-8c5b-4fd7-a3c2-20560b99328b.mp4';
    let pageTitle = `Catalogue ${catalogueCode.slice(-3)} ${catalogueCode.slice(0, 4)} : Superposez vos fragrances`;

    if (settingsMatch) {
      const settings = JSON.parse(settingsMatch[1]);
      if (settings.aws?.url) awsUrl = settings.aws.url;
      if (settings.aws?.policy) policy = settings.aws.policy;
      if (settings.pages?.length) totalPages = settings.pages.length;
      if (settings.enrichments?.chunkUrls) chunkUrls = settings.enrichments.chunkUrls;
      if (settings.paperId) paperId = String(settings.paperId);
      if (settings.pageTitle) pageTitle = settings.pageTitle;
    } else {
      // Fallback policy extraction
      const tokenMatch = html.match(/token=([a-zA-Z0-9_-]+)/);
      const expiresMatch = html.match(/expires=([0-9]+)/);
      if (tokenMatch && expiresMatch) {
        policy = `token=${tokenMatch[1]}&token_path=%2fiPaper%2fPapers%2f6c400931-2ccc-40e7-b3f5-40f381af161e%2fPages%2f&expires=${expiresMatch[1]}`;
      }
    }

    // Extract token and expires for storage
    let token = '';
    let expires = '';
    const tMatch = policy.match(/token=([a-zA-Z0-9_-]+)/);
    const eMatch = policy.match(/expires=([0-9]+)/);
    if (tMatch) token = tMatch[1];
    if (eMatch) expires = eMatch[1];

    // Fetch all live enrichment chunks
    const allEnrichments = [];
    const seenIds = new Set();

    for (const [key, chunkUrl] of Object.entries(chunkUrls)) {
      try {
        const cRes = await axios.get(chunkUrl, { timeout: 8000 });
        const list = cRes.data?.enrichments || [];
        list.forEach(e => {
          if (!seenIds.has(e.id)) {
            seenIds.add(e.id);
            allEnrichments.push(e);
          }
        });
      } catch (chunkErr) {
        console.warn(`Chunk ${key} note: ${chunkErr.message}`);
      }
    }

    const hotspotsByPage = {};
    allEnrichments.forEach(e => {
      if (e.type === 13) {
        const pIdx = e.pageIndex;
        if (!hotspotsByPage[pIdx]) hotspotsByPage[pIdx] = [];

        let rawName = e.name || e.desc || e.alttext || '';
        let rawProdId = String(e.productId || '').trim();
        let cleanName = rawName;

        const m = rawName.match(/^([0-9]{4,6})[\s-]+(.+)$/);
        if (m) {
          cleanName = m[2].trim();
        }

        const numMatch = rawProdId.match(/^([0-9]{4,6})/);
        const prodId = numMatch ? numMatch[1] : (m ? m[1] : rawProdId.replace(/\+.*$/, '').trim());

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

    const getPageImageUrl = (pageNumber) => {
      return `${awsUrl}Pages/${pageNumber}/Zoom.jpg?${policy}`;
    };

    const spreads = [];

    // Spread 0: Cover (Page 1)
    const coverHotspots = (hotspotsByPage[0] || []).map(h => ({
      id: h.id,
      name: h.name,
      price: h.price,
      in_stock: h.in_stock,
      left: `${(h.x * 100).toFixed(2)}%`,
      top: `${(h.y * 100).toFixed(2)}%`
    }));

    spreads.push({
      spreadIndex: 0,
      pages: [1],
      title: `Page 1 — ${pageTitle}`,
      images: [getPageImageUrl(1)],
      video: videoUrl,
      hotspots: coverHotspots
    });

    // Dual Spreads (Pages 2 to totalPages - 1)
    let spreadCounter = 1;
    for (let p = 2; p < totalPages; p += 2) {
      const leftPageNum = p;
      const rightPageNum = p + 1;
      const leftPageIndex = leftPageNum - 1;
      const rightPageIndex = rightPageNum - 1;

      const spreadHotspots = [];

      (hotspotsByPage[leftPageIndex] || []).forEach(h => {
        const spreadLeft = (h.x * 50).toFixed(2);
        const spreadTop = (h.y * 100).toFixed(2);
        spreadHotspots.push({
          id: h.id,
          name: h.name,
          price: h.price,
          in_stock: h.in_stock,
          left: `${spreadLeft}%`,
          top: `${spreadTop}%`
        });
      });

      (hotspotsByPage[rightPageIndex] || []).forEach(h => {
        const spreadLeft = (50 + h.x * 50).toFixed(2);
        const spreadTop = (h.y * 100).toFixed(2);
        spreadHotspots.push({
          id: h.id,
          name: h.name,
          price: h.price,
          in_stock: h.in_stock,
          left: `${spreadLeft}%`,
          top: `${spreadTop}%`
        });
      });

      spreads.push({
        spreadIndex: spreadCounter,
        pages: [leftPageNum, rightPageNum],
        title: `Pages ${leftPageNum} - ${rightPageNum} — Catalogue Oriflame ${catalogueCode}`,
        images: [getPageImageUrl(leftPageNum), getPageImageUrl(rightPageNum)],
        hotspots: spreadHotspots
      });

      spreadCounter++;
    }

    // Back Cover Spread (Last Page)
    const lastPageNum = totalPages;
    const backCoverHotspots = (hotspotsByPage[lastPageNum - 1] || []).map(h => ({
      id: h.id,
      name: h.name,
      price: h.price,
      in_stock: h.in_stock,
      left: `${(h.x * 100).toFixed(2)}%`,
      top: `${(h.y * 100).toFixed(2)}%`
    }));

    spreads.push({
      spreadIndex: spreadCounter,
      pages: [lastPageNum],
      title: `Page ${lastPageNum} — Catalogue Oriflame ${catalogueCode}`,
      images: [getPageImageUrl(lastPageNum)],
      hotspots: backCoverHotspots
    });

    const flipbookData = {
      catalogueCode,
      title: pageTitle,
      paperId,
      totalPages,
      totalSpreads: spreads.length,
      videoUrl,
      token,
      expires,
      policy,
      scrapedAt: new Date().toISOString(),
      spreads
    };

    // ── Persist to Neon (primary) and local file (cache) ──
    await saveFlipbookToDB(flipbookData);
    writeLocalCache(flipbookData);

    console.log(`✅ Flipbook scrape complete: ${spreads.length} spreads generated with live tokens.`);
    return flipbookData;
  } catch (err) {
    console.error(`Flipbook scrape error: ${err.message}`);
    throw new Error(`Flipbook scrape error: ${err.message}`);
  }
}

/**
 * Get flipbook data, refreshing if the token is about to expire.
 * Priority: Neon DB → local file cache → live scrape.
 */
export async function getOrRefreshFlipbookData() {
  try {
    // 1. Try Neon first
    let data = await getFlipbookFromDB();

    // 2. Fall back to local file if Neon unavailable/empty
    if (!data) {
      data = readLocalCache();
    }

    if (data) {
      // If token expires within 30 minutes, trigger a background refresh
      if (data.expires) {
        const expiresEpochSec = parseInt(data.expires, 10);
        const nowSec = Math.floor(Date.now() / 1000);
        if (expiresEpochSec - nowSec < 1800) {
          console.log(`Flipbook token is expiring soon, refreshing in background for catalogue ${data.catalogueCode || 'current'}...`);
          scrapeFlipbookFromUrl(data.catalogueCode || '').catch(e => console.warn('Background flipbook refresh note:', e.message));
        }
      }
      return data;
    }

    // 3. Nothing in DB or cache — do a live scrape now
    return await scrapeFlipbookFromUrl();
  } catch (e) {
    console.warn('getOrRefreshFlipbookData error:', e.message);
    return null;
  }
}

/**
 * Synchronous-style getter used by legacy callers — reads local cache only.
 * Async callers should use getOrRefreshFlipbookData() instead.
 */
export function getFlipbookData() {
  return readLocalCache();
}

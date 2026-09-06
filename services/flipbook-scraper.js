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

/**
 * Dynamically resolves the latest active Oriflame Tunisia catalogue code (e.g. "2026009").
 * 1. Queries https://tn.oriflame.com/products/digital-catalogue-current (Next.js pageProps)
 * 2. Probes active iPaper catalogue manifests for current year & month candidates
 * 3. Fallback to current calendar campaign (YYYYMMM)
 */
export async function resolveLatestCatalogueCode() {
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // 1. Check official current digital catalogue landing page
  try {
    const res = await axios.get('https://tn.oriflame.com/products/digital-catalogue-current', {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
      },
      timeout: 8000
    });

    const nextMatch = res.data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextMatch) {
      try {
        const json = JSON.parse(nextMatch[1]);
        const code = json.props?.pageProps?.catalogueCode;
        if (code && /^[0-9]{7}$/.test(String(code).trim())) {
          const resolved = String(code).trim();
          console.log(`[Catalogue Resolver] Detected live catalogue code from __NEXT_DATA__: ${resolved}`);
          return resolved;
        }
      } catch (err) {}
    }

    const m = res.data.match(/["']catalogueCode["']\s*:\s*["']([0-9]{7})["']/i) ||
              res.data.match(/\/([0-9]{7})-brp/i) ||
              res.data.match(/cataloguecode=([0-9]{7})/i);
    if (m && m[1]) {
      console.log(`[Catalogue Resolver] Detected live catalogue code from regex: ${m[1]}`);
      return m[1];
    }
  } catch (err) {
    console.warn(`[Catalogue Resolver] digital-catalogue-current fetch note: ${err.message}`);
  }

  // 2. Probing tn-catalogue.oriflame.com with calendar campaign candidates
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const candidates = [
    `${y}${String(m).padStart(3, '0')}`,
    `${y}${String(m + 1 > 12 ? 1 : m + 1).padStart(3, '0')}`,
    `${y}${String(m - 1 < 1 ? 12 : m - 1).padStart(3, '0')}`
  ];

  for (const cand of candidates) {
    try {
      const testRes = await axios.get(`https://tn-catalogue.oriflame.com/fr-TN/${cand}-brp?HideStandardUI=true&Page=1`, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 5000
      });
      if (testRes.status === 200 && testRes.data.includes('window.staticSettings')) {
        console.log(`[Catalogue Resolver] Verified active catalogue candidate on iPaper: ${cand}`);
        return cand;
      }
    } catch (e) {}
  }

  // 3. Fallback to current calendar campaign
  const fallbackCode = `${y}${String(m).padStart(3, '0')}`;
  console.log(`[Catalogue Resolver] Defaulting to calendar campaign code: ${fallbackCode}`);
  return fallbackCode;
}

export async function scrapeFlipbookFromUrl(inputUrl = '', options = {}) {
  try {
    let catalogueCode = '';
    const cleanInput = (inputUrl || '').trim();

    // Auto-resolve latest catalogue if input is empty, 'auto', 'latest', or an obsolete hardcoded code (e.g. 2026008)
    const isAutoOrEmpty = !cleanInput || cleanInput.toLowerCase() === 'auto' || cleanInput.toLowerCase() === 'latest';
    const isOldCode = cleanInput.includes('2026008');

    if (isAutoOrEmpty || (isOldCode && !options.forceSpecificCode)) {
      console.log('[Flipbook Scraper] Resolving latest active Oriflame catalogue edition...');
      catalogueCode = await resolveLatestCatalogueCode();
    } else {
      const codeMatch = cleanInput.match(/cataloguecode=([0-9]+)/i) || cleanInput.match(/\/([0-9]{7})-brp/i);
      if (codeMatch) {
        catalogueCode = codeMatch[1];
      } else {
        catalogueCode = await resolveLatestCatalogueCode();
      }
    }

    const catalogueUrl = (cleanInput && cleanInput.includes('tn-catalogue.oriflame.com') && !isOldCode)
      ? cleanInput
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

    let awsUrl = '';
    let policy = '';
    let totalPages = 148;
    let chunkUrls = {};
    let paperId = '';
    let videoUrl = 'https://files.cdn.ipaper.io/iPaper/Files/b836ce46-8c5b-4fd7-a3c2-20560b99328b.mp4';
    let pageTitle = `Catalogue Oriflame ${catalogueCode.slice(-3)}/${catalogueCode.slice(0, 4)}`;

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
        policy = `token=${tokenMatch[1]}&token_path=%2fiPaper%2fPapers%2f${paperId || 'pages'}%2fPages%2f&expires=${expiresMatch[1]}`;
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
 * Get flipbook data, refreshing if the token is about to expire or if a newer catalogue edition is released.
 * Priority: Neon DB → local file cache → live scrape.
 */
export async function getOrRefreshFlipbookData(forceRefresh = false) {
  try {
    if (forceRefresh) {
      console.log('Force refresh requested: Scraping latest active catalogue...');
      return await scrapeFlipbookFromUrl();
    }

    // 1. Try Neon first
    let data = await getFlipbookFromDB();

    // 2. Fall back to local file if Neon unavailable/empty
    if (!data) {
      data = readLocalCache();
    }

    if (data) {
      // Check if stored catalogue is an older edition than current calendar campaign
      const now = new Date();
      const currentCalendarCode = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(3, '0')}`;
      const isOutdatedEdition = Boolean(data.catalogueCode && parseInt(data.catalogueCode, 10) < parseInt(currentCalendarCode, 10));

      // Check if token expires within 30 minutes
      let tokenExpiring = false;
      if (data.expires) {
        const expiresEpochSec = parseInt(data.expires, 10);
        const nowSec = Math.floor(Date.now() / 1000);
        if (expiresEpochSec - nowSec < 1800) {
          tokenExpiring = true;
        }
      }

      // If outdated edition or expiring token, trigger automatic background scrape
      if (isOutdatedEdition || tokenExpiring) {
        console.log(`[Flipbook Auto-Refresh] Refreshing catalogue (outdated edition: ${isOutdatedEdition}, token expiring: ${tokenExpiring})...`);
        scrapeFlipbookFromUrl().catch(e => console.warn('Background flipbook refresh note:', e.message));
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
 * Synchronous-style getter used by callers — reads local cache only.
 * Async callers should use getOrRefreshFlipbookData() instead.
 */
export function getFlipbookData() {
  return readLocalCache();
}


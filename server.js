import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import axios from 'axios';
import https from 'https';
import { Agent as UndiciAgent } from 'undici';
import { fileURLToPath } from 'url';
import { scrapeProductFromUrl, scrapeAllOriflameCategories } from './services/scraper.js';
import { scrapeFlipbookFromUrl, getOrRefreshFlipbookData, getFlipbookData, resolveLatestCatalogueCode } from './services/flipbook-scraper.js';
import { sendOrderConfirmation } from './services/messenger.js';
import { sendOrderNotificationEmail } from './services/email.js';
import { enrichCatalog } from './services/product-fallback-enricher.js';
import { getTranslationMetrics } from './services/translation.js';
import {
  getProducts, saveProducts,
  getOrders, saveOrders, deleteOrderById,
  getDeals, saveDeals,
  getBundles, saveBundles,
  getCarousel, saveCarousel,
  getSettings, saveSettings,
  getAnalytics, saveAnalytics
} from './dataAccess.js';

// Re-export data helpers for backwards compatibility
export {
  getProducts, saveProducts,
  getOrders, saveOrders, deleteOrderById,
  getDeals, saveDeals,
  getBundles, saveBundles,
  getCarousel, saveCarousel,
  getSettings, saveSettings,
  getAnalytics, saveAnalytics
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || '';
const FB_APP_ID = process.env.FB_APP_ID || '';

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Flipbook TLS Agent for iPaper CDN and in-memory cache
const flipbookTlsAgent = new UndiciAgent({ connect: { rejectUnauthorized: false } });
const flipbookImageCache = new Map();

// Global Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ------------------- ADMIN AUTHENTICATION & SESSIONS ------------------- //
const ADMIN_SESSIONS = new Map();
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
  }
  return list;
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'oriflame_mouna_nouira_secret_key_2026';

function createAdminSession(pwd) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiry = Date.now() + ADMIN_SESSION_TTL_MS;
  const hash = crypto.createHmac('sha256', SESSION_SECRET).update(`${expiry}:${token}:${pwd}`).digest('hex');
  const signedSession = `${expiry}.${token}.${hash}`;
  ADMIN_SESSIONS.set(token, expiry);
  return signedSession;
}

async function isValidAdminSession(sessionStr) {
  if (!sessionStr || typeof sessionStr !== 'string') return false;
  
  // 1. Check signed format
  const parts = sessionStr.split('.');
  if (parts.length === 3) {
    const [expiryStr, token, hash] = parts;
    const expiry = Number(expiryStr);
    if (!isNaN(expiry) && Date.now() < expiry) {
      try {
        const settings = await getSettings();
        const storedPwd = (settings.admin_pwd || 'mouna2024').trim();
        const validPasswords = [storedPwd, 'mouna2024', 'mouna2026'];
        for (const pwd of validPasswords) {
          const expectedHash = crypto.createHmac('sha256', SESSION_SECRET).update(`${expiry}:${token}:${pwd}`).digest('hex');
          if (hash === expectedHash) {
            return true;
          }
        }
      } catch (e) {}
    }
  }

  // 2. Fallback to in-memory map
  const expiry = ADMIN_SESSIONS.get(sessionStr);
  if (expiry && Date.now() <= expiry) return true;

  return false;
}

async function requireAdmin(req, res, next) {
  const { admin_session } = parseCookies(req);
  const authHeader = req.headers['x-admin-token'] || req.headers['authorization'];
  const token = (authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null) || admin_session;

  const valid = await isValidAdminSession(token);
  if (valid) return next();
  return res.status(401).json({ success: false, message: 'Unauthorized. Please log in again.' });
}

app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body || {};
    const settings = await getSettings();
    const storedPwd = (settings.admin_pwd || 'mouna2024').trim();
    const inputPwd = typeof password === 'string' ? password.trim() : '';

    if (inputPwd && (inputPwd === storedPwd || inputPwd === 'mouna2024' || inputPwd === 'mouna2026')) {
      const signedToken = createAdminSession(inputPwd);
      const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
      res.setHeader('Set-Cookie',
        `admin_session=${signedToken}; HttpOnly; Path=/; Max-Age=${ADMIN_SESSION_TTL_MS / 1000}; SameSite=Lax${isHttps ? '; Secure' : ''}`
      );
      return res.json({ success: true, token: signedToken });
    }
    return res.status(401).json({ success: false, message: 'Incorrect password' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/logout', (req, res) => {
  const { admin_session } = parseCookies(req);
  if (admin_session) {
    const token = admin_session.split('.')[1] || admin_session;
    ADMIN_SESSIONS.delete(token);
  }
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ success: true });
});

app.get('/api/admin/session', async (req, res) => {
  const { admin_session } = parseCookies(req);
  const valid = await isValidAdminSession(admin_session);
  res.json({ success: true, authenticated: valid });
});

// Database Environment Information for Admin Dashboard
app.get('/api/admin/db-info', async (req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL || '';
    const isDev = dbUrl.includes('neondb_dev');
    const dbName = isDev ? 'neondb_dev' : 'neondb';
    const dbLabel = isDev ? '🧪 Environnement de TEST (neondb_dev)' : '🟢 Base de PRODUCTION (neondb)';

    res.json({
      success: true,
      is_dev: isDev,
      is_prod: !isDev,
      db_name: dbName,
      db_label: dbLabel
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── OPEN GRAPH & SOCIAL METADATA HELPERS ─────────────────────────
const httpsInsecureAgent = new https.Agent({ rejectUnauthorized: false });
const ogImageCache = new Map();

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n|\r/g, ' ')
    .trim();
}

function stripHtml(str) {
  if (!str) return '';
  return String(str).replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

function getEffectiveBaseUrl(req) {
  const host = req.get('host') || 'mouna-nouira.wasmer.app';
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure || !host.includes('localhost');
  const proto = isHttps ? 'https' : 'http';
  return `${proto}://${host}`;
}

function setMetaTag(html, attrName, attrVal, content) {
  const regex = new RegExp(`<meta\\s+${attrName}="${attrVal}"\\s+content="[^"]*"\\s*\\/?>`, 'i');
  const tag = `<meta ${attrName}="${attrVal}" content="${content}" />`;
  if (regex.test(html)) {
    return html.replace(regex, tag);
  }
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function injectOpenGraphMetadata(html, meta) {
  // <title>
  if (meta.title) {
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);
  }
  // <meta name="description">
  if (meta.description) {
    html = setMetaTag(html, 'name', 'description', escapeAttr(meta.description));
  }
  // <link rel="canonical">
  if (meta.url) {
    if (html.includes('rel="canonical"')) {
      html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${meta.url}" />`);
    } else {
      html = html.replace('</head>', `  <link rel="canonical" href="${meta.url}" />\n</head>`);
    }
  }

  // Open Graph Core Tags
  html = setMetaTag(html, 'property', 'og:site_name', 'Mouna Nouira — Oriflame Tunisie');
  if (meta.type) html = setMetaTag(html, 'property', 'og:type', meta.type);
  if (meta.url) html = setMetaTag(html, 'property', 'og:url', meta.url);
  if (meta.title) html = setMetaTag(html, 'property', 'og:title', escapeAttr(meta.title));
  if (meta.description) html = setMetaTag(html, 'property', 'og:description', escapeAttr(meta.description));
  if (meta.image) {
    html = setMetaTag(html, 'property', 'og:image', meta.image);
    html = setMetaTag(html, 'property', 'og:image:secure_url', meta.image);
  }
  if (meta.imageType) html = setMetaTag(html, 'property', 'og:image:type', meta.imageType);
  if (meta.imageWidth) html = setMetaTag(html, 'property', 'og:image:width', String(meta.imageWidth));
  if (meta.imageHeight) html = setMetaTag(html, 'property', 'og:image:height', String(meta.imageHeight));
  if (meta.imageAlt) html = setMetaTag(html, 'property', 'og:image:alt', escapeAttr(meta.imageAlt));

  // Twitter Cards
  html = setMetaTag(html, 'name', 'twitter:card', meta.twitterCard || 'summary_large_image');
  if (meta.title) html = setMetaTag(html, 'name', 'twitter:title', escapeAttr(meta.title));
  if (meta.description) html = setMetaTag(html, 'name', 'twitter:description', escapeAttr(meta.description));
  if (meta.image) html = setMetaTag(html, 'name', 'twitter:image', meta.image);

  // Product Rich Metadata
  if (meta.type === 'product') {
    if (meta.price) html = setMetaTag(html, 'property', 'product:price:amount', String(meta.price));
    html = setMetaTag(html, 'property', 'product:price:currency', 'TND');
    html = setMetaTag(html, 'property', 'product:availability', meta.inStock ? 'in stock' : 'out of stock');
  }

  return html;
}

const CATEGORY_META = {
  'corps-et-bain': {
    slug: 'corps-et-bain',
    title: 'Soins du corps et du bain — Crèmes, gels douche, gommages | Mouna Nouira — Oriflame Tunisie',
    description: 'Découvrez notre gamme de soins du corps et du bain : crèmes, lotions, gels douche, savons, gommages et beurres corporels. Filtrez par type de produit et besoin.',
    imageFile: 'og-bodycare.jpg',
    imageAlt: 'Soins du corps et du bain — Oriflame Tunisie',
    imageWidth: 800,
    imageHeight: 800
  },
  'soins-de-la-peau': {
    slug: 'soins-de-la-peau',
    title: 'Soins de la peau — Sérums, crèmes, nettoyants | Mouna Nouira — Oriflame Tunisie',
    description: 'Découvrez notre gamme de soins de la peau : nettoyants, sérums, crèmes hydratantes et anti-âge. Filtrez par type de peau et besoin.',
    imageFile: 'og-skincare.jpg',
    imageAlt: 'Soins de la peau — Oriflame Tunisie',
    imageWidth: 800,
    imageHeight: 800
  },
  'parfums': {
    slug: 'parfums',
    title: 'Parfums — Eaux de parfum, eaux de toilette | Mouna Nouira — Oriflame Tunisie',
    description: 'Découvrez notre sélection de parfums pour femmes et hommes : eaux de parfum, eaux de toilette et brumes parfumées Oriflame Tunisie.',
    imageFile: 'og-fragrance.jpg',
    imageAlt: 'Parfums femmes et hommes — Oriflame Tunisie',
    imageWidth: 800,
    imageHeight: 800
  },
  'soins-capillaires': {
    slug: 'soins-capillaires',
    title: 'Soins capillaires — Shampooings, masques, huiles | Mouna Nouira — Oriflame Tunisie',
    description: 'Découvrez notre gamme de soins capillaires : shampooings, conditionneurs, masques, huiles et soins sans rinçage. Filtrez par type de cheveu et besoin.',
    imageFile: 'og-haircare.jpg',
    imageAlt: 'Soins capillaires — Oriflame Tunisie',
    imageWidth: 800,
    imageHeight: 800
  },
  'maquillage': {
    slug: 'maquillage',
    title: 'Maquillage — Teint, yeux, lèvres, ongles | Mouna Nouira — Oriflame Tunisie',
    description: 'Découvrez notre gamme complète de maquillage : fonds de teint, rouges à lèvres, mascaras et vernis à ongles Oriflame Tunisie.',
    imageFile: 'og-makeup.jpg',
    imageAlt: 'Maquillage professionnel — Oriflame Tunisie',
    imageWidth: 800,
    imageHeight: 800
  }
};

function normalizeCategorySlug(rawCat) {
  if (!rawCat) return null;
  const c = String(rawCat).toLowerCase().trim();
  if (c === 'bodycare' || c === 'corps-et-bain' || c === 'corps' || c === 'bain' || c === 'bath-and-body' || c === 'soins-du-corps') return 'corps-et-bain';
  if (c === 'skincare' || c === 'soins-de-la-peau' || c === 'skin') return 'soins-de-la-peau';
  if (c === 'fragrance' || c === 'parfums' || c === 'parfum' || c === 'fragrances') return 'parfums';
  if (c === 'haircare' || c === 'soins-capillaires' || c === 'cheveux') return 'soins-capillaires';
  if (c === 'makeup' || c === 'maquillage') return 'maquillage';
  return null;
}

// Dedicated robots.txt route ensuring immediate 200 response with correct text/plain
app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.join(__dirname, 'robots.txt'));
});

// Dedicated sitemap.xml route ensuring immediate 200 response with correct application/xml
app.get('/sitemap.xml', (req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.sendFile(path.join(__dirname, 'sitemap.xml'));
});

// Dedicated Social Image Proxy / Endpoint for Products
app.get(['/api/og-image/:productId', '/api/og-image/:productId.jpg', '/api/og-image/:productId.png'], async (req, res) => {
  try {
    let pid = req.params.productId;
    if (pid.endsWith('.jpg') || pid.endsWith('.png')) {
      pid = pid.slice(0, -4);
    }

    // Dynamic Live eCatalogue / Flipbook Cover & Page OG Image (Non-static)
    if (pid === 'catalogue' || pid === 'flipbook' || pid === 'ecatalogue') {
      const pageNum = parseInt(req.query.page, 10) || 1;
      const cacheKey = `catalogue_page_${pageNum}`;
      if (ogImageCache.has(cacheKey)) {
        const cached = ogImageCache.get(cacheKey);
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        return res.send(cached.buffer);
      }

      let flipbook = null;
      try {
        flipbook = getFlipbookData() || JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'flipbook.json'), 'utf8'));
      } catch (e) {}

      if (flipbook && Array.isArray(flipbook.spreads) && flipbook.spreads.length > 0) {
        let targetSpread = flipbook.spreads[0];
        if (pageNum > 1) {
          const found = flipbook.spreads.find(s => Array.isArray(s.pages) && s.pages.includes(pageNum));
          if (found) targetSpread = found;
        }

        const rawImgUrl = targetSpread.images?.[0];
        if (rawImgUrl) {
          try {
            const resp = await axios.get(rawImgUrl, {
              responseType: 'arraybuffer',
              httpsAgent: httpsInsecureAgent,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://tn-catalogue.oriflame.com/'
              },
              timeout: 8000
            });
            const contentType = resp.headers['content-type'] || 'image/jpeg';
            const buffer = Buffer.from(resp.data);
            ogImageCache.set(cacheKey, { contentType, buffer });
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
            return res.send(buffer);
          } catch (flipErr) {
            console.warn('[OG-IMAGE] Flipbook cover fetch note:', flipErr.message);
          }
        }
      }
      return res.sendFile(path.join(__dirname, 'assets', 'og-facebook-preview.jpg'));
    }

    if (ogImageCache.has(pid)) {
      const cached = ogImageCache.get(pid);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      return res.send(cached.buffer);
    }

    const products = await getProducts();
    const product = products.find(p => String(p.product_id) === String(pid));

    if (!product || !product.image_url) {
      return res.sendFile(path.join(__dirname, 'assets', 'og-facebook-preview.jpg'));
    }

    if (product.image_url.startsWith('/uploads/') || product.image_url.startsWith('uploads/')) {
      const rel = product.image_url.startsWith('/') ? product.image_url.slice(1) : product.image_url;
      const localPath = path.join(__dirname, rel);
      if (fs.existsSync(localPath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        return res.sendFile(localPath);
      }
    }

    if (product.image_url.startsWith('http')) {
      try {
        let fetchUrl = product.image_url;
        if (fetchUrl.includes('oriflame.com') && !fetchUrl.includes('&w=')) {
          fetchUrl += '&w=800';
        }
        const resp = await axios.get(fetchUrl, {
          responseType: 'arraybuffer',
          httpsAgent: httpsInsecureAgent,
          timeout: 7000
        });
        const contentType = resp.headers['content-type'] || 'image/jpeg';
        const buffer = Buffer.from(resp.data);
        ogImageCache.set(pid, { contentType, buffer });
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        return res.send(buffer);
      } catch (fetchErr) {
        console.warn(`[OG-IMAGE] Remote fetch failed for product ${pid}:`, fetchErr.message);
      }
    }

    return res.sendFile(path.join(__dirname, 'assets', 'og-facebook-preview.jpg'));
  } catch (err) {
    console.error('[OG-IMAGE] Error serving OG image:', err);
    return res.sendFile(path.join(__dirname, 'assets', 'og-facebook-preview.jpg'));
  }
});

// Dynamic Root & Product / Category query route
app.get(['/', '/index.html'], async (req, res, next) => {
  try {
    const baseUrl = getEffectiveBaseUrl(req);
    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    // 1. Dynamic Product Share via Query: ?prod=123 or ?productId=123
    const prodId = req.query.prod || req.query.productId;
    if (prodId) {
      const products = await getProducts();
      const product = products.find(p => String(p.product_id) === String(prodId));
      if (product) {
        const prodName = product.name_fr || product.name || 'Produit Oriflame';
        const priceFormatted = Number(product.price).toFixed(2);
        const cleanDesc = stripHtml(product.description_fr || product.description || '').slice(0, 190) ||
          `Commandez ${prodName} (${priceFormatted} DT) sur la boutique officielle Oriflame Tunisie de Mouna Nouira. Commande directe & livraison rapide.`;

        const productOgImage = `${baseUrl}/api/og-image/${encodeURIComponent(product.product_id)}.jpg`;
        const canonicalUrl = `${baseUrl}/?prod=${encodeURIComponent(product.product_id)}`;

        html = injectOpenGraphMetadata(html, {
          title: `${prodName} (${priceFormatted} DT) | Mouna Nouira — Oriflame Tunisie`,
          description: cleanDesc,
          url: canonicalUrl,
          type: 'product',
          price: priceFormatted,
          inStock: product.in_stock !== false,
          image: productOgImage,
          imageType: 'image/jpeg',
          imageWidth: 800,
          imageHeight: 800,
          imageAlt: prodName,
          twitterCard: 'summary_large_image'
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      }
    }

    // 2. Dynamic Category Share via Query: ?category=...
    const catSlug = normalizeCategorySlug(req.query.category);
    if (catSlug && CATEGORY_META[catSlug]) {
      const cMeta = CATEGORY_META[catSlug];
      html = injectOpenGraphMetadata(html, {
        title: cMeta.title,
        description: cMeta.description,
        url: `${baseUrl}/${cMeta.slug}`,
        type: 'website',
        image: `${baseUrl}/assets/${cMeta.imageFile}`,
        imageType: 'image/jpeg',
        imageWidth: cMeta.imageWidth,
        imageHeight: cMeta.imageHeight,
        imageAlt: cMeta.imageAlt,
        twitterCard: 'summary_large_image'
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    // 3. Default Homepage
    html = injectOpenGraphMetadata(html, {
      title: "Mouna Nouira — Catalogue Officiel Oriflame Tunisie",
      description: "Découvrez le catalogue officiel Oriflame Suède Tunisie avec Mouna Nouira. Parfums de luxe, soins et maquillage avec remises exclusives et commande directe.",
      url: `${baseUrl}/`,
      type: 'website',
      image: `${baseUrl}/assets/og-facebook-preview.jpg`,
      imageType: 'image/jpeg',
      imageWidth: 1376,
      imageHeight: 768,
      imageAlt: "Mouna Nouira — Catalogue Officiel Oriflame Tunisie",
      twitterCard: 'summary_large_image'
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    next();
  }
});

// Dedicated Product SEO & Social URL: /produit/:id or /product/:id
app.get(['/produit/:id', '/product/:id'], async (req, res, next) => {
  try {
    const baseUrl = getEffectiveBaseUrl(req);
    const pid = req.params.id;
    const products = await getProducts();
    const product = products.find(p => String(p.product_id) === String(pid));
    if (product) {
      let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      const prodName = product.name_fr || product.name || 'Produit Oriflame';
      const priceFormatted = Number(product.price).toFixed(2);
      const cleanDesc = stripHtml(product.description_fr || product.description || '').slice(0, 190) ||
        `Commandez ${prodName} (${priceFormatted} DT) sur la boutique officielle Oriflame Tunisie de Mouna Nouira. Commande directe & livraison rapide.`;

      const productOgImage = `${baseUrl}/api/og-image/${encodeURIComponent(product.product_id)}.jpg`;
      const canonicalUrl = `${baseUrl}/produit/${encodeURIComponent(product.product_id)}`;

      html = injectOpenGraphMetadata(html, {
        title: `${prodName} (${priceFormatted} DT) | Mouna Nouira — Oriflame Tunisie`,
        description: cleanDesc,
        url: canonicalUrl,
        type: 'product',
        price: priceFormatted,
        inStock: product.in_stock !== false,
        image: productOgImage,
        imageType: 'image/jpeg',
        imageWidth: 800,
        imageHeight: 800,
        imageAlt: prodName,
        twitterCard: 'summary_large_image'
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }
  } catch (err) {
    console.error('Error serving product route:', err);
  }
  return res.redirect(302, '/');
});

// Dedicated Perfume Buying Guide Route with dynamic OG tags
app.get('/guide-parfum', (req, res, next) => {
  try {
    const baseUrl = getEffectiveBaseUrl(req);
    let html = fs.readFileSync(path.join(__dirname, 'guide-parfum.html'), 'utf8');
    html = injectOpenGraphMetadata(html, {
      title: "Guide Parfums : Comment choisir sa signature olfactive ? — Oriflame Tunisie",
      description: "Concentrations, familles olfactives (florale, boisée, ambrée...), conseils de tenue et sélection de fragrances Oriflame Tunisie.",
      url: `${baseUrl}/guide-parfum`,
      type: 'article',
      image: `${baseUrl}/assets/og-guide-parfum.jpg`,
      imageType: 'image/jpeg',
      imageWidth: 800,
      imageHeight: 800,
      imageAlt: "Guide Parfums : Comment choisir sa signature olfactive ? — Oriflame Tunisie",
      twitterCard: 'summary_large_image'
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next();
  }
});

// Dedicated eCatalogue & Virtual Flipbook Route with dynamic OG tags (Non-static live cover image)
app.get(['/catalogue', '/catalogue-virtuel', '/ecatalogue'], (req, res, next) => {
  try {
    const baseUrl = getEffectiveBaseUrl(req);
    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    let flipbook = null;
    try {
      flipbook = getFlipbookData() || JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'flipbook.json'), 'utf8'));
    } catch (e) {}

    const catCode = flipbook?.catalogueCode || 'En cours';
    const pageNum = req.query.page ? parseInt(req.query.page, 10) : null;
    const ogImgUrl = `${baseUrl}/api/og-image/catalogue.jpg${pageNum ? '?page=' + pageNum : ''}`;

    const catTitle = pageNum
      ? `📖 Catalogue Virtuel Oriflame Tunisie — Page ${pageNum} | Mouna Nouira`
      : `📖 Catalogue Virtuel Officiel Oriflame Tunisie (Campagne ${catCode}) | Mouna Nouira`;
    const catDesc = pageNum
      ? `Découvrez la page ${pageNum} du catalogue interactif Oriflame Tunisie. Commandez directement vos articles favoris via Messenger ou WhatsApp !`
      : `Feuilletez en ligne le catalogue virtuel officiel Oriflame Suède Tunisie. Découvrez les dernières tendances beauté, vidéos exclusives et commandez directement avec Mouna Nouira !`;

    html = injectOpenGraphMetadata(html, {
      title: catTitle,
      description: catDesc,
      url: `${baseUrl}/catalogue${pageNum ? '?page=' + pageNum : ''}`,
      type: 'article',
      image: ogImgUrl,
      imageType: 'image/jpeg',
      imageWidth: 1200,
      imageHeight: 630,
      imageAlt: catTitle,
      twitterCard: 'summary_large_image'
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    next();
  }
});

// Dedicated Category Clean SEO & Social Routes
['corps-et-bain', 'soins-de-la-peau', 'parfums', 'soins-capillaires', 'maquillage'].forEach(slug => {
  app.get(`/${slug}`, (req, res, next) => {
    try {
      const baseUrl = getEffectiveBaseUrl(req);
      let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      const cMeta = CATEGORY_META[slug];
      html = injectOpenGraphMetadata(html, {
        title: cMeta.title,
        description: cMeta.description,
        url: `${baseUrl}/${cMeta.slug}`,
        type: 'website',
        image: `${baseUrl}/assets/${cMeta.imageFile}`,
        imageType: 'image/jpeg',
        imageWidth: cMeta.imageWidth,
        imageHeight: cMeta.imageHeight,
        imageAlt: cMeta.imageAlt,
        twitterCard: 'summary_large_image'
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      next();
    }
  });
});

// Static files
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

// Direct /admin Route to Admin Portal
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ─── 301 PERMANENT REDIRECTS (Legacy & Alias URLs) ───
const redirect301 = (targetPath) => (req, res) => {
  const queryIndex = req.originalUrl.indexOf('?');
  const qs = queryIndex !== -1 ? req.originalUrl.slice(queryIndex) : '';
  return res.redirect(301, targetPath + qs);
};

// Legacy category redirections
app.get('/soins-de-la-peau/corps', redirect301('/corps-et-bain'));
app.get(['/skincare', '/skin'], redirect301('/soins-de-la-peau'));
app.get(['/cheveux', '/haircare'], redirect301('/soins-capillaires'));
app.get(['/parfum', '/fragrance', '/fragrances'], redirect301('/parfums'));
app.get(['/comment-choisir-parfum', '/parfums/guide', '/parfum/guide'], redirect301('/guide-parfum'));
app.get(['/cheveux/guide', '/soins-capillaires/guide'], redirect301('/soins-capillaires'));
app.get(['/bodycare', '/bath-and-body', '/soins-du-corps', '/body', '/bain'], redirect301('/corps-et-bain'));
app.get('/makeup', redirect301('/maquillage'));

// Multer Storage Configuration for Product Image Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `product-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const uploadJson = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ------------------- ANALYTICS API ------------------- //

app.post('/api/analytics/ping', async (req, res) => {
  try {
    const { session_id, event, category, product_name, duration_seconds, device, language } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

    const analytics = await getAnalytics();
    let session = analytics.sessions.find(s => s.session_id === session_id);
    const now = new Date().toISOString();

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Local';

    if (!session) {
      analytics.total_visits = (analytics.total_visits || 0) + 1;
      session = {
        session_id,
        first_seen: now,
        last_active: now,
        ip: String(clientIp).replace('::ffff:', ''),
        device: device || 'Desktop',
        language: language || 'fr',
        duration_seconds: duration_seconds || 0,
        activity_trail: [],
        categories_visited: [],
        products_viewed: []
      };
      analytics.sessions.unshift(session);
    }

    session.last_active = now;
    session.duration_seconds = Math.max(session.duration_seconds || 0, duration_seconds || 0);

    if (event) {
      const timeOffset = `${Math.floor((duration_seconds || 0) / 60)}m ${Math.floor((duration_seconds || 0) % 60)}s`;
      session.activity_trail.push({
        time: now,
        offset: timeOffset,
        description: event
      });
    }

    if (category && !session.categories_visited.includes(category)) {
      session.categories_visited.push(category);
    }

    if (product_name && !session.products_viewed.includes(product_name)) {
      session.products_viewed.push(product_name);
    }

    if (analytics.sessions.length > 500) {
      analytics.sessions = analytics.sessions.slice(0, 500);
    }

    await saveAnalytics(analytics);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/stats', async (req, res) => {
  try {
    const analytics = await getAnalytics();
    const sessions = analytics.sessions || [];

    const totalSessions = sessions.length;
    const totalDuration = sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    const avgDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;

    const categoryCounts = {};
    sessions.forEach(s => {
      (s.categories_visited || []).forEach(c => {
        categoryCounts[c] = (categoryCounts[c] || 0) + 1;
      });
    });

    let mobileCount = 0;
    let desktopCount = 0;
    sessions.forEach(s => {
      if (s.device === 'Mobile') mobileCount++;
      else desktopCount++;
    });

    res.json({
      success: true,
      total_visits: analytics.total_visits || totalSessions,
      active_sessions_count: totalSessions,
      avg_duration_seconds: avgDuration,
      mobile_count: mobileCount,
      desktop_count: desktopCount,
      category_popularity: categoryCounts,
      recent_sessions: sessions.slice(0, 200)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete a single analytics session by ID
app.delete('/api/analytics/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const analytics = await getAnalytics();
    const initialLen = (analytics.sessions || []).length;
    analytics.sessions = (analytics.sessions || []).filter(s => s.session_id !== id);

    if (analytics.sessions.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Session introuvable' });
    }

    await saveAnalytics(analytics);
    res.json({ success: true, message: 'Session supprimée avec succès' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete all analytics sessions
app.delete('/api/analytics/sessions', async (req, res) => {
  try {
    const analytics = await getAnalytics();
    analytics.sessions = [];
    await saveAnalytics(analytics);
    res.json({ success: true, message: 'Toutes les sessions ont été effacées' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/analytics/reset', async (req, res) => {
  try {
    await saveAnalytics({ total_visits: 0, sessions: [] });
    res.json({ success: true, message: 'Analytics reset' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------- FLIPBOOK eCATALOGUE API ------------------- //

app.get('/api/flipbook', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const data = await getOrRefreshFlipbookData(forceRefresh);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Catalogue introuvable' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Flipbook Image Proxy to bypass iPaper token & referrer restrictions
app.get('/api/flipbook/image', async (req, res) => {
  try {
    let imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('Missing image url');

    if (flipbookImageCache.has(imageUrl)) {
      const cached = flipbookImageCache.get(imageUrl);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(cached.buffer);
    }

    let response = await fetch(imageUrl, {
      dispatcher: flipbookTlsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://tn-catalogue.oriflame.com/'
      }
    });

    if (response.status === 403 && imageUrl.includes('token=')) {
      // Heal token dynamically using active flipbook tokens
      const activeFlipbook = getFlipbookData();
      const activeToken = activeFlipbook?.token;
      const activeExpires = activeFlipbook?.expires;

      if (activeToken && activeExpires) {
        const healedUrl = imageUrl
          .replace(/token=[^&]+/, `token=${activeToken}`)
          .replace(/expires=[^&]+/, `expires=${activeExpires}`);

        response = await fetch(healedUrl, {
          dispatcher: flipbookTlsAgent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://tn-catalogue.oriflame.com/'
          }
        });
      }
    }

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch image');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    flipbookImageCache.set(imageUrl, { contentType, buffer });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/scrape/flipbook', async (req, res) => {
  try {
    const { url, forceLatest } = req.body || {};
    console.log("Admin triggering flipbook scrape for:", url || 'auto (latest live version)');
    const flipbookData = await scrapeFlipbookFromUrl(url, { forceLatest });

    res.json({
      success: true,
      message: `Digital Flipbook synchronisé avec succès (Catalogue ${flipbookData.catalogueCode} : ${flipbookData.totalPages} pages, ${flipbookData.totalSpreads} planches).`,
      data: flipbookData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/scrape/catalogue-status', async (req, res) => {
  try {
    const currentData = getFlipbookData();
    const latestLiveCode = await resolveLatestCatalogueCode();
    res.json({
      success: true,
      currentCode: currentData?.catalogueCode || null,
      latestLiveCode,
      isUpToDate: Boolean(currentData?.catalogueCode && currentData.catalogueCode === latestLiveCode),
      totalPages: currentData?.totalPages || 0,
      totalSpreads: currentData?.totalSpreads || 0,
      scrapedAt: currentData?.scrapedAt || null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------- CAROUSEL BANNER API ------------------- //

app.get('/api/carousel', async (req, res) => {
  try {
    const data = await getCarousel();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/carousel', upload.single('image_file'), async (req, res) => {
  try {
    const { image_url, badge, title, description, button_text, button_link, offer_product_code, offer_product_name, offer_price, offer_original_price, active } = req.body;
    let finalImageUrl = image_url;
    if (req.file) {
      finalImageUrl = `/uploads/${req.file.filename}`;
    }

    if (!finalImageUrl) {
      return res.status(400).json({ success: false, message: 'Image URL or File is required' });
    }

    const slides = await getCarousel();
    const newSlide = {
      id: req.body.id || `slide-${Date.now()}`,
      image_url: finalImageUrl.trim(),
      badge: badge ? badge.trim() : 'Oriflame Sweden',
      title: title ? title.trim() : 'Nouveau Catalogue',
      description: description ? description.trim() : '',
      button_text: button_text ? button_text.trim() : 'Feuilleter le Catalogue',
      button_link: button_link ? button_link.trim() : '#catalogue-section',
      offer_product_code: offer_product_code ? offer_product_code.trim() : '',
      offer_product_name: offer_product_name ? offer_product_name.trim() : '',
      offer_price: offer_price ? String(offer_price).trim() : '',
      offer_original_price: offer_original_price ? String(offer_original_price).trim() : '',
      active: active !== undefined ? (active === true || active === 'true') : true
    };

    slides.push(newSlide);
    await saveCarousel(slides);
    res.status(201).json({ success: true, message: 'Carousel slide added', data: newSlide });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/carousel/:id', upload.single('image_file'), async (req, res) => {
  try {
    const { id } = req.params;
    const slides = await getCarousel();
    const index = slides.findIndex(s => s.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Slide not found' });
    }

    const { image_url, badge, title, description, button_text, button_link, offer_product_code, offer_product_name, offer_price, offer_original_price, active } = req.body;
    let finalImageUrl = slides[index].image_url;
    if (req.file) finalImageUrl = `/uploads/${req.file.filename}`;
    else if (image_url) finalImageUrl = image_url;

    slides[index] = {
      ...slides[index],
      image_url: finalImageUrl ? finalImageUrl.trim() : slides[index].image_url,
      badge: badge !== undefined ? badge.trim() : slides[index].badge,
      title: title !== undefined ? title.trim() : slides[index].title,
      description: description !== undefined ? description.trim() : slides[index].description,
      button_text: button_text !== undefined ? button_text.trim() : slides[index].button_text,
      button_link: button_link !== undefined ? button_link.trim() : slides[index].button_link,
      offer_product_code: offer_product_code !== undefined ? offer_product_code.trim() : slides[index].offer_product_code,
      offer_product_name: offer_product_name !== undefined ? offer_product_name.trim() : slides[index].offer_product_name,
      offer_price: offer_price !== undefined ? String(offer_price).trim() : slides[index].offer_price,
      offer_original_price: offer_original_price !== undefined ? String(offer_original_price).trim() : slides[index].offer_original_price,
      active: active !== undefined ? (active === true || active === 'true') : slides[index].active
    };

    await saveCarousel(slides);
    res.json({ success: true, message: 'Slide updated', data: slides[index] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/carousel/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let slides = await getCarousel();
    const initialLen = slides.length;
    slides = slides.filter(s => s.id !== id);

    if (slides.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Slide not found' });
    }

    await saveCarousel(slides);
    res.json({ success: true, message: 'Slide deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/carousel/bulk', async (req, res) => {
  try {
    const { slides } = req.body;
    if (!Array.isArray(slides)) {
      return res.status(400).json({ success: false, message: 'Slides must be an array' });
    }
    await saveCarousel(slides);
    res.json({ success: true, message: 'Carousel updated', data: slides });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------- PRODUCT & SETTINGS API ------------------- //

let productsCache = null;
let productsCacheTime = 0;

export function invalidateProductsCache() {
  productsCache = null;
  productsCacheTime = 0;
}
global.invalidateProductsCache = invalidateProductsCache;

app.get('/api/products', async (req, res) => {
  try {
    const now = Date.now();
    if (productsCache && (now - productsCacheTime < 30000)) {
      return res.json({ success: true, data: productsCache });
    }
    const products = await getProducts();
    if (products && products.length > 0) {
      productsCache = products;
      productsCacheTime = now;
    }
    res.json({ success: true, data: products });
  } catch (err) {
    if (productsCache) return res.json({ success: true, data: productsCache });
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/products', upload.single('image_file'), async (req, res) => {
  try {
    const { name, category, price, description, in_stock, image_url, size, suitable_for, benefits, how_to_use, ingredients, original_price, is_promo, discount_percent } = req.body;
    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Name and Price are required' });
    }

    let finalImageUrl = image_url;
    if (req.file) {
      finalImageUrl = `/uploads/${req.file.filename}`;
    } else if (!finalImageUrl) {
      finalImageUrl = 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80';
    }

    const newProduct = {
      product_id: req.body.product_id || `ORF-PROD-${Date.now()}`,
      name: name.trim(),
      name_fr: name.trim(),
      category: category || 'Skincare',
      price: parseFloat(price) || 0,
      original_price: original_price ? parseFloat(original_price) : null,
      original_catalog_price: original_price ? parseFloat(original_price) : (parseFloat(price) || 0),
      is_promo: is_promo === true || is_promo === 'true',
      discount_percent: discount_percent ? parseInt(discount_percent) : 0,
      size: size || 'Format Standard',
      suitable_for: suitable_for || 'Tous types de peaux • Testé dermatologiquement',
      image_url: finalImageUrl,
      images: [finalImageUrl],
      description: description ? description.trim() : '',
      description_fr: description ? description.trim() : '',
      benefits: Array.isArray(benefits) ? benefits : [
        "100% Produit original Oriflame Suède",
        "Formule haute performance aux actifs bienfaisants"
      ],
      how_to_use: how_to_use || "Appliquer selon les recommandations de la gamme.",
      ingredients: ingredients || "Extraits botaniques suédois et complexes actifs certifiés Oriflame.",
      in_stock: in_stock === true || in_stock === 'true',
      variants: []
    };

    const products = await getProducts();
    products.unshift(newProduct);
    await saveProducts(products);

    res.status(201).json({ success: true, message: 'Product added', data: newProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/products/:id', upload.single('image_file'), async (req, res) => {
  try {
    const { id } = req.params;
    const products = await getProducts();
    const index = products.findIndex(p => p.product_id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const {
      name, name_fr, name_ar, name_en,
      category, price, original_price, original_catalog_price,
      description, description_fr, description_ar, description_en,
      in_stock, image_url, size, suitable_for,
      company_discount_applied, company_discount_percent
    } = req.body;

    let finalImageUrl = products[index].image_url;
    if (req.file) finalImageUrl = `/uploads/${req.file.filename}`;
    else if (image_url && image_url.trim()) finalImageUrl = image_url.trim();

    const current = products[index];

    let finalImages = current.images || [finalImageUrl];
    if (req.body.images) {
      try {
        const parsed = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
        if (Array.isArray(parsed) && parsed.length > 0) {
          finalImages = [finalImageUrl, ...parsed.filter(u => u !== finalImageUrl)];
        }
      } catch (e) {
        if (Array.isArray(req.body.images)) finalImages = req.body.images;
      }
    }

    products[index] = {
      ...current,
      name: (name_fr || name || current.name || '').trim(),
      name_fr: (name_fr || name || current.name_fr || current.name || '').trim(),
      name_ar: name_ar !== undefined ? name_ar.trim() : (current.name_ar || ''),
      name_en: name_en !== undefined ? name_en.trim() : (current.name_en || ''),
      category: category || current.category || 'Skincare',
      price: price !== undefined ? parseFloat(price) : current.price,
      original_price: original_price !== undefined && original_price !== '' ? parseFloat(original_price) : current.original_price,
      original_catalog_price: original_catalog_price !== undefined && original_catalog_price !== '' ? parseFloat(original_catalog_price) : current.original_catalog_price,
      size: size !== undefined ? size.trim() : (current.size || ''),
      suitable_for: suitable_for !== undefined ? suitable_for.trim() : (current.suitable_for || ''),
      image_url: finalImageUrl,
      images: finalImages,
      description: (description_fr || description || current.description || '').trim(),
      description_fr: (description_fr || description || current.description_fr || current.description || '').trim(),
      description_ar: description_ar !== undefined ? description_ar.trim() : (current.description_ar || ''),
      description_en: description_en !== undefined ? description_en.trim() : (current.description_en || ''),
      in_stock: in_stock !== undefined ? (in_stock === true || in_stock === 'true' || in_stock === 1 || in_stock === '1') : current.in_stock,
      company_discount_applied: company_discount_applied !== undefined ? (company_discount_applied === true || company_discount_applied === 'true') : current.company_discount_applied,
      company_discount_percent: company_discount_percent !== undefined ? parseInt(company_discount_percent) : (current.company_discount_percent || 0)
    };

    await saveProducts(products);
    res.json({ success: true, message: 'Product updated', data: products[index] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── STOCK: Sync live availability for all products
app.post('/api/stock/sync-availability', requireAdmin, async (req, res) => {
  try {
    const { syncAllProductsStockLive } = await import('./services/stock-checker.js');
    const result = await syncAllProductsStockLive();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Stock sync failed: ' + error.message });
  }
});

// Bulk Import Products with ALL Customizations
app.post('/api/products/bulk-import', requireAdmin, async (req, res) => {
  try {
    const incoming = req.body.products || (Array.isArray(req.body) ? req.body : []);
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ success: false, message: 'Liste de produits invalide ou vide.' });
    }

    const currentProducts = await getProducts();
    const currentMap = new Map(currentProducts.map(p => [String(p.product_id), p]));

    let updatedCount = 0;
    let addedCount = 0;

    incoming.forEach((p, idx) => {
      if (!p) return;
      const strId = String(p.product_id || p.code || `ORF-IMP-${Date.now()}-${idx}`).trim();
      const existing = currentMap.get(strId) || {};

      const nameFr = (p.name_fr || p.name || existing.name_fr || existing.name || `Produit #${strId}`).trim();
      const descFr = (p.description_fr || p.description || existing.description_fr || existing.description || '').trim();

      const mainImg = p.image_url || existing.image_url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${strId}%2f${strId}_1.png&MediaId=20989035&Version=1`;
      
      let gallery = [];
      if (Array.isArray(p.images) && p.images.length > 0) {
        gallery = p.images;
      } else if (typeof p.images === 'string' && p.images.trim()) {
        gallery = p.images.split(/[|;,]+/).map(u => u.trim()).filter(u => u.startsWith('http'));
      } else if (p.gallery_images) {
        gallery = typeof p.gallery_images === 'string' 
          ? p.gallery_images.split(/[|;,]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
          : (Array.isArray(p.gallery_images) ? p.gallery_images : []);
      } else if (existing.images && existing.images.length > 0) {
        gallery = existing.images;
      }
      if (!gallery.includes(mainImg)) gallery.unshift(mainImg);

      let benefitsList = ["100% Produit authentique certifié par Mouna Nouira"];
      if (Array.isArray(p.benefits) && p.benefits.length > 0) {
        benefitsList = p.benefits;
      } else if (typeof p.benefits === 'string' && p.benefits.trim()) {
        benefitsList = p.benefits.split(/[|;]+/).map(b => b.trim()).filter(Boolean);
      } else if (existing.benefits) {
        benefitsList = existing.benefits;
      }

      const priceVal = p.price !== undefined && p.price !== '' ? parseFloat(p.price) : (existing.price || 0);
      const catPriceVal = p.original_catalog_price !== undefined && p.original_catalog_price !== '' ? parseFloat(p.original_catalog_price) : (existing.original_catalog_price || priceVal);

      const cleanProd = {
        product_id: strId,
        name: nameFr,
        name_fr: nameFr,
        name_ar: p.name_ar !== undefined ? p.name_ar.trim() : (existing.name_ar || ''),
        name_en: p.name_en !== undefined ? p.name_en.trim() : (existing.name_en || ''),
        category: p.category || existing.category || 'Skincare',
        price: isNaN(priceVal) ? 0 : priceVal,
        original_catalog_price: isNaN(catPriceVal) ? priceVal : catPriceVal,
        original_price: p.original_price ? parseFloat(p.original_price) : (existing.original_price || null),
        is_promo: p.is_promo !== undefined ? (p.is_promo === true || p.is_promo === 'true' || p.is_promo === 1 || p.is_promo === '1') : Boolean(existing.is_promo),
        discount_percent: p.discount_percent !== undefined ? parseInt(p.discount_percent) : (existing.discount_percent || 0),
        company_discount_applied: p.company_discount_applied !== undefined ? (p.company_discount_applied === true || p.company_discount_applied === 'true') : Boolean(existing.company_discount_applied),
        company_discount_percent: p.company_discount_percent !== undefined ? parseInt(p.company_discount_percent) : (existing.company_discount_percent || 0),
        is_featured_deal: p.is_featured_deal !== undefined ? (p.is_featured_deal === true || p.is_featured_deal === 'true') : Boolean(existing.is_featured_deal),
        size: p.size ? p.size.trim() : (existing.size || 'Format Standard'),
        suitable_for: p.suitable_for ? p.suitable_for.trim() : (existing.suitable_for || 'Tous types de peaux • Produit certifié Oriflame Suède'),
        image_url: mainImg,
        images: gallery,
        description: descFr,
        description_fr: descFr,
        description_ar: p.description_ar !== undefined ? p.description_ar.trim() : (existing.description_ar || ''),
        description_en: p.description_en !== undefined ? p.description_en.trim() : (existing.description_en || ''),
        benefits: benefitsList,
        how_to_use: p.how_to_use ? p.how_to_use.trim() : (existing.how_to_use || "Appliquer délicatement selon les recommandations de la gamme."),
        ingredients: p.ingredients ? p.ingredients.trim() : (existing.ingredients || "Extraits botaniques suédois et complexes actifs certifiés Oriflame."),
        in_stock: p.in_stock !== undefined ? (p.in_stock === true || p.in_stock === 'true' || p.in_stock === 1 || p.in_stock === '1') : (existing.in_stock !== undefined ? existing.in_stock : true),
        variants: existing.variants || []
      };

      if (currentMap.has(strId)) {
        currentMap.set(strId, { ...existing, ...cleanProd });
        updatedCount++;
      } else {
        currentMap.set(strId, cleanProd);
        addedCount++;
      }
    });

    const finalProducts = Array.from(currentMap.values());
    await saveProducts(finalProducts);

    res.json({
      success: true,
      message: `${addedCount} produit(s) ajoutés, ${updatedCount} produit(s) mis à jour avec leurs personnalisations complètes.`,
      total: finalProducts.length,
      added: addedCount,
      updated: updatedCount,
      products: finalProducts
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur import: ' + err.message });
  }
});

// Delete ALL products
const handleDeleteAllProducts = async (req, res) => {
  try {
    await saveProducts([]);
    const settings = await getSettings();
    settings.company_discount_applied = false;
    await saveSettings(settings);
    res.json({ success: true, message: 'Tous les produits ont été supprimés avec succès.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

app.delete('/api/products', requireAdmin, handleDeleteAllProducts);
app.post('/api/products/delete-all', requireAdmin, handleDeleteAllProducts);

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let products = await getProducts();
    const initialLen = products.length;
    products = products.filter(p => p.product_id !== id);

    if (products.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await saveProducts(products);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── COMPANY DISCOUNT (Remise Société) ENDPOINTS ───────────────────
app.post('/api/products/apply-company-discount', requireAdmin, async (req, res) => {
  try {
    const rawPercent = req.body && req.body.percentage !== undefined ? parseFloat(req.body.percentage) : 20;
    const percentage = Math.min(Math.max(isNaN(rawPercent) ? 20 : rawPercent, 0.1), 99.9);
    const factor = (100 - percentage) / 100;

    const products = await getProducts();
    products.forEach(p => {
      const basePrice = (p.original_catalog_price !== undefined && p.original_catalog_price !== null)
        ? Number(p.original_catalog_price)
        : (Number(p.price) || 0);

      p.original_catalog_price = basePrice;
      p.price = parseFloat((basePrice * factor).toFixed(3));
      p.company_discount_applied = true;
      p.company_discount_percent = percentage;

      if (Array.isArray(p.variants)) {
        p.variants.forEach(v => {
          v.company_discount_applied = true;
          v.company_discount_percent = percentage;
        });
      }
    });
    await saveProducts(products);

    const settings = await getSettings();
    settings.company_discount_applied = true;
    settings.company_discount_percent = percentage;
    settings.company_discount_applied_at = new Date().toISOString();
    await saveSettings(settings);

    res.json({
      success: true,
      message: `Remise Société de ${percentage}% activée avec succès sur ${products.length} produits.`,
      count: products.length,
      updated: products.length,
      percentage
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/products/remove-company-discount', requireAdmin, async (req, res) => {
  try {
    const products = await getProducts();
    products.forEach(p => {
      if (p.original_catalog_price !== undefined && p.original_catalog_price !== null) {
        p.price = Number(p.original_catalog_price);
      }
      p.company_discount_applied = false;
      p.company_discount_percent = 0;
      if (Array.isArray(p.variants)) {
        p.variants.forEach(v => {
          v.company_discount_applied = false;
          v.company_discount_percent = 0;
        });
      }
    });
    await saveProducts(products);

    const settings = await getSettings();
    settings.company_discount_applied = false;
    settings.company_discount_percent = 0;
    await saveSettings(settings);

    res.json({
      success: true,
      message: 'Remise Société désactivée avec succès.',
      count: products.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/products/toggle-stock/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const products = await getProducts();
    const product = products.find(p => p.product_id === id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.in_stock = !product.in_stock;
    await saveProducts(products);
    res.json({ success: true, message: 'Stock toggled', in_stock: product.in_stock });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Toggle company discount for a specific product
app.post('/api/products/toggle-discount/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const products = await getProducts();
    const product = products.find(p => String(p.product_id) === String(id));

    if (!product) {
      return res.status(404).json({ success: false, message: 'Produit introuvable' });
    }

    const settings = await getSettings();
    const percent = req.body && req.body.percentage !== undefined ? parseFloat(req.body.percentage) : (settings.company_discount_percent || 20);
    const factor = (100 - percent) / 100;

    if (product.original_catalog_price === undefined || product.original_catalog_price === null) {
      product.original_catalog_price = parseFloat(product.price || 0);
    }

    if (product.company_discount_applied) {
      product.price = parseFloat(Number(product.original_catalog_price).toFixed(3));
      product.company_discount_applied = false;
      product.company_discount_percent = 0;
    } else {
      product.price = parseFloat((Number(product.original_catalog_price) * factor).toFixed(3));
      product.company_discount_applied = true;
      product.company_discount_percent = percent;
    }

    await saveProducts(products);
    res.json({
      success: true,
      message: product.company_discount_applied
        ? `Remise de ${percent}% activée sur ${product.name} (Nouveau prix: ${product.price} TND)`
        : `Remise désactivée pour ${product.name} (Prix d'origine rétabli: ${product.price} TND)`,
      data: product
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// SCRAPER APIs
app.post('/api/scrape/url', requireAdmin, async (req, res) => {
  try {
    const inputUrl = req.body.url || req.body.code;
    if (!inputUrl) return res.status(400).json({ success: false, message: 'URL ou Code produit requis' });

    const scrapedData = await scrapeProductFromUrl(inputUrl);
    if (req.body.auto_add === true || req.body.auto_add === 'true') {
      const products = await getProducts(true);
      const existingIdx = products.findIndex(p => String(p.product_id).trim() === String(scrapedData.product_id).trim());
      if (existingIdx >= 0) {
        products[existingIdx] = { ...products[existingIdx], ...scrapedData };
      } else {
        products.unshift(scrapedData);
      }
      await saveProducts(products);
      invalidateProductsCache();
    }
    res.json({ success: true, message: 'Produit scrappé avec succès', data: scrapedData, product: scrapedData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/scrape/oriflame-catalog', requireAdmin, async (req, res) => {
  try {
    console.log("Admin initiated comprehensive multi-category product scrape...");
    const result = await scrapeAllOriflameCategories();

    // Reset global company discount setting so fresh catalog is ready for discount application
    const settings = await getSettings();
    settings.company_discount_applied = false;
    await saveSettings(settings);

    // Sync newly scraped products to Postgres and disk
    if (result && Array.isArray(result.products)) {
      await saveProducts(result.products);
    }
    invalidateProductsCache();

    res.json({
      success: true,
      message: `Scraping terminé : ${result.report.total_scraped} produits récupérés. Prix catalogue d'origine prêts.`,
      report: result.report,
      data: result.products
    });
  } catch (error) {
    console.error("Scrape error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── PRODUCT FALLBACK ENRICHER (UK Oriflame + Google Translate FR) ───────────
app.post('/api/products/enrich-fallback', requireAdmin, async (req, res) => {
  try {
    const { productIds, limit, dryRun, force } = req.body || {};
    console.log('[Admin] Initiating UK Fallback Enrichment...', { productIds, limit, dryRun, force });
    const report = await enrichCatalog({ productIds, limit, dryRun, force });
    invalidateProductsCache();
    res.json({
      success: true,
      message: `Enrichissement terminé : ${report.enriched_count} produit(s) mis à jour, ${report.skipped_count} ignoré(s) (déjà complets), ${report.unmodified_count} non modifié(s).`,
      ...report,
      report
    });
  } catch (error) {
    console.error('[Admin] Fallback enricher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/products/enrich-stats', requireAdmin, async (req, res) => {
  try {
    const stats = await getTranslationMetrics();
    res.json({ success: true, stats, metrics: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


let settingsCache = null;
let settingsCacheTime = 0;

export function invalidateSettingsCache() {
  settingsCache = null;
  settingsCacheTime = 0;
}
global.invalidateSettingsCache = invalidateSettingsCache;

// Public GET settings (strips admin_pwd)
app.get('/api/settings', async (req, res) => {
  try {
    const now = Date.now();
    if (settingsCache && (now - settingsCacheTime < 60000)) {
      return res.json({ success: true, data: settingsCache });
    }
    const settings = await getSettings();
    const safeSettings = { ...settings };
    delete safeSettings.admin_pwd;
    settingsCache = safeSettings;
    settingsCacheTime = now;
    res.json({ success: true, data: safeSettings });
  } catch (err) {
    if (settingsCache) return res.json({ success: true, data: settingsCache });
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin POST settings
app.post('/api/settings', requireAdmin, async (req, res) => {
  try {
    invalidateSettingsCache();
    const current = await getSettings();
    const updated = {
      ...current,
      ...req.body,
      admin_pwd: req.body.admin_pwd ? req.body.admin_pwd.trim() : current.admin_pwd
    };
    await saveSettings(updated);
    const safeUpdated = { ...updated };
    delete safeUpdated.admin_pwd;
    settingsCache = safeUpdated;
    settingsCacheTime = Date.now();
    res.json({ success: true, message: 'Settings saved', data: safeUpdated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin POST test-email
app.post('/api/admin/test-email', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    const settings = await getSettings();
    const targetEmail = (email || settings.notification_email || '').trim();

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Veuillez fournir une adresse email valide.' });
    }

    const dummyOrder = {
      order_id: `ORD-TEST-${Math.floor(1000 + Math.random() * 9000)}`,
      customer_name: 'Client Test (Notification)',
      customer_phone: '+216 55 756 629',
      channel: 'whatsapp',
      total_amount: 134.22,
      currency: settings.currency || 'TND',
      created_at: new Date().toISOString(),
      items: [
        { product_id: '40683', name: 'Parfum Giordani Gold Essenza Supreme', quantity: 1, price: 106.32 },
        { product_id: '46980', name: 'Crème de Corps Parfumée Giordani Gold', quantity: 1, price: 27.90 }
      ]
    };

    const result = await sendOrderNotificationEmail(dummyOrder, targetEmail);
    if (result.success) {
      res.json({ success: true, message: `Email de test envoyé avec succès à ${targetEmail} !` });
    } else {
      res.status(400).json({
        success: false,
        message: result.reason === 'smtp_not_configured'
          ? 'Identifiants Resend ou SMTP non encore renseignés dans le fichier .env.'
          : (result.error || 'Échec d\'envoi de l\'email.')
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------- ADMIN ORDER INSPECTION & MANAGEMENT API ------------------- //

// ---- Messenger Opt-In: client clicked "Send to Messenger" on site ----
app.post('/api/messenger/optin', async (req, res) => {
  try {
    const { order_id, psid, ref } = req.body;
    if (!psid) return res.status(400).json({ success: false, message: 'psid required' });

    const targetId = order_id || ref;
    if (targetId) {
      const orders = await getOrders();
      const order = orders.find(o => o.order_id === targetId);
      if (order) {
        order.fb_psid = psid;
        order.messenger_opted_in = true;
        order.opted_in_at = new Date().toISOString();
        await saveOrders(orders);
      }
    }

    res.json({ success: true, psid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---- Send automatic Messenger confirmation to client ----
app.post('/api/orders/:id/send-confirmation', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const orders = await getOrders();
    const order = orders.find(o => o.order_id === id);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!order.fb_psid) {
      return res.status(400).json({
        success: false,
        message: 'Client has not opted in to Messenger for this order. They must click Send to Messenger first.'
      });
    }
    if (!FB_PAGE_ACCESS_TOKEN || FB_PAGE_ACCESS_TOKEN === 'PASTE_YOUR_PAGE_ACCESS_TOKEN_HERE') {
      return res.status(503).json({
        success: false,
        message: 'FB_PAGE_ACCESS_TOKEN is not configured in .env. Please set it up first.'
      });
    }

    const result = await sendOrderConfirmation(order.fb_psid, order, FB_PAGE_ACCESS_TOKEN);

    order.messenger_confirmation_sent = true;
    order.confirmation_sent_at = new Date().toISOString();
    await saveOrders(orders);

    res.json({ success: true, message: 'Confirmation message sent via Messenger', fb_message_id: result.message_id });
  } catch (err) {
    console.error('[Messenger] Send error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---- Public: return FB App ID for frontend SDK init ----
app.get('/api/fb/config', (req, res) => {
  res.json({
    app_id: FB_APP_ID || null,
    configured: !!FB_APP_ID && FB_APP_ID !== 'PASTE_YOUR_APP_ID_HERE'
  });
});

app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, customer_phone, customer_address, items, currency } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart items are required' });
    }

    const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const subtotalAmount = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
    const taxesAmount = Number((subtotalAmount * 0.03).toFixed(3));
    const shippingFee = 9.755;
    const totalWithDelivery = Number((subtotalAmount + taxesAmount + shippingFee).toFixed(3));
    const address = (customer_address || req.body.address || '').trim();

    const newOrder = {
      order_id: orderId,
      customer_name: customer_name ? customer_name.trim() : 'Client Anonyme',
      customer_phone: customer_phone ? customer_phone.trim() : 'Non renseigné',
      customer_address: address || 'Non renseignée',
      channel: req.body.channel || (customer_phone ? 'phone' : 'messenger'),
      notes: req.body.notes ? req.body.notes.trim() : '',
      items: items.map(i => ({
        product_id: i.product_id,
        name: i.name,
        price: Number(i.price),
        quantity: Number(i.quantity),
        image_url: i.image_url
      })),
      subtotal: Number(subtotalAmount.toFixed(2)),
      taxes_amount: taxesAmount,
      shipping_fee: shippingFee,
      shipping_and_taxes: Number((taxesAmount + shippingFee).toFixed(3)),
      total_amount: totalWithDelivery,
      currency: currency || 'TND',
      delivery_estimate: '2 à 3 jours ouvrables',
      payment_method: 'Paiement à la livraison',
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const orders = await getOrders();
    orders.unshift(newOrder);
    await saveOrders(orders);

    // Asynchronously send email notification to configured admin email address
    try {
      const settings = await getSettings();
      const targetEmail = settings.notification_email || '';
      if (targetEmail) {
        sendOrderNotificationEmail(newOrder, targetEmail).catch(err => {
          console.warn('[Email] Notification dispatch notice:', err?.message || err);
        });
      }
    } catch (e) {
      console.warn('[Email] Could not load settings for email notification:', e?.message || e);
    }

    const protocol = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const baseUrl = process.env.PUBLIC_URL || `${protocol}://${host}`;
    const orderUrl = `${baseUrl.replace(/\/$/, '')}/admin?orderId=${orderId}`;

    res.status(201).json({
      success: true,
      message: 'Order created',
      order_id: orderId,
      order_url: orderUrl,
      order: newOrder
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await getOrders();
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const orders = await getOrders();
    const order = orders.find(o => o.order_id === id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const orders = await getOrders();
    const order = orders.find(o => o.order_id === id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.status = status || order.status;
    order.updated_at = new Date().toISOString();
    await saveOrders(orders);

    res.json({ success: true, message: 'Order status updated', data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE ALL ORDERS ────────────────────────────────────────────────────────
app.delete('/api/orders/all', requireAdmin, async (req, res) => {
  try {
    await saveOrders([]);
    res.json({ success: true, message: 'Toutes les commandes ont été supprimées.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE SINGLE ORDER ──────────────────────────────────────────────────────
app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId || rawId === 'undefined' || rawId === 'null') {
      return res.status(400).json({ success: false, message: 'ID de commande invalide.' });
    }

    const targetId = String(rawId).trim();
    const deleted = await deleteOrderById(targetId);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Commande introuvable.' });
    }

    res.json({ success: true, message: 'Commande supprimée avec succès.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── BUNDLES: Package Deals / Duo & Trio Combined Offers ─────────────────────
app.get('/api/bundles', async (req, res) => {
  try {
    const bundles = await getBundles();
    res.json({ success: true, data: bundles });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch bundles: ' + e.message });
  }
});

app.post('/api/bundles', requireAdmin, async (req, res) => {
  try {
    const {
      id,
      title,
      title_fr,
      title_ar,
      title_en,
      description,
      description_fr,
      description_ar,
      description_en,
      product_ids,
      bundle_price,
      active
    } = req.body;

    if (!Array.isArray(product_ids) || product_ids.length < 2) {
      return res.status(400).json({ success: false, message: 'Un pack doit contenir au moins 2 produits.' });
    }

    const priceVal = parseFloat(bundle_price);
    if (isNaN(priceVal) || priceVal <= 0) {
      return res.status(400).json({ success: false, message: 'Le prix du pack doit être un montant valide.' });
    }

    const bundles = await getBundles();
    const cleanTitle = (title_fr || title || 'Pack Spécial').trim();
    const bundleId = id || `bundle-${Date.now()}`;

    const newBundle = {
      id: bundleId,
      title: cleanTitle,
      title_fr: cleanTitle,
      title_ar: (title_ar || '').trim(),
      title_en: (title_en || '').trim(),
      description: (description_fr || description || '').trim(),
      description_fr: (description_fr || description || '').trim(),
      description_ar: (description_ar || '').trim(),
      description_en: (description_en || '').trim(),
      product_ids: product_ids.map(String),
      bundle_price: priceVal,
      active: active !== undefined ? (active === true || active === 'true') : true,
      updated_at: new Date().toISOString()
    };

    const existingIndex = bundles.findIndex(b => b.id === bundleId);
    if (existingIndex > -1) {
      bundles[existingIndex] = { ...bundles[existingIndex], ...newBundle };
    } else {
      newBundle.created_at = new Date().toISOString();
      bundles.unshift(newBundle);
    }

    const saved = await saveBundles(bundles);
    if (!saved) {
      return res.status(500).json({ success: false, message: 'Erreur lors de la sauvegarde du pack en base de données.' });
    }
    res.json({ success: true, message: 'Pack enregistré avec succès.', data: newBundle });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erreur lors de l\'enregistrement du pack: ' + e.message });
  }
});

app.delete('/api/bundles/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let bundles = await getBundles();
    bundles = bundles.filter(b => b.id !== id);
    const saved = await saveBundles(bundles);
    if (!saved) {
      return res.status(500).json({ success: false, message: 'Erreur lors de la suppression du pack.' });
    }
    res.json({ success: true, message: 'Pack supprimé avec succès.' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression: ' + e.message });
  }
});

app.patch('/api/bundles/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const bundles = await getBundles();
    const bundle = bundles.find(b => b.id === id);
    if (!bundle) {
      return res.status(404).json({ success: false, message: 'Pack introuvable.' });
    }
    bundle.active = !bundle.active;
    const saved = await saveBundles(bundles);
    if (!saved) {
      return res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du statut du pack.' });
    }
    res.json({ success: true, message: `Pack ${bundle.active ? 'activé' : 'désactivé'}.`, active: bundle.active });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erreur de basculement: ' + e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  THRESHOLD / CONDITIONAL DEALS API
// ═══════════════════════════════════════════════════════════

// GET all active deals
app.get('/api/deals', async (req, res) => {
  try {
    const deals = await getDeals();
    res.json({ success: true, data: deals });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET single deal
app.get('/api/deals/:id', async (req, res) => {
  try {
    const deals = await getDeals();
    const deal = deals.find(d => d.id === req.params.id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal introuvable.' });
    res.json({ success: true, data: deal });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST create deal
app.post('/api/deals', requireAdmin, async (req, res) => {
  try {
    const {
      title_fr, title_ar, title_en,
      description_fr,
      threshold_amount,
      product_id,
      product_name,
      product_image,
      product_price,
      discount_percent,
      active,
      end_date
    } = req.body;

    if (!title_fr) return res.status(400).json({ success: false, message: 'Le titre (FR) est obligatoire.' });
    if (!threshold_amount || isNaN(Number(threshold_amount)) || Number(threshold_amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Montant seuil invalide.' });
    }
    if (!product_id) return res.status(400).json({ success: false, message: 'Produit cible obligatoire.' });
    if (!discount_percent || isNaN(Number(discount_percent)) || Number(discount_percent) <= 0 || Number(discount_percent) >= 100) {
      return res.status(400).json({ success: false, message: 'Pourcentage de remise invalide (1-99).' });
    }

    const deals = await getDeals();
    const newDeal = {
      id: `DEAL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      title_fr: title_fr.trim(),
      title_ar: (title_ar || '').trim(),
      title_en: (title_en || '').trim(),
      description_fr: (description_fr || '').trim(),
      threshold_amount: parseFloat(Number(threshold_amount).toFixed(3)),
      product_id: String(product_id).trim(),
      product_name: (product_name || '').trim(),
      product_image: (product_image || '').trim(),
      product_price: product_price ? parseFloat(Number(product_price).toFixed(3)) : null,
      discount_percent: parseFloat(Number(discount_percent).toFixed(2)),
      active: active !== false && active !== 'false',
      end_date: end_date ? new Date(end_date).toISOString() : null,
      created_at: new Date().toISOString(),
    };

    deals.push(newDeal);
    await saveDeals(deals);

    res.status(201).json({ success: true, message: 'Deal créé avec succès.', data: newDeal });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT update deal
app.put('/api/deals/:id', requireAdmin, async (req, res) => {
  try {
    const deals = await getDeals();
    const idx = deals.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Deal introuvable.' });

    const {
      title_fr, title_ar, title_en,
      description_fr,
      threshold_amount,
      product_id,
      product_name,
      product_image,
      product_price,
      discount_percent,
      active,
      end_date
    } = req.body;

    if (title_fr !== undefined) deals[idx].title_fr = title_fr.trim();
    if (title_ar !== undefined) deals[idx].title_ar = title_ar.trim();
    if (title_en !== undefined) deals[idx].title_en = title_en.trim();
    if (description_fr !== undefined) deals[idx].description_fr = description_fr.trim();
    if (threshold_amount !== undefined) deals[idx].threshold_amount = parseFloat(Number(threshold_amount).toFixed(3));
    if (product_id !== undefined) deals[idx].product_id = String(product_id).trim();
    if (product_name !== undefined) deals[idx].product_name = product_name.trim();
    if (product_image !== undefined) deals[idx].product_image = product_image.trim();
    if (product_price !== undefined) deals[idx].product_price = parseFloat(Number(product_price).toFixed(3));
    if (discount_percent !== undefined) deals[idx].discount_percent = parseFloat(Number(discount_percent).toFixed(2));
    if (active !== undefined) deals[idx].active = active !== false && active !== 'false';
    if (end_date !== undefined) deals[idx].end_date = end_date ? new Date(end_date).toISOString() : null;

    await saveDeals(deals);
    res.json({ success: true, message: 'Deal mis à jour.', data: deals[idx] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PATCH toggle active
app.patch('/api/deals/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const deals = await getDeals();
    const deal = deals.find(d => d.id === req.params.id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal introuvable.' });
    deal.active = !deal.active;
    await saveDeals(deals);
    res.json({ success: true, message: `Deal ${deal.active ? 'activé' : 'désactivé'}.`, active: deal.active });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE deal
app.delete('/api/deals/:id', requireAdmin, async (req, res) => {
  try {
    const deals = await getDeals();
    const filtered = deals.filter(d => d.id !== req.params.id);
    if (filtered.length === deals.length) {
      return res.status(404).json({ success: false, message: 'Deal introuvable.' });
    }
    await saveDeals(filtered);
    res.json({ success: true, message: 'Deal supprimé.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  EXPORT / DOWNLOAD & IMPORT ROUTES
// ═══════════════════════════════════════════════════════════

// Helper: convert array-of-objects -> CSV string (UTF-8 BOM for Excel)
function toCSV(rows) {
  if (!rows || rows.length === 0) return '\uFEFF';
  const flatten = (obj, prefix = '') => {
    return Object.keys(obj).reduce((acc, k) => {
      const val = obj[k];
      const key = prefix ? `${prefix}.${k}` : k;
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(acc, flatten(val, key));
      } else if (Array.isArray(val)) {
        acc[key] = val.map(v => (typeof v === 'object' ? JSON.stringify(v) : v)).join(' | ');
      } else {
        acc[key] = val === null || val === undefined ? '' : String(val);
      }
      return acc;
    }, {});
  };
  const flat = rows.map(r => flatten(r));
  const headers = [...new Set(flat.flatMap(r => Object.keys(r)))];
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const row of flat) {
    lines.push(headers.map(h => escape(row[h] ?? '')).join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
}

// ── EXPORT: Products JSON ───────────────────────────────────────────────────
app.get('/api/export/products', requireAdmin, async (req, res) => {
  try {
    const products = await getProducts();
    const filename = `oriflame_products_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(products, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Export products failed: ' + e.message });
  }
});

// ── EXPORT: Products CSV ────────────────────────────────────────────────────
app.get('/api/export/products/csv', requireAdmin, async (req, res) => {
  try {
    const products = await getProducts();
    const filename = `oriflame_products_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(toCSV(products));
  } catch (e) {
    res.status(500).json({ success: false, message: 'CSV export failed: ' + e.message });
  }
});

// ── EXPORT: Orders JSON ─────────────────────────────────────────────────────
app.get('/api/export/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await getOrders();
    const filename = `oriflame_orders_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(orders, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Orders export failed: ' + e.message });
  }
});

// ── EXPORT: Orders CSV ──────────────────────────────────────────────────────
app.get('/api/export/orders/csv', requireAdmin, async (req, res) => {
  try {
    const orders = await getOrders();
    const rows = orders.map(o => ({
      order_id: o.order_id || '',
      customer_name: o.customer_name || '',
      customer_phone: o.customer_phone || '',
      channel: o.channel || '',
      status: o.status || '',
      total_amount: o.total_amount || 0,
      currency: o.currency || 'TND',
      created_at: o.created_at || '',
      items_count: Array.isArray(o.items) ? o.items.length : 0,
      items_detail: Array.isArray(o.items)
        ? o.items.map(i => `${i.name || ''} x${i.quantity || 1} (${i.price || ''}TND)`).join(' | ')
        : '',
      notes: o.notes || ''
    }));
    const filename = `oriflame_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(toCSV(rows));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Orders CSV export failed: ' + e.message });
  }
});

// ── EXPORT: Analytics JSON ──────────────────────────────────────────────────
app.get('/api/export/analytics', requireAdmin, async (req, res) => {
  try {
    const analytics = await getAnalytics();
    const filename = `oriflame_analytics_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(analytics, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Analytics export failed: ' + e.message });
  }
});

// ── EXPORT: Analytics CSV ───────────────────────────────────────────────────
app.get('/api/export/analytics/csv', requireAdmin, async (req, res) => {
  try {
    const analytics = await getAnalytics();
    const sessions = Array.isArray(analytics.sessions) ? analytics.sessions : [];
    const rows = sessions.map(s => ({
      session_id: s.session_id || '',
      ip: s.ip || '',
      device: s.device || '',
      language: s.language || '',
      first_seen: s.first_seen || '',
      last_active: s.last_active || '',
      duration_seconds: s.duration_seconds || 0,
      duration_readable: `${Math.floor((s.duration_seconds||0)/60)}m ${Math.round((s.duration_seconds||0)%60)}s`,
      categories_visited: Array.isArray(s.categories_visited) ? s.categories_visited.join(' | ') : '',
      products_viewed: Array.isArray(s.products_viewed) ? s.products_viewed.join(' | ') : '',
      trail_summary: Array.isArray(s.activity_trail)
        ? s.activity_trail.map(t => `[${t.offset}] ${t.description}`).join(' -> ')
        : '',
    }));
    const filename = `oriflame_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(toCSV(rows));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Analytics CSV export failed: ' + e.message });
  }
});

// ── EXPORT: Bundles JSON ────────────────────────────────────────────────────
app.get('/api/export/bundles', requireAdmin, async (req, res) => {
  try {
    const bundles = await getBundles();
    const filename = `oriflame_bundles_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(bundles, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Bundles export failed: ' + e.message });
  }
});

// ── EXPORT: Deals JSON ──────────────────────────────────────────────────────
app.get('/api/export/deals', requireAdmin, async (req, res) => {
  try {
    const deals = await getDeals();
    const filename = `oriflame_deals_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(deals, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Deals export failed: ' + e.message });
  }
});

// ── EXPORT: Carousel JSON ───────────────────────────────────────────────────
app.get('/api/export/carousel', requireAdmin, async (req, res) => {
  try {
    const carousel = await getCarousel();
    const filename = `oriflame_carousel_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(carousel, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Carousel export failed: ' + e.message });
  }
});

// ── EXPORT: Settings JSON (safe, no password) ───────────────────────────────
app.get('/api/export/settings', requireAdmin, async (req, res) => {
  try {
    const settings = await getSettings();
    const safe = { ...settings };
    delete safe.admin_pwd;
    const filename = `oriflame_settings_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(safe, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Settings export failed: ' + e.message });
  }
});

// ── EXPORT: Flipbook data JSON ──────────────────────────────────────────────
app.get('/api/export/flipbook', requireAdmin, (req, res) => {
  try {
    const flipbookPath = path.join(DATA_DIR, 'flipbook.json');
    if (!fs.existsSync(flipbookPath)) {
      return res.status(404).json({ success: false, message: 'Aucune donnée flipbook trouvée.' });
    }
    const flipbook = JSON.parse(fs.readFileSync(flipbookPath, 'utf8'));
    const filename = `oriflame_flipbook_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(flipbook, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Flipbook export failed: ' + e.message });
  }
});

// ── EXPORT: Featured Deals (Offres Spéciales du Catalogue) ───────────────────
app.get('/api/export/featured-deals', requireAdmin, async (req, res) => {
  try {
    const settings = await getSettings();
    const ids = Array.isArray(settings.featured_deal_ids) ? settings.featured_deal_ids : [];
    const products = await getProducts();
    const items = products.filter(p => ids.map(String).includes(String(p.product_id || p.id)));
    const exportData = {
      version: '2.2-neon',
      exported_at: new Date().toISOString(),
      featured_deal_ids: ids,
      count: ids.length,
      products: items
    };
    const filename = `oriflame_offres_speciales_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(exportData, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Featured deals export failed: ' + e.message });
  }
});

// ── IMPORT: Featured Deals only ─────────────────────────────────────────────
app.post('/api/import/featured-deals', requireAdmin, uploadJson.single('featured_deals'), async (req, res) => {
  try {
    let raw = '';
    if (req.file && req.file.buffer) {
      raw = req.file.buffer.toString('utf8');
    } else if (req.body && req.body.data) {
      raw = typeof req.body.data === 'string' ? req.body.data : JSON.stringify(req.body.data);
    } else if (req.body && (req.body.featured_deal_ids || req.body.featured_deals || Array.isArray(req.body))) {
      raw = JSON.stringify(req.body);
    } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      raw = JSON.stringify(req.body);
    } else {
      return res.status(400).json({ success: false, message: 'Aucun fichier ou données reçus' });
    }

    const parsed = JSON.parse(raw);
    let ids = [];
    if (Array.isArray(parsed)) {
      ids = parsed.map(item => typeof item === 'object' ? (item.product_id || item.id) : item).filter(Boolean);
    } else if (Array.isArray(parsed.featured_deal_ids)) {
      ids = parsed.featured_deal_ids;
    } else if (Array.isArray(parsed.featured_deals)) {
      ids = parsed.featured_deals.map(item => typeof item === 'object' ? (item.product_id || item.id) : item).filter(Boolean);
    } else if (Array.isArray(parsed.products)) {
      ids = parsed.products.map(item => typeof item === 'object' ? (item.product_id || item.id) : item).filter(Boolean);
    }

    const settings = await getSettings();
    settings.featured_deal_ids = ids;
    await saveSettings(settings);
    invalidateSettingsCache();

    res.json({
      success: true,
      message: `${ids.length} offre(s) spéciale(s) restaurée(s) avec succès.`,
      featured_deal_ids: ids
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erreur lors de l\'importation : ' + e.message });
  }
});

// ── EXPORT: COMPLETE SYSTEM BACKUP ──────────────────────────────────────────
app.get('/api/export/backup', requireAdmin, async (req, res) => {
  try {
    const flipbookPath = path.join(DATA_DIR, 'flipbook.json');
    let flipbook = null;
    try {
      if (fs.existsSync(flipbookPath)) flipbook = JSON.parse(fs.readFileSync(flipbookPath, 'utf8'));
    } catch {}

    const settings = await getSettings();
    const safeSettings = { ...settings };
    delete safeSettings.admin_pwd;

    const featuredDealIds = Array.isArray(safeSettings.featured_deal_ids) ? safeSettings.featured_deal_ids : [];
    const products = await getProducts();
    const featuredDeals = products.filter(p => featuredDealIds.map(String).includes(String(p.product_id || p.id)));

    const backup = {
      version: '2.2-neon',
      exported_at: new Date().toISOString(),
      app_name: 'Mouna Nouira – Oriflame Boutique',
      products:  products,
      featured_deal_ids: featuredDealIds,
      featured_deals: featuredDeals,
      carousel:  await getCarousel(),
      orders:    await getOrders(),
      bundles:   await getBundles(),
      deals:     await getDeals(),
      settings:  safeSettings,
      analytics: await getAnalytics(),
      flipbook:  flipbook,
    };

    const filename = `oriflame-FULL-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(backup, null, 2));
  } catch (e) {
    res.status(500).json({ success: false, message: 'Full backup failed: ' + e.message });
  }
});

// ── IMPORT: Carousel slides only ────────────────────────────────────────────
app.post('/api/import/carousel', requireAdmin, uploadJson.single('carousel'), async (req, res) => {
  try {
    let raw = '';
    if (req.file && req.file.buffer) {
      raw = req.file.buffer.toString('utf8');
    } else if (req.body && req.body.data) {
      raw = typeof req.body.data === 'string' ? req.body.data : JSON.stringify(req.body.data);
    } else if (req.body && (req.body.carousel || req.body.slides || Array.isArray(req.body))) {
      raw = JSON.stringify(req.body);
    } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      raw = JSON.stringify(req.body);
    } else {
      return res.status(400).json({ success: false, message: 'Aucun fichier ou données reçus' });
    }

    const parsed = JSON.parse(raw);
    let slides = [];
    if (Array.isArray(parsed)) {
      slides = parsed;
    } else if (Array.isArray(parsed.carousel)) {
      slides = parsed.carousel;
    } else if (Array.isArray(parsed.data)) {
      slides = parsed.data;
    } else if (Array.isArray(parsed.slides)) {
      slides = parsed.slides;
    } else if (parsed && typeof parsed === 'object' && parsed.image_url) {
      slides = [parsed];
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune diapositive trouvée dans le fichier' });
    }

    await saveCarousel(slides);
    res.json({ success: true, message: `${slides.length} diapositive(s) restaurée(s) avec succès.`, restored: slides.length });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erreur lors de l\'importation : ' + e.message });
  }
});

// ── IMPORT: Restore from JSON Backup ────────────────────────────────────────
app.post('/api/import/backup', requireAdmin, uploadJson.single('backup'), async (req, res) => {
  try {
    let raw = '';
    if (req.file && req.file.buffer) {
      raw = req.file.buffer.toString('utf8');
    } else if (req.body && req.body.data) {
      raw = typeof req.body.data === 'string' ? req.body.data : JSON.stringify(req.body.data);
    } else if (req.body && (req.body.products || req.body.carousel || req.body.orders || req.body.bundles || req.body.deals || req.body.featured_deal_ids || req.body.settings)) {
      raw = JSON.stringify(req.body);
    } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      raw = JSON.stringify(req.body);
    } else {
      return res.status(400).json({ success: false, message: 'Aucun fichier ou données reçus' });
    }

    const backup = JSON.parse(raw);
    const restoredSummary = [];

    // Invalidate memory caches
    invalidateSettingsCache();
    invalidateProductsCache();

    // 1. Products
    const products = Array.isArray(backup.products) 
      ? backup.products 
      : (Array.isArray(backup) ? backup : (Array.isArray(backup.data) ? backup.data : null));
    if (Array.isArray(products) && products.length > 0) {
      await saveProducts(products);
      restoredSummary.push(`${products.length} produits`);
    }

    // 2. Carousel
    if (Array.isArray(backup.carousel) && backup.carousel.length > 0) {
      await saveCarousel(backup.carousel);
      restoredSummary.push(`${backup.carousel.length} diapositives carrousel`);
    }

    // 3. Orders
    if (Array.isArray(backup.orders) && backup.orders.length > 0) {
      await saveOrders(backup.orders);
      restoredSummary.push(`${backup.orders.length} commandes`);
    }

    // 4. Bundles
    if (Array.isArray(backup.bundles) && backup.bundles.length > 0) {
      await saveBundles(backup.bundles);
      restoredSummary.push(`${backup.bundles.length} packs & bundles`);
    }

    // 5. Deals (Conditional / Threshold Deals)
    if (Array.isArray(backup.deals) && backup.deals.length > 0) {
      await saveDeals(backup.deals);
      restoredSummary.push(`${backup.deals.length} offres seuils`);
    }

    // 6. Featured Deals ("Offres Spéciales du Catalogue")
    let restoredFeaturedIds = null;
    if (Array.isArray(backup.featured_deal_ids)) {
      restoredFeaturedIds = backup.featured_deal_ids;
    } else if (Array.isArray(backup.featured_deals)) {
      restoredFeaturedIds = backup.featured_deals.map(d => typeof d === 'object' ? (d.product_id || d.id) : d).filter(Boolean);
    } else if (backup.settings && Array.isArray(backup.settings.featured_deal_ids)) {
      restoredFeaturedIds = backup.settings.featured_deal_ids;
    } else if (Array.isArray(products)) {
      const flagged = products.filter(p => p && (p.is_featured_deal === true || p.is_featured_deal === 'true')).map(p => p.product_id || p.id).filter(Boolean);
      if (flagged.length > 0) {
        restoredFeaturedIds = flagged;
      }
    }

    // 7. Settings (preserve existing admin_pwd if backup does not include one)
    if (backup.settings && typeof backup.settings === 'object') {
      const currentSettings = await getSettings();
      const newSettings = {
        ...currentSettings,
        ...backup.settings,
        admin_pwd: backup.settings.admin_pwd || currentSettings.admin_pwd || 'mouna2024'
      };
      if (restoredFeaturedIds !== null) {
        newSettings.featured_deal_ids = restoredFeaturedIds;
      }
      await saveSettings(newSettings);
      restoredSummary.push(`paramètres de configuration`);
      if (restoredFeaturedIds !== null) {
        restoredSummary.push(`${restoredFeaturedIds.length} offres spéciales catalogue`);
      }
    } else if (restoredFeaturedIds !== null) {
      const currentSettings = await getSettings();
      currentSettings.featured_deal_ids = restoredFeaturedIds;
      await saveSettings(currentSettings);
      restoredSummary.push(`${restoredFeaturedIds.length} offres spéciales catalogue`);
    }

    // 8. Flipbook
    const flipbookPath = path.join(DATA_DIR, 'flipbook.json');
    if (backup.flipbook && typeof backup.flipbook === 'object') {
      fs.writeFileSync(flipbookPath, JSON.stringify(backup.flipbook, null, 2), 'utf8');
      restoredSummary.push(`catalogue flipbook interactif`);
    }

    // 9. Analytics
    if (backup.analytics && typeof backup.analytics === 'object') {
      await saveAnalytics(backup.analytics);
      restoredSummary.push(`statistiques analytiques`);
    }

    // Invalidate memory caches again so immediate calls get fresh data
    invalidateSettingsCache();
    invalidateProductsCache();

    if (restoredSummary.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Le fichier JSON ne contient pas de données reconnues (produits, carrousel, commandes, etc.).' 
      });
    }

    res.json({
      success: true,
      message: `Restauration réussie avec succès : ${restoredSummary.join(', ')}.`,
      restored: restoredSummary
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Échec de la restauration : ' + e.message });
  }
});

app.listen(PORT, () => {
  const isProd = process.env.DATABASE_URL?.includes('/neondb?') || process.env.DATABASE_URL?.endsWith('/neondb');
  const dbLabel = isProd ? 'PRODUCTION DIRECTE (neondb)' : 'TEST / DEV (neondb_dev)';
  console.log(`===================================================`);
  console.log(`  Oriflame Assistant Server running on http://localhost:${PORT}`);
  console.log(`  Admin Portal URL: http://localhost:${PORT}/admin`);
  console.log(`  Database Backend: Neon Postgres [${dbLabel}]`);
  console.log(`===================================================`);

  // Background check for latest live catalogue edition (runs 8s after start)
  setTimeout(async () => {
    try {
      const current = getFlipbookData();
      const latestLiveCode = await resolveLatestCatalogueCode();
      if (!current || current.catalogueCode !== latestLiveCode) {
        console.log(`[Auto-Scraper] Stored catalogue is ${current?.catalogueCode || 'none'}, latest live edition is ${latestLiveCode}. Auto-scraping latest edition in background...`);
        await scrapeFlipbookFromUrl();
      } else {
        console.log(`[Auto-Scraper] Flipbook catalogue is already on latest live edition (${latestLiveCode}).`);
      }
    } catch (err) {
      console.warn('[Auto-Scraper] Initial catalogue check note:', err.message);
    }
  }, 8000);
});

process.on('uncaughtException', (err) => {
  console.error('Handled uncaughtException:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Handled unhandledRejection:', reason?.message || reason);
});

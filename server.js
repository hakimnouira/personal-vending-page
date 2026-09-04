import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { scrapeProductFromUrl, scrapeAllOriflameCategories } from './services/scraper.js';
import { scrapeFlipbookFromUrl, getOrRefreshFlipbookData, getFlipbookData } from './services/flipbook-scraper.js';
import { sendOrderConfirmation } from './services/messenger.js';
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

// Dynamic root route for Open Graph / Facebook Crawler previews
app.get(['/', '/index.html'], (req, res, next) => {
  try {
    const host = req.get('host') || 'mouna-nouira.wasmer.app';
    const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure || !host.includes('localhost');
    const proto = isHttps ? 'https' : 'http';
    const baseUrl = `${proto}://${host}`;

    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    html = html.replace(/property="og:url" content="[^"]*"/, `property="og:url" content="${baseUrl}/"`);
    html = html.replace(/property="og:image" content="[^"]*"/, `property="og:image" content="${baseUrl}/assets/og-facebook-preview.jpg"`);
    html = html.replace(/property="og:image:secure_url" content="[^"]*"/, `property="og:image:secure_url" content="${baseUrl}/assets/og-facebook-preview.jpg"`);
    html = html.replace(/name="twitter:image" content="[^"]*"/, `name="twitter:image" content="${baseUrl}/assets/og-facebook-preview.jpg"`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next();
  }
});

// Static files
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

// Direct /admin Route to Admin Portal
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

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
    const data = await getOrRefreshFlipbookData();
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

    let response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://tn-catalogue.oriflame.com/'
      }
    });

    if (response.status === 403 && imageUrl.includes('token=')) {
      const activeToken = 'cxo7UKgOtbgBrcybD-4SgWDpbJZSdzjtTxylna2_yes';
      const activeExpires = '1787307633';
      const healedUrl = imageUrl
        .replace(/token=[^&]+/, `token=${activeToken}`)
        .replace(/expires=[^&]+/, `expires=${activeExpires}`);

      response = await fetch(healedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://tn-catalogue.oriflame.com/'
        }
      });
    }

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch image');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/scrape/flipbook', async (req, res) => {
  try {
    const { url } = req.body;
    console.log("Admin triggering flipbook scrape for:", url || 'default');
    const flipbookData = await scrapeFlipbookFromUrl(url);

    res.json({
      success: true,
      message: `Digital Flipbook synchronisé avec succès (${flipbookData.totalPages} pages, ${flipbookData.totalSpreads} planches).`,
      data: flipbookData
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

app.get('/api/products', async (req, res) => {
  try {
    const products = await getProducts();
    res.json({ success: true, data: products });
  } catch (err) {
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
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'URL is required' });

    const scrapedData = await scrapeProductFromUrl(url);
    if (req.body.auto_add === true || req.body.auto_add === 'true') {
      const products = await getProducts();
      products.unshift(scrapedData);
      await saveProducts(products);
    }
    res.json({ success: true, message: 'Product scraped', data: scrapedData });
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

    // Sync newly scraped products to Postgres
    if (result && Array.isArray(result.products)) {
      await saveProducts(result.products);
    }

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

// Public GET settings (strips admin_pwd)
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    const safeSettings = { ...settings };
    delete safeSettings.admin_pwd;
    res.json({ success: true, data: safeSettings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin POST settings
app.post('/api/settings', requireAdmin, async (req, res) => {
  try {
    const current = await getSettings();
    const updated = {
      ...current,
      ...req.body,
      admin_pwd: req.body.admin_pwd ? req.body.admin_pwd.trim() : current.admin_pwd
    };
    await saveSettings(updated);
    const safeUpdated = { ...updated };
    delete safeUpdated.admin_pwd;
    res.json({ success: true, message: 'Settings saved', data: safeUpdated });
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
    const { customer_name, customer_phone, items, currency } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart items are required' });
    }

    const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const totalAmount = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);

    const newOrder = {
      order_id: orderId,
      customer_name: customer_name ? customer_name.trim() : 'Client Anonyme',
      customer_phone: customer_phone ? customer_phone.trim() : 'Non renseigné',
      channel: req.body.channel || (customer_phone ? 'phone' : 'messenger'),
      notes: req.body.notes ? req.body.notes.trim() : '',
      items: items.map(i => ({
        product_id: i.product_id,
        name: i.name,
        price: Number(i.price),
        quantity: Number(i.quantity),
        image_url: i.image_url
      })),
      total_amount: Number(totalAmount.toFixed(2)),
      currency: currency || 'TND',
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const orders = await getOrders();
    orders.unshift(newOrder);
    await saveOrders(orders);

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

    await saveBundles(bundles);
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
    await saveBundles(bundles);
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
    await saveBundles(bundles);
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

    const backup = {
      version: '2.2-neon',
      exported_at: new Date().toISOString(),
      app_name: 'Mouna Nouira – Oriflame Boutique',
      products:  await getProducts(),
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
    } else if (req.body && (req.body.products || req.body.carousel || req.body.orders || req.body.bundles || req.body.deals)) {
      raw = JSON.stringify(req.body);
    } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      raw = JSON.stringify(req.body);
    } else {
      return res.status(400).json({ success: false, message: 'Aucun fichier ou données reçus' });
    }

    const backup = JSON.parse(raw);
    const restoredSummary = [];

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

    // 5. Deals
    if (Array.isArray(backup.deals) && backup.deals.length > 0) {
      await saveDeals(backup.deals);
      restoredSummary.push(`${backup.deals.length} offres seuils`);
    }

    // 6. Settings (preserve existing admin_pwd if backup does not include one)
    if (backup.settings && typeof backup.settings === 'object') {
      const currentSettings = await getSettings();
      const newSettings = {
        ...currentSettings,
        ...backup.settings,
        admin_pwd: backup.settings.admin_pwd || currentSettings.admin_pwd || 'mouna2024'
      };
      await saveSettings(newSettings);
      restoredSummary.push(`paramètres de configuration`);
    }

    // 7. Flipbook
    const flipbookPath = path.join(DATA_DIR, 'flipbook.json');
    if (backup.flipbook && typeof backup.flipbook === 'object') {
      fs.writeFileSync(flipbookPath, JSON.stringify(backup.flipbook, null, 2), 'utf8');
      restoredSummary.push(`catalogue flipbook interactif`);
    }

    // 8. Analytics
    if (backup.analytics && typeof backup.analytics === 'object') {
      await saveAnalytics(backup.analytics);
      restoredSummary.push(`statistiques analytiques`);
    }

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
  console.log(`===================================================`);
  console.log(`  Oriflame Assistant Server running on http://localhost:${PORT}`);
  console.log(`  Admin Portal URL: http://localhost:${PORT}/admin`);
  console.log(`  Database Backend: Neon Postgres`);
  console.log(`===================================================`);
});

process.on('uncaughtException', (err) => {
  console.error('Handled uncaughtException:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Handled unhandledRejection:', reason?.message || reason);
});

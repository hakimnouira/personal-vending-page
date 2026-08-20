// Express Backend Server with Hidden /admin Route, Real-Time Visitor Analytics & Digital Flipbook Scraper
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { scrapeProductFromUrl, scrapeAllOriflameCategories } from './services/scraper.js';
import { scrapeFlipbookFromUrl, getFlipbookData } from './services/flipbook-scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories exist
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
const CAROUSEL_FILE = path.join(DATA_DIR, 'carousel.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Data Helpers
function getProducts() {
  try {
    if (fs.existsSync(PRODUCTS_FILE)) {
      return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
    }
    return [];
  } catch (err) {
    return [];
  }
}

function saveProducts(products) {
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
    return { facebook_username: 'mouna.nouira1', currency: 'TND', admin_pwd: 'mouna2026' };
  } catch (err) {
    return { facebook_username: 'mouna.nouira1', currency: 'TND', admin_pwd: 'mouna2026' };
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

function getAnalytics() {
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
    }
    return { total_visits: 0, sessions: [] };
  } catch (err) {
    return { total_visits: 0, sessions: [] };
  }
}

function saveAnalytics(analytics) {
  try {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

function getCarousel() {
  try {
    if (fs.existsSync(CAROUSEL_FILE)) {
      return JSON.parse(fs.readFileSync(CAROUSEL_FILE, 'utf8'));
    }
    return [];
  } catch (err) {
    return [];
  }
}

function saveCarousel(slides) {
  try {
    fs.writeFileSync(CAROUSEL_FILE, JSON.stringify(slides, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

function getOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    }
    return [];
  } catch (err) {
    return [];
  }
}

function saveOrders(orders) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

// ------------------- ANALYTICS API ------------------- //

app.post('/api/analytics/ping', (req, res) => {
  try {
    const { session_id, event, category, product_name, duration_seconds, device, language } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

    const analytics = getAnalytics();
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

    saveAnalytics(analytics);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/stats', (req, res) => {
  const analytics = getAnalytics();
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
    recent_sessions: sessions.slice(0, 50)
  });
});

app.post('/api/analytics/reset', (req, res) => {
  saveAnalytics({ total_visits: 0, sessions: [] });
  res.json({ success: true, message: 'Analytics reset' });
});

// ------------------- FLIPBOOK eCATALOGUE API ------------------- //

app.get('/api/flipbook', (req, res) => {
  const data = getFlipbookData();
  if (data) {
    res.json({ success: true, data });
  } else {
    res.status(404).json({ success: false, message: 'No flipbook data found' });
  }
});

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

    // If initial token expired (403), auto-fallback to active verified token
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
    if (!url) return res.status(400).json({ success: false, message: 'Catalog URL is required' });

    console.log("Admin triggering flipbook scrape for:", url);
    const flipbookData = await scrapeFlipbookFromUrl(url);

    res.json({
      success: true,
      message: `Successfully scraped Digital Flipbook (${flipbookData.totalPages} pages, ${flipbookData.totalSpreads} spreads).`,
      data: flipbookData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ------------------- CAROUSEL BANNER API ------------------- //

app.get('/api/carousel', (req, res) => {
  res.json({ success: true, data: getCarousel() });
});

app.post('/api/carousel', upload.single('image_file'), (req, res) => {
  try {
    const { image_url, badge, title, description, button_text, button_link, offer_product_code, offer_product_name, offer_price, offer_original_price, active } = req.body;
    let finalImageUrl = image_url;
    if (req.file) {
      finalImageUrl = `/uploads/${req.file.filename}`;
    }

    if (!finalImageUrl) {
      return res.status(400).json({ success: false, message: 'Image URL or File is required' });
    }

    const slides = getCarousel();
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
      offer_price: offer_price ? offer_price.trim() : '',
      offer_original_price: offer_original_price ? offer_original_price.trim() : '',
      active: active !== undefined ? (active === true || active === 'true') : true
    };

    slides.push(newSlide);
    saveCarousel(slides);
    res.status(201).json({ success: true, message: 'Carousel slide added', data: newSlide });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/carousel/:id', upload.single('image_file'), (req, res) => {
  try {
    const { id } = req.params;
    const slides = getCarousel();
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
      offer_price: offer_price !== undefined ? offer_price.trim() : slides[index].offer_price,
      offer_original_price: offer_original_price !== undefined ? offer_original_price.trim() : slides[index].offer_original_price,
      active: active !== undefined ? (active === true || active === 'true') : slides[index].active
    };

    saveCarousel(slides);
    res.json({ success: true, message: 'Slide updated', data: slides[index] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/carousel/:id', (req, res) => {
  const { id } = req.params;
  let slides = getCarousel();
  const initialLen = slides.length;
  slides = slides.filter(s => s.id !== id);

  if (slides.length === initialLen) {
    return res.status(404).json({ success: false, message: 'Slide not found' });
  }

  saveCarousel(slides);
  res.json({ success: true, message: 'Slide deleted' });
});

app.post('/api/carousel/bulk', (req, res) => {
  try {
    const { slides } = req.body;
    if (!Array.isArray(slides)) {
      return res.status(400).json({ success: false, message: 'Slides must be an array' });
    }
    saveCarousel(slides);
    res.json({ success: true, message: 'Carousel updated', data: slides });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------- PRODUCT & SETTINGS API ------------------- //

app.get('/api/products', (req, res) => {
  res.json({ success: true, data: getProducts() });
});

app.post('/api/products', upload.single('image_file'), (req, res) => {
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
      category: category || 'Skincare',
      price: parseFloat(price) || 0,
      original_price: original_price ? parseFloat(original_price) : null,
      is_promo: is_promo === true || is_promo === 'true',
      discount_percent: discount_percent ? parseInt(discount_percent) : 0,
      size: size || 'Format Standard',
      suitable_for: suitable_for || 'Tous types de peaux • Testé dermatologiquement',
      image_url: finalImageUrl,
      description: description ? description.trim() : '',
      benefits: Array.isArray(benefits) ? benefits : [
        "100% Produit original Oriflame Suède",
        "Formule haute performance aux actifs bienfaisants"
      ],
      how_to_use: how_to_use || "Appliquer selon les recommandations de la gamme.",
      ingredients: ingredients || "Extraits botaniques suédois et complexes actifs certifiés Oriflame.",
      in_stock: in_stock === true || in_stock === 'true'
    };

    const products = getProducts();
    products.unshift(newProduct);
    saveProducts(products);

    res.status(201).json({ success: true, message: 'Product added', data: newProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/products/:id', upload.single('image_file'), (req, res) => {
  try {
    const { id } = req.params;
    const products = getProducts();
    const index = products.findIndex(p => p.product_id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const { name, category, price, description, in_stock, image_url, size, suitable_for } = req.body;
    let finalImageUrl = products[index].image_url;
    if (req.file) finalImageUrl = `/uploads/${req.file.filename}`;
    else if (image_url) finalImageUrl = image_url;

    products[index] = {
      ...products[index],
      name: name !== undefined ? name.trim() : products[index].name,
      category: category || products[index].category,
      price: price !== undefined ? parseFloat(price) : products[index].price,
      size: size || products[index].size,
      suitable_for: suitable_for || products[index].suitable_for,
      image_url: finalImageUrl,
      description: description !== undefined ? description.trim() : products[index].description,
      in_stock: in_stock !== undefined ? (in_stock === true || in_stock === 'true') : products[index].in_stock
    };

    saveProducts(products);
    res.json({ success: true, message: 'Product updated', data: products[index] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  let products = getProducts();
  const initialLen = products.length;
  products = products.filter(p => p.product_id !== id);

  if (products.length === initialLen) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  saveProducts(products);
  res.json({ success: true, message: 'Product deleted' });
});

app.post('/api/products/toggle-stock/:id', (req, res) => {
  const { id } = req.params;
  const products = getProducts();
  const product = products.find(p => p.product_id === id);

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  product.in_stock = !product.in_stock;
  saveProducts(products);
  res.json({ success: true, message: 'Stock toggled', in_stock: product.in_stock });
});

// SCRAPER APIs
app.post('/api/scrape/url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'URL is required' });

    const scrapedData = await scrapeProductFromUrl(url);
    if (req.body.auto_add === true || req.body.auto_add === 'true') {
      const products = getProducts();
      products.unshift(scrapedData);
      saveProducts(products);
    }
    res.json({ success: true, message: 'Product scraped', data: scrapedData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/scrape/oriflame-catalog', async (req, res) => {
  try {
    console.log("Admin initiated comprehensive multi-category product scrape...");
    const result = await scrapeAllOriflameCategories();
    res.json({
      success: true,
      message: `Scraping complete: ${result.report.total_scraped} products scraped (${result.report.new_count} new, ${result.report.modified_count} updated, ${result.report.deleted_count} deleted).`,
      report: result.report,
      data: result.products
    });
  } catch (error) {
    console.error("Scrape error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json({ success: true, data: getSettings() });
});

app.post('/api/settings', (req, res) => {
  const current = getSettings();
  const updated = { ...current, ...req.body };
  saveSettings(updated);
  res.json({ success: true, message: 'Settings saved', data: updated });
});

// ------------------- ADMIN ORDER INSPECTION & MANAGEMENT API ------------------- //

app.post('/api/orders', (req, res) => {
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

    const orders = getOrders();
    orders.unshift(newOrder);
    saveOrders(orders);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const orderUrl = `${protocol}://${host}/admin?orderId=${orderId}`;

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

app.get('/api/orders', (req, res) => {
  res.json({ success: true, data: getOrders() });
});

app.get('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const orders = getOrders();
  const order = orders.find(o => o.order_id === id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  res.json({ success: true, data: order });
});

app.put('/api/orders/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const orders = getOrders();
    const order = orders.find(o => o.order_id === id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.status = status || order.status;
    order.updated_at = new Date().toISOString();
    saveOrders(orders);

    res.json({ success: true, message: 'Order status updated', data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  let orders = getOrders();
  const initialLen = orders.length;
  orders = orders.filter(o => o.order_id !== id);

  if (orders.length === initialLen) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  saveOrders(orders);
  res.json({ success: true, message: 'Order deleted' });
});

app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`  Oriflame Assistant Server running on http://localhost:${PORT}`);
  console.log(`  Admin Portal URL: http://localhost:${PORT}/admin`);
  console.log(`===================================================`);
});

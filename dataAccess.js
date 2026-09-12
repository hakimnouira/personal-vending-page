// Data Access Layer: Postgres-backed persistence functions
// Keeps exact function signatures and response shapes as original JSON helpers

import { pool, query } from './db.js';
import fs from 'fs';
import path from 'path';

let productsCache = null;
let productsCacheTime = 0;

// ── PRODUCTS ─────────────────────────────────────────────────────────────
export async function getProducts(bypassCache = false) {
  if (!bypassCache && productsCache && (Date.now() - productsCacheTime < 30000)) {
    return productsCache;
  }

  // 1. Query remote Postgres first
  try {
    const res = await query('SELECT * FROM products ORDER BY product_id ASC');
    if (res && Array.isArray(res.rows) && res.rows.length > 0) {
      const mapped = res.rows.map(row => ({
        product_id: String(row.product_id),
        name: row.name || '',
        name_fr: row.name_fr || row.name || '',
        name_ar: row.name_ar || '',
        name_en: row.name_en || '',
        category: row.category || 'Général',
        price: row.price != null ? Number(row.price) : 0,
        original_price: row.original_price != null ? Number(row.original_price) : null,
        original_catalog_price: row.original_catalog_price != null ? Number(row.original_catalog_price) : null,
        company_discount_applied: Boolean(row.company_discount_applied),
        company_discount_percent: row.company_discount_percent != null ? Number(row.company_discount_percent) : 0,
        is_promo: Boolean(row.is_promo),
        discount_percent: row.discount_percent != null ? Number(row.discount_percent) : 0,
        size: row.size || '',
        suitable_for: row.suitable_for || '',
        in_stock: row.in_stock !== false,
        description: row.description || '',
        description_fr: row.description_fr || row.description || '',
        description_ar: row.description_ar || '',
        description_en: row.description_en || '',
        benefits: Array.isArray(row.benefits) ? row.benefits : [],
        ingredients: row.ingredients || '',
        how_to_use: row.how_to_use || '',
        image_url: row.image_url || '',
        images: Array.isArray(row.images) ? row.images : (row.image_url ? [row.image_url] : []),
        variants: Array.isArray(row.variants) ? row.variants : []
      }));
      productsCache = mapped;
      productsCacheTime = Date.now();
      try {
        const localFile = path.join(process.cwd(), 'data', 'products.json');
        fs.writeFileSync(localFile, JSON.stringify(mapped, null, 2), 'utf8');
      } catch (e) {}
      return mapped;
    }
  } catch (err) {
    console.warn('getProducts DB query note:', err.message);
  }

  // 2. Fallback: load local file cache if Postgres query failed or empty
  try {
    const localFile = path.join(process.cwd(), 'data', 'products.json');
    if (fs.existsSync(localFile)) {
      const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        productsCache = data;
        productsCacheTime = Date.now();
        return data;
      }
    }
  } catch (e) {}

  return [];
}

export async function saveProducts(products) {
  if (!Array.isArray(products)) return false;

  // Deduplicate products by product_id
  const uniqueMap = new Map();
  for (const p of products) {
    if (p && p.product_id) {
      uniqueMap.set(String(p.product_id).trim(), p);
    }
  }
  const uniqueProducts = Array.from(uniqueMap.values());

  // Update in-memory cache and write to local data/products.json file immediately
  productsCache = uniqueProducts;
  productsCacheTime = Date.now();
  try {
    const localFile = path.join(process.cwd(), 'data', 'products.json');
    fs.writeFileSync(localFile, JSON.stringify(uniqueProducts, null, 2), 'utf8');
  } catch (fsErr) {
    console.warn('saveProducts local file sync note:', fsErr.message);
  }

  if (typeof global.invalidateProductsCache === 'function') {
    try { global.invalidateProductsCache(); } catch (e) {}
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const incomingIds = uniqueProducts.map(p => String(p.product_id));
    if (incomingIds.length > 0) {
      await client.query('DELETE FROM products WHERE NOT (product_id = ANY($1::text[]))', [incomingIds]);
    } else {
      await client.query('DELETE FROM products');
    }

    if (uniqueProducts.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < uniqueProducts.length; i += BATCH_SIZE) {
        const batch = uniqueProducts.slice(i, i + BATCH_SIZE);
        const valuePlaceholders = [];
        const values = [];
        let paramIndex = 1;

        for (const p of batch) {
          const rowParams = [];
          for (let c = 0; c < 26; c++) {
            rowParams.push(`$${paramIndex++}`);
          }
          valuePlaceholders.push(`(${rowParams.join(', ')})`);

          values.push(
            String(p.product_id),
            p.name || `Produit ${p.product_id}`,
            p.name_fr || p.name || '',
            p.name_ar || '',
            p.name_en || '',
            p.category || 'Général',
            p.price != null ? Number(p.price) : 0,
            p.original_price != null ? Number(p.original_price) : null,
            p.original_catalog_price != null ? Number(p.original_catalog_price) : null,
            Boolean(p.company_discount_applied),
            p.company_discount_percent != null ? Number(p.company_discount_percent) : 0,
            Boolean(p.is_promo),
            p.discount_percent != null ? Number(p.discount_percent) : 0,
            p.size || '',
            p.suitable_for || '',
            p.in_stock !== false,
            p.description || '',
            p.description_fr || p.description || '',
            p.description_ar || '',
            p.description_en || '',
            JSON.stringify(Array.isArray(p.benefits) ? p.benefits : []),
            p.ingredients || '',
            p.how_to_use || '',
            p.image_url || '',
            JSON.stringify(Array.isArray(p.images) ? p.images : (p.image_url ? [p.image_url] : [])),
            JSON.stringify(Array.isArray(p.variants) ? p.variants : [])
          );
        }

        const batchSql = `
          INSERT INTO products (
            product_id, name, name_fr, name_ar, name_en, category,
            price, original_price, original_catalog_price,
            company_discount_applied, company_discount_percent,
            is_promo, discount_percent, size, suitable_for,
            in_stock, description, description_fr, description_ar, description_en,
            benefits, ingredients, how_to_use, image_url, images, variants
          ) VALUES ${valuePlaceholders.join(', ')}
          ON CONFLICT (product_id) DO UPDATE SET
            name = EXCLUDED.name,
            name_fr = EXCLUDED.name_fr,
            name_ar = EXCLUDED.name_ar,
            name_en = EXCLUDED.name_en,
            category = EXCLUDED.category,
            price = EXCLUDED.price,
            original_price = EXCLUDED.original_price,
            original_catalog_price = EXCLUDED.original_catalog_price,
            company_discount_applied = EXCLUDED.company_discount_applied,
            company_discount_percent = EXCLUDED.company_discount_percent,
            is_promo = EXCLUDED.is_promo,
            discount_percent = EXCLUDED.discount_percent,
            size = EXCLUDED.size,
            suitable_for = EXCLUDED.suitable_for,
            in_stock = EXCLUDED.in_stock,
            description = EXCLUDED.description,
            description_fr = EXCLUDED.description_fr,
            description_ar = EXCLUDED.description_ar,
            description_en = EXCLUDED.description_en,
            benefits = EXCLUDED.benefits,
            ingredients = EXCLUDED.ingredients,
            how_to_use = EXCLUDED.how_to_use,
            image_url = EXCLUDED.image_url,
            images = EXCLUDED.images,
            variants = EXCLUDED.variants;
        `;

        await client.query(batchSql, values);
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('saveProducts error:', err);
    return false;
  } finally {
    client.release();
  }
}

// ── ORDERS ───────────────────────────────────────────────────────────────
const ORDERS_FILE = path.join(process.cwd(), 'data', 'orders.json');

export async function getOrders() {
  try {
    const res = await query('SELECT * FROM orders ORDER BY created_at DESC');
    if (res && Array.isArray(res.rows)) {
      return res.rows.map(row => ({
        id: row.order_id,
        order_id: String(row.order_id),
        order_number: row.order_number || String(row.order_id),
        customer_name: row.customer_name || 'Client Anonyme',
        customer_phone: row.customer_phone || '',
        customer_address: row.delivery_address || row.notes || '',
        delivery_address: row.delivery_address || row.notes || '',
        delivery_area: row.delivery_area || '',
        city: row.delivery_area || '',
        customer_note: row.customer_note || row.notes || '',
        consent_given: Boolean(row.consent_given),
        channel: row.channel || 'direct_site',
        notes: row.notes || row.customer_note || '',
        items: Array.isArray(row.items) ? row.items : (typeof row.items === 'string' ? JSON.parse(row.items) : []),
        subtotal: row.subtotal != null ? Number(row.subtotal) : 0,
        discount: row.discount != null ? Number(row.discount) : 0,
        taxes_amount: row.taxes_amount != null ? Number(row.taxes_amount) : Number(((Number(row.subtotal) || 0) * 0.03).toFixed(3)),
        shipping_fee: row.shipping_fee != null ? Number(row.shipping_fee) : 9.755,
        total_amount: row.total_amount != null ? Number(row.total_amount) : 0,
        total: row.total_amount != null ? Number(row.total_amount) : 0,
        currency: row.currency || 'TND',
        status: row.status || 'nouvelle',
        notification_status: row.notification_status || 'pending',
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
      }));
    }
  } catch (err) {
    console.error('getOrders Postgres error, trying local JSON backup:', err?.message || err);
  }

  // Fallback to local data/orders.json
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('getOrders JSON fallback error:', e?.message || e);
  }
  return [];
}

export async function saveOrders(orders) {
  if (!Array.isArray(orders)) return false;

  // 1. Always save to local data/orders.json for reliable persistent backup
  try {
    const dir = path.dirname(ORDERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Storage] Could not write to data/orders.json:', e?.message || e);
  }

  // 2. Persist to Neon Postgres
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const incomingIds = orders.map(o => String(o.order_id || o.order_number));
    if (incomingIds.length > 0) {
      await client.query('DELETE FROM orders WHERE NOT (order_id = ANY($1::text[]))', [incomingIds]);
    } else {
      await client.query('DELETE FROM orders');
    }

    const insertSql = `
      INSERT INTO orders (
        order_id, order_number, customer_name, customer_phone,
        delivery_area, delivery_address, customer_note, consent_given,
        channel, notes, items, subtotal, discount,
        total_amount, currency, status, notification_status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (order_id) DO UPDATE SET
        order_number = EXCLUDED.order_number,
        customer_name = EXCLUDED.customer_name,
        customer_phone = EXCLUDED.customer_phone,
        delivery_area = EXCLUDED.delivery_area,
        delivery_address = EXCLUDED.delivery_address,
        customer_note = EXCLUDED.customer_note,
        consent_given = EXCLUDED.consent_given,
        channel = EXCLUDED.channel,
        notes = EXCLUDED.notes,
        items = EXCLUDED.items,
        subtotal = EXCLUDED.subtotal,
        discount = EXCLUDED.discount,
        total_amount = EXCLUDED.total_amount,
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        notification_status = EXCLUDED.notification_status,
        created_at = EXCLUDED.created_at;
    `;

    for (const o of orders) {
      const orderId = String(o.order_id || o.order_number);
      const orderNum = String(o.order_number || o.order_id);
      const values = [
        orderId,
        orderNum,
        o.customer_name || 'Client Anonyme',
        o.customer_phone || '',
        o.delivery_area || '',
        o.delivery_address || o.customer_address || '',
        o.customer_note || o.notes || '',
        Boolean(o.consent_given !== false),
        o.channel || 'web',
        o.notes || o.customer_note || '',
        JSON.stringify(Array.isArray(o.items) ? o.items : []),
        o.subtotal != null ? Number(o.subtotal) : 0,
        o.discount != null ? Number(o.discount) : 0,
        o.total_amount != null ? Number(o.total_amount) : (o.total != null ? Number(o.total) : 0),
        o.currency || 'TND',
        o.status || 'nouvelle',
        o.notification_status || 'pending',
        o.created_at ? new Date(o.created_at) : new Date()
      ];
      await client.query(insertSql, values);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('saveOrders Postgres error:', err?.message || err);
    return true;
  } finally {
    client.release();
  }
}

export async function deleteOrderById(orderId) {
  try {
    const res = await query('DELETE FROM orders WHERE order_id = $1', [String(orderId).trim()]);
    return (res.rowCount || 0) > 0;
  } catch (err) {
    console.error('deleteOrderById error:', err);
    return false;
  }
}

// ── DEALS ────────────────────────────────────────────────────────────────
let dealsTableChecked = false;
async function ensureDealsColumns() {
  if (dealsTableChecked) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        title_fr TEXT,
        title_ar TEXT,
        title_en TEXT,
        description_fr TEXT,
        threshold_amount NUMERIC(10, 2) DEFAULT 0,
        product_id TEXT,
        product_name TEXT,
        product_image TEXT,
        product_price NUMERIC(10, 2) DEFAULT 0,
        discount_percent NUMERIC(5, 2) DEFAULT 0,
        active BOOLEAN DEFAULT TRUE,
        end_date TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
    `);
    dealsTableChecked = true;
  } catch (err) {
    console.error('ensureDealsColumns error:', err);
  }
}

export async function getDeals() {
  await ensureDealsColumns();
  try {
    const res = await query('SELECT * FROM deals ORDER BY created_at DESC');
    if (res && Array.isArray(res.rows)) {
      const mapped = res.rows.map(row => ({
        id: String(row.id),
        title_fr: row.title_fr || '',
        title_ar: row.title_ar || '',
        title_en: row.title_en || '',
        description_fr: row.description_fr || '',
        threshold_amount: row.threshold_amount != null ? Number(row.threshold_amount) : 0,
        product_id: row.product_id || '',
        product_name: row.product_name || '',
        product_image: row.product_image || '',
        product_price: row.product_price != null ? Number(row.product_price) : 0,
        discount_percent: row.discount_percent != null ? Number(row.discount_percent) : 0,
        active: row.active !== false,
        end_date: row.end_date ? new Date(row.end_date).toISOString() : null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
      }));
      try {
        const localFile = path.join(process.cwd(), 'data', 'deals.json');
        fs.writeFileSync(localFile, JSON.stringify(mapped, null, 2), 'utf8');
      } catch (e) {}
      return mapped;
    }
  } catch (err) {
    console.warn('getDeals DB query error, falling back to local file:', err.message);
  }

  try {
    const localFile = path.join(process.cwd(), 'data', 'deals.json');
    if (fs.existsSync(localFile)) {
      const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {}

  return [];
}

export async function saveDeals(deals) {
  if (!Array.isArray(deals)) return false;
  try {
    const localFile = path.join(process.cwd(), 'data', 'deals.json');
    fs.writeFileSync(localFile, JSON.stringify(deals, null, 2), 'utf8');
  } catch (e) {}

  await ensureDealsColumns();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const incomingIds = deals.map(d => String(d.id));
    if (incomingIds.length > 0) {
      await client.query('DELETE FROM deals WHERE NOT (id = ANY($1::text[]))', [incomingIds]);
    } else {
      await client.query('DELETE FROM deals');
    }

    const insertSql = `
      INSERT INTO deals (
        id, title_fr, title_ar, title_en, description_fr,
        threshold_amount, product_id, product_name, product_image,
        product_price, discount_percent, active, end_date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        title_fr = EXCLUDED.title_fr,
        title_ar = EXCLUDED.title_ar,
        title_en = EXCLUDED.title_en,
        description_fr = EXCLUDED.description_fr,
        threshold_amount = EXCLUDED.threshold_amount,
        product_id = EXCLUDED.product_id,
        product_name = EXCLUDED.product_name,
        product_image = EXCLUDED.product_image,
        product_price = EXCLUDED.product_price,
        discount_percent = EXCLUDED.discount_percent,
        active = EXCLUDED.active,
        end_date = EXCLUDED.end_date,
        created_at = EXCLUDED.created_at;
    `;

    for (const d of deals) {
      const parseSafeNum = (v) => {
        if (v == null || v === '') return 0;
        const cleaned = String(v).trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
      };

      const values = [
        String(d.id),
        d.title_fr || '',
        d.title_ar || '',
        d.title_en || '',
        d.description_fr || '',
        parseSafeNum(d.threshold_amount),
        d.product_id || '',
        d.product_name || '',
        d.product_image || '',
        parseSafeNum(d.product_price),
        parseSafeNum(d.discount_percent),
        d.active !== false,
        d.end_date ? new Date(d.end_date) : null,
        d.created_at ? new Date(d.created_at) : new Date()
      ];
      await client.query(insertSql, values);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('saveDeals error:', err);
    return false;
  } finally {
    client.release();
  }
}

// ── BUNDLES ──────────────────────────────────────────────────────────────
export async function getBundles() {
  try {
    const res = await query('SELECT * FROM bundles ORDER BY created_at DESC');
    if (res && Array.isArray(res.rows)) {
      const mapped = res.rows.map(row => ({
        id: String(row.id),
        title: row.title || '',
        title_fr: row.title_fr || row.title || '',
        title_ar: row.title_ar || '',
        title_en: row.title_en || '',
        description: row.description || '',
        description_fr: row.description_fr || row.description || '',
        description_ar: row.description_ar || '',
        description_en: row.description_en || '',
        product_ids: Array.isArray(row.product_ids)
          ? row.product_ids
          : (typeof row.product_ids === 'string' ? JSON.parse(row.product_ids || '[]') : []),
        bundle_price: row.bundle_price != null ? Number(row.bundle_price) : 0,
        active: row.active !== false,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
      }));

      // Keep local file cache synchronized
      try {
        const localFile = path.join(process.cwd(), 'data', 'bundles.json');
        fs.writeFileSync(localFile, JSON.stringify(mapped, null, 2), 'utf8');
      } catch (e) {}

      return mapped;
    }
  } catch (err) {
    console.warn('getBundles DB query note, falling back to local file:', err.message);
  }

  // Fallback to local file if DB query failed
  try {
    const localFile = path.join(process.cwd(), 'data', 'bundles.json');
    if (fs.existsSync(localFile)) {
      const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (e) {}

  return [];
}

export async function saveBundles(bundles) {
  if (!Array.isArray(bundles)) return false;

  // 1. Immediately update local fallback file
  try {
    const localFile = path.join(process.cwd(), 'data', 'bundles.json');
    fs.writeFileSync(localFile, JSON.stringify(bundles, null, 2), 'utf8');
  } catch (e) {
    console.warn('saveBundles local file warning:', e.message);
  }

  // 2. Persist to Postgres database
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const incomingIds = bundles.map(b => String(b.id));
    if (incomingIds.length > 0) {
      await client.query('DELETE FROM bundles WHERE NOT (id = ANY($1::text[]))', [incomingIds]);
    } else {
      await client.query('DELETE FROM bundles');
    }

    const insertSql = `
      INSERT INTO bundles (
        id, title, title_fr, title_ar, title_en,
        description, description_fr, description_ar, description_en,
        product_ids, bundle_price, active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        title_fr = EXCLUDED.title_fr,
        title_ar = EXCLUDED.title_ar,
        title_en = EXCLUDED.title_en,
        description = EXCLUDED.description,
        description_fr = EXCLUDED.description_fr,
        description_ar = EXCLUDED.description_ar,
        description_en = EXCLUDED.description_en,
        product_ids = EXCLUDED.product_ids,
        bundle_price = EXCLUDED.bundle_price,
        active = EXCLUDED.active,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at;
    `;

    for (const b of bundles) {
      const values = [
        String(b.id),
        b.title || '',
        b.title_fr || b.title || '',
        b.title_ar || '',
        b.title_en || '',
        b.description || '',
        b.description_fr || b.description || '',
        b.description_ar || '',
        b.description_en || '',
        JSON.stringify(Array.isArray(b.product_ids) ? b.product_ids : []),
        b.bundle_price != null ? Number(b.bundle_price) : 0,
        b.active !== false,
        b.created_at ? new Date(b.created_at) : new Date(),
        b.updated_at ? new Date(b.updated_at) : new Date()
      ];
      await client.query(insertSql, values);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('saveBundles DB error:', err);
    return false;
  } finally {
    client.release();
  }
}

// ── CAROUSEL ─────────────────────────────────────────────────────────────
export async function getCarousel() {
  try {
    const res = await query('SELECT * FROM carousel');
    if (res && Array.isArray(res.rows)) {
      const mapped = res.rows.map(row => ({
        id: String(row.id),
        image_url: row.image_url || '',
        badge: row.badge || '',
        title: row.title || '',
        description: row.description || '',
        button_link: row.button_link || '#catalogue-section',
        button_text: row.button_text || 'Feuilleter le Catalogue',
        offer_product_code: row.offer_product_code || '',
        offer_product_name: row.offer_product_name || '',
        offer_price: row.offer_price != null ? String(row.offer_price) : '',
        offer_original_price: row.offer_original_price != null ? String(row.offer_original_price) : '',
        active: row.active !== false
      }));
      try {
        const localFile = path.join(process.cwd(), 'data', 'carousel.json');
        fs.writeFileSync(localFile, JSON.stringify(mapped, null, 2), 'utf8');
      } catch (e) {}
      return mapped;
    }
  } catch (err) {
    console.warn('getCarousel DB query note, falling back to local file:', err.message);
  }

  try {
    const localFile = path.join(process.cwd(), 'data', 'carousel.json');
    if (fs.existsSync(localFile)) {
      const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (e) {}

  return [];
}

export async function saveCarousel(slides) {
  if (!Array.isArray(slides)) return false;
  try {
    const localFile = path.join(process.cwd(), 'data', 'carousel.json');
    fs.writeFileSync(localFile, JSON.stringify(slides, null, 2), 'utf8');
  } catch (e) {}

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const incomingIds = slides.map(s => String(s.id));
    if (incomingIds.length > 0) {
      await client.query('DELETE FROM carousel WHERE NOT (id = ANY($1::text[]))', [incomingIds]);
    } else {
      await client.query('DELETE FROM carousel');
    }

    const insertSql = `
      INSERT INTO carousel (
        id, image_url, badge, title, description,
        button_link, button_text, offer_product_code, offer_product_name,
        offer_price, offer_original_price, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        image_url = EXCLUDED.image_url,
        badge = EXCLUDED.badge,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        button_link = EXCLUDED.button_link,
        button_text = EXCLUDED.button_text,
        offer_product_code = EXCLUDED.offer_product_code,
        offer_product_name = EXCLUDED.offer_product_name,
        offer_price = EXCLUDED.offer_price,
        offer_original_price = EXCLUDED.offer_original_price,
        active = EXCLUDED.active;
    `;

    for (const s of slides) {
      const parseSafeNumeric = (v) => {
        if (v == null || v === '') return null;
        const cleaned = String(v).replace(/[^0-9.]/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
      };

      const values = [
        String(s.id),
        s.image_url || '',
        s.badge || '',
        s.title || '',
        s.description || '',
        s.button_link || '#catalogue-section',
        s.button_text || 'Feuilleter le Catalogue',
        s.offer_product_code || '',
        s.offer_product_name || '',
        parseSafeNumeric(s.offer_price),
        parseSafeNumeric(s.offer_original_price),
        s.active !== false
      ];
      await client.query(insertSql, values);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('saveCarousel error:', err);
    return false;
  } finally {
    client.release();
  }
}

// ── SETTINGS ─────────────────────────────────────────────────────────────
export async function getSettings() {
  // 1. Query remote Postgres first (Single Source of Truth)
  try {
    const res = await query('SELECT * FROM settings WHERE id = 1');
    if (res && res.rows && res.rows.length > 0) {
      const s = res.rows[0];
      const clean = {
        facebook_username: s.facebook_username || 'Mounanouira.Oriflame',
        currency: s.currency || 'TND',
        admin_pwd: s.admin_pwd || 'mouna2024',
        phone: s.phone || '55 756 629',
        whatsapp_phone: s.whatsapp_phone || '55756629',
        notification_email: s.notification_email || '',
        company_discount_applied: Boolean(s.company_discount_applied),
        company_discount_percent: s.company_discount_percent != null ? Number(s.company_discount_percent) : 20,
        company_discount_applied_at: s.company_discount_applied_at ? new Date(s.company_discount_applied_at).toISOString() : null,
        featured_deal_ids: Array.isArray(s.featured_deal_ids) ? s.featured_deal_ids : []
      };
      // Keep disk cache synchronized
      try {
        const localFile = path.join(process.cwd(), 'data', 'settings.json');
        fs.writeFileSync(localFile, JSON.stringify(clean, null, 2), 'utf8');
      } catch (e) {}
      return clean;
    }
  } catch (err) {
    console.warn('getSettings DB query note:', err.message);
  }

  // 2. Fallback: local disk cache if Postgres is unreachable
  try {
    const localFile = path.join(process.cwd(), 'data', 'settings.json');
    if (fs.existsSync(localFile)) {
      const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      if (data && typeof data === 'object') {
        return {
          facebook_username: data.facebook_username || 'Mounanouira.Oriflame',
          currency: data.currency || 'TND',
          admin_pwd: data.admin_pwd || 'mouna2024',
          phone: data.phone || '55 756 629',
          whatsapp_phone: data.whatsapp_phone || '55756629',
          notification_email: data.notification_email || '',
          company_discount_applied: Boolean(data.company_discount_applied),
          company_discount_percent: data.company_discount_percent != null ? Number(data.company_discount_percent) : 20,
          company_discount_applied_at: data.company_discount_applied_at || null,
          featured_deal_ids: Array.isArray(data.featured_deal_ids) ? data.featured_deal_ids : []
        };
      }
    }
  } catch (e) {}

  return { facebook_username: 'Mounanouira.Oriflame', currency: 'TND', admin_pwd: 'mouna2024', notification_email: '', featured_deal_ids: [] };
}

export async function saveSettings(settings) {
  if (!settings || typeof settings !== 'object') return false;
  try {
    const cleanFeaturedIds = Array.isArray(settings.featured_deal_ids) 
      ? settings.featured_deal_ids.map(id => String(id).trim()).filter(Boolean)
      : [];

    const queryText = `
      INSERT INTO settings (
        id, facebook_username, currency, admin_pwd, phone, whatsapp_phone,
        notification_email,
        company_discount_applied, company_discount_percent,
        company_discount_applied_at, featured_deal_ids
      ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        facebook_username = EXCLUDED.facebook_username,
        currency = EXCLUDED.currency,
        admin_pwd = EXCLUDED.admin_pwd,
        phone = EXCLUDED.phone,
        whatsapp_phone = EXCLUDED.whatsapp_phone,
        notification_email = EXCLUDED.notification_email,
        company_discount_applied = EXCLUDED.company_discount_applied,
        company_discount_percent = EXCLUDED.company_discount_percent,
        company_discount_applied_at = EXCLUDED.company_discount_applied_at,
        featured_deal_ids = EXCLUDED.featured_deal_ids;
    `;

    const values = [
      settings.facebook_username || 'Mounanouira.Oriflame',
      settings.currency || 'TND',
      settings.admin_pwd || 'mouna2024',
      settings.phone || '55 756 629',
      settings.whatsapp_phone || '55756629',
      settings.notification_email || '',
      Boolean(settings.company_discount_applied),
      settings.company_discount_percent != null ? Number(settings.company_discount_percent) : 20,
      settings.company_discount_applied_at ? new Date(settings.company_discount_applied_at) : null,
      JSON.stringify(cleanFeaturedIds)
    ];
    await query(queryText, values);

    // Synchronize to disk cache data/settings.json immediately
    const cleanObject = {
      facebook_username: settings.facebook_username || 'Mounanouira.Oriflame',
      currency: settings.currency || 'TND',
      admin_pwd: settings.admin_pwd || 'mouna2024',
      phone: settings.phone || '55 756 629',
      whatsapp_phone: settings.whatsapp_phone || '55756629',
      notification_email: settings.notification_email || '',
      company_discount_applied: Boolean(settings.company_discount_applied),
      company_discount_percent: settings.company_discount_percent != null ? Number(settings.company_discount_percent) : 20,
      company_discount_applied_at: settings.company_discount_applied_at || null,
      featured_deal_ids: cleanFeaturedIds
    };
    try {
      const localFile = path.join(process.cwd(), 'data', 'settings.json');
      fs.writeFileSync(localFile, JSON.stringify(cleanObject, null, 2), 'utf8');
    } catch (fsErr) {
      console.warn('Could not write local settings cache:', fsErr.message);
    }

    // Invalidate memory caches
    if (typeof global.invalidateSettingsCache === 'function') {
      global.invalidateSettingsCache();
    }

    return true;
  } catch (err) {
    console.error('saveSettings error:', err);
    return false;
  }
}

// ── FEATURED SPECIAL OFFERS (CATALOGUE EN PROMO) ──────────────────────────
export async function getFeaturedDeals() {
  const settings = await getSettings();
  const ids = Array.isArray(settings.featured_deal_ids) ? settings.featured_deal_ids : [];
  const products = await getProducts();
  const pMap = new Map(products.map(p => [String(p.product_id), p]));
  return ids.map(id => pMap.get(String(id))).filter(Boolean);
}

export async function saveFeaturedDeals(ids) {
  const cleanIds = Array.isArray(ids) ? ids.map(id => String(id).trim()).filter(Boolean) : [];
  const settings = await getSettings();
  settings.featured_deal_ids = cleanIds;
  return await saveSettings(settings);
}

// ── ANALYTICS ────────────────────────────────────────────────────────────
export async function getAnalytics() {
  try {
    const summaryRes = await query('SELECT total_visits FROM analytics_summary WHERE id = 1');
    const total_visits = summaryRes.rows[0]?.total_visits || 0;

    const sessionsRes = await query('SELECT * FROM analytics_sessions ORDER BY last_active DESC LIMIT 1000');
    const sessions = sessionsRes.rows.map(s => ({
      session_id: String(s.session_id),
      first_seen: s.first_seen ? new Date(s.first_seen).toISOString() : new Date().toISOString(),
      last_active: s.last_active ? new Date(s.last_active).toISOString() : new Date().toISOString(),
      ip: s.ip || '::1',
      device: s.device || 'Desktop',
      language: s.language || 'fr',
      duration_seconds: s.duration_seconds != null ? Number(s.duration_seconds) : 0,
      activity_trail: Array.isArray(s.activity_trail) ? s.activity_trail : [],
      categories_visited: Array.isArray(s.categories_visited) ? s.categories_visited : [],
      products_viewed: Array.isArray(s.products_viewed) ? s.products_viewed : []
    }));

    return { total_visits, sessions };
  } catch (err) {
    console.error('getAnalytics error:', err);
    return { total_visits: 0, sessions: [] };
  }
}

export async function saveAnalytics(analytics) {
  if (!analytics || typeof analytics !== 'object') return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (analytics.total_visits !== undefined) {
      await client.query(`
        INSERT INTO analytics_summary (id, total_visits)
        VALUES (1, $1)
        ON CONFLICT (id) DO UPDATE SET total_visits = EXCLUDED.total_visits;
      `, [Number(analytics.total_visits) || 0]);
    }

    if (Array.isArray(analytics.sessions)) {
      const incomingIds = analytics.sessions.map(s => String(s.session_id));
      if (incomingIds.length > 0) {
        await client.query('DELETE FROM analytics_sessions WHERE NOT (session_id = ANY($1::text[]))', [incomingIds]);
      } else {
        await client.query('DELETE FROM analytics_sessions');
      }

      const insertSessionQuery = `
        INSERT INTO analytics_sessions (
          session_id, first_seen, last_active, ip, device, language,
          duration_seconds, activity_trail, categories_visited, products_viewed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (session_id) DO UPDATE SET
          first_seen = EXCLUDED.first_seen,
          last_active = EXCLUDED.last_active,
          ip = EXCLUDED.ip,
          device = EXCLUDED.device,
          language = EXCLUDED.language,
          duration_seconds = EXCLUDED.duration_seconds,
          activity_trail = EXCLUDED.activity_trail,
          categories_visited = EXCLUDED.categories_visited,
          products_viewed = EXCLUDED.products_viewed;
      `;

      for (const s of analytics.sessions) {
        const values = [
          String(s.session_id),
          s.first_seen ? new Date(s.first_seen) : new Date(),
          s.last_active ? new Date(s.last_active) : new Date(),
          s.ip || '::1',
          s.device || 'Desktop',
          s.language || 'fr',
          s.duration_seconds != null ? Number(s.duration_seconds) : 0,
          JSON.stringify(Array.isArray(s.activity_trail) ? s.activity_trail : []),
          JSON.stringify(Array.isArray(s.categories_visited) ? s.categories_visited : []),
          JSON.stringify(Array.isArray(s.products_viewed) ? s.products_viewed : [])
        ];
        await client.query(insertSessionQuery, values);
      }
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('saveAnalytics error:', err);
    return false;
  } finally {
    client.release();
  }
}

// ── FLIPBOOK / eCATALOGUE ─────────────────────────────────────────────────

/**
 * Ensure the flipbook_data table exists (idempotent).
 */
async function ensureFlipbookTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS flipbook_data (
      id              SERIAL PRIMARY KEY,
      catalogue_code  TEXT NOT NULL DEFAULT 'latest',
      data            JSONB NOT NULL,
      scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_epoch   BIGINT,
      UNIQUE (catalogue_code)
    )
  `);
}

/**
 * Read the latest flipbook data from Neon.
 * Returns the stored JS object, or null if not yet scraped.
 */
export async function getFlipbookFromDB(catalogueCode = 'latest') {
  try {
    await ensureFlipbookTable();
    const res = await query(
      'SELECT data FROM flipbook_data WHERE catalogue_code = $1 LIMIT 1',
      [catalogueCode]
    );
    if (res.rows.length > 0) return res.rows[0].data;
    if (catalogueCode !== 'latest') {
      const fallback = await query(
        "SELECT data FROM flipbook_data WHERE catalogue_code = 'latest' LIMIT 1"
      );
      if (fallback.rows.length > 0) return fallback.rows[0].data;
    }
    return null;
  } catch (err) {
    console.error('getFlipbookFromDB error:', err.message);
    return null;
  }
}

/**
 * Upsert flipbook data into Neon.
 * @param {object} flipbookData - The full flipbook object (spreads, tokens, etc.)
 */
export async function saveFlipbookToDB(flipbookData) {
  try {
    await ensureFlipbookTable();
    const code = flipbookData.catalogueCode || 'latest';
    const expiresEpoch = flipbookData.expires ? parseInt(flipbookData.expires, 10) : null;
    await query(
      `INSERT INTO flipbook_data (catalogue_code, data, scraped_at, expires_epoch)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (catalogue_code) DO UPDATE
         SET data = EXCLUDED.data,
             scraped_at = NOW(),
             expires_epoch = EXCLUDED.expires_epoch`,
      [code, JSON.stringify(flipbookData), expiresEpoch]
    );
    if (code !== 'latest') {
      await query(
        `INSERT INTO flipbook_data (catalogue_code, data, scraped_at, expires_epoch)
         VALUES ('latest', $1, NOW(), $2)
         ON CONFLICT (catalogue_code) DO UPDATE
           SET data = EXCLUDED.data,
               scraped_at = NOW(),
               expires_epoch = EXCLUDED.expires_epoch`,
        [JSON.stringify(flipbookData), expiresEpoch]
      );
    }
    console.log(`✅ Flipbook saved to Neon (code: ${code}, expires: ${flipbookData.expires})`);
    return true;
  } catch (err) {
    console.error('saveFlipbookToDB error:', err.message);
    return false;
  }
}

// ── TRANSLATION CACHE & PRODUCT DESCRIPTION UPDATES ────────────────────────
let translationTableReady = false;

export async function ensureTranslationCacheTable() {
  if (translationTableReady) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS translation_cache (
        hash_key TEXT PRIMARY KEY,
        reference_produit TEXT,
        champ TEXT,
        langue_source TEXT DEFAULT 'en',
        langue_cible TEXT DEFAULT 'fr',
        texte_original TEXT,
        texte_traduit TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_translation_cache_ref ON translation_cache(reference_produit);
    `);
    translationTableReady = true;
  } catch (err) {
    console.warn('ensureTranslationCacheTable note:', err.message);
  }
}

export async function getCachedTranslation(hashKey) {
  try {
    await ensureTranslationCacheTable();
    const res = await query('SELECT texte_traduit FROM translation_cache WHERE hash_key = $1', [hashKey]);
    if (res && res.rows && res.rows.length > 0) {
      query('UPDATE translation_cache SET last_used = NOW() WHERE hash_key = $1', [hashKey]).catch(() => {});
      return res.rows[0].texte_traduit;
    }
  } catch (err) {
    console.warn('getCachedTranslation note:', err.message);
  }
  return null;
}

export async function saveCachedTranslation({ hashKey, reference, champ, sourceLang = 'en', targetLang = 'fr', originalText, translatedText }) {
  try {
    await ensureTranslationCacheTable();
    await query(`
      INSERT INTO translation_cache (hash_key, reference_produit, champ, langue_source, langue_cible, texte_original, texte_traduit, created_at, last_used)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (hash_key) DO UPDATE
        SET texte_traduit = EXCLUDED.texte_traduit,
            last_used = NOW()
    `, [hashKey, reference || '', champ || '', sourceLang, targetLang, originalText, translatedText]);
    return true;
  } catch (err) {
    console.warn('saveCachedTranslation note:', err.message);
    return false;
  }
}

export async function getTranslationCacheStats() {
  try {
    await ensureTranslationCacheTable();
    const res = await query('SELECT COUNT(*)::int AS total FROM translation_cache');
    return {
      totalCached: res.rows[0]?.total || 0
    };
  } catch (err) {
    return { totalCached: 0 };
  }
}

export async function updateProductDescriptions(productId, { description, description_fr, how_to_use }) {
  try {
    const idStr = String(productId).trim();
    // 1. Update in Postgres
    await query(`
      UPDATE products
      SET description = COALESCE($1, description),
          description_fr = COALESCE($2, description_fr),
          how_to_use = COALESCE($3, how_to_use)
      WHERE product_id = $4
    `, [description ?? null, description_fr ?? null, how_to_use ?? null, idStr]);

    // 2. Sync to in-memory products cache if loaded
    if (productsCache) {
      const p = productsCache.find(item => String(item.product_id) === idStr);
      if (p) {
        if (description != null) p.description = description;
        if (description_fr != null) p.description_fr = description_fr;
        if (how_to_use != null) p.how_to_use = how_to_use;
      }
      try {
        const localFile = path.join(process.cwd(), 'data', 'products.json');
        fs.writeFileSync(localFile, JSON.stringify(productsCache, null, 2), 'utf8');
      } catch (e) {}
    }

    if (typeof global.invalidateProductsCache === 'function') {
      try { global.invalidateProductsCache(); } catch (e) {}
    }

    return true;
  } catch (err) {
    console.error(`updateProductDescriptions error for ${productId}:`, err.message);
    return false;
  }
}

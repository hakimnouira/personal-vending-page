// Data Access Layer: Postgres-backed persistence functions
// Keeps exact function signatures and response shapes as original JSON helpers

import { pool, query } from './db.js';

// ── PRODUCTS ─────────────────────────────────────────────────────────────
export async function getProducts() {
  try {
    const res = await query('SELECT * FROM products ORDER BY product_id ASC');
    return res.rows.map(row => ({
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
  } catch (err) {
    console.error('getProducts error:', err);
    return [];
  }
}

export async function saveProducts(products) {
  if (!Array.isArray(products)) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const incomingIds = products.map(p => String(p.product_id));
    if (incomingIds.length > 0) {
      await client.query('DELETE FROM products WHERE NOT (product_id = ANY($1::text[]))', [incomingIds]);
    } else {
      await client.query('DELETE FROM products');
    }

    const insertSql = `
      INSERT INTO products (
        product_id, name, name_fr, name_ar, name_en, category,
        price, original_price, original_catalog_price,
        company_discount_applied, company_discount_percent,
        is_promo, discount_percent, size, suitable_for,
        in_stock, description, description_fr, description_ar, description_en,
        benefits, ingredients, how_to_use, image_url, images, variants
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26
      )
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

    for (const p of products) {
      const values = [
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
      ];
      await client.query(insertSql, values);
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
export async function getOrders() {
  try {
    const res = await query('SELECT * FROM orders ORDER BY created_at DESC');
    return res.rows.map(row => ({
      order_id: String(row.order_id),
      customer_name: row.customer_name || 'Client Anonyme',
      customer_phone: row.customer_phone || '',
      channel: row.channel || 'web',
      notes: row.notes || '',
      items: Array.isArray(row.items) ? row.items : [],
      total_amount: row.total_amount != null ? Number(row.total_amount) : 0,
      currency: row.currency || 'TND',
      status: row.status || 'pending',
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
    }));
  } catch (err) {
    console.error('getOrders error:', err);
    return [];
  }
}

export async function saveOrders(orders) {
  if (!Array.isArray(orders)) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const incomingIds = orders.map(o => String(o.order_id));
    if (incomingIds.length > 0) {
      await client.query('DELETE FROM orders WHERE NOT (order_id = ANY($1::text[]))', [incomingIds]);
    } else {
      await client.query('DELETE FROM orders');
    }

    const insertSql = `
      INSERT INTO orders (
        order_id, customer_name, customer_phone, channel, notes,
        items, total_amount, currency, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (order_id) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        customer_phone = EXCLUDED.customer_phone,
        channel = EXCLUDED.channel,
        notes = EXCLUDED.notes,
        items = EXCLUDED.items,
        total_amount = EXCLUDED.total_amount,
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        created_at = EXCLUDED.created_at;
    `;

    for (const o of orders) {
      const values = [
        String(o.order_id),
        o.customer_name || 'Client Anonyme',
        o.customer_phone || '',
        o.channel || 'web',
        o.notes || '',
        JSON.stringify(Array.isArray(o.items) ? o.items : []),
        o.total_amount != null ? Number(o.total_amount) : 0,
        o.currency || 'TND',
        o.status || 'pending',
        o.created_at ? new Date(o.created_at) : new Date()
      ];
      await client.query(insertSql, values);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('saveOrders error:', err);
    return false;
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
export async function getDeals() {
  try {
    const res = await query('SELECT * FROM deals ORDER BY created_at DESC');
    return res.rows.map(row => ({
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
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
    }));
  } catch (err) {
    console.error('getDeals error:', err);
    return [];
  }
}

export async function saveDeals(deals) {
  if (!Array.isArray(deals)) return false;
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
        product_price, discount_percent, active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        created_at = EXCLUDED.created_at;
    `;

    for (const d of deals) {
      const values = [
        String(d.id),
        d.title_fr || '',
        d.title_ar || '',
        d.title_en || '',
        d.description_fr || '',
        d.threshold_amount != null ? Number(d.threshold_amount) : 0,
        d.product_id || '',
        d.product_name || '',
        d.product_image || '',
        d.product_price != null ? Number(d.product_price) : 0,
        d.discount_percent != null ? Number(d.discount_percent) : 0,
        d.active !== false,
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
    return res.rows.map(row => ({
      id: String(row.id),
      title: row.title || '',
      title_fr: row.title_fr || row.title || '',
      title_ar: row.title_ar || '',
      title_en: row.title_en || '',
      description: row.description || '',
      description_fr: row.description_fr || row.description || '',
      description_ar: row.description_ar || '',
      description_en: row.description_en || '',
      product_ids: Array.isArray(row.product_ids) ? row.product_ids : [],
      bundle_price: row.bundle_price != null ? Number(row.bundle_price) : 0,
      active: row.active !== false,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
    }));
  } catch (err) {
    console.error('getBundles error:', err);
    return [];
  }
}

export async function saveBundles(bundles) {
  if (!Array.isArray(bundles)) return false;
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
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
    console.error('saveBundles error:', err);
    return false;
  } finally {
    client.release();
  }
}

// ── CAROUSEL ─────────────────────────────────────────────────────────────
export async function getCarousel() {
  try {
    const res = await query('SELECT * FROM carousel');
    return res.rows.map(row => ({
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
  } catch (err) {
    console.error('getCarousel error:', err);
    return [];
  }
}

export async function saveCarousel(slides) {
  if (!Array.isArray(slides)) return false;
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
  try {
    const res = await query('SELECT * FROM settings WHERE id = 1');
    if (res.rows.length > 0) {
      const s = res.rows[0];
      return {
        facebook_username: s.facebook_username || 'Mounanouira.Oriflame',
        currency: s.currency || 'TND',
        admin_pwd: s.admin_pwd || 'mouna2024',
        phone: s.phone || '55 756 629',
        whatsapp_phone: s.whatsapp_phone || '55756629',
        company_discount_applied: Boolean(s.company_discount_applied),
        company_discount_percent: s.company_discount_percent != null ? Number(s.company_discount_percent) : 20,
        company_discount_applied_at: s.company_discount_applied_at ? new Date(s.company_discount_applied_at).toISOString() : null,
        featured_deal_ids: Array.isArray(s.featured_deal_ids) ? s.featured_deal_ids : []
      };
    }
    return { facebook_username: 'Mounanouira.Oriflame', currency: 'TND', admin_pwd: 'mouna2024' };
  } catch (err) {
    console.error('getSettings error:', err);
    return { facebook_username: 'Mounanouira.Oriflame', currency: 'TND', admin_pwd: 'mouna2024' };
  }
}

export async function saveSettings(settings) {
  if (!settings || typeof settings !== 'object') return false;
  try {
    const queryText = `
      INSERT INTO settings (
        id, facebook_username, currency, admin_pwd, phone, whatsapp_phone,
        company_discount_applied, company_discount_percent,
        company_discount_applied_at, featured_deal_ids
      ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        facebook_username = EXCLUDED.facebook_username,
        currency = EXCLUDED.currency,
        admin_pwd = EXCLUDED.admin_pwd,
        phone = EXCLUDED.phone,
        whatsapp_phone = EXCLUDED.whatsapp_phone,
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
      Boolean(settings.company_discount_applied),
      settings.company_discount_percent != null ? Number(settings.company_discount_percent) : 20,
      settings.company_discount_applied_at ? new Date(settings.company_discount_applied_at) : null,
      JSON.stringify(Array.isArray(settings.featured_deal_ids) ? settings.featured_deal_ids : [])
    ];
    await query(queryText, values);
    return true;
  } catch (err) {
    console.error('saveSettings error:', err);
    return false;
  }
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

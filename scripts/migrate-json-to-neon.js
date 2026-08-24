// One-time Data Migration Script: JSON Files -> Neon Postgres
// Fast, idempotent, chunked transactions

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

async function migrate() {
  console.log('🚀 Starting Data Migration: JSON Files -> Neon Postgres...\n');
  const client = await pool.connect();

  try {
    // 1. Run Schema Creation
    console.log('📄 Step 1: Applying schema.sql...');
    const schemaSql = fs.readFileSync(path.join(ROOT_DIR, 'schema.sql'), 'utf8');
    await client.query(schemaSql);
    console.log('✅ Database schema verified and ready.\n');

    await client.query('BEGIN');

    // 2. Migrate Products (products.json)
    console.log('📦 Step 2: Migrating Products...');
    const productsFile = path.join(DATA_DIR, 'products.json');
    if (fs.existsSync(productsFile)) {
      const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
      
      const insertQuery = `
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
        await client.query(insertQuery, values);
      }
      console.log(`✅ Migrated ${products.length} products.`);
    }

    // 3. Migrate Orders (orders.json)
    console.log('\n🛍️ Step 3: Migrating Orders...');
    const ordersFile = path.join(DATA_DIR, 'orders.json');
    if (fs.existsSync(ordersFile)) {
      const orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
      const insertQuery = `
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
        await client.query(insertQuery, values);
      }
      console.log(`✅ Migrated ${orders.length} orders.`);
    }

    // 4. Migrate Deals (deals.json)
    console.log('\n🎯 Step 4: Migrating Deals...');
    const dealsFile = path.join(DATA_DIR, 'deals.json');
    if (fs.existsSync(dealsFile)) {
      const deals = JSON.parse(fs.readFileSync(dealsFile, 'utf8'));
      const insertQuery = `
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
        await client.query(insertQuery, values);
      }
      console.log(`✅ Migrated ${deals.length} deals.`);
    }

    // 5. Migrate Bundles (bundles.json)
    console.log('\n🎁 Step 5: Migrating Bundles...');
    const bundlesFile = path.join(DATA_DIR, 'bundles.json');
    if (fs.existsSync(bundlesFile)) {
      const bundles = JSON.parse(fs.readFileSync(bundlesFile, 'utf8'));
      const insertQuery = `
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
        await client.query(insertQuery, values);
      }
      console.log(`✅ Migrated ${bundles.length} bundles.`);
    }

    // 6. Migrate Carousel (carousel.json)
    console.log('\n🖼️ Step 6: Migrating Carousel Slides...');
    const carouselFile = path.join(DATA_DIR, 'carousel.json');
    if (fs.existsSync(carouselFile)) {
      const slides = JSON.parse(fs.readFileSync(carouselFile, 'utf8'));
      const insertQuery = `
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
          s.offer_price != null && s.offer_price !== '' ? Number(s.offer_price) : null,
          s.offer_original_price != null && s.offer_original_price !== '' ? Number(s.offer_original_price) : null,
          s.active !== false
        ];
        await client.query(insertQuery, values);
      }
      console.log(`✅ Migrated ${slides.length} carousel slides.`);
    }

    // 7. Migrate Settings (settings.json)
    console.log('\n⚙️ Step 7: Migrating Settings...');
    const settingsFile = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(settingsFile)) {
      const s = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      const insertQuery = `
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
        s.facebook_username || 'Mounanouira.Oriflame',
        s.currency || 'TND',
        s.admin_pwd || 'mouna2024',
        s.phone || '55 756 629',
        s.whatsapp_phone || '55756629',
        Boolean(s.company_discount_applied),
        s.company_discount_percent != null ? Number(s.company_discount_percent) : 20,
        s.company_discount_applied_at ? new Date(s.company_discount_applied_at) : null,
        JSON.stringify(Array.isArray(s.featured_deal_ids) ? s.featured_deal_ids : [])
      ];
      await client.query(insertQuery, values);
      console.log('✅ Migrated settings.');
    }

    // 8. Migrate Analytics (analytics.json)
    console.log('\n📊 Step 8: Migrating Analytics...');
    const analyticsFile = path.join(DATA_DIR, 'analytics.json');
    if (fs.existsSync(analyticsFile)) {
      const a = JSON.parse(fs.readFileSync(analyticsFile, 'utf8'));

      await client.query(`
        INSERT INTO analytics_summary (id, total_visits)
        VALUES (1, $1)
        ON CONFLICT (id) DO UPDATE SET total_visits = EXCLUDED.total_visits;
      `, [a.total_visits || 0]);

      if (Array.isArray(a.sessions)) {
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

        for (const s of a.sessions) {
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
        console.log(`✅ Migrated analytics summary and ${a.sessions.length} sessions.`);
      }
    }

    await client.query('COMMIT');
    console.log('\n🎉 ALL DATA SUCCESSFULLY MIGRATED TO NEON POSTGRES!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed with error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

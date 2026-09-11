// Script de Synchronisation / Migration entre Neon Postgres DEV et PRODUCTION
// Usage:
//   node scripts/sync-database.js dev-to-prod   (Copie DEV -> PROD, préserve les commandes clients)
//   node scripts/sync-database.js prod-to-dev   (Clône PROD -> DEV pour avoir des données fraîches)

import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const NEON_BASE = 'postgresql://neondb_owner:npg_mT2tafI7Hlzh@ep-spring-salad-axpj634w-pooler.c-4.us-east-2.aws.neon.tech/';
const DEV_URL   = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL || `${NEON_BASE}neondb_dev?sslmode=require`;
const PROD_URL  = process.env.PROD_DATABASE_URL || `${NEON_BASE}neondb?sslmode=require`;

export async function syncDatabase(direction = 'dev-to-prod', options = {}) {
  const isDevToProd = direction === 'dev-to-prod';
  const sourceUrl = isDevToProd ? DEV_URL : PROD_URL;
  const targetUrl = isDevToProd ? PROD_URL : DEV_URL;

  const srcName = isDevToProd ? 'neondb_dev (DEV)' : 'neondb (PROD)';
  const dstName = isDevToProd ? 'neondb (PROD)' : 'neondb_dev (DEV)';

  console.log('================================================================');
  console.log(`🚀 SYNCHRONISATION DATABASE : ${srcName} ➔ ${dstName}`);
  console.log('================================================================\n');

  const srcClient = new Client({ connectionString: sourceUrl });
  const dstClient = new Client({ connectionString: targetUrl });

  try {
    console.log('🔌 Connexion aux deux bases de données...');
    await srcClient.connect();
    await dstClient.connect();
    console.log('✅ Connecté aux deux bases Neon Postgres.\n');

    // 1. PRODUCTS
    console.log('📦 [1/5] Synchronisation des Produits...');
    const srcProducts = await srcClient.query('SELECT * FROM products ORDER BY product_id');
    console.log(`   Source: ${srcProducts.rows.length} produits trouvés.`);

    if (srcProducts.rows.length > 0) {
      await dstClient.query('BEGIN');
      // Delete products no longer in source
      const srcIds = srcProducts.rows.map(r => String(r.product_id));
      await dstClient.query('DELETE FROM products WHERE NOT (product_id = ANY($1::text[]))', [srcIds]);

      const BATCH_SIZE = 50;
      for (let i = 0; i < srcProducts.rows.length; i += BATCH_SIZE) {
        const batch = srcProducts.rows.slice(i, i + BATCH_SIZE);
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
            p.name || 'Produit Oriflame',
            p.name_fr || p.name || '',
            p.name_ar || '',
            p.name_en || '',
            p.category || 'Skincare',
            p.price != null ? Number(p.price) : 0,
            p.original_price != null ? Number(p.original_price) : null,
            p.original_catalog_price != null ? Number(p.original_catalog_price) : null,
            p.company_discount_applied === true,
            p.company_discount_percent != null ? Number(p.company_discount_percent) : 0,
            p.is_promo === true,
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

        const insertBatchSql = `
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

        await dstClient.query(insertBatchSql, values);
      }

      await dstClient.query('COMMIT');
      console.log(`   ✅ ${srcProducts.rows.length} produits synchronisés avec succès en batch.\n`);
    }

    // 2. BUNDLES (PACKS & OFFRES COMBINÉES)
    console.log('🎁 [2/5] Synchronisation des Packs & Bundles...');
    const srcBundles = await srcClient.query('SELECT * FROM bundles ORDER BY created_at DESC');
    console.log(`   Source: ${srcBundles.rows.length} packs trouvés.`);

    await dstClient.query('BEGIN');
    const srcBundleIds = srcBundles.rows.map(r => String(r.id));
    if (srcBundleIds.length > 0) {
      await dstClient.query('DELETE FROM bundles WHERE NOT (id = ANY($1::text[]))', [srcBundleIds]);
    } else {
      await dstClient.query('DELETE FROM bundles');
    }

    const insertBundleSql = `
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

    for (const b of srcBundles.rows) {
      await dstClient.query(insertBundleSql, [
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
      ]);
    }
    await dstClient.query('COMMIT');
    console.log(`   ✅ ${srcBundles.rows.length} packs synchronisés avec succès.\n`);

    // 3. DEALS (OFFRES SEUIL)
    console.log('🎯 [3/5] Synchronisation des Offres Seuil & Deals...');
    const srcDeals = await srcClient.query('SELECT * FROM deals ORDER BY created_at DESC');
    console.log(`   Source: ${srcDeals.rows.length} deals trouvés.`);

    await dstClient.query('BEGIN');
    const srcDealIds = srcDeals.rows.map(r => String(r.id));
    if (srcDealIds.length > 0) {
      await dstClient.query('DELETE FROM deals WHERE NOT (id = ANY($1::text[]))', [srcDealIds]);
    } else {
      await dstClient.query('DELETE FROM deals');
    }

    const insertDealSql = `
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

    for (const d of srcDeals.rows) {
      await dstClient.query(insertDealSql, [
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
        d.end_date ? new Date(d.end_date) : null,
        d.created_at ? new Date(d.created_at) : new Date()
      ]);
    }
    await dstClient.query('COMMIT');
    console.log(`   ✅ ${srcDeals.rows.length} deals synchronisés avec succès.\n`);

    // 4. CAROUSEL
    console.log('🎠 [4/5] Synchronisation du Carrousel d\'accueil...');
    const srcCarousel = await srcClient.query('SELECT * FROM carousel ORDER BY id');
    console.log(`   Source: ${srcCarousel.rows.length} diapositives trouvées.`);

    await dstClient.query('BEGIN');
    const srcCarIds = srcCarousel.rows.map(r => String(r.id));
    if (srcCarIds.length > 0) {
      await dstClient.query('DELETE FROM carousel WHERE NOT (id = ANY($1::text[]))', [srcCarIds]);
    } else {
      await dstClient.query('DELETE FROM carousel');
    }

    const insertCarSql = `
      INSERT INTO carousel (
        id, image_url, badge, title, description, button_link, button_text,
        offer_product_code, offer_product_name, offer_price, offer_original_price, active
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

    for (const c of srcCarousel.rows) {
      await dstClient.query(insertCarSql, [
        String(c.id),
        c.image_url || '',
        c.badge || '',
        c.title || '',
        c.description || '',
        c.button_link || '',
        c.button_text || '',
        c.offer_product_code || null,
        c.offer_product_name || null,
        c.offer_price != null ? Number(c.offer_price) : null,
        c.offer_original_price != null ? Number(c.offer_original_price) : null,
        c.active !== false
      ]);
    }
    await dstClient.query('COMMIT');
    console.log(`   ✅ ${srcCarousel.rows.length} diapositives carrousel synchronisées avec succès.\n`);

    // 5. SETTINGS
    console.log('⚙️ [5/5] Synchronisation des Paramètres Boutique...');
    const srcSettings = await srcClient.query('SELECT * FROM settings WHERE id = 1');
    if (srcSettings.rows.length > 0) {
      const s = srcSettings.rows[0];
      const insertSettingsSql = `
        INSERT INTO settings (
          id, facebook_username, currency, admin_pwd, phone, whatsapp_phone,
          notification_email,
          company_discount_applied, company_discount_percent, company_discount_applied_at, featured_deal_ids
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
      await dstClient.query(insertSettingsSql, [
        s.facebook_username || 'Mounanouira.Oriflame',
        s.currency || 'TND',
        s.admin_pwd || 'mouna2024',
        s.phone || '55 756 629',
        s.whatsapp_phone || '55756629',
        s.notification_email || '',
        s.company_discount_applied === true,
        s.company_discount_percent != null ? Number(s.company_discount_percent) : 20,
        s.company_discount_applied_at ? new Date(s.company_discount_applied_at) : null,
        JSON.stringify(Array.isArray(s.featured_deal_ids) ? s.featured_deal_ids : [])
      ]);
      console.log('   ✅ Paramètres boutique synchronisés avec succès.\n');
    }

    // 6. TRANSLATION CACHE
    console.log('🌐 [6/6] Synchronisation du Cache de Traductions (Postgres)...');
    try {
      await dstClient.query(`
        CREATE TABLE IF NOT EXISTS translation_cache (
          hash_key TEXT PRIMARY KEY,
          reference_produit TEXT,
          champ TEXT,
          langue_source TEXT DEFAULT 'en',
          langue_cible TEXT DEFAULT 'fr',
          texte_original TEXT,
          texte_traduit TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_trans_cache_ref ON translation_cache(reference_produit);
      `);

      const srcCache = await srcClient.query('SELECT * FROM translation_cache');
      console.log(`   Source: ${srcCache.rows.length} entrées de cache trouvées.`);

      if (srcCache.rows.length > 0) {
        await dstClient.query('BEGIN');
        const BATCH_SIZE = 50;
        for (let i = 0; i < srcCache.rows.length; i += BATCH_SIZE) {
          const batch = srcCache.rows.slice(i, i + BATCH_SIZE);
          const valuePlaceholders = [];
          const values = [];
          let pIdx = 1;
          for (const row of batch) {
            valuePlaceholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
            values.push(
              row.hash_key,
              row.reference_produit,
              row.champ,
              row.langue_source || 'en',
              row.langue_cible || 'fr',
              row.texte_original,
              row.texte_traduit,
              row.created_at || new Date(),
              row.last_used || new Date()
            );
          }
          const batchSql = `
            INSERT INTO translation_cache (
              hash_key, reference_produit, champ, langue_source, langue_cible,
              texte_original, texte_traduit, created_at, last_used
            ) VALUES ${valuePlaceholders.join(', ')}
            ON CONFLICT (hash_key) DO UPDATE SET
              reference_produit = EXCLUDED.reference_produit,
              champ = EXCLUDED.champ,
              langue_source = EXCLUDED.langue_source,
              langue_cible = EXCLUDED.langue_cible,
              texte_original = EXCLUDED.texte_original,
              texte_traduit = EXCLUDED.texte_traduit,
              last_used = EXCLUDED.last_used;
          `;
          await dstClient.query(batchSql, values);
        }
        await dstClient.query('COMMIT');
        console.log(`   ✅ ${srcCache.rows.length} entrées de cache synchronisées avec succès.\n`);
      }
    } catch (cacheErr) {
      console.warn('   ⚠️ Note synchronisation translation_cache:', cacheErr.message);
    }

    // Protection des commandes
    if (isDevToProd) {
      console.log('🛡️ Les commandes clients en Production ont été préservées intactes.');
    }

    console.log('================================================================');
    console.log(`🎉 SYNCHRONISATION TERMINÉE AVEC SUCCÈS : ${srcName} ➔ ${dstName}`);
    console.log('================================================================\n');

    return {
      success: true,
      message: `Synchronisation ${srcName} -> ${dstName} terminée avec succès.`,
      counts: {
        products: srcProducts.rows.length,
        bundles: srcBundles.rows.length,
        deals: srcDeals.rows.length,
        carousel: srcCarousel.rows.length
      }
    };
  } catch (err) {
    try { await dstClient.query('ROLLBACK'); } catch (_) {}
    console.error('❌ Erreur de synchronisation:', err);
    return { success: false, message: err.message };
  } finally {
    try { await srcClient.end(); } catch (_) {}
    try { await dstClient.end(); } catch (_) {}
  }
}

// CLI runner
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/sync-database.js')) {
  const arg = (process.argv[2] || 'dev-to-prod').toLowerCase();
  const direction = arg.includes('prod-to-dev') ? 'prod-to-dev' : 'dev-to-prod';
  syncDatabase(direction).then((res) => {
    process.exit(res.success ? 0 : 1);
  });
}

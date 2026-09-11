import { getProducts, updateProductDescriptions } from '../dataAccess.js';
import { scrapeUkProductDetails } from './uk-scraper.js';
import { translateText, getTranslationMetrics } from './translation.js';

// Regex identifying non-content logistical / packaging metadata
export const METADATA_REGEX = /(?:dimensions\s*:|longueur\s*\d+|hauteur\s*\d+|profondeur\s*\d+|poids\s*\d+|nom\s+complet\s+du\s+produit|full\s+product\s+name|vollst[äa]ndiger\s+produktname)/i;

/**
 * Determines whether a product description is missing, generic boilerplate, or invalid metadata.
 *
 * @param {string} desc - The description string to test
 * @returns {boolean} True if the description is considered invalid or incomplete
 */
export function isDescriptionInvalid(desc) {
  if (!desc || typeof desc !== 'string') return true;
  const t = desc.trim();
  if (t.length < 25) return true;

  // Generic fallback boilerplate created during category scraping
  if (t.startsWith('Produit officiel Oriflame Tunisie') || t.includes('scandinaves') || t.includes('scandinave')) {
    return true;
  }

  // Metadata check: if text contains "Dimensions:" or "Nom complet du produit:"
  if (METADATA_REGEX.test(t)) {
    // If the text is purely or predominantly metadata
    const stripped = t.replace(METADATA_REGEX, '').trim();
    if (stripped.length < 35) return true;
  }

  return false;
}

/**
 * Determines whether a product's how-to-use advice is missing or generic boilerplate.
 *
 * @param {string} how - The how_to_use string to test
 * @returns {boolean} True if how_to_use is considered invalid or incomplete
 */
export function isHowToUseInvalid(how) {
  if (!how || typeof how !== 'string') return true;
  const t = how.trim();
  if (t.length < 20) return true;

  // Generic fallback boilerplate
  if (t.startsWith('Appliquer délicatement selon') || t.startsWith('Appliquer délicatement sur') || t.startsWith('Appliquer délicatement')) {
    return true;
  }

  return false;
}

/**
 * Enriches a single product using UK Oriflame fallback and French translation.
 *
 * @param {object} product - The product object from the database
 * @param {object} options - Options: { dryRun, force }
 * @returns {Promise<object>} Status report for this product
 */
export async function enrichSingleProduct(product, options = {}) {
  const prodId = String(product.product_id).trim();
  const currentDesc = product.description_fr || product.description || '';
  const currentHow = product.how_to_use || '';

  const descInvalid = isDescriptionInvalid(currentDesc);
  const howInvalid = isHowToUseInvalid(currentHow);

  // If already complete and valid, do NOT touch the product
  if (!descInvalid && !howInvalid && !options.force) {
    return {
      product_id: prodId,
      name: product.name,
      status: 'skipped',
      reason: 'already_complete_and_valid',
      message: 'Description et conseils d\'application déjà complets et valides.'
    };
  }

  console.log(`[Enricher] Product [${prodId}] needs fallback: descInvalid=${descInvalid}, howInvalid=${howInvalid}`);

  // Scrape UK Oriflame
  const ukData = await scrapeUkProductDetails(prodId);

  // If reference does NOT exist on uk.oriflame.com: keep existing TN info intact
  if (!ukData || !ukData.found) {
    console.log(`[Enricher] [${prodId}] Not found on uk.oriflame.com. Preserving existing tn.oriflame.com data.`);
    return {
      product_id: prodId,
      name: product.name,
      status: 'unmodified',
      reason: 'not_found_on_uk',
      kept_tn: true,
      message: 'Référence inexistante sur uk.oriflame.com. Données actuelles conservées intactes.'
    };
  }

  let newDescription = null;
  let newHowToUse = null;
  const updatedFields = [];

  // Translate description if needed
  if ((descInvalid || options.force) && ukData.description) {
    const translatedDesc = await translateText(ukData.description, {
      reference: prodId,
      champ: 'description',
      sourceLang: 'en',
      targetLang: 'fr'
    });
    if (translatedDesc && translatedDesc !== currentDesc) {
      newDescription = translatedDesc;
      updatedFields.push('description');
    }
  }

  // Translate how-to-use if needed
  if ((howInvalid || options.force) && ukData.howToUse) {
    const translatedHow = await translateText(ukData.howToUse, {
      reference: prodId,
      champ: 'how_to_use',
      sourceLang: 'en',
      targetLang: 'fr'
    });
    if (translatedHow && translatedHow !== currentHow) {
      newHowToUse = translatedHow;
      updatedFields.push('how_to_use');
    }
  }

  // If UK page had neither field available, preserve existing TN data
  if (updatedFields.length === 0) {
    return {
      product_id: prodId,
      name: product.name,
      status: 'unmodified',
      reason: 'uk_fields_empty',
      kept_tn: true,
      message: 'Produit trouvé sur UK mais les champs requis sont vides. Données actuelles conservées.'
    };
  }

  // Save changes to database and memory cache (only description and how_to_use!)
  if (!options.dryRun) {
    const updates = {};
    if (newDescription) {
      updates.description = newDescription;
      updates.description_fr = newDescription;
    }
    if (newHowToUse) {
      updates.how_to_use = newHowToUse;
    }

    await updateProductDescriptions(prodId, updates);
    console.log(`[Enricher] ✅ Product [${prodId}] successfully updated in DB with: ${updatedFields.join(', ')}.`);
  }

  return {
    product_id: prodId,
    name: product.name,
    status: 'enriched',
    updated_fields: updatedFields,
    before: {
      description: currentDesc,
      how_to_use: currentHow
    },
    after: {
      description: newDescription || currentDesc,
      how_to_use: newHowToUse || currentHow
    },
    uk_source: {
      description: ukData.description,
      howToUse: ukData.howToUse
    },
    dry_run: Boolean(options.dryRun)
  };
}

/**
 * Enriches multiple products in the catalog.
 *
 * @param {object} options - Options: { productIds, limit, dryRun, force }
 * @returns {Promise<object>} Complete enrichment batch report
 */
export async function enrichCatalog(options = {}) {
  const allProducts = await getProducts();
  let targetProducts = allProducts;

  if (Array.isArray(options.productIds) && options.productIds.length > 0) {
    const idsSet = new Set(options.productIds.map(String));
    targetProducts = allProducts.filter(p => idsSet.has(String(p.product_id)));
  }

  if (options.limit && Number(options.limit) > 0) {
    targetProducts = targetProducts.slice(0, Number(options.limit));
  }

  console.log(`[Enricher] Processing catalog enrichment for ${targetProducts.length} product(s)...`);

  const results = [];
  let enrichedCount = 0;
  let skippedCount = 0;
  let unmodifiedCount = 0;
  let errorsCount = 0;

  for (const prod of targetProducts) {
    try {
      const res = await enrichSingleProduct(prod, options);
      results.push(res);
      if (res.status === 'enriched') enrichedCount++;
      else if (res.status === 'skipped') skippedCount++;
      else if (res.status === 'unmodified') unmodifiedCount++;
    } catch (err) {
      errorsCount++;
      results.push({
        product_id: prod.product_id,
        name: prod.name,
        status: 'error',
        error: err.message
      });
    }
  }

  const metrics = await getTranslationMetrics();

  const report = {
    total_checked: targetProducts.length,
    enriched_count: enrichedCount,
    skipped_count: skippedCount,
    unmodified_count: unmodifiedCount,
    errors_count: errorsCount,
    metrics,
    results
  };

  console.log(`[Enricher] Batch complete: Enriched=${enrichedCount}, Skipped=${skippedCount}, Unmodified=${unmodifiedCount}, Errors=${errorsCount}`);
  return report;
}

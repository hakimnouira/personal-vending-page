// Comprehensive Multi-Category Oriflame Tunisia Scraper with Diff Engine
import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ENRICHMENTS_FILE = path.join(DATA_DIR, 'all-official-enrichments.json');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

import { getProducts, saveProducts } from '../dataAccess.js';
import { resolveLatestCatalogueCode } from './flipbook-scraper.js';

export async function scrapeAllOriflameCategories() {
  console.log("Starting comprehensive multi-category scrape from Oriflame Tunisia...");

  const allScrapedMap = new Map();

  // 0. Load current existing products from database first (falling back to disk if needed)
  let currentProducts = [];
  try {
    const dbProds = await getProducts(true);
    if (Array.isArray(dbProds) && dbProds.length > 0) {
      currentProducts = dbProds;
    } else if (fs.existsSync(PRODUCTS_FILE)) {
      currentProducts = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
    }
  } catch (e) {
    if (fs.existsSync(PRODUCTS_FILE)) {
      currentProducts = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
    }
  }
  const currentMap = new Map(currentProducts.map(p => [String(p.product_id), p]));
  console.log(`Loaded ${currentProducts.length} baseline products from active database.`);

  // 1. Extract from official digital catalogue enrichments (Live dynamic fetch + disk cache fallback)
  let enrichmentsData = null;
  try {
    // Dynamically resolve active catalogue code using centralized resolver
    const activeCatalogueCode = await resolveLatestCatalogueCode();

    console.log(`Fetching live digital catalogue enrichments for active catalogue: ${activeCatalogueCode}...`);
    const catalogueUrl = `https://tn-catalogue.oriflame.com/fr-TN/${activeCatalogueCode}-brp?HideStandardUI=true&Page=1`;
    const catPageRes = await axios.get(catalogueUrl, {
      httpsAgent,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 12000
    });

    const settingsMatch = catPageRes.data.match(/window\.staticSettings\s*=\s*(\{[\s\S]*?\});\s*(?:window\.|$)/);
    if (settingsMatch) {
      const settings = JSON.parse(settingsMatch[1]);
      const chunkUrls = settings.enrichments?.chunkUrls || {};
      const chunkEntries = Object.entries(chunkUrls);
      if (chunkEntries.length > 0) {
        const fetchedChunks = await Promise.all(
          chunkEntries.map(async ([key, url]) => {
            try {
              const cRes = await axios.get(url, { httpsAgent, timeout: 10000 });
              return { url, data: cRes.data };
            } catch (err) {
              return null;
            }
          })
        );
        const validChunks = fetchedChunks.filter(Boolean);
        if (validChunks.length > 0) {
          enrichmentsData = validChunks;
          fs.writeFileSync(ENRICHMENTS_FILE, JSON.stringify(validChunks, null, 2), 'utf8');
          console.log(`✅ Live digital catalogue enrichments successfully fetched and synchronized (${validChunks.length} chunks for ${activeCatalogueCode}).`);
        }
      }
    }
  } catch (liveErr) {
    console.warn("Live digital catalogue enrichments fetch note:", liveErr.message);
  }

  // Fallback to local cache file if live fetch didn't succeed
  if (!enrichmentsData && fs.existsSync(ENRICHMENTS_FILE)) {
    try {
      enrichmentsData = JSON.parse(fs.readFileSync(ENRICHMENTS_FILE, 'utf8'));
      console.log("Loaded catalogue enrichments from local cached file.");
    } catch (e) {}
  }

  if (Array.isArray(enrichmentsData)) {
    try {
      enrichmentsData.forEach(chunk => {
        const list = chunk.data?.enrichments || [];
        list.forEach(e => {
          if (e.type === 13) {
            let rawName = e.name || e.desc || e.alttext || '';
            let rawProdId = String(e.productId || '').trim();
            let cleanName = rawName;

            const match = rawName.match(/^([0-9]{4,6})[\s-]+(.+)$/);
            if (match) {
              cleanName = match[2].trim();
            }

            const numMatch = rawProdId.match(/^([0-9]{4,6})/);
            const prodId = numMatch ? numMatch[1] : (match ? match[1] : rawProdId.replace(/\+.*$/, '').trim());

            if (prodId && cleanName) {
              const cat = classifyCategory(cleanName);
              const price = Number(e.price) || 39.90;

              // Extract genuine original/regular price if available
              let originalPrice = Number(e.original_price) || Number(e.basicCataloguePrice) || Number(e.basicPrice) || null;
              const existing = currentMap.get(String(prodId));

              // Only inherit existing original_price if existing was legitimately promo and current price matches existing promo price
              if (!originalPrice && existing && existing.is_promo && Number(existing.original_price) > price) {
                if (Math.abs(Number(existing.price) - price) < 0.05) {
                  originalPrice = Number(existing.original_price);
                }
              }

              // If current price is equal or higher than originalPrice, promotion has expired
              if (originalPrice && originalPrice <= price) {
                originalPrice = null;
              }

              const isPromo = Boolean(originalPrice && originalPrice > price);
              const discountPercent = isPromo ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

              const mainImg = `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_1.png&MediaId=20989035&Version=1`;
              const galleryImages = [
                mainImg,
                `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_2.png&MediaId=20989035&Version=1`,
                `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_3.png&MediaId=20989035&Version=1`,
                `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_4.png&MediaId=20989035&Version=1`
              ];

              let inStock = isProductInStock(rawName + ' ' + (e.desc || '') + ' ' + (e.alttext || ''), e);
              if (existing && existing.in_stock === false) {
                inStock = false;
              }

              allScrapedMap.set(String(prodId), {
                product_id: String(prodId),
                name: cleanName,
                name_fr: cleanName,
                category: cat,
                price: price,
                original_price: isPromo ? originalPrice : null,
                original_catalog_price: price,
                company_discount_applied: false,
                company_discount_percent: 0,
                is_promo: isPromo,
                discount_percent: discountPercent,
                size: inferSizeFromName(cleanName),
                suitable_for: "Tous types de peaux • Produit certifié Oriflame Suède",
                image_url: mainImg,
                images: galleryImages,
                description: `Produit officiel Oriflame Tunisie (${prodId}). Formule haute qualité aux extraits scandinaves bienfaisants.`,
                benefits: [
                  "100% Produit authentique certifié par Mouna Nouira",
                  discountPercent > 0 ? `Offre promotionnelle exclusive du catalogue (-${discountPercent}%)` : "Formule concentrée haute performance",
                  "Testé et approuvé sous contrôle dermatologique"
                ],
                how_to_use: "Appliquer délicatement selon les recommandations de la gamme.",
                ingredients: "Extraits botaniques suédois et complexes actifs certifiés Oriflame.",
                in_stock: inStock
              });
            }
          }
        });
      });
      console.log(`Loaded ${allScrapedMap.size} products from active official catalogue enrichments.`);
    } catch (e) {
      console.warn("Enrichment extraction note:", e.message);
    }
  }

  // 1.5 Extract genuine promo prices from active digital Flipbook catalogue hotspots
  const FLIPBOOK_FILE = path.join(DATA_DIR, 'flipbook.json');
  if (fs.existsSync(FLIPBOOK_FILE)) {
    try {
      const fbData = JSON.parse(fs.readFileSync(FLIPBOOK_FILE, 'utf8'));
      const pages = Array.isArray(fbData) ? fbData : (fbData.spreads || fbData.pages || []);
      pages.forEach(pg => {
        (pg.hotspots || []).forEach(h => {
          const hid = String(h.id || '').trim();
          const hPrice = Number(h.price);
          if (hid && hPrice > 0) {
            const existing = allScrapedMap.get(hid);
            if (existing) {
              if (hPrice < existing.price) {
                existing.original_price = existing.price;
                existing.price = hPrice;
                existing.original_catalog_price = hPrice;
                existing.is_promo = true;
                existing.discount_percent = Math.round(((existing.original_price - hPrice) / existing.original_price) * 100);
              } else if (hPrice > existing.price) {
                existing.price = hPrice;
                existing.original_catalog_price = hPrice;
                if (existing.original_price && existing.original_price <= hPrice) {
                  existing.original_price = null;
                  existing.is_promo = false;
                  existing.discount_percent = 0;
                }
              }
            }
          }
        });
      });
      console.log(`Synchronized active Flipbook catalogue hotspot prices into scraper map.`);
    } catch (e) {
      console.warn("Flipbook extraction note:", e.message);
    }
  }

  // 2. Multi-Category Web Scrape Endpoints with deep stock & authentic live price parsing
  const targetCategories = [
    { url: 'https://tn.oriflame.com/bestsellers?store=TN-oriflame_1', cat: 'Skincare' },
    { url: 'https://tn.oriflame.com/fragrance?store=TN-oriflame_1', cat: 'Fragrance' },
    { url: 'https://tn.oriflame.com/skincare?store=TN-oriflame_1', cat: 'Skincare' },
    { url: 'https://tn.oriflame.com/makeup?store=TN-oriflame_1', cat: 'Makeup' },
    { url: 'https://tn.oriflame.com/hair?store=TN-oriflame_1', cat: 'Haircare' },
    { url: 'https://tn.oriflame.com/men?store=TN-oriflame_1', cat: 'Fragrance' },
    { url: 'https://tn.oriflame.com/bath-body?store=TN-oriflame_1', cat: 'Skincare' }
  ];

  for (const item of targetCategories) {
    try {
      console.log(`Scraping category: ${item.url}...`);
      const res = await axios.get(item.url, {
        httpsAgent,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7' },
        timeout: 10000
      });

      const $ = cheerio.load(res.data);
      const nextDataStr = $('#__NEXT_DATA__').html();
      if (nextDataStr) {
        try {
          const nextData = JSON.parse(nextDataStr);
          const pageProps = nextData.props?.pageProps;
          
          const contentItems = (
            pageProps?.data?.application?.editorialPage?.contentItems ||
            pageProps?.content?.contentItems ||
            []
          );
          
          contentItems.forEach(ci => {
            const rows = ci?.content?.rows || [];
            rows.forEach(r => {
              const rowItems = Array.isArray(r?.content) ? r.content : (r?.content ? [r.content] : []);
              rowItems.forEach(p => {
                const prodId = String(p.productCode || p.code || p.productId || p.sku || '');
                if (prodId && prodId.length >= 4) {
                  const name = p.concept?.name || p.title || p.name || 'Produit Oriflame';
                  const currentPriceRaw = p.formattedPrice?.price?.currentPrice || p.price?.price?.currentPrice || p.price?.currentPrice || p.price;
                  const basicPriceRaw = p.formattedPrice?.price?.basicCataloguePrice || p.price?.price?.basicCataloguePrice || p.price?.basicCataloguePrice;

                  const currentPrice = parsePrice(currentPriceRaw);
                  const basicPrice = parsePrice(basicPriceRaw);

                  const existingItem = allScrapedMap.get(prodId) || currentMap.get(prodId);

                  // Live web price is authoritative — no Math.min locking in stale past discounts
                  const finalSellingPrice = currentPrice > 0 ? currentPrice : (existingItem?.price || 39.90);
                  const finalOriginalPrice = (basicPrice > finalSellingPrice) ? basicPrice : null;
                  const finalIsPromo = Boolean(finalOriginalPrice && finalOriginalPrice > finalSellingPrice);
                  const finalDiscount = finalIsPromo ? Math.round(((finalOriginalPrice - finalSellingPrice) / finalOriginalPrice) * 100) : 0;

                  const mainImg = p.mainImage?.url || p.imageUrl || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_1.png&MediaId=20989035&Version=1`;
                  const galleryImgs = [
                    mainImg,
                    `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_2.png&MediaId=20989035&Version=1`,
                    `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_3.png&MediaId=20989035&Version=1`,
                    `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_4.png&MediaId=20989035&Version=1`
                  ];

                  // Stock & Buy Option Check:
                  const labels = p.labels || [];
                  const hasBuyOption = labels.some(l => l.labelKey === 'AddToBasketVisible' || (l.title && l.title.toLowerCase().includes('panier')));
                  const isOffStock = p.isOffStock === true;
                  const showNotify = p.backInStockAvailability?.showBackInStockNotification === true;
                  
                  let inStock = hasBuyOption && !isOffStock && !showNotify;
                  if (inStock) {
                    inStock = isProductInStock(name + ' ' + (p.description || '') + ' ' + JSON.stringify(labels), p);
                  }

                  // Multi-shade / color variants extraction from concept
                  const conceptProducts = p.concept?.products || [];
                  let variants = undefined;
                  if (Array.isArray(conceptProducts) && conceptProducts.length > 1) {
                    variants = conceptProducts.map(cp => {
                      const vCode = String(cp.productCode || cp.code || '');
                      const sName = cp.shadeName || '';
                      const hex = (Array.isArray(cp.hexColors) && cp.hexColors[0]) || cp.colorImageUrl || '#DE7B90';
                      const vImg = cp.mainImage?.url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${vCode}%2f${vCode}_1.png&MediaId=20989035&Version=1`;
                      const vCurrPrice = parsePrice(cp.formattedPrice?.price?.currentPrice) || finalSellingPrice;
                      const vBasicPrice = parsePrice(cp.formattedPrice?.price?.basicCataloguePrice) || (finalOriginalPrice || vCurrPrice);
                      const vInStock = cp.backInStockAvailability?.showBackInStockNotification !== true && !cp.isOffStock;
                      return {
                        product_id: vCode,
                        name: `${name} - ${sName || vCode}`,
                        shade_name: sName,
                        hex_color: hex,
                        image_url: vImg,
                        price: vCurrPrice,
                        original_price: vBasicPrice > vCurrPrice ? vBasicPrice : null,
                        in_stock: vInStock
                      };
                    }).filter(v => v.product_id);
                  }

                  allScrapedMap.set(prodId, {
                    product_id: prodId,
                    name: name,
                    name_fr: name,
                    category: classifyCategory(name) || item.cat,
                    price: finalSellingPrice,
                    original_price: finalOriginalPrice,
                    original_catalog_price: finalSellingPrice,
                    company_discount_applied: false,
                    company_discount_percent: 0,
                    is_promo: finalIsPromo,
                    discount_percent: finalDiscount,
                    size: inferSizeFromName(name),
                    suitable_for: "Tous types de peaux • Testé sous contrôle dermatologique",
                    image_url: mainImg,
                    images: galleryImgs,
                    variants: (variants && variants.length > 1) ? variants : undefined,
                    description: p.description || existingItem?.description || `Produit officiel Oriflame Tunisie (${prodId}). Formule scandinave haute performance.`,
                    benefits: [
                      "100% Produit authentique Oriflame Suède",
                      finalDiscount > 0 ? `Offre promotionnelle exclusive : -${finalDiscount}% de réduction` : "Formule haute concentration",
                      "Disponible pour livraison immédiate partout en Tunisie"
                    ],
                    how_to_use: "Appliquer délicatement sur une peau propre selon la routine recommandée.",
                    ingredients: "Formule enrichie en extraits botaniques suédois et principes actifs purs certifiés Oriflame.",
                    in_stock: inStock
                  });
                }
              });
            });
          });
        } catch (parseErr) {}
      }
    } catch (catErr) {
      console.warn(`Category scrape note for ${item.url}:`, catErr.message);
    }
  }

  // 2.5 Multi-Shade Family Grouping & Dynamic Live Price Synchronization (No Hardcoded Stale Prices)
  const knownShadeFamilies = [
    {
      parentId: '38883',
      baseName: 'Baume à Lèvres The ONE Lip Spa',
      category: 'Makeup',
      defaultShades: [
        { code: '38883', name: 'Pink', hex: '#B2535B', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38883%2f38883_1.png&MediaId=14359194&Version=1' },
        { code: '38885', name: 'Raspberry', hex: '#8E294B', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38885%2f38885_1.png&MediaId=14359350&Version=2' }
      ]
    },
    {
      parentId: '38690',
      baseName: 'Rouge à lèvres Cremeux OnColour',
      category: 'Makeup',
      defaultShades: [
        { code: '38690', name: 'Coral Red', hex: '#D52B28', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38690%2f38690_1.png&MediaId=20989035&Version=1' },
        { code: '38691', name: 'Orange Coral', hex: '#E74425', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38691%2f38691_1.png&MediaId=20989035&Version=1' },
        { code: '38693', name: 'Bright Fuchsia', hex: '#E41A64', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38693%2f38693_1.png&MediaId=17991659&Version=1' },
        { code: '38689', name: 'Cranberry Red', hex: '#921F36', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38689%2f38689_1.png&MediaId=17991652&Version=3' },
        { code: '38692', name: 'Punch Pink', hex: '#D05476', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38692%2f38692_1.png&MediaId=17991658&Version=2' }
      ]
    },
    {
      parentId: '41797',
      baseName: 'Rouge à Lèvres THE ONE Colour Unlimited Ultra Fix',
      category: 'Makeup',
      defaultShades: [
        { code: '41797', name: 'Ultra Nude', hex: '#A8574B', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f41797%2f41797_1.png&MediaId=20989035&Version=1' },
        { code: '41800', name: 'Ultra Raspberry', hex: '#872D43', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f41800%2f41800_1.png&MediaId=20989035&Version=1' },
        { code: '41804', name: 'Ultra Red', hex: '#A21727', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f41804%2f41804_1.png&MediaId=20989035&Version=1' },
        { code: '41806', name: 'Ultra Burgundy', hex: '#631826', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f41806%2f41806_1.png&MediaId=20989035&Version=1' }
      ]
    },
    {
      parentId: '42106',
      baseName: 'Fond de Teint Minéral Longue Tenue IP 20 Giordani Gold',
      category: 'Makeup',
      defaultShades: [
        { code: '42106', name: 'Light Ivory Neutral', hex: '#E7BA9D', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f42106%2f42106_1.png&MediaId=20989035&Version=1' },
        { code: '42102', name: 'Porcelain Cool', hex: '#F0CBB6', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f42102%2f42102_1.png&MediaId=20989035&Version=1' },
        { code: '42103', name: 'Light Rose Warm', hex: '#EAC3A9', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f42103%2f42103_1.png&MediaId=20989035&Version=1' },
        { code: '42104', name: 'Beige Warm', hex: '#DFB091', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f42104%2f42104_1.png&MediaId=20989035&Version=1' },
        { code: '42105', name: 'Natural Beige Neutral', hex: '#D6A687', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f42105%2f42105_1.png&MediaId=20989035&Version=1' }
      ]
    },
    {
      parentId: '46888',
      baseName: 'Feutre à lèvres Stain & Stay THE ONE',
      category: 'Makeup',
      defaultShades: [
        { code: '46888', name: 'Nude', hex: '#AC6358', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46888%2f46888_1.png&MediaId=20989035&Version=1' },
        { code: '46893', name: 'Brick', hex: '#8B2C2F', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46893%2f46893_1.png&MediaId=20989035&Version=1' }
      ]
    },
    {
      parentId: '46907',
      baseName: 'Fond de Teint The ONE Everlasting Sync Stress-Free',
      category: 'Makeup',
      defaultShades: [
        { code: '46907', name: 'Vanilla', hex: '#EED3BE', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46907%2f46907_1.png&MediaId=20989035&Version=1' },
        { code: '46908', name: 'Porcelain', hex: '#E8C5AC', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46908%2f46908_1.png&MediaId=20989035&Version=1' },
        { code: '46909', name: 'Marble', hex: '#E6BC9F', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46909%2f46909_1.png&MediaId=20989035&Version=1' },
        { code: '46910', name: 'Light Rose', hex: '#DFA78D', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46910%2f46910_1.png&MediaId=20989035&Version=1' },
        { code: '46912', name: 'Soft Sand', hex: '#D29B7F', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46912%2f46912_1.png&MediaId=20989035&Version=1' },
        { code: '46913', name: 'Beige Warm', hex: '#C58C71', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46913%2f46913_1.png&MediaId=20989035&Version=1' }
      ]
    },
    {
      parentId: '46938',
      baseName: 'Illuminateur Multi-Usages THE ONE',
      category: 'Makeup',
      defaultShades: [
        { code: '46938', name: 'Nude Optimism', hex: '#D4A373', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46938%2f46938_1.png&MediaId=20989035&Version=1' },
        { code: '46939', name: 'Coral Confidence', hex: '#E76F51', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46939%2f46939_1.png&MediaId=20989035&Version=1' },
        { code: '46940', name: 'Pink Pride', hex: '#E56B6F', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46940%2f46940_1.png&MediaId=20989035&Version=1' },
        { code: '46941', name: 'Grape Attraction', hex: '#B56576', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46941%2f46941_1.png&MediaId=20989035&Version=1' }
      ]
    },
    {
      parentId: '47704',
      baseName: 'Eyeliner High Impact THE ONE',
      category: 'Makeup',
      defaultShades: [
        { code: '47704', name: 'Black', hex: '#1C1917', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47704%2f47704_1.png&MediaId=20989035&Version=1' },
        { code: '47707', name: 'Brown', hex: '#573D30', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47707%2f47707_1.png&MediaId=20989035&Version=1' }
      ]
    },
    {
      parentId: '47739',
      baseName: 'Anti-Cernes Perfecteur Tout-en-Un THE ONE',
      category: 'Makeup',
      defaultShades: [
        { code: '47739', name: 'Fair Light', hex: '#EED9C7', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47739%2f47739_1.png&MediaId=20989035&Version=1' },
        { code: '47740', name: 'Medium Light', hex: '#E6C4A7', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47740%2f47740_1.png&MediaId=20989035&Version=1' },
        { code: '47741', name: 'Deep Light', hex: '#D8B091', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47741%2f47741_1.png&MediaId=20989035&Version=1' },
        { code: '47742', name: 'Green Neutralizer', hex: '#C2D5C0', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47742%2f47742_1.png&MediaId=20989035&Version=1' },
        { code: '47743', name: 'Peach Brightener', hex: '#F0C7A9', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47743%2f47743_1.png&MediaId=20989035&Version=1' }
      ]
    }
  ];

  // Fetch live shade prices directly from parent product page for 100% accuracy
  for (const fam of knownShadeFamilies) {
    try {
      let liveShades = null;
      try {
        const liveFamRes = await axios.get(`https://tn.oriflame.com/products/product?code=${fam.parentId}&store=TN-oriflame_1`, {
          httpsAgent,
          headers: { 'User-Agent': USER_AGENT },
          timeout: 7000
        });
        const $f = cheerio.load(liveFamRes.data);
        const nd = JSON.parse($f('#__NEXT_DATA__').html() || '{}');
        const pDetail = nd.props?.pageProps?.productDetailData?.product;
        const conceptProds = pDetail?.concept?.products || [];
        if (Array.isArray(conceptProds) && conceptProds.length > 0) {
          liveShades = conceptProds.map(cp => {
            const pCode = String(cp.productCode || cp.code || '');
            const sName = cp.shadeName || '';
            const hex = (Array.isArray(cp.hexColors) && cp.hexColors[0]) || cp.colorImageUrl || '#DE7B90';
            const vImg = cp.mainImage?.url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${pCode}%2f${pCode}_1.png&MediaId=20989035&Version=1`;
            const vCurrPrice = parsePrice(cp.formattedPrice?.price?.currentPrice);
            const vBasicPrice = parsePrice(cp.formattedPrice?.price?.basicCataloguePrice);
            const vInStock = cp.backInStockAvailability?.showBackInStockNotification !== true && !cp.isOffStock;
            return {
              product_id: pCode,
              name: `${fam.baseName} - ${sName || pCode}`,
              shade_name: sName,
              hex_color: hex,
              image_url: vImg,
              price: vCurrPrice > 0 ? vCurrPrice : 29.90,
              original_price: (vBasicPrice > vCurrPrice) ? vBasicPrice : null,
              in_stock: vInStock
            };
          }).filter(v => v.product_id);
        }
      } catch (err) {}

      let parent = allScrapedMap.get(fam.parentId) || currentMap.get(fam.parentId);
      const shadeList = (liveShades && liveShades.length > 0) ? liveShades : fam.defaultShades.map(s => {
        const existingShade = allScrapedMap.get(s.code) || currentMap.get(s.code);
        const sPrice = existingShade ? Number(existingShade.price) : 29.90;
        const sOrigPrice = existingShade?.is_promo ? Number(existingShade.original_price) : null;
        return {
          product_id: s.code,
          name: `${fam.baseName} - ${s.name}`,
          shade_name: s.name,
          hex_color: s.hex,
          image_url: existingShade?.image_url || s.img,
          price: sPrice,
          original_price: sOrigPrice,
          in_stock: existingShade ? existingShade.in_stock !== false : true
        };
      });

      const firstInStock = shadeList.find(s => s.in_stock !== false) || shadeList[0];
      const parentSellingPrice = firstInStock?.price || 29.90;
      const parentOriginalPrice = firstInStock?.original_price || null;
      const parentIsPromo = Boolean(parentOriginalPrice && parentOriginalPrice > parentSellingPrice);
      const parentDiscount = parentIsPromo ? Math.round(((parentOriginalPrice - parentSellingPrice) / parentOriginalPrice) * 100) : 0;

      if (!parent) {
        parent = {
          product_id: fam.parentId,
          name: fam.baseName,
          name_fr: fam.baseName,
          category: fam.category,
          price: parentSellingPrice,
          original_price: parentOriginalPrice,
          original_catalog_price: parentSellingPrice,
          company_discount_applied: false,
          company_discount_percent: 0,
          is_promo: parentIsPromo,
          discount_percent: parentDiscount,
          size: 'Format Standard',
          suitable_for: 'Tous types de peaux • Produit certifié Oriflame Suède',
          image_url: firstInStock?.image_url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${fam.parentId}%2f${fam.parentId}_1.png&MediaId=20989035&Version=1`,
          images: [firstInStock?.image_url],
          description: `Produit officiel Oriflame Tunisie (${fam.parentId}). Formule scandinave haute performance.`,
          description_fr: `Produit officiel Oriflame Tunisie (${fam.parentId}). Formule scandinave haute performance.`,
          benefits: ["100% Produit original certifié par Mouna Nouira", "Formule suédoise aux extraits naturels bienfaisants"],
          how_to_use: "Appliquer délicatement selon les recommandations de la gamme.",
          ingredients: "Extraits botaniques suédois et complexes actifs certifiés Oriflame.",
          in_stock: shadeList.some(s => s.in_stock !== false)
        };
      }

      parent.name = fam.baseName;
      parent.name_fr = fam.baseName;
      parent.price = parentSellingPrice;
      parent.original_price = parentOriginalPrice;
      parent.original_catalog_price = parentSellingPrice;
      parent.is_promo = parentIsPromo;
      parent.discount_percent = parentDiscount;
      parent.variants = shadeList;
      parent.in_stock = shadeList.some(s => s.in_stock !== false);
      allScrapedMap.set(fam.parentId, parent);

      // Keep every individual shade reference as an accessible product in the catalog
      shadeList.forEach(s => {
        if (s.product_id && !allScrapedMap.has(String(s.product_id))) {
          allScrapedMap.set(String(s.product_id), {
            product_id: String(s.product_id),
            name: s.name,
            name_fr: s.name,
            category: fam.category,
            price: s.price,
            original_price: s.original_price,
            original_catalog_price: s.price,
            company_discount_applied: false,
            company_discount_percent: 0,
            is_promo: Boolean(s.original_price && s.original_price > s.price),
            discount_percent: (s.original_price && s.original_price > s.price) ? Math.round(((s.original_price - s.price) / s.original_price) * 100) : 0,
            size: 'Format Standard',
            suitable_for: 'Tous types de peaux • Certifié Oriflame Suède',
            image_url: s.image_url,
            images: [s.image_url],
            description: `Produit officiel Oriflame Tunisie (${s.product_id}) : ${s.name}. Formule scandinave haute qualité.`,
            description_fr: `Produit officiel Oriflame Tunisie (${s.product_id}) : ${s.name}. Formule scandinave haute qualité.`,
            benefits: ["100% Produit original certifié par Mouna Nouira"],
            how_to_use: "Appliquer délicatement selon les recommandations officielles.",
            ingredients: "Extraits botaniques suédois et complexes actifs certifiés Oriflame.",
            in_stock: s.in_stock !== false
          });
        }
      });
    } catch (e) {
      console.warn(`Family sync note for ${fam.parentId}:`, e.message);
    }
  }

  const scrapedProducts = Array.from(allScrapedMap.values());
  console.log(`Total freshly scraped products from official channels: ${scrapedProducts.length}`);

  // Merge freshly scraped products with existing baseline products:
  // 1. All existing products in DB are preserved (never deleted silently)
  // 2. Products present in both are updated with newest prices, promo status, stock and images
  // 3. New products from the scrape are added
  const mergedMap = new Map();
  currentProducts.forEach(p => {
    if (p && p.product_id) {
      mergedMap.set(String(p.product_id).trim(), p);
    }
  });

  scrapedProducts.forEach(sp => {
    const strId = String(sp.product_id).trim();
    const existing = mergedMap.get(strId);
    if (existing) {
      mergedMap.set(strId, {
        ...existing,
        ...sp,
        price: Number(sp.price),
        original_price: sp.original_price != null ? Number(sp.original_price) : null,
        original_catalog_price: Number(sp.original_catalog_price || sp.price),
        is_promo: Boolean(sp.is_promo),
        discount_percent: sp.discount_percent || 0,
        in_stock: sp.in_stock !== false,
        name: sp.name || existing.name,
        name_fr: sp.name_fr || existing.name_fr || sp.name,
        image_url: sp.image_url || existing.image_url,
        images: (sp.images && sp.images.length > 0) ? sp.images : existing.images
      });
    } else {
      mergedMap.set(strId, sp);
    }
  });

  const mergedProducts = Array.from(mergedMap.values());
  console.log(`Total merged catalogue products in memory: ${mergedProducts.length}`);

  // 3. Compute Synchronisation Statistics (New, Modified, Unchanged, Deleted)
  let newCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;
  let deletedCount = 0;

  const newItems = [];
  const modifiedItems = [];

  mergedProducts.forEach(prod => {
    const existing = currentMap.get(String(prod.product_id));
    if (!existing) {
      newCount++;
      newItems.push({ code: prod.product_id, name: prod.name, price: prod.price, status: 'new' });
    } else {
      const priceChanged = Math.abs(Number(existing.price) - Number(prod.price)) > 0.05;
      const promoChanged = existing.is_promo !== prod.is_promo;
      const nameChanged = existing.name !== prod.name;
      const stockChanged = existing.in_stock !== prod.in_stock;

      if (priceChanged || promoChanged || nameChanged || stockChanged) {
        modifiedCount++;
        modifiedItems.push({
          code: prod.product_id,
          name: prod.name,
          old_price: existing.price,
          new_price: prod.price,
          status: 'modified'
        });
      } else {
        unchangedCount++;
      }
    }
  });

  const cleanMerged = mergedProducts.map(p => ({
    ...p,
    price: Number(p.price),
    original_catalog_price: Number(p.original_catalog_price || p.price),
    company_discount_applied: false,
    company_discount_percent: 0
  }));

  // Save to active database (Neon Postgres) and local file cache
  try {
    await saveProducts(cleanMerged);
    console.log(`Persisted ${cleanMerged.length} products to active Neon Postgres database and local cache.`);
  } catch (dbErr) {
    console.warn("Neon DB sync note during scrape:", dbErr.message);
  }

  // Also write to local cache file
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(cleanMerged, null, 2), 'utf8');
  } catch (fsErr) {}

  // Reset global company discount flag so newly scraped products can receive discount cleanly
  const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      settings.company_discount_applied = false;
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    }
  } catch (e) {}

  const diffReport = {
    total_scraped: scrapedProducts.length,
    new_count: newCount,
    modified_count: modifiedCount,
    unchanged_count: unchangedCount,
    deleted_count: deletedCount,
    new_items_preview: newItems.slice(0, 10),
    modified_items_preview: modifiedItems.slice(0, 10),
    timestamp: new Date().toISOString(),
    categories_breakdown: {
      Fragrance: scrapedProducts.filter(p => p.category === 'Fragrance').length,
      Skincare: scrapedProducts.filter(p => p.category === 'Skincare').length,
      Makeup: scrapedProducts.filter(p => p.category === 'Makeup').length,
      Wellness: scrapedProducts.filter(p => p.category === 'Wellness').length,
      Haircare: scrapedProducts.filter(p => p.category === 'Haircare').length
    }
  };

  return {
    success: true,
    report: diffReport,
    products: mergedProducts
  };
}

export function classifyCategory(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('parfum') || lower.includes('eau de') || lower.includes('toilette') || lower.includes('brume') || lower.includes('déodorant') || lower.includes('deodorant') || lower.includes('roll-on') || lower.includes('glacier') || lower.includes('eclat') || lower.includes('possess') || lower.includes('amber') || lower.includes('giordani gold essenza') || lower.includes('signature') || lower.includes('lucia') || lower.includes('volare') || lower.includes('venture') || lower.includes('joyce') || lower.includes('scents')) {
    return 'Fragrance';
  }
  if (lower.includes('mascara') || lower.includes('rouge à lèvres') || lower.includes('rouge a levres') || lower.includes('lèvres') || lower.includes('levres') || lower.includes('blush') || lower.includes('fond de teint') || lower.includes('poudre') || lower.includes('fard') || lower.includes('vernis') || lower.includes('top coat') || lower.includes('eyeliner') || lower.includes('sourcils') || lower.includes('the one') || lower.includes('oncolour') || lower.includes('perles bronzantes') || lower.includes('crayon') || lower.includes('gloss') || lower.includes('joues')) {
    return 'Makeup';
  }
  if (lower.includes('shampooing') || lower.includes('après-shampooing') || lower.includes('capillaire') || lower.includes('cheveux') || lower.includes('eleo') || lower.includes('hairx') || lower.includes('duologi')) {
    return 'Haircare';
  }
  if (lower.includes('wellness') || lower.includes('astaxanthine') || lower.includes('oméga') || lower.includes('omega') || lower.includes('vitamines') || lower.includes('shake') || lower.includes('soupe') || lower.includes('calcium') || lower.includes('fibres')) {
    return 'Wellness';
  }
  return 'Skincare';
}

export function parsePrice(raw) {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  if (!raw) return 0;
  const match = String(raw).replace(',', '.').match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function inferSizeFromName(name = '') {
  const match = name.match(/([0-9]+\s*(ml|g|capsules|comprimés|sachets|portions))/i);
  return match ? match[1] : 'Format Standard';
}

function calculateEstimatedOriginalPrice(price) {
  // Do NOT synthesize fake original prices; only genuine catalogue prices should be stored
  return null;
}

export async function scrapeProductFromUrl(inputUrl) {
  try {
    let rawUrl = String(inputUrl || '').trim();
    let code = '';
    const codeMatch = rawUrl.match(/(?:code=|^)([0-9]{4,6})/i);
    if (codeMatch) code = codeMatch[1];
    let url = rawUrl;
    if (!url.startsWith('http')) {
      url = `https://tn.oriflame.com/products/product?code=${code || rawUrl}`;
    }

    const response = await axios.get(url, {
      httpsAgent,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
      },
      timeout: 15000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    let title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || 'Produit Oriflame';
    title = title.split('|')[0].trim();

    let price = 45.00;
    let originalPrice = null;
    let inStock = true;
    let variants = [];
    let foundImages = [];
    let description = '';
    let ingredients = '';

    const nextDataStr = $('#__NEXT_DATA__').html();
    if (nextDataStr) {
      try {
        const nextData = JSON.parse(nextDataStr);
        const pdp = nextData.props?.pageProps?.productDetailData;
        const product = pdp?.product;
        const jsonLd = pdp?.application?.productDetailPage?.metadata?.jsonLd;

        if (jsonLd?.name) title = jsonLd.name.split('|')[0].trim();
        else if (product?.concept?.name) title = product.concept.name.split('|')[0].trim();

        if (jsonLd?.sku && !code) code = String(jsonLd.sku);
        else if (product?.productCode && !code) code = String(product.productCode);

        // High resolution images from JSON-LD
        if (jsonLd?.image) {
          foundImages = Array.isArray(jsonLd.image) ? [...jsonLd.image] : [jsonLd.image];
        }

        const conceptProducts = product?.concept?.products || [];
        const cp = conceptProducts.find(item => String(item.productCode || item.code) === String(code)) || conceptProducts[0];
        
        if (cp?.formattedPrice?.price) {
          const curr = parsePrice(cp.formattedPrice.price.currentPrice);
          const basic = parsePrice(cp.formattedPrice.price.basicCataloguePrice);
          if (curr > 0) price = curr;
          if (basic > curr) originalPrice = basic;
        } else if (jsonLd?.offers?.price) {
          price = parsePrice(jsonLd.offers.price);
        }

        // Stock checks
        if (jsonLd?.offers?.availability) {
          if (jsonLd.offers.availability.includes('OutOfStock')) inStock = false;
          else if (jsonLd.offers.availability.includes('InStock')) inStock = true;
        }
        if (cp?.labels) {
          if (cp.labels.some(l => l.labelKey === 'OutOfStock')) inStock = false;
          if (cp.labels.some(l => l.labelKey === 'AddToBasketVisible')) inStock = true;
        }
        if (cp?.isOffStock === true) inStock = false;
        if (cp?.backInStockAvailability?.showBackInStockNotification === true) inStock = false;

        // Description
        description = product?.concept?.description || product?.concept?.brand?.description || jsonLd?.description || $('meta[name="description"]').attr('content') || '';

        // Ingredients
        const ingSection = pdp?.application?.productDetailPage?.sections?.ingredients;
        if (Array.isArray(ingSection) && ingSection.length > 0) {
          ingredients = ingSection.map(i => i.text).filter(Boolean).join(' ');
        }

        // Multi-shade variants
        if (Array.isArray(conceptProducts) && conceptProducts.length > 1) {
          variants = conceptProducts.map(item => {
            const pCode = String(item.productCode || item.code || '');
            const sName = item.shadeName || '';
            const hex = (Array.isArray(item.hexColors) && item.hexColors[0]) || item.colorImageUrl || '#DE7B90';
            const vImg = item.mainImage?.url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${pCode}%2f${pCode}_1.png&MediaId=20989035&Version=1`;
            const vCurrPrice = parsePrice(item.formattedPrice?.price?.currentPrice) || price;
            const vBasicPrice = parsePrice(item.formattedPrice?.price?.basicCataloguePrice) || (originalPrice || vCurrPrice);
            const vInStock = item.backInStockAvailability?.showBackInStockNotification !== true && !item.isOffStock;
            return {
              product_id: pCode,
              name: `${title} - ${sName || pCode}`,
              shade_name: sName,
              hex_color: hex,
              image_url: vImg,
              price: vCurrPrice,
              original_price: vBasicPrice > vCurrPrice ? vBasicPrice : null,
              in_stock: vInStock
            };
          }).filter(v => v.product_id);
        }
      } catch (e) {
        console.warn('NextData parse note:', e.message);
      }
    }

    if (!code) {
      const fallbackMatch = html.match(/"productCode"\s*:\s*"([0-9]{4,6})"/);
      if (fallbackMatch) code = fallbackMatch[1];
      else code = `ORF-${Date.now().toString().slice(-6)}`;
    }

    const defaultImg = `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${code}%2f${code}_1.png&MediaId=20989035&Version=1`;
    const mainImg = foundImages[0] || $('meta[property="og:image"]').attr('content') || defaultImg;
    if (!foundImages.includes(mainImg)) foundImages.unshift(mainImg);

    if (foundImages.length === 1 && code && !isNaN(Number(code))) {
      foundImages.push(
        `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${code}%2f${code}_2.png&MediaId=20989035&Version=1`,
        `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${code}%2f${code}_3.png&MediaId=20989035&Version=1`
      );
    }

    const isPromo = Boolean(originalPrice && originalPrice > price);
    const discountPercent = isPromo ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

    return {
      product_id: code,
      name: title,
      name_fr: title,
      category: classifyCategory(title),
      price: price,
      original_price: isPromo ? originalPrice : null,
      original_catalog_price: price,
      company_discount_applied: false,
      company_discount_percent: 0,
      is_promo: isPromo,
      discount_percent: discountPercent,
      size: inferSizeFromName(title),
      suitable_for: 'Tous types de peaux • Certifié Oriflame Suède',
      image_url: mainImg,
      images: foundImages,
      variants: variants.length > 0 ? variants : undefined,
      description: description || `Produit officiel Oriflame Tunisie (${code}) : ${title}. Formule scandinave haute performance.`,
      description_fr: description || `Produit officiel Oriflame Tunisie (${code}) : ${title}. Formule scandinave haute performance.`,
      benefits: [
        "100% Produit original certifié par Mouna Nouira",
        discountPercent > 0 ? `Offre promotionnelle exclusive catalogue : -${discountPercent}%` : "Formule scandinave haute qualité"
      ],
      how_to_use: "Appliquer délicatement selon les recommandations officielles Oriflame.",
      ingredients: ingredients || "Extraits botaniques suédois et complexes actifs certifiés Oriflame.",
      in_stock: inStock
    };
  } catch (err) {
    throw new Error(`Échec du scraping de la page produit (${inputUrl}) : ${err.message}`);
  }
}

/**
 * Accurately determines product stock availability.
 * Specifically checks for "متوفر قريباً", "غير متوفر", "bientôt disponible", "rupture de stock", "OutOfStock", etc.
 */
export function isProductInStock(text = '', extraData = {}) {
  const combined = (
    (typeof text === 'string' ? text : '') + ' ' +
    (extraData.name || '') + ' ' +
    (extraData.title || '') + ' ' +
    (extraData.desc || '') + ' ' +
    (extraData.description || '') + ' ' +
    (extraData.alttext || '') + ' ' +
    (extraData.badge || '') + ' ' +
    (extraData.stockStatus || '') + ' ' +
    (extraData.availability || '')
  );

  const lower = combined.toLowerCase();

  // Out of stock indicators in Schema / JSON
  if (
    combined.includes('OutOfStock') ||
    combined.includes('schema.org/OutOfStock') ||
    combined.includes('out_of_stock') ||
    lower.includes('outofstock')
  ) {
    return false;
  }

  // Arabic out of stock / coming soon indicators
  if (
    combined.includes('متوفر قريباً') ||
    combined.includes('متوفر قريبا') ||
    combined.includes('قريباً') ||
    combined.includes('قريبا') ||
    combined.includes('غير متوفر') ||
    combined.includes('نفدت الكمية') ||
    combined.includes('نفذت الكمية') ||
    combined.includes('غير متوفر حالياً') ||
    combined.includes('غير متوفر حاليا')
  ) {
    return false;
  }

  // French & English out of stock / coming soon indicators
  if (
    lower.includes('bientôt disponible') ||
    lower.includes('bientot disponible') ||
    lower.includes('rupture de stock') ||
    lower.includes('rupture') ||
    lower.includes('épuisé') ||
    lower.includes('epuise') ||
    lower.includes('non disponible') ||
    lower.includes('out of stock') ||
    lower.includes('coming soon')
  ) {
    return false;
  }

  // Explicit flags if present
  if (
    extraData.inStock === false ||
    extraData.isAvailable === false ||
    extraData.isOutOfStock === true ||
    extraData.isOffStock === true ||
    extraData.isComingSoon === true ||
    extraData.backInStockAvailability?.showBackInStockNotification === true
  ) {
    return false;
  }

  return true;
}


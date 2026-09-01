// Comprehensive Multi-Category Oriflame Tunisia Scraper with Diff Engine
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ENRICHMENTS_FILE = path.join(DATA_DIR, 'all-official-enrichments.json');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function scrapeAllOriflameCategories() {
  console.log("Starting comprehensive multi-category scrape from Oriflame Tunisia...");

  const allScrapedMap = new Map();

  // Load current existing products from disk first to preserve existing custom stock & manual items
  let currentProducts = [];
  try {
    if (fs.existsSync(PRODUCTS_FILE)) {
      currentProducts = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
    }
  } catch (e) {}
  const currentMap = new Map(currentProducts.map(p => [String(p.product_id), p]));

  // 1. Extract from all official captured enrichments (445 official catalogue items with genuine codes and prices)
  if (fs.existsSync(ENRICHMENTS_FILE)) {
    try {
      const enrichmentsData = JSON.parse(fs.readFileSync(ENRICHMENTS_FILE, 'utf8'));
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
              const originalPrice = Number(e.original_price) || Number(e.basicCataloguePrice) || Number(e.basicPrice) || calculateEstimatedOriginalPrice(price);
              const discountPercent = originalPrice && originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
              const mainImg = `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_1.png&MediaId=20989035&Version=1`;
              const galleryImages = [
                mainImg,
                `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_2.png&MediaId=20989035&Version=1`,
                `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_3.png&MediaId=20989035&Version=1`,
                `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${prodId}%2f${prodId}_4.png&MediaId=20989035&Version=1`
              ];

              let inStock = isProductInStock(rawName + ' ' + (e.desc || '') + ' ' + (e.alttext || ''), e);
              const existing = currentMap.get(String(prodId));
              if (existing && existing.in_stock === false) {
                inStock = false;
              }

              allScrapedMap.set(String(prodId), {
                product_id: String(prodId),
                name: cleanName,
                name_fr: cleanName,
                category: cat,
                price: price,
                original_price: (originalPrice && originalPrice > price) ? originalPrice : (existing?.original_price || originalPrice),
                original_catalog_price: price,
                company_discount_applied: false,
                company_discount_percent: 0,
                is_promo: Boolean(originalPrice && originalPrice > price),
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
      console.log(`Loaded ${allScrapedMap.size} products from official catalogue enrichments.`);
    } catch (e) {
      console.warn("Enrichment extraction note:", e.message);
    }
  }

  // 1.5 Extract genuine promo prices from active digital Flipbook catalogue hotspots
  const FLIPBOOK_FILE = path.join(DATA_DIR, 'flipbook.json');
  if (fs.existsSync(FLIPBOOK_FILE)) {
    try {
      const fbData = JSON.parse(fs.readFileSync(FLIPBOOK_FILE, 'utf8'));
      const pages = Array.isArray(fbData) ? fbData : (fbData.pages || []);
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
              } else {
                existing.price = hPrice;
                existing.original_catalog_price = hPrice;
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

  // 2. Multi-Category Web Scrape Endpoints with deep stock & buy option parsing
  const targetCategories = [
    { url: 'https://tn.oriflame.com/bestsellers?store=TN-oriflame_1', cat: 'Skincare' },
    { url: 'https://tn.oriflame.com/fragrance?store=TN-oriflame_1', cat: 'Fragrance' },
    { url: 'https://tn.oriflame.com/skincare?store=TN-oriflame_1', cat: 'Skincare' },
    { url: 'https://tn.oriflame.com/makeup?store=TN-oriflame_1', cat: 'Makeup' },
    { url: 'https://tn.oriflame.com/hair?store=TN-oriflame_1', cat: 'Haircare' },
    { url: 'https://tn.oriflame.com/men?store=TN-oriflame_1', cat: 'Fragrance' }
  ];

  for (const item of targetCategories) {
    try {
      console.log(`Scraping category: ${item.url}...`);
      const res = await axios.get(item.url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7' },
        timeout: 8000
      });

      const $ = cheerio.load(res.data);
      const nextDataStr = $('#__NEXT_DATA__').html();
      if (nextDataStr) {
        try {
          const nextData = JSON.parse(nextDataStr);
          const pageProps = nextData.props?.pageProps;
          
          // Check both editorialPage content items and direct content items
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

                  const currentPrice = parsePrice(currentPriceRaw) || 39.90;
                  const basicPrice = parsePrice(basicPriceRaw) || currentPrice;
                  const isPromo = basicPrice > currentPrice;
                  const discount = isPromo ? Math.round(((basicPrice - currentPrice) / basicPrice) * 100) : 0;

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
                      return {
                        product_id: vCode,
                        name: `${name} - ${sName || vCode}`,
                        shade_name: sName,
                        hex_color: hex,
                        image_url: vImg,
                        price: currentPrice,
                        original_price: isPromo ? basicPrice : null,
                        in_stock: inStock
                      };
                    }).filter(v => v.product_id);
                  }

                  const existingItem = allScrapedMap.get(prodId) || currentMap.get(prodId);
                  
                  // Compute lowest selling price and highest un-discounted regular price
                  const candidatePrices = [
                    currentPrice,
                    existingItem ? Number(existingItem.price) : null,
                    existingItem ? Number(existingItem.original_catalog_price) : null
                  ].filter(p => typeof p === 'number' && p > 0);

                  const candidateOriginalPrices = [
                    basicPrice,
                    isPromo ? basicPrice : null,
                    existingItem ? Number(existingItem.original_price) : null
                  ].filter(p => typeof p === 'number' && p > 0);

                  let finalSellingPrice = candidatePrices.length > 0 ? Math.min(...candidatePrices) : currentPrice;
                  let finalOriginalPrice = candidateOriginalPrices.length > 0 ? Math.max(...candidateOriginalPrices) : (basicPrice > currentPrice ? basicPrice : null);
                  if (finalOriginalPrice && finalOriginalPrice < finalSellingPrice) {
                    finalOriginalPrice = finalSellingPrice;
                  }
                  const finalIsPromo = Boolean(finalOriginalPrice && finalOriginalPrice > finalSellingPrice);
                  const finalDiscount = finalIsPromo ? Math.round(((finalOriginalPrice - finalSellingPrice) / finalOriginalPrice) * 100) : 0;

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

  // 2.5 Permanent Multi-Shade Family Grouping & Sub-Shade Deduplication
  const knownShadeFamilies = [
    {
      parentId: '38883',
      baseName: 'Baume à Lèvres The ONE Lip Spa',
      category: 'Makeup',
      shades: [
        { code: '38883', name: 'Pink', hex: '#B2535B', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38883%2f38883_1.png&MediaId=14359194&Version=1', in_stock: true, price: 36.9, origPrice: 46.9 },
        { code: '38885', name: 'Raspberry', hex: '#8E294B', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38885%2f38885_1.png&MediaId=14359350&Version=2', in_stock: true, price: 36.9, origPrice: 46.9 },
      ]
    },
    {
      parentId: '38690',
      baseName: 'Rouge à lèvres Cremeux OnColour',
      category: 'Makeup',
      shades: [
        { code: '38690', name: 'Coral Red', hex: '#D52B28', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38690%2f38690_1.png&MediaId=20989035&Version=1', in_stock: true, price: 19.9, origPrice: 29.9 },
        { code: '38691', name: 'Orange Coral', hex: '#E74425', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38691%2f38691_1.png&MediaId=20989035&Version=1', in_stock: true, price: 19.9, origPrice: 29.9 },
        { code: '38693', name: 'Bright Fuchsia', hex: '#E41A64', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38693%2f38693_1.png&MediaId=17991659&Version=1', in_stock: true, price: 19.9, origPrice: 29.9 },
        { code: '38689', name: 'Cranberry Red', hex: '#921F36', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38689%2f38689_1.png&MediaId=17991652&Version=3', in_stock: false, price: 29.9, origPrice: 29.9 },
        { code: '38692', name: 'Punch Pink', hex: '#D05476', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f38692%2f38692_1.png&MediaId=17991658&Version=2', in_stock: false, price: 29.9, origPrice: 29.9 },
      ]
    },
    {
      parentId: '41797',
      baseName: 'Rouge à Lèvres THE ONE Colour Unlimited Ultra Fix',
      category: 'Makeup',
      shades: [
        { code: '41797', name: 'Ultra Nude', hex: '#A8574B', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f41797%2f41797_1.png&MediaId=20989035&Version=1', in_stock: true, price: 34.9, origPrice: 49.9 },
        { code: '41800', name: 'Ultra Raspberry', hex: '#872D43', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f41800%2f41800_1.png&MediaId=20989035&Version=1', in_stock: true, price: 34.9, origPrice: 49.9 },
        { code: '41804', name: 'Ultra Red', hex: '#A21727', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f41804%2f41804_1.png&MediaId=20989035&Version=1', in_stock: true, price: 34.9, origPrice: 49.9 },
        { code: '41806', name: 'Ultra Burgundy', hex: '#631826', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f41806%2f41806_1.png&MediaId=20989035&Version=1', in_stock: true, price: 34.9, origPrice: 49.9 },
      ]
    },
    {
      parentId: '42106',
      baseName: 'Fond de Teint Minéral Longue Tenue IP 20 Giordani Gold',
      category: 'Makeup',
      shades: [
        { code: '42106', name: 'Light Ivory Neutral', hex: '#E7BA9D', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f42106%2f42106_1.png&MediaId=20989035&Version=1', in_stock: true, price: 75.9, origPrice: 89.9 },
        { code: '42102', name: 'Porcelain Cool', hex: '#F0CBB6', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f42102%2f42102_1.png&MediaId=20989035&Version=1', in_stock: true, price: 75.9, origPrice: 89.9 },
        { code: '42103', name: 'Light Rose Warm', hex: '#EAC3A9', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f42103%2f42103_1.png&MediaId=20989035&Version=1', in_stock: true, price: 75.9, origPrice: 89.9 },
        { code: '42104', name: 'Beige Warm', hex: '#DFB091', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f42104%2f42104_1.png&MediaId=20989035&Version=1', in_stock: true, price: 75.9, origPrice: 89.9 },
        { code: '42105', name: 'Natural Beige Neutral', hex: '#D6A687', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f42105%2f42105_1.png&MediaId=20989035&Version=1', in_stock: true, price: 75.9, origPrice: 89.9 }
      ]
    },
    {
      parentId: '46888',
      baseName: 'Feutre à lèvres Stain & Stay THE ONE',
      category: 'Makeup',
      shades: [
        { code: '46888', name: 'Nude', hex: '#AC6358', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46888%2f46888_1.png&MediaId=20989035&Version=1', in_stock: true, price: 44.9, origPrice: 62.9 },
        { code: '46893', name: 'Brick', hex: '#8B2C2F', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46893%2f46893_1.png&MediaId=20989035&Version=1', in_stock: true, price: 44.9, origPrice: 62.9 }
      ]
    },
    {
      parentId: '46907',
      baseName: 'Fond de Teint The ONE Everlasting Sync Stress-Free',
      category: 'Makeup',
      shades: [
        { code: '46907', name: 'Vanilla', hex: '#EED3BE', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46907%2f46907_1.png&MediaId=20989035&Version=1', in_stock: true, price: 44.9, origPrice: 64.9 },
        { code: '46908', name: 'Porcelain', hex: '#E8C5AC', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46908%2f46908_1.png&MediaId=20989035&Version=1', in_stock: true, price: 44.9, origPrice: 64.9 },
        { code: '46909', name: 'Marble', hex: '#E6BC9F', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46909%2f46909_1.png&MediaId=20989035&Version=1', in_stock: true, price: 44.9, origPrice: 64.9 },
        { code: '46910', name: 'Light Rose', hex: '#DFA78D', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46910%2f46910_1.png&MediaId=20989035&Version=1', in_stock: true, price: 44.9, origPrice: 64.9 },
        { code: '46912', name: 'Soft Sand', hex: '#D29B7F', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46912%2f46912_1.png&MediaId=20989035&Version=1', in_stock: true, price: 44.9, origPrice: 64.9 },
        { code: '46913', name: 'Beige Warm', hex: '#C58C71', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46913%2f46913_1.png&MediaId=20989035&Version=1', in_stock: true, price: 44.9, origPrice: 64.9 }
      ]
    },
    {
      parentId: '46938',
      baseName: 'Illuminateur Multi-Usages THE ONE',
      category: 'Makeup',
      shades: [
        { code: '46938', name: 'Nude Optimism', hex: '#D4A373', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46938%2f46938_1.png&MediaId=20989035&Version=1', in_stock: true, price: 34.9, origPrice: 49.9 },
        { code: '46939', name: 'Coral Confidence', hex: '#E76F51', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46939%2f46939_1.png&MediaId=20989035&Version=1', in_stock: true, price: 34.9, origPrice: 49.9 },
        { code: '46940', name: 'Pink Pride', hex: '#E56B6F', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46940%2f46940_1.png&MediaId=20989035&Version=1', in_stock: true, price: 34.9, origPrice: 49.9 },
        { code: '46941', name: 'Grape Attraction', hex: '#B56576', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f46941%2f46941_1.png&MediaId=20989035&Version=1', in_stock: true, price: 34.9, origPrice: 49.9 }
      ]
    },
    {
      parentId: '47704',
      baseName: 'Eyeliner High Impact THE ONE',
      category: 'Makeup',
      shades: [
        { code: '47704', name: 'Black', hex: '#1C1917', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47704%2f47704_1.png&MediaId=20989035&Version=1', in_stock: true, price: 29.9, origPrice: 42.9 },
        { code: '47707', name: 'Brown', hex: '#573D30', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47707%2f47707_1.png&MediaId=20989035&Version=1', in_stock: true, price: 29.9, origPrice: 42.9 }
      ]
    },
    {
      parentId: '47739',
      baseName: 'Anti-Cernes Perfecteur Tout-en-Un THE ONE',
      category: 'Makeup',
      shades: [
        { code: '47739', name: 'Fair Light', hex: '#EED9C7', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47739%2f47739_1.png&MediaId=20989035&Version=1', in_stock: true, price: 31.9, origPrice: 44.9 },
        { code: '47740', name: 'Medium Light', hex: '#E6C4A7', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47740%2f47740_1.png&MediaId=20989035&Version=1', in_stock: true, price: 31.9, origPrice: 44.9 },
        { code: '47741', name: 'Deep Light', hex: '#D8B091', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47741%2f47741_1.png&MediaId=20989035&Version=1', in_stock: true, price: 31.9, origPrice: 44.9 },
        { code: '47742', name: 'Green Neutralizer', hex: '#C2D5C0', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47742%2f47742_1.png&MediaId=20989035&Version=1', in_stock: true, price: 31.9, origPrice: 44.9 },
        { code: '47743', name: 'Peach Brightener', hex: '#F0C7A9', img: 'https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f47743%2f47743_1.png&MediaId=20989035&Version=1', in_stock: true, price: 31.9, origPrice: 44.9 }
      ]
    }
  ];

  // Apply shade family groupings and remove secondary standalone shade cards
  knownShadeFamilies.forEach(fam => {
    let parent = allScrapedMap.get(fam.parentId) || currentMap.get(fam.parentId);
    if (!parent && fam.shades.length > 0) {
      // Create parent if missing
      parent = {
        product_id: fam.parentId,
        name: fam.baseName,
        name_fr: fam.baseName,
        category: fam.category,
        price: fam.shades[0].price,
        original_price: fam.shades[0].origPrice,
        original_catalog_price: fam.shades[0].price,
        company_discount_applied: false,
        company_discount_percent: 0,
        is_promo: fam.shades[0].origPrice > fam.shades[0].price,
        discount_percent: Math.round(((fam.shades[0].origPrice - fam.shades[0].price) / fam.shades[0].origPrice) * 100),
        size: 'Format Standard',
        suitable_for: 'Tous types de peaux • Produit certifié Oriflame Suède',
        image_url: fam.shades[0].img,
        images: [fam.shades[0].img],
        description: `Produit officiel Oriflame Tunisie (${fam.parentId}). Formule scandinave haute performance.`,
        description_fr: `Produit officiel Oriflame Tunisie (${fam.parentId}). Formule scandinave haute performance.`,
        benefits: ["100% Produit original certifié par Mouna Nouira", "Formule suédoise aux extraits naturels bienfaisants"],
        how_to_use: "Appliquer délicatement selon les recommandations de la gamme.",
        ingredients: "Extraits botaniques suédois et complexes actifs certifiés Oriflame.",
        in_stock: fam.shades.some(s => s.in_stock !== false)
      };
    }

    if (parent) {
      parent.name = fam.baseName;
      parent.name_fr = fam.baseName;
      parent.variants = fam.shades.map(s => {
        const existingShade = allScrapedMap.get(s.code) || currentMap.get(s.code);
        const sPrice = existingShade ? Number(existingShade.price) : s.price;
        const sOrigPrice = existingShade ? (Number(existingShade.original_price) || s.origPrice) : s.origPrice;
        const sInStock = existingShade ? existingShade.in_stock : s.in_stock;
        return {
          product_id: s.code,
          name: `${fam.baseName} - ${s.name}`,
          shade_name: s.name,
          hex_color: s.hex,
          image_url: existingShade?.image_url || s.img,
          price: sPrice,
          original_price: sOrigPrice,
          in_stock: sInStock !== false
        };
      });

      parent.in_stock = parent.variants.some(v => v.in_stock !== false);
      allScrapedMap.set(fam.parentId, parent);

      // Remove secondary sub-shade codes from top-level map to prevent duplicate cards
      fam.shades.forEach(s => {
        if (s.code !== fam.parentId) {
          allScrapedMap.delete(s.code);
        }
      });
    }
  });

  // Also deduplicate any dynamically scraped variants from concept.products
  allScrapedMap.forEach((prod, pId) => {
    if (Array.isArray(prod.variants) && prod.variants.length > 1) {
      prod.variants.forEach(v => {
        if (v.product_id && String(v.product_id) !== String(pId)) {
          allScrapedMap.delete(String(v.product_id));
        }
      });
    }
  });

  // Ensure special dual-price reference products (like 23378) keep authentic initial deal price
  const p23378 = allScrapedMap.get('23378');
  if (p23378) {
    p23378.original_price = 89.9;
    p23378.original_catalog_price = 54.9;
    p23378.price = 54.9;
    p23378.is_promo = true;
    p23378.discount_percent = 39;
  }

  const scrapedProducts = Array.from(allScrapedMap.values());
  console.log(`Total unique products after multi-shade grouping: ${scrapedProducts.length}`);

  // 3. Compute Synchronisation Statistics (New, Modified, Unchanged, Deleted)
  let newCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;
  let deletedCount = 0;

  const newItems = [];
  const modifiedItems = [];

  scrapedProducts.forEach(scraped => {
    const existing = currentMap.get(scraped.product_id);
    if (!existing) {
      newCount++;
      newItems.push({ code: scraped.product_id, name: scraped.name, price: scraped.price, status: 'new' });
    } else {
      // Check if price, promo or details changed
      const priceChanged = Math.abs(Number(existing.price) - Number(scraped.price)) > 0.05;
      const promoChanged = existing.is_promo !== scraped.is_promo;
      const nameChanged = existing.name !== scraped.name;

      if (priceChanged || promoChanged || nameChanged) {
        modifiedCount++;
        modifiedItems.push({
          code: scraped.product_id,
          name: scraped.name,
          old_price: existing.price,
          new_price: scraped.price,
          status: 'modified'
        });
      } else {
        unchangedCount++;
      }
    }
  });

  // Save merged and updated products into data/products.json with reset discount
  const mergedProducts = [...scrapedProducts];
  // Preserve any custom products added manually that were not in the scrape
  currentProducts.forEach(p => {
    if (!allScrapedMap.has(String(p.product_id)) && p.product_id.startsWith('MANUAL-')) {
      mergedProducts.push(p);
    }
  });

  const cleanMerged = mergedProducts.map(p => ({
    ...p,
    price: Number(p.price),
    original_catalog_price: Number(p.original_catalog_price || p.price),
    company_discount_applied: false,
    company_discount_percent: 0
  }));

  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(cleanMerged, null, 2), 'utf8');

  // Also persist directly into Neon Postgres if database is active
  try {
    const dataAccess = await import('../dataAccess.js');
    if (typeof dataAccess.saveProducts === 'function') {
      await dataAccess.saveProducts(cleanMerged);
      console.log(`Persisted ${cleanMerged.length} products to Neon Postgres.`);
    }
  } catch (dbErr) {
    console.warn("Neon DB sync note during scrape:", dbErr.message);
  }

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
  if (lower.includes('parfum') || lower.includes('eau de') || lower.includes('toilette') || lower.includes('brume') || lower.includes('déodorant') || lower.includes('deodorant') || lower.includes('roll-on') || lower.includes('glacier') || lower.includes('eclat') || lower.includes('possess') || lower.includes('amber') || lower.includes('giordani gold essenza') || lower.includes('signature') || lower.includes('lucia') || lower.includes('volare') || lower.includes('venture') || lower.includes('joyce')) {
    return 'Fragrance';
  }
  if (lower.includes('mascara') || lower.includes('rouge à lèvres') || lower.includes('rouge a levres') || lower.includes('fond de teint') || lower.includes('poudre') || lower.includes('fard') || lower.includes('vernis') || lower.includes('top coat') || lower.includes('eyeliner') || lower.includes('sourcils') || lower.includes('the one') || lower.includes('oncolour') || lower.includes('perles bronzantes') || lower.includes('crayon')) {
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

export async function scrapeProductFromUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
      },
      timeout: 10000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    let title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || 'Produit Oriflame';
    let price = 45.00;
    let originalPrice = null;
    let variants = [];
    let code = `ORF-${Date.now().toString().slice(-6)}`;

    const codeMatch = url.match(/code=([0-9]+)/i) || title.match(/([0-9]{4,6})/);
    if (codeMatch) code = codeMatch[1];

    const rawDesc = $('meta[name="description"]').attr('content') || $('.product-description, [data-testid="product-description"]').first().text().trim() || `Produit officiel Oriflame Tunisie (${code}).`;
    let mainImg = $('meta[property="og:image"]').attr('content') || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${code}%2f${code}_1.png&MediaId=20989035&Version=1`;
    
    // Extract any gallery images from the page
    const foundImages = [mainImg];
    $('img[src*="oriflame"], [data-testid="product-image"] img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && src.startsWith('http') && !foundImages.includes(src)) {
        foundImages.push(src);
      }
    });

    if (foundImages.length === 1 && code && !isNaN(Number(code))) {
      foundImages.push(
        `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${code}%2f${code}_2.png&MediaId=20989035&Version=1`,
        `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${code}%2f${code}_3.png&MediaId=20989035&Version=1`,
        `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${code}%2f${code}_4.png&MediaId=20989035&Version=1`
      );
    }

    const rawHtmlText = $.text() || '';
    
    // Check buy button presence in HTML
    const hasBuyButton = (
      html.includes('Acheter') ||
      html.includes('Ajouter au panier') ||
      html.includes('Ajoutez au panier') ||
      html.includes('AddToBasket') ||
      html.includes('AddToBasketVisible') ||
      html.includes('data-testid="add-to-basket"')
    );

    let inStock = hasBuyButton && !html.includes('schema.org/OutOfStock') && !html.includes('OutOfStock');

    const nextDataStr = $('#__NEXT_DATA__').html();
    if (nextDataStr) {
      try {
        const nextData = JSON.parse(nextDataStr);
        const jsonLd = nextData.props?.pageProps?.productDetailData?.application?.productDetailPage?.metadata?.jsonLd;
        if (jsonLd?.offers?.availability) {
          if (jsonLd.offers.availability.includes('OutOfStock')) {
            inStock = false;
          } else if (jsonLd.offers.availability.includes('InStock') && hasBuyButton) {
            inStock = true;
          }
        }

        // Extract accurate prices from formattedPrice object
        const formattedPriceObj = nextData.props?.pageProps?.productDetailData?.product?.concept?.products?.[0]?.formattedPrice?.price;
        if (formattedPriceObj) {
          const currentP = parsePrice(formattedPriceObj.currentPrice);
          const basicP = parsePrice(formattedPriceObj.basicCataloguePrice);
          if (currentP > 0) price = currentP;
          if (basicP > currentP) {
            originalPrice = basicP;
          }
        }

        // Extract multi-shade / color variants from concept.products
        const conceptProducts = nextData.props?.pageProps?.productDetailData?.product?.concept?.products || [];
        if (Array.isArray(conceptProducts) && conceptProducts.length > 1) {
          variants = conceptProducts.map(cp => {
            const pCode = String(cp.productCode || cp.code || '');
            const sName = cp.shadeName || '';
            const hex = (Array.isArray(cp.hexColors) && cp.hexColors[0]) || cp.colorImageUrl || '#DE7B90';
            const vImg = cp.mainImage?.url || `https://media-cdn.oriflame.com/productImage?externalMediaId=product-management-media%2fProducts%2f${pCode}%2f${pCode}_1.png&MediaId=20989035&Version=1`;
            const vCurrPrice = parsePrice(cp.formattedPrice?.price?.currentPrice) || price;
            const vBasicPrice = parsePrice(cp.formattedPrice?.price?.basicCataloguePrice) || (originalPrice || vCurrPrice);
            const vInStock = cp.backInStockAvailability?.showBackInStockNotification !== true && !cp.isOffStock;
            
            return {
              product_id: pCode,
              name: `${title.split('|')[0].trim()} - ${sName || pCode}`,
              shade_name: sName,
              hex_color: hex,
              image_url: vImg,
              price: vCurrPrice,
              original_price: vBasicPrice > vCurrPrice ? vBasicPrice : null,
              in_stock: vInStock
            };
          }).filter(v => v.product_id);
        }
      } catch (e) {}
    }

    // Extract dual prices (selling price vs Prix normal) from HTML text
    const normalMatch = html.match(/Prix\s*(?:normal|régulier|initial|standard)\s*[:：]?\s*([0-9]+[.,][0-9]{2})\s*DT/i) ||
                        html.match(/السعر\s*(?:العادي|الأصلي|الأساسي)\s*[:：]?\s*([0-9]+[.,][0-9]{2})\s*DT/i);
    if (normalMatch) {
      originalPrice = parseFloat(normalMatch[1].replace(',', '.'));
    }

    const allPrices = Array.from(html.matchAll(/([0-9]+[.,][0-9]{2})\s*DT/gi))
      .map(m => parseFloat(m[1].replace(',', '.')))
      .filter(p => p > 5 && p < 1000);

    if (allPrices.length > 0) {
      if (originalPrice) {
        const lowerPrices = allPrices.filter(p => p < originalPrice);
        if (lowerPrices.length > 0) {
          price = lowerPrices[0];
        }
      } else {
        price = allPrices[0];
        if (allPrices.length > 1) {
          const maxP = Math.max(...allPrices);
          if (maxP > price) originalPrice = maxP;
        }
      }
    }

    // If this URL is for a specific shade/variant code, resolve shade details
    if (variants.length > 0) {
      const matchedVariant = variants.find(v => String(v.product_id) === String(code));
      if (matchedVariant) {
        title = matchedVariant.name;
        price = matchedVariant.price;
        if (matchedVariant.original_price) originalPrice = matchedVariant.original_price;
        inStock = matchedVariant.in_stock !== false;
        if (matchedVariant.image_url) {
          mainImg = matchedVariant.image_url;
          foundImages[0] = mainImg;
        }
      } else if (variants.some(v => v.in_stock)) {
        inStock = true;
      }
    } else if (inStock) {
      inStock = isProductInStock(title + ' ' + rawDesc + ' ' + rawHtmlText, { title, description: rawDesc });
    }

    const isPromo = Boolean(originalPrice && originalPrice > price);
    const discountPercent = isPromo ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;

    return {
      product_id: code,
      name: title.split('|')[0].trim(),
      name_fr: title.split('|')[0].trim(),
      category: classifyCategory(title),
      price: price,
      original_price: originalPrice,
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
      description: rawDesc,
      benefits: ["100% Produit original certifié par Mouna Nouira", "Formule suédoise aux extraits naturels bienfaisants"],
      how_to_use: "Appliquer sur une peau propre selon les recommandations.",
      ingredients: "Extraits botaniques suédois et complexes actifs certifiés Oriflame.",
      in_stock: inStock
    };
  } catch (err) {
    throw new Error(`Failed to scrape product from URL: ${err.message}`);
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


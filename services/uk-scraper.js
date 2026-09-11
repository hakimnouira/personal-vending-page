import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Strips HTML tags and decodes common HTML entities.
 */
function cleanHtmlText(html = '') {
  if (!html || typeof html !== 'string') return '';
  const $ = cheerio.load(html);
  // Get text while preserving spaces between block elements
  $('p, div, br, li').each((_, el) => {
    $(el).append(' ');
  });
  let text = $.text();
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Scrapes product description and how-to-use advice from uk.oriflame.com.
 *
 * @param {string|number} productCode - The Oriflame reference number (e.g. '47724')
 * @returns {Promise<{ found: boolean, code: string, name?: string, description?: string, howToUse?: string, error?: string }>}
 */
export async function scrapeUkProductDetails(productCode) {
  const code = String(productCode || '').trim();
  if (!code) {
    return { found: false, code: '', error: 'Code produit manquant' };
  }

  const url = `https://uk.oriflame.com/products/product?code=${encodeURIComponent(code)}`;
  console.log(`[UK Scraper] Requesting: ${url}...`);

  try {
    const response = await axios.get(url, {
      httpsAgent,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9'
      },
      timeout: 12000,
      validateStatus: (status) => status < 500 // Don't throw on 404
    });

    if (response.status === 404) {
      console.log(`[UK Scraper] Product [${code}] NOT FOUND on uk.oriflame.com (HTTP 404).`);
      return { found: false, code };
    }

    if (response.status !== 200) {
      console.warn(`[UK Scraper] Unexpected status ${response.status} for [${code}].`);
      return { found: false, code, error: `HTTP ${response.status}` };
    }

    const html = response.data;
    if (!html || typeof html !== 'string') {
      return { found: false, code, error: 'Empty HTML response' };
    }

    const $ = cheerio.load(html);
    let title = $('h1').first().text().trim();
    let rawDescription = '';
    let rawHowToUse = '';
    let foundProduct = false;

    // 1. Primary Extraction: High-fidelity JSON from Next.js payload (__NEXT_DATA__)
    const nextDataStr = $('#__NEXT_DATA__').html();
    if (nextDataStr) {
      try {
        const nextData = JSON.parse(nextDataStr);
        const pdp = nextData.props?.pageProps?.productDetailData;
        const product = pdp?.product;
        const concept = product?.concept;

        if (product || concept) {
          foundProduct = true;
          if (concept?.name) title = concept.name;

          // Description from concept or product level
          if (concept?.description) rawDescription = concept.description;
          else if (concept?.productStory) rawDescription = concept.productStory;
          else if (concept?.brand?.description) rawDescription = concept.brand.description;

          // How to use from concept or product level
          if (concept?.howToUse) rawHowToUse = concept.howToUse;
          else if (product?.howToUse) rawHowToUse = product.howToUse;

          // Check application sections
          const sections = pdp?.application?.productDetailPage?.sections;
          if (!rawHowToUse && sections?.howToUse) {
            if (typeof sections.howToUse === 'string') rawHowToUse = sections.howToUse;
            else if (sections.howToUse?.text) rawHowToUse = sections.howToUse.text;
          }
          if (!rawDescription && sections?.description) {
            if (typeof sections.description === 'string') rawDescription = sections.description;
            else if (sections.description?.text) rawDescription = sections.description.text;
          }
        }
      } catch (jsonErr) {
        console.warn(`[UK Scraper] NextData parsing note for [${code}]:`, jsonErr.message);
      }
    }

    // 2. Secondary HTML Fallback Extraction if JSON was missing or incomplete
    if (!rawDescription) {
      // Check meta description
      const metaDesc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content');
      if (metaDesc && !metaDesc.includes('Oriflame') && metaDesc.length > 25) {
        rawDescription = metaDesc;
      }
    }

    if (!rawDescription) {
      // Check description container or paragraph elements
      const descHeading = $('h2, h3, h4').filter((_, el) => {
        const t = $(el).text().trim().toLowerCase();
        return t === 'description' || t.includes('about this product');
      }).first();

      if (descHeading.length > 0) {
        const pElem = descHeading.next('p, div').first();
        if (pElem.length > 0) rawDescription = pElem.html();
      }
    }

    if (!rawHowToUse) {
      // Look for "How to use" header
      const howHeading = $('h2, h3, h4').filter((_, el) => {
        const t = $(el).text().trim().toLowerCase();
        return t === 'how to use' || t.includes('how to use');
      }).first();

      if (howHeading.length > 0) {
        const pElem = howHeading.next('p, div').first();
        if (pElem.length > 0) rawHowToUse = pElem.html();
      }
    }

    const cleanDescription = cleanHtmlText(rawDescription);
    const cleanHowToUse = cleanHtmlText(rawHowToUse);

    // If neither description nor how to use was found, and title is generic
    if (!cleanDescription && !cleanHowToUse && !foundProduct) {
      console.log(`[UK Scraper] Product [${code}] returned page but no concept details found.`);
      return { found: false, code };
    }

    console.log(`[UK Scraper] SUCCESS for [${code}] "${title || code}":`);
    console.log(`  - Description: ${cleanDescription ? cleanDescription.slice(0, 70) + '...' : '(none)'}`);
    console.log(`  - How to Use: ${cleanHowToUse ? cleanHowToUse.slice(0, 70) + '...' : '(none)'}`);

    return {
      found: true,
      code,
      name: title,
      description: cleanDescription,
      howToUse: cleanHowToUse
    };

  } catch (err) {
    console.warn(`[UK Scraper ERROR] Exception fetching [${code}]:`, err.message);
    return { found: false, code, error: err.message };
  }
}

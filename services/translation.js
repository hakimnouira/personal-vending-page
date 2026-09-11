import axios from 'axios';
import https from 'https';
import crypto from 'crypto';
import { getCachedTranslation, saveCachedTranslation, getTranslationCacheStats } from '../dataAccess.js';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Monitoring counters for live telemetry
const translationMetrics = {
  cacheHits: 0,
  apiCalls: 0,
  errors: 0
};

/**
 * Computes SHA-256 hash for a given text and language pair.
 * Format: SHA256(text + ':' + sourceLang + ':' + targetLang)
 */
export function computeTranslationHash(text = '', sourceLang = 'en', targetLang = 'fr') {
  const payload = `${String(text).trim()}:${sourceLang}:${targetLang}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Translates a text string from English to French using Google Translate with PostgreSQL caching.
 *
 * @param {string} text - The source text to translate
 * @param {object} metadata - Optional metadata { reference, champ, sourceLang, targetLang }
 * @returns {Promise<string>} The translated French text (or original English if failed)
 */
export async function translateText(text, metadata = {}) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return '';

  const reference = String(metadata.reference || '').trim();
  const champ = String(metadata.champ || 'description').trim();
  const sourceLang = metadata.sourceLang || 'en';
  const targetLang = metadata.targetLang || 'fr';

  // 1. Calculate SHA-256 Hash
  const hashKey = computeTranslationHash(cleanText, sourceLang, targetLang);

  // 2. Check translation_cache in PostgreSQL
  try {
    const cached = await getCachedTranslation(hashKey);
    if (cached) {
      translationMetrics.cacheHits++;
      console.log(`[Translation] CACHE HIT for [${reference || 'N/A'}] (${champ}) [hash: ${hashKey.slice(0, 10)}...]`);
      return cached;
    }
  } catch (cacheErr) {
    console.warn('[Translation] Cache lookup notice:', cacheErr.message);
  }

  // 3. Cache miss: Call Google Translate API
  console.log(`[Translation] CACHE MISS for [${reference || 'N/A'}] (${champ}). Requesting Google Translate...`);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(cleanText)}`;
    
    const response = await axios.get(url, {
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 12000
    });

    translationMetrics.apiCalls++;

    let translatedText = '';
    if (Array.isArray(response.data) && Array.isArray(response.data[0])) {
      translatedText = response.data[0].map(segment => segment[0] || '').join('').trim();
    }

    if (!translatedText) {
      throw new Error('Empty response payload from Google Translate');
    }

    // 4. Save to PostgreSQL translation_cache
    try {
      await saveCachedTranslation({
        hashKey,
        reference,
        champ,
        sourceLang,
        targetLang,
        originalText: cleanText,
        translatedText
      });
      console.log(`[Translation] Successfully saved translation in cache for [${reference}] (${champ}).`);
    } catch (saveErr) {
      console.warn('[Translation] Failed to persist translation in DB:', saveErr.message);
    }

    return translatedText;

  } catch (err) {
    translationMetrics.errors++;
    console.error(`[Translation ERROR] Failed translating [${reference}] (${champ}): ${err.message}. Retaining original English text.`);
    // Fallback requirement: return original English text if translation fails
    return cleanText;
  }
}

/**
 * Returns current translation monitoring metrics.
 */
export async function getTranslationMetrics() {
  const dbStats = await getTranslationCacheStats();
  return {
    ...translationMetrics,
    totalCachedInDB: dbStats.totalCached,
    cacheHitRatio: (translationMetrics.cacheHits + translationMetrics.apiCalls) > 0
      ? ((translationMetrics.cacheHits / (translationMetrics.cacheHits + translationMetrics.apiCalls)) * 100).toFixed(1) + '%'
      : '0.0%'
  };
}

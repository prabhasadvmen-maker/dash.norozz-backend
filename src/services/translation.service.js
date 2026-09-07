import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export const SUPPORTED_LANGUAGES = {
  'en-IN': 'English',
  'hi-IN': 'Hindi',
  'bn-IN': 'Bengali',
  'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi',
  'od-IN': 'Odia',
  'pa-IN': 'Punjabi',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
};

export class TranslationService {
  constructor() {
    this.apiUrl = 'https://api.sarvam.ai/translate';
    // Server-side in-memory translation cache to optimize speed & prevent duplicate calls
    this.cache = new Map();
  }

  /**
   * Helper to normalize language code string to valid language tag (e.g. 'hi' -> 'hi-IN')
   */
  normalizeLangCode(langCode, defaultFallback = 'en-IN') {
    if (!langCode) return defaultFallback;
    const clean = String(langCode).trim();
    if (SUPPORTED_LANGUAGES[clean]) return clean;

    const lower = clean.toLowerCase();

    const nameMatch = Object.entries(SUPPORTED_LANGUAGES).find(
      ([code, name]) => name.toLowerCase() === lower || code.toLowerCase() === lower
    );
    if (nameMatch) return nameMatch[0];

    const shortCode = lower.split(/[-_]/)[0];
    const shortMatch = Object.keys(SUPPORTED_LANGUAGES).find(
      (code) => code.split('-')[0].toLowerCase() === shortCode
    );

    return shortMatch || defaultFallback;
  }

  /**
   * Fallback Translation Engine using Google Translate Free Endpoint
   */
  async translateWithGoogle({ text, sourceLangCode, targetLangCode }) {
    try {
      const srcShort = (sourceLangCode || 'en').split(/[-_]/)[0].toLowerCase();
      const tgtShort = (targetLangCode || 'hi').split(/[-_]/)[0].toLowerCase();

      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcShort}&tl=${tgtShort}&dt=t&q=${encodeURIComponent(text)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) return null;
      const data = await response.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translatedSegments = data[0].map((item) => (item && item[0] ? item[0] : '')).join('');
        if (translatedSegments && translatedSegments.trim()) {
          return translatedSegments;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Translate single text string using Sarvam AI with automatic Google Translate fallback
   */
  async translateText({ text, sourceLanguage = 'en-IN', targetLanguage = 'hi-IN' }) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Text parameter is required and cannot be empty.');
    }

    const sourceLangCode = this.normalizeLangCode(sourceLanguage, 'en-IN');
    const targetLangCode = this.normalizeLangCode(targetLanguage, 'hi-IN');
    const cleanText = text.trim();

    // If source and target languages are identical, return text directly
    if (sourceLangCode === targetLangCode) {
      return {
        translatedText: cleanText,
        sourceLanguage: sourceLangCode,
        targetLanguage: targetLangCode,
      };
    }

    // Check cache
    const cacheKey = `${sourceLangCode}_${targetLangCode}_${cleanText}`;
    if (this.cache.has(cacheKey)) {
      return {
        translatedText: this.cache.get(cacheKey),
        sourceLanguage: sourceLangCode,
        targetLanguage: targetLangCode,
        cached: true,
      };
    }

    const apiKey = process.env.SARVAM_API_KEY;

    // 1. Try Sarvam AI API if API key is present
    if (apiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': apiKey,
          },
          body: JSON.stringify({
            input: cleanText,
            source_language_code: sourceLangCode,
            target_language_code: targetLangCode,
            speaker_gender: 'Female',
            mode: 'formal',
            model: 'mayura:v1',
            enable_preprocessing: true,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const translatedText = data.translated_text || data.translatedText;
          if (translatedText && translatedText.trim()) {
            this.cache.set(cacheKey, translatedText);
            return {
              translatedText,
              sourceLanguage: sourceLangCode,
              targetLanguage: targetLangCode,
              engine: 'Sarvam AI',
            };
          }
        } else {
          const errBody = await response.json().catch(() => ({}));
          console.warn(`⚠️ Sarvam AI API returned ${response.status}:`, errBody?.error?.message || 'Quota limit reached');
        }
      } catch (err) {
        console.warn(`⚠️ Sarvam AI API call failed (${err.message}), falling back to Google Translate engine...`);
      }
    }

    // 2. Fallback Engine: Google Translate API (Zero cost, fast, unlimited fallback)
    const googleResult = await this.translateWithGoogle({
      text: cleanText,
      sourceLangCode,
      targetLangCode,
    });

    if (googleResult) {
      this.cache.set(cacheKey, googleResult);
      return {
        translatedText: googleResult,
        sourceLanguage: sourceLangCode,
        targetLanguage: targetLangCode,
        engine: 'Google Translate Fallback',
      };
    }

    // 3. Ultimate fallback: return original text
    return {
      translatedText: cleanText,
      sourceLanguage: sourceLangCode,
      targetLanguage: targetLangCode,
      engine: 'Original Text Fallback',
    };
  }

  /**
   * Translate array of UI texts in batch
   */
  async translateBatch({ texts = [], sourceLanguage = 'en-IN', targetLanguage = 'hi-IN' }) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return { translations: {} };
    }

    const uniqueTexts = [...new Set(texts.map((t) => String(t || '').trim()).filter((t) => t.length > 0))];
    const resultMap = {};

    // Process in optimal parallel chunks of 10 for high speed performance
    const batchSize = 10;
    for (let i = 0; i < uniqueTexts.length; i += batchSize) {
      const chunk = uniqueTexts.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (str) => {
          try {
            const res = await this.translateText({ text: str, sourceLanguage, targetLanguage });
            resultMap[str] = res.translatedText;
          } catch (e) {
            console.warn(`⚠️ Batch item translation fallback for "${str}":`, e.message);
            resultMap[str] = str; // Fallback to original
          }
        })
      );
      if (i + batchSize < uniqueTexts.length) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }

    return {
      success: true,
      translations: resultMap,
      sourceLanguage: this.normalizeLangCode(sourceLanguage),
      targetLanguage: this.normalizeLangCode(targetLanguage),
    };
  }
}

export const translationService = new TranslationService();

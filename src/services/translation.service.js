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
    // Server-side in-memory translation cache to optimize speed & API calls
    this.cache = new Map();
  }

  /**
   * Helper to normalize language code string to valid Sarvam language tag (e.g. 'hi' -> 'hi-IN')
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
   * Translate single text string using Sarvam AI Translation API
   */
  async translateText({ text, sourceLanguage = 'en-IN', targetLanguage = 'hi-IN' }) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Text parameter is required and cannot be empty.');
    }

    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      console.error('❌ SARVAM_API_KEY is not configured in server environment');
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Translation service configuration missing'
      );
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

    // Attempt translation with auto-retry on timeout
    let attempts = 0;
    const maxAttempts = 2;
    let lastError = null;

    while (attempts < maxAttempts) {
      attempts++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout per item

      try {
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

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('❌ Sarvam AI Translation API HTTP Error:', response.status, errorData);
          const errorMsg = errorData.message || errorData.error || `HTTP ${response.status} from Sarvam API`;
          throw new ApiError(
            response.status >= 400 && response.status < 500 ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.BAD_GATEWAY,
            `Translation Error: ${errorMsg}`
          );
        }

        const data = await response.json();
        const translatedText = data.translated_text || data.translatedText || cleanText;

        // Store in cache
        this.cache.set(cacheKey, translatedText);

        return {
          translatedText,
          sourceLanguage: data.source_language_code || sourceLangCode,
          targetLanguage: targetLangCode,
          requestId: data.request_id || null,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;

        if (error.name === 'AbortError') {
          console.warn(`⏳ Sarvam AI Translation timeout on attempt ${attempts} for "${cleanText.slice(0, 20)}..."`);
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 300)); // short pause before retry
            continue;
          }
          throw new ApiError(
            HTTP_STATUS.GATEWAY_TIMEOUT,
            'Translation service request timed out. Please try again.'
          );
        }

        if (error instanceof ApiError) {
          throw error;
        }

        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }

        console.error('❌ Sarvam AI Translation Network Error:', error.message);
        throw new ApiError(
          HTTP_STATUS.SERVICE_UNAVAILABLE,
          `Translation service network error: ${error.message}`
        );
      }
    }

    throw lastError || new ApiError(HTTP_STATUS.SERVICE_UNAVAILABLE, 'Translation failed after retries');
  }

  /**
   * Translate array of UI texts in batch
   * @param {Object} params
   * @param {string[]} params.texts Array of strings to translate
   * @param {string} [params.sourceLanguage='en-IN']
   * @param {string} [params.targetLanguage='hi-IN']
   */
  async translateBatch({ texts = [], sourceLanguage = 'en-IN', targetLanguage = 'hi-IN' }) {
    if (!Array.isArray(texts) || texts.length === 0) {
      return { translations: {} };
    }

    const uniqueTexts = [...new Set(texts.map((t) => String(t || '').trim()).filter((t) => t.length > 0))];
    const resultMap = {};

    // Process in optimal parallel chunks of 5 with 30ms delay to prevent Sarvam API rate spikes
    const batchSize = 5;
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
        await new Promise((resolve) => setTimeout(resolve, 30));
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

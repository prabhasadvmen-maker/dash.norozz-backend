import { translationService, SUPPORTED_LANGUAGES } from '../services/translation.service.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class TranslationController {
  /**
   * POST /api/translation/translate
   * Body: { text, sourceLanguage, targetLanguage }
   */
  async translateText(req, res, next) {
    try {
      const {
        text,
        input,
        sourceLanguage,
        source_language_code,
        targetLanguage,
        target_language_code,
      } = req.body || {};

      const contentToTranslate = text || input;
      const srcLang = sourceLanguage || source_language_code || 'en-IN';
      const tgtLang = targetLanguage || target_language_code || 'hi-IN';

      if (!contentToTranslate || typeof contentToTranslate !== 'string' || !contentToTranslate.trim()) {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          'Validation Error: "text" (or "input") field is required and must be a non-empty string.'
        );
      }

      const result = await translationService.translateText({
        text: contentToTranslate,
        sourceLanguage: srcLang,
        targetLanguage: tgtLang,
      });

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        translatedText: result.translatedText,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/translation/translate-batch
   * Body: { texts: ["Dashboard", "Today Earnings"], sourceLanguage, targetLanguage }
   */
  async translateBatch(req, res, next) {
    try {
      const {
        texts,
        sourceLanguage,
        source_language_code,
        targetLanguage,
        target_language_code,
      } = req.body || {};

      const srcLang = sourceLanguage || source_language_code || 'en-IN';
      const tgtLang = targetLanguage || target_language_code || 'hi-IN';

      if (!Array.isArray(texts)) {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          'Validation Error: "texts" field must be an array of strings.'
        );
      }

      const result = await translationService.translateBatch({
        texts,
        sourceLanguage: srcLang,
        targetLanguage: tgtLang,
      });

      return res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/translation/languages
   * Returns list of supported Indian languages
   */
  async getSupportedLanguages(req, res, next) {
    try {
      const list = Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
        code,
        name,
      }));

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        languages: list,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const translationController = new TranslationController();

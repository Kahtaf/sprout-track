import language0 from '@/src/localization/translations/de.json';
import language1 from '@/src/localization/translations/en.json';
import language2 from '@/src/localization/translations/es.json';
import language3 from '@/src/localization/translations/fr.json';
import language4 from '@/src/localization/translations/hi.json';
import language5 from '@/src/localization/translations/it.json';
import language6 from '@/src/localization/translations/nb.json';
import language7 from '@/src/localization/translations/nl.json';
import language8 from '@/src/localization/translations/pl.json';
import language9 from '@/src/localization/translations/pt-br.json';
import language10 from '@/src/localization/translations/pt-pt.json';
import language11 from '@/src/localization/translations/ro.json';

type TranslationMap = Record<string, string>;
const translations: Record<string, TranslationMap> = {
  'de': language0,
  'en': language1,
  'es': language2,
  'fr': language3,
  'hi': language4,
  'it': language5,
  'nb': language6,
  'nl': language7,
  'pl': language8,
  'pt-br': language9,
  'pt-pt': language10,
  'ro': language11,
};

export function loadTranslations(lang: string): TranslationMap {
  return translations[lang] || translations.en;
}

/**
 * Translate a key with optional replacements
 * @param key - Translation key
 * @param lang - Language code (e.g., 'en', 'es', 'fr')
 * @param replacements - Optional key-value pairs for variable replacement
 * @returns Translated string with replacements applied
 */
export function t(
  key: string,
  lang: string,
  replacements?: Record<string, string | number>
): string {
  const translations = loadTranslations(lang);
  let text = translations[key] || key;

  if (replacements) {
    Object.entries(replacements).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }

  return text;
}

/**
 * Format elapsed time in a localized way
 * @param minutes - Total elapsed minutes
 * @param lang - Language code
 * @returns Formatted time string (e.g., "2 hours 30 minutes")
 */
export function formatTimeElapsed(minutes: number, lang: string): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);

  const parts: string[] = [];

  if (hours > 0) {
    const hourKey =
      hours === 1
        ? 'notification.time.hour'
        : 'notification.time.hours';
    parts.push(t(hourKey, lang, { count: hours }));
  }

  if (mins > 0 || hours === 0) {
    const minuteKey =
      mins === 1
        ? 'notification.time.minute'
        : 'notification.time.minutes';
    parts.push(t(minuteKey, lang, { count: mins }));
  }

  return parts.join(' ');
}

/** Bundled translation maps are immutable; kept for API compatibility. */
export function clearTranslationCache(): void {}
export const DEFAULT_LANGUAGE = 'en';

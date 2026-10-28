/** Merkt die Sprachwahl im Umschalter, damit der Proxy nicht mehr nach dem Browser umleitet. */
export const LOCALE_COOKIE = "og-locale";

export function rememberLocale(locale: string) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Erster Besuch mit englischem Browser landet auf /en. Wer im Umschalter eine
 * Sprache gewählt hat, wird nie mehr umgeleitet; ohne Accept-Language
 * (Crawler) bleibt es Deutsch.
 */
export function prefersEnglish(acceptLanguage: string | null, chosen: boolean) {
  if (chosen) return false;
  const first = acceptLanguage
    ?.split(",")[0]
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  return !!first && first !== "*" && !first.startsWith("de");
}

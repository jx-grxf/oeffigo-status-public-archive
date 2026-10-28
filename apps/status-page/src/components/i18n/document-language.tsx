"use client";

import { useEffect } from "react";

// The root layout sits above the locale segment and can only render one `lang`.
export function DocumentLanguage({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

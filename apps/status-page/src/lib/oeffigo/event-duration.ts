/** „Dauer 3 Std. 14 Min.“ für Ereignisliste und Startseite; ohne Ende „läuft noch“. */
export function durationLabel(locale: string, from: Date, to: Date | null) {
  if (!to) return locale === "de" ? "läuft noch" : "ongoing";
  const minutes = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 60_000),
  );
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts =
    locale === "de"
      ? [
          days && `${days} Tg.`,
          hours && `${hours} Std.`,
          !days && rest && `${rest} Min.`,
        ]
      : [
          days && `${days} d`,
          hours && `${hours} h`,
          !days && rest && `${rest} min`,
        ];
  return `${locale === "de" ? "Dauer" : "Duration"} ${parts.filter(Boolean).join(" ")}`;
}

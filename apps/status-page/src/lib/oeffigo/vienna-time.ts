// Every ÖffiGo reader is in Austria, and report texts name local times
// ("ab 10:00 Uhr"). Showing the same window as "08:00 (UTC)" next to that text
// reads as a contradiction, so event timestamps render in Vienna time.
const TIME_ZONE = "Europe/Vienna";
const tag = (locale?: string) => (locale === "en" ? "en-GB" : "de-AT");

function parts(date: Date) {
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    values.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

const sameDay = (a: Date, b: Date) => parts(a).day === parts(b).day;
const isStartOfDay = (d: Date) =>
  parts(d).time === "00:00:00" && d.getMilliseconds() === 0;
const isEndOfDay = (d: Date) =>
  parts(d).time === "23:59:59" && d.getMilliseconds() === 999;

export function zoneLabel(date: Date, locale?: string) {
  const name = new Intl.DateTimeFormat(tag(locale), {
    timeZone: TIME_ZONE,
    timeZoneName: "short",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  return name ?? TIME_ZONE;
}

export const withZone = (value: string, date: Date, locale?: string) =>
  `${value} (${zoneLabel(date, locale)})`;

export function formatDate(
  date: Date,
  options?: Pick<Intl.DateTimeFormatOptions, "month"> & { locale?: string },
) {
  return date.toLocaleDateString(tag(options?.locale), {
    year: "numeric",
    month: options?.month ?? "long",
    day: "numeric",
    timeZone: TIME_ZONE,
  });
}

export function formatDateTime(date: Date, locale?: string) {
  return date.toLocaleDateString(tag(locale), {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    timeZone: TIME_ZONE,
  });
}

export function formatTime(date: Date, locale?: string) {
  return date.toLocaleTimeString(tag(locale), {
    hour: "numeric",
    minute: "numeric",
    timeZone: TIME_ZONE,
  });
}

export function formatDateRangeParts(from: Date, to: Date, locale?: string) {
  if (isStartOfDay(from) && isEndOfDay(to))
    return {
      from: formatDate(from, { locale }),
      to: formatDate(to, { locale }),
    };
  if (sameDay(from, to))
    return {
      from: formatDateTime(from, locale),
      to: withZone(formatTime(to, locale), to, locale),
    };
  return {
    from: formatDateTime(from, locale),
    to: withZone(formatDateTime(to, locale), to, locale),
  };
}

export function formatDateRange(from?: Date, to?: Date, locale?: string) {
  const de = locale !== "en";
  if (from && to) {
    if (from.getTime() === to.getTime())
      return withZone(formatDateTime(from, locale), from, locale);
    if (isStartOfDay(from) && isEndOfDay(to))
      return sameDay(from, to)
        ? formatDate(from, { locale })
        : `${formatDate(from, { locale })} – ${formatDate(to, { locale })}`;
    if (sameDay(from, to))
      return withZone(
        `${formatDateTime(from, locale)} – ${formatTime(to, locale)}`,
        to,
        locale,
      );
    return withZone(
      `${formatDateTime(from, locale)} – ${formatDateTime(to, locale)}`,
      to,
      locale,
    );
  }
  if (to)
    return withZone(
      `${de ? "Bis" : "Until"} ${formatDateTime(to, locale)}`,
      to,
      locale,
    );
  if (from)
    return withZone(
      `${de ? "Seit" : "Since"} ${formatDateTime(from, locale)}`,
      from,
      locale,
    );
  return de ? "Gesamter Zeitraum" : "All time";
}

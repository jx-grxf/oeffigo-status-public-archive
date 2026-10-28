"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@openstatus/ui/components/ui/chart";
import { Skeleton } from "@openstatus/ui/components/ui/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import type { Range } from "../../../../../lib/oeffigo/availability";
import type { Outside, Target } from "../../../../../lib/oeffigo/outside";

type Locale = "de" | "en";

const copy = {
  de: {
    title: "Antwortzeiten von außen",
    hint: (regions: string) =>
      `Gemessen alle fünf Minuten aus ${regions}. Linie: Median, gestrichelt: die langsamsten 5 %.`,
    and: "und",
    checks: (ok: number, total: number) =>
      ok === total
        ? `Gerade sind alle ${total} Prüfungen von außen erfolgreich.`
        : `Gerade sind ${ok} von ${total} Prüfungen von außen erfolgreich.`,
    since: (date: string) => `Messungen von außen gibt es seit ${date}.`,
    retention: "Von außen reichen die Werte höchstens 14 Tage zurück.",
    unavailable: "Die Messung von außen ist gerade nicht erreichbar.",
    target: { api: "Schnittstelle der App", website: "Website" },
    median: "Median",
    slow: "langsamste 5 %",
    regions: { Frankfurt: "Frankfurt", Zurich: "Zürich" } as Record<
      string,
      string
    >,
  },
  en: {
    title: "Response times from outside",
    hint: (regions: string) =>
      `Measured every five minutes from ${regions}. Line: median, dashed: the slowest 5 %.`,
    and: "and",
    checks: (ok: number, total: number) =>
      ok === total
        ? `All ${total} outside checks are currently passing.`
        : `${ok} of ${total} outside checks are currently passing.`,
    since: (date: string) => `Outside measurements started on ${date}.`,
    retention: "Outside measurements go back at most 14 days.",
    unavailable: "Outside measurements are unavailable right now.",
    target: { api: "App API", website: "Website" },
    median: "Median",
    slow: "slowest 5 %",
    regions: { Frankfurt: "Frankfurt", Zurich: "Zurich" } as Record<
      string,
      string
    >,
  },
} as const;

function joinList(locale: Locale, items: string[]) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${copy[locale].and} ${items.at(-1)}`;
}

function tickLabel(locale: Locale, range: Range, t: number) {
  const options: Intl.DateTimeFormatOptions =
    range === "24h"
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "numeric" };
  return new Date(t).toLocaleString(locale === "de" ? "de-AT" : "en-GB", {
    timeZone: "Europe/Vienna",
    ...options,
  });
}

export function OutsideSection({
  locale,
  range,
}: {
  locale: Locale;
  range: Range;
}) {
  const text = copy[locale];
  const { data, isError } = useQuery<Outside>({
    queryKey: ["oeffigo-outside", range],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await fetch(`/api/oeffigo/outside?range=${range}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("outside_unavailable");
      return response.json();
    },
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
  const regions = joinList(
    locale,
    (data?.checks?.regions ?? ["Frankfurt", "Zurich"]).map(
      (r) => text.regions[r] ?? r,
    ),
  );
  const unavailable = isError || data?.available === false;
  const config = {
    p50: { label: text.median, color: "var(--foreground)" },
    p95: { label: text.slow, color: "var(--muted-foreground)" },
  } satisfies ChartConfig;
  const from = data?.from ? new Date(data.from) : null;
  const fromLabel = from?.toLocaleDateString(
    locale === "de" ? "de-AT" : "en-GB",
    {
      timeZone: "Europe/Vienna",
      day: "numeric",
      month: "long",
    },
  );
  const spanStart =
    Date.now() -
    (range === "24h"
      ? 86_400_000
      : range === "7d"
        ? 7 * 86_400_000
        : 14 * 86_400_000);

  return (
    <section
      aria-labelledby="outside-title"
      className="bg-card rounded-xl border"
    >
      <div className="border-b px-5 py-4 sm:px-6">
        <h2 id="outside-title" className="text-lg font-semibold">
          {text.title}
        </h2>
        <p className="text-muted-foreground text-sm">{text.hint(regions)}</p>
      </div>
      {unavailable ? (
        <p className="text-muted-foreground px-5 py-6 text-sm sm:px-6">
          {text.unavailable}
        </p>
      ) : (
        <div className="grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
          {(["api", "website"] as Target[]).map((id) => (
            <figure key={id} className="px-5 py-4 sm:px-6">
              <figcaption className="mb-2 text-sm font-medium">
                {text.target[id]}
              </figcaption>
              {!data ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <ChartContainer config={config} className="h-40 w-full">
                  <LineChart
                    data={data.series[id]}
                    margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={32}
                      tickFormatter={(t: number) => tickLabel(locale, range, t)}
                      className="font-mono text-[10px]"
                    />
                    <YAxis
                      width={44}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${v} ms`}
                      className="font-mono text-[10px]"
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) =>
                            tickLabel(
                              locale,
                              "24h",
                              Number(payload?.[0]?.payload?.t),
                            ) +
                            (range === "24h"
                              ? ""
                              : `, ${tickLabel(locale, "7d", Number(payload?.[0]?.payload?.t))}`)
                          }
                          formatter={(value, name) => (
                            <span className="flex w-full justify-between gap-4">
                              <span>
                                {config[name as "p50" | "p95"]?.label}
                              </span>
                              <span className="font-mono tabular-nums">
                                {value} ms
                              </span>
                            </span>
                          )}
                        />
                      }
                    />
                    <Line
                      dataKey="p95"
                      stroke="var(--color-p95)"
                      strokeDasharray="3 3"
                      dot={false}
                      strokeWidth={1}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                    <Line
                      dataKey="p50"
                      stroke="var(--color-p50)"
                      dot={false}
                      strokeWidth={1.5}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </figure>
          ))}
        </div>
      )}
      <div className="text-muted-foreground border-t px-5 py-3 text-xs sm:px-6">
        {data?.checks
          ? `${text.checks(data.checks.ok, data.checks.total)} `
          : null}
        {from && from.getTime() > spanStart + 3_600_000 && fromLabel
          ? `${text.since(fromLabel)} `
          : null}
        {range === "30d" || range === "90d" ? text.retention : null}
      </div>
    </section>
  );
}

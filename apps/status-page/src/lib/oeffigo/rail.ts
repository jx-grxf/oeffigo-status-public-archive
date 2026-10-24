import type { ServiceState as NodeState } from "./model";

/**
 * Die Strecke: vier Haltestellen (die Hauptgruppen) an einer Bimlinie mit
 * Oberleitung. Die Bim fährt sie ab und hält an jeder; wo es hakt, steht ein
 * Signal, bei einem Ausfall sperrt eine Schranke das Gleis und die Bim wartet
 * davor. Reines SVG, Bewegung steckt in `rail.css`. Ohne Laufzeitimporte,
 * damit Statusseite und API-Startseite dieselbe Grafik bauen.
 */
const SHORT: Record<string, string> = {
  app: "App",
  api: "API",
  web: "Web",
  sources: "Quellen",
};

const STOPS = [124, 290, 456, 622];
const WIDTH = 700;
const HEIGHT = 78;
const WIRE_Y = 12;
const LINE_Y = 58;
const TRAM_HALF = 34;

type Segment = { from: number; to: number; state: NodeState };

function tone(state: NodeState): string {
  switch (state) {
    case "operational":
      return "var(--success)";
    case "degraded":
      return "var(--warning)";
    case "down":
      return "var(--destructive)";
    case "paused":
    case "unknown":
      return "var(--muted-foreground)";
  }
}

function segments(states: NodeState[]): Segment[] {
  const edges = [0, ...STOPS, WIDTH];
  return edges.slice(0, -1).map((from, i) => ({
    from,
    to: edges[i + 1],
    state: states[Math.min(i, states.length - 1)],
  }));
}

/** Fahrdraht mit Masten zwischen den Haltestellen. */
function wireSvg(): string {
  const masts = [0, ...STOPS, WIDTH]
    .slice(0, -1)
    .map((x, i, all) => (i === 0 ? null : (all[i - 1] + x) / 2))
    .filter((x): x is number => x !== null)
    .concat([(STOPS[3] + WIDTH) / 2 + 10]);
  const mast = (x: number) =>
    `<line x1="${x}" y1="${WIRE_Y - 6}" x2="${x}" y2="${LINE_Y + 6}" stroke="var(--muted-foreground)" stroke-width="1.6" opacity="0.5"/>` +
    `<line x1="${x}" y1="${WIRE_Y - 4}" x2="${x + 8}" y2="${WIRE_Y}" stroke="var(--muted-foreground)" stroke-width="1" opacity="0.5"/>`;
  return `<g class="og-rail-wire"><line x1="0" y1="${WIRE_Y}" x2="${WIDTH}" y2="${WIRE_Y}" stroke="var(--muted-foreground)" stroke-width="1" opacity="0.6"/>${masts.map(mast).join("")}</g>`;
}

/** Das Gleis als Linienband wie im Netzplan, je Abschnitt in der Farbe der Haltestelle davor. */
function segmentSvg({ from, to, state }: Segment): string {
  const color = tone(state);
  const band = (a: number, b: number, extra = "") =>
    `<line x1="${a}" y1="${LINE_Y}" x2="${b}" y2="${LINE_Y}" stroke="${color}" stroke-width="5" ${extra}/>`;
  if (state === "paused" || state === "unknown")
    return `<g class="og-rail-seg">${band(from, to, 'stroke-dasharray="6 6" opacity="0.6"')}</g>`;
  if (state === "operational")
    return `<g class="og-rail-seg og-rail-seg--quiet">${band(from, to)}</g>`;
  return `<g class="og-rail-seg">${band(from, to)}</g>`;
}

/** Bahnsteig, Netzplan-Punkt und das österreichische H-Schild hinter der Haltestelle. */
function stopSvg(x: number, state: NodeState): string {
  const color = tone(state);
  const hollow = state === "paused" || state === "unknown";
  const ring =
    state === "degraded" || state === "down"
      ? `<circle cx="${x}" cy="${LINE_Y}" r="12" fill="none" stroke="${color}" stroke-width="1.5" class="og-rail-halo"/>`
      : "";
  const sx = x + TRAM_HALF + 9;
  const sign =
    `<line x1="${sx}" y1="${LINE_Y + 6}" x2="${sx}" y2="${LINE_Y - 26}" stroke="var(--muted-foreground)" stroke-width="1.6"/>` +
    `<circle cx="${sx}" cy="${LINE_Y - 31}" r="6.5" fill="#f4d21f" stroke="#1d7a3c" stroke-width="1.8"/>` +
    `<path d="M${sx - 2.3} ${LINE_Y - 34.4}v6.8M${sx + 2.3} ${LINE_Y - 34.4}v6.8M${sx - 2.3} ${LINE_Y - 31}h4.6" stroke="#1d7a3c" stroke-width="1.6" stroke-linecap="round"/>`;
  return (
    `<g class="og-rail-stop og-rail-stop--${state}">` +
    `<rect x="${x - TRAM_HALF + 2}" y="${LINE_Y + 5}" width="${2 * TRAM_HALF - 4}" height="3" rx="1.5" fill="var(--muted-foreground)" opacity="0.35"/>` +
    sign +
    ring +
    `<circle cx="${x}" cy="${LINE_Y}" r="6.5" fill="${hollow ? "var(--background)" : "var(--foreground)"}" stroke="${color}" stroke-width="3" class="og-rail-dot"/>` +
    `</g>`
  );
}

/**
 * Eine Niederflurbim aus zwei Wagen mit Gelenk, Einholmstromabnehmer am Fahrdraht
 * und Zielanzeige. Das Stirnlicht trägt den Zustand, damit die Bim auch im
 * Standbild etwas sagt.
 */
function vehicleSvg(light: string): string {
  const top = LINE_Y - 22;
  const h = 17;
  const windows = [-30, -22, -14, 2, 10, 18]
    .map(
      (x) =>
        `<rect x="${x}" y="${top + 3}" width="6.5" height="6" rx="1.2" fill="var(--background)" opacity="0.85"/>`,
    )
    .join("");
  const doors = [-7.5, 25]
    .map(
      (x) =>
        `<rect x="${x}" y="${top + 3}" width="4.5" height="${h - 4}" rx="0.8" fill="var(--background)" opacity="0.45"/>`,
    )
    .join("");
  const bogies = [-24, -4, 4, 24]
    .map(
      (x) =>
        `<circle cx="${x}" cy="${LINE_Y - 4}" r="2.2" fill="var(--foreground)"/>`,
    )
    .join("");
  return (
    `<g class="og-rail-vehicle">` +
    // Einholmstromabnehmer: Knick nach hinten, Schleifleiste am Draht.
    `<path d="M6 ${top}L15 ${(top + WIRE_Y) / 2}L9 ${WIRE_Y + 1.5}" fill="none" stroke="var(--foreground)" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<line x1="4" y1="${WIRE_Y + 1.5}" x2="15" y2="${WIRE_Y + 1.5}" stroke="var(--foreground)" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M${-TRAM_HALF} ${top + 3}a3 3 0 0 1 3-3H-1.2v${h}H${-TRAM_HALF + 3}a3 3 0 0 1-3-3z" fill="var(--foreground)"/>` +
    `<path d="M1.2 ${top}H${TRAM_HALF - 6}c3.5 0 6 2.5 6 6v${h - 9}a3 3 0 0 1-3 3H1.2z" fill="var(--foreground)"/>` +
    `<rect x="-1.6" y="${top + 2}" width="3.2" height="${h - 4}" fill="var(--muted-foreground)"/>` +
    windows +
    doors +
    `<rect x="${-TRAM_HALF}" y="${top + h - 5}" width="${2 * TRAM_HALF}" height="1.6" fill="var(--primary)" opacity="0.9"/>` +
    // Zielanzeige vorne und das Stirnlicht in der Farbe des Zustands.
    `<rect x="${TRAM_HALF - 9}" y="${top + 2.5}" width="7" height="3.6" rx="0.8" fill="#f2a516"/>` +
    `<rect x="${TRAM_HALF - 3.2}" y="${top + h - 4.5}" width="2.6" height="2.4" rx="0.8" fill="${light}" class="og-rail-light"/>` +
    bogies +
    `</g>`
  );
}

/** Straßenbahnsignal vor der Haltestelle, an der es hakt: Balken quer heißt Halt. */
function signalSvg(x: number, state: NodeState): string {
  if (state !== "degraded" && state !== "down") return "";
  const lamp = tone(state);
  const bar =
    state === "down"
      ? `<rect x="1.8" y="7.3" width="6.4" height="1.6" rx="0.8" fill="${lamp}"/>`
      : `<circle cx="5" cy="8.1" r="1.6" fill="${lamp}"/>`;
  return (
    `<g class="og-rail-signal og-rail-signal--${state}" transform="translate(${x - 40} ${LINE_Y - 34})">` +
    `<line x1="5" y1="15" x2="5" y2="40" stroke="var(--muted-foreground)" stroke-width="1.6"/>` +
    `<rect x="0" y="0" width="10" height="16" rx="2.5" fill="var(--foreground)"/>` +
    `<rect x="1.2" y="1.2" width="7.6" height="13.6" rx="1.8" fill="var(--background)"/>` +
    `<g class="og-rail-lamp">${bar}</g>` +
    `</g>`
  );
}

/** Rot-weiße Schranke quer über dem Gleis vor einer ausgefallenen Haltestelle. */
function barrierSvg(x: number): string {
  const bx = x - 22;
  return (
    `<g class="og-rail-barrier" transform="translate(${bx} ${LINE_Y - 14})">` +
    `<line x1="1" y1="0" x2="1" y2="20" stroke="var(--muted-foreground)" stroke-width="1.6"/>` +
    `<line x1="11" y1="0" x2="11" y2="20" stroke="var(--muted-foreground)" stroke-width="1.6"/>` +
    `<rect x="-3" y="2" width="18" height="5" rx="1" fill="#e5262a"/>` +
    `<path d="M1 2h3l-4 5H-3zM8 2h3l-4 5H4zM15 2v1.5L12.3 7H11z" fill="#fff"/>` +
    `</g>`
  );
}

export type RailOptions = {
  compact?: boolean;
  stateLabels: Record<NodeState, string>;
};

/** Dekorativ (`aria-hidden`): der Zustand steht als Text daneben. */
export function railHtml(
  groups: readonly { id: string; state: NodeState }[],
  { compact = false, stateLabels }: RailOptions,
): string {
  const states = groups.map((g) => g.state);
  const worst: "down" | "slow" | "ok" = states.includes("down")
    ? "down"
    : states.some((s) => s === "degraded" || s === "unknown")
      ? "slow"
      : "ok";
  const firstDown = states.indexOf("down");
  const stand =
    firstDown >= 0 ? STOPS[firstDown] - 40 - TRAM_HALF - 4 : STOPS[0];
  const light = tone(
    worst === "down" ? "down" : worst === "slow" ? "degraded" : "operational",
  );
  const vars = [
    ...STOPS.map((x, i) => `--x${i}:${x}px`),
    `--rest:${stand}px`,
    `--stand:${stand}px`,
    `--dur:${worst === "slow" ? 30 : 18}s`,
    `--exit:${WIDTH + TRAM_HALF + 10}px`,
    `--enter:${-TRAM_HALF - 10}px`,
  ].join(";");
  const labels = groups
    .map(
      (g, i) =>
        `<span class="og-rail-label" style="--tone:${tone(g.state)};left:${((STOPS[i] / WIDTH) * 100).toFixed(2)}%"><b>${SHORT[g.id] ?? g.id}</b><i>${stateLabels[g.state]}</i></span>`,
    )
    .join("");
  const svg =
    `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" focusable="false" style="${vars}">` +
    wireSvg() +
    segments(states).map(segmentSvg).join("") +
    groups.map((g, i) => stopSvg(STOPS[i], g.state)).join("") +
    groups.map((g, i) => signalSvg(STOPS[i], g.state)).join("") +
    (firstDown >= 0 ? barrierSvg(STOPS[firstDown]) : "") +
    vehicleSvg(light) +
    `</svg>`;
  return `<div class="og-rail${compact ? " og-rail--compact" : ""}" data-pace="${worst}" aria-hidden="true">${svg}<div class="og-rail-labels">${labels}</div></div>`;
}

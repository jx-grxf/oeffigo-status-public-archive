import type { ServiceState as NodeState } from "./model";

/**
 * Die Strecke: vier Bahnhöfe (die Hauptgruppen) an einer elektrifizierten
 * Bahnlinie. Ein Railjet fährt sie ab und hält an jedem; wo es hakt, steht ein
 * Signal, bei einem Ausfall sperrt eine Schranke das Gleis und der Zug wartet
 * davor. Reines SVG, Bewegung steckt in `rail.css`. Ohne Laufzeitimporte,
 * damit Statusseite und Vorschau dieselbe Grafik bauen.
 */
const SHORT: Record<string, string> = {
  app: "App",
  api: "Schnittstelle",
  web: "Website",
  sources: "Datenquellen",
};

const STOPS = [124, 290, 456, 622];
const WIDTH = 700;
const HEIGHT = 44;
const WIRE_Y = 5;
const LINE_Y = 32;
const TRAIN_HALF = 46;

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

/** Fahrdraht als Haarlinie, damit der Stromabnehmer etwas zum Anlegen hat. */
function wireSvg(): string {
  return `<line x1="0" y1="${WIRE_Y}" x2="${WIDTH}" y2="${WIRE_Y}" stroke="var(--muted-foreground)" stroke-width="0.8" opacity="0.35"/>`;
}

/** Das Gleis als Linienband wie im Netzplan, je Abschnitt in der Farbe des Bahnhofs davor. */
function segmentSvg({ from, to, state }: Segment): string {
  const color = tone(state);
  const band = (a: number, b: number, extra = "") =>
    `<line x1="${a}" y1="${LINE_Y}" x2="${b}" y2="${LINE_Y}" stroke="${color}" stroke-width="3" ${extra}/>`;
  if (state === "paused" || state === "unknown")
    return `<g class="og-rail-seg">${band(from, to, 'stroke-dasharray="5 5" opacity="0.6"')}</g>`;
  if (state === "operational")
    return `<g class="og-rail-seg og-rail-seg--quiet">${band(from, to)}</g>`;
  return `<g class="og-rail-seg">${band(from, to)}</g>`;
}

/** Bahnsteigkante und Netzplan-Punkt des Bahnhofs. */
function stopSvg(x: number, state: NodeState): string {
  const color = tone(state);
  const hollow = state === "paused" || state === "unknown";
  const ring =
    state === "degraded" || state === "down"
      ? `<circle cx="${x}" cy="${LINE_Y}" r="9" fill="none" stroke="${color}" stroke-width="1.2" class="og-rail-halo"/>`
      : "";
  return (
    `<g class="og-rail-stop og-rail-stop--${state}">` +
    `<rect x="${x - TRAIN_HALF}" y="${LINE_Y + 4}" width="${2 * TRAIN_HALF}" height="2" rx="1" fill="var(--muted-foreground)" opacity="0.3"/>` +
    ring +
    `<circle cx="${x}" cy="${LINE_Y}" r="4.5" fill="${hollow ? "var(--background)" : "var(--foreground)"}" stroke="${color}" stroke-width="2.4" class="og-rail-dot"/>` +
    `</g>`
  );
}

/**
 * Railjet: Taurus-Lok vorne, zwei Wagen dahinter, durchgehendes Fensterband.
 * Das Spitzenlicht trägt den Zustand, damit der Zug auch im Standbild etwas sagt.
 */
function vehicleSvg(light: string): string {
  const top = LINE_Y - 13;
  const bottom = LINE_Y - 3;
  const coach = (from: number, to: number) =>
    `<rect x="${from}" y="${top}" width="${to - from}" height="${bottom - top}" rx="1.6" fill="var(--foreground)"/>` +
    `<rect x="${from + 2}" y="${top + 2.4}" width="${to - from - 4}" height="3" rx="0.8" fill="var(--background)" opacity="0.8"/>`;
  const loco =
    `<path d="M16.5 ${top}H35c4.5 0 8.2 3 9.6 7.2L46 ${bottom - 1}V${bottom}H16.5z" fill="var(--foreground)"/>` +
    `<path d="M36.5 ${top + 1.6}h2.6l3.4 3.8h-6z" fill="var(--background)" opacity="0.85"/>` +
    `<rect x="18.5" y="${top + 2.4}" width="12" height="3" rx="0.8" fill="var(--background)" opacity="0.8"/>`;
  const wheels = [-40, -22, -9, 9, 22, 40]
    .map(
      (x) =>
        `<circle cx="${x}" cy="${LINE_Y - 1.6}" r="1.5" fill="var(--foreground)"/>`,
    )
    .join("");
  return (
    `<g class="og-rail-vehicle">` +
    // Einholmstromabnehmer der Lok, Schleifleiste am Draht.
    `<path d="M22 ${top}L28 ${(top + WIRE_Y) / 2}L24 ${WIRE_Y + 1}" fill="none" stroke="var(--foreground)" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<line x1="20" y1="${WIRE_Y + 1}" x2="29" y2="${WIRE_Y + 1}" stroke="var(--foreground)" stroke-width="1.3" stroke-linecap="round"/>` +
    coach(-46, -16) +
    coach(-14.5, 15) +
    loco +
    `<rect x="44" y="${bottom - 3.2}" width="1.8" height="1.8" rx="0.6" fill="${light}" class="og-rail-light"/>` +
    wheels +
    `</g>`
  );
}

/** Lichtsignal vor dem Bahnhof, an dem es hakt: Balken quer heißt Halt. */
function signalSvg(x: number, state: NodeState): string {
  if (state !== "degraded" && state !== "down") return "";
  const lamp = tone(state);
  const bar =
    state === "down"
      ? `<rect x="1.6" y="5.6" width="4.8" height="1.4" rx="0.7" fill="${lamp}"/>`
      : `<circle cx="4" cy="6.3" r="1.4" fill="${lamp}"/>`;
  return (
    `<g class="og-rail-signal og-rail-signal--${state}" transform="translate(${x - TRAIN_HALF - 12} ${LINE_Y - 22})">` +
    `<line x1="4" y1="12" x2="4" y2="26" stroke="var(--muted-foreground)" stroke-width="1.2"/>` +
    `<rect x="0" y="0" width="8" height="12.5" rx="2" fill="var(--foreground)"/>` +
    `<rect x="1" y="1" width="6" height="10.5" rx="1.4" fill="var(--background)"/>` +
    `<g class="og-rail-lamp">${bar}</g>` +
    `</g>`
  );
}

/** Rot-weiße Schranke quer über dem Gleis vor einem ausgefallenen Bahnhof. */
function barrierSvg(x: number): string {
  const bx = x - TRAIN_HALF - 2;
  return (
    `<g class="og-rail-barrier" transform="translate(${bx} ${LINE_Y - 11})">` +
    `<line x1="1" y1="0" x2="1" y2="14" stroke="var(--muted-foreground)" stroke-width="1.2"/>` +
    `<line x1="9" y1="0" x2="9" y2="14" stroke="var(--muted-foreground)" stroke-width="1.2"/>` +
    `<rect x="-2" y="2" width="14" height="4" rx="0.8" fill="#e5262a"/>` +
    `<path d="M1 2h2.4l-3.2 4H-2zM6.6 2h2.4l-3.2 4H3.4zM12 2v1.2L9.8 6H9z" fill="#fff"/>` +
    `</g>`
  );
}

export type RailOptions = {
  compact?: boolean;
  stateLabels: Record<NodeState, string>;
};

/** Dekorativ (`aria-hidden`): der Zustand steht als Text daneben. */
export function railHtml(
  groups: readonly { id: string; state: NodeState; title?: string }[],
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
    firstDown >= 0 ? STOPS[firstDown] - TRAIN_HALF - 16 - TRAIN_HALF : STOPS[0];
  const light = tone(
    worst === "down" ? "down" : worst === "slow" ? "degraded" : "operational",
  );
  const vars = [
    ...STOPS.map((x, i) => `--x${i}:${x}px`),
    `--rest:${stand}px`,
    `--stand:${stand}px`,
    `--dur:${worst === "slow" ? 30 : 18}s`,
    `--exit:${WIDTH + TRAIN_HALF + 10}px`,
    `--enter:${-TRAIN_HALF - 10}px`,
  ].join(";");
  const labels = groups
    .map(
      (g, i) =>
        `<span class="og-rail-label" style="--tone:${tone(g.state)};left:${((STOPS[i] / WIDTH) * 100).toFixed(2)}%"><b>${g.title ?? SHORT[g.id] ?? g.id}</b><i>${stateLabels[g.state]}</i></span>`,
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

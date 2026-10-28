import type { Client } from "@libsql/client";
import { reportResolvedAt } from "@openstatus/ui/components/blocks/status.utils";

import {
  buildRange,
  type Causes,
  countCauses,
  countMinutes,
  type Impact,
  levels,
  type ManualInterval,
  manualIntervals,
  minuteCauses,
  minuteLevels,
  type MinuteCounts,
  type Range,
  type RangeHistory,
  SLOT_MS,
} from "./availability";
import { sourceSlotIds, sourceSlotId } from "./groups";
import { services, type Snapshot } from "./model";

const ids = [...services.map((s) => s.id), ...sourceSlotIds];

/** Datenquellen laufen als eigene Verlaufszeilen durch dieselbe Minutenrechnung. */
function withSources(sample: Snapshot): Snapshot {
  if (!sample.sources?.length) return sample;
  return {
    ...sample,
    services: [
      ...sample.services,
      ...sample.sources.map((s) => ({
        id: sourceSlotId(s.id),
        state: s.state,
      })),
    ],
  };
}
const CAUSE_TABLE =
  "CREATE TABLE IF NOT EXISTS oeffigo_slot_cause (slot_start INTEGER NOT NULL, service TEXT NOT NULL, causes TEXT NOT NULL, PRIMARY KEY (slot_start, service))";
let causeTable = false;
// Die Tabelle entsteht beim ersten Lauf selbst; ohne sie fehlen nur die Ursachen, nie der Verlauf.
async function ensureCauseTable(client: Client) {
  if (causeTable) return true;
  try {
    await client.execute(CAUSE_TABLE);
    causeTable = true;
  } catch {
    console.error("ÖffiGo cause table could not be created");
  }
  return causeTable;
}
const serviceOfComponent = new Map<number, string>(
  services.map((s) => [s.componentId, s.id]),
);
// Look past the slot edges so a confirmed outage can reach back into the previous slot.
const EDGE_MS = 6 * 60_000;
const DAY_MS = 86_400_000;

async function readManual(client: Client, now: number) {
  const rows = await client.execute(
    `SELECT u.status_report_id AS report, u.id, u.date, u.status,
            i.page_component_id AS component, i.impact
       FROM status_report_update AS u
       LEFT JOIN status_report_update_to_page_component AS i
         ON i.status_report_update_id = u.id`,
  );
  const reports = new Map<
    number,
    {
      updates: Map<
        number,
        {
          id: number;
          date: number;
          status: string;
          impacts: { componentId: number; impact: Impact }[];
        }
      >;
    }
  >();
  for (const row of rows.rows) {
    const reportId = Number(row.report);
    const date = Number(row.date) * 1000;
    const report = reports.get(reportId) ?? { updates: new Map() };
    reports.set(reportId, report);
    const id = Number(row.id);
    const update = report.updates.get(id) ?? {
      id,
      date,
      status: String(row.status),
      impacts: [],
    };
    report.updates.set(id, update);
    if (row.component !== null && row.impact !== null)
      update.impacts.push({
        componentId: Number(row.component),
        impact: String(row.impact) as Impact,
      });
  }
  return manualIntervals(
    [...reports.values()].map((r) => {
      const updates = [...r.updates.values()];
      const resolvedAt = reportResolvedAt(
        updates.map((u) => ({ status: u.status, date: new Date(u.date) })),
      );
      return { resolvedAt: resolvedAt?.getTime() ?? null, updates };
    }),
    now,
  );
}

/** Recomputes every 30-minute slot that starts in [from, to) from the raw checks. */
export async function rollupSlots(
  client: Client,
  from: number,
  to: number,
  now: number,
) {
  const oldest = await client.execute(
    "SELECT MIN(checked_at) AS at FROM oeffigo_check",
  );
  const oldestAt = Date.parse(String(oldest.rows[0]?.at ?? ""));
  if (!Number.isFinite(oldestAt)) return 0;
  // A slot whose raw minutes were already deleted keeps its stored counts.
  const first =
    Math.max(Math.floor(from / SLOT_MS), Math.ceil(oldestAt / SLOT_MS)) *
    SLOT_MS;
  if (first >= Math.min(to, now)) return 0;
  const raw = await client.execute({
    sql: "SELECT payload FROM oeffigo_check WHERE checked_at >= ? AND checked_at < ? ORDER BY checked_at",
    args: [
      new Date(first - EDGE_MS).toISOString(),
      new Date(Math.min(to, now) + EDGE_MS).toISOString(),
    ],
  });
  const samples: Snapshot[] = [];
  for (const row of raw.rows) {
    try {
      samples.push(withSources(JSON.parse(String(row.payload))));
    } catch {
      // A broken row is a gap, not a reason to drop the whole range.
    }
  }
  const minutes = minuteLevels(samples, ids);
  const causes = minuteCauses(samples, ids);
  const manual = await readManual(client, now);
  const manualBy = new Map<string, ManualInterval[]>();
  for (const interval of manual) {
    const id = serviceOfComponent.get(interval.componentId);
    if (id) manualBy.set(id, [...(manualBy.get(id) ?? []), interval]);
  }
  const withCauses = await ensureCauseTable(client);
  const statements = [];
  if (withCauses)
    statements.push({
      sql: "DELETE FROM oeffigo_slot_cause WHERE slot_start >= ? AND slot_start < ?",
      args: [first, Math.min(to, now)],
    });
  for (let start = first; start < Math.min(to, now); start += SLOT_MS) {
    const end = Math.min(start + SLOT_MS, now);
    for (const id of ids) {
      const why = withCauses ? countCauses(causes.get(id), start, end) : null;
      if (why)
        statements.push({
          sql: "INSERT INTO oeffigo_slot_cause (slot_start, service, causes) VALUES (?, ?, ?)",
          args: [start, id, JSON.stringify(why)],
        });
      const c = countMinutes(
        minutes.get(id),
        manualBy.get(id) ?? [],
        start,
        end,
      );
      statements.push({
        sql: `INSERT INTO oeffigo_slot (slot_start, service, operational, degraded, partial, down, paused, unknown)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (slot_start, service) DO UPDATE SET
                operational = excluded.operational, degraded = excluded.degraded,
                partial = excluded.partial, down = excluded.down,
                paused = excluded.paused, unknown = excluded.unknown`,
        args: [
          start,
          id,
          c.operational,
          c.degraded,
          c.partial,
          c.down,
          c.paused,
          c.unknown,
        ],
      });
    }
  }
  if (statements.length) await client.batch(statements, "write");
  return Math.max(0, Math.ceil((Math.min(to, now) - first) / SLOT_MS));
}

let backfilled = false;
let manualStamp: string | null = null;

/**
 * Runs after every collector tick: the current and previous slot always, the
 * last week when a report changed (impacts can be backdated), and once per
 * process everything since the newest stored slot.
 */
export async function refreshSlots(client: Client, now: number) {
  const current = Math.floor(now / SLOT_MS) * SLOT_MS;
  if (!backfilled) {
    const [newest, sourced] = await Promise.all([
      client.execute("SELECT MAX(slot_start) AS at FROM oeffigo_slot"),
      client.execute(
        "SELECT 1 FROM oeffigo_slot WHERE service LIKE 'source:%' LIMIT 1",
      ),
    ]);
    const stored = Number(newest.rows[0]?.at ?? NaN);
    // Ohne Quellenzeilen einmal alle Rohprüfungen nachrechnen, damit ihr Verlauf nicht erst heute beginnt.
    const from =
      sourced.rows.length && Number.isFinite(stored) && stored > 0
        ? stored - 2 * SLOT_MS
        : 0;
    for (
      let start = Math.max(from, now - 32 * DAY_MS);
      start < now;
      start += DAY_MS
    )
      await rollupSlots(client, start, start + DAY_MS, now);
    backfilled = true;
  }
  const stamp = await client.execute(
    "SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM status_report_update",
  );
  const next = `${stamp.rows[0]?.n}:${stamp.rows[0]?.at}`;
  const reportsChanged = manualStamp !== null && manualStamp !== next;
  manualStamp = next;
  await rollupSlots(
    client,
    reportsChanged ? now - 7 * DAY_MS : current - SLOT_MS,
    now + SLOT_MS,
    now,
  );
}

const rangeDays: Record<Range, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 31,
  "90d": 91,
};

async function readCauses(client: Client, since: number) {
  const by = new Map<string, Causes>();
  try {
    const rows = await client.execute({
      sql: "SELECT slot_start, service, causes FROM oeffigo_slot_cause WHERE slot_start >= ?",
      args: [since],
    });
    for (const row of rows.rows) {
      try {
        by.set(
          `${row.service}:${row.slot_start}`,
          JSON.parse(String(row.causes)) as Causes,
        );
      } catch {
        // Eine kaputte Zeile heißt: keine Ursache für diesen Abschnitt.
      }
    }
  } catch {
    // Die Tabelle gibt es erst nach dem ersten Lauf des neuen Collectors.
  }
  return by;
}

export async function readRange(
  client: Client,
  range: Range,
  now: number,
): Promise<RangeHistory> {
  const since = now - rangeDays[range] * DAY_MS - DAY_MS;
  const [rows, causes] = await Promise.all([
    client.execute({
      sql: `SELECT slot_start, service, ${levels.join(", ")} FROM oeffigo_slot WHERE slot_start >= ?`,
      args: [since],
    }),
    readCauses(client, since),
  ]);
  return buildRange(
    range,
    rows.rows.map((row) => ({
      start: Number(row.slot_start),
      service: String(row.service),
      counts: Object.fromEntries(
        levels.map((l) => [l, Number(row[l] ?? 0)]),
      ) as MinuteCounts,
      causes: causes.get(`${row.service}:${row.slot_start}`),
    })),
    now,
    ids,
  );
}

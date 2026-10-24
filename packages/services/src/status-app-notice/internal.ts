import { sql } from "@openstatus/db";

import type { DB } from "../context";
import {
  type AustrianRegion,
  type StatusAppNoticeKind,
  austrianRegions,
} from "./schemas";

export type StoredAppNotice = {
  kind: StatusAppNoticeKind;
  refId: number;
  showInApp: boolean;
  regions: AustrianRegion[];
};

type Row = {
  kind: StatusAppNoticeKind;
  ref_id: number;
  show_in_app: number;
  regions: string;
};

/** A stored list that no longer parses counts as all of Austria, never as an error. */
export function parseRegions(raw: string): AustrianRegion[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return austrianRegions.filter((region) => value.includes(region));
  } catch {
    return [];
  }
}

export function appNoticeKey(kind: StatusAppNoticeKind, refId: number) {
  return `${kind}:${refId}`;
}

export async function readAppNotices(
  db: DB,
  refs: { kind: StatusAppNoticeKind; ids: number[] }[],
): Promise<Map<string, StoredAppNotice>> {
  const result = new Map<string, StoredAppNotice>();
  for (const { kind, ids } of refs) {
    if (ids.length === 0) continue;
    const rows = await db.all<Row>(
      sql`SELECT kind, ref_id, show_in_app, regions FROM oeffigo_app_notice WHERE kind = ${kind} AND ref_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
    for (const row of rows) {
      result.set(appNoticeKey(row.kind, row.ref_id), {
        kind: row.kind,
        refId: row.ref_id,
        showInApp: row.show_in_app === 1,
        regions: parseRegions(row.regions),
      });
    }
  }
  return result;
}

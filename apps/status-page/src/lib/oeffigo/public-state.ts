import type { RouterOutputs } from "@openstatus/api";

import { readStatus } from "./collector";
import {
  mergeManualStatus,
  nativeStatus,
  worst,
  type ManualTracker,
  type MergedStatus,
} from "./model";

type Page = NonNullable<RouterOutputs["statusPage"]["get"]>;

export async function readCombinedStatus(
  trackers: readonly ManualTracker[],
): Promise<MergedStatus> {
  try {
    const { snapshot } = await readStatus();
    return mergeManualStatus(snapshot, trackers);
  } catch {
    // Incident information remains useful even when the measurement store is unavailable.
    return mergeManualStatus(undefined, trackers);
  }
}

export function withCombinedStatus(page: Page, merged: MergedStatus): Page {
  const states = new Map<number, ReturnType<typeof nativeStatus>>(
    merged.services.map((s) => [s.componentId, nativeStatus(s.state)]),
  );
  const trackers: Page["trackers"] = page.trackers.map((tracker) => {
    if (tracker.type === "component") {
      return {
        ...tracker,
        component: {
          ...tracker.component,
          status: states.get(tracker.component.id) ?? "degraded",
        },
      };
    }
    const components = tracker.components.map((component) => ({
      ...component,
      status: states.get(component.id) ?? "degraded",
    }));
    const groupStates = tracker.components.map(
      (c) =>
        merged.services.find((s) => s.componentId === c.id)?.state ?? "unknown",
    );
    return {
      ...tracker,
      components,
      status: nativeStatus(worst(groupStates)),
    };
  });
  return { ...page, trackers, status: nativeStatus(merged.overall) };
}

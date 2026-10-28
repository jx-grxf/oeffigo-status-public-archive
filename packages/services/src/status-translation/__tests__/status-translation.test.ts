import { sql } from "@openstatus/db";
import {
  maintenance,
  page,
  statusReport,
  statusReportUpdate,
} from "@openstatus/db/src/schema";
import { expect } from "@std/expect";
import { beforeAll, describe, test } from "@std/testing/bdd";

import {
  createWorkspaceFixture,
  expectAuditRow,
  makeApiKeyCtx,
  makeUserCtx,
  withTestTransaction,
} from "../../../test/helpers";
import type { DB, ServiceContext } from "../../context";
import { ForbiddenError, NotFoundError } from "../../errors";
import {
  STATUS_TRANSLATION_TABLE_SQL,
  listStatusTranslations,
  readPublicStatusTranslations,
  upsertStatusTranslation,
} from "../index";

const TEST_PREFIX = "svc-status-translation-test";

let ownCtx: ServiceContext;
let foreignCtx: ServiceContext;

beforeAll(async () => {
  const own = (await createWorkspaceFixture("team")).workspace;
  const foreign = (await createWorkspaceFixture("team")).workspace;
  ownCtx = makeUserCtx(own, { userId: 1 });
  foreignCtx = makeUserCtx(foreign, { userId: 2 });
});

async function seed(tx: DB) {
  await tx.run(sql.raw(STATUS_TRANSLATION_TABLE_SQL));
  const workspaceId = ownCtx.workspace.id;
  const pageRow = await tx
    .insert(page)
    .values({
      workspaceId,
      title: `${TEST_PREFIX}-page`,
      description: "",
      slug: `${TEST_PREFIX}-${crypto.randomUUID()}`,
      customDomain: "",
    })
    .returning()
    .get();
  const report = await tx
    .insert(statusReport)
    .values({
      workspaceId,
      pageId: pageRow.id,
      status: "identified",
      title: "Fahrzeugpositionen pausiert",
    })
    .returning()
    .get();
  const update = await tx
    .insert(statusReportUpdate)
    .values({
      statusReportId: report.id,
      status: "identified",
      date: new Date(),
      message: "Wir haben die Quelle abgeschaltet.",
    })
    .returning()
    .get();
  const window = await tx
    .insert(maintenance)
    .values({
      workspaceId,
      pageId: pageRow.id,
      title: "Serverumzug",
      message: "Kurz nicht erreichbar.",
      from: new Date(Date.now() + 3_600_000),
      to: new Date(Date.now() + 7_200_000),
    })
    .returning()
    .get();
  return { pageId: pageRow.id, report, update, window };
}

describe("status translations", () => {
  test("stores, lists and publishes English copy", async () => {
    await withTestTransaction(async (tx) => {
      const { pageId, report, update, window } = await seed(tx);
      const ctx = { ...ownCtx, db: tx };

      await upsertStatusTranslation({
        ctx,
        input: {
          kind: "report",
          refId: report.id,
          title: "Vehicle positions paused",
        },
      });
      await upsertStatusTranslation({
        ctx,
        input: {
          kind: "update",
          refId: update.id,
          message: "We switched the source off.",
        },
      });
      await upsertStatusTranslation({
        ctx,
        input: { kind: "maintenance", refId: window.id, title: "Server move" },
      });

      const listed = await listStatusTranslations({ ctx, input: { pageId } });
      expect(listed.reports[0].englishTitle).toBe("Vehicle positions paused");
      expect(listed.reports[0].updates[0].englishMessage).toBe(
        "We switched the source off.",
      );
      expect(listed.maintenances[0].englishTitle).toBe("Server move");
      expect(listed.maintenances[0].englishMessage).toBeNull();

      const published = await readPublicStatusTranslations({ pageId, db: tx });
      expect(published.reports[report.id]?.title).toBe(
        "Vehicle positions paused",
      );
      expect(published.updates[update.id]?.message).toBe(
        "We switched the source off.",
      );

      await expectAuditRow({
        workspaceId: ownCtx.workspace.id,
        action: "status_report_update.update",
        entityType: "status_report_update",
        entityId: update.id,
        db: tx,
      });
    });
  });

  test("an empty value removes the English copy", async () => {
    await withTestTransaction(async (tx) => {
      const { pageId, report } = await seed(tx);
      const ctx = { ...ownCtx, db: tx };
      await upsertStatusTranslation({
        ctx,
        input: { kind: "report", refId: report.id, title: "Paused" },
      });
      const removed = await upsertStatusTranslation({
        ctx,
        input: { kind: "report", refId: report.id, title: "  " },
      });
      expect(removed).toBeNull();
      const published = await readPublicStatusTranslations({ pageId, db: tx });
      expect(published.reports[report.id]).toBeUndefined();
    });
  });

  test("rejects a report from another workspace", async () => {
    await withTestTransaction(async (tx) => {
      const { report } = await seed(tx);
      await expect(
        upsertStatusTranslation({
          ctx: { ...foreignCtx, db: tx },
          input: { kind: "report", refId: report.id, title: "Hijack" },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  test("rejects read-only actor", async () => {
    await withTestTransaction(async (tx) => {
      const readOnlyCtx = {
        ...makeApiKeyCtx(ownCtx.workspace, {
          keyId: "k-read",
          userId: 1,
          scopes: ["read"],
        }),
        db: tx,
      };
      await expect(
        upsertStatusTranslation({
          ctx: readOnlyCtx,
          input: { kind: "report", refId: 1, title: "x" },
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  test("the bootstrap creates the same table", async () => {
    const bootstrap = await Deno.readTextFile(
      new URL("../../../../../ops/bootstrap.mjs", import.meta.url),
    );
    expect(bootstrap).toContain(STATUS_TRANSLATION_TABLE_SQL);
  });
});

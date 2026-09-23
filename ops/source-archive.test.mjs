import assert from "node:assert/strict";
import test from "node:test";

import { guard, isShipped } from "./source-archive.mjs";

test("ships the running apps but excludes operator and unrelated code", () => {
  assert.equal(isShipped("apps/status-page/src/app/page.tsx"), true);
  assert.equal(isShipped("apps/dashboard/src/app/page.tsx"), true);
  for (const path of [
    ".git",
    ".github/workflows/publish-source.yml",
    ".railway/railway.ts",
    "Brain/10_Betrieb/private.md",
    "docs/self-host-auth.md",
    "apps/web/src/content/pages/blog/post.mdx",
    "apps/server/src/index.ts",
    "apps/status-page/.env.production",
  ]) {
    assert.equal(isShipped(path), false, path);
  }
});

test("independent guard catches an unrelated app even if the filter regresses", () => {
  const problems = guard(["apps/web/src/index.ts"], () => "");
  assert.ok(problems.some((problem) => problem.includes("unrelated app")));
});

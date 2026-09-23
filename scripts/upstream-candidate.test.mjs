import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
  new URL("./upstream-candidate.mjs", import.meta.url),
);

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commit(cwd, message) {
  git(cwd, "add", ".");
  git(
    cwd,
    "-c",
    "commit.gpgsign=false",
    "-c",
    "user.name=Update test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-m",
    message,
  );
}

test("applies an upstream change across unrelated repository histories", () => {
  const root = mkdtempSync(join(tmpdir(), "oeffigo-upstream-"));
  try {
    const upstream = join(root, "upstream");
    const fork = join(root, "fork");
    const relative = "apps/status-page/src/example.txt";
    mkdirSync(join(upstream, "apps/status-page/src"), { recursive: true });
    git(upstream, "init", "-b", "main");
    writeFileSync(join(upstream, relative), "before\n");
    commit(upstream, "base");
    const base = git(upstream, "rev-parse", "HEAD");
    writeFileSync(join(upstream, relative), "after\n");
    commit(upstream, "update");
    const head = git(upstream, "rev-parse", "HEAD");

    mkdirSync(join(fork, "apps/status-page/src"), { recursive: true });
    mkdirSync(join(fork, "ops"), { recursive: true });
    mkdirSync(join(fork, "scripts"), { recursive: true });
    git(fork, "init", "-b", "main");
    writeFileSync(join(fork, relative), "before\n");
    writeFileSync(join(fork, "ops/openstatus-upstream.txt"), `${base}\n`);
    cpSync(source, join(fork, "scripts/upstream-candidate.mjs"));
    commit(fork, "independent fork");
    git(fork, "remote", "add", "upstream", upstream);
    git(fork, "fetch", "upstream", "main");

    execFileSync("node", ["scripts/upstream-candidate.mjs"], { cwd: fork });
    assert.equal(readFileSync(join(fork, relative), "utf8"), "after\n");
    assert.equal(
      readFileSync(join(fork, "ops/openstatus-upstream.txt"), "utf8"),
      `${head}\n`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

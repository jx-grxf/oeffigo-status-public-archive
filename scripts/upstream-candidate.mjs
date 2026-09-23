import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const baseFile = new URL("../ops/openstatus-upstream.txt", import.meta.url);
const base = readFileSync(baseFile, "utf8").trim();
const upstream = process.argv[2] ?? "upstream/main";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const head = git("rev-parse", upstream);

if (!/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) {
  throw new Error("Expected full upstream commit hashes");
}
if (
  spawnSync("git", ["merge-base", "--is-ancestor", base, head]).status !== 0
) {
  throw new Error(
    "Recorded upstream commit is not an ancestor of upstream/main",
  );
}
if (base === head) {
  console.log("OpenStatus is already at the recorded upstream commit");
  process.exit(0);
}
if (git("status", "--porcelain")) {
  throw new Error("Apply upstream changes only to a clean checkout");
}

const paths = [
  "apps",
  "packages",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
];
const patch = execFileSync(
  "git",
  ["diff", "--binary", base, head, "--", ...paths],
  {
    maxBuffer: 64 * 1024 * 1024,
  },
);
if (patch.length) {
  const applied = spawnSync("git", ["apply", "--3way"], {
    input: patch,
    encoding: "utf8",
  });
  if (applied.status !== 0) {
    const conflicts = git("diff", "--name-only", "--diff-filter=U");
    console.error(applied.stderr.trim());
    throw new Error(
      `OpenStatus update needs manual integration${conflicts ? `: ${conflicts}` : ""}`,
    );
  }
}

writeFileSync(baseFile, `${head}\n`);
const changed = git("diff", "HEAD", "--name-only").split("\n").filter(Boolean);
const highRisk = changed.some((path) =>
  /^(apps\/(dashboard|status-page)\/src\/(app\/api|lib\/auth)|packages\/(api|db|emails|services)\/|package\.json$|pnpm-(lock|workspace)\.yaml$)/.test(
    path,
  ),
);
console.log(`OpenStatus ${base.slice(0, 7)} → ${head.slice(0, 7)}`);
console.log(`${changed.length} scoped files changed; review gate: ${highRisk}`);
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(
    process.env.GITHUB_OUTPUT,
    `updated=true\nupstream_sha=${head}\nhigh_risk=${highRisk}\n`,
    { flag: "a" },
  );
}

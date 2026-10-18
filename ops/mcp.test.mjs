import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRouter, readCatalogue, runTool } from "./mcp.mjs";

const catalogue = () => [
  { procedure: "statusReport.list", kind: "query", input: null },
  { procedure: "statusReport.create", kind: "mutation", input: "z.object({ title: z.string() })" },
];

test("the catalogue comes from the router source", () => {
  const all = readCatalogue();
  const create = all.find((p) => p.procedure === "statusReport.create");
  assert.equal(create.kind, "mutation");
  assert.match(create.input, /title: z\.string\(\)/);
  assert.equal(all.find((p) => p.procedure === "statusReport.list").kind, "query");
});

test("parseRouter reads kind and inline input", () => {
  const source = `export const r = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async () => {}),
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async () => {}),
});`;
  assert.deepEqual(parseRouter("x", source).map((p) => [p.procedure, p.kind, p.input]), [
    ["x.get", "query", "z.object({ id: z.number() })"],
    ["x.remove", "mutation", "z.object({ id: z.number() })"],
  ]);
});

test("a mutation never runs through the read tool, nor a query through the write tool", async () => {
  const sent = [];
  const send = async (request) => (sent.push(request), { ok: true });
  const ctx = { token: async () => "t", baseUrl: "https://admin.example", catalogue, send };
  await assert.rejects(runTool("status_query", { procedure: "statusReport.create", input: {} }, ctx), /status_mutate/);
  await assert.rejects(runTool("status_mutate", { procedure: "statusReport.list" }, ctx), /status_query/);
  await assert.rejects(runTool("status_query", { procedure: "../secret" }, ctx), /router\.procedure/);
  await assert.rejects(runTool("status_query", { procedure: "nothing.here" }, ctx), /unknown procedure/);
  assert.equal(sent.length, 0);
  await runTool("status_mutate", { procedure: "statusReport.create", input: { title: "x" } }, ctx);
  assert.deepEqual(sent[0], { procedure: "statusReport.create", input: { title: "x" }, kind: "mutation", token: "t", baseUrl: "https://admin.example" });
});

test("the token is only read when a call is sent", async () => {
  let reads = 0;
  const token = async () => (reads += 1, "t");
  const ctx = { token, catalogue, send: async () => ({}) };
  await runTool("status_procedures", {}, ctx);
  await assert.rejects(runTool("status_query", { procedure: "nothing.here" }, ctx));
  assert.equal(reads, 0);
  await runTool("status_query", { procedure: "statusReport.list", input: {} }, ctx);
  assert.equal(reads, 1);
});

test("a failed token read sends nothing", async () => {
  const send = async () => assert.fail("must not send");
  const token = async () => { throw new Error("could not read the ops token from 1Password"); };
  await assert.rejects(runTool("status_query", { procedure: "statusReport.list" }, { token, catalogue, send }), /1Password/);
});

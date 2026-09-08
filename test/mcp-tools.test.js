"use strict";

// Integration tests: spawn the real MCP server (index.js) over stdio JSON-RPC,
// the same way CLAUDE.md's manual smoke-test commands do, and exercise the
// tools touched by the affiliate-link packing work (no USDC cost — these are
// all free tools).
//
// Run with: npm test  (node --test test/)

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const INDEX_JS = path.join(__dirname, "..", "index.js");

function callTool(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [INDEX_JS], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => (stdout += d));
    child.stderr.on("data", d => (stderr += d));
    child.on("error", reject);
    child.on("close", () => {
      try {
        const line = stdout.trim().split("\n").filter(Boolean).pop();
        const parsed = JSON.parse(line);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse MCP response.\nstdout: ${stdout}\nstderr: ${stderr}\n${e.message}`));
      }
    });
    const req = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
    child.stdin.write(JSON.stringify(req) + "\n");
    child.stdin.end();
  });
}

function toolResult(resp) {
  assert.ok(resp.result, `expected a result, got: ${JSON.stringify(resp)}`);
  assert.ok(!resp.result.isError, `tool call errored: ${JSON.stringify(resp.result)}`);
  return JSON.parse(resp.result.content[0].text);
}

test("tools/list includes generate_affiliate_link with an extra_params property", async () => {
  const resp = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [INDEX_JS], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", d => (stdout += d));
    child.on("error", reject);
    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout.trim().split("\n").filter(Boolean).pop()));
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n");
    child.stdin.end();
  });

  const tools = resp.result.tools;
  assert.equal(tools.length, 8, "tool count should remain 8 — no new tools added");
  const genLink = tools.find(t => t.name === "generate_affiliate_link");
  assert.ok(genLink);
  assert.ok(genLink.inputSchema.properties.extra_params, "extra_params should be in the schema");
});

test("generate_affiliate_link: epicvin with vin extra_param end-to-end", async () => {
  const resp = await callTool("generate_affiliate_link", {
    vendor_id: "forgemesh-vehicle-reports",
    product_id: "epicvin_history_report",
    extra_params: { vin: "1HGCM82633A004352" },
  });
  const result = toolResult(resp);
  assert.equal(result.url, "https://forgemesh.io/go/epicvin?vin=1HGCM82633A004352");
});

test("generate_affiliate_link: digitalocean droplets end-to-end (Awin encoding)", async () => {
  const resp = await callTool("generate_affiliate_link", {
    vendor_id: "digitalocean",
    product_id: "pricing_droplets",
  });
  const result = toolResult(resp);
  assert.equal(
    result.url,
    "https://www.awin1.com/cread.php?awinmid=123996&awinaffid=3055837&ued=https%3A%2F%2Fwww.digitalocean.com%2Fpricing%2Fdroplets"
  );
});

test("generate_affiliate_link: ledger stax end-to-end", async () => {
  const resp = await callTool("generate_affiliate_link", { vendor_id: "ledger", product_id: "stax" });
  const result = toolResult(resp);
  assert.equal(result.url, "https://shop.ledger.com/products/ledger-stax?r=08dfd680cf63");
});

test("estimate_commission: per-sale branch for a link-based vendor (ledger)", async () => {
  const resp = await callTool("estimate_commission", { vendor_id: "ledger", product_id: "nano-x" });
  const result = toolResult(resp);
  assert.equal(result.commission_type, "per_sale");
  assert.equal(result.commission_pct, 10);
  assert.ok(result.calls_per_month_note, "should explain calls_per_month doesn't apply");
  assert.ok(!("per_call_usd" in result), "per-sale programs should not report a per_call_usd");
});

test("estimate_commission: per-call branch still works for x402 vendors (regression)", async () => {
  const resp = await callTool("estimate_commission", {
    vendor_id: "coinopai",
    product_id: "kronos_signals",
    calls_per_month: 200,
  });
  const result = toolResult(resp);
  assert.equal(result.commission_type, "per_call");
  assert.ok(Math.abs(result.per_call_usd - 0.01) < 1e-9);
  assert.ok(Math.abs(result.monthly_estimate_usd - 2) < 1e-9);
});

test("estimate_commission: per-sale branch handles a null product-level pct (amazon storefront)", async () => {
  const resp = await callTool("estimate_commission", {
    vendor_id: "amazon-influencer-storefront",
    product_id: "storefront",
  });
  const result = toolResult(resp);
  assert.equal(result.commission_type, "per_sale");
  assert.equal(result.commission_pct, null);
});

test("list_affiliate_programs: includes all newly packed vendors", async () => {
  const resp = await callTool("list_affiliate_programs", {});
  const result = toolResult(resp);
  const ids = result.programs.map(p => p.vendor_id);
  for (const expected of ["ledger", "digitalocean", "amazon-influencer-storefront", "forgemesh-vehicle-reports", "partnerstack"]) {
    assert.ok(ids.includes(expected), `expected ${expected} in list_affiliate_programs`);
  }
});

test("generate_affiliate_link: still rejects x402 vendors (regression)", async () => {
  const resp = await callTool("generate_affiliate_link", { vendor_id: "coinopai", product_id: "kronos_signals" });
  assert.ok(resp.result.isError);
  assert.match(resp.result.content[0].text, /x402 vendor/);
});

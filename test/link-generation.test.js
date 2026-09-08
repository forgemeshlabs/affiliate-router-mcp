"use strict";

// Unit tests for adapters/referral-link.js against the real registry entries
// added for EpicVIN, Detailed Vehicle History, ElevenLabs, Ledger,
// DigitalOcean (Awin), and the Amazon influencer storefront.
//
// Run with: npm test  (node --test test/)

const test = require("node:test");
const assert = require("node:assert/strict");

const registry = require("../registry.json");
const linkAdapter = require("../adapters/referral-link");

function vendor(id) {
  const v = registry.vendors[id];
  assert.ok(v, `vendor ${id} not found in registry.json`);
  return v;
}

function product(vendorId, productId) {
  const v = vendor(vendorId);
  const p = (v.products || []).find(p => p.id === productId);
  assert.ok(p, `product ${vendorId}/${productId} not found in registry.json`);
  return { vendor: v, product: p };
}

// Mirrors index.js handleGenerateLink's config forwarding.
function generate(vendorId, productId, affiliateId, extraParams) {
  const { vendor: v, product: p } = product(vendorId, productId);
  const config = { ...v.affiliate_config, affiliate_system: v.affiliate_system };
  return linkAdapter.generateLink(p, config, affiliateId, extraParams);
}

// ── ForgeMesh /go/ redirects — {vin} template substitution ────────────────

test("epicvin: applies vin as a query param when provided", () => {
  const r = generate("forgemesh-vehicle-reports", "epicvin_history_report", null, { vin: "1HGCM82633A004352" });
  assert.equal(r.url, "https://forgemesh.io/go/epicvin?vin=1HGCM82633A004352");
  assert.equal(r.affiliate_applied, true);
});

test("epicvin: omits the vin query param entirely when not provided", () => {
  const r = generate("forgemesh-vehicle-reports", "epicvin_history_report", null, {});
  assert.equal(r.url, "https://forgemesh.io/go/epicvin");
  assert.ok(!r.url.includes("?"), "no query string should be present without a vin");
});

test("epicvin: still self-attributes (affiliate_applied) with no vin and no affiliate_id", () => {
  const r = generate("forgemesh-vehicle-reports", "epicvin_history_report", null, undefined);
  assert.equal(r.affiliate_applied, true, "the /go/ redirect itself carries our attribution");
});

test("dvh: applies vin as a query param when provided", () => {
  const r = generate("forgemesh-vehicle-reports", "dvh_history_report", null, { vin: "1HGCM82633A004352" });
  assert.equal(r.url, "https://forgemesh.io/go/dvh?vin=1HGCM82633A004352");
});

test("dvh: omits the vin query param when not provided", () => {
  const r = generate("forgemesh-vehicle-reports", "dvh_history_report", null, {});
  assert.equal(r.url, "https://forgemesh.io/go/dvh");
});

test("vin values are URL-encoded when applied", () => {
  const r = generate("forgemesh-vehicle-reports", "epicvin_history_report", null, { vin: "AB CD/EF" });
  const url = new URL(r.url);
  assert.equal(url.searchParams.get("vin"), "AB CD/EF");
  assert.ok(r.url.includes("AB+CD%2FEF") || r.url.includes("AB%20CD%2FEF"));
});

// ── ElevenLabs (PartnerStack, fixed pre-tracked link) ──────────────────────

test("elevenlabs: returns the exact PartnerStack link unmodified", () => {
  const r = generate("partnerstack", "elevenlabs", null, null);
  assert.equal(r.url, "https://try.elevenlabs.io/4c1hgz625jps");
  assert.equal(r.affiliate_applied, true);
});

test("elevenlabs: an affiliate_id override does not get appended (fixed_link)", () => {
  const r = generate("partnerstack", "elevenlabs", "some_other_code", null);
  assert.equal(r.url, "https://try.elevenlabs.io/4c1hgz625jps");
});

// ── Ledger (fixed per-product deep links with r= baked in) ─────────────────

test("ledger nano-x: returns the exact tracked deep link", () => {
  const r = generate("ledger", "nano-x", null, null);
  assert.equal(r.url, "https://shop.ledger.com/products/ledger-nano-x?r=08dfd680cf63");
});

test("ledger nano-s-plus: returns the exact tracked deep link", () => {
  const r = generate("ledger", "nano-s-plus", null, null);
  assert.equal(r.url, "https://shop.ledger.com/products/ledger-nano-s-plus?r=08dfd680cf63");
});

test("ledger stax: returns the exact tracked deep link", () => {
  const r = generate("ledger", "stax", null, null);
  assert.equal(r.url, "https://shop.ledger.com/products/ledger-stax?r=08dfd680cf63");
});

// ── DigitalOcean via Awin — cread.php destination wrapping + URL-encoding ──

test("digitalocean droplets: wraps destination behind Awin cread.php with correct mid/affid", () => {
  const r = generate("digitalocean", "pricing_droplets", null, null);
  assert.equal(
    r.url,
    "https://www.awin1.com/cread.php?awinmid=123996&awinaffid=3055837&ued=https%3A%2F%2Fwww.digitalocean.com%2Fpricing%2Fdroplets"
  );
});

test("digitalocean homepage: wraps destination behind Awin cread.php", () => {
  const r = generate("digitalocean", "homepage", null, null);
  assert.equal(
    r.url,
    "https://www.awin1.com/cread.php?awinmid=123996&awinaffid=3055837&ued=https%3A%2F%2Fwww.digitalocean.com%2F"
  );
});

test("awin_link: destination_url is fully percent-encoded in the ued param", () => {
  const r = generate("digitalocean", "pricing_droplets", null, null);
  const uedValue = new URL(r.url).searchParams.get("ued");
  assert.equal(uedValue, "https://www.digitalocean.com/pricing/droplets");
  // Confirm the raw query string carries the encoded form, not a bare URL.
  assert.ok(r.url.includes("ued=https%3A%2F%2F"));
});

test("awin_link: throws if the vendor is missing awinmid/awinaffid", () => {
  const p = { id: "x", landing_url: "https://example.com", destination_url: "https://example.com" };
  assert.throws(() => linkAdapter.generateLink(p, { affiliate_system: "awin_link" }, null, null));
});

// ── Amazon influencer storefront (fixed, no per-product tagging) ───────────

test("amazon storefront: returns the storefront URL unmodified", () => {
  const r = generate("amazon-influencer-storefront", "storefront", null, null);
  assert.equal(r.url, "https://www.amazon.com/shop/ai_tinkers");
  assert.equal(r.affiliate_applied, true);
});

// ── Regression: existing referral_link / query_param_link vendors ──────────

test("regression: referral_link vendor with affiliate_id_env only self-attributes when an id resolves", () => {
  const p = { id: "widget", landing_url: "https://example.com/buy" };
  const config = { affiliate_system: "referral_link", tracking_param: "ref", affiliate_id_env: "SOME_ENV" };

  const withoutId = linkAdapter.generateLink(p, config, null, null);
  assert.equal(withoutId.affiliate_applied, false);
  assert.equal(withoutId.url, "https://example.com/buy");

  const withId = linkAdapter.generateLink(p, config, "af_123", null);
  assert.equal(withId.affiliate_applied, true);
  assert.equal(withId.url, "https://example.com/buy?ref=af_123");
});

test("regression: query_param_link uses vendor's configured tracking_param", () => {
  const p = { id: "widget", landing_url: "https://example.com/buy" };
  const config = { affiliate_system: "query_param_link", tracking_param: "affiliate", affiliate_id_env: "SOME_ENV" };
  const r = linkAdapter.generateLink(p, config, "af_999", null);
  assert.equal(r.url, "https://example.com/buy?affiliate=af_999");
  assert.equal(r.tracking_param, "affiliate");
});

test("throws when a product has no landing_url", () => {
  assert.throws(() => linkAdapter.generateLink({ id: "no-url" }, { affiliate_system: "referral_link" }, null, null));
});

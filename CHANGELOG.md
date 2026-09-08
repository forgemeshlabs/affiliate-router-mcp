# Changelog

## 0.1.10 — 2026-09-08
- Fix: `list_affiliate_programs` / `search_opportunities` rendered `undefined%`/`null%` for vendors without `commission_bps` (operator-precedence bug). New `commissionLabel()` helper: bps → pct → note → "varies". Regression test added.

## 0.1.9

- Registry: added 5 live vendors — `forgemesh-vehicle-reports` (EpicVIN + Detailed
  Vehicle History via forgemesh.io/go/ tracked redirects, with optional VIN
  prefill), `ledger` (Nano X / Nano S Plus / Stax deep links), `digitalocean`
  (Awin-wrapped homepage + Droplets pricing), `amazon-influencer-storefront`
  (ai_tinkers storefront), and an `elevenlabs` product on the existing
  `partnerstack` vendor.
- New `awin_link` affiliate system: wraps a product's `destination_url` behind
  Awin's `cread.php` redirect using the vendor's `awinmid`/`awinaffid`.
- New product-level `fixed_link` flag: returns a complete, already-tracked URL
  (a PartnerStack share link, a Ledger deep link with `r=` baked in, a
  storefront URL) without further mutation — optional params can still be
  layered on top.
- New product-level `optional_params` mechanism (`{toolArgName: queryParam}`)
  for template-style link generation — e.g. an optional `vin` passed via the
  new `generate_affiliate_link` tool argument `extra_params`, applied as a
  query param only when provided.
- `generate_affiliate_link` now forwards the vendor's `affiliate_system` into
  the adapter config alongside `affiliate_config` — previously the adapter
  only ever saw its default fallback, which happened to work for the two
  systems that existed at the time but would not have correctly routed
  `awin_link`.
- `estimate_commission` now has a per-sale branch (`product.commission.type
  === "per_sale"`) for referral/link-based vendors, so it no longer falls
  through to per-call arithmetic (or "unknown") for sale-based affiliate
  programs.
- Added `test/` (Node's built-in `node:test`), covering link generation for
  every vendor added here (including VIN substitution and Awin URL-encoding)
  plus regression coverage for the existing referral/query-param vendors and
  the x402 commission math. Run with `npm test`.

## 0.1.6

- Added Glama registry metadata for ForgeMesh maintainer verification.
- Published affiliate routing MCP server for local stdio use.

# Affiliate Router — Architecture

## What This Is

A vendor-neutral affiliate routing layer for agents. One MCP server that discovers, routes, and
attributes revenue across multiple affiliate systems — Pyrimid/x402 API calls, referral links,
SaaS programs, digital product storefronts.

The goal is not to be an affiliate site. It's to be programmable monetization middleware —
infrastructure that any agent, MCP wrapper, or automated workflow can plug into to earn on
every relevant recommendation or call it makes.

---

## The Stack

```
Agent / App / Blog / MCP
        ↓
  affiliate-router-mcp
        ↓
  Opportunity Registry (registry.json)
        ↓
  Routing Decision
  ┌─────────────────────────────────────┐
  │ affiliate_id present?               │
  │ product has pyrimid_product_id?     │
  │ affiliate_id cached as valid?       │
  └─────────────────────────────────────┘
        ↓                    ↓
  Pyrimid Adapter     Direct x402 Adapter   Referral Link Adapter
  (approve +          (EIP-3009 payment      (URL param injection,
  routePayment +      via Coinbase           no payment needed)
  X-Payment retry)    facilitator)
        ↓
  Vendor Endpoint
        ↓
  Telemetry (JSONL)
        ↓
  Return vendor response + attribution metadata
```

---

## Adapter Types

| Type | How it works | Payment | Affiliate method |
|------|-------------|---------|-----------------|
| `x402_pyrimid` | Full Pyrimid flow: probe 402 → approve USDC → routePayment → retry with tx hash | On-chain USDC | X-Affiliate-ID header + PyrimidRouter split |
| `x402_direct` | Standard x402: probe 402 → EIP-3009 transferWithAuthorization → retry | On-chain USDC | None (100% to vendor) |
| `referral_link` | Inject tracking param into URL | None | Query param / referral code |
| `query_param_link` | Same as referral_link, explicit param name | None | Query param |

---

## Routing Logic

```
incoming call_affiliate_product(vendor_id, product_id, params, affiliate_id?)
    ↓
resolve affiliate_id:
  1. tool arg affiliate_id (wins)
  2. process.env[vendor.affiliate_config.affiliate_id_env]
  3. null (no attribution)
    ↓
product has pyrimid_product_id?
  no  → x402_direct (vendor gets 100%)
  yes ↓
affiliate_id present?
  no  → x402_direct (vendor gets 100%)
  yes ↓
check affiliate-cache.json
  VALID   → x402_pyrimid (Pyrimid split, affiliate earns)
  INVALID → x402_direct  (fallback, vendor gets 100%)
  UNKNOWN → try x402_pyrimid
              success → mark VALID, return data
              fail    → mark INVALID, retry x402_direct
```

---

## Pyrimid Payment Flow (x402_pyrimid adapter)

```
1. GET /endpoint + X-Affiliate-ID header
   → 402 with recipient=PyrimidRouter, split breakdown

2. USDC.approve(PyrimidRouter, price)
   → on-chain tx, wait for receipt, 3s RPC propagation delay

3. PyrimidRouter.routePayment(vendorId, productId, affiliateIdBytes16, buyer, maxPrice)
   → on-chain tx, wait for receipt, 3s block index propagation delay

4. GET /endpoint + X-Affiliate-ID + X-Payment: txhash
   → 200 + vendor data
```

The `affiliateIdBytes16` param in routePayment is zeroed bytes16 for v0 — the affiliate
attribution happens at the server via X-Affiliate-ID header, not on-chain via the bytes16 param.

---

## Registry Schema

See `registry.json`. Key fields per vendor:

```json
{
  "id": "unique_vendor_id",
  "name": "Display Name",
  "description": "What this vendor offers",
  "categories": ["crypto", "ai", "tools"],
  "trust_score": 1-10,
  "affiliate_system": "x402_pyrimid | x402_direct | referral_link | query_param_link",
  "affiliate_config": {
    "affiliate_id_env": "ENV_VAR_NAME",
    "commission_bps": 2000,
    "commission_pct": null,
    "vendor_id": "0x...",
    "pyrimid_router": "0x...",
    "usdc_address": "0x...",
    "tracking_param": "affiliate"
  },
  "products": [
    {
      "id": "product_id",
      "name": "Product Name",
      "description": "What it does",
      "endpoint": "https://...",
      "price_usd": 0.05,
      "pyrimid_product_id": 1,
      "affiliate_eligible": true,
      "params": {}
    }
  ]
}
```

---

## Affiliate Cache

`cache/affiliate-cache.json` — persisted in-memory cache of affiliate ID validity.

```json
{
  "af_treasury": {
    "status": "valid",
    "first_seen": "2026-05-14T17:07:01Z",
    "last_used": "2026-05-14T17:07:01Z",
    "call_count": 3
  },
  "af_FAKE_XYZ": {
    "status": "invalid",
    "first_seen": "2026-05-14T18:00:00Z",
    "failure_reason": "routePayment reverted"
  }
}
```

Status:
- `valid` — routePayment succeeded at least once with this ID
- `invalid` — routePayment failed — fallback to direct x402
- absent — not seen before — probe and cache

---

## Telemetry

`logs/affiliate-telemetry.jsonl` — append-only, one JSON object per line.

```json
{
  "ts": "2026-05-14T17:07:01Z",
  "vendor_id": "coinopai",
  "product_id": "kronos_signals",
  "endpoint": "/api/kronos/signals",
  "amount_usd": 0.05,
  "affiliate_id": "af_treasury",
  "payment_type": "x402_pyrimid",
  "commission_est_usd": 0.0099,
  "status": "success",
  "tx_hash": "0x..."
}
```

---

## MCP Tools

| Tool | Type | Cost |
|------|------|------|
| `search_opportunities` | Discovery | Free |
| `list_affiliate_programs` | Discovery | Free |
| `get_opportunity_details` | Discovery | Free |
| `get_best_route` | Routing | Free |
| `generate_affiliate_link` | Link adapter | Free |
| `call_affiliate_product` | Payment adapter | USDC per call |
| `estimate_commission` | Analytics | Free |
| `get_affiliate_telemetry` | Analytics | Free |

---

## Security Model

- Registry is a local JSON file — no arbitrary URL routing
- `call_affiliate_product` only calls endpoints registered in registry.json
- URL validation: endpoint must match registered product.endpoint exactly
- Secrets stored in env vars only — never in registry.json
- `WALLET_PRIVATE_KEY` never logged anywhere

---

## v0 Scope

- Adapters: x402_pyrimid, x402_direct, referral_link
- Registry: CoinOpAI (Pyrimid) + 2 generic link examples
- Tools: all 8 above
- Telemetry: JSONL local log
- Cache: file-persisted affiliate ID validation

## Not in v0

- PartnerStack/Impact.com/ShareASale API integrations
- Remote registry sync
- Web dashboard for telemetry
- Multi-level commissions
- Click tracking (link-only, no server-side redirect)

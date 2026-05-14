# affiliate-router-mcp

Vendor-neutral monetization routing for agent tools. One MCP server that discovers,
routes, and attributes revenue across paid APIs, referral links, and affiliate programs.

The router is not tied to any single payment network or affiliate system.
Adapters are pluggable. The registry is a local JSON file you control.

**Status:** experimental · v0.1.0

> **Disclaimer:** This MCP does not guarantee payouts. It routes attribution data
> according to each vendor/program's rules. Commission distribution is enforced by
> the vendor's payment system, not by this router.

---

## What it does

Agents need a way to call monetizable tools without hardcoding every affiliate
or payment system. `affiliate-router-mcp` provides:

- **Discovery** — find vendors and products by category or intent
- **Routing** — choose the right payment/attribution path automatically
- **Calling** — execute payments with affiliate attribution
- **Link generation** — inject tracking params into referral URLs
- **Telemetry** — log every attributed call locally for tracking

---

## 8 Tools

| Tool | Cost | Description |
|------|------|-------------|
| `search_opportunities` | Free | Find products by category or keyword |
| `list_affiliate_programs` | Free | List all vendors and their programs |
| `get_opportunity_details` | Free | Full details on a specific vendor/product |
| `get_best_route` | Free | Recommend the best route for an intent |
| `generate_affiliate_link` | Free | Build a tracked referral URL |
| `call_affiliate_product` | varies | Pay and call a product with attribution |
| `estimate_commission` | Free | Project monthly earnings at a call volume |
| `get_affiliate_telemetry` | Free | View local attribution log |

---

## Adapters

Each payment or attribution system is a separate adapter. Adding a new one does not
affect existing adapters.

| Adapter | How it works | Payment | Status |
|---------|-------------|---------|--------|
| `x402_pyrimid` | Approve USDC → `routePayment` on-chain → retry with tx hash | On-chain USDC split | **Tested** |
| `x402_direct` | EIP-3009 `transferWithAuthorization` via Coinbase facilitator | On-chain USDC to vendor | Implemented |
| `referral_link` | Inject affiliate param into URL | None — program-dependent | Implemented |

**Pyrimid is the first fully tested paid affiliate adapter.** It is not the only
supported model. Future adapters may include: PartnerStack, Rewardful, Impact,
Commission Junction, coupon/promo code injection, API-key partner programs, and
other emerging agent commerce protocols.

---

## Install

```bash
npm install -g affiliate-router-mcp
```

Or with Claude Code / any MCP client:

```json
{
  "mcpServers": {
    "affiliate-router": {
      "command": "affiliate-router-mcp",
      "env": {
        "WALLET_PRIVATE_KEY": "0x...",
        "PYRIMID_AFFILIATE_ID": "af_your_id",
        "GUMROAD_AFFILIATE_ID": "your-gumroad-id"
      }
    }
  }
}
```

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `WALLET_PRIVATE_KEY` | For `call_affiliate_product` with x402 adapters | Base wallet with USDC + ETH for gas |
| `PYRIMID_AFFILIATE_ID` | No | Default affiliate ID for Pyrimid-registered products |
| `GUMROAD_AFFILIATE_ID` | No | Gumroad tracking ID |
| `PARTNERSTACK_CODE` | No | PartnerStack referral code |

---

## Included Vendors (v0.1.0)

**CoinOpAI** (`x402_pyrimid`) — crypto intelligence API on Base mainnet
- Kronos Signals — $0.05/call, 20% commission
- Kronos Decision — $0.15/call, 20% commission
- Image Generation — $0.10/call, 20% commission

**Gumroad** (`referral_link`) — digital product marketplace, ~30% commission per product

**PartnerStack** (`referral_link`) — SaaS affiliate programs stub (add your own products)

---

## Routing Logic

```
call_affiliate_product(vendor_id, product_id, params, affiliate_id?)
    ↓
resolve affiliate_id: tool arg → env var → null
    ↓
adapter = vendor.affiliate_system
    ↓
x402_pyrimid + affiliate_id present?
  cache VALID   → Pyrimid split flow (affiliate earns commission)
  cache INVALID → x402_direct fallback (vendor gets 100%)
  cache UNKNOWN → try Pyrimid → cache result → fallback on failure

x402_direct → EIP-3009 payment, no affiliate split
referral_link → inject tracking param, no payment
```

---

## Package vs. Product Updates

These are independent concerns.

**Package updates** (this repo):
- Adding or fixing adapters
- Updating tool schemas
- Changing routing or caching logic
- Dependency bumps

**Product/catalog updates** (registry.json):
- Registering new vendor endpoints
- Changing prices or commission rates
- Enabling affiliate eligibility on a product
- Assigning network-specific product IDs (e.g. Pyrimid product IDs)

Adding a vendor to `registry.json` does not require a package release.
Releasing a new package version does not require products to be re-registered.

---

## Adding a Vendor

Edit `registry.json`. No code changes needed for referral-link vendors.
x402 vendors require a funded wallet. Pyrimid vendors additionally require
on-chain registration to obtain a `vendor_id` and per-product `pyrimid_product_id`.

```json
{
  "id": "my_vendor",
  "name": "My Vendor",
  "affiliate_system": "referral_link",
  "affiliate_config": {
    "tracking_param": "ref",
    "affiliate_id_env": "MY_VENDOR_REF_CODE",
    "commission_pct": 25
  },
  "products": [...]
}
```

---

## Telemetry

All `call_affiliate_product` calls append to `logs/affiliate-telemetry.jsonl`:

```json
{
  "ts": "2026-05-14T17:07:01Z",
  "vendor_id": "coinopai",
  "product_id": "kronos_signals",
  "amount_usd": 0.05,
  "affiliate_id": "af_your_id",
  "payment_type": "x402_pyrimid",
  "commission_est_usd": 0.0099,
  "status": "success",
  "tx_hash": "0x..."
}
```

---

## What's Not in v0

- Remote registry sync
- PartnerStack / Impact.com / Rewardful API integrations
- Web dashboard
- Multi-level commissions
- Server-side redirect tracking for links

---

## Part of the [ForgeMesh](https://github.com/forgemeshlabs/forgemesh) Ecosystem

Infrastructure for monetized agent ecosystems.

| Package | What | Install |
|---------|------|---------|
| **affiliate-router-mcp** | Vendor-neutral monetization routing (this package) | `npm i affiliate-router-mcp` |
| [coinopai-mcp](https://github.com/forgemeshlabs/coinopai-mcp) | Paid crypto intelligence via x402 | `npm i coinopai-mcp` |
| [coinopai-imagegen](https://github.com/forgemeshlabs/coinopai-imagegen) | Paid image generation service | — |

Each package works standalone. No shared dependency required.

---

## License

MIT — CoinOpAI

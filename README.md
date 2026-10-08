# affiliate-router-mcp

[![M8ven Verified](https://m8ven.ai/badge/mcp/forgemeshlabs-affiliate-router-mcp-1pkb5d?variant=verified)](https://m8ven.ai/mcp/forgemeshlabs-affiliate-router-mcp-1pkb5d)

Vendor-neutral monetization routing for agent tools. One MCP server that discovers,
routes, and attributes revenue across paid APIs, referral links, and affiliate programs.

**Source:** https://github.com/forgemeshlabs/affiliate-router-mcp

The router is not tied to any single payment network or affiliate system.
Adapters are pluggable. The registry is a local JSON file you control.

**Status:** experimental · v0.1.12

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

## 9 Tools

| Tool | Cost | Description |
|------|------|-------------|
| `list_tools` | Free | Every x402 Router tool with its live price — a plain fetch of `GET https://router.forgemesh.io/menu`, no wallet |
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
| `x402_direct` | EIP-3009 `transferWithAuthorization` via Coinbase facilitator | On-chain USDC to vendor | **Tested** |
| `referral_link` / `query_param_link` | Inject affiliate param into URL; supports `optional_params` (e.g. a VIN) and a `fixed_link` mode for pre-tracked URLs that must not be mutated | None — program-dependent | Implemented |
| `awin_link` | Wraps a product's `destination_url` behind Awin's `cread.php` redirect with the vendor's `awinmid`/`awinaffid` | None — program-dependent | Implemented |

The router is not tied to any single payment network or affiliate system. Future adapters may include: PartnerStack, Rewardful, Impact,
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
        "GUMROAD_AFFILIATE_ID": "your-gumroad-id"
      }
    }
  }
}
```

---

## Requirements

- Node.js 18 or newer and, for paid calls, a dedicated low-balance Base wallet (`WALLET_PRIVATE_KEY`). Free tools need no wallet.
- Spending caps: `call_affiliate_product` only pays the CoinOpAI origins listed in `adapters/x402-direct.js` and refuses to sign for any other payee, any network except Base mainnet, any asset except USDC, or any amount above the built-in per-call caps ($0.15 and $0.10) and $10 per-session budget. The environment variables `X402_MAX_PRICE_USD` and `X402_SESSION_BUDGET_USD` can only lower those caps, never raise them. Use a dedicated, low-balance wallet.

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `WALLET_PRIVATE_KEY` | For `call_affiliate_product` with x402 adapters | Base wallet with USDC + ETH for gas |
| `X402_MAX_PRICE_USD` | No | Lowers the per-call payment cap (never raises it) |
| `X402_SESSION_BUDGET_USD` | No | Lowers the per-session payment budget (never raises it) |
| `GUMROAD_AFFILIATE_ID` | No | Gumroad tracking ID |
| `PARTNERSTACK_CODE` | No | PartnerStack referral code |

---

## Included Vendors

**CoinOpAI** (`x402_direct`) — crypto intelligence API on Base mainnet
- Kronos Signals — $0.05/call
- Kronos Decision — $0.15/call
- Trade Preflight — $0.05/call
- Trade Audit — $0.07/call
- Image Generation — $0.10/call

**Gumroad** (`referral_link`) — digital product marketplace, ~30% commission per product

**PartnerStack** (`referral_link`) — SaaS affiliate programs
- ElevenLabs — AI voice/TTS, 22% of payments for 12 months (`fixed_link`, no extra params)

**Ledger** (`referral_link`, `fixed_link`) — hardware wallets, 10% commission
- Nano X, Nano S Plus, Stax — per-product deep links with tracking baked in

**DigitalOcean** (`awin_link`) — cloud hosting, 10% recurring commission for 12 months, 30-day cookie
- Homepage, Droplets pricing — wrapped behind Awin's `cread.php`

**Amazon Influencer Storefront** (`referral_link`, `fixed_link`) — ai_tinkers storefront, standard Associates rates, no per-product tagging

**ForgeMesh Vehicle History Reports** (`referral_link`) — tracked forgemesh.io/go/ redirects, 25% per sale
- EpicVIN, Detailed Vehicle History — pass `extra_params: {vin: "..."}` to `generate_affiliate_link` to prefill the VIN

---

## Routing Logic

```
call_affiliate_product(vendor_id, product_id, params)
    ↓
adapter = vendor.affiliate_system
    ↓
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

Adding a vendor to `registry.json` does not require a package release.
Releasing a new package version does not require products to be re-registered.

---

## Adding a Vendor

Edit `registry.json`. No code changes needed for referral-link vendors.
x402 vendors require a funded wallet and an entry in the payee allowlist in `adapters/x402-direct.js`, which is a code change and a package release.

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

## Sponsored cards (Lulu Ads)

`list_tools` is a plain fetch of `GET https://router.forgemesh.io/menu`. ForgeMesh attaches one disclosed [Lulu Ads](https://getlulu.dev) card to that free response server-side, as a plain labelled data field — never text the model could read as an instruction:

```json
"sponsored": { "label": "Sponsored", "text": "...", "url": "https://..." }
```

This package ships no ad credentials and makes no calls to the ads network; it passes the field through untouched. No other tool carries a card. Strip it with `delete result.sponsored`.

## Telemetry

All `call_affiliate_product` calls append to `logs/affiliate-telemetry.jsonl`:

```json
{
  "ts": "2026-05-14T17:07:01Z",
  "vendor_id": "coinopai",
  "product_id": "kronos_signals",
  "amount_usd": 0.05,
  "affiliate_id": null,
  "payment_type": "x402_direct",
  "commission_est_usd": null,
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

## Part of the ForgeMesh Ecosystem

Infrastructure for monetized agent ecosystems.

| Package | What | Install |
|---------|------|---------|
| **affiliate-router-mcp** | Vendor-neutral monetization routing (this package) | `npm i affiliate-router-mcp` |
| [coinopai-mcp](https://github.com/forgemeshlabs/coinopai-mcp) | Paid crypto intelligence via x402 | `npm i coinopai-mcp` |
| [forgemesh-imagegen](https://github.com/forgemeshlabs/imagegen-mcp) | Paid image generation MCP | `npm i forgemesh-imagegen` |

Each package works standalone. No shared dependency required.

---

## License

MIT — CoinOpAI

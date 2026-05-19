# Affiliate Router Architecture

This repository contains a local MCP server for routing monetized agent calls.
It exposes discovery, link generation, route selection, paid product calls, and
local telemetry for attribution review.

## Public Components

- MCP stdio server entrypoint: `index.js`
- Vendor catalog: `registry.json`
- Payment and referral adapters: `adapters/`
- Local affiliate validation cache: `affiliate-cache.js`
- Local telemetry writer: `telemetry.js`

The registry is intentionally local. The server does not accept arbitrary vendor
URLs from tool callers; paid calls resolve against registered products only.

## Adapter Model

Adapters implement a small routing contract:

- `x402_pyrimid` for products that support affiliate-aware x402 settlement
- `x402_direct` for standard x402 calls without affiliate split routing
- `referral_link` for program-specific tracked links

Tool callers provide an intent, vendor/product id, params, and optionally an
affiliate id. The server selects the registered route and returns the vendor
response with attribution metadata.

## Security Boundary

- Wallet keys and affiliate ids come from local environment variables.
- Secrets are never stored in `registry.json`.
- Paid calls are restricted to endpoints declared in the registry.
- Telemetry is local JSONL and should not be committed.

## Operational Notes

Package releases cover server code and adapter behavior. Product and catalog
changes are registry updates and do not require a package release unless the
adapter contract changes.

Keep implementation details about settlement contracts, internal telemetry
formats, and production rollout state out of public docs.

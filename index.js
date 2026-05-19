#!/usr/bin/env node
"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

const registry = require("./registry.json");
const telemetry = require("./telemetry");
const affiliateCache = require("./affiliate-cache");
const pyrimidAdapter = require("./adapters/x402-pyrimid");
const directAdapter = require("./adapters/x402-direct");
const linkAdapter = require("./adapters/referral-link");

// ── Registry helpers ──────────────────────────────────────────────────────────

function allVendors() {
  return Object.values(registry.vendors);
}

function allProducts() {
  const out = [];
  for (const vendor of allVendors()) {
    for (const product of vendor.products || []) {
      out.push({ vendor_id: vendor.id, vendor_name: vendor.name, ...product });
    }
  }
  return out;
}

function findVendor(id) {
  const v = registry.vendors[id];
  if (!v) throw new Error(`Vendor not found: ${id}`);
  return v;
}

function findProduct(vendorId, productId) {
  const vendor = findVendor(vendorId);
  const product = (vendor.products || []).find(p => p.id === productId);
  if (!product) throw new Error(`Product not found: ${vendorId}/${productId}`);
  return { vendor, product };
}

function resolveAffiliateId(vendor, toolArgAffiliate) {
  if (toolArgAffiliate) return toolArgAffiliate;
  const envKey = vendor.affiliate_config?.affiliate_id_env;
  if (envKey && process.env[envKey]) return process.env[envKey];
  return null;
}

function commissionFromBps(bps) { return bps ? (bps / 100).toFixed(1) + "%" : null; }
function commissionEst(priceUsd, bps) { return bps ? (priceUsd * bps / 10000) : null; }

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_opportunities",
    description: "Search affiliate opportunities by keyword or category. Returns matching vendors and products with commission info. Free — no payment required.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword to search (e.g. 'crypto', 'image generation', 'saas tools')" },
        category: { type: "string", description: "Filter by category (e.g. 'crypto', 'ai', 'tools')" }
      }
    }
  },
  {
    name: "list_affiliate_programs",
    description: "List all registered affiliate programs with commission rates, affiliate system type, and status. Free.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_opportunity_details",
    description: "Get full details for a vendor and optionally a specific product — endpoint, pricing, commission, params. Free.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: { type: "string", description: "Vendor ID from list_affiliate_programs (e.g. 'coinopai')" },
        product_id: { type: "string", description: "Optional product ID within the vendor" }
      },
      required: ["vendor_id"]
    }
  },
  {
    name: "get_best_route",
    description: "Given a natural language intent, find the best matching affiliate opportunity ranked by relevance, trust, and commission. Free.",
    inputSchema: {
      type: "object",
      properties: {
        intent: { type: "string", description: "What you're trying to accomplish (e.g. 'get a crypto trading signal for BTC')" }
      },
      required: ["intent"]
    }
  },
  {
    name: "generate_affiliate_link",
    description: "Generate a tracked affiliate link for a referral-link or query-param-link vendor. No payment required.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: { type: "string", description: "Vendor ID (must be a link-based affiliate, not x402)" },
        product_id: { type: "string", description: "Product ID within the vendor" },
        affiliate_id: { type: "string", description: "Override affiliate ID (env var used if omitted)" }
      },
      required: ["vendor_id", "product_id"]
    }
  },
  {
    name: "call_affiliate_product",
    description: "Call a paid x402 API product with automatic affiliate attribution. Handles full payment (USDC on Base). Pyrimid affiliate routing used when eligible; falls back to direct x402 if affiliate_id is invalid. Costs USDC per call — amount shown in get_opportunity_details.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: { type: "string", description: "Vendor ID (must be an x402 vendor, e.g. 'coinopai')" },
        product_id: { type: "string", description: "Product ID to call" },
        params: {
          type: "object",
          description: "Query parameters for the endpoint (e.g. {symbol: 'BTC'} for kronos_decision)"
        },
        affiliate_id: { type: "string", description: "Override affiliate ID. If omitted, uses PYRIMID_AFFILIATE_ID env var or no attribution." }
      },
      required: ["vendor_id", "product_id"]
    }
  },
  {
    name: "estimate_commission",
    description: "Estimate affiliate commission for a product based on known rates. Returns per-call and monthly estimates. Free.",
    inputSchema: {
      type: "object",
      properties: {
        vendor_id: { type: "string", description: "Vendor ID" },
        product_id: { type: "string", description: "Product ID" },
        calls_per_month: { type: "number", description: "Estimated monthly call volume (default 100)" }
      },
      required: ["vendor_id", "product_id"]
    }
  },
  {
    name: "get_affiliate_telemetry",
    description: "Read local affiliate telemetry log — timestamps, vendors, products, amounts, affiliate IDs, statuses. Free.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max entries to return (default 20)" },
        vendor_id: { type: "string", description: "Filter by vendor" },
        affiliate_id: { type: "string", description: "Filter by affiliate ID" }
      }
    }
  }
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

function handleSearchOpportunities({ query, category }) {
  const kw = (query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const catFilter = (category || "").toLowerCase();

  const results = [];
  for (const vendor of allVendors()) {
    const vendorText = [vendor.name, vendor.description, ...(vendor.categories || [])].join(" ").toLowerCase();
    const catMatch = !catFilter || (vendor.categories || []).some(c => c.includes(catFilter));
    const kwMatch = !kw.length || kw.some(k => vendorText.includes(k));
    if (!catMatch && !kwMatch) continue;

    const matchedProducts = (vendor.products || []).filter(p => {
      const pt = [p.name, p.description].join(" ").toLowerCase();
      return !kw.length || kw.some(k => pt.includes(k) || vendorText.includes(k));
    });

    results.push({
      vendor_id: vendor.id,
      vendor_name: vendor.name,
      affiliate_system: vendor.affiliate_system,
      commission: commissionFromBps(vendor.affiliate_config?.commission_bps) || vendor.affiliate_config?.commission_pct + "%" || "varies",
      trust_score: vendor.trust_score,
      matched_products: matchedProducts.map(p => ({
        product_id: p.id,
        name: p.name,
        price_usd: p.price_usd,
        affiliate_eligible: p.affiliate_eligible,
      })),
    });
  }

  return { count: results.length, results, disclosure: "Results may include affiliate-attributed products." };
}

function handleListPrograms() {
  return {
    programs: allVendors().map(v => ({
      vendor_id: v.id,
      name: v.name,
      affiliate_system: v.affiliate_system,
      commission: commissionFromBps(v.affiliate_config?.commission_bps) || v.affiliate_config?.commission_pct ? v.affiliate_config.commission_pct + "%" : "varies",
      commission_note: v.affiliate_config?.commission_note || null,
      trust_score: v.trust_score,
      product_count: (v.products || []).length,
      affiliate_id_env: v.affiliate_config?.affiliate_id_env || null,
      configured: !!(v.affiliate_config?.affiliate_id_env && process.env[v.affiliate_config.affiliate_id_env]),
    })),
    disclosure: "Recommendations from this router may include affiliate attribution."
  };
}

function handleGetDetails({ vendor_id, product_id }) {
  const vendor = findVendor(vendor_id);
  if (product_id) {
    const product = (vendor.products || []).find(p => p.id === product_id);
    if (!product) throw new Error(`Product not found: ${product_id}`);
    return {
      vendor: { id: vendor.id, name: vendor.name, affiliate_system: vendor.affiliate_system },
      product,
      commission: commissionFromBps(vendor.affiliate_config?.commission_bps),
      commission_est_usd: commissionEst(product.price_usd, vendor.affiliate_config?.commission_bps),
      affiliate_id_configured: !!(vendor.affiliate_config?.affiliate_id_env && process.env[vendor.affiliate_config.affiliate_id_env]),
    };
  }
  return {
    vendor,
    product_count: (vendor.products || []).length,
    affiliate_id_configured: !!(vendor.affiliate_config?.affiliate_id_env && process.env[vendor.affiliate_config.affiliate_id_env]),
  };
}

function handleGetBestRoute({ intent }) {
  const tokens = intent.toLowerCase().split(/\s+/);
  const scored = [];

  for (const vendor of allVendors()) {
    for (const product of vendor.products || []) {
      const text = [vendor.name, vendor.description, product.name, product.description, ...(vendor.categories || [])].join(" ").toLowerCase();
      const relevance = tokens.filter(t => text.includes(t)).length;
      if (relevance === 0) continue;

      scored.push({
        vendor_id: vendor.id,
        vendor_name: vendor.name,
        product_id: product.id,
        product_name: product.name,
        description: product.description,
        price_usd: product.price_usd,
        affiliate_eligible: product.affiliate_eligible,
        affiliate_system: vendor.affiliate_system,
        commission_pct: vendor.affiliate_config?.commission_bps ? vendor.affiliate_config.commission_bps / 100 : null,
        trust_score: vendor.trust_score,
        _relevance: relevance,
      });
    }
  }

  // Rank: relevance desc → trust desc → commission desc
  scored.sort((a, b) =>
    b._relevance - a._relevance ||
    b.trust_score - a.trust_score ||
    (b.commission_pct || 0) - (a.commission_pct || 0)
  );

  const results = scored.slice(0, 5).map(({ _relevance, ...rest }) => rest);
  return { intent, top_results: results, total_matched: scored.length };
}

function handleGenerateLink({ vendor_id, product_id, affiliate_id }) {
  const { vendor, product } = findProduct(vendor_id, product_id);
  const system = vendor.affiliate_system;

  if (system === "x402_pyrimid" || system === "x402_direct") {
    throw new Error(`${vendor_id} is an x402 vendor — use call_affiliate_product instead, not generate_affiliate_link`);
  }

  const affId = resolveAffiliateId(vendor, affiliate_id);
  return linkAdapter.generateLink(product, vendor.affiliate_config, affId);
}

async function handleCallProduct({ vendor_id, product_id, params, affiliate_id }) {
  const { vendor, product } = findProduct(vendor_id, product_id);

  if (vendor.affiliate_system !== "x402_pyrimid" && vendor.affiliate_system !== "x402_direct") {
    throw new Error(`${vendor_id} is a link affiliate — use generate_affiliate_link instead`);
  }

  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey) throw new Error("WALLET_PRIVATE_KEY required — set a Base wallet private key funded with USDC");

  const affId = resolveAffiliateId(vendor, affiliate_id);
  const canUsePyrimid = vendor.affiliate_system === "x402_pyrimid" && product.pyrimid_product_id && product.affiliate_eligible;

  let result;
  if (canUsePyrimid && affId) {
    result = await pyrimidAdapter.callWithFallback(product, params || {}, affId, vendor.affiliate_config, privateKey);
  } else {
    result = await directAdapter.call(product, params || {}, privateKey);
    result.affiliate_used = false;
  }

  const commEst = result.affiliate_used ? commissionEst(product.price_usd, vendor.affiliate_config?.commission_bps) : null;

  telemetry.log({
    vendor_id: vendor.id,
    product_id: product.id,
    endpoint: product.endpoint,
    amount_usd: product.price_usd,
    affiliate_id: result.affiliate_used ? affId : null,
    payment_type: result.payment_type,
    commission_est_usd: commEst,
    status: "success",
    tx_hash: result.tx_hash || null,
    fallback_reason: result.fallback_reason || null,
  });

  return {
    data: result.data,
    meta: {
      vendor: vendor.id,
      product: product.id,
      amount_paid_usd: product.price_usd,
      payment_type: result.payment_type,
      affiliate_id: result.affiliate_used ? affId : null,
      commission_est_usd: commEst,
      tx_hash: result.tx_hash || null,
    },
  };
}

function handleEstimateCommission({ vendor_id, product_id, calls_per_month = 100 }) {
  const { vendor, product } = findProduct(vendor_id, product_id);
  const bps = vendor.affiliate_config?.commission_bps;
  const pct = vendor.affiliate_config?.commission_pct;

  if (!bps && !pct) {
    return {
      vendor_id, product_id,
      commission: "unknown — check vendor program directly",
      affiliate_system: vendor.affiliate_system,
    };
  }

  if (bps) {
    const per_call = product.price_usd * bps / 10000;
    return {
      vendor_id, product_id,
      commission_pct: bps / 100,
      per_call_usd: per_call,
      monthly_estimate_usd: per_call * calls_per_month,
      calls_per_month,
      note: "Commission is taken from within the listed price — no extra cost to buyers.",
    };
  }

  return {
    vendor_id, product_id,
    commission_pct: pct,
    note: vendor.affiliate_config?.commission_note || "Paid per conversion — amount varies by product.",
  };
}

function handleGetTelemetry({ limit = 20, vendor_id, affiliate_id }) {
  const entries = telemetry.read(limit, { vendor_id, affiliate_id });
  const totalRevenue = entries.reduce((s, e) => s + (e.amount_usd || 0), 0);
  const totalCommission = entries.reduce((s, e) => s + (e.commission_est_usd || 0), 0);
  return {
    entries,
    count: entries.length,
    summary: {
      total_spend_usd: +totalRevenue.toFixed(4),
      total_commission_est_usd: +totalCommission.toFixed(4),
      affiliate_calls: entries.filter(e => e.affiliate_id).length,
      direct_calls: entries.filter(e => !e.affiliate_id).length,
    },
    cache_status: affiliateCache.getAll(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const server = new Server(
    { name: "affiliate-router-mcp", version: "0.1.6" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      let result;
      switch (name) {
        case "search_opportunities":    result = handleSearchOpportunities(args); break;
        case "list_affiliate_programs": result = handleListPrograms(); break;
        case "get_opportunity_details": result = handleGetDetails(args); break;
        case "get_best_route":          result = handleGetBestRoute(args); break;
        case "generate_affiliate_link": result = handleGenerateLink(args); break;
        case "call_affiliate_product":  result = await handleCallProduct(args); break;
        case "estimate_commission":     result = handleEstimateCommission(args); break;
        case "get_affiliate_telemetry": result = handleGetTelemetry(args); break;
        default: throw new Error("Unknown tool: " + name);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: "Error: " + e.message }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(e => {
  process.stderr.write("[affiliate-router] " + e.message + "\n");
  process.exit(1);
});

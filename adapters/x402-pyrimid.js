"use strict";

// Pyrimid affiliate adapter — full on-chain flow:
//   1. Probe endpoint with X-Affiliate-ID → get 402 challenge with PyrimidRouter as recipient
//   2. USDC.approve(PyrimidRouter, price)
//   3. PyrimidRouter.routePayment(vendorId, productId, affiliateIdBytes16, buyer, maxPrice)
//   4. Retry endpoint with X-Affiliate-ID + X-Payment: txhash → get 200 + data
//
// Falls back to x402-direct if routePayment fails — marks affiliate_id invalid in cache.

const { createPublicClient, createWalletClient, http, parseAbi } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { base } = require("viem/chains");
const affiliateCache = require("../affiliate-cache");
const directAdapter = require("./x402-direct");

const ROUTER_ABI = parseAbi([
  "function routePayment(bytes16 vendorId, uint256 productId, bytes16 affiliateId, address buyer, uint256 maxPrice) external",
]);
const USDC_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
]);

// Delay for Base RPC node state propagation
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function buildClients(privateKey) {
  const pk = privateKey.startsWith("0x") ? privateKey : "0x" + privateKey;
  const account = privateKeyToAccount(pk);
  const transport = http();
  return {
    account,
    publicClient: createPublicClient({ chain: base, transport }),
    walletClient: createWalletClient({ account, chain: base, transport }),
  };
}

function buildUrl(product, params) {
  const url = new URL(product.endpoint);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function call(product, params, affiliateId, vendorConfig, privateKey) {
  const { vendor_id, pyrimid_router, usdc_address } = vendorConfig;
  const { account, publicClient, walletClient } = buildClients(privateKey);
  const fullUrl = buildUrl(product, params);
  const price = BigInt(Math.round(product.price_usd * 1_000_000)); // USDC has 6 decimals
  const productId = BigInt(product.pyrimid_product_id);

  // Step 1: Probe with X-Affiliate-ID
  const probeRes = await fetch(fullUrl, { headers: { "X-Affiliate-ID": affiliateId } });
  if (probeRes.status !== 402) {
    // Not a Pyrimid endpoint — fall through to direct
    if (probeRes.ok) return { data: await probeRes.json(), payment_type: "x402_pyrimid_bypass", tx_hash: null };
    throw new Error(`Unexpected status ${probeRes.status} on probe`);
  }

  const paymentHeader = probeRes.headers.get("X-PAYMENT-REQUIRED");
  if (!paymentHeader) throw new Error("No X-PAYMENT-REQUIRED header — Pyrimid middleware not active");

  const challenge = JSON.parse(paymentHeader);
  if (challenge.recipient?.toLowerCase() !== pyrimid_router.toLowerCase()) {
    throw new Error(`Unexpected 402 recipient: ${challenge.recipient}. Pyrimid not routing this endpoint.`);
  }

  // Step 2: Approve USDC to router
  const approveHash = await walletClient.writeContract({
    address: usdc_address,
    abi: USDC_ABI,
    functionName: "approve",
    args: [pyrimid_router, price],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  await sleep(3000); // RPC propagation

  // Step 3: routePayment — affiliateIdBytes16 is zeroed (server uses X-Affiliate-ID header)
  const affiliateIdBytes16 = "0x00000000000000000000000000000000";
  const routeHash = await walletClient.writeContract({
    address: pyrimid_router,
    abi: ROUTER_ABI,
    functionName: "routePayment",
    args: [vendor_id, productId, affiliateIdBytes16, account.address, price],
  });
  await publicClient.waitForTransactionReceipt({ hash: routeHash });
  await sleep(3000); // block index propagation before server verifies

  // Step 4: Retry with payment proof
  const paidRes = await fetch(fullUrl, {
    headers: {
      "X-Affiliate-ID": affiliateId,
      "X-Payment": routeHash,
    },
  });

  if (!paidRes.ok) {
    const err = await paidRes.text().catch(() => paidRes.statusText);
    throw new Error(`Retry failed after routePayment: ${paidRes.status} ${err.slice(0, 200)}`);
  }

  return { data: await paidRes.json(), payment_type: "x402_pyrimid", tx_hash: routeHash };
}

// Routing entry point — handles cache check + fallback
async function callWithFallback(product, params, affiliateId, vendorConfig, privateKey) {
  const cacheStatus = affiliateCache.status(affiliateId);

  if (cacheStatus === "invalid") {
    // Known bad — go direct
    const result = await directAdapter.call(product, params, privateKey);
    return { ...result, affiliate_used: false, fallback_reason: "affiliate_id_cached_invalid" };
  }

  try {
    const result = await call(product, params, affiliateId, vendorConfig, privateKey);
    affiliateCache.markValid(affiliateId);
    return { ...result, affiliate_used: true };
  } catch (err) {
    // routePayment or network failure — mark invalid, retry direct
    affiliateCache.markInvalid(affiliateId, err.message);
    const result = await directAdapter.call(product, params, privateKey);
    return { ...result, affiliate_used: false, fallback_reason: err.message.slice(0, 100) };
  }
}

module.exports = { call, callWithFallback };

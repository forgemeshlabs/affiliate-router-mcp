"use strict";

// Standard x402 payment adapter — EIP-3009 transferWithAuthorization via Coinbase facilitator.
// Vendor receives 100% of the listed price. Every paid call goes through x402-guard: one guard per
// vendor origin, which pins the payee, the network (Base mainnet), the asset (USDC), a per-call price
// ceiling and a session budget. X402_MAX_PRICE_USD / X402_SESSION_BUDGET_USD can only lower the caps.

const { x402Client, x402HTTPClient } = require("@x402/core/client");
const { ExactEvmScheme } = require("@x402/evm/exact/client");
const { toClientEvmSigner } = require("@x402/evm");
const { privateKeyToAccount } = require("viem/accounts");
const { createGuard } = require("../x402-guard");

// Highest listed price per origin: kronos_decision $0.15 on x402.coinopai.com, imagegen $0.10 on imagegen.coinopai.com.
const GUARDS = {
  "https://x402.coinopai.com": createGuard({ baseUrl: "https://x402.coinopai.com", payTo: ["0x1304EC1A8945365e43A5c18a734065f107B417cA"], maxPriceUsd: 0.15, sessionBudgetUsd: 10 }),
  "https://imagegen.coinopai.com": createGuard({ baseUrl: "https://imagegen.coinopai.com", payTo: ["0x4C1a4FcE51Fea51f128a01ccE8BecB106d391155"], maxPriceUsd: 0.10, sessionBudgetUsd: 10 }),
};

const clients = new Map();
function clientFor(origin, guard, privateKey) {
  if (!clients.has(origin)) {
    const pk = privateKey.startsWith("0x") ? privateKey : "0x" + privateKey;
    const signer = toClientEvmSigner(privateKeyToAccount(pk));
    const core = new x402Client().register("eip155:*", new ExactEvmScheme(signer)).registerPolicy(guard.policy);
    clients.set(origin, new x402HTTPClient(core));
  }
  return clients.get(origin);
}

async function call(product, params, privateKey) {
  const url = new URL(product.endpoint);
  const guard = GUARDS[url.origin];
  if (!guard) throw new Error(`Refusing to pay ${url.origin}: not an allowlisted vendor origin`);
  const res = await guard.callPaid(clientFor(url.origin, guard, privateKey), url.pathname, { method: "GET", query: params });
  if (res && res._binary) throw new Error("Vendor returned a non-JSON response; not supported by this tool");
  const { _payment, ...data } = Array.isArray(res) ? { ...res } : res;
  return { data: Array.isArray(res) ? res : data, payment_type: "x402_direct", tx_hash: _payment?.transaction || null };
}

module.exports = { call };

"use strict";

// Standard x402 payment adapter — EIP-3009 transferWithAuthorization via Coinbase facilitator.
// No affiliate attribution. Vendor receives 100% of listed price.

const { x402Client, x402HTTPClient } = require("@x402/core/client");
const { ExactEvmScheme } = require("@x402/evm/exact/client");
const { toClientEvmSigner } = require("@x402/evm");
const { privateKeyToAccount } = require("viem/accounts");

function buildClient(privateKey) {
  const pk = privateKey.startsWith("0x") ? privateKey : "0x" + privateKey;
  const account = privateKeyToAccount(pk);
  const signer = toClientEvmSigner(account);
  const core = new x402Client().register("eip155:*", new ExactEvmScheme(signer));
  return new x402HTTPClient(core);
}

async function call(product, params, privateKey) {
  const httpClient = buildClient(privateKey);

  // Build URL from endpoint + params
  const url = new URL(product.endpoint);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const fullUrl = url.toString();

  const res = await fetch(fullUrl);
  if (res.status === 402) {
    let body;
    try { body = await res.clone().json(); } catch (_) {}
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => res.headers.get(name),
      body
    );
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const paidRes = await fetch(fullUrl, {
      headers: httpClient.encodePaymentSignatureHeader(paymentPayload),
    });
    if (!paidRes.ok) {
      const err = await paidRes.text().catch(() => paidRes.statusText);
      throw new Error(`x402 payment failed: ${paidRes.status} ${err.slice(0, 200)}`);
    }
    return { data: await paidRes.json(), payment_type: "x402_direct", tx_hash: null };
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
  }
  return { data: await res.json(), payment_type: "x402_direct", tx_hash: null };
}

module.exports = { call };

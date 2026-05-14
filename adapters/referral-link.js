"use strict";

// Referral link adapter — no payment, just URL manipulation.
// Injects affiliate tracking param or referral code into a landing URL.

function generateLink(product, affiliateConfig, affiliateId) {
  if (!product.landing_url) throw new Error(`Product ${product.id} has no landing_url`);

  const system = affiliateConfig.affiliate_system || "query_param_link";

  if (system === "query_param_link" || system === "referral_link") {
    const url = new URL(product.landing_url);
    const param = affiliateConfig.tracking_param || "ref";
    if (affiliateId) url.searchParams.set(param, affiliateId);
    return {
      url: url.toString(),
      affiliate_applied: !!affiliateId,
      tracking_param: param,
      disclosure: "This link may include affiliate attribution. The buyer pays the same price.",
    };
  }

  // Unknown system — return unmodified URL
  return {
    url: product.landing_url,
    affiliate_applied: false,
    disclosure: "Affiliate attribution not supported for this program type.",
  };
}

module.exports = { generateLink };

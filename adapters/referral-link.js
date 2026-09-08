"use strict";

// Referral link adapter — no payment, just URL manipulation.
//
// Supports three affiliate systems:
//   - query_param_link / referral_link — append a tracking param (and any
//     optional per-link params, e.g. a VIN) to a landing URL.
//   - awin_link — wrap a destination URL behind Awin's cread.php redirect
//     with the vendor's awinmid/awinaffid.
//   - fixed_link products (any system) — a complete, already-tracked URL
//     (e.g. a PartnerStack share link or a forgemesh.io/go/ redirect with a
//     bare ID) that must be returned unmodified.

function applyOptionalParams(url, product, extraParams) {
  const optional = product.optional_params || {};
  let applied = false;
  for (const [argName, queryParam] of Object.entries(optional)) {
    const val = extraParams && extraParams[argName];
    if (val) {
      url.searchParams.set(queryParam, val);
      applied = true;
    }
  }
  return applied;
}

function generateLink(product, affiliateConfig, affiliateId, extraParams) {
  if (!product.landing_url) throw new Error(`Product ${product.id} has no landing_url`);

  const disclosure =
    affiliateConfig.disclosure ||
    product.disclosure ||
    "This link may include affiliate attribution. The buyer pays the same price.";

  // A complete, already-tracked URL — never mutate it, but optional params
  // (e.g. ?vin=) may still be layered on top.
  if (product.fixed_link) {
    const url = new URL(product.landing_url);
    const optionalApplied = applyOptionalParams(url, product, extraParams);
    return { url: url.toString(), affiliate_applied: true, disclosure, optional_params_applied: optionalApplied };
  }

  const system = affiliateConfig.affiliate_system || "query_param_link";

  // Awin: wrap a destination URL behind cread.php with mid/affid.
  if (system === "awin_link") {
    const { awinmid, awinaffid } = affiliateConfig;
    if (!awinmid || !awinaffid) throw new Error("Vendor missing awinmid/awinaffid for awin_link");
    const dest = product.destination_url || product.landing_url;
    const url =
      `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(awinmid)}` +
      `&awinaffid=${encodeURIComponent(awinaffid)}&ued=${encodeURIComponent(dest)}`;
    return { url, affiliate_applied: true, disclosure };
  }

  if (system === "query_param_link" || system === "referral_link") {
    const url = new URL(product.landing_url);
    const param = affiliateConfig.tracking_param || "ref";
    if (affiliateId) url.searchParams.set(param, affiliateId);
    const optionalApplied = applyOptionalParams(url, product, extraParams);

    // Self-attributing links (no per-caller affiliate_id_env) are always
    // tracked — the landing_url itself carries our attribution, e.g. a
    // forgemesh.io/go/ redirect that resolves server-side.
    const selfAttributing = !affiliateConfig.affiliate_id_env;

    return {
      url: url.toString(),
      affiliate_applied: !!affiliateId || selfAttributing || optionalApplied,
      tracking_param: param,
      disclosure,
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

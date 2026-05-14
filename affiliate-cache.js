"use strict";

const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.join(__dirname, "cache", "affiliate-cache.json");

// In-memory state, loaded from file at startup
let cache = {};

function load() {
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    cache = {};
  }
}

function persist() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {}
}

function status(affiliateId) {
  // Returns: "valid" | "invalid" | "unknown"
  return cache[affiliateId]?.status || "unknown";
}

function markValid(affiliateId) {
  const existing = cache[affiliateId] || {};
  cache[affiliateId] = {
    status: "valid",
    first_seen: existing.first_seen || new Date().toISOString(),
    last_used: new Date().toISOString(),
    call_count: (existing.call_count || 0) + 1,
  };
  persist();
}

function markInvalid(affiliateId, reason) {
  cache[affiliateId] = {
    status: "invalid",
    first_seen: cache[affiliateId]?.first_seen || new Date().toISOString(),
    failure_reason: reason || "routePayment failed",
  };
  persist();
}

function getAll() {
  return cache;
}

// Load cache on require
load();

module.exports = { status, markValid, markInvalid, getAll };

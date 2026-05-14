"use strict";

const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "logs", "affiliate-telemetry.jsonl");

function log(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  fs.appendFile(LOG_FILE, line + "\n", () => {});
}

function read(limit = 50, filters = {}) {
  try {
    const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").filter(Boolean);
    let entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (filters.vendor_id) entries = entries.filter(e => e.vendor_id === filters.vendor_id);
    if (filters.affiliate_id) entries = entries.filter(e => e.affiliate_id === filters.affiliate_id);
    if (filters.product_id) entries = entries.filter(e => e.product_id === filters.product_id);
    return entries.slice(-limit);
  } catch {
    return [];
  }
}

module.exports = { log, read };

#!/usr/bin/env node
// Loads the invented demo dataset into the Airtable base (replaces whatever is in the 7 tables).
// This is the "nightly load" of the demo: run it again to reload.
//
//   AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=app... node tools/seed-airtable.js          (light: ~860 records, fits the free plan)
//   AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=app... node tools/seed-airtable.js --full   (~15,000 records, needs a paid plan)
//
// With --digikey the item catalog (part numbers, names, prices, manufacturers, lead times) comes from the
// Digi-Key Product Information API v4; stock, movements and purchase orders are still simulated around it:
//   DIGIKEY_CLIENT_ID=... DIGIKEY_CLIENT_SECRET=... AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=app... node tools/seed-airtable.js --digikey
// The Digi-Key credentials are used only by this script, never by the browser.
//
// The token needs the scopes data.records:read, data.records:write and schema.bases:read on this base.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const token = process.env.AIRTABLE_TOKEN;
const baseId = process.env.AIRTABLE_BASE_ID;
const apiUrl = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const full = process.argv.includes('--full');
const digikey = process.argv.includes('--digikey');
const dkApi = process.env.DIGIKEY_API_URL || 'https://api.digikey.com';
if (!token || !baseId) {
  console.error('Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID');
  process.exit(1);
}

// Load the same generator the demo source uses, so the Airtable data matches the demo data.
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ['src/core.js', 'src/sources/demo-source.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
}
const profile = full ? {} : { itemsPerCategory: 3, historyDays: 90 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function call(method, url, body, attempt = 0) {
  const wait = 260 - (Date.now() - last); // stay under 5 requests per second
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(res.status === 429 ? 30000 : 2000);
    return call(method, url, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`${method} ${url.split('?')[0]} -> HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function wipe(table) {
  const ids = [];
  let offset = '';
  do {
    const page = await call('GET', `${apiUrl}/${baseId}/${encodeURIComponent(table)}?pageSize=100${offset ? '&offset=' + offset : ''}`);
    ids.push(...page.records.map((r) => r.id));
    offset = page.offset || '';
  } while (offset);
  for (let i = 0; i < ids.length; i += 10) {
    const q = ids.slice(i, i + 10).map((id) => 'records[]=' + id).join('&');
    await call('DELETE', `${apiUrl}/${baseId}/${encodeURIComponent(table)}?${q}`);
  }
  return ids.length;
}

async function insert(table, rows) {
  for (let i = 0; i < rows.length; i += 10) {
    const records = rows.slice(i, i + 10).map((fields) => {
      const clean = {};
      for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined) clean[k] = v;
      return { fields: clean };
    });
    await call('POST', `${apiUrl}/${baseId}/${encodeURIComponent(table)}`, { records });
    if ((i / 10) % 20 === 19) process.stdout.write(`  ${table}: ${i + 10}/${rows.length}\n`);
  }
}

// ---- Digi-Key catalog ----
const DK_QUERIES = ['resistor', 'capacitor', 'microcontroller', 'connector', 'temperature sensor', 'power supply module', 'relay', 'LED'];
const PER_QUERY = 3;
const slug = (t) => String(t).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'UNKNOWN';

async function digikeyCatalog() {
  const id = process.env.DIGIKEY_CLIENT_ID, secret = process.env.DIGIKEY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing DIGIKEY_CLIENT_ID or DIGIKEY_CLIENT_SECRET');
  const tokRes = await fetch(dkApi + '/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
  });
  if (!tokRes.ok) throw new Error(`Digi-Key token request failed: HTTP ${tokRes.status} ${await tokRes.text()}`);
  const { access_token } = await tokRes.json();

  const items = [], sup = new Map(), seen = new Set();
  for (const q of DK_QUERIES) {
    const res = await fetch(dkApi + '/products/v4/search/keyword', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + access_token, 'X-DIGIKEY-Client-Id': id, 'Content-Type': 'application/json',
        'X-DIGIKEY-Locale-Site': 'US', 'X-DIGIKEY-Locale-Currency': 'USD',
      },
      body: JSON.stringify({ Keywords: q, Limit: 20, Offset: 0 }),
    });
    if (!res.ok) throw new Error(`Digi-Key search "${q}" failed: HTTP ${res.status} ${await res.text()}`);
    const products = (await res.json()).Products || [];
    let taken = 0;
    for (const p of products) {
      const variation = (p.ProductVariations || [])[0] || {};
      const sku = variation.DigiKeyProductNumber || p.DigiKeyProductNumber;
      const price = Number(p.UnitPrice ?? (variation.StandardPricing || [])[0]?.UnitPrice);
      if (!sku || seen.has(sku) || !(price > 0) || !(p.QuantityAvailable > 0)) continue;
      const mfr = (p.Manufacturer && p.Manufacturer.Name) || p.ManufacturerName || 'Unknown';
      const weeks = Number(p.ManufacturerLeadWeeks);
      const supplierId = 'MFR-' + slug(mfr);
      if (!sup.has(supplierId)) {
        sup.set(supplierId, { id: supplierId, name: mfr, lead: weeks > 0 ? Math.min(weeks * 7, 120) : 14, reliability: 0.75 + (sup.size % 5) * 0.05 });
      }
      const desc = (p.Description && (p.Description.ProductDescription || p.Description.DetailedDescription)) || p.ProductDescription || '';
      seen.add(sku);
      items.push({
        sku, name: [p.ManufacturerProductNumber, desc].filter(Boolean).join(' - ').slice(0, 90), category: (p.Category && p.Category.Name) || q,
        supplierId, unitCost: Math.round(price * 100) / 100,
      });
      if (++taken >= PER_QUERY) break;
    }
    console.log(`Digi-Key "${q}": ${taken} parts`);
    await sleep(500);
  }
  if (items.length < 8) throw new Error('Digi-Key returned too few usable parts: ' + items.length);
  return { realItems: items, suppliers: [...sup.values()] };
}

(async () => {
  const dk = digikey ? await digikeyCatalog() : null;
  const data = await sandbox.window.App.sources.demo(dk ? { ...dk, historyDays: 90 } : profile).load();
  const tables = {
    meta: [
      ['asOf', data.meta.asOf], ['historyStart', data.meta.historyStart], ['lastUpdated', new Date().toISOString()],
      ['label', digikey ? 'קטלוג Digi-Key' : data.meta.label], ['seed', String(data.meta.seed)], ['isDemo', digikey ? 'false' : 'true'], ['profile', digikey ? 'digikey' : full ? 'full' : 'light'],
      ...(digikey ? [['note', 'המק״טים, השמות, המחירים, היצרנים וזמני האספקה של היצרנים הם נתונים אמיתיים מ-Digi-Key. המלאי, התנועות וההזמנות מומצאים בסימולציה.']] : []),
    ].map(([key, value]) => ({ key, value })),
    warehouses: data.warehouses,
    suppliers: data.suppliers,
    items: data.items,
    stock: data.stock.map((s) => ({ key: s.sku + '|' + s.wh, ...s })),
    movements: data.movements,
    purchaseOrders: data.purchaseOrders,
  };
  const total = Object.values(tables).reduce((t, r) => t + r.length, 0);
  console.log(`Profile: ${digikey ? 'digikey' : full ? 'full' : 'light'}, ${total} records to load into base ${baseId}`);
  for (const [name, rows] of Object.entries(tables)) {
    const removed = await wipe(name);
    await insert(name, rows);
    console.log(`${name}: ${rows.length} loaded${removed ? ` (${removed} old records removed)` : ''}`);
  }
  console.log('Done.');
})().catch((e) => { console.error(e.message); process.exit(1); });

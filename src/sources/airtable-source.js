// Airtable data source: reads the dataset from an Airtable base through the REST API.
// Same contract as the demo source: load() -> Promise<Dataset>.
//
// Tables (names are fixed, see tools/seed-airtable.js): warehouses, suppliers, items, stock,
// movements, purchaseOrders, meta (key/value rows: asOf, historyStart, lastUpdated, label, seed, isDemo).
(function (App) {
  const API = 'https://api.airtable.com/v0';
  const PAGE_DELAY_MS = 230; // Airtable allows 5 requests per second per base

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function request(url, token, attempt = 0) {
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    } catch (e) {
      throw new Error('אין חיבור ל-Airtable (' + e.message + ')');
    }
    if (res.status === 429 && attempt < 3) {
      await sleep(30000); // Airtable asks to wait 30 seconds after exceeding the rate limit
      return request(url, token, attempt + 1);
    }
    if (res.status === 401 || res.status === 403) throw new Error('הטוקן לא תקין או שאין לו הרשאת קריאה ל-base (HTTP ' + res.status + ')');
    if (res.status === 404) throw new Error('ה-base או הטבלה לא נמצאו (HTTP 404). בדקו את מזהה ה-base');
    if (!res.ok) throw new Error('שגיאת Airtable (HTTP ' + res.status + ')');
    return res.json();
  }

  async function fetchTable({ baseId, token, apiUrl = API }, table) {
    const rows = [];
    let offset = '';
    do {
      const url = `${apiUrl}/${baseId}/${encodeURIComponent(table)}?pageSize=100${offset ? '&offset=' + encodeURIComponent(offset) : ''}`;
      const page = await request(url, token);
      for (const r of page.records) rows.push(r.fields);
      offset = page.offset || '';
      if (offset) await sleep(PAGE_DELAY_MS);
    } while (offset);
    return rows;
  }

  const num = (v) => (typeof v === 'number' ? v : 0);
  const byText = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]));

  function createAirtableSource({ baseId, token, apiUrl, onProgress } = {}) {
    return {
      id: 'airtable',
      async load() {
        if (!baseId) throw new Error('חסר מזהה base של Airtable (config.js)');
        if (!token) throw new Error('חסר טוקן של Airtable');
        const conn = { baseId, token, apiUrl };
        const names = ['meta', 'warehouses', 'suppliers', 'items', 'stock', 'movements', 'purchaseOrders'];
        const t = {};
        for (const name of names) {
          if (onProgress) onProgress(name);
          t[name] = await fetchTable(conn, name);
          await sleep(PAGE_DELAY_MS);
        }

        const m = {};
        for (const r of t.meta) m[r.key] = r.value;
        if (!m.asOf || !m.historyStart) throw new Error('טבלת meta חסרה או ריקה. יש להריץ את tools/seed-airtable.js');

        const items = t.items.map((r) => ({
          sku: r.sku, name: r.name, category: r.category, supplierId: r.supplierId, unitCost: num(r.unitCost),
        })).sort(byText('sku'));

        return {
          meta: {
            source: 'airtable',
            label: m.label || 'נתונים מ-Airtable',
            isDemo: m.isDemo !== 'false',
            note: m.note || '',
            seed: m.seed ? Number(m.seed) : null,
            asOf: m.asOf,
            historyStart: m.historyStart,
            lastUpdated: m.lastUpdated || new Date().toISOString(),
          },
          warehouses: t.warehouses.map((r) => ({ id: r.id, name: r.name, city: r.city, capacityUnits: num(r.capacityUnits) })).sort(byText('id')),
          categories: [...new Set(items.map((i) => i.category))],
          suppliers: t.suppliers.map((r) => ({ id: r.id, name: r.name, plannedLeadDays: num(r.plannedLeadDays) })).sort(byText('id')),
          items,
          stock: t.stock.map((r) => ({
            sku: r.sku, wh: r.wh, opening: num(r.opening), qty: num(r.qty), reorderPoint: num(r.reorderPoint), maxLevel: num(r.maxLevel),
          })),
          movements: t.movements.map((r) => ({
            id: r.id, date: r.date, sku: r.sku, wh: r.wh, type: r.type, qty: num(r.qty), ref: r.ref || '',
          })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id.slice(2)) - Number(b.id.slice(2)))),
          purchaseOrders: t.purchaseOrders.map((r) => ({
            id: r.id, sku: r.sku, wh: r.wh, supplierId: r.supplierId, qty: num(r.qty),
            orderDate: r.orderDate, expectedDate: r.expectedDate, receivedDate: r.receivedDate || null,
          })).sort(byText('id')),
        };
      },
    };
  }

  App.sources.airtable = createAirtableSource;
})(window.App);

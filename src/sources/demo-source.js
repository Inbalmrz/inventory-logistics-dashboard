// Demo data source: invented data from a seeded simulation. Nothing here describes a real business.
//
// Source contract (a future API/ERP/DWH adapter implements the same method):
//   load() -> Promise<Dataset>
// Dataset: { meta, warehouses, categories, suppliers, items, stock, movements, purchaseOrders }
(function (App) {
  function rngFrom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const WAREHOUSES = [
    { id: 'WH-N', name: 'מחסן צפון', city: 'חיפה', targetUtil: 0.92 },
    { id: 'WH-C', name: 'מחסן מרכז', city: 'פתח תקווה', targetUtil: 0.78 },
    { id: 'WH-S', name: 'מחסן דרום', city: 'באר שבע', targetUtil: 0.63 },
    { id: 'WH-J', name: 'מחסן ירושלים', city: 'ירושלים', targetUtil: 0.71 },
    { id: 'WH-P', name: 'מחסן נמל', city: 'אשדוד', targetUtil: 0.48 },
  ];

  const SUPPLIERS = [
    ['SUP-01', 'ספק הדגמה אורן', 0.97, 7],
    ['SUP-02', 'ספק הדגמה ברוש', 0.93, 10],
    ['SUP-03', 'ספק הדגמה גפן', 0.9, 14],
    ['SUP-04', 'ספק הדגמה דולב', 0.86, 12],
    ['SUP-05', 'ספק הדגמה הדס', 0.82, 18],
    ['SUP-06', 'ספק הדגמה ורד', 0.78, 9],
    ['SUP-07', 'ספק הדגמה זית', 0.7, 21],
    ['SUP-08', 'ספק הדגמה חצב', 0.62, 28],
    ['SUP-09', 'ספק הדגמה טיון', 0.95, 6],
    ['SUP-10', 'ספק הדגמה יסמין', 0.88, 16],
  ].map(([id, name, reliability, lead]) => ({ id, name, reliability, lead }));

  const CATALOG = [
    { name: 'אריזה', cost: [1, 18], items: ['קרטון אריזה', 'נייר בועות', 'סרט הדבקה', 'משטח עץ', 'שקית ניילון'], specs: ['קטן', 'בינוני', 'גדול'] },
    { name: 'חומרי גלם', cost: [12, 160], items: ['גליל פלדה', 'יריעת אלומיניום', 'גרגירי פוליפרופילן', 'צינור נחושת'], specs: ['סוג א', 'סוג ב', 'סוג ג', 'סוג ד'] },
    { name: 'אלקטרוניקה', cost: [25, 900], items: ['ספק כוח', 'בקר תעשייתי', 'חיישן טמפרטורה', 'כבל תקשורת', 'לוח חשמל'], specs: ['דגם 100', 'דגם 200', 'דגם 300'] },
    { name: 'כלי עבודה', cost: [40, 700], items: ['מקדחה', 'מפתח רטיטה', 'משחזת זווית', 'ערכת ביטים'], specs: ['סדרה A', 'סדרה B', 'סדרה C'] },
    { name: 'ציוד בטיחות', cost: [8, 120], items: ['כפפות עבודה', 'קסדת מגן', 'אפוד זוהר', 'משקפי מגן', 'נעלי בטיחות'], specs: ['מידה M', 'מידה L', 'מידה XL'] },
    { name: 'חומרי ניקוי', cost: [6, 70], items: ['נוזל ניקוי', 'מסיר שומנים', 'חומר חיטוי'], specs: ['1 ליטר', '5 ליטר', '20 ליטר'] },
    { name: 'חלקי חילוף', cost: [15, 480], items: ['מיסב', 'רצועת הינע', 'מסנן שמן', 'אטם גומי'], specs: ['מק״ט 10', 'מק״ט 20', 'מק״ט 30', 'מק״ט 40'] },
    { name: 'ציוד משרדי', cost: [3, 60], items: ['נייר צילום', 'טונר', 'קלסר'], specs: ['חבילה קטנה', 'חבילה גדולה'] },
  ];

  const HISTORY_DAYS = 365;

  function buildDataset(seed, asOf, opts = {}) {
    const historyDays = opts.historyDays || HISTORY_DAYS;
    const perCat = opts.itemsPerCategory || Infinity;
    // opts.realItems / opts.suppliers: a real catalog (e.g. from Digi-Key) replaces the invented one;
    // stock, movements and purchase orders are still simulated around it.
    const SUPS = opts.suppliers || SUPPLIERS;
    const rng = rngFrom(seed);
    const rand = (a, b) => a + rng() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const asOfDay = App.dayNum(asOf);
    const startDay = asOfDay - historyDays + 1;

    const items = opts.realItems ? opts.realItems.map((i) => ({ ...i })) : [];
    let skuNo = 1001;
    (opts.realItems ? [] : CATALOG).forEach((cat, c) => {
      const pool = [SUPS[c % SUPS.length], SUPS[(c + 3) % SUPS.length], SUPS[(c + 7) % SUPS.length]];
      let made = 0;
      for (const base of cat.items) {
        for (const spec of cat.specs) {
          if (made++ >= perCat) break;
          const supplier = pool[randInt(0, 2)];
          items.push({
            sku: 'SKU-' + skuNo++,
            name: base + ' ' + spec,
            category: cat.name,
            supplierId: supplier.id,
            unitCost: Math.round(rand(cat.cost[0], cat.cost[1]) * 100) / 100,
          });
        }
      }
    });

    // One simulation record per item+warehouse pair.
    const pairs = [];
    for (const item of items) {
      const supplier = SUPS.find((s) => s.id === item.supplierId);
      const shuffled = WAREHOUSES.slice().sort(() => rng() - 0.5);
      for (const wh of shuffled.slice(0, randInt(1, 4))) {
        const pOut = rand(0.08, 0.3);
        const meanQty = rand(2, 40);
        const daily = (meanQty * pOut * 6) / 7;
        const rop = Math.max(5, Math.ceil(daily * (supplier.lead + 21)));
        const max = rop + Math.max(10, Math.ceil(daily * 90));
        const roll = rng();
        const profile = roll < 0.7 ? 'normal' : roll < 0.8 ? 'shortage' : roll < 0.9 ? 'excess' : 'dead';
        let qty = randInt(rop, max);
        if (profile === 'excess') qty = Math.ceil(daily * 0.25 * 365 + max * rand(1.3, 2.2));
        if (profile === 'dead') qty = Math.ceil(daily * 175) + randInt(rop, max);
        pairs.push({
          item, supplier, wh, profile, rop, max, meanQty, opening: qty, qty, onOrder: 0, pending: [],
          pOut: profile === 'excess' ? pOut * 0.25 : pOut,
          stopOutDay: profile === 'dead' ? asOfDay - randInt(190, 320) : Infinity,
        });
      }
    }

    const movements = [];
    const purchaseOrders = [];
    let moveNo = 1, poNo = 100001, soNo = 50001;
    const addMove = (day, p, type, qty, ref) =>
      movements.push({ id: 'M-' + moveNo++, date: App.dayStr(day), sku: p.item.sku, wh: p.wh.id, type, qty, ref });

    for (let day = startDay; day <= asOfDay; day++) {
      const isSaturday = new Date(day * 86400000).getUTCDay() === 6;
      const season = 1 + 0.25 * Math.sin(((day - startDay) / historyDays) * 2 * Math.PI);
      for (const p of pairs) {
        for (let i = p.pending.length - 1; i >= 0; i--) {
          const { po, receiveDay } = p.pending[i];
          if (receiveDay === day) {
            p.qty += po.qty;
            p.onOrder -= po.qty;
            po.receivedDate = App.dayStr(day);
            addMove(day, p, 'IN', po.qty, po.id);
            p.pending.splice(i, 1);
          }
        }

        if (!isSaturday && day < p.stopOutDay && rng() < p.pOut) {
          const spike = rng() < 0.012 ? rand(6, 12) : 1;
          const want = Math.max(1, Math.round(p.meanQty * rand(0.5, 1.5) * season * spike));
          const q = Math.min(want, p.qty);
          if (q > 0) {
            p.qty -= q;
            addMove(day, p, 'OUT', q, 'SO-' + soNo++);
          }
        }

        if (rng() < 0.0006 && p.qty > 20) {
          const q = Math.round(p.qty * rand(0.01, 0.05)) * (rng() < 0.7 ? -1 : 1);
          if (q !== 0) {
            p.qty += q;
            addMove(day, p, 'ADJ', q, 'ספירת מלאי');
          }
        }

        const canReorder = p.profile !== 'dead' && p.profile !== 'excess';
        if (canReorder && p.qty + p.onOrder <= p.rop) {
          const lead = Math.max(2, p.supplier.lead + randInt(-2, 2));
          const expected = day + lead;
          const stuck = p.profile === 'shortage' && day > asOfDay - 60;
          const delay = stuck ? randInt(40, 90) : rng() < p.supplier.reliability ? -randInt(0, 2) : randInt(1, 12);
          const qty = Math.max(1, p.max - p.qty - p.onOrder);
          const po = {
            id: 'PO-' + poNo++, sku: p.item.sku, wh: p.wh.id, supplierId: p.supplier.id, qty,
            orderDate: App.dayStr(day), expectedDate: App.dayStr(expected), receivedDate: null,
          };
          purchaseOrders.push(po);
          p.onOrder += qty;
          p.pending.push({ po, receiveDay: Math.max(day + 1, expected + delay) });
        }
      }
    }

    const stock = pairs.map((p) => ({
      sku: p.item.sku, wh: p.wh.id, opening: p.opening, qty: p.qty, reorderPoint: p.rop, maxLevel: p.max,
    }));

    const unitsByWh = App.groupBy(stock, (s) => s.wh);
    const warehouses = WAREHOUSES.map((w) => {
      const units = App.sum(unitsByWh.get(w.id) || [], (s) => s.qty);
      return { id: w.id, name: w.name, city: w.city, capacityUnits: Math.ceil(units / w.targetUtil / 100) * 100 };
    });

    return {
      meta: {
        source: 'demo', label: 'נתוני הדגמה שהומצאו', isDemo: true, seed, asOf,
        historyStart: App.dayStr(startDay), lastUpdated: new Date().toISOString(),
      },
      warehouses,
      categories: opts.realItems ? [...new Set(items.map((i) => i.category))] : CATALOG.map((c) => c.name),
      suppliers: SUPS.map((s) => ({ id: s.id, name: s.name, plannedLeadDays: s.lead })),
      items, stock, movements, purchaseOrders,
    };
  }

  function createDemoSource({ seed = 20261105, asOf = App.todayStr(), ...opts } = {}) {
    return {
      id: 'demo',
      load: () => Promise.resolve(buildDataset(seed, asOf, opts)),
    };
  }

  App.sources.demo = createDemoSource;
})(window.App);

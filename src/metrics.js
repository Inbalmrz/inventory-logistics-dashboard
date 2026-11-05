// Calculation layer: derives every measure from the source dataset. No UI and no forecasts here.
(function (App) {
  const cfg = App.config;

  function buildModel(data) {
    const asOfDay = App.dayNum(data.meta.asOf);
    const itemBySku = new Map(data.items.map((i) => [i.sku, i]));
    const supplierById = new Map(data.suppliers.map((s) => [s.id, s]));
    const whById = new Map(data.warehouses.map((w) => [w.id, w]));
    const key = (sku, wh) => sku + '|' + wh;

    const anomalyIds = findAnomalies(data.movements);
    const movements = data.movements.map((m) => {
      const item = itemBySku.get(m.sku);
      return {
        ...m,
        name: item.name, category: item.category, supplierId: item.supplierId,
        supplier: supplierById.get(item.supplierId).name,
        whName: whById.get(m.wh).name,
        value: Math.abs(m.qty) * item.unitCost,
        anomaly: anomalyIds.has(m.id),
      };
    });

    const byPair = App.groupBy(movements, (m) => key(m.sku, m.wh));

    const pos = data.purchaseOrders.map((p) => {
      const item = itemBySku.get(p.sku);
      const received = !!p.receivedDate;
      const expectedDay = App.dayNum(p.expectedDate);
      const status = received ? 'received' : expectedDay < asOfDay ? 'late' : 'open';
      const endDay = received ? App.dayNum(p.receivedDate) : asOfDay;
      return {
        ...p,
        name: item.name, category: item.category,
        supplier: supplierById.get(p.supplierId).name,
        whName: whById.get(p.wh).name,
        value: p.qty * item.unitCost,
        status,
        daysLate: Math.max(0, endDay - expectedDay),
        leadDays: received ? App.dayNum(p.receivedDate) - App.dayNum(p.orderDate) : null,
        onTime: received ? App.dayNum(p.receivedDate) <= expectedDay : null,
      };
    });
    const openByPair = App.groupBy(pos.filter((p) => !p.receivedDate), (p) => key(p.sku, p.wh));

    const stock = data.stock.map((s) => {
      const item = itemBySku.get(s.sku);
      const moves = byPair.get(key(s.sku, s.wh)) || [];
      const outs = moves.filter((m) => m.type === 'OUT');
      const lastOut = outs.reduce((d, m) => (m.date > d ? m.date : d), '');
      const lastIn = moves.reduce((d, m) => (m.type === 'IN' && m.date > d ? m.date : d), '');
      const windowStart = asOfDay - cfg.usageWindowDays + 1;
      const usage = App.sum(outs.filter((m) => App.dayNum(m.date) >= windowStart), (m) => m.qty);
      const daysNoOut = lastOut ? asOfDay - App.dayNum(lastOut) : asOfDay - App.dayNum(data.meta.historyStart) + 1;
      const status = s.qty <= 0 ? 'out' : s.qty <= s.reorderPoint ? 'low' : s.qty > s.maxLevel ? 'excess' : 'ok';
      const excessQty = Math.max(0, s.qty - s.maxLevel);
      const open = openByPair.get(key(s.sku, s.wh)) || [];
      return {
        sku: s.sku, wh: s.wh, name: item.name, category: item.category, supplierId: item.supplierId,
        supplier: supplierById.get(item.supplierId).name,
        plannedLeadDays: supplierById.get(item.supplierId).plannedLeadDays,
        whName: whById.get(s.wh).name,
        qty: s.qty, opening: s.opening, unitCost: item.unitCost, value: s.qty * item.unitCost,
        reorderPoint: s.reorderPoint, maxLevel: s.maxLevel, status,
        excessQty, excessValue: excessQty * item.unitCost,
        lastOut: lastOut || null, lastIn: lastIn || null, daysNoOut,
        dead: s.qty > 0 && daysNoOut >= cfg.deadStockDays,
        avgDailyOut: usage / cfg.usageWindowDays,
        openQty: App.sum(open, (p) => p.qty),
        nextArrival: open.reduce((d, p) => (!d || p.expectedDate < d ? p.expectedDate : d), null),
        ageBuckets: stockAge(s.qty, moves, asOfDay),
      };
    });

    const model = { data, asOfDay, stock, movements, pos, whById, supplierById };
    App.forecast.apply(model);
    return model;
  }

  // FIFO: units on hand are assumed to come from the most recent receipts; the rest from opening stock.
  function stockAge(qty, moves, asOfDay) {
    const buckets = cfg.ageBuckets.map(() => 0);
    const place = (units, age) => {
      const i = cfg.ageBuckets.findIndex((b) => age <= b.max);
      buckets[i] += units;
    };
    let left = Math.max(0, qty);
    const receipts = moves.filter((m) => m.type === 'IN').sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const r of receipts) {
      if (left <= 0) break;
      const take = Math.min(left, r.qty);
      place(take, asOfDay - App.dayNum(r.date));
      left -= take;
    }
    if (left > 0) place(left, Infinity);
    return buckets;
  }

  function findAnomalies(movements) {
    const ids = new Set();
    const outs = movements.filter((m) => m.type === 'OUT');
    for (const list of App.groupBy(outs, (m) => m.sku + '|' + m.wh).values()) {
      if (list.length < cfg.anomalyMinSamples) continue;
      const mean = App.sum(list, (m) => m.qty) / list.length;
      const sd = Math.sqrt(App.sum(list, (m) => (m.qty - mean) ** 2) / list.length);
      for (const m of list) if (m.qty > mean + cfg.anomalySigma * sd) ids.add(m.id);
    }
    return ids;
  }

  // Stock and open orders are "as of today", so the date range applies only to movements and receipts.
  function applyFilters(model, f) {
    const dims = (r) =>
      (!f.wh || r.wh === f.wh) && (!f.category || r.category === f.category) &&
      (!f.supplier || r.supplierId === f.supplier) && (!f.sku || r.sku === f.sku);
    const inRange = (d) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
    const pos = model.pos.filter(dims);
    return {
      stock: model.stock.filter(dims),
      movements: model.movements.filter((m) => dims(m) && inRange(m.date)),
      openPos: pos.filter((p) => p.status !== 'received'),
      receivedPos: pos.filter((p) => p.status === 'received' && inRange(p.receivedDate)),
      recentAnomalies: model.movements.filter(
        (m) => m.anomaly && dims(m) && App.dayNum(m.date) > model.asOfDay - 30
      ),
    };
  }

  function kpis(view) {
    const { stock, openPos, receivedPos } = view;
    const shortage = stock.filter((r) => r.status === 'out' || r.status === 'low');
    const out = stock.filter((r) => r.status === 'out');
    const excess = stock.filter((r) => r.status === 'excess');
    const dead = stock.filter((r) => r.dead);
    const late = openPos.filter((p) => p.status === 'late');
    const risk = stock.filter((r) => r.forecastRisk && r.status !== 'out');
    const onTime = receivedPos.filter((p) => p.onTime).length;
    return {
      totalValue: App.sum(stock, (r) => r.value),
      totalUnits: App.sum(stock, (r) => r.qty),
      distinctSkus: new Set(stock.filter((r) => r.qty > 0).map((r) => r.sku)).size,
      shortage, out, excess, dead, late, risk,
      excessValue: App.sum(excess, (r) => r.excessValue),
      deadValue: App.sum(dead, (r) => r.value),
      openValue: App.sum(openPos, (p) => p.value),
      otdPct: receivedPos.length ? (onTime / receivedPos.length) * 100 : null,
      avgLead: receivedPos.length ? App.sum(receivedPos, (p) => p.leadDays) / receivedPos.length : null,
      alertCount: out.length + risk.length + late.length + view.recentAnomalies.length,
    };
  }

  function groupValue(stock, keyFn) {
    return [...App.groupBy(stock, keyFn)]
      .map(([label, rows]) => ({
        label, rows, value: App.sum(rows, (r) => r.value), qty: App.sum(rows, (r) => r.qty),
      }))
      .sort((a, b) => b.value - a.value);
  }

  function ageSummary(stock) {
    return cfg.ageBuckets.map((b, i) => {
      const rows = stock.filter((r) => r.ageBuckets[i] > 0);
      return {
        label: b.label,
        rows,
        qty: App.sum(stock, (r) => r.ageBuckets[i]),
        value: App.sum(stock, (r) => r.ageBuckets[i] * r.unitCost),
      };
    });
  }

  function movementTrend(movements, from, to) {
    const span = App.dayNum(to) - App.dayNum(from);
    const bucket = span <= 45
      ? (d) => d
      : span <= 200
        ? (d) => { const n = App.dayNum(d); return App.dayStr(n - ((n + 4) % 7)); }
        : (d) => d.slice(0, 7);
    const grouped = App.groupBy(movements, (m) => bucket(m.date));
    const keys = [...grouped.keys()].sort();
    return {
      unit: span <= 45 ? 'יום' : span <= 200 ? 'שבוע' : 'חודש',
      labels: keys.map((k) => (k.length === 7 ? k.split('-').reverse().join('/') : App.fmt.date(k).slice(0, 5))),
      keys,
      inValue: keys.map((k) => App.sum(grouped.get(k).filter((m) => m.type === 'IN'), (m) => m.value)),
      outValue: keys.map((k) => App.sum(grouped.get(k).filter((m) => m.type === 'OUT'), (m) => m.value)),
      grouped,
    };
  }

  function warehouseSummary(model, view) {
    return model.data.warehouses.map((w) => {
      const rows = view.stock.filter((r) => r.wh === w.id);
      const allUnits = App.sum(model.stock.filter((r) => r.wh === w.id), (r) => r.qty);
      return {
        id: w.id, name: w.name, city: w.city, capacityUnits: w.capacityUnits, rows,
        qty: App.sum(rows, (r) => r.qty),
        value: App.sum(rows, (r) => r.value),
        utilPct: (allUnits / w.capacityUnits) * 100,
        shortage: rows.filter((r) => r.status === 'out' || r.status === 'low').length,
        excess: rows.filter((r) => r.status === 'excess').length,
        dead: rows.filter((r) => r.dead).length,
      };
    });
  }

  function supplierSummary(model, view) {
    return model.data.suppliers
      .map((s) => {
        const rec = view.receivedPos.filter((p) => p.supplierId === s.id);
        const open = view.openPos.filter((p) => p.supplierId === s.id);
        const onTime = rec.filter((p) => p.onTime).length;
        return {
          id: s.id, name: s.name, plannedLeadDays: s.plannedLeadDays,
          received: rec.length, open: open.length,
          late: open.filter((p) => p.status === 'late').length,
          openValue: App.sum(open, (p) => p.value),
          otdPct: rec.length ? (onTime / rec.length) * 100 : null,
          avgLead: rec.length ? App.sum(rec, (p) => p.leadDays) / rec.length : null,
          rec, openRows: open,
        };
      })
      .filter((s) => s.received || s.open)
      .sort((a, b) => (a.otdPct == null ? 1 : b.otdPct == null ? -1 : a.otdPct - b.otdPct));
  }

  // Item short in one warehouse while another warehouse holds excess of the same item.
  function transferOpportunities(stock) {
    const list = [];
    for (const rows of App.groupBy(stock, (r) => r.sku).values()) {
      const donors = rows.filter((r) => r.excessQty > 0);
      for (const need of rows.filter((r) => r.status === 'out' || r.status === 'low')) {
        const donor = donors.sort((a, b) => b.excessQty - a.excessQty)[0];
        if (!donor) continue;
        list.push({
          sku: need.sku, name: need.name, from: donor.whName, to: need.whName,
          qty: Math.min(donor.excessQty, Math.max(1, need.maxLevel - need.qty)),
          value: Math.min(donor.excessQty, Math.max(1, need.maxLevel - need.qty)) * need.unitCost,
        });
      }
    }
    return list.sort((a, b) => b.value - a.value);
  }

  App.metrics = {
    buildModel, applyFilters, kpis, groupValue, ageSummary, movementTrend,
    warehouseSummary, supplierSummary, transferOpportunities,
  };
})(window.App);

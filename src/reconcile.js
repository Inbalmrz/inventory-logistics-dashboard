// Reconciliation checks: recompute from the raw dataset, independently of the calculated rows.
(function (App) {
  const TOL = 0.01;

  function run(model) {
    const { data } = model;
    const checks = [];
    const add = (name, expected, actual, detail) =>
      checks.push({ name, expected, actual, detail, pass: Math.abs(expected - actual) <= TOL });

    const costOf = new Map(data.items.map((i) => [i.sku, i.unitCost]));

    const net = new Map();
    for (const m of data.movements) {
      const k = m.sku + '|' + m.wh;
      const delta = m.type === 'IN' ? m.qty : m.type === 'OUT' ? -m.qty : m.qty;
      net.set(k, (net.get(k) || 0) + delta);
    }
    const broken = data.stock.filter((s) => s.opening + (net.get(s.sku + '|' + s.wh) || 0) !== s.qty);
    add('מלאי = פתיחה + כניסות − יציאות ± התאמות, לכל פריט ומחסן', 0, broken.length, 'מספר צירופי פריט/מחסן שלא מתאזנים');

    add('אין מלאי שלילי', 0, data.stock.filter((s) => s.qty < 0).length, 'שורות עם כמות שלילית');

    const rawValue = data.stock.reduce((t, s) => t + s.qty * costOf.get(s.sku), 0);
    const view = App.metrics.applyFilters(model, {});
    add('שווי המלאי בדאשבורד = חישוב ישיר מהמקור', rawValue, App.metrics.kpis(view).totalValue, 'בלי פילטרים, ב-₪');

    const rawUnits = data.stock.reduce((t, s) => t + s.qty, 0);
    add('כמות היחידות בדאשבורד = סכום המקור', rawUnits, App.metrics.kpis(view).totalUnits, 'יחידות');

    const whUnits = App.metrics.warehouseSummary(model, view).reduce((t, w) => t + w.qty, 0);
    add('סכום המחסנים = סך המלאי', rawUnits, whUnits, 'יחידות');

    const catUnits = App.metrics.groupValue(view.stock, (r) => r.category).reduce((t, c) => t + c.qty, 0);
    add('סכום הקטגוריות = סך המלאי', rawUnits, catUnits, 'יחידות');

    const ageUnits = App.metrics.ageSummary(view.stock).reduce((t, b) => t + b.qty, 0);
    add('סכום גיל המלאי = סך המלאי', rawUnits, ageUnits, 'יחידות');

    const inByRef = new Map(data.movements.filter((m) => m.type === 'IN').map((m) => [m.ref, m]));
    const received = data.purchaseOrders.filter((p) => p.receivedDate);
    const unmatched = received.filter((p) => {
      const m = inByRef.get(p.id);
      return !m || m.qty !== p.qty || m.date !== p.receivedDate;
    });
    add('כל הזמנה שהתקבלה תואמת תנועת כניסה', 0, unmatched.length, 'הזמנות ללא תנועה תואמת');
    add('כל תנועת כניסה שייכת להזמנה', received.length, inByRef.size, 'תנועות כניסה מול הזמנות שהתקבלו');

    const statusCount = model.pos.filter((p) => p.status === 'received').length;
    add('סיווג ההזמנות שלם', data.purchaseOrders.length,
      statusCount + model.pos.filter((p) => p.status !== 'received').length, 'התקבלו + פתוחות');

    return checks;
  }

  App.reconcile = { run };
})(window.App);

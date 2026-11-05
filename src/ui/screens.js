// The dashboard screens. Each screen receives { model, view, filters, k } and draws into `root`.
(function (App) {
  const { esc, fmt, sum, metrics: M, charts: C } = App;
  const COLORS = { brand: '#1f5fa8', in: '#1a8a6d', out: '#c9772b', ok: '#2f9e6b', warn: '#d99a1c', bad: '#cf3f3f', info: '#3f7fc4', muted: '#8a97a8' };
  const yesNo = (key, label) => ({ key, label, type: 'text', value: (r) => (r[key] ? 'כן' : 'לא'), filter: true });

  const stockCols = [
    { key: 'sku', label: 'מק״ט', type: 'text' },
    { key: 'name', label: 'פריט', type: 'text' },
    { key: 'category', label: 'קטגוריה', type: 'text', filter: true },
    { key: 'whName', label: 'מחסן', type: 'text', filter: true },
    { key: 'supplier', label: 'ספק', type: 'text', filter: true },
    { key: 'qty', label: 'כמות', type: 'num' },
    { key: 'reorderPoint', label: 'נקודת הזמנה', type: 'num' },
    { key: 'maxLevel', label: 'רמת מקסימום', type: 'num' },
    { key: 'unitCost', label: 'עלות יחידה', type: 'money' },
    { key: 'value', label: 'שווי', type: 'money' },
    { key: 'status', label: 'סטטוס', type: 'tone', meta: App.statusMeta, filter: true },
    { key: 'daysNoOut', label: 'ימים ללא יציאה', type: 'num' },
    yesNo('dead', 'ללא תנועה'),
  ];
  const riskCols = [
    { key: 'sku', label: 'מק״ט', type: 'text' },
    { key: 'name', label: 'פריט', type: 'text' },
    { key: 'whName', label: 'מחסן', type: 'text', filter: true },
    { key: 'supplier', label: 'ספק', type: 'text', filter: true },
    { key: 'qty', label: 'כמות', type: 'num' },
    { key: 'avgDailyOut', label: 'יציאה יומית ממוצעת', type: 'num1' },
    { key: 'forecastDaysCover', label: 'תחזית: ימי כיסוי', type: 'num1' },
    { key: 'forecastRunout', label: 'תחזית: תאריך אזילה', type: 'date' },
    { key: 'plannedLeadDays', label: 'זמן אספקה מתוכנן', type: 'num' },
    { key: 'nextArrival', label: 'הגעה צפויה', type: 'date' },
  ];
  const moveCols = [
    { key: 'date', label: 'תאריך', type: 'date' },
    { key: 'id', label: 'מזהה', type: 'text' },
    { key: 'type', label: 'סוג', type: 'tone', meta: App.moveTypeMeta, filter: true },
    { key: 'sku', label: 'מק״ט', type: 'text' },
    { key: 'name', label: 'פריט', type: 'text' },
    { key: 'category', label: 'קטגוריה', type: 'text', filter: true },
    { key: 'whName', label: 'מחסן', type: 'text', filter: true },
    { key: 'qty', label: 'כמות', type: 'num' },
    { key: 'value', label: 'שווי', type: 'money' },
    { key: 'ref', label: 'אסמכתה', type: 'text' },
    yesNo('anomaly', 'חריגה'),
  ];
  const poCols = [
    { key: 'id', label: 'הזמנה', type: 'text' },
    { key: 'status', label: 'סטטוס', type: 'tone', meta: App.poStatusMeta, filter: true },
    { key: 'supplier', label: 'ספק', type: 'text', filter: true },
    { key: 'sku', label: 'מק״ט', type: 'text' },
    { key: 'name', label: 'פריט', type: 'text' },
    { key: 'whName', label: 'מחסן', type: 'text', filter: true },
    { key: 'qty', label: 'כמות', type: 'num' },
    { key: 'value', label: 'שווי', type: 'money' },
    { key: 'orderDate', label: 'תאריך הזמנה', type: 'date' },
    { key: 'expectedDate', label: 'צפי אספקה', type: 'date' },
    { key: 'receivedDate', label: 'התקבלה', type: 'date' },
    { key: 'daysLate', label: 'ימי איחור', type: 'num' },
  ];
  const excessCols = stockCols.concat([
    { key: 'excessQty', label: 'כמות עודפת', type: 'num' },
    { key: 'excessValue', label: 'שווי עודף', type: 'money' },
  ]);

  const drill = {
    stock: (title, rows) => App.ui.drill(title, stockCols, rows, { key: 'value', dir: -1 }),
    excess: (title, rows) => App.ui.drill(title, excessCols, rows, { key: 'excessValue', dir: -1 }),
    risk: (title, rows) => App.ui.drill(title, riskCols, rows, { key: 'forecastDaysCover', dir: 1 }),
    moves: (title, rows) => App.ui.drill(title, moveCols, rows, { key: 'date', dir: -1 }),
    pos: (title, rows) => App.ui.drill(title, poCols, rows, { key: 'daysLate', dir: -1 }),
  };

  function kpiCards(host, cards) {
    host.innerHTML = cards
      .map((c, i) => `
        <button type="button" class="kpi tone-edge-${c.tone || 'brand'}" data-i="${i}" aria-label="${esc(c.label)}: ${esc(c.value)}. פתיחת הטבלה">
          <span class="kpi-label">${esc(c.label)}</span>
          <span class="kpi-value">${esc(c.value)}</span>
          <span class="kpi-sub">${esc(c.sub || '')}</span>
        </button>`)
      .join('');
    host.querySelectorAll('.kpi').forEach((b) => b.addEventListener('click', () => cards[+b.dataset.i].onClick()));
  }

  const panel = (id, title, hint, wide) =>
    `<section class="panel ${wide ? 'wide' : ''}"><header><h2>${esc(title)}</h2>${hint ? `<p>${esc(hint)}</p>` : ''}</header><div id="${id}" class="panel-body"></div></section>`;
  const $ = (root, id) => root.querySelector('#' + id);

  function trendChart(el, view, filters, title) {
    const t = M.movementTrend(view.movements, filters.from, filters.to);
    C.line(el, {
      title, labels: t.labels, fmt: fmt.moneyShort,
      series: [
        { name: 'כניסות (שווי)', values: t.inValue, color: COLORS.in },
        { name: 'יציאות (שווי)', values: t.outValue, color: COLORS.out },
      ],
      onClick: (i) => drill.moves(`תנועות: ${t.labels[i]}`, t.grouped.get(t.keys[i])),
    });
    return t;
  }

  const screens = {};

  screens.dashboard = {
    title: 'Dashboard ראשי',
    render(root, { model, view, filters, k }) {
      root.innerHTML = `<div class="kpi-grid" id="kpis"></div><div class="grid">
        ${panel('p-trend', 'כניסות ויציאות לאורך זמן', 'לחיצה על נקודה פותחת את התנועות שלה', true)}
        ${panel('p-status', 'מצב המלאי', 'שורות פריט במחסן לפי סטטוס')}
        ${panel('p-cat', 'שווי מלאי לפי קטגוריה', '')}
        ${panel('p-wh', 'שווי מלאי לפי מחסן', '')}
        ${panel('p-top', 'מה דורש טיפול עכשיו', '')}
      </div>`;
      kpiCards($(root, 'kpis'), [
        { label: 'שווי מלאי כולל', value: fmt.moneyShort(k.totalValue), sub: fmt.money(k.totalValue), onClick: () => drill.stock('שווי מלאי כולל', view.stock) },
        { label: 'כמות פריטים במלאי', value: fmt.num(k.distinctSkus), sub: `${fmt.num(k.totalUnits)} יחידות`, onClick: () => drill.stock('פריטים במלאי', view.stock.filter((r) => r.qty > 0)) },
        { label: 'פריטים בחוסר', value: fmt.num(k.shortage.length), sub: `${fmt.num(k.out.length)} באפס, השאר מתחת לנקודת הזמנה`, tone: k.out.length ? 'bad' : 'ok', onClick: () => drill.stock('פריטים בחוסר', k.shortage) },
        { label: 'מלאי עודף', value: fmt.moneyShort(k.excessValue), sub: `${fmt.num(k.excess.length)} שורות מעל המקסימום`, tone: 'warn', onClick: () => drill.excess('מלאי עודף', k.excess) },
        { label: 'מלאי ללא תנועה', value: fmt.moneyShort(k.deadValue), sub: `${fmt.num(k.dead.length)} שורות, ${App.config.deadStockDays}+ ימים ללא יציאה`, tone: 'warn', onClick: () => drill.stock('מלאי ללא תנועה', k.dead) },
        { label: 'הזמנות פתוחות', value: fmt.num(view.openPos.length), sub: `${fmt.num(k.late.length)} באיחור, ${fmt.moneyShort(k.openValue)}`, tone: k.late.length ? 'warn' : 'ok', onClick: () => drill.pos('הזמנות פתוחות', view.openPos) },
        { label: 'התראות חריגות', value: fmt.num(k.alertCount), sub: 'חוסר, סיכון חוסר, איחור וחריגות תנועה', tone: k.alertCount ? 'bad' : 'ok', onClick: () => App.navigate('insights') },
      ]);
      trendChart($(root, 'p-trend'), view, filters, 'כניסות ויציאות');
      const statusOf = (s) => view.stock.filter((r) => r.status === s);
      C.donut($(root, 'p-status'), {
        fmt: fmt.num, centerLabel: 'שורות',
        items: [
          { key: 'ok', label: 'תקין', value: statusOf('ok').length, color: COLORS.ok },
          { key: 'low', label: 'מתחת לנקודת הזמנה', value: statusOf('low').length, color: COLORS.warn },
          { key: 'out', label: 'חוסר', value: statusOf('out').length, color: COLORS.bad },
          { key: 'excess', label: 'עודף', value: statusOf('excess').length, color: COLORS.info },
        ],
        onClick: (it) => drill.stock(`סטטוס: ${it.label}`, statusOf(it.key)),
      });
      C.hbars($(root, 'p-cat'), { fmt: fmt.moneyShort, items: M.groupValue(view.stock, (r) => r.category), onClick: (g) => drill.stock(`קטגוריה: ${g.label}`, g.rows) });
      C.hbars($(root, 'p-wh'), { fmt: fmt.moneyShort, items: M.groupValue(view.stock, (r) => r.whName), onClick: (g) => drill.stock(`מחסן: ${g.label}`, g.rows) });
      insightList($(root, 'p-top'), buildInsights(model, view, k).slice(0, 4), true);
    },
  };

  screens.inventory = {
    title: 'ניתוח מלאי',
    render(root, { view, k }) {
      const ranked = view.stock.slice().sort((a, b) => b.value - a.value);
      const topN = ranked.slice(0, 10);
      const topShare = k.totalValue ? (sum(topN, (r) => r.value) / k.totalValue) * 100 : 0;
      root.innerHTML = `<div class="kpi-grid" id="kpis"></div><div class="grid">
        ${panel('p-cat', 'שווי לפי קטגוריה', '')}
        ${panel('p-age', 'גיל המלאי', 'יחידות לפי ימים מאז הקבלה, בשיטת FIFO')}
        ${panel('p-top', 'עשרת המובילים בשווי', `${fmt.pct(topShare)} משווי המלאי`)}
        ${panel('p-dead', 'ללא תנועה: הגדולים בשווי', `${App.config.deadStockDays}+ ימים ללא יציאה`)}
        ${panel('p-table', 'מלאי לפי פריט ומחסן', '', true)}
      </div>`;
      kpiCards($(root, 'kpis'), [
        { label: 'חוסר', value: fmt.num(k.out.length), sub: 'כמות אפס', tone: 'bad', onClick: () => drill.stock('חוסר', k.out) },
        { label: 'מתחת לנקודת הזמנה', value: fmt.num(k.shortage.length - k.out.length), sub: 'יש מלאי, אבל נמוך', tone: 'warn', onClick: () => drill.stock('מתחת לנקודת הזמנה', k.shortage.filter((r) => r.status === 'low')) },
        { label: 'עודף', value: fmt.moneyShort(k.excessValue), sub: `${fmt.num(k.excess.length)} שורות`, tone: 'info', onClick: () => drill.excess('עודף', k.excess) },
        { label: 'ללא תנועה', value: fmt.moneyShort(k.deadValue), sub: `${fmt.num(k.dead.length)} שורות`, tone: 'warn', onClick: () => drill.stock('ללא תנועה', k.dead) },
      ]);
      C.hbars($(root, 'p-cat'), { fmt: fmt.moneyShort, items: M.groupValue(view.stock, (r) => r.category), onClick: (g) => drill.stock(`קטגוריה: ${g.label}`, g.rows) });
      const ages = M.ageSummary(view.stock);
      C.hbars($(root, 'p-age'), {
        fmt: fmt.num,
        items: ages.map((a, i) => ({ ...a, value: a.qty, tone: i >= 4 ? 'bad' : i === 3 ? 'warn' : 'brand' })),
        onClick: (a) => drill.stock(`גיל מלאי: ${a.label}`, a.rows),
      });
      C.hbars($(root, 'p-top'), { fmt: fmt.moneyShort, items: topN.map((r) => ({ label: `${r.name} · ${r.whName}`, value: r.value, row: r })), onClick: (it) => drill.stock(it.label, [it.row]) });
      C.hbars($(root, 'p-dead'), { fmt: fmt.moneyShort, items: k.dead.slice().sort((a, b) => b.value - a.value).slice(0, 10).map((r) => ({ label: `${r.name} · ${r.whName}`, value: r.value, tone: 'warn', row: r })), onClick: (it) => drill.stock(it.label, [it.row]) });
      App.ui.table($(root, 'p-table'), { columns: stockCols, rows: view.stock, fileName: 'מלאי', sort: { key: 'value', dir: -1 } });
    },
  };

  screens.movements = {
    title: 'תנועות מלאי',
    render(root, { view, filters }) {
      const of = (t) => view.movements.filter((m) => m.type === t);
      const ins = of('IN'), outs = of('OUT'), adj = of('ADJ');
      const anomalies = view.movements.filter((m) => m.anomaly);
      const inV = sum(ins, (m) => m.value), outV = sum(outs, (m) => m.value);
      root.innerHTML = `<div class="kpi-grid" id="kpis"></div><div class="grid">
        ${panel('p-trend', 'מגמת כניסות ויציאות', '', true)}
        ${panel('p-wh', 'כניסות ויציאות לפי מחסן', '', true)}
        ${panel('p-anom', 'תנועות חריגות', `יציאה גדולה מהממוצע של אותו פריט ומחסן ב-${App.config.anomalySigma} סטיות תקן ומעלה`, true)}
        ${panel('p-table', 'כל התנועות', '', true)}
      </div>`;
      kpiCards($(root, 'kpis'), [
        { label: 'כניסות', value: fmt.moneyShort(inV), sub: `${fmt.num(ins.length)} תנועות`, tone: 'ok', onClick: () => drill.moves('כניסות', ins) },
        { label: 'יציאות', value: fmt.moneyShort(outV), sub: `${fmt.num(outs.length)} תנועות`, onClick: () => drill.moves('יציאות', outs) },
        { label: 'נטו', value: fmt.moneyShort(inV - outV), sub: 'כניסות פחות יציאות', tone: inV - outV < 0 ? 'warn' : 'ok', onClick: () => drill.moves('כל התנועות', view.movements) },
        { label: 'התאמות ספירה', value: fmt.num(adj.length), sub: 'תיקוני מלאי', tone: 'warn', onClick: () => drill.moves('התאמות ספירה', adj) },
        { label: 'תנועות חריגות', value: fmt.num(anomalies.length), sub: 'בטווח התאריכים', tone: anomalies.length ? 'bad' : 'ok', onClick: () => drill.moves('תנועות חריגות', anomalies) },
      ]);
      trendChart($(root, 'p-trend'), view, filters, 'מגמת תנועות');
      const groups = [...App.groupBy(view.movements, (m) => m.whName)].sort((a, b) => App.esc(a[0]).localeCompare(b[0], 'he'));
      C.bars($(root, 'p-wh'), {
        title: 'תנועות לפי מחסן', fmt: fmt.moneyShort, height: 250, labels: groups.map((g) => g[0]),
        series: [
          { name: 'כניסות', color: COLORS.in, values: groups.map((g) => sum(g[1].filter((m) => m.type === 'IN'), (m) => m.value)) },
          { name: 'יציאות', color: COLORS.out, values: groups.map((g) => sum(g[1].filter((m) => m.type === 'OUT'), (m) => m.value)) },
        ],
        onClick: (i) => drill.moves(`תנועות: ${groups[i][0]}`, groups[i][1]),
      });
      App.ui.table($(root, 'p-anom'), { columns: moveCols, rows: anomalies, fileName: 'תנועות חריגות', sort: { key: 'date', dir: -1 } });
      App.ui.table($(root, 'p-table'), { columns: moveCols, rows: view.movements, fileName: 'תנועות מלאי', sort: { key: 'date', dir: -1 } });
    },
  };

  screens.warehouses = {
    title: 'מחסנים',
    render(root, { model, view }) {
      const whs = M.warehouseSummary(model, view);
      root.innerHTML = `<div class="grid">
        ${panel('p-val', 'שווי מלאי לפי מחסן', '')}
        ${panel('p-util', 'ניצולת מחסן', 'כל המלאי במחסן מול הקיבולת, ללא תלות בפילטרי פריט. הקיבולת מומצאת')}
        ${panel('p-table', 'השוואת מחסנים', '', true)}
      </div>`;
      C.hbars($(root, 'p-val'), { fmt: fmt.moneyShort, items: whs.map((w) => ({ ...w, label: w.name })), onClick: (w) => drill.stock(`מחסן: ${w.name}`, w.rows) });
      C.hbars($(root, 'p-util'), {
        fmt: fmt.pct,
        items: whs.map((w) => ({ ...w, label: w.name, value: w.utilPct, tone: w.utilPct >= 90 ? 'bad' : w.utilPct >= 75 ? 'warn' : 'ok' })),
        onClick: (w) => drill.stock(`מחסן: ${w.name}`, w.rows),
      });
      App.ui.table($(root, 'p-table'), {
        fileName: 'השוואת מחסנים', sort: { key: 'value', dir: -1 }, rows: whs,
        columns: [
          { key: 'name', label: 'מחסן', type: 'text' },
          { key: 'city', label: 'עיר', type: 'text' },
          { key: 'qty', label: 'יחידות', type: 'num' },
          { key: 'value', label: 'שווי', type: 'money' },
          { key: 'capacityUnits', label: 'קיבולת (יחידות)', type: 'num' },
          { key: 'utilPct', label: 'ניצולת', type: 'pct' },
          { key: 'shortage', label: 'שורות בחוסר', type: 'num' },
          { key: 'excess', label: 'שורות בעודף', type: 'num' },
          { key: 'dead', label: 'ללא תנועה', type: 'num' },
        ],
      });
    },
  };

  screens.purchasing = {
    title: 'רכש ואספקות',
    render(root, { model, view, k }) {
      const sup = M.supplierSummary(model, view);
      root.innerHTML = `<div class="kpi-grid" id="kpis"></div><div class="grid">
        ${panel('p-otd', 'אחוז אספקה בזמן לפי ספק', 'הספקים החלשים למעלה, לפי הזמנות שהתקבלו בטווח התאריכים')}
        ${panel('p-lead', 'זמן אספקה ממוצע לפי ספק', 'ימים מהזמנה ועד קבלה')}
        ${panel('p-sup', 'מעקב ספקים', '', true)}
        ${panel('p-open', 'הזמנות פתוחות', '', true)}
      </div>`;
      kpiCards($(root, 'kpis'), [
        { label: 'הזמנות פתוחות', value: fmt.num(view.openPos.length), sub: fmt.money(k.openValue), onClick: () => drill.pos('הזמנות פתוחות', view.openPos) },
        { label: 'אספקות באיחור', value: fmt.num(k.late.length), sub: 'עבר הצפי ועדיין לא התקבלו', tone: k.late.length ? 'bad' : 'ok', onClick: () => drill.pos('אספקות באיחור', k.late) },
        { label: 'אחוז אספקה בזמן', value: fmt.pct(k.otdPct), sub: `מתוך ${fmt.num(view.receivedPos.length)} הזמנות שהתקבלו`, tone: k.otdPct >= 90 ? 'ok' : k.otdPct >= 75 ? 'warn' : 'bad', onClick: () => drill.pos('הזמנות שהתקבלו', view.receivedPos) },
        { label: 'זמן אספקה ממוצע', value: k.avgLead == null ? '—' : `${fmt.num1(k.avgLead)} ימים`, sub: 'מהזמנה ועד קבלה', onClick: () => drill.pos('הזמנות שהתקבלו', view.receivedPos) },
      ]);
      const withData = sup.filter((s) => s.otdPct != null);
      C.hbars($(root, 'p-otd'), {
        fmt: fmt.pct,
        items: withData.map((s) => ({ ...s, label: s.name, value: s.otdPct, tone: s.otdPct >= 90 ? 'ok' : s.otdPct >= 75 ? 'warn' : 'bad' })),
        onClick: (s) => drill.pos(`ספק: ${s.name}`, s.rec.concat(s.openRows)),
      });
      C.hbars($(root, 'p-lead'), {
        fmt: fmt.num1,
        items: withData.slice().sort((a, b) => b.avgLead - a.avgLead).map((s) => ({ ...s, label: s.name, value: s.avgLead })),
        onClick: (s) => drill.pos(`ספק: ${s.name}`, s.rec.concat(s.openRows)),
      });
      App.ui.table($(root, 'p-sup'), {
        fileName: 'ספקים', rows: sup, sort: { key: 'otdPct', dir: 1 },
        columns: [
          { key: 'name', label: 'ספק', type: 'text' },
          { key: 'received', label: 'התקבלו', type: 'num' },
          { key: 'otdPct', label: 'אספקה בזמן', type: 'pct' },
          { key: 'avgLead', label: 'זמן אספקה בפועל', type: 'num1' },
          { key: 'plannedLeadDays', label: 'זמן אספקה מתוכנן', type: 'num' },
          { key: 'open', label: 'פתוחות', type: 'num' },
          { key: 'late', label: 'באיחור', type: 'num' },
          { key: 'openValue', label: 'שווי פתוח', type: 'money' },
        ],
      });
      App.ui.table($(root, 'p-open'), { columns: poCols, rows: view.openPos, fileName: 'הזמנות פתוחות', sort: { key: 'daysLate', dir: -1 } });
    },
  };

  function buildInsights(model, view, k) {
    const list = [];
    const transfers = M.transferOpportunities(view.stock);
    if (k.out.length) {
      const hit = k.out.slice().sort((a, b) => b.avgDailyOut - a.avgDailyOut)[0];
      list.push({
        tone: 'bad', title: `${fmt.num(k.out.length)} שורות מלאי באפס`,
        text: `הפריט עם הביקוש הגבוה ביותר: ${hit.name} ב${hit.whName}.`,
        action: 'להקדים הזמנה פתוחה או להעביר מלאי ממחסן אחר.',
        open: () => drill.stock('חוסר', k.out),
      });
    }
    if (k.risk.length) {
      list.push({
        tone: 'bad', title: `תחזית: ${fmt.num(k.risk.length)} שורות צפויות להיגמר לפני שתגיע אספקה`,
        text: 'ימי הכיסוי קצרים מזמן האספקה המתוכנן, ואין הזמנה שמגיעה בזמן.',
        action: 'להזמין עכשיו, לפי סדר תאריך האזילה הצפוי.',
        open: () => drill.risk('סיכון חוסר (תחזית)', k.risk),
      });
    }
    if (k.late.length) {
      const worst = k.late.slice().sort((a, b) => b.daysLate - a.daysLate)[0];
      list.push({
        tone: 'bad', title: `${fmt.num(k.late.length)} הזמנות באיחור`,
        text: `האיחור הגדול ביותר: ${worst.id} מ${worst.supplier}, ${fmt.num(worst.daysLate)} ימים.`,
        action: 'לפנות לספקים ולעדכן מועדי אספקה.',
        open: () => drill.pos('אספקות באיחור', k.late),
      });
    }
    const weak = M.supplierSummary(model, view).filter((s) => s.received >= 5 && s.otdPct != null)[0];
    if (weak && weak.otdPct < 85) {
      list.push({
        tone: 'warn', title: `${weak.name}: ${fmt.pct(weak.otdPct)} אספקה בזמן`,
        text: `זמן אספקה בפועל ${fmt.num1(weak.avgLead)} ימים, לעומת ${fmt.num(weak.plannedLeadDays)} מתוכננים.`,
        action: 'לבחון מלאי ביטחון גבוה יותר או ספק חלופי.',
        open: () => drill.pos(`ספק: ${weak.name}`, weak.rec.concat(weak.openRows)),
      });
    }
    if (transfers.length) {
      list.push({
        tone: 'info', title: `${fmt.num(transfers.length)} הזדמנויות להעברה בין מחסנים`,
        text: `הגדולה: ${transfers[0].name}, ${fmt.num(transfers[0].qty)} יחידות מ${transfers[0].from} ל${transfers[0].to}.`,
        action: 'להעביר מלאי עודף למחסן בחוסר לפני שמזמינים.',
        open: () => App.ui.drill('העברות מומלצות', [
          { key: 'sku', label: 'מק״ט', type: 'text' }, { key: 'name', label: 'פריט', type: 'text' },
          { key: 'from', label: 'ממחסן', type: 'text', filter: true }, { key: 'to', label: 'למחסן', type: 'text', filter: true },
          { key: 'qty', label: 'כמות', type: 'num' }, { key: 'value', label: 'שווי', type: 'money' },
        ], transfers, { key: 'value', dir: -1 }),
      });
    }
    if (k.excess.length) {
      list.push({
        tone: 'warn', title: `${fmt.money(k.excessValue)} כלואים במלאי עודף`,
        text: `${fmt.num(k.excess.length)} שורות מעל רמת המקסימום.`,
        action: 'לעצור הזמנות חדשות לפריטים אלה ולשקול מבצע או החזרה לספק.',
        open: () => drill.excess('מלאי עודף', k.excess),
      });
    }
    if (k.dead.length) {
      list.push({
        tone: 'warn', title: `${fmt.money(k.deadValue)} במלאי ללא תנועה`,
        text: `${fmt.num(k.dead.length)} שורות בלי יציאה ${App.config.deadStockDays} ימים ומעלה.`,
        action: 'לבדוק רלוונטיות, ולשקול מכירה מרוכזת או גריעה.',
        open: () => drill.stock('מלאי ללא תנועה', k.dead),
      });
    }
    if (view.recentAnomalies.length) {
      list.push({
        tone: 'warn', title: `${fmt.num(view.recentAnomalies.length)} תנועות חריגות ב-30 הימים האחרונים`,
        text: 'כמויות יציאה גבוהות בהרבה מהרגיל לאותו פריט ומחסן.',
        action: 'לאמת מול אסמכתאות ולבדוק אם מדובר בטעות או בביקוש חדש.',
        open: () => drill.moves('תנועות חריגות', view.recentAnomalies),
      });
    }
    const asOf = model.asOfDay;
    const outIn = (a, b) => sum(model.movements.filter((m) => {
      const d = App.dayNum(m.date);
      return m.type === 'OUT' && d > asOf - a && d <= asOf - b && view.stock.some((r) => r.sku === m.sku && r.wh === m.wh);
    }), (m) => m.value);
    const last30 = outIn(30, 0), prev30 = outIn(60, 30);
    if (prev30 > 0 && Math.abs(last30 / prev30 - 1) >= 0.15) {
      const change = (last30 / prev30 - 1) * 100;
      list.push({
        tone: 'info', title: `היציאות ${change > 0 ? 'עלו' : 'ירדו'} ב-${fmt.pct(Math.abs(change))}`,
        text: `30 הימים האחרונים (${fmt.moneyShort(last30)}) מול 30 הימים שקדמו להם (${fmt.moneyShort(prev30)}).`,
        action: change > 0 ? 'לבדוק אם נקודות ההזמנה עדיין מספיקות.' : 'לבדוק אם אפשר לצמצם הזמנות קרובות.',
        open: () => App.navigate('movements'),
      });
    }
    return list;
  }

  function insightList(el, items, compact) {
    if (!items.length) {
      el.innerHTML = '<p class="muted">אין התראות לפי הסינון הנוכחי.</p>';
      return;
    }
    el.innerHTML = `<ul class="insights ${compact ? 'compact' : ''}">${items
      .map((it, i) => `<li class="insight tone-edge-${it.tone}">
        <div><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p>${compact ? '' : `<p class="action"><b>המלצה:</b> ${esc(it.action)}</p>`}</div>
        <button type="button" class="btn" data-i="${i}">פירוט</button></li>`)
      .join('')}</ul>`;
    el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => items[+b.dataset.i].open()));
  }

  screens.insights = {
    title: 'התראות ותובנות',
    render(root, { model, view, k }) {
      root.innerHTML = `<div class="grid">${panel('p-list', 'התראות ותובנות', 'כללים קבועים על הנתונים. פריטים שמסומנים "תחזית" הם הערכה בלבד', true)}${panel('p-risk', 'סיכוני חוסר (תחזית)', '', true)}</div>`;
      insightList($(root, 'p-list'), buildInsights(model, view, k));
      App.ui.table($(root, 'p-risk'), { columns: riskCols, rows: k.risk, fileName: 'סיכוני חוסר', sort: { key: 'forecastDaysCover', dir: 1 } });
    },
  };

  screens.method = {
    title: 'נוסחאות ובדיקות',
    render(root, { model }) {
      const checks = App.reconcile.run(model);
      const failed = checks.filter((c) => !c.pass).length;
      const c = App.config;
      const rows = [
        ['שווי מלאי', 'כמות × עלות יחידה, לכל פריט ומחסן'],
        ['חוסר', 'כמות = 0'],
        ['מתחת לנקודת הזמנה', '0 < כמות ≤ נקודת הזמנה'],
        ['עודף', 'כמות > רמת מקסימום. שווי העודף = (כמות − מקסימום) × עלות יחידה'],
        ['מלאי ללא תנועה', `כמות > 0 ואין יציאה ${c.deadStockDays} ימים ומעלה`],
        ['גיל מלאי', 'FIFO: היחידות שבמלאי משויכות לקבלות האחרונות, והיתרה למלאי הפתיחה'],
        ['תנועה חריגה', `יציאה גדולה מממוצע + ${c.anomalySigma} סטיות תקן של אותו פריט ומחסן, עם ${c.anomalyMinSamples} תצפיות לפחות`],
        ['הזמנה באיחור', 'לא התקבלה ותאריך הצפי כבר עבר'],
        ['אחוז אספקה בזמן', 'הזמנות שהתקבלו עד תאריך הצפי ÷ כל ההזמנות שהתקבלו בטווח'],
        ['זמן אספקה', 'תאריך קבלה − תאריך הזמנה'],
        ['ניצולת מחסן', 'סך היחידות במחסן ÷ קיבולת ביחידות'],
        ['תחזית: ימי כיסוי', `כמות ÷ יציאה יומית ממוצעת ב-${c.usageWindowDays} הימים האחרונים`],
        ['תחזית: סיכון חוסר', 'ימי כיסוי < זמן אספקה מתוכנן, ואין הזמנה שמגיעה לפני האזילה'],
      ];
      root.innerHTML = `<div class="grid">
        <section class="panel wide"><header><h2>מקור הנתונים</h2></header><div class="panel-body prose">
          <p><b>כל הנתונים במערכת הומצאו.</b> הם נוצרים בהדמיה עם מחולל מספרים קבוע (זרע ${esc(model.data.meta.seed)}), ולא מתארים עסק, ספק, מחסן או מוצר אמיתיים.</p>
          <p>תקופת ההיסטוריה: ${esc(fmt.date(model.data.meta.historyStart))} עד ${esc(fmt.date(model.data.meta.asOf))}. ${esc(fmt.num(model.data.items.length))} פריטים, ${esc(fmt.num(model.data.movements.length))} תנועות, ${esc(fmt.num(model.data.purchaseOrders.length))} הזמנות רכש.</p>
          <p>רענון מוסיף תנועות יציאה מומצאות של היום. טעינה מחדש של העמוד מחזירה לנתוני הבסיס.</p>
          <p>מלאי והזמנות פתוחות מוצגים נכון להיום. טווח התאריכים משפיע רק על תנועות ועל הזמנות שהתקבלו.</p>
        </div></section>
        <section class="panel wide"><header><h2>בדיקות התאמה</h2><p>${failed ? `${fmt.num(failed)} בדיקות נכשלו` : `כל ${fmt.num(checks.length)} הבדיקות עברו`}</p></header><div class="panel-body" id="p-checks"></div></section>
        <section class="panel wide"><header><h2>נוסחאות והנחות</h2></header><div class="panel-body" id="p-formulas"></div></section>
      </div>`;
      $(root, 'p-checks').innerHTML = `<div class="table-scroll"><table><thead><tr><th>בדיקה</th><th class="n">צפוי</th><th class="n">בפועל</th><th>יחידה</th><th>תוצאה</th></tr></thead><tbody>${checks
        .map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${esc(fmt.num(x.expected))}</td><td class="n">${esc(fmt.num(x.actual))}</td><td>${esc(x.detail)}</td><td><span class="pill tone-${x.pass ? 'ok' : 'bad'}">${x.pass ? 'עבר' : 'נכשל'}</span></td></tr>`)
        .join('')}</tbody></table></div>`;
      $(root, 'p-formulas').innerHTML = `<div class="table-scroll"><table><thead><tr><th>מדד</th><th>הגדרה</th></tr></thead><tbody>${rows
        .map(([a, b]) => `<tr><td><b>${esc(a)}</b></td><td>${esc(b)}</td></tr>`)
        .join('')}</tbody></table></div>`;
    },
  };

  App.screens = screens;
})(window.App);

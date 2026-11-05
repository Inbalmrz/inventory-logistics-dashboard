// Shared namespace and helpers. Classic scripts (not ES modules) so index.html opens by double-click.
window.App = { sources: {}, ui: {} };

(function (App) {
  const DAY_MS = 86400000;
  const nf = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });

  App.dayNum = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / DAY_MS;
  };
  App.dayStr = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
  App.todayStr = () => {
    const d = new Date();
    return App.dayStr(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  };

  App.fmt = {
    num: (v) => (v == null || Number.isNaN(v) ? '—' : nf.format(v)),
    num1: (v) => (v == null || Number.isNaN(v) ? '—' : nf1.format(v)),
    money: (v) => (v == null || Number.isNaN(v) ? '—' : '₪' + nf.format(v)),
    moneyShort: (v) => {
      if (v == null || Number.isNaN(v)) return '—';
      const a = Math.abs(v);
      if (a >= 1e6) return '₪' + nf1.format(v / 1e6) + 'M';
      if (a >= 1e3) return '₪' + nf.format(v / 1e3) + 'K';
      return '₪' + nf.format(v);
    },
    pct: (v) => (v == null || Number.isNaN(v) ? '—' : nf1.format(v) + '%'),
    date: (s) => (s ? s.split('-').reverse().join('/') : '—'),
  };

  App.esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  App.sum = (arr, fn) => arr.reduce((t, x) => t + fn(x), 0);

  App.groupBy = (arr, fn) => {
    const m = new Map();
    for (const x of arr) {
      const k = fn(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };

  // Business thresholds used by the calculation layer. Documented on the "נוסחאות ובדיקות" screen.
  App.config = {
    deadStockDays: 180,
    anomalySigma: 3,
    anomalyMinSamples: 8,
    usageWindowDays: 90,
    ageBuckets: [
      { label: '0–30 ימים', max: 30 },
      { label: '31–90 ימים', max: 90 },
      { label: '91–180 ימים', max: 180 },
      { label: '181–365 ימים', max: 365 },
      { label: 'מעל שנה', max: Infinity },
    ],
  };

  App.statusMeta = {
    out: { label: 'חוסר', tone: 'bad' },
    low: { label: 'מתחת לנקודת הזמנה', tone: 'warn' },
    ok: { label: 'תקין', tone: 'ok' },
    excess: { label: 'עודף', tone: 'info' },
  };
  App.poStatusMeta = {
    received: { label: 'התקבלה', tone: 'ok' },
    open: { label: 'פתוחה', tone: 'info' },
    late: { label: 'פתוחה באיחור', tone: 'bad' },
  };
  App.moveTypeMeta = {
    IN: { label: 'כניסה', tone: 'ok' },
    OUT: { label: 'יציאה', tone: 'info' },
    ADJ: { label: 'התאמת ספירה', tone: 'warn' },
  };
})(window.App);

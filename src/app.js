// App shell: routing, global filters, refresh, and the drill-down dialog.
(function (App) {
  const { esc, fmt } = App;
  const NAV = [
    ['dashboard', 'Dashboard ראשי', '▦'],
    ['inventory', 'ניתוח מלאי', '▤'],
    ['movements', 'תנועות מלאי', '⇄'],
    ['warehouses', 'מחסנים', '⌂'],
    ['purchasing', 'רכש ואספקות', '⛟'],
    ['insights', 'התראות ותובנות', '⚑'],
    ['method', 'נוסחאות ובדיקות', '✓'],
  ];

  // To plug in a real source, register an adapter in App.sources and change this one line.
  const source = App.sources.demo();

  const state = { model: null, filters: {}, timer: null };
  const el = (id) => document.getElementById(id);

  function currentRoute() {
    const r = location.hash.replace('#', '');
    return App.screens[r] ? r : 'dashboard';
  }
  App.navigate = (route) => {
    closeDrill();
    if (currentRoute() === route) render();
    else location.hash = route;
  };

  function renderNav() {
    const route = currentRoute();
    el('nav').innerHTML = NAV.map(([id, label, icon]) =>
      `<a href="#${id}" class="nav-link ${id === route ? 'active' : ''}" ${id === route ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-text">${esc(label)}</span></a>`).join('');
  }

  function render() {
    const route = currentRoute();
    renderNav();
    el('screen-title').textContent = App.screens[route].title;
    const view = App.metrics.applyFilters(state.model, state.filters);
    const k = App.metrics.kpis(view);
    const root = el('view');
    App.screens[route].render(root, { model: state.model, view, k, filters: state.filters });
    el('last-update').textContent = new Date(state.model.data.meta.lastUpdated).toLocaleString('he-IL');
  }

  function initFilters() {
    const { data } = state.model;
    const asOf = data.meta.asOf;
    state.filters = { from: data.meta.historyStart, to: asOf };
    const fill = (id, options) => {
      el(id).insertAdjacentHTML('beforeend', options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''));
    };
    fill('f-wh', data.warehouses.map((w) => [w.id, w.name]));
    fill('f-category', data.categories.map((c) => [c, c]));
    fill('f-supplier', data.suppliers.map((s) => [s.id, s.name]));
    el('f-items').innerHTML = data.items.map((i) => `<option value="${esc(i.sku + ' | ' + i.name)}"></option>`).join('');

    const from = el('f-from'), to = el('f-to');
    from.value = state.filters.from; to.value = state.filters.to;
    from.min = to.min = data.meta.historyStart;
    from.max = to.max = asOf;

    el('f-preset').addEventListener('change', (e) => {
      const days = +e.target.value;
      if (!days) return;
      state.filters.from = App.dayStr(App.dayNum(asOf) - days + 1);
      state.filters.to = asOf;
      from.value = state.filters.from;
      to.value = asOf;
      render();
    });
    const onDate = () => {
      if (!from.value || !to.value || from.value > to.value) return;
      state.filters.from = from.value;
      state.filters.to = to.value;
      el('f-preset').value = '';
      render();
    };
    from.addEventListener('change', onDate);
    to.addEventListener('change', onDate);
    [['f-wh', 'wh'], ['f-category', 'category'], ['f-supplier', 'supplier']].forEach(([id, key]) =>
      el(id).addEventListener('change', (e) => { state.filters[key] = e.target.value; render(); }));
    el('f-item').addEventListener('change', (e) => {
      const sku = e.target.value.split(' | ')[0].trim();
      state.filters.sku = data.items.some((i) => i.sku === sku) ? sku : '';
      if (!state.filters.sku) e.target.value = '';
      render();
    });
    el('f-clear').addEventListener('click', () => {
      ['f-wh', 'f-category', 'f-supplier', 'f-item'].forEach((id) => { el(id).value = ''; });
      el('f-preset').value = '365';
      from.value = data.meta.historyStart;
      to.value = asOf;
      state.filters = { from: from.value, to: asOf };
      render();
    });
  }

  async function refresh() {
    const btn = el('btn-refresh');
    btn.disabled = true;
    try {
      const data = await source.refresh();
      state.model = App.metrics.buildModel(data);
      if (!el('drill').open) render();
    } finally {
      btn.disabled = false;
    }
  }

  function initRefresh() {
    el('btn-refresh').addEventListener('click', refresh);
    el('auto-refresh').addEventListener('change', (e) => {
      clearInterval(state.timer);
      const minutes = +e.target.value;
      if (minutes) state.timer = setInterval(refresh, minutes * 60000);
    });
  }

  App.ui.drill = (title, columns, rows, sort) => {
    el('drill-title').textContent = `${title} (${fmt.num(rows.length)})`;
    App.ui.table(el('drill-body'), { columns, rows, sort, fileName: title });
    el('drill').showModal();
  };
  function closeDrill() {
    if (el('drill').open) el('drill').close();
  }

  function init() {
    source.load().then((data) => {
      state.model = App.metrics.buildModel(data);
      initFilters();
      initRefresh();
      el('drill-close').addEventListener('click', closeDrill);
      el('drill').addEventListener('click', (e) => { if (e.target === el('drill')) closeDrill(); });
      window.addEventListener('hashchange', () => { closeDrill(); render(); });
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  App._state = state;
})(window.App);

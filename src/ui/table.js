// Data table with search, sorting, per-column filters, paging and Excel export.
// Column: { key, label, type: 'text'|'num'|'num1'|'money'|'pct'|'date'|'tone', filter?, meta?, value? }
(function (App) {
  const { esc, fmt } = App;
  const collator = new Intl.Collator('he', { numeric: true });
  const PAGE = 25;

  const rawValue = (col, row) => (col.value ? col.value(row) : row[col.key]);
  const textValue = (col, row) => {
    const v = rawValue(col, row);
    if (col.type === 'tone') return col.meta[v] ? col.meta[v].label : v;
    if (typeof v === 'boolean') return v ? 'כן' : 'לא';
    return v;
  };

  function cellHtml(col, row) {
    const v = rawValue(col, row);
    switch (col.type) {
      case 'num': return esc(fmt.num(v));
      case 'num1': return esc(fmt.num1(v));
      case 'money': return esc(fmt.money(v));
      case 'pct': return esc(fmt.pct(v));
      case 'date': return esc(fmt.date(v));
      case 'tone': {
        const m = col.meta[v];
        return m ? `<span class="pill tone-${m.tone}">${esc(m.label)}</span>` : esc(v);
      }
      default: return esc(textValue(col, row));
    }
  }

  function render(host, { columns, rows, fileName, sort }) {
    const state = { q: '', filters: {}, sortKey: sort ? sort.key : null, sortDir: sort ? sort.dir : 1, page: 0 };
    const filterCols = columns.filter((c) => c.filter);
    host.innerHTML = `
      <div class="table-tools">
        <input type="search" class="tbl-search" placeholder="חיפוש בטבלה…" aria-label="חיפוש בטבלה">
        ${filterCols.map((c) => {
          const opts = [...new Set(rows.map((r) => String(textValue(c, r))))].sort(collator.compare);
          return `<select data-filter="${esc(c.key)}" aria-label="${esc(c.label)}"><option value="">${esc(c.label)}: הכול</option>${opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
        }).join('')}
        <span class="tbl-count"></span>
        <button type="button" class="btn btn-export">ייצוא ל-Excel</button>
      </div>
      <div class="table-scroll"><table>
        <thead><tr>${columns.map((c) => `<th class="${isNumeric(c) ? 'n' : ''}"><button type="button" data-sort="${esc(c.key)}">${esc(c.label)}<span class="sort-mark"></span></button></th>`).join('')}</tr></thead>
        <tbody></tbody>
      </table></div>
      <div class="pager"><button type="button" class="btn btn-prev">הקודם</button><span class="pager-info"></span><button type="button" class="btn btn-next">הבא</button></div>`;

    const tbody = host.querySelector('tbody');
    const count = host.querySelector('.tbl-count');
    const info = host.querySelector('.pager-info');
    const prev = host.querySelector('.btn-prev');
    const next = host.querySelector('.btn-next');

    function visibleRows() {
      const q = state.q.trim().toLowerCase();
      let out = rows.filter((r) => {
        for (const [k, v] of Object.entries(state.filters)) {
          if (v && String(textValue(columns.find((c) => c.key === k), r)) !== v) return false;
        }
        return !q || columns.some((c) => String(textValue(c, r) ?? '').toLowerCase().includes(q));
      });
      if (state.sortKey) {
        const col = columns.find((c) => c.key === state.sortKey);
        out = out.slice().sort((a, b) => {
          const x = rawValue(col, a), y = rawValue(col, b);
          if (x == null && y == null) return 0;
          if (x == null) return 1;
          if (y == null) return -1;
          const cmp = typeof x === 'number' ? x - y : collator.compare(String(textValue(col, a)), String(textValue(col, b)));
          return cmp * state.sortDir;
        });
      }
      return out;
    }

    function draw() {
      const list = visibleRows();
      const pages = Math.max(1, Math.ceil(list.length / PAGE));
      state.page = Math.min(state.page, pages - 1);
      const slice = list.slice(state.page * PAGE, (state.page + 1) * PAGE);
      tbody.innerHTML = slice.length
        ? slice.map((r) => `<tr>${columns.map((c) => `<td class="${isNumeric(c) ? 'n' : ''}">${cellHtml(c, r)}</td>`).join('')}</tr>`).join('')
        : `<tr><td class="empty" colspan="${columns.length}">אין שורות שמתאימות לסינון</td></tr>`;
      count.textContent = `${fmt.num(list.length)} שורות`;
      info.textContent = `עמוד ${fmt.num(state.page + 1)} מתוך ${fmt.num(pages)}`;
      prev.disabled = state.page === 0;
      next.disabled = state.page >= pages - 1;
      host.querySelectorAll('[data-sort]').forEach((b) => {
        const active = b.dataset.sort === state.sortKey;
        b.querySelector('.sort-mark').textContent = active ? (state.sortDir > 0 ? ' ▲' : ' ▼') : '';
        b.closest('th').setAttribute('aria-sort', active ? (state.sortDir > 0 ? 'ascending' : 'descending') : 'none');
      });
    }

    host.querySelector('.tbl-search').addEventListener('input', (e) => { state.q = e.target.value; state.page = 0; draw(); });
    host.querySelectorAll('[data-filter]').forEach((s) =>
      s.addEventListener('change', () => { state.filters[s.dataset.filter] = s.value; state.page = 0; draw(); }));
    host.querySelectorAll('[data-sort]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.sort;
        if (state.sortKey === k) state.sortDir *= -1;
        else { state.sortKey = k; state.sortDir = 1; }
        state.page = 0;
        draw();
      }));
    prev.addEventListener('click', () => { state.page--; draw(); });
    next.addEventListener('click', () => { state.page++; draw(); });
    host.querySelector('.btn-export').addEventListener('click', () => {
      const list = visibleRows();
      App.xlsx.download(fileName || 'export', 'נתוני הדגמה', columns.map((c) => c.label), list.map((r) => columns.map((c) => {
        const v = textValue(c, r);
        return v == null ? '' : v;
      })));
    });
    draw();
  }

  function isNumeric(c) {
    return ['num', 'num1', 'money', 'pct'].includes(c.type);
  }

  App.ui.table = render;
})(window.App);

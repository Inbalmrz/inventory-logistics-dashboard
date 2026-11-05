// Small interactive charts (SVG/HTML) with no external library.
(function (App) {
  const { esc } = App;
  const live = [];

  function register(el, draw) {
    draw();
    live.push({ el, draw });
  }
  function redrawAll() {
    for (let i = live.length - 1; i >= 0; i--) {
      if (!live[i].el.isConnected) live.splice(i, 1);
      else live[i].draw();
    }
  }
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawAll, 150);
  });

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function legend(series) {
    return `<div class="legend">${series
      .map((s) => `<span class="legend-item"><i style="background:${s.color}"></i>${esc(s.name)}</span>`)
      .join('')}</div>`;
  }

  function attachTooltip(el) {
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    el.appendChild(tip);
    return {
      show(html, x, y) {
        tip.innerHTML = html;
        tip.hidden = false;
        const maxX = el.clientWidth - tip.offsetWidth - 4;
        tip.style.left = Math.max(4, Math.min(x + 12, maxX)) + 'px';
        tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px';
      },
      hide() { tip.hidden = true; },
    };
  }

  // Shared frame for time/category charts. mode: 'line' | 'bars'.
  function xyChart(el, opts) {
    const { labels, series, fmt, height = 280, onClick, mode } = opts;
    register(el, () => {
      const W = Math.max(280, el.clientWidth);
      const H = height;
      const m = { top: 12, right: 12, bottom: 30, left: 58 };
      const iw = W - m.left - m.right;
      const ih = H - m.top - m.bottom;
      const maxV = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
      const y = (v) => m.top + ih - (v / maxV) * ih;
      const step = iw / Math.max(1, labels.length);
      const x = (i) => m.left + step * (i + 0.5);

      let grid = '';
      for (let g = 0; g <= 4; g++) {
        const v = (maxV / 4) * g;
        grid += `<line x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`;
        grid += `<text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end" class="tick">${esc(fmt(v))}</text>`;
      }
      const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(iw / 62))));
      const xTicks = labels
        .map((l, i) => (i % every === 0 ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="tick">${esc(l)}</text>` : ''))
        .join('');

      let marks = '';
      if (mode === 'line') {
        for (const s of series) {
          const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
          marks += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
        }
      } else {
        const groupW = Math.min(step * 0.76, 56);
        const barW = groupW / series.length;
        series.forEach((s, k) => {
          s.values.forEach((v, i) => {
            const bx = x(i) - groupW / 2 + k * barW;
            marks += `<rect x="${bx.toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(1, barW - 2).toFixed(1)}" height="${Math.max(0, m.top + ih - y(v)).toFixed(1)}" rx="2" fill="${s.color}"/>`;
          });
        });
      }

      el.innerHTML = `${legend(series)}<svg dir="ltr" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || '')}">
        ${grid}${xTicks}${marks}
        <line class="hover-line" x1="0" x2="0" y1="${m.top}" y2="${m.top + ih}" visibility="hidden"/>
        <rect class="hit" x="${m.left}" y="${m.top}" width="${iw}" height="${ih}" fill="transparent" ${onClick ? 'style="cursor:pointer"' : ''}/>
      </svg>`;

      const svg = el.querySelector('svg');
      const hit = svg.querySelector('.hit');
      const line = svg.querySelector('.hover-line');
      const tip = attachTooltip(el);
      const indexAt = (e) => {
        const r = svg.getBoundingClientRect();
        return Math.max(0, Math.min(labels.length - 1, Math.floor((e.clientX - r.left - m.left) / step)));
      };
      hit.addEventListener('mousemove', (e) => {
        if (!labels.length) return;
        const i = indexAt(e);
        line.setAttribute('x1', x(i));
        line.setAttribute('x2', x(i));
        line.setAttribute('visibility', 'visible');
        const r = el.getBoundingClientRect();
        tip.show(
          `<b>${esc(labels[i])}</b>` + series.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.name)}: ${esc(fmt(s.values[i]))}</div>`).join(''),
          e.clientX - r.left, e.clientY - r.top
        );
      });
      hit.addEventListener('mouseleave', () => { tip.hide(); line.setAttribute('visibility', 'hidden'); });
      if (onClick) hit.addEventListener('click', (e) => labels.length && onClick(indexAt(e)));
    });
  }

  function hbars(el, { items, fmt, onClick }) {
    const max = Math.max(0, ...items.map((i) => i.value)) || 1;
    el.innerHTML = `<div class="hbars">${items
      .map((it, i) => `
        <${onClick ? 'button type="button"' : 'div'} class="hbar" data-i="${i}">
          <span class="hbar-label" title="${esc(it.label)}">${esc(it.label)}</span>
          <span class="hbar-track"><span class="hbar-fill tone-${it.tone || 'brand'}" style="width:${((it.value / max) * 100).toFixed(1)}%"></span></span>
          <span class="hbar-value">${esc(fmt(it.value))}</span>
        </${onClick ? 'button' : 'div'}>`)
      .join('')}</div>`;
    if (onClick) el.querySelectorAll('.hbar').forEach((b) => b.addEventListener('click', () => onClick(items[+b.dataset.i])));
  }

  function donut(el, { items, fmt, onClick, centerLabel }) {
    const total = App.sum(items, (i) => i.value) || 1;
    const R = 70, C = 2 * Math.PI * R;
    let acc = 0;
    const arcs = items
      .map((it, i) => {
        const len = (it.value / total) * C;
        const a = `<circle class="donut-arc" data-i="${i}" r="${R}" cx="100" cy="100" fill="none" stroke="${it.color}" stroke-width="26"
          stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 100 100)"/>`;
        acc += len;
        return a;
      })
      .join('');
    el.innerHTML = `<div class="donut-wrap">
      <svg dir="ltr" viewBox="0 0 200 200" class="donut" role="img">${arcs}
        <text x="100" y="97" text-anchor="middle" class="donut-total">${esc(App.fmt.num(App.sum(items, (i) => i.value)))}</text>
        <text x="100" y="117" text-anchor="middle" class="tick">${esc(centerLabel || '')}</text>
      </svg>
      <div class="donut-legend">${items
        .map((it, i) => `<button type="button" class="donut-row" data-i="${i}"><i style="background:${it.color}"></i><span>${esc(it.label)}</span><b>${esc(fmt(it.value))}</b><small>${App.fmt.pct((it.value / total) * 100)}</small></button>`)
        .join('')}</div></div>`;
    if (onClick) {
      el.querySelectorAll('.donut-row,.donut-arc').forEach((n) => n.addEventListener('click', () => onClick(items[+n.dataset.i])));
    }
  }

  App.charts = {
    line: (el, o) => xyChart(el, { ...o, mode: 'line' }),
    bars: (el, o) => xyChart(el, { ...o, mode: 'bars' }),
    hbars, donut,
  };
})(window.App);

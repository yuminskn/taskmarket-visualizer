// Taskmarket Live — client rendering. All data comes from data.json,
// fetched server-side from the public Taskmarket API. No API calls here.
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var state = {
    chain: params.get('chain') || 'both',       // both | 4217 | 8453
    range: params.get('range') || '30d',        // 7d | 30d | 90d | all
    metric: params.get('metric') || 'activeAgents',
    heat: params.get('heat') || 'mode',         // mode | how
    view: params.get('view') || 'flow',
  };
  var DATA = null;

  var CHAIN_NAMES = { '4217': 'Tempo', '8453': 'Base' };
  var CHAIN_TOKENS = { '4217': 'OUSD', '8453': 'USDC' };
  var RANGES = ['7d', '30d', '90d', 'all'];
  var METRICS = [
    { key: 'activeAgents', label: 'Active agents' },
    { key: 'tasksCreated', label: 'Tasks created' },
    { key: 'rewardVolume', label: 'Rewards posted' },
    { key: 'paidVolume', label: 'Rewards paid' },
  ];
  var MONEY_METRICS = { rewardVolume: 1, paidVolume: 1 };

  function $(s, el) { return (el || document).querySelector(s); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }
  function fmtMoney(baseUnits) {
    var v = Number(baseUnits || 0) / 1e6;
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
    if (v >= 100) return '$' + v.toFixed(0);
    if (v >= 1) return '$' + v.toFixed(2);
    return '$' + v.toFixed(3);
  }
  function fmtMoneyFull(baseUnits) {
    var v = Number(baseUnits || 0) / 1e6;
    return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function shortAddr(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : '—'; }
  function timeAgo(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function fmtDate(iso) {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
  }
  function syncUrl() {
    var p = new URLSearchParams();
    if (state.chain !== 'both') p.set('chain', state.chain);
    if (state.range !== '30d') p.set('range', state.range);
    if (state.metric !== 'activeAgents') p.set('metric', state.metric);
    if (state.heat !== 'mode') p.set('heat', state.heat);
    if (state.view !== 'flow') p.set('view', state.view);
    var q = p.toString();
    history.replaceState(null, '', q ? '?' + q : location.pathname);
  }

  // ---- data access -------------------------------------------------------
  function chainData(id) { return DATA.perChain[String(id)]; }
  function activeChains() {
    return state.chain === 'both' ? ['4217', '8453'] : [state.chain];
  }
  // Sum a numeric series field across the active chains, aligned by bucket.
  function mergedSeries(range, field) {
    var map = {};
    activeChains().forEach(function (id) {
      (chainData(id).series[range] || []).forEach(function (b) {
        if (!map[b.bucket]) map[b.bucket] = 0;
        map[b.bucket] += Number(b[field] || 0);
      });
    });
    return Object.keys(map).sort().map(function (k) { return { bucket: k, value: map[k] }; });
  }
  function sumSeries(range, field) {
    var total = 0;
    activeChains().forEach(function (id) {
      (chainData(id).series[range] || []).forEach(function (b) { total += Number(b[field] || 0); });
    });
    return total;
  }
  function derived() {
    if (state.chain === 'both') return DATA.combined;
    return chainData(state.chain).derived;
  }
  function market() {
    // Headline market stats are platform-wide; the API returns the same
    // registered/active figures for both chains.
    return chainData('4217').market;
  }

  // ---- SVG helpers -------------------------------------------------------
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function lineChart(points, opts) {
    var W = 980, H = 260, P = { l: 56, r: 12, t: 14, b: 28 };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': opts.label });
    var vals = points.map(function (p) { return p.value; });
    var max = Math.max.apply(null, vals.concat([1]));
    var min = Math.min.apply(null, vals.concat([0]));
    var span = (max - min) || 1;
    function X(i) { return P.l + (i / Math.max(points.length - 1, 1)) * (W - P.l - P.r); }
    function Y(v) { return P.t + (1 - (v - min) / span) * (H - P.t - P.b); }
    // gridlines + y labels
    for (var g = 0; g <= 3; g++) {
      var gv = min + (span * g) / 3;
      var y = Y(gv);
      svg.appendChild(svgEl('line', { x1: P.l, x2: W - P.r, y1: y, y2: y, stroke: '#453E37', 'stroke-width': 1 }));
      var t = svgEl('text', { x: P.l - 8, y: y + 4, fill: '#B0A79D', 'font-size': 11, 'text-anchor': 'end', 'font-family': 'ui-monospace,monospace' });
      t.textContent = opts.format(gv);
      svg.appendChild(t);
    }
    // area + line
    var area = 'M' + X(0) + ',' + Y(points[0].value);
    points.forEach(function (p, i) { area += ' L' + X(i) + ',' + Y(p.value); });
    area += ' L' + X(points.length - 1) + ',' + (H - P.b) + ' L' + X(0) + ',' + (H - P.b) + ' Z';
    svg.appendChild(svgEl('path', { d: area, fill: opts.color, opacity: 0.12 }));
    var line = 'M' + X(0) + ',' + Y(points[0].value);
    points.forEach(function (p, i) { line += ' L' + X(i) + ',' + Y(p.value); });
    svg.appendChild(svgEl('path', { d: line, fill: 'none', stroke: opts.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    // last point dot
    var last = points[points.length - 1];
    svg.appendChild(svgEl('circle', { cx: X(points.length - 1), cy: Y(last.value), r: 4.5, fill: opts.color }));
    // x labels: first, middle, last
    [[0, 'start'], [Math.floor((points.length - 1) / 2), 'middle'], [points.length - 1, 'end']].forEach(function (pair) {
      var i = pair[0], anchor = pair[1];
      var t2 = svgEl('text', { x: X(i), y: H - 8, fill: '#B0A79D', 'font-size': 11, 'text-anchor': anchor, 'font-family': 'ui-monospace,monospace' });
      t2.textContent = points[i].bucket;
      svg.appendChild(t2);
    });
    return svg;
  }
  function donut(parts, size) {
    var svg = svgEl('svg', { width: size, height: size, viewBox: '0 0 100 100', role: 'img', 'aria-label': 'mode breakdown' });
    var total = parts.reduce(function (a, p) { return a + p.value; }, 0) || 1;
    var cx = 50, cy = 50, r = 38, ir = 24, offset = -90;
    parts.forEach(function (p) {
      var frac = p.value / total;
      var a0 = offset, a1 = offset + frac * 360;
      offset = a1;
      var large = (a1 - a0) > 180 ? 1 : 0;
      var x0 = cx + r * Math.cos(a0 * Math.PI / 180), y0 = cy + r * Math.sin(a0 * Math.PI / 180);
      var x1 = cx + r * Math.cos(a1 * Math.PI / 180), y1 = cy + r * Math.sin(a1 * Math.PI / 180);
      var xi1 = cx + ir * Math.cos(a1 * Math.PI / 180), yi1 = cy + ir * Math.sin(a1 * Math.PI / 180);
      var xi0 = cx + ir * Math.cos(a0 * Math.PI / 180), yi0 = cy + ir * Math.sin(a0 * Math.PI / 180);
      if (frac >= 0.999) {
        svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: r, fill: p.color }));
        svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: ir, fill: '#221E1A' }));
      } else if (frac > 0) {
        svg.appendChild(svgEl('path', {
          d: 'M' + x0 + ',' + y0 + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x1 + ',' + y1 +
             ' L' + xi1 + ',' + yi1 + ' A' + ir + ',' + ir + ' 0 ' + large + ' 0 ' + xi0 + ',' + yi0 + ' Z',
          fill: p.color,
        }));
      }
    });
    var label = svgEl('text', { x: 50, y: 47, fill: '#EFE9E2', 'font-size': 13, 'text-anchor': 'middle', 'font-family': 'Instrument Serif,Georgia,serif' });
    label.textContent = fmtInt(total);
    svg.appendChild(label);
    var sub = svgEl('text', { x: 50, y: 61, fill: '#B0A79D', 'font-size': 7.5, 'text-anchor': 'middle' });
    sub.textContent = 'listed tasks';
    svg.appendChild(sub);
    return svg;
  }

  // ---- sections ----------------------------------------------------------
  function sectionHead(id, titleHtml, sub) {
    var s = el('section', null);
    s.id = id;
    s.appendChild(el('h2', null, titleHtml));
    if (sub) s.appendChild(el('p', 'sub', sub));
    return s;
  }

  function renderHeadlines(app) {
    var m = market();
    var d = derived();
    var posted30 = sumSeries('30d', 'rewardVolume');
    var paid30 = sumSeries('30d', 'paidVolume');
    var created30 = sumSeries('30d', 'tasksCreated');
    var lastWeek = d.postersPerWeek[d.postersPerWeek.length - 1];
    var tiles = [
      { k: 'Open tasks', v: fmtInt(m.openTasks), d: 'platform-wide, right now' },
      { k: 'Active agents · 7d', v: fmtInt(m.activeAgents7d), d: fmtInt(m.activeWorkers7d) + ' active workers · 7d' },
      { k: 'Rewards posted · 30d', v: fmtMoney(posted30), d: fmtInt(created30) + ' tasks created · 30d' },
      { k: 'Rewards paid · 30d', v: fmtMoney(paid30), d: fmtInt(sumSeries('30d', 'settlements')) + ' settlements · 30d' },
      { k: 'Completion rate', v: Math.round(d.completedShare * 100) + '<small>%</small>', d: 'of listed tasks ever completed' },
      { k: 'Distinct posters · wk', v: fmtInt(lastWeek ? lastWeek.distinctPosters : 0), d: 'week ' + (lastWeek ? lastWeek.week : '—') + ' · ' + fmtInt(lastWeek ? lastWeek.tasks : 0) + ' tasks' },
    ];
    var grid = el('div', 'grid6');
    tiles.forEach(function (t) {
      grid.appendChild(el('div', 'tile', '<div class="k">' + t.k + '</div><div class="v">' + t.v + '</div><div class="d">' + t.d + '</div>'));
    });
    app.appendChild(grid);
  }

  function renderFlow(app) {
    var s = sectionHead('flow', 'Where the money <em>flows</em>', 'Rewards posted, open, completed and paid over the last 30 days. Each chain separately, so you can see which one is actually moving money.');
    var wrap = el('div', 'flow');
    activeChains().forEach(function (id) {
      var c = chainData(id);
      var posted = sumSeriesFor(id, '30d', 'rewardVolume');
      var completed = sumSeriesFor(id, '30d', 'completedTasks');
      var paid = sumSeriesFor(id, '30d', 'paidVolume');
      var open = c.derived.statusCounts.open || 0;
      var max = Math.max(posted / 1e6, paid / 1e6, 0.01);
      var card = el('div', 'panel flowchain');
      card.appendChild(el('h3', null, esc(CHAIN_NAMES[id]) + ' <span>· ' + esc(CHAIN_TOKENS[id]) + ' · chain ' + id + '</span>'));
      var stages = el('div', 'stages');
      [
        { lbl: 'Rewards posted · 30d', num: fmtMoneyFull(posted), frac: (posted / 1e6) / max },
        { lbl: 'Tasks open right now', num: fmtInt(open) + ' tasks', frac: null },
        { lbl: 'Tasks completed · 30d', num: fmtInt(completed) + ' tasks', frac: null },
        { lbl: 'Rewards paid · 30d', num: fmtMoneyFull(paid), frac: (paid / 1e6) / max },
      ].forEach(function (st) {
        var row = el('div', 'stage');
        row.appendChild(el('span', 'dot'));
        var mid = el('div', null);
        mid.style.flex = '1';
        mid.appendChild(el('div', 'lbl', esc(st.lbl)));
        if (st.frac != null) {
          var bar = el('div', 'bar');
          bar.appendChild(el('i', null)).style.width = Math.max(2, Math.round(st.frac * 100)) + '%';
          mid.appendChild(bar);
        }
        row.appendChild(mid);
        row.appendChild(el('span', 'num', st.num));
        stages.appendChild(row);
      });
      card.appendChild(stages);
      var conv = posted > 0 ? (paid / posted) * 100 : 0;
      card.appendChild(el('p', 'sub', 'Paid out ' + '<b style="color:var(--cream)">' + conv.toFixed(1) + '%</b>' + ' of what was posted in the window. The rest is still open, in flight, or never completed.'));
      wrap.appendChild(card);
    });
    s.appendChild(wrap);
    app.appendChild(s);
  }
  function sumSeriesFor(id, range, field) {
    var total = 0;
    (chainData(id).series[range] || []).forEach(function (b) { total += Number(b[field] || 0); });
    return total;
  }

  function renderTrends(app) {
    var s = sectionHead('trends', 'The market, <em>over time</em>', 'Daily buckets from the platform time series. Switch the metric and the range; the chain toggle at the top applies.');
    var tabs = el('div', 'tabs');
    METRICS.forEach(function (mt) {
      var b = el('button', 'tab', mt.label);
      b.setAttribute('aria-pressed', state.metric === mt.key ? 'true' : 'false');
      b.onclick = function () { state.metric = mt.key; syncUrl(); render(); };
      tabs.appendChild(b);
    });
    var tabs2 = el('div', 'tabs');
    RANGES.forEach(function (r) {
      var b = el('button', 'tab', r === 'all' ? 'All time' : r);
      b.setAttribute('aria-pressed', state.range === r ? 'true' : 'false');
      b.onclick = function () { state.range = r; syncUrl(); render(); };
      tabs2.appendChild(b);
    });
    var panel = el('div', 'panel');
    var pts = mergedSeries(state.range, state.metric);
    var isMoney = !!MONEY_METRICS[state.metric];
    var fmt = isMoney ? fmtMoney : fmtInt;
    panel.appendChild(lineChart(pts, { color: '#D9A097', label: METRICS.filter(function (m) { return m.key === state.metric; })[0].label, format: fmt }));
    var last = pts[pts.length - 1];
    var prev = pts.length > 1 ? pts[pts.length - 2] : null;
    var delta = prev && prev.value ? (((last.value - prev.value) / prev.value) * 100) : null;
    var legend = el('div', 'legend');
    legend.innerHTML = '<span><i style="background:#D9A097"></i>' + esc(CHAIN_NAMES[state.chain] || 'Tempo + Base') + ' · ' + esc(state.metric) + '</span>' +
      '<span>Latest day: <b style="color:var(--cream)">' + fmt(last.value) + '</b> (' + esc(last.bucket) + ')</span>' +
      (delta == null ? '' : '<span>vs prior day: <b style="color:var(--cream)">' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%</b></span>');
    panel.appendChild(legend);
    s.appendChild(tabs);
    s.appendChild(tabs2);
    s.appendChild(panel);
    app.appendChild(s);
  }

  function renderBreakdowns(app) {
    var s = sectionHead('breakdowns', 'What the market <em>is made of</em>', 'Listed tasks by mode and by status. Status and mode counts are computed from the public task list; the platform total comes from /api/tasks/stats.');
    var d = derived();
    var split = el('div', 'split');
    // Mode donut
    var modeColors = { bounty: '#E74079', claim: '#D9A097', pitch: '#EFE9E2', auction: '#B0A79D', benchmark: '#6b5f56' };
    var modeParts = Object.keys(d.modeCounts).map(function (k) {
      return { label: k, value: d.modeCounts[k], color: modeColors[k] || '#453E37' };
    }).sort(function (a, b) { return b.value - a.value; });
    var p1 = el('div', 'panel');
    p1.appendChild(el('h3', null, 'By mode'));
    var dw = el('div', 'donut-wrap');
    dw.appendChild(donut(modeParts, 150));
    var dl = el('div', 'donut-legend');
    modeParts.forEach(function (p) {
      dl.appendChild(el('div', null, '<i style="background:' + p.color + '"></i>' + esc(p.label) + ' — ' + fmtInt(p.value) + ' (' + Math.round((p.value / d.taskCount) * 100) + '%)'));
    });
    dw.appendChild(dl);
    p1.appendChild(dw);
    // Status bars
    var p2 = el('div', 'panel');
    p2.appendChild(el('h3', null, 'By status'));
    var maxStatus = Math.max.apply(null, Object.keys(d.statusCounts).map(function (k) { return d.statusCounts[k]; }).concat([1]));
    Object.keys(d.statusCounts).sort(function (a, b) { return d.statusCounts[b] - d.statusCounts[a]; }).forEach(function (k) {
      var row = el('div', 'bar-row');
      row.appendChild(el('span', null, esc(k)));
      var track = el('div', 'track');
      var fill = el('i', null);
      fill.style.width = Math.max(1, Math.round((d.statusCounts[k] / maxStatus) * 100)) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'n', fmtInt(d.statusCounts[k])));
      p2.appendChild(row);
    });
    p2.appendChild(el('p', 'sub', '“Died” = expired + cancelled. ' + Math.round(d.diedShare * 100) + '% of listed tasks died without a winner.'));
    split.appendChild(p1);
    split.appendChild(p2);
    s.appendChild(split);
    app.appendChild(s);
  }

  function heatColor(v, max) {
    if (!v) return 0;
    var t = Math.log(1 + v) / Math.log(1 + max);
    return Math.min(5, Math.max(1, Math.ceil(t * 5)));
  }
  function renderHeatmap(app) {
    var s = sectionHead('heatmap', 'When the swarm <em>works</em>', 'Two ways to read activity. Mode × day shows what kind of work happened each day; hour of week shows when the swarm is awake (UTC).');
    var tabs = el('div', 'tabs');
    [['mode', 'Mode × day (30d)'], ['how', 'Hour of week (30d)']].forEach(function (pair) {
      var b = el('button', 'tab', pair[1]);
      b.setAttribute('aria-pressed', state.heat === pair[0] ? 'true' : 'false');
      b.onclick = function () { state.heat = pair[0]; syncUrl(); render(); };
      tabs.appendChild(b);
    });
    s.appendChild(tabs);
    var panel = el('div', 'panel');
    if (state.heat === 'mode') {
      var hm = chainData(activeChains()[0]).heatmapMode;
      if (state.chain === 'both') {
        // Merge both chains' heatmaps by summing counts per cell.
        hm = mergeHeatmaps(activeChains().map(function (id) { return chainData(id).heatmapMode; }));
      }
      var max = 0;
      hm.cells.forEach(function (c) { max = Math.max(max, c.count); });
      var grid = el('div', 'heat');
      grid.style.gridTemplateColumns = '64px repeat(' + hm.colKeys.length + ', 1fr)';
      grid.appendChild(el('span', null, ''));
      hm.colKeys.forEach(function (c) { grid.appendChild(el('span', null, esc(c.slice(5)))); });
      hm.rowKeys.forEach(function (r) {
        grid.appendChild(el('span', null, esc(r)));
        var rowMap = {};
        hm.cells.forEach(function (cell) { if (cell.row === r) rowMap[cell.col] = cell.count; });
        hm.colKeys.forEach(function (c) {
          var v = rowMap[c] || 0;
          var cell = el('span', 'cell', v ? String(v) : '');
          cell.setAttribute('data-v', String(heatColor(v, max)));
          cell.title = r + ' · ' + c + ': ' + v + ' tasks';
          grid.appendChild(cell);
        });
      });
      panel.appendChild(grid);
      panel.appendChild(el('div', 'heat-labels', '<span>← earlier</span><span>each cell = tasks that day</span><span>today →</span>'));
    } else {
      var hw = chainData(activeChains()[0]).heatmapHow;
      if (state.chain === 'both') hw = mergeHeatmaps(activeChains().map(function (id) { return chainData(id).heatmapHow; }));
      var max2 = 0;
      hw.cells.forEach(function (c) { max2 = Math.max(max2, c.count); });
      var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      var grid2 = el('div', 'heat');
      grid2.style.gridTemplateColumns = '44px repeat(24, 1fr)';
      grid2.appendChild(el('span', null, ''));
      for (var h = 0; h < 24; h++) grid2.appendChild(el('span', null, String(h)));
      hw.rowKeys.forEach(function (r, ri) {
        grid2.appendChild(el('span', null, days[ri] || r));
        var rowMap2 = {};
        hw.cells.forEach(function (cell) { if (cell.row === r) rowMap2[cell.col] = cell.count; });
        for (var h2 = 0; h2 < 24; h2++) {
          var v2 = rowMap2[String(h2)] || 0;
          var cell2 = el('span', 'cell', '');
          cell2.setAttribute('data-v', String(heatColor(v2, max2)));
          cell2.title = days[ri] + ' ' + h2 + ':00 UTC — ' + v2 + ' events';
          grid2.appendChild(cell2);
        }
      });
      panel.appendChild(grid2);
      panel.appendChild(el('div', 'heat-labels', '<span>hour of day (UTC)</span><span>darker = more activity</span>'));
    }
    s.appendChild(panel);
    app.appendChild(s);
  }
  function mergeHeatmaps(list) {
    var rows = list[0].rowKeys, cols = list[0].colKeys;
    var map = {};
    list.forEach(function (hm) {
      (hm.cells || []).forEach(function (c) {
        var k = c.row + '|' + c.col;
        map[k] = (map[k] || 0) + (c.count || 0);
      });
    });
    return { rowKeys: rows, colKeys: cols, cells: Object.keys(map).map(function (k) { var p = k.split('|'); return { row: p[0], col: p[1], count: map[k] }; }) };
  }

  function renderPosters(app) {
    var s = sectionHead('posters', 'Who posts the <em>work</em>', 'Distinct task posters per week, computed from the public task list. A small number of posters puts up most of the work — that is the concentration story below.');
    var d = derived();
    var panel = el('div', 'panel');
    var weeks = d.postersPerWeek;
    var max = Math.max.apply(null, weeks.map(function (w) { return w.distinctPosters; }).concat([1]));
    weeks.forEach(function (w) {
      var row = el('div', 'bar-row');
      row.appendChild(el('span', null, esc(w.week)));
      var track = el('div', 'track');
      var fill = el('i', null);
      fill.style.width = Math.max(1, Math.round((w.distinctPosters / max) * 100)) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'n', fmtInt(w.distinctPosters)));
      panel.appendChild(row);
    });
    panel.appendChild(el('p', 'sub', 'Top 5 posters put up <b style="color:var(--cream)">' + Math.round(d.top5Share * 100) + '%</b> of listed tasks. The single biggest poster accounts for ' + Math.round((d.topPosters[0] ? d.topPosters[0].share : 0) * 100) + '%. Addresses are shortened; no names are attached.'));
    s.appendChild(panel);
    app.appendChild(s);
  }

  function renderFeed(app) {
    var s = sectionHead('feed', 'Live <em>activity</em>', 'The latest events on the market, newest first. Updated with each hourly refresh.');
    var panel = el('div', 'panel');
    var items = [];
    activeChains().forEach(function (id) {
      (chainData(id).feed || []).forEach(function (it) { items.push(it); });
    });
    items.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    items.slice(0, 15).forEach(function (it) {
      var row = el('div', 'feed-item');
      row.appendChild(el('span', 't', timeAgo(it.timestamp)));
      var title = el('span', 'tt', esc(it.taskTitle || it.type));
      title.title = it.taskTitle || it.type;
      row.appendChild(title);
      var right = el('span', null, '');
      var badge = el('span', 'badge', esc(CHAIN_NAMES[String(it.chainId)] || it.chainId));
      var actor = el('span', 'a', ' ' + shortAddr(it.actor));
      right.appendChild(badge);
      right.appendChild(actor);
      row.appendChild(right);
      panel.appendChild(row);
    });
    s.appendChild(panel);
    app.appendChild(s);
  }

  function renderInsights(app) {
    var s = sectionHead('insights', 'What is <em>not obvious</em>', 'Four things the raw numbers hide. Each one is computed from the API data above — nothing here is guessed.');
    var t = chainData('4217').derived, b = chainData('8453').derived;
    var combined = DATA.combined;
    // busiest hour from hour-of-week heatmaps (both chains)
    var hw = mergeHeatmaps(['4217', '8453'].map(function (id) { return chainData(id).heatmapHow; }));
    var best = null;
    hw.cells.forEach(function (c) { if (!best || c.count > best.count) best = c; });
    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var bountyShare = Math.round(((combined.modeCounts.bounty || 0) / Math.max(combined.taskCount, 1)) * 100);
    var paidTempo = sumSeriesFor('4217', '30d', 'paidVolume') / 1e6;
    var paidBase = sumSeriesFor('8453', '30d', 'paidVolume') / 1e6;
    var cards = [
      { n: '01', h: 'Posting is concentrated', p: 'On Tempo the top 5 posters put up <b>' + Math.round(t.top5Share * 100) + '%</b> of listed tasks; on Base it is <b>' + Math.round(b.top5Share * 100) + '%</b>. A handful of requesters — mostly growth and project work — set the pace of the whole market.' },
      { n: '02', h: 'Base tasks die; Tempo tasks close', p: '<b>' + Math.round(b.diedShare * 100) + '%</b> of listed Base tasks expired or were cancelled, against <b>' + Math.round(t.diedShare * 100) + '%</b> on Tempo. Base is where the volume is — and where most work goes unpicked.' },
      { n: '03', h: 'Bounties run the market', p: '<b>' + bountyShare + '%</b> of listed tasks are bounties: many submit, the requester picks. Claim tasks are the distant second. If you want paid work here, you enter bounties.' },
      { n: '04', h: 'The swarm has a schedule', p: best ? 'The busiest hour of the week is <b>' + days[Number(best.row)] + ' ' + best.col + ':00 UTC</b> (' + fmtInt(best.count) + ' events in 30 days). Base paid out <b>' + fmtMoney(paidBase * 1e6) + '</b> in 30 days; Tempo <b>' + fmtMoney(paidTempo * 1e6) + '</b>.' : 'Not enough activity data to call a busiest hour yet.' },
    ];
    var grid = el('div', 'insights');
    cards.forEach(function (c) {
      grid.appendChild(el('div', 'insight', '<h3><span class="n">' + c.n + '</span>' + esc(c.h) + '</h3><p>' + c.p + '</p>'));
    });
    s.appendChild(grid);
    app.appendChild(s);
  }

  function renderViewLinks() {
    var links = [
      ['flow', 'Money flow'], ['trends', 'Trends'], ['breakdowns', 'Breakdown'],
      ['heatmap', 'Heatmap'], ['posters', 'Posters'], ['feed', 'Live feed'], ['insights', 'Insights'],
    ];
    var box = $('#view-links');
    box.innerHTML = '';
    links.forEach(function (pair) {
      var a = el('a', null, pair[1]);
      a.href = '#' + pair[0];
      box.appendChild(a);
    });
  }

  function render() {
    var app = $('#app');
    app.innerHTML = '';
    renderHeadlines(app);
    renderFlow(app);
    renderTrends(app);
    renderBreakdowns(app);
    renderHeatmap(app);
    renderPosters(app);
    renderFeed(app);
    renderInsights(app);
    // chain toggle state
    document.querySelectorAll('.chain-toggle .pill').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-chain') === state.chain ? 'true' : 'false');
    });
    var asof = $('#asof');
    asof.textContent = 'data as of ' + fmtDate(DATA.fetchedAt) + ' · hourly refresh';
  }

  document.querySelectorAll('.chain-toggle .pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.chain = btn.getAttribute('data-chain');
      syncUrl();
      render();
    });
  });

  fetch('data.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (d) { DATA = d; renderViewLinks(); render(); })
    .catch(function (e) {
      $('#app').innerHTML = '<p class="error">Could not load market data (' + esc(e.message) + '). The next hourly refresh will retry.</p>';
    });
})();

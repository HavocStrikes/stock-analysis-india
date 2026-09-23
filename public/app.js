/* TickerTape India — terminal frontend. Zero dependencies. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const API_BASE = (window.STOCKLENS && window.STOCKLENS.apiBase) || '';

  const UNIVERSE = [
    ['RELIANCE.NS', 'Reliance Industries', 'Energy'], ['HDFCBANK.NS', 'HDFC Bank', 'Banking'],
    ['TCS.NS', 'Tata Consultancy Svcs', 'IT'], ['INFY.NS', 'Infosys', 'IT'],
    ['ICICIBANK.NS', 'ICICI Bank', 'Banking'], ['SBIN.NS', 'State Bank of India', 'Banking'],
    ['BHARTIARTL.NS', 'Bharti Airtel', 'Telecom'], ['ITC.NS', 'ITC', 'FMCG'],
    ['LT.NS', 'Larsen & Toubro', 'Infra'], ['TMCV.NS', 'Tata Motors Comm Veh', 'Auto'],
    ['TATASTEEL.NS', 'Tata Steel', 'Metals'], ['MARUTI.NS', 'Maruti Suzuki', 'Auto'],
    ['SUNPHARMA.NS', 'Sun Pharma', 'Pharma'], ['TITAN.NS', 'Titan Company', 'Consumer'],
    ['AXISBANK.NS', 'Axis Bank', 'Banking'], ['KOTAKBANK.NS', 'Kotak Mahindra', 'Banking'],
    ['HINDUNILVR.NS', 'Hindustan Unilever', 'FMCG'], ['NTPC.NS', 'NTPC', 'Power'],
    ['POWERGRID.NS', 'Power Grid Corp', 'Power'], ['ONGC.NS', 'Oil & Nat Gas Corp', 'Energy'],
    ['BAJFINANCE.NS', 'Bajaj Finance', 'NBFC'], ['ADANIENT.NS', 'Adani Enterprises', 'Infra'],
    ['TATAPOWER.NS', 'Tata Power', 'Power'], ['WIPRO.NS', 'Wipro', 'IT'],
  ];
  const IDX = ['^NSEI', '^BSESN', '^NSEBANK'];
  const RANGES = [['1d', '1D'], ['5d', '1W'], ['1mo', '1M'], ['6mo', '6M'], ['1y', '1Y'], ['5y', '5Y']];
  let range = '6mo';
  const show = { ma: true, bb: false, vol: true };
  const MODE = { live: true, at: null };
  const UNI = {};
  UNIVERSE.forEach(([s, n, sec]) => { UNI[s] = { name: n, sector: sec }; });
  const short = (s) => s.replace('.NS', '').replace('.BO', '');

  /* ---------- format ---------- */
  const inr = (v, d = 2) => v == null || !isFinite(v) ? '—' : '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: d });
  const num = (v, d = 2) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: d });
  const bigInr = (v) => {
    if (v == null || !isFinite(v)) return '—';
    if (v >= 1e7) return '₹' + (v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' Cr';
    if (v >= 1e5) return '₹' + (v / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' L';
    return inr(v, 0);
  };
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const chgBox = (c) => c == null ? '—' : `<span class="chgbox ${(c >= 0 ? 'up' : 'down')}">${c >= 0 ? '+' : ''}${num(c)}%</span>`;
  const watch = {
    get() { try { return JSON.parse(localStorage.getItem('tt-watch') || '[]'); } catch { return []; } },
    has(s) { return this.get().includes(s); },
    toggle(s) {
      let w = this.get();
      w = w.includes(s) ? w.filter((x) => x !== s) : [...w, s];
      try { localStorage.setItem('tt-watch', JSON.stringify(w)); } catch {}
      return w.includes(s);
    },
  };

  /* ---------- data: live API with static snapshot fallback ---------- */
  const S = {};
  async function sjson(p) {
    if (!S[p]) {
      const r = await fetch(p);
      if (!r.ok) throw new Error('static ' + r.status);
      S[p] = await r.json();
    }
    return S[p];
  }
  function paintMode() {
    const b = $('#modeBadge');
    if (b) {
      b.textContent = MODE.live ? '● LIVE' : '○ SNAPSHOT' + (MODE.at ? ' ' + MODE.at : '');
      b.style.color = MODE.live ? 'var(--up)' : 'var(--accent-ink)';
    }
  }
  async function api(path) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(API_BASE + path, { signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) throw new Error('api ' + r.status);
      MODE.live = true;
      const d = await r.json();
      if (d.fetchedAt) MODE.at = new Date(d.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      paintMode();
      return d;
    } catch (e) {
      MODE.live = false;
      paintMode();
      return staticApi(path);
    }
  }
  async function staticApi(path) {
    const u = new URL(path, 'http://x');
    const p = u.pathname, q = Object.fromEntries(u.searchParams);
    if (p === '/api/markets') {
      const d = await sjson('data/markets.json');
      MODE.at = new Date(d.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      paintMode();
      return d;
    }
    if (p === '/api/batch') {
      const Q = await sjson('data/quotes.json');
      const want = (q.symbols || '').split(',');
      MODE.at = new Date(Q.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      paintMode();
      return {
        fetchedAt: Q.fetchedAt,
        quotes: Q.quotes.filter((x) => want.includes(x.symbol))
          .map((x) => ({ symbol: x.symbol, ok: true, meta: x.meta, closes: x.closes, sector: x.sector, pe: x.pe })),
      };
    }
    if (p === '/api/chart') {
      const f = await sjson(`data/stocks/${q.symbol}.json`);
      if (!f.ok) throw new Error('no snapshot');
      const series = q.range === '1d' ? f.intraday : q.range === '5d' ? f.daily.slice(-5)
        : q.range === '1mo' ? f.daily.slice(-22) : q.range === '6mo' ? f.daily.slice(-130)
        : q.range === '1y' ? f.daily : f.weekly;
      return { meta: f.meta, points: series, snapshot: true };
    }
    if (p === '/api/fundamentals') {
      const f = await sjson(`data/stocks/${q.symbol}.json`);
      if (!f.ok || !f.fund) throw new Error('no snapshot');
      return { symbol: q.symbol, ...f.fund, marketCap: f.meta.marketCap };
    }
    if (p === '/api/search') {
      const s = (q.q || '').toLowerCase();
      return {
        query: q.q,
        results: UNIVERSE.filter(([sym, nm]) => (sym + ' ' + nm).toLowerCase().includes(s))
          .slice(0, 8).map(([sym, nm]) => ({ symbol: sym, name: nm, exchange: 'NSE' })),
      };
    }
    throw new Error('offline');
  }
  const closesOf = (q) => q.closes || (q.points || []).map((pt) => pt.c);

  /* ---------- math ---------- */
  const smaArr = (a, n) => a.map((_, i) => i + 1 < n ? null : a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n);
  const sma = (a, n) => a.length < n ? null : a.slice(-n).reduce((x, y) => x + y, 0) / n;
  const emaArr = (a, n) => {
    const k = 2 / (n + 1); let e = a[0]; const out = [e];
    for (let i = 1; i < a.length; i++) { e = a[i] * k + e * (1 - k); out.push(e); }
    return out;
  };
  function rsi(closes, n = 14) {
    if (closes.length < n + 1) return null;
    let g = 0, l = 0;
    for (let i = closes.length - n; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) g += d; else l -= d;
    }
    if (!l) return 100;
    return +((100 - 100 / (1 + (g / n) / (l / n))).toFixed(1));
  }
  function macd(closes) {
    if (closes.length < 35) return null;
    const e12 = emaArr(closes, 12), e26 = emaArr(closes, 26);
    const line = e12.map((v, i) => v - e26[i]);
    const sig = emaArr(line.slice(25), 9);
    const m = line[line.length - 1], s = sig[sig.length - 1];
    return { line: m, signal: s, hist: m - s };
  }

  /* ---------- candlestick chart ---------- */
  function drawChart(canvas, points, tip) {
    const dark = document.documentElement.dataset.theme === 'dark';
    const grid = dark ? 'rgba(236,231,217,.1)' : 'rgba(24,20,16,.08)';
    const txt = dark ? '#6b665a' : '#8a8271';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 900, h = canvas.clientHeight || 380;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d'); c.scale(dpr, dpr);
    const padL = 6, padR = 70, padT = 12, padB = 22;
    const volH = show.vol ? (h - padT - padB) * 0.16 : 0;
    const priceB = h - padB - volH - (show.vol ? 8 : 0);
    const hi = [], lo = [];
    points.forEach((p, i) => {
      hi.push(p.h ?? p.c); lo.push(p.l ?? p.c);
    });
    const mx = Math.max(...hi), mn = Math.min(...lo), sp = (mx - mn) || 1;
    const loY = mn - sp * 0.07, hiY = mx + sp * 0.07;
    const X = (i) => padL + ((i + 0.5) / points.length) * (w - padL - padR);
    const Y = (v) => padT + (1 - (v - loY) / (hiY - loY)) * (priceB - padT);
    const css = getComputedStyle(document.documentElement);
    const brand = css.getPropertyValue('--accent').trim() || '#b45309';
    const upC = dark ? '#4ade80' : '#047857', dnC = dark ? '#f87171' : '#b91c1c';

    c.font = '10.5px "IBM Plex Mono",monospace';
    c.strokeStyle = grid; c.fillStyle = txt; c.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const v = loY + ((hiY - loY) * g) / 4, y = Y(v);
      c.beginPath(); c.moveTo(padL, y); c.lineTo(w - padR, y); c.stroke();
      c.fillText(v >= 1000 ? '₹' + (v / 1000).toFixed(2) + 'k' : '₹' + v.toFixed(v < 10 ? 2 : 0), w - padR + 6, y + 3);
    }
    const cw = (w - padL - padR) / points.length;
    const bw = Math.max(1.5, Math.min(14, cw * 0.62));
    // volume
    if (show.vol) {
      const vols = points.map((p) => p.v || 0);
      const vmax = Math.max(...vols, 1);
      points.forEach((p, i) => {
        if (!p.v) return;
        const o = p.o ?? (i ? points[i - 1].c : p.c);
        c.fillStyle = p.c >= o ? (dark ? 'rgba(74,222,128,.35)' : 'rgba(4,120,87,.3)') : (dark ? 'rgba(248,113,113,.35)' : 'rgba(185,28,28,.3)');
        const bh = Math.max(1, (p.v / vmax) * volH);
        c.fillRect(X(i) - bw / 2, h - padB - bh, bw, bh);
      });
    }
    // candles
    points.forEach((p, i) => {
      const o = p.o ?? (i ? points[i - 1].c : p.c);
      const col = p.c >= o ? upC : dnC;
      const yO = Y(o), yC = Y(p.c), yH = Y(p.h ?? p.c), yL = Y(p.l ?? p.c);
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(1, bw * 0.18);
      c.beginPath(); c.moveTo(X(i), yH); c.lineTo(X(i), yL); c.stroke();
      const top = Math.min(yO, yC), hh = Math.max(1.5, Math.abs(yC - yO));
      if (Math.abs(p.c - o) < sp * 0.002) { c.lineWidth = 1.5; c.beginPath(); c.moveTo(X(i) - bw / 2, yC); c.lineTo(X(i) + bw / 2, yC); c.stroke(); }
      else c.fillRect(X(i) - bw / 2, top, bw, hh);
    });
    // moving averages on closes
    if (show.ma && points.length > 20) {
      const closes = points.map((p) => p.c);
      const line = (arr, color, dash) => {
        c.beginPath(); c.setLineDash(dash);
        arr.forEach((v, i) => { if (v != null) (i === 0 || arr[i - 1] == null ? c.moveTo(X(i), Y(v)) : c.lineTo(X(i), Y(v))); });
        c.strokeStyle = color; c.lineWidth = 1.4; c.stroke(); c.setLineDash([]);
      };
      line(smaArr(closes, 20), brand, []);
      if (points.length >= 50) line(smaArr(closes, 50), dark ? '#22d3ee' : '#0e7490', [5, 4]);
    }
    // Bollinger
    if (show.bb && points.length >= 20) {
      const closes = points.map((p) => p.c);
      const up1 = [], lo1 = [];
      closes.forEach((_, i) => {
        if (i < 19) { up1.push(null); lo1.push(null); return; }
        const win = closes.slice(i - 19, i + 1);
        const mid = win.reduce((a, b) => a + b, 0) / 20;
        const sd = Math.sqrt(win.reduce((a, b) => a + (b - mid) ** 2, 0) / 20);
        up1.push(mid + 2 * sd); lo1.push(mid - 2 * sd);
      });
      c.setLineDash([5, 4]); c.strokeStyle = brand; c.lineWidth = 1;
      [[up1], [lo1]].forEach(([arr]) => {
        c.beginPath();
        arr.forEach((v, i) => { if (v != null) (i === 19 ? c.moveTo(X(i), Y(v)) : c.lineTo(X(i), Y(v))); });
        c.stroke();
      });
      c.setLineDash([]);
    }
    // time labels
    c.fillStyle = txt;
    [0, Math.floor(points.length / 2), points.length - 1].forEach((i) => {
      const d = new Date(points[i].t);
      const lbl = (range === '1d' || range === '5d')
        ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ((range === '1y' || range === '5y') ? " '" + String(d.getFullYear()).slice(2) : '');
      c.fillText(lbl, Math.max(padL, Math.min(X(i) - 24, w - padR - 64)), h - 6);
    });
    canvas._geom = { X, Y, w, h, padL, padR, padT, padB, points };
    if (tip) tip.style.display = 'none';
  }

  function bindCrosshair(canvas, tip) {
    canvas.addEventListener('mousemove', (e) => {
      const g = canvas._geom; if (!g) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const n = g.points.length;
      let i = Math.round((((mx - g.padL) / (g.w - g.padL - g.padR)) * n) - 0.5);
      i = Math.max(0, Math.min(n - 1, i));
      drawChart(canvas, g.points, null);
      const c = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.save(); c.scale(dpr, dpr);
      const dark = document.documentElement.dataset.theme !== 'light';
      c.strokeStyle = dark ? 'rgba(236,231,217,.4)' : 'rgba(24,20,16,.35)';
      c.setLineDash([4, 4]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(g.X(i), g.padT); c.lineTo(g.X(i), g.h - g.padB); c.stroke();
      c.setLineDash([]);
      const p = g.points[i];
      c.beginPath(); c.arc(g.X(i), g.Y(p.c), 4, 0, 7); c.fillStyle = '#fff'; c.fill();
      c.strokeStyle = '#b45309'; c.lineWidth = 2; c.stroke();
      c.restore();
      const d = new Date(p.t);
      const o = p.o ?? p.c;
      const ch = p.c - o, up = ch >= 0;
      tip.style.display = 'block';
      tip.innerHTML = `<b>${inr(p.c)}</b> <span style="color:${up ? '#4ade80' : '#f87171'}">${up ? '+' : ''}${num(ch)} (${num((ch / o) * 100)}%)</span><br>O ${num(o)} H ${num(p.h ?? p.c)} L ${num(p.l ?? p.c)} C ${num(p.c)}<br>${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${(range === '1d' || range === '5d') ? ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}${p.v ? ' · VOL ' + num(p.v, 0) : ''}`;
      const wrap = canvas.parentElement.getBoundingClientRect();
      let lx = e.clientX - wrap.left + 16, ly = e.clientY - wrap.top - 10;
      if (lx + 220 > wrap.width) lx -= 240;
      tip.style.left = lx + 'px'; tip.style.top = Math.max(4, ly) + 'px';
    });
    canvas.addEventListener('mouseleave', () => {
      const g = canvas._geom; if (g) drawChart(canvas, g.points, null);
      tip.style.display = 'none';
    });
  }

  function spark(canvas, closes, up) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 200, h = canvas.clientHeight || 44;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d'); c.scale(dpr, dpr);
    if (closes.length < 2) return;
    const min = Math.min(...closes), max = Math.max(...closes), sp = max - min || 1;
    const dark = document.documentElement.dataset.theme === 'dark';
    const col = up ? (dark ? '#4ade80' : '#047857') : (dark ? '#f87171' : '#b91c1c');
    const X = (i) => (i / (closes.length - 1)) * w, Y = (v) => h - 3 - ((v - min) / sp) * (h - 6);
    c.beginPath();
    closes.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(0), Y(v)));
    c.strokeStyle = col; c.lineWidth = 1.6; c.stroke();
  }

  /* ---------- tables ---------- */
  let sortState = { key: 'mcap', dir: -1 };
  function mcapOf(q) { return q.meta.marketCap ?? q.meta.mCap ?? null; }
  function rsiOf(q) { return rsi(closesOf(q)); }
  function wpos(q) {
    const { week52High: h, week52Low: l, price: p } = q.meta;
    return (h && l && p && h > l) ? ((p - l) / (h - l)) * 100 : null;
  }
  function quoteTable(rows, opts = {}) {
    const star = opts.star ? '<th></th>' : '';
    return `<div class="tbl-wrap"><table class="q"><thead><tr>${star}
      ${[['sym', 'SYMBOL'], ['price', 'LTP'], ['chg', 'CHG%'], ['mcap', 'MKT CAP'], ['pe', 'P/E'], ['rsi', 'RSI'], ['wpos', '52W%']]
        .map(([k, l]) => `<th class="sortable" data-sort="${k}">${l}${sortState.key === k ? (sortState.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}
      </tr></thead><tbody>
      ${rows.map((q) => {
        const nm = (UNI[q.symbol] || {}).name || q.symbol;
        const up = (q.meta.changePct ?? 0) >= 0;
        const r = rsiOf(q);
        return `<tr data-sym="${q.symbol}">${opts.star ? `<td><button class="star ${watch.has(q.symbol) ? 'on' : ''}" data-star="${q.symbol}">★</button></td>` : ''}
        <td><span class="sym">${short(q.symbol)}</span><span class="nm">${esc(nm)}${q.sector ? ` · <span class="sec-tag">${esc(q.sector)}</span>` : ''}</span></td>
        <td>${inr(q.meta.price)}</td>
        <td>${chgBox(q.meta.changePct)}</td>
        <td>${bigInr(mcapOf(q))}</td>
        <td>${q.pe != null ? num(q.pe) : '—'}</td>
        <td style="color:${r == null ? '' : r < 30 ? 'var(--up)' : r > 70 ? 'var(--down)' : ''}">${r ?? '—'}</td>
        <td>${wpos(q) != null ? wpos(q).toFixed(0) + '%' : '—'}</td></tr>`;
      }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--ink-3)">NO DATA</td></tr>'}</tbody></table></div>`;
  }
  function sortRows(rows) {
    const { key, dir } = sortState;
    const val = (q) => key === 'sym' ? q.symbol : key === 'price' ? (q.meta.price ?? -1e18)
      : key === 'chg' ? (q.meta.changePct ?? -1e9) : key === 'mcap' ? (mcapOf(q) ?? -1)
      : key === 'pe' ? (q.pe ?? 1e18) : key === 'rsi' ? (rsiOf(q) ?? -1) : (wpos(q) ?? -1);
    return rows.slice().sort((a, b) => {
      const d = val(a) - val(b);
      return (typeof val(a) === 'string' ? String(val(a)).localeCompare(String(val(b))) : d) * dir;
    });
  }
  function bindTable(el) {
    el.querySelectorAll('th.sortable').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (sortState.key === k) sortState.dir *= -1;
      else sortState = { key: k, dir: k === 'sym' ? 1 : -1 };
      route(true);
    }));
    el.querySelectorAll('tr[data-sym]').forEach((tr) => tr.addEventListener('click', (e) => {
      if (e.target.closest('[data-star]')) return;
      location.hash = '#/' + tr.dataset.sym;
    }));
    el.querySelectorAll('[data-star]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      b.classList.toggle('on', watch.toggle(b.dataset.star));
    }));
  }

  /* ---------- chrome: tape + sidebar ---------- */
  async function loadChrome() {
    try {
      const [mk, b] = await Promise.all([
        api('/api/markets'),
        api('/api/batch?symbols=' + UNIVERSE.map((x) => x[0]).join(',') + '&range=5d'),
      ]);
      const items = [
        ...mk.quotes.map((q) => ({ n: q.name, p: q.symbol === 'INR=X' ? num(q.price) : q.symbol.endsWith('=F') ? '$' + num(q.price) : inr(q.price), c: q.changePct })),
        ...b.quotes.filter((q) => q.ok).map((q) => ({ n: short(q.symbol), p: inr(q.meta.price), c: q.meta.changePct })),
      ].filter((x) => x.c != null);
      $('#tapeTrack').innerHTML = items.map((x) => `<span class="titem">${esc(x.n)} ${x.p} <span class="${x.c >= 0 ? 'u' : 'd'}">${x.c >= 0 ? '▲' : '▼'}${num(Math.abs(x.c))}%</span></span>`).join('').repeat(2);
      $('#sideIdx').innerHTML = mk.quotes.slice(0, 4).map((q) => `<div class="si"><span>${esc(q.name.toUpperCase())}</span><span class="${(q.changePct ?? 0) >= 0 ? 'up' : 'down'}" style="font-weight:600">${num(q.price, q.price > 5000 ? 0 : 2)} ${(q.changePct ?? 0) >= 0 ? '▲' : '▼'}${num(Math.abs(q.changePct ?? 0))}</span></div>`).join('');
      const f = $('#footStamp');
      if (f) f.textContent = MODE.live ? 'LIVE FEED' : 'SNAPSHOT ' + (MODE.at || '');
    } catch { /* chrome optional */ }
  }

  /* ---------- pages ---------- */
  function dateline(fetchedAt) {
    const d = fetchedAt ? new Date(fetchedAt) : new Date();
    return `<div class="dateline"><span>${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}</span><span>NSE · BSE</span><span>PRICES IN <b>INR</b></span><span>${MODE.live ? '● LIVE' : '○ SNAPSHOT ' + (MODE.at || '')}</span></div>`;
  }

  let homeCache = null;
  async function marketPage() {
    app.innerHTML = dateline() + `
      <div class="sec"><div class="sec-head"><h2>QUOTATIONS</h2><span class="sub">24 TRACKED STOCKS</span><span class="right" id="qHint">LOADING…</span></div>
      <div id="qTbl" style="margin-top:12px"><div class="skel"></div></div></div>
      <div class="sec"><div class="sec-head"><h2>MOVERS</h2><span class="sub">TODAY</span></div>
      <div class="split" style="margin-top:12px"><div class="mpanel"><h3 class="g">▲ TOP GAINERS</h3><div id="gTbl"></div></div>
      <div class="mpanel"><h3 class="r">▼ TOP LOSERS</h3><div id="lTbl"></div></div></div></div>
      <div class="sec"><div class="sec-head"><h2>WATCHLIST</h2><span class="sub">THIS DEVICE</span></div><div id="wTbl" style="margin-top:12px"></div></div>`;
    renderWatch();
    try {
      if (!homeCache) {
        const b = await api('/api/batch?symbols=' + UNIVERSE.map((x) => x[0]).join(',') + '&range=6mo');
        homeCache = b;
      }
      const ok = homeCache.quotes.filter((q) => q.ok).map((q) => ({ ...q, sector: q.sector || (UNI[q.symbol] || {}).sector }));
      const hint = $('#qHint');
      if (hint) hint.textContent = `${ok.length}/${UNIVERSE.length} LIVE`;
      const sorted = sortRows(ok);
      $('#qTbl').innerHTML = quoteTable(sorted, { star: true });
      bindTable($('#qTbl'));
      const byChg = ok.slice().sort((a, b) => (b.meta.changePct ?? -99) - (a.meta.changePct ?? -99));
      const mini = (rows) => `<table class="q"><tbody>${rows.map((q) => `<tr data-sym="${q.symbol}"><td><span class="sym">${short(q.symbol)}</span><span class="nm">${esc((UNI[q.symbol] || {}).name || '')}</span></td><td>${inr(q.meta.price)}</td><td>${chgBox(q.meta.changePct)}</td></tr>`).join('')}</tbody></table>`;
      $('#gTbl').innerHTML = mini(byChg.slice(0, 5));
      $('#lTbl').innerHTML = mini(byChg.slice(-5).reverse());
      document.querySelectorAll('#gTbl tr,#lTbl tr').forEach((tr) => tr.addEventListener('click', () => location.hash = '#/' + tr.dataset.sym));
    } catch {
      $('#qTbl').innerHTML = '<div class="empty">QUOTES OFFLINE — RETRY IN A MOMENT</div>';
    }
  }

  async function screenerPage() {
    app.innerHTML = dateline() + `
      <div class="sec"><div class="sec-head"><h2>SCREENER</h2><span class="sub">SIGNALS FROM DAILY CLOSES</span></div>
      <div class="ledger" id="ledgers" style="margin-top:12px">${'<div class="skel"></div>'.repeat(4)}</div></div>`;
    try {
      if (!homeCache) {
        const b = await api('/api/batch?symbols=' + UNIVERSE.map((x) => x[0]).join(',') + '&range=6mo');
        homeCache = b;
      }
      const ok = homeCache.quotes.filter((q) => q.ok && closesOf(q).length >= 55);
      const withR = ok.map((q) => ({ q, r: rsi(closesOf(q)) })).filter((x) => x.r != null);
      const row = (qq, v) => `<tr data-sym="${qq.symbol}"><td><span class="sym">${short(qq.symbol)}</span><span class="nm">${esc((UNI[qq.symbol] || {}).name || '')}</span></td><td>${inr(qq.meta.price)}</td><td class="mono">${v}</td></tr>`;
      const blocks = [
        ['RSI < 35 · OVERSOLD', withR.filter((x) => x.r < 35).sort((a, b) => a.r - b.r).slice(0, 6).map((x) => row(x.q, 'RSI ' + x.r))],
        ['RSI > 70 · OVERBOUGHT', withR.filter((x) => x.r > 70).sort((a, b) => b.r - a.r).slice(0, 6).map((x) => row(x.q, 'RSI ' + x.r))],
        ['GOLDEN TREND · P>SMA20>SMA50', ok.filter((q) => {
          const cl = closesOf(q), s20 = sma(cl, 20), s50 = sma(cl, 50);
          return s20 && s50 && s20 > s50 && q.meta.price > s20;
        }).slice(0, 6).map((q) => row(q, chgBox(q.meta.changePct)))],
        ['NEAR 52W HIGH · ≤8% OFF TOP', ok.filter((q) => {
          const { week52High: h, week52Low: l, price: p } = q.meta;
          return h && l && p && h > l && (h - p) / (h - l) < 0.08;
        }).slice(0, 6).map((q) => row(q, num(wpos(q), 0) + '%'))],
      ];
      $('#ledgers').innerHTML = blocks.map(([t, rows]) => `<div class="block"><h3>${t}<span class="count">${rows.length}</span></h3><table class="q"><tbody>${rows.join('') || '<tr><td style="text-align:center;color:var(--ink-3)">NO MATCHES</td></tr>'}</tbody></table></div>`).join('');
      document.querySelectorAll('#ledgers tr[data-sym]').forEach((tr) => tr.addEventListener('click', () => location.hash = '#/' + tr.dataset.sym));
    } catch {
      $('#ledgers').innerHTML = '<div class="empty">SCREENER OFFLINE — RETRY IN A MOMENT</div>';
    }
  }

  async function renderWatch() {
    const g = $('#wTbl');
    if (!g) return;
    const w = watch.get();
    if (!w.length) { g.innerHTML = '<div class="empty">STAR ★ ANY ROW TO PIN IT HERE</div>'; return; }
    try {
      const b = await api('/api/batch?symbols=' + w.join(',') + '&range=5d');
      const ok = b.quotes.filter((q) => q.ok);
      g.innerHTML = quoteTable(sortRows(ok), { star: true });
      bindTable(g);
    } catch { g.innerHTML = '<div class="empty">WATCHLIST OFFLINE</div>'; }
  }
  async function watchPage() {
    app.innerHTML = dateline() + `<div class="sec"><div class="sec-head"><h2>WATCHLIST</h2><span class="sub">SAVED ON THIS DEVICE</span></div><div id="wTbl" style="margin-top:12px"></div></div>`;
    renderWatch();
  }

  /* ---------- detail ---------- */
  async function detail(sym) {
    app.innerHTML = `<div style="margin-top:16px"><button class="back" id="bk">← MARKET</button></div><div class="page-loading">FETCHING ${esc(sym)} ▮▮▮</div>`;
    $('#bk').addEventListener('click', () => location.hash = '#/');
    try {
      const [ch, fund] = await Promise.all([
        api(`/api/chart?symbol=${sym}&range=${range}`),
        api(`/api/fundamentals?symbol=${sym}`).catch(() => null),
      ]);
      let tech = closesOf({ points: ch.points });
      if (tech.length < 60) {
        try {
          const f = await sjson(`data/stocks/${sym}.json`);
          if (f.ok) tech = f.daily.map((p) => p.c);
        } catch {}
      }
      if (tech.length < 60) {
        try {
          const b = await api(`/api/batch?symbols=${sym}&range=1y`);
          const q = (b.quotes || [])[0];
          if (q && q.ok) tech = closesOf(q);
        } catch {}
      }
      paintDetail(ch, fund, tech);
      document.title = `${short(sym)} — Terminal | TickerTape India`;
    } catch {
      document.title = 'TickerTape India';
      app.innerHTML = `<div style="margin-top:16px"><button class="back" id="bk2">← MARKET</button><div class="empty">NO DATA FOR ${esc(sym)} — TRY ANOTHER SYMBOL</div></div>`;
      $('#bk2').addEventListener('click', () => location.hash = '#/');
    }
  }

  function paintDetail(d, fund, tech) {
    const m = d.meta, f = fund || {};
    const up = (m.changePct ?? 0) >= 0;
    const r = rsi(tech), mc = macd(tech);
    const s20 = sma(tech, 20), s50 = sma(tech, 50);
    const dayPos = (m.dayHigh && m.dayLow && m.dayHigh > m.dayLow && m.price != null)
      ? ((m.price - m.dayLow) / (m.dayHigh - m.dayLow)) * 100 : null;
    const yPos = (m.week52High && m.week52Low && m.week52High > m.week52Low && m.price != null)
      ? ((m.price - m.week52Low) / (m.week52High - m.week52Low)) * 100 : null;
    const on = watch.has(m.symbol);
    const dayChg = m.price != null && m.prevClose ? m.price - m.prevClose : null;
    app.innerHTML = `
      <div style="margin-top:16px"><button class="back" id="bk">← MARKET</button></div>
      <section class="mast">
        <div class="mast-top">
          <div style="min-width:0">
            <h1>${esc(short(m.symbol))} <small>${esc(m.symbol)} · ${esc(m.exchange || '')}</small></h1>
            <div class="tags">${f.sector ? `<span class="tag hot">${esc(f.sector.toUpperCase())}</span>` : ''}${f.industry ? `<span class="tag">${esc(f.industry.toUpperCase())}</span>` : ''}<span class="tag">${MODE.live ? '● LIVE' : '○ SNAPSHOT'}</span></div>
          </div>
          <div class="pxbox">
            <div class="px">${inr(m.price)}</div>
            <div class="ch ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${dayChg != null ? (dayChg >= 0 ? '+' : '') + inr(dayChg).replace('₹', '₹') : ''} (${dayChg != null && m.prevClose ? num((dayChg / m.prevClose) * 100) : num(m.changePct)}%)</div>
            <div class="tm">${m.marketTime ? 'AS OF ' + new Date(m.marketTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST' : ''}</div>
            <button class="watch-btn ${on ? '' : 'off'}" id="wb">${on ? '★ WATCHING' : '☆ WATCH'}</button>
          </div>
        </div>
        <div class="stats">
          ${[['OPEN', d.points.length && d.points[0].o != null ? inr(d.points[0].o) : '—', ''],
             ['PREV CLOSE', inr(m.prevClose), ''],
             ['DAY LOW–HIGH', m.dayLow != null ? inr(m.dayLow, 0) + ' / ' + inr(m.dayHigh, 0) : '—', dayPos != null ? dayPos.toFixed(0) + '% up the day' : ''],
             ['52W LOW–HIGH', m.week52Low != null ? inr(m.week52Low, 0) + ' / ' + inr(m.week52High, 0) : '—', yPos != null ? yPos.toFixed(0) + '% up the range' : ''],
             ['MKT CAP', bigInr(f.marketCap ?? m.marketCap), ''],
             ['P/E TTM', f.peTrailing != null ? num(f.peTrailing) + '×' : '—', f.peForward != null ? 'FWD ' + num(f.peForward) + '×' : ''],
             ['VOLUME', m.volume != null ? num(m.volume, 0) : (d.points.length ? num(d.points[d.points.length - 1].v, 0) : '—'), '']]
            .map(([l, v, s]) => `<div class="stat"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}
        </div>
        <div class="chart-bar">
          ${RANGES.map(([v, l]) => `<button class="range ${v === range ? 'on' : ''}" data-r="${v}">${l}</button>`).join('')}
          <span style="flex:1"></span>
          <button class="tgl ${show.ma ? 'on' : ''}" data-t="ma">MA 20/50</button>
          <button class="tgl ${show.bb ? 'on' : ''}" data-t="bb">BOLL</button>
          <button class="tgl ${show.vol ? 'on' : ''}" data-t="vol">VOL</button>
        </div>
        <div class="chart-box"><canvas id="chart"></canvas><div class="chart-tip" id="ctip"></div></div>
        <div class="chart-meta"><span><i style="background:var(--up)"></i>BULL CANDLE</span><span><i style="background:var(--down)"></i>BEAR CANDLE</span><span><i style="background:var(--accent)"></i>MA 20</span><span>HOVER FOR O/H/L/C</span></div>
        <div class="cols2" style="padding:18px">
          <div><div class="sec-head" style="margin:0 0 6px"><h2>TECHNICALS</h2><span class="sub">DAILY CLOSES · ${tech.length} PTS</span></div>
            <div class="gauge-row"><div class="mono" style="font-size:30px;font-weight:700;color:${r == null ? 'var(--ink-3)' : r < 30 ? 'var(--up)' : r > 70 ? 'var(--down)' : 'var(--accent-ink)'}">${r ?? '—'}</div>
            <div><div style="font-weight:800;font-size:13px">${r == null ? 'NO SIGNAL' : r < 30 ? 'OVERSOLD — BOUNCE ZONE' : r > 70 ? 'OVERBOUGHT — CAUTION' : 'NEUTRAL MOMENTUM'}</div>
            <div class="mono" style="font-size:11px;color:var(--ink-3)">RSI · 14 PERIOD</div></div></div>
            <div class="kv"><span class="k">MACD / signal</span><span class="v">${mc ? num(mc.line) + ' / ' + num(mc.signal) : '—'}</span></div>
            <div class="kv"><span class="k">Histogram</span><span class="v ${mc ? (mc.hist >= 0 ? 'up' : 'down') : ''}">${mc ? (mc.hist >= 0 ? '+' : '') + num(mc.hist) : '—'}</span></div>
            <div class="kv"><span class="k">Price vs MA20</span><span class="v">${s20 != null && m.price != null ? inr(s20, 0) + (m.price >= s20 ? ' · ABOVE ▲' : ' · BELOW ▼') : '—'}</span></div>
            <div class="kv"><span class="k">MA20 vs MA50</span><span class="v">${s20 != null && s50 != null ? (s20 >= s50 ? 'GOLDEN ▲' : 'WEAK ▼') : '—'}</span></div>
          </div>
          <div><div class="sec-head" style="margin:0 0 6px"><h2>FUNDAMENTALS</h2><span class="sub">TTM</span></div>
            <div class="kv"><span class="k">EPS</span><span class="v">${f.epsTrailing != null ? inr(f.epsTrailing) : '—'}</span></div>
            <div class="kv"><span class="k">P/B</span><span class="v">${f.pb != null ? num(f.pb) + '×' : '—'}</span></div>
            <div class="kv"><span class="k">Dividend yield</span><span class="v">${f.dividendYield != null ? num(f.dividendYield * 100) + '%' : '—'}</span></div>
            <div class="kv"><span class="k">Beta</span><span class="v">${f.beta != null ? num(f.beta) + (f.beta > 1 ? ' · HOT' : ' · CALM') : '—'}</span></div>
            <div class="kv"><span class="k">ROE</span><span class="v">${f.roe != null ? num(f.roe * 100) + '%' : '—'}</span></div>
            <div class="kv"><span class="k">Profit margin</span><span class="v">${f.profitMargin != null ? num(f.profitMargin * 100) + '%' : '—'}</span></div>
            <div class="kv"><span class="k">Day position</span><span class="v">${dayPos != null ? dayPos.toFixed(0) + '%' : '—'}</span></div>
            ${dayPos != null ? `<div class="rbar"><i style="left:calc(${dayPos.toFixed(1)}% - 6px)"></i></div>` : ''}
            <div class="kv"><span class="k">52W position</span><span class="v">${yPos != null ? yPos.toFixed(0) + '%' : '—'}</span></div>
            ${yPos != null ? `<div class="rbar"><i style="left:calc(${yPos.toFixed(1)}% - 6px)"></i></div>` : ''}
          </div>
        </div>
        ${f.summary ? `<div class="about" style="padding:0 18px 18px"><div class="sec-head" style="margin:0 0 10px"><h2>FILE</h2><span class="sub">${esc([f.sector, f.industry].filter(Boolean).join(' · ').toUpperCase())}${f.employees ? ' · ' + num(f.employees, 0) + ' STAFF' : ''}</span></div><p>${esc(f.summary)}</p>${f.website ? `<a href="${esc(f.website.startsWith('http') ? f.website : 'https://' + f.website)}" target="_blank" rel="noopener">COMPANY SITE ↗</a>` : ''}</div>` : ''}
      </section>`;
    $('#bk').addEventListener('click', () => location.hash = '#/');
    $('#wb').addEventListener('click', (e) => {
      const now = watch.toggle(m.symbol);
      e.target.textContent = now ? '★ WATCHING' : '☆ WATCH';
      e.target.classList.toggle('off', !now);
    });
    app.querySelectorAll('.range').forEach((b) => b.addEventListener('click', async () => {
      range = b.dataset.r;
      app.querySelectorAll('.range').forEach((x) => x.classList.toggle('on', x === b));
      try {
        const nd = await api(`/api/chart?symbol=${m.symbol}&range=${range}`);
        d.points = nd.points; d.meta = { ...d.meta, ...nd.meta };
        paintDetail(d, fund, tech);
      } catch {}
    }));
    app.querySelectorAll('.tgl').forEach((b) => b.addEventListener('click', () => {
      show[b.dataset.t] = !show[b.dataset.t];
      b.classList.toggle('on', show[b.dataset.t]);
      const cv = $('#chart'); if (cv) drawChart(cv, d.points, $('#ctip'));
    }));
    const cv = $('#chart');
    drawChart(cv, d.points, $('#ctip'));
    bindCrosshair(cv, $('#ctip'));
    window.addEventListener('resize', () => { const c2 = $('#chart'); if (c2) { drawChart(c2, d.points, $('#ctip')); bindCrosshair(c2, $('#ctip')); } }, { once: true });
  }

  /* ---------- search / theme / nav / router ---------- */
  function initSearch() {
    const inp = $('#search'), box = $('#results');
    let t;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      const q = inp.value.trim();
      if (q.length < 1) { box.classList.remove('open'); return; }
      t = setTimeout(async () => {
        try {
          const d = await api('/api/search?q=' + encodeURIComponent(q));
          box.innerHTML = d.results.length
            ? d.results.map((r) => `<button data-sym="${esc(r.symbol)}"><b>${esc(short(r.symbol))}</b><span>${esc(r.name)}</span><span class="ex">${esc(r.exchange || '')}</span></button>`).join('')
            : '<button disabled>NO MATCHES</button>';
          box.classList.add('open');
          box.querySelectorAll('[data-sym]').forEach((b) => b.addEventListener('click', () => {
            box.classList.remove('open'); inp.value = ''; location.hash = '#/' + b.dataset.sym;
          }));
        } catch {}
      }, 250);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.classList.remove('open'); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = box.querySelector('[data-sym]'); if (f) f.click(); } });
  }
  function initTheme() {
    const sync = () => {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = document.documentElement.dataset.theme === 'dark' ? '#0c0d10' : '#f6f4ec';
    };
    sync();
    $('#themeBtn').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('tt-theme', next); } catch {}
      sync();
      const cv = $('#chart');
      if (cv && cv._geom) drawChart(cv, cv._geom.points, $('#ctip'));
    });
  }
  function setNav(key) {
    document.querySelectorAll('#mainNav button').forEach((b) => b.classList.toggle('on', b.dataset.nav === key));
  }
  function route(keep = false) {
    const h = location.hash;
    document.body.classList.remove('nav-open');
    if (h === '#/screener') { setNav('screener'); screenerPage(); }
    else if (h === '#/watch') { setNav('watch'); watchPage(); }
    else {
      const m = h.match(/^#\/(.+)$/);
      if (m && m[1]) { setNav(''); detail(decodeURIComponent(m[1]).toUpperCase()); }
      else { setNav('market'); marketPage(); }
    }
    document.title = 'TickerTape India — NSE/BSE Terminal';
    if (!keep) window.scrollTo(0, 0);
  }

  $('#homeBtn').addEventListener('click', () => location.hash = '#/');
  document.querySelectorAll('#mainNav button').forEach((b) => b.addEventListener('click', () => {
    location.hash = b.dataset.nav === 'market' ? '#/' : '#/' + b.dataset.nav;
  }));
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  window.addEventListener('hashchange', () => route());
  initSearch();
  initTheme();
  route();
  loadChrome();
  setInterval(loadChrome, 5 * 60 * 1000);
})();

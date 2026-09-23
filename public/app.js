/* StockLens India — frontend. Zero dependencies. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const API_BASE = (window.STOCKLENS && window.STOCKLENS.apiBase) || '';

  const POPULAR = [
    ['RELIANCE.NS', 'Reliance Industries', 'Energy'], ['HDFCBANK.NS', 'HDFC Bank', 'Banking'],
    ['TCS.NS', 'TCS', 'IT'], ['INFY.NS', 'Infosys', 'IT'],
    ['ICICIBANK.NS', 'ICICI Bank', 'Banking'], ['SBIN.NS', 'State Bank of India', 'Banking'],
    ['BHARTIARTL.NS', 'Bharti Airtel', 'Telecom'], ['ITC.NS', 'ITC', 'FMCG'],
    ['LT.NS', 'Larsen & Toubro', 'Infra'], ['TATAMOTORS.NS', 'Tata Motors', 'Auto'],
    ['TATASTEEL.NS', 'Tata Steel', 'Metals'], ['MARUTI.NS', 'Maruti Suzuki', 'Auto'],
    ['SUNPHARMA.NS', 'Sun Pharma', 'Pharma'], ['TITAN.NS', 'Titan', 'Consumer'],
    ['AXISBANK.NS', 'Axis Bank', 'Banking'], ['KOTAKBANK.NS', 'Kotak Bank', 'Banking'],
    ['HINDUNILVR.NS', 'HUL', 'FMCG'], ['NTPC.NS', 'NTPC', 'Power'],
    ['POWERGRID.NS', 'Power Grid', 'Power'], ['ONGC.NS', 'ONGC', 'Energy'],
    ['BAJFINANCE.NS', 'Bajaj Finance', 'NBFC'], ['ADANIENT.NS', 'Adani Enterprises', 'Infra'],
    ['TATAPOWER.NS', 'Tata Power', 'Power'], ['WIPRO.NS', 'Wipro', 'IT'],
  ];
  const IDX = [['Nifty 50', '^NSEI'], ['Sensex', '^BSESN'], ['Bank Nifty', '^NSEBANK']];
  const RANGES = [['1d', '1D'], ['5d', '1W'], ['1mo', '1M'], ['6mo', '6M'], ['1y', '1Y'], ['5y', '5Y']];
  let range = '1mo';
  const show = { sma: true, bb: false, vol: true };

  /* ---------- helpers ---------- */
  const inr = (v, d = 2) => v == null || !isFinite(v) ? '—' : '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: d });
  const num = (v, d = 2) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: d });
  const bigInr = (v) => {
    if (v == null || !isFinite(v)) return '—';
    if (v >= 1e7) return '₹' + (v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' Cr';
    if (v >= 1e5) return '₹' + (v / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' L';
    return inr(v, 0);
  };
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const watch = {
    get() { try { return JSON.parse(localStorage.getItem('sl-watch') || '[]'); } catch { return []; } },
    has(s) { return this.get().includes(s); },
    toggle(s) {
      let w = this.get();
      w = w.includes(s) ? w.filter((x) => x !== s) : [...w, s];
      try { localStorage.setItem('sl-watch', JSON.stringify(w)); } catch {}
      return w.includes(s);
    },
  };
  async function api(url) {
    const r = await fetch(API_BASE + url);
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }
  function deferIdle(fn, wait = 2000) {
    if ('requestIdleCallback' in window) requestIdleCallback(() => setTimeout(fn, 0), { timeout: wait });
    else setTimeout(fn, Math.min(wait, 1000));
  }
  if (API_BASE && /^https?:\/\//.test(API_BASE)) {
    const lk = document.createElement('link');
    lk.rel = 'preconnect'; lk.href = API_BASE; lk.crossOrigin = 'anonymous';
    document.head.appendChild(lk);
  }

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
  function boll(closes, n = 20, k = 2) {
    if (closes.length < n) return null;
    const w = closes.slice(-n);
    const mid = w.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mid) ** 2, 0) / n);
    return { mid, up: mid + k * sd, lo: mid - k * sd };
  }
  function verdict(m, closes) {
    const s20 = sma(closes, 20), s50 = sma(closes, 50), r = rsi(closes), mc = macd(closes);
    let bull = 0, bear = 0;
    const vote = (b) => b ? bull++ : bear++;
    if (m.price != null && s20 != null) vote(m.price >= s20);
    if (s20 != null && s50 != null) vote(s20 >= s50);
    if (r != null) { if (r < 70) { if (r >= 30) { bull++; bear++; } else bull++; } else bear++; }
    if (mc) vote(mc.hist >= 0);
    if (m.changePct != null) vote(m.changePct >= 0);
    if (bull >= bear + 2) return ['Bullish momentum', 'bull'];
    if (bear >= bull + 2) return ['Bearish pressure', 'bear'];
    return ['Neutral / mixed', 'flat'];
  }

  /* ---------- canvas ---------- */
  function spark(canvas, closes, up) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 200, h = canvas.clientHeight || 46;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d'); c.scale(dpr, dpr);
    if (closes.length < 2) return;
    const min = Math.min(...closes), max = Math.max(...closes), sp = max - min || 1;
    const X = (i) => (i / (closes.length - 1)) * w, Y = (v) => h - 4 - ((v - min) / sp) * (h - 8);
    const col = up ? '#34d399' : '#f87171';
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, up ? 'rgba(52,211,153,.3)' : 'rgba(248,113,113,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.beginPath();
    closes.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(0), Y(v)));
    c.strokeStyle = col; c.lineWidth = 1.8; c.lineJoin = 'round'; c.stroke();
    c.lineTo(X(closes.length - 1), h); c.lineTo(X(0), h); c.closePath(); c.fillStyle = g; c.fill();
  }

  function drawChart(canvas, points, tip) {
    const dark = document.documentElement.dataset.theme !== 'light';
    const grid = dark ? 'rgba(148,163,210,.13)' : 'rgba(13,20,48,.09)';
    const txt = dark ? '#75809f' : '#7c869e';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 360;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d'); c.scale(dpr, dpr);
    const padL = 8, padR = 66, padT = 14, padB = 24;
    const volH = show.vol ? (h - padT - padB) * 0.18 : 0;
    const priceB = h - padB - volH - (show.vol ? 8 : 0);
    const closes = points.map((p) => p.c);
    const vols = points.map((p) => p.v || p.o != null ? (p.v ?? 0) : 0);
    const min = Math.min(...closes), max = Math.max(...closes), sp = (max - min) || 1;
    const lo = min - sp * 0.09, hi = max + sp * 0.09;
    const X = (i) => padL + (i / (points.length - 1)) * (w - padL - padR);
    const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (priceB - padT);
    const up = closes[closes.length - 1] >= closes[0];
    const col = up ? '#34d399' : '#f87171';
    const css = getComputedStyle(document.documentElement);
    const brand = css.getPropertyValue('--brand').trim() || '#818cf8';

    c.font = '11px Inter,sans-serif';
    c.strokeStyle = grid; c.fillStyle = txt; c.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const v = lo + ((hi - lo) * g) / 4, y = Y(v);
      c.beginPath(); c.moveTo(padL, y); c.lineTo(w - padR, y); c.stroke();
      const lbl = v >= 1000 ? '₹' + (v / 1000).toFixed(2) + 'k' : '₹' + v.toFixed(v < 10 ? 2 : 0);
      c.fillText(lbl, w - padR + 6, y + 4);
    }
    // volume
    if (show.vol) {
      const vmax = Math.max(...vols, 1);
      const bw = Math.max(1, (w - padL - padR) / points.length - 1);
      points.forEach((p, i) => {
        const v = vols[i]; if (!v) return;
        const bh = (v / vmax) * volH;
        const prev = i ? points[i - 1].c : p.c;
        c.fillStyle = p.c >= prev ? 'rgba(52,211,153,.4)' : 'rgba(248,113,113,.4)';
        c.fillRect(X(i) - bw / 2, h - padB - bh, bw, bh);
      });
    }
    // Bollinger
    if (show.bb && points.length >= 20) {
      const up1 = [], lo1 = [];
      closes.forEach((_, i) => {
        if (i < 19) { up1.push(null); lo1.push(null); return; }
        const win = closes.slice(i - 19, i + 1);
        const mid = win.reduce((a, b) => a + b, 0) / 20;
        const sd = Math.sqrt(win.reduce((a, b) => a + (b - mid) ** 2, 0) / 20);
        up1.push(mid + 2 * sd); lo1.push(mid - 2 * sd);
      });
      c.beginPath();
      up1.forEach((v, i) => { if (v != null) (i === 19 ? c.moveTo(X(i), Y(v)) : c.lineTo(X(i), Y(v))); });
      lo1.slice().reverse().forEach((v, j) => { const i = lo1.length - 1 - j; if (v != null) c.lineTo(X(i), Y(v)); });
      c.closePath(); c.fillStyle = dark ? 'rgba(129,140,248,.1)' : 'rgba(79,70,229,.08)'; c.fill();
      c.setLineDash([5, 4]); c.strokeStyle = brand; c.lineWidth = 1.1;
      c.beginPath(); up1.forEach((v, i) => { if (v != null) (i === 19 ? c.moveTo(X(i), Y(v)) : c.lineTo(X(i), Y(v))); }); c.stroke();
      c.beginPath(); lo1.forEach((v, i) => { if (v != null) (i === 19 ? c.moveTo(X(i), Y(v)) : c.lineTo(X(i), Y(v))); }); c.stroke();
      c.setLineDash([]);
    }
    // SMA overlays
    if (show.sma && points.length > 20) {
      const draw = (arr, color, dash) => {
        c.beginPath(); c.setLineDash(dash);
        arr.forEach((v, i) => { if (v != null) { const k = i === 0 || arr[i - 1] == null ? 'm' : 'l'; k === 'm' ? c.moveTo(X(i), Y(v)) : c.lineTo(X(i), Y(v)); } });
        c.strokeStyle = color; c.lineWidth = 1.3; c.stroke(); c.setLineDash([]);
      };
      draw(smaArr(closes, 20), brand, []);
      if (points.length >= 50) draw(smaArr(closes, 50), '#fbbf24', [5, 4]);
    }
    // price area
    const grad = c.createLinearGradient(0, padT, 0, priceB);
    grad.addColorStop(0, up ? 'rgba(52,211,153,.3)' : 'rgba(248,113,113,.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(X(i), Y(p.c)) : c.moveTo(X(0), Y(p.c)));
    c.strokeStyle = col; c.lineWidth = 2.2; c.lineJoin = 'round'; c.stroke();
    c.lineTo(X(points.length - 1), priceB); c.lineTo(X(0), priceB); c.closePath();
    c.fillStyle = grad; c.fill();
    // last-price dot
    const lx = X(points.length - 1), ly = Y(closes[closes.length - 1]);
    c.beginPath(); c.arc(lx, ly, 4, 0, 7); c.fillStyle = col; c.fill();
    c.beginPath(); c.arc(lx, ly, 7, 0, 7); c.strokeStyle = col; c.globalAlpha = .4; c.stroke(); c.globalAlpha = 1;
    // time labels
    c.fillStyle = txt;
    [0, Math.floor(points.length / 2), points.length - 1].forEach((i) => {
      const d = new Date(points[i].t);
      const lbl = (range === '1d' || range === '5d')
        ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ((range === '1y' || range === '5y') ? " '" + String(d.getFullYear()).slice(2) : '');
      c.fillText(lbl, Math.max(padL, Math.min(X(i) - 20, w - padR - 60)), h - 8);
    });
    // crosshair data for mousemove
    canvas._geom = { X, Y, w, h, padL, padR, padT, padB, points };
    if (tip) tip.style.display = 'none';
  }

  function bindCrosshair(canvas, tip) {
    canvas.addEventListener('mousemove', (e) => {
      const g = canvas._geom; if (!g) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const n = g.points.length;
      let i = Math.round(((mx - g.padL) / (g.w - g.padL - g.padR)) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      drawChart(canvas, g.points, null);
      const c = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.save(); c.scale(dpr, dpr);
      const dark = document.documentElement.dataset.theme !== 'light';
      c.strokeStyle = dark ? 'rgba(238,241,251,.35)' : 'rgba(13,20,48,.3)';
      c.setLineDash([4, 4]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(g.X(i), g.padT); c.lineTo(g.X(i), g.h - g.padB); c.stroke();
      c.setLineDash([]);
      c.beginPath(); c.arc(g.X(i), g.Y(g.points[i].c), 4.5, 0, 7);
      c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#818cf8'; c.lineWidth = 2; c.stroke();
      c.restore();
      const p = g.points[i], d = new Date(p.t);
      tip.style.display = 'block';
      tip.innerHTML = `<b>${inr(p.c)}</b> · ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${(range === '1d' || range === '5d') ? ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}${p.v ? `<br>Vol ${num(p.v, 0)}` : ''}`;
      const wrap = canvas.parentElement.getBoundingClientRect();
      let lx = e.clientX - wrap.left + 16, ly = e.clientY - wrap.top - 10;
      if (lx + 170 > wrap.width) lx -= 190;
      tip.style.left = lx + 'px'; tip.style.top = Math.max(4, ly) + 'px';
    });
    canvas.addEventListener('mouseleave', () => {
      const g = canvas._geom; if (g) drawChart(canvas, g.points, null);
      tip.style.display = 'none';
    });
  }

  /* ---------- shared UI ---------- */
  function revealSoon() {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  }
  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    if (!isFinite(target)) return;
    const dec = el.dataset.dec ? +el.dataset.dec : 0;
    const t0 = performance.now(), dur = 1100;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3;
      el.textContent = (target * e).toLocaleString('en-IN', { maximumFractionDigits: dec, minimumFractionDigits: dec });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function setFoot(t) { const f = $('#footStamp'); if (f) f.textContent = t; }

  async function loadTape() {
    try {
      const [mk, b] = await Promise.all([
        api('/api/markets'),
        api('/api/batch?symbols=' + POPULAR.map((p) => p[0]).join(',') + '&range=5d'),
      ]);
      const items = [
        ...mk.quotes.map((q) => ({ n: q.name, p: q.symbol === 'INR=X' ? num(q.price) : q.symbol.endsWith('=F') ? '$' + num(q.price) : inr(q.price), c: q.changePct })),
        ...b.quotes.filter((q) => q.ok).map((q) => {
          const nm = (POPULAR.find((p) => p[0] === q.symbol) || [])[1] || q.symbol;
          return { n: nm, p: inr(q.meta.price), c: q.meta.changePct };
        }),
      ].filter((x) => x.c != null);
      const html = items.map((x) => {
        const up = x.c >= 0;
        return `<span class="titem"><span class="n">${esc(x.n)}</span><span class="p">${x.p}</span><span class="c ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${num(Math.abs(x.c))}%</span></span>`;
      }).join('');
      const track = $('#tapeTrack');
      track.innerHTML = html + html; // duplicate for seamless loop
      $('#tape').hidden = false;
      if (mk.fetchedAt) setFoot('Market data as of ' + new Date(mk.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST');
    } catch { /* tape optional */ }
  }

  /* ---------- home ---------- */
  async function home() {
    app.innerHTML = `
      <section class="hero reveal">
        <span class="kicker"><span class="pulse"></span>Live · NSE &amp; BSE</span>
        <h1>Every Indian stock,<br /><span class="grad">decoded beautifully</span></h1>
        <p>Real-time prices, cinematic charts, true fundamentals and institutional-grade technicals — screener, movers, RSI signals and watchlist included. Free forever, no login.</p>
        <div class="hero-stats">
          <div class="hstat"><div class="n" data-count="${POPULAR.length}">0</div><div class="l">Stocks tracked</div></div>
          <div class="hstat"><div class="n" data-count="7">0</div><div class="l">Market indices</div></div>
          <div class="hstat"><div class="n" data-count="6">0</div><div class="l">Chart timeframes</div></div>
        </div>
        <div class="chips">${['RELIANCE.NS|Reliance', 'HDFCBANK.NS|HDFC Bank', 'TCS.NS|TCS', 'INFY.NS|Infosys', 'TATAMOTORS.NS|Tata Motors', 'SBIN.NS|SBI', 'BAJFINANCE.NS|Bajaj Finance'].map((s) => { const [sym, n] = s.split('|'); return `<button class="chip" data-sym="${sym}">${n} →</button>`; }).join('')}</div>
      </section>
      <div class="section-head reveal"><h2><span class="ico">◈</span>Market overview</h2><span class="hint">live indices</span></div>
      <div class="idx-grid" id="idxGrid">${IDX.map(() => '<div class="skel" style="min-height:150px"></div>').join('')}</div>
      <div class="section-head reveal"><h2><span class="ico">⚡</span>Top movers today</h2><span class="hint">from tracked stocks</span></div>
      <div class="movers"><div class="mover-panel reveal"><h3>🟢 Top gainers</h3><div id="gainers"><div class="skel" style="min-height:120px"></div></div></div>
      <div class="mover-panel reveal"><h3>🔴 Top losers</h3><div id="losers"><div class="skel" style="min-height:120px"></div></div></div></div>
      <div class="section-head reveal"><h2><span class="ico">🔍</span>Smart screener</h2><span class="hint">auto signals · daily closes</span></div>
      <div class="screen-grid" id="screens">${'<div class="skel"></div>'.repeat(4)}</div>
      <div class="section-head reveal"><h2><span class="ico">★</span>All tracked stocks</h2><span class="hint" id="gridHint">loading…</span></div>
      <div class="grid" id="grid">${POPULAR.map(() => '<div class="skel"></div>').join('')}</div>
      <div class="section-head reveal"><h2><span class="ico">👁</span>Your watchlist</h2><span class="hint">saved on this device</span></div>
      <div class="grid" id="watchGrid"></div>`;
    app.querySelectorAll('[data-sym]').forEach((b) => b.addEventListener('click', () => location.hash = '#/' + b.dataset.sym));
    document.querySelectorAll('.hstat .n').forEach(countUp);
    revealSoon();
    renderWatch();

    try {
      const [mk, batch, idxBatch] = await Promise.all([
        api('/api/markets'),
        api('/api/batch?symbols=' + POPULAR.map((p) => p[0]).join(',') + '&range=6mo'),
        api('/api/batch?symbols=' + IDX.map((p) => p[1]).join(',') + '&range=1mo'),
      ]);
      paintIndices(mk, idxBatch);
      const ok = batch.quotes.filter((q) => q.ok);
      paintMovers(ok);
      paintScreens(ok);
      paintGrid(ok);
      const hint = $('#gridHint');
      if (hint) hint.textContent = `${ok.length}/${POPULAR.length} live`;
    } catch {
      const g = $('#grid');
      if (g) g.innerHTML = '<div class="empty">Market data is offline — please retry in a moment.</div>';
    }
  }

  function paintIndices(mk, idxBatch) {
    const g = $('#idxGrid');
    if (!g) return;
    const bySym = {};
    (idxBatch.quotes || []).forEach((q) => { if (q.ok) bySym[q.symbol] = q; });
    g.innerHTML = mk.quotes.filter((q) => ['^NSEI', '^BSESN', '^NSEBANK'].includes(q.symbol)).map((q) => {
      const up = (q.changePct ?? 0) >= 0;
      const px = q.symbol === 'INR=X' ? num(q.price) : inr(q.price, q.price > 5000 ? 2 : 2);
      return `<div class="idx-card reveal in"><div class="n">${esc(q.name)}</div>
        <div class="p">${px}</div>
        <div class="c ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${num(Math.abs(q.changePct ?? 0))}% today</div>
        <canvas data-idx="${esc(q.symbol)}"></canvas></div>`;
    }).join('');
    g.querySelectorAll('canvas').forEach((cv) => {
      const q = bySym[cv.dataset.idx];
      if (q) spark(cv, q.closes, (q.meta.changePct ?? 0) >= 0);
    });
  }

  function moverRow(q, i) {
    const nm = (POPULAR.find((p) => p[0] === q.symbol) || [])[1] || q.symbol;
    const up = (q.meta.changePct ?? 0) >= 0;
    return `<button class="mrow" data-sym="${q.symbol}"><span class="rk">${i + 1}</span>
      <span class="who"><span class="s">${esc(nm)}</span><br><span class="nm">${esc(q.symbol)}</span></span>
      <span class="pv"><span class="px">${inr(q.meta.price)}</span><br><span class="ch ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${num(Math.abs(q.meta.changePct ?? 0))}%</span></span></button>`;
  }
  function paintMovers(ok) {
    const sorted = ok.slice().sort((a, b) => (b.meta.changePct ?? -99) - (a.meta.changePct ?? -99));
    const g = $('#gainers'), l = $('#losers');
    if (g) {
      g.innerHTML = sorted.slice(0, 5).map(moverRow).join('');
      g.querySelectorAll('[data-sym]').forEach((el) => el.addEventListener('click', () => location.hash = '#/' + el.dataset.sym));
    }
    if (l) {
      l.innerHTML = sorted.slice(-5).reverse().map(moverRow).join('');
      l.querySelectorAll('[data-sym]').forEach((el) => el.addEventListener('click', () => location.hash = '#/' + el.dataset.sym));
    }
  }

  function paintScreens(ok) {
    const box = $('#screens');
    if (!box) return;
    const withCloses = ok.filter((q) => q.closes && q.closes.length >= 55);
    const rsiList = withCloses.map((q) => ({ q, r: rsi(q.closes) })).filter((x) => x.r != null);
    const oversold = rsiList.filter((x) => x.r < 35).sort((a, b) => a.r - b.r).slice(0, 4);
    const overbought = rsiList.filter((x) => x.r > 70).sort((a, b) => b.r - a.r).slice(0, 4);
    const golden = withCloses.filter((q) => {
      const s20 = sma(q.closes, 20), s50 = sma(q.closes, 50);
      return s20 != null && s50 != null && s20 > s50 && q.meta.price > s20;
    }).slice(0, 4);
    const nearHigh = ok.filter((q) => {
      const { week52High: h, week52Low: l, price: p } = q.meta;
      return h && l && p && h > l && (h - p) / (h - l) < 0.08;
    }).slice(0, 4);
    const nm = (s) => (POPULAR.find((p) => p[0] === s) || [s, s])[1];
    const row = (sym, v) => `<div class="srow" data-sym="${sym}"><span class="s">${esc(nm(sym))}</span><span class="v">${v}</span></div>`;
    const cards = [
      ['Oversold bounce candidates', 'RSI(14) below 35', 'green', oversold.map((x) => row(x.q.symbol, 'RSI ' + x.r))],
      ['Overbought — caution', 'RSI(14) above 70', 'red', overbought.map((x) => row(x.q.symbol, 'RSI ' + x.r))],
      ['Golden trend', 'price > SMA20 > SMA50', 'blue', golden.map((q) => row(q.symbol, inr(q.meta.price, 0)))],
      ['Near 52-week high', 'within 8% of the top', 'amber', nearHigh.map((q) => row(q.symbol, num(q.meta.changePct ?? 0) + '%'))],
    ];
    box.innerHTML = cards.map(([t, s, tag, rows]) => `<div class="screen-card reveal in"><h3>${t} <span class="tag ${tag}">${rows.length}</span></h3><p class="sub">${s}</p>${rows.join('') || '<div class="empty" style="padding:16px">No matches right now</div>'}</div>`).join('');
    box.querySelectorAll('[data-sym]').forEach((el) => el.addEventListener('click', () => location.hash = '#/' + el.dataset.sym));
  }

  function paintGrid(ok) {
    const g = $('#grid');
    if (!g) return;
    const bySym = {};
    ok.forEach((q) => { bySym[q.symbol] = q; });
    g.innerHTML = POPULAR.map(([sym, name, sec]) => {
      const q = bySym[sym];
      if (!q) return `<div class="stock-card"><div class="sym">${sym.replace('.NS', '')}</div><div class="nm">${esc(name)}</div><div class="empty" style="padding:12px">offline</div></div>`;
      const up = (q.meta.changePct ?? 0) >= 0;
      const starred = watch.has(sym) ? ' on' : '';
      return `<div class="stock-card reveal in" data-sym="${sym}" tabindex="0">
        <button class="star${starred}" data-star="${sym}" title="Watchlist">★</button>
        <div class="row"><div><div class="sec">${esc(sec)}</div><div class="sym">${sym.replace('.NS', '')}</div><div class="nm">${esc(name)}</div></div>
        <span class="chg ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${num(Math.abs(q.meta.changePct ?? 0))}%</span></div>
        <div class="px">${inr(q.meta.price)}</div>
        <canvas class="mini"></canvas></div>`;
    }).join('');
    g.querySelectorAll('canvas.mini').forEach((cv, i) => {
      const q = bySym[POPULAR[i][0]];
      if (q) spark(cv, q.closes.slice(-30), (q.meta.changePct ?? 0) >= 0);
    });
    g.querySelectorAll('[data-star]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = watch.toggle(b.dataset.star);
      b.classList.toggle('on', on);
      renderWatch();
    }));
    g.querySelectorAll('.stock-card[data-sym]').forEach((el) => el.addEventListener('click', () => location.hash = '#/' + el.dataset.sym));
  }

  async function renderWatch() {
    const g = $('#watchGrid');
    if (!g) return;
    const w = watch.get();
    if (!w.length) { g.innerHTML = '<div class="empty">Star any stock ★ to pin it here.</div>'; return; }
    try {
      const b = await api('/api/batch?symbols=' + w.join(',') + '&range=5d');
      g.innerHTML = b.quotes.map((q) => q.ok
        ? `<div class="stock-card reveal in" data-sym="${q.symbol}"><div class="sym">${esc(q.symbol.replace('.NS', '').replace('.BO', ''))}</div>
           <div class="px">${inr(q.meta.price)}</div>
           <span class="chg ${(q.meta.changePct ?? 0) >= 0 ? 'up' : 'down'}">${num(q.meta.changePct ?? 0)}% today</span></div>`
        : `<div class="stock-card"><div class="sym">${esc(q.symbol)}</div><div class="empty" style="padding:12px">offline</div></div>`).join('');
      g.querySelectorAll('[data-sym]').forEach((el) => el.addEventListener('click', () => location.hash = '#/' + el.dataset.sym));
    } catch { g.innerHTML = '<div class="empty">Watchlist is offline — retry soon.</div>'; }
  }

  /* ---------- detail ---------- */
  async function detail(sym) {
    app.innerHTML = `<button class="back" id="bk">← Back</button><div class="page-loading"><div class="spinner"></div></div>`;
    $('#bk').addEventListener('click', () => location.hash = '#/');
    try {
      const [chart, fund, tech] = await Promise.all([
        api(`/api/chart?symbol=${sym}&range=${range}`),
        api(`/api/fundamentals?symbol=${sym}`).catch(() => null),
        api(`/api/batch?symbols=${sym}&range=1y`).catch(() => null),
      ]);
      const t = tech && tech.quotes && tech.quotes[0] && tech.quotes[0].ok ? tech.quotes[0] : null;
      paintDetail(chart, fund, t);
      document.title = `${sym.replace('.NS', '').replace('.BO', '')} — live analysis | StockLens India`;
    } catch {
      document.title = 'StockLens India';
      app.innerHTML = `<button class="back" id="bk2">← Back</button><div class="empty">Couldn't load ${esc(sym)} — check the symbol or try again.</div>`;
      $('#bk2').addEventListener('click', () => location.hash = '#/');
    }
  }

  function rsiGauge(r) {
    const v = r == null ? 0 : Math.max(0, Math.min(100, r));
    const R = 54, C = Math.PI * R;
    const col = r == null ? '#75809f' : r < 30 ? '#34d399' : r > 70 ? '#f87171' : '#fbbf24';
    const lbl = r == null ? '—' : r < 30 ? 'Oversold' : r > 70 ? 'Overbought' : 'Neutral';
    return `<div class="gauge-wrap"><svg class="gauge" width="130" height="78" viewBox="0 0 130 78">
      <path d="M 11 70 A 54 54 0 0 1 119 70" fill="none" stroke="var(--surface-2)" stroke-width="11" stroke-linecap="round"/>
      <path d="M 11 70 A 54 54 0 0 1 119 70" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${(C * v / 100).toFixed(1)} ${C.toFixed(1)}"/>
      <text x="65" y="58" text-anchor="middle" fill="var(--ink)" font-size="21" font-weight="700" font-family="Space Grotesk,sans-serif">${r ?? '—'}</text>
    </svg><div><div class="gv" style="color:${col}">${lbl}</div><div class="gl">RSI · 14 period</div></div></div>`;
  }

  function paintDetail(d, fund, t) {
    const m = d.meta;
    const tcloses = t && t.closes && t.closes.length > 30 ? t.closes : d.points.map((p) => p.c);
    const up = (m.changePct ?? 0) >= 0;
    const [txt, cls] = verdict(m, tcloses);
    const s20 = sma(tcloses, 20), s50 = sma(tcloses, 50), r = rsi(tcloses), mc = macd(tcloses), bb = boll(tcloses);
    const dayPos = (m.dayHigh && m.dayLow && m.dayHigh > m.dayLow && m.price != null)
      ? Math.max(0, Math.min(100, ((m.price - m.dayLow) / (m.dayHigh - m.dayLow)) * 100)) : null;
    const yPos = (m.week52High && m.week52Low && m.week52High > m.week52Low && m.price != null)
      ? Math.max(0, Math.min(100, ((m.price - m.week52Low) / (m.week52High - m.week52Low)) * 100)) : null;
    const on = watch.has(m.symbol);
    const short = m.symbol.replace('.NS', '').replace('.BO', '');
    const f = fund || {};
    app.innerHTML = `
      <button class="back" id="bk">← Back</button>
      <section class="detail-hero">
        <div style="min-width:0">
          <h1>${esc(short)}</h1>
          <div class="ex">${esc(m.exchange || '')} · ${esc(m.symbol)} · ${esc(m.currency || 'INR')}</div>
          <div class="sec-row">${f.sector ? `<span class="secpill">${esc(f.sector)}</span>` : ''}${f.industry ? `<span class="secpill">${esc(f.industry)}</span>` : ''}<span class="badge ${cls}">${txt}</span></div>
          <div style="margin-top:12px"><span class="big-price">${inr(m.price)}</span>
            <span class="big-chg ${up ? 'up' : 'down'}"> ${up ? '▲' : '▼'} ${num(Math.abs(m.changePct ?? 0))}% today</span></div>
        </div>
        <div class="hero-right"><button class="watch-btn ${on ? 'on' : ''}" id="wb">${on ? '★ Watching' : '☆ Add to watchlist'}</button>
          <span style="font-size:11.5px;color:var(--ink-3)">${m.marketTime ? 'as of ' + new Date(m.marketTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST' : ''}</span></div>
      </section>
      <div class="stat-tiles">
        ${[['Prev close', inr(m.prevClose), ''], ['Day range', m.dayLow != null ? inr(m.dayLow, 0) + ' – ' + inr(m.dayHigh, 0) : '—', dayPos != null ? dayPos.toFixed(0) + '% up the day' : ''],
           ['52-week range', m.week52Low != null ? inr(m.week52Low, 0) + ' – ' + inr(m.week52High, 0) : '—', yPos != null ? yPos.toFixed(0) + '% up the range' : ''],
           ['Market cap', bigInr(f.marketCap), f.marketCap ? 'total equity value' : ''],
           ['P/E (TTM)', f.peTrailing != null ? num(f.peTrailing) + '×' : '—', f.peForward != null ? 'forward ' + num(f.peForward) + '×' : ''],
           ['P/B', f.pb != null ? num(f.pb) + '×' : '—', f.bookValue != null ? 'book ' + inr(f.bookValue, 0) : '']]
          .map(([l, v, s]) => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}
      </div>
      <div class="ranges">${RANGES.map(([v, l]) => `<button class="range ${v === range ? 'active' : ''}" data-r="${v}">${l}</button>`).join('')}</div>
      <div class="toggles">
        <button class="toggle ${show.sma ? 'on' : ''}" data-t="sma">SMA 20/50</button>
        <button class="toggle ${show.bb ? 'on' : ''}" data-t="bb">Bollinger</button>
        <button class="toggle ${show.vol ? 'on' : ''}" data-t="vol">Volume</button>
      </div>
      <div class="chart-wrap"><canvas id="chart"></canvas><div class="chart-tip" id="ctip"></div>
        <div class="chart-legend"><span><i style="background:#34d399"></i>up move</span><span><i style="background:#818cf8"></i>SMA 20</span><span><i style="background:#fbbf24"></i>SMA 50</span><span>hover the chart for values</span></div></div>
      <div class="panels">
        <div class="panel"><h3>Momentum</h3><p class="psub">RSI · MACD · trend vs moving averages</p>
          ${rsiGauge(r)}
          <div class="kv"><span class="k">MACD line</span><span class="v">${mc ? num(mc.line) : '—'}</span></div>
          <div class="kv"><span class="k">Signal line</span><span class="v">${mc ? num(mc.signal) : '—'}</span></div>
          <div class="kv"><span class="k">Histogram</span><span class="v ${mc ? (mc.hist >= 0 ? 'up' : 'down') : ''}">${mc ? (mc.hist >= 0 ? '+' : '') + num(mc.hist) : '—'}</span></div>
          <div class="kv"><span class="k">Price vs SMA 20</span><span class="v">${s20 != null && m.price != null ? (m.price >= s20 ? 'above ▲' : 'below ▼') + ' · ' + inr(s20, 0) : '—'}</span></div>
          <div class="kv"><span class="k">SMA 20 vs 50</span><span class="v">${s20 != null && s50 != null ? (s20 >= s50 ? 'golden tilt ▲' : 'weak tilt ▼') : '—'}</span></div>
          ${bb ? `<div class="kv"><span class="k">Bollinger (20,2)</span><span class="v">${inr(bb.lo, 0)} – ${inr(bb.up, 0)}</span></div>` : ''}
        </div>
        <div class="panel"><h3>Valuation &amp; quality</h3><p class="psub">trailing-twelve-month fundamentals</p>
          <div class="kv"><span class="k">EPS (TTM)</span><span class="v">${f.epsTrailing != null ? inr(f.epsTrailing) : '—'}</span></div>
          <div class="kv"><span class="k">Dividend yield</span><span class="v">${f.dividendYield != null ? num(f.dividendYield * 100) + '%' : '—'}</span></div>
          <div class="kv"><span class="k">Beta</span><span class="v">${f.beta != null ? num(f.beta) + (f.beta > 1 ? ' · aggressive' : ' · defensive') : '—'}</span></div>
          <div class="kv"><span class="k">ROE</span><span class="v">${f.roe != null ? num(f.roe * 100) + '%' : '—'}</span></div>
          <div class="kv"><span class="k">Profit margin</span><span class="v">${f.profitMargin != null ? num(f.profitMargin * 100) + '%' : '—'}</span></div>
          <div class="kv"><span class="k">Shares outstanding</span><span class="v">${f.sharesOut != null ? num(f.sharesOut, 0) : '—'}</span></div>
          <div class="kv"><span class="k">Day volume</span><span class="v">${m.volume != null ? num(m.volume, 0) : '—'}</span></div>
        </div>
        <div class="panel"><h3>Price position</h3><p class="psub">where the price sits in its ranges</p>
          <div class="kv"><span class="k">Day position</span><span class="v">${dayPos != null ? dayPos.toFixed(0) + '%' : '—'}</span></div>
          ${dayPos != null ? `<div class="rangebar"><i style="left:calc(${dayPos.toFixed(1)}% - 6px)"></i></div>` : ''}
          <div class="kv"><span class="k">52-week position</span><span class="v">${yPos != null ? yPos.toFixed(0) + '%' : '—'}</span></div>
          ${yPos != null ? `<div class="rangebar"><i style="left:calc(${yPos.toFixed(1)}% - 6px)"></i></div>` : ''}
          <div class="kv"><span class="k">Points on chart</span><span class="v">${d.points.length}</span></div>
        </div>
        ${f.summary ? `<div class="panel about"><h3>About ${esc(short)}</h3><p class="psub">${esc([f.sector, f.industry].filter(Boolean).join(' · '))}${f.employees ? ' · ' + num(f.employees, 0) + ' employees' : ''}</p><p>${esc(f.summary.length > 900 ? f.summary.slice(0, 900) + '…' : f.summary)}</p>${f.website ? `<a href="${esc(f.website.startsWith('http') ? f.website : 'https://' + f.website)}" target="_blank" rel="noopener">Official website ↗</a>` : ''}</div>` : ''}
      </div>`;
    $('#bk').addEventListener('click', () => location.hash = '#/');
    $('#wb').addEventListener('click', (e) => {
      const now = watch.toggle(m.symbol);
      e.target.textContent = now ? '★ Watching' : '☆ Add to watchlist';
      e.target.classList.toggle('on', now);
    });
    app.querySelectorAll('.range').forEach((b) => b.addEventListener('click', async () => {
      range = b.dataset.r;
      app.querySelectorAll('.range').forEach((x) => x.classList.toggle('active', x === b));
      try {
        const nd = await api(`/api/chart?symbol=${m.symbol}&range=${range}`);
        d.points = nd.points; d.meta = { ...d.meta, ...nd.meta };
        paintDetail(d, fund, t);
      } catch {}
    }));
    app.querySelectorAll('.toggle').forEach((b) => b.addEventListener('click', () => {
      show[b.dataset.t] = !show[b.dataset.t];
      b.classList.toggle('on', show[b.dataset.t]);
      const cv = $('#chart'); if (cv) drawChart(cv, d.points, $('#ctip'));
    }));
    const cv = $('#chart');
    drawChart(cv, d.points, $('#ctip'));
    bindCrosshair(cv, $('#ctip'));
    window.addEventListener('resize', () => { const c2 = $('#chart'); if (c2) { drawChart(c2, d.points, $('#ctip')); bindCrosshair(c2, $('#ctip')); } }, { once: true });
  }

  /* ---------- search ---------- */
  function initSearch() {
    const inp = $('#search'), box = $('#results');
    let t;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      const q = inp.value.trim();
      if (q.length < 2) { box.classList.remove('open'); return; }
      t = setTimeout(async () => {
        try {
          const d = await api('/api/search?q=' + encodeURIComponent(q));
          box.innerHTML = d.results.length
            ? d.results.map((r) => `<button data-sym="${esc(r.symbol)}"><span class="sym">${esc(r.symbol.replace('.NS', '').replace('.BO', ''))}</span><span>${esc(r.name)}</span><span class="ex">${esc(r.exchange)}</span></button>`).join('')
            : '<button disabled>No matches — try another name</button>';
          box.classList.add('open');
          box.querySelectorAll('[data-sym]').forEach((b) => b.addEventListener('click', () => {
            box.classList.remove('open'); inp.value = ''; location.hash = '#/' + b.dataset.sym;
          }));
        } catch {}
      }, 280);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.classList.remove('open'); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = box.querySelector('[data-sym]'); if (f) f.click(); } });
  }

  /* ---------- theme ---------- */
  function initTheme() {
    const btn = $('#themeBtn');
    const sync = () => {
      const light = document.documentElement.dataset.theme === 'light';
      btn.textContent = light ? '◑' : '◐';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = light ? '#f3f5fc' : '#070b16';
    };
    sync();
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('sl-theme', next); } catch {}
      sync();
      if (location.hash.startsWith('#/')) route();
    });
  }

  /* ---------- router ---------- */
  function route() {
    const m = location.hash.match(/^#\/(.+)$/);
    if (m) detail(decodeURIComponent(m[1]).toUpperCase());
    else { home(); document.title = 'StockLens India — Live NSE/BSE Stock Analysis'; }
    window.scrollTo(0, 0);
  }

  $('#homeBtn').addEventListener('click', () => location.hash = '#/');
  window.addEventListener('hashchange', route);
  initSearch();
  initTheme();
  route();
  loadTape();
  setInterval(loadTape, 5 * 60 * 1000);
})();

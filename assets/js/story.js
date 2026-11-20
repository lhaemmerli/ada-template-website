/* =========================================================
   Less is more — scrollytelling engine + chapter graphics
   Everything marked "illustrative" / "simulated" is generated
   here for storytelling and is NOT project data.
   ========================================================= */
(() => {
  'use strict';

  // ---------- utilities ----------
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = d3.format(',');
  const DUR = reduceMotion ? 0 : 900;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 256-entry colour lookup table for an interpolator. */
  function lut(interp) {
    return d3.range(256).map((i) => { const c = d3.rgb(interp(i / 255)); return { r: c.r, g: c.g, b: c.b, css: c.formatHex() }; });
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  const C = {
    mild: '#2dd4bf', severe: '#fb7185', asym: '#64748b', accent: '#8b9cff', warn: '#fbbf24',
    t: '#60a5fa', b: '#f472b6', nk: '#fbbf24', mono: '#34d399', dc: '#c084fc',
    text: '#e8ecf5', text2: '#a3adc2', text3: '#6b7690', grey: '#94a3b8',
  };

  /** Canvas that maps an 800x600 "world" into its box (like SVG viewBox meet). */
  function setupCanvas(canvas, W = 800, H = 600) {
    const ctx = canvas.getContext('2d');
    const view = { s: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      Object.assign(view, { dpr, w: r.width, h: r.height, s: Math.min(r.width / W, r.height / H) });
      view.ox = (r.width - W * view.s) / 2; view.oy = (r.height - H * view.s) / 2;
    }
    new ResizeObserver(resize).observe(canvas);
    resize();
    return {
      ctx, view, resize,
      world() { ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, view.dpr * view.ox, view.dpr * view.oy); },
      screen() { ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); },
      clear() { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); },
    };
  }

  /** Run `frame(t, dt)` on rAF only while `el` is near the viewport. */
  function loopWhileVisible(el, frame) {
    let raf = null, visible = false, last = performance.now();
    const tick = (t) => {
      const dt = Math.min(64, t - last); last = t;
      frame(t, dt);
      raf = visible ? requestAnimationFrame(tick) : null;
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }, { rootMargin: '200px' }).observe(el);
  }

  /** Swap a group of labels: fade old ones out, build new ones, fade in. */
  function swapLayer(parent, build) {
    parent.selectAll('g.layer').interrupt().transition().duration(DUR / 3).style('opacity', 0).remove();
    const g = parent.append('g').attr('class', 'layer').style('opacity', 0);
    build(g);
    g.transition().delay(DUR / 2).duration(DUR / 2).style('opacity', 1);
    return g;
  }

  // ---------- step engine ----------
  const handlers = {};
  function initSteps() {
    document.querySelectorAll('.scrolly').forEach((scrolly) => {
      const chapter = scrolly.closest('.chapter').dataset.chapter;
      const steps = scrolly.querySelectorAll('.step');
      let current = -1;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const i = +e.target.dataset.step;
          if (i === current) return;
          current = i;
          steps.forEach((s) => s.classList.toggle('is-active', s === e.target));
          handlers[chapter] && handlers[chapter](i);
        });
      }, { rootMargin: '-48% 0px -48% 0px' });
      steps.forEach((s) => io.observe(s));
      handlers[chapter] && handlers[chapter](0);
    });
  }

  // ---------- nav + progress ----------
  function initNav() {
    const nav = document.querySelector('.chapnav');
    const bar = document.getElementById('progress-bar');
    new IntersectionObserver(([e]) => nav.classList.toggle('is-visible', !e.isIntersecting), { threshold: 0.1 })
      .observe(document.getElementById('hero'));
    const links = document.querySelectorAll('[data-nav]');
    const chapterIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) links.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === e.target.id));
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    document.querySelectorAll('.chapter').forEach((ch) => chapterIO.observe(ch));
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + '%';
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // =========================================================
  // HERO — drifting immune cells
  // =========================================================
  function initHero() {
    const canvas = document.getElementById('hero-canvas');
    const ctx = canvas.getContext('2d');
    const r = rng(3);
    const palette = [C.t, C.t, C.t, C.mono, C.nk, C.b, C.dc];
    let W = 0, H = 0, dpr = 1;
    const cells = d3.range(70).map(() => ({
      x: r(), y: r(), z: 0.3 + r() * 0.9, rad: 8 + r() * 22, c: palette[Math.floor(r() * palette.length)],
      vx: (r() - 0.5) * 0.012, vy: (r() - 0.5) * 0.012, ph: r() * 6.28, dots: 6 + Math.floor(r() * 8),
    }));
    let mx = 0, my = 0;
    addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
    function resize() {
      const b = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
      W = b.width; H = b.height; canvas.width = W * dpr; canvas.height = H * dpr;
    }
    new ResizeObserver(resize).observe(canvas); resize();

    function draw(t, dt) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const c of cells) {
        if (!reduceMotion) {
          // drift and wrap within [-0.1, 1.1)
          c.x = ((c.x + c.vx * dt / 1000 + 0.1) % 1.2 + 1.2) % 1.2 - 0.1;
          c.y = ((c.y + c.vy * dt / 1000 + 0.1) % 1.2 + 1.2) % 1.2 - 0.1;
        }
        const px = (c.x) * W + mx * 40 * c.z, py = (c.y) * H + my * 40 * c.z;
        const rad = c.rad * c.z;
        const a = 0.15 + 0.35 * c.z;
        const g = ctx.createRadialGradient(px, py, 0, px, py, rad * 2.2);
        g.addColorStop(0, c.c + '33'); g.addColorStop(1, c.c + '00');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rad * 2.2, 0, 6.283); ctx.fill();
        ctx.globalAlpha = a;
        ctx.strokeStyle = c.c; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(px, py, rad, 0, 6.283); ctx.stroke();
        ctx.fillStyle = c.c;
        for (let k = 0; k < c.dots; k++) {
          const ang = c.ph + k * 6.283 / c.dots + t * 0.00015;
          ctx.beginPath(); ctx.arc(px + Math.cos(ang) * rad, py + Math.sin(ang) * rad, 1.6 * c.z + 0.4, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    if (reduceMotion) draw(0, 0); else loopWhileVisible(canvas, draw);
  }

  // =========================================================
  // 01 · PATIENT — severity spectrum and the 76-patient cohort
  // =========================================================
  function initPatient() {
    const svg = d3.select('#stage-patient');
    // Pool: 6 asymptomatic (step 1 only) + 76 cohort patients (53 non-severe, 23 severe)
    // indices 0..5 asym, 6..17 mild/moderate, 18..29 severe/critical, 30..70 extra non-severe, 71..81 extra severe
    const NP = 82;
    const cats = [
      { name: 'Asymptomatic', color: C.asym },
      { name: 'Mild', color: '#5eead4' },
      { name: 'Moderate', color: '#14b8a6' },
      { name: 'Severe', color: '#fda4af' },
      { name: 'Critical', color: '#e11d48' },
    ];
    const group = (i) => (i < 6 ? 'asym' : i < 18 ? 'mild' : i < 30 ? 'severe' : i < 71 ? 'mild' : 'severe');
    // slot index inside its cohort block (step 3)
    const slot = (i) => (i < 18 ? i - 6 : i < 30 ? i - 18 : i < 71 ? i - 30 + 12 : i - 71 + 12);

    const extras = svg.append('g');
    const peopleG = svg.append('g');
    const labels = svg.append('g');
    const people = peopleG.selectAll('g').data(d3.range(NP)).join('g')
      .attr('transform', 'translate(400,300) scale(0.001)').style('opacity', 0).attr('fill', '#cbd5e1');
    people.append('circle').attr('cy', -8).attr('r', 5.2);
    people.append('path').attr('d', 'M-7,11 v-6 a7,7 0 0 1 14,0 v6 z');

    function layout(step) {
      return d3.range(NP).map((i) => {
        const hidden = { x: 400, y: 300, s: 0.001, o: 0, fill: '#cbd5e1' };
        if (step === 0) return i === 18 ? { x: 400, y: 250, s: 7, o: 1, fill: '#cbd5e1' } : hidden;
        if (step === 1 || step === 2) {
          if (i >= 30) return hidden;
          const cat = Math.floor(i / 6), k = i % 6;
          const x = 160 + cat * 120 + ((k % 2) - 0.5) * 38, y = 250 + Math.floor(k / 2) * 52;
          let fill = cats[cat].color, o = 1;
          if (step === 2) { fill = cat === 0 ? C.asym : cat <= 2 ? C.mild : C.severe; o = cat === 0 ? 0.18 : 1; }
          return { x, y, s: 1.8, o, fill };
        }
        // steps 3-4: cohort waffle
        if (i < 6) return hidden;
        const gr = group(i), sl = slot(i), cols = 6;
        const x0 = gr === 'mild' ? 130 : 500, y0 = 210;
        const x = x0 + (sl % cols) * 34, y = y0 + Math.floor(sl / cols) * 36;
        const fill = gr === 'mild' ? C.mild : C.severe;
        if (step === 4) {
          if (i === 18) return { x: 300, y: 300, s: 6, o: 1, fill };
          return { x, y, s: 1.25, o: 0.05, fill };
        }
        return { x, y, s: 1.25, o: 1, fill };
      });
    }

    function drawTube(g, x, y, s = 1) {
      const t = g.append('g').attr('transform', `translate(${x},${y}) scale(${s})`);
      t.append('rect').attr('x', -22).attr('y', -112).attr('width', 44).attr('height', 12).attr('rx', 3).attr('fill', '#475569');
      t.append('path').attr('d', 'M-18,-100 V80 a18,18 0 0 0 36,0 V-100 Z').attr('fill', 'rgba(255,255,255,.05)').attr('stroke', 'rgba(255,255,255,.45)').attr('stroke-width', 2);
      t.append('path').attr('d', 'M-16,-40 V80 a16,16 0 0 0 32,0 V-40 Z').attr('fill', '#be123c');
      return t;
    }

    handlers.patient = (step) => {
      const L = layout(step);
      people.interrupt().transition().duration(DUR).delay((_, i) => (step === 3 ? (i % 40) * 8 : 0))
        .attr('transform', (_, i) => `translate(${L[i].x},${L[i].y}) scale(${L[i].s})`)
        .attr('fill', (_, i) => L[i].fill)
        .style('opacity', (_, i) => L[i].o);

      swapLayer(extras, (g) => {
        if (step === 0) {
          const pts = [];
          for (let x = 0; x <= 360; x += 6) {
            const ph = x % 120;
            let y = 0;
            if (ph > 50 && ph < 56) y = -10; else if (ph >= 56 && ph < 62) y = 46; else if (ph >= 62 && ph < 68) y = -70; else if (ph >= 68 && ph < 74) y = 22; else if (ph > 86 && ph < 100) y = -12;
            pts.push([220 + x, 450 + y]);
          }
          g.append('path').attr('class', 'ecg').attr('d', d3.line().curve(d3.curveMonotoneX)(pts));
        }
        if (step === 4) {
          drawTube(g, 520, 300, 1.2);
          g.append('path').attr('d', 'M370,300 C410,280 430,280 470,296').attr('fill', 'none').attr('stroke', C.text3).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 5');
        }
      });

      swapLayer(labels, (g) => {
        if (step === 0) {
          g.append('text').attr('class', 'svg-label').attr('x', 400).attr('y', 540).attr('text-anchor', 'middle').text('1 patient · SARS-CoV-2 positive');
        }
        if (step === 1 || step === 2) {
          cats.forEach((c, k) => {
            g.append('text').attr('class', 'svg-label').attr('x', 160 + k * 120).attr('y', 420).attr('text-anchor', 'middle')
              .style('fill', step === 2 && k === 0 ? C.text3 : c.color).text(c.name);
          });
          const defs = g.append('defs');
          const grad = defs.append('linearGradient').attr('id', 'sev-grad');
          grad.append('stop').attr('offset', '0%').attr('stop-color', C.asym);
          grad.append('stop').attr('offset', '45%').attr('stop-color', C.mild);
          grad.append('stop').attr('offset', '100%').attr('stop-color', '#e11d48');
          g.append('rect').attr('x', 110).attr('y', 450).attr('width', 580).attr('height', 4).attr('rx', 2).attr('fill', 'url(#sev-grad)');
          g.append('text').attr('class', 'svg-label svg-label--sm').attr('x', 110).attr('y', 478).text('less severe');
          g.append('text').attr('class', 'svg-label svg-label--sm').attr('x', 690).attr('y', 478).attr('text-anchor', 'end').text('more severe');
          g.append('text').attr('class', 'svg-label svg-label--sm').attr('x', 400).attr('y', 540).attr('text-anchor', 'middle').text('icon counts are illustrative');
          if (step === 2) {
            const bracket = (x1, x2, label, color) => {
              g.append('path').attr('d', `M${x1},${205} V190 H${x2} V205`).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2);
              g.append('text').attr('x', (x1 + x2) / 2).attr('y', 176).attr('text-anchor', 'middle').attr('class', 'svg-label').style('fill', color).style('font-weight', 600).text(label);
            };
            bracket(242, 438, 'non-severe', C.mild);
            bracket(482, 678, 'severe', C.severe);
            g.append('text').attr('x', 160).attr('y', 176).attr('text-anchor', 'middle').attr('class', 'svg-label svg-label--sm').text('excluded');
          }
        }
        if (step === 3) {
          g.append('text').attr('class', 'svg-big').attr('x', 130).attr('y', 170).style('fill', C.mild).text('53');
          g.append('text').attr('class', 'svg-label').attr('x', 190).attr('y', 168).text('non-severe');
          g.append('text').attr('class', 'svg-big').attr('x', 500).attr('y', 170).style('fill', C.severe).text('23');
          g.append('text').attr('class', 'svg-label').attr('x', 560).attr('y', 168).text('severe');
          g.append('text').attr('class', 'svg-label svg-label--sm').attr('x', 400).attr('y', 560).attr('text-anchor', 'middle').text('1 icon = 1 patient · one initial sample each');
        }
        if (step === 4) {
          g.append('text').attr('class', 'svg-label').attr('x', 520).attr('y', 450).attr('text-anchor', 'middle').text('peripheral blood');
        }
      });
    };
  }

  // =========================================================
  // 02 · BLOOD — scroll-scrubbed zoom: tube → PBMC field → one cell
  // =========================================================
  const CELL_TYPES = [
    { k: 'T cells', c: C.t, p: 0.45, r: [9, 12] },
    { k: 'Monocytes', c: C.mono, p: 0.2, r: [13, 17] },
    { k: 'NK cells', c: C.nk, p: 0.12, r: [10, 13] },
    { k: 'B cells', c: C.b, p: 0.13, r: [9, 12] },
    { k: 'Dendritic cells', c: C.dc, p: 0.1, r: [11, 15] },
  ];

  function initBlood() {
    const scrolly = document.querySelector('#ch-blood .scrolly');
    const cv = setupCanvas(document.getElementById('blood-canvas'));
    const svg = d3.select('#blood-svg');
    const legend = document.getElementById('blood-legend');
    legend.innerHTML = CELL_TYPES.map((t) => `<span><i style="background:${t.c}"></i>${t.k}</span>`).join('');

    // --- tube (SVG) ---
    const tube = svg.append('g');
    const tubeInner = tube.append('g');
    tubeInner.append('rect').attr('x', -48).attr('y', -232).attr('width', 96).attr('height', 22).attr('rx', 5).attr('fill', '#475569');
    tubeInner.append('path').attr('d', 'M-40,-210 V140 a40,40 0 0 0 80,0 V-210 Z').attr('fill', 'rgba(255,255,255,.04)').attr('stroke', 'rgba(255,255,255,.45)').attr('stroke-width', 2.5);
    tubeInner.append('path').attr('d', 'M-37,-110 V18 H37 V-110 Z').attr('fill', '#fcd34d').attr('opacity', 0.55);
    tubeInner.append('rect').attr('x', -37).attr('y', 18).attr('width', 74).attr('height', 12).attr('fill', '#f8fafc');
    tubeInner.append('path').attr('d', 'M-37,30 V140 a37,37 0 0 0 74,0 V30 Z').attr('fill', '#be123c');
    const tubeLabels = tube.append('g').attr('class', 'svg-label');
    const lab = (y, ty, text, strong) => {
      tubeLabels.append('line').attr('x1', 46).attr('x2', 110).attr('y1', y).attr('y2', ty).attr('stroke', C.text3);
      tubeLabels.append('text').attr('x', 118).attr('y', ty + 5).text(text).style('fill', strong ? '#fff' : null).style('font-weight', strong ? 600 : null);
    };
    lab(-50, -60, 'Plasma');
    lab(24, 24, 'PBMCs (buffy coat)', true);
    lab(110, 120, 'Red blood cells');

    // --- cell field (canvas) ---
    const r = rng(11);
    const pickType = () => { let u = r(), acc = 0; for (const t of CELL_TYPES) { acc += t.p; if (u <= acc) return t; } return CELL_TYPES[0]; };
    const cells = [];
    while (cells.length < 230) {
      const x = -60 + r() * 920, y = -60 + r() * 720;
      if (Math.hypot(x - 400, y - 300) < 46) continue;
      const t = pickType();
      cells.push({ x, y, t, rad: t.r[0] + r() * (t.r[1] - t.r[0]), ph: r() * 6.28, n: 8 + Math.floor(r() * 6), rot: r() * 6.28 });
    }
    const hero = { x: 400, y: 300, t: CELL_TYPES[0], rad: 15, ph: 0, n: 22, rot: 0, hero: true };
    cells.push(hero);
    const greyStroke = 'rgba(148,163,184,0.55)';

    function progress() {
      const rect = scrolly.getBoundingClientRect();
      return clamp((innerHeight * 0.5 - rect.top) / rect.height);
    }

    function frame(t) {
      const p = progress();
      const appear = smooth(0.26, 0.34, p), color = smooth(0.45, 0.53, p), zoom = smooth(0.64, 0.86, p);

      // tube zooms into the buffy coat and fades
      const ts = 1 + 9 * smooth(0.2, 0.33, p);
      tube.attr('transform', `translate(400,330) scale(${ts}) translate(0,-24)`).style('opacity', 1 - smooth(0.25, 0.32, p));
      tubeLabels.style('opacity', 1 - smooth(0.18, 0.23, p));
      legend.classList.toggle('is-visible', color > 0.5 && zoom < 0.25);

      cv.clear();
      if (appear <= 0) return;
      cv.world();
      const ctx = cv.ctx;
      const scale = lerp(0.55, 1, appear) * Math.pow(15, zoom);
      for (const c of cells) {
        const jx = reduceMotion ? 0 : Math.sin(t * 0.0005 + c.ph) * 3, jy = reduceMotion ? 0 : Math.cos(t * 0.0004 + c.ph) * 3;
        const x = 400 + (c.x + (c.hero ? 0 : jx) - 400) * scale, y = 300 + (c.y + (c.hero ? 0 : jy) - 300) * scale;
        const rad = c.rad * scale;
        if (x + rad < -20 || x - rad > 820 || y + rad < -20 || y - rad > 620) continue;
        const fade = c.hero ? 1 : 1 - smooth(0.05, 0.5, zoom);
        if (fade <= 0) continue;
        ctx.globalAlpha = appear * fade;
        const col = d3.interpolateRgb(greyStroke, c.t.c)(color);
        ctx.fillStyle = 'rgba(148,163,184,0.07)';
        ctx.strokeStyle = col; ctx.lineWidth = c.hero ? 1.5 + zoom * 2 : 1.3;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath(); ctx.arc(x + rad * 0.12, y - rad * 0.08, rad * 0.55, 0, 6.283); ctx.fill();
        if (color > 0) {
          ctx.globalAlpha = appear * fade * color;
          ctx.fillStyle = c.t.c;
          const n = c.hero ? Math.round(lerp(22, 90, zoom)) : c.n;
          const dr = c.hero ? lerp(1.8, 4, zoom) : 1.7;
          for (let k = 0; k < n; k++) {
            const a = c.rot + k * 6.283 / n + (reduceMotion ? 0 : t * 0.0001);
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * (rad + dr * 0.6), y + Math.sin(a) * (rad + dr * 0.6), dr, 0, 6.283); ctx.fill();
          }
        }
        if (c.hero && zoom > 0.02 && zoom < 0.9) {
          ctx.globalAlpha = smooth(0.02, 0.2, zoom) * (1 - smooth(0.6, 0.9, zoom));
          ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, rad * 1.35, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      ctx.globalAlpha = 1;
    }
    loopWhileVisible(scrolly, frame);
  }

  // =========================================================
  // 03 · CITE-SEQ — antibodies with DNA barcodes on the membrane
  // =========================================================
  function initCite() {
    const svg = d3.select('#stage-cite');
    const stage = svg.node().parentNode;
    const tip = document.createElement('div'); tip.className = 'tooltip'; stage.appendChild(tip);

    // Illustrative marker set for the T cell we zoomed into. Values are NOT data.
    const markers = [
      { id: 'CD3', c: '#60a5fa', v: 0.95, desc: 'Part of the T-cell receptor complex. Marks all T cells.' },
      { id: 'CD4', c: '#38bdf8', v: 0.8, desc: 'Defines helper T cells; low levels on monocytes.' },
      { id: 'CD45RA', c: '#a78bfa', v: 0.55, desc: 'Isoform of CD45 typical of naive T cells.' },
      { id: 'CD27', c: '#34d399', v: 0.5, desc: 'Co-stimulatory receptor on naive and memory T cells.' },
      { id: 'CD38', c: '#f59e0b', v: 0.6, desc: 'Activation marker on lymphocytes.' },
      { id: 'HLA-DR', c: '#f472b6', v: 0.35, desc: 'MHC class II. On B cells, monocytes, dendritic cells and activated T cells.' },
      { id: 'CD69', c: '#fb7185', v: 0.3, desc: 'Early activation marker.' },
      { id: 'PD-1', c: '#fb923c', v: 0.25, desc: 'Inhibitory receptor (CD279) on activated or exhausted T cells.' },
    ];
    const unbound = [
      { id: 'CD14', c: '#2dd4bf', desc: 'Marks classical monocytes. Absent from T cells, so its antibody finds nothing to bind.' },
      { id: 'CD19', c: '#e879f9', desc: 'Marks B cells. Absent here.' },
      { id: 'CD56', c: '#facc15', desc: 'Marks NK cells. Absent here.' },
      { id: 'CD16', c: '#c4b5fd', desc: 'Marks NK cells and non-classical monocytes. Absent here.' },
    ];
    const R = 850, CX = 400, CY = 1220, G = 1.35; // G: glyph scale
    const arc = (deg) => { const a = deg * Math.PI / 180; return { x: CX + R * Math.sin(a), y: CY - R * Math.cos(a), rot: deg }; };

    const defs = svg.append('defs');
    const grad = defs.append('radialGradient').attr('id', 'cyto').attr('cx', '50%').attr('cy', '0%').attr('r', '14%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(96,165,250,0.20)');
    grad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(96,165,250,0.02)');

    const root = svg.append('g');
    root.append('circle').attr('cx', CX).attr('cy', CY).attr('r', R - 8).attr('fill', 'url(#cyto)');
    // lipid bilayer heads
    const lipids = root.append('g').attr('fill', 'rgba(96,165,250,0.55)');
    for (let d = -30; d <= 30; d += 0.55) {
      const o = arc(d), a = d * Math.PI / 180;
      lipids.append('circle').attr('cx', o.x).attr('cy', o.y).attr('r', 2.6);
      lipids.append('circle').attr('cx', o.x - Math.sin(a) * 14).attr('cy', o.y + Math.cos(a) * 14).attr('r', 2.6).attr('opacity', 0.6);
    }
    // decorative unlabeled proteins
    const deco = root.append('g').attr('fill', 'rgba(148,163,184,0.35)');
    d3.range(-25, 26, 3.3).forEach((d) => {
      const o = arc(d + 1.6);
      deco.append('ellipse').attr('rx', 5).attr('ry', 9).attr('transform', `translate(${o.x},${o.y}) rotate(${o.rot}) scale(${G}) translate(0,-6)`);
    });

    // labelled proteins + their antibodies (in each protein's local frame)
    const span = 21;
    markers.forEach((m, i) => { m.deg = -span + (2 * span * i) / (markers.length - 1); m.pos = arc(m.deg); });
    const prot = root.selectAll('g.prot').data(markers).join('g').attr('class', 'prot')
      .attr('transform', (d) => `translate(${d.pos.x},${d.pos.y}) rotate(${d.deg}) scale(${G})`);
    prot.append('line').attr('y1', 8).attr('y2', -16).attr('stroke', (d) => d.c).attr('stroke-width', 3).attr('stroke-linecap', 'round');
    prot.append('ellipse').attr('cy', -24).attr('rx', 9).attr('ry', 8).attr('fill', (d) => d.c);

    const ab = prot.append('g').attr('class', 'ab').attr('transform', 'translate(0,-260)').style('opacity', 0);
    const abPath = 'M-9,-31 L0,-45 M9,-31 L0,-45 M0,-45 L0,-60';
    ab.append('path').attr('d', abPath).attr('stroke', (d) => d.c).attr('stroke-width', 4).attr('stroke-linecap', 'round').attr('fill', 'none');
    const bases = ['#22d3ee', '#a3e635', '#f472b6', '#facc15'];
    const br = rng(5);
    const barcode = ab.append('g').attr('class', 'barcode').style('opacity', 0);
    barcode.append('line').attr('y1', -60).attr('y2', -118).attr('stroke', 'rgba(255,255,255,.35)').attr('stroke-width', 1);
    barcode.each(function () {
      const g = d3.select(this);
      for (let k = 0; k < 7; k++) g.append('rect').attr('x', -3).attr('y', -68 - k * 7.5).attr('width', 6).attr('height', 5.5).attr('rx', 1).attr('fill', bases[Math.floor(br() * 4)]);
    });

    const nameLabels = root.selectAll('text.mname').data(markers).join('text').attr('class', 'svg-label svg-mono mname')
      .attr('text-anchor', 'middle').style('font-size', '13px').style('fill', (d) => d.c)
      .attr('x', (d) => arc(d.deg).x + Math.sin(d.deg * Math.PI / 180) * 62).attr('y', (d) => arc(d.deg).y - Math.cos(d.deg * Math.PI / 180) * 62).text((d) => d.id);

    // unbound antibodies drifting in the medium
    const ur = rng(9);
    unbound.forEach((u, i) => { u.x = 160 + i * 160 + ur() * 40; u.y = 130 + ur() * 70; u.rot = (ur() - 0.5) * 80; });
    const free = svg.append('g').selectAll('g').data(unbound).join('g').style('opacity', 0)
      .attr('transform', (d) => `translate(${d.x},${d.y - 200}) rotate(${d.rot})`);
    free.append('path').attr('d', abPath).attr('stroke', (d) => d.c).attr('stroke-width', 4).attr('stroke-linecap', 'round').attr('fill', 'none').attr('transform', 'translate(0,45)');
    free.append('text').attr('class', 'svg-mono').attr('y', 34).attr('text-anchor', 'middle').style('font-size', '11px').style('fill', (d) => d.c).text((d) => d.id);

    // count chart (step 3)
    const chart = svg.append('g').style('opacity', 0);
    const all = markers.map((m) => ({ id: m.id, c: m.c, v: m.v })).concat(unbound.map((u) => ({ id: u.id, c: u.c, v: 0.02 })));
    const x = d3.scaleBand().domain(all.map((d) => d.id)).range([90, 710]).padding(0.28);
    const yH = d3.scaleLinear().domain([0, 1]).range([0, 130]);
    chart.append('text').attr('class', 'svg-label').attr('x', 90).attr('y', 30).style('fill', '#fff').style('font-weight', 600).text('Barcode counts for this cell');
    chart.append('text').attr('class', 'svg-label svg-label--sm').attr('x', 710).attr('y', 30).attr('text-anchor', 'end').text('12 of 192 antibodies shown · illustrative');
    const bars = chart.selectAll('rect').data(all).join('rect').attr('x', (d) => x(d.id)).attr('width', x.bandwidth())
      .attr('y', 190).attr('height', 0).attr('rx', 3).attr('fill', (d) => d.c);
    chart.selectAll('text.bl').data(all).join('text').attr('class', 'svg-mono bl').attr('x', (d) => x(d.id) + x.bandwidth() / 2)
      .attr('y', 208).attr('text-anchor', 'middle').style('font-size', '10.5px').style('fill', C.text3).text((d) => d.id);
    chart.append('line').attr('x1', 90).attr('x2', 710).attr('y1', 190).attr('y2', 190).attr('stroke', 'rgba(255,255,255,.15)');

    const callout = svg.append('g').style('opacity', 0);
    const ref = markers[3].pos, refA = markers[3].deg * Math.PI / 180;
    const tipX = ref.x + Math.sin(refA) * 160, tipY = ref.y - Math.cos(refA) * 160;
    callout.append('path').attr('d', `M${tipX + 8},${tipY - 6} C ${tipX + 60},${tipY - 50} ${tipX + 90},${tipY - 60} ${tipX + 130},${tipY - 64}`).attr('fill', 'none').attr('stroke', C.text3).attr('stroke-dasharray', '3 4');
    callout.append('text').attr('class', 'svg-label').attr('x', tipX + 138).attr('y', tipY - 60).style('fill', '#fff').text('DNA barcode');
    callout.append('text').attr('class', 'svg-label svg-label--sm').attr('x', tipX + 138).attr('y', tipY - 42).text('unique sequence per antibody');

    // hover tooltip on proteins
    const hit = root.selectAll('circle.protein-hit').data(markers.map((m) => ({ ...m, bound: true }))).join('circle')
      .attr('class', 'protein-hit').attr('r', 26).attr('fill', 'transparent')
      .attr('cx', (d) => arc(d.deg).x + Math.sin(d.deg * Math.PI / 180) * 40).attr('cy', (d) => arc(d.deg).y - Math.cos(d.deg * Math.PI / 180) * 40);
    function showTip(ev, d) {
      tip.innerHTML = `<b style="color:${d.c}">${d.id}</b>${d.desc}`;
      const b = stage.getBoundingClientRect();
      tip.style.left = Math.min(b.width - 270, ev.clientX - b.left + 14) + 'px';
      tip.style.top = (ev.clientY - b.top + 14) + 'px';
      tip.classList.add('is-visible');
    }
    hit.on('pointerenter pointermove', showTip).on('pointerleave', () => tip.classList.remove('is-visible'));
    free.style('cursor', 'pointer').on('pointerenter pointermove', showTip).on('pointerleave', () => tip.classList.remove('is-visible'));

    handlers.citeseq = (step) => {
      const T = (sel) => sel.interrupt().transition().duration(DUR);
      T(ab).delay((_, i) => (step === 1 ? i * 90 : 0))
        .attr('transform', step >= 1 ? 'translate(0,0)' : 'translate(0,-260)').style('opacity', step >= 1 ? 1 : 0);
      T(barcode).style('opacity', step === 2 ? 1 : 0);
      T(free).delay((_, i) => (step === 1 ? 200 + i * 120 : 0))
        .attr('transform', (d) => step === 0 ? `translate(${d.x},${d.y - 200}) rotate(${d.rot})`
          : step === 1 ? `translate(${d.x},${d.y}) rotate(${d.rot})`
            : `translate(${d.x},${d.y - 220}) rotate(${d.rot + 40})`)
        .style('opacity', step === 1 ? 1 : 0);
      T(nameLabels).style('opacity', step === 0 ? 1 : 0);
      T(callout).style('opacity', step === 2 ? 1 : 0);
      T(chart).style('opacity', step === 3 ? 1 : 0);
      T(bars).delay((_, i) => (step === 3 ? 200 + i * 60 : 0))
        .attr('y', (d) => (step === 3 ? 190 - yH(d.v) : 190)).attr('height', (d) => (step === 3 ? yH(d.v) : 0));
      hit.style('pointer-events', step === 0 || step === 3 ? 'all' : 'none');
    };
  }

  // =========================================================
  // 04 · DATA — the cell × protein matrix collapses to patients
  // =========================================================
  function initData() {
    const cv = setupCanvas(document.getElementById('data-canvas'));
    const svg = d3.select('#data-svg');
    const labels = svg.append('g');
    const cmap = lut(d3.interpolateRgbBasis(['#0a1024', '#1e2a5c', '#4c4fb5', '#8b9cff', '#e0e7ff']));
    const r = rng(21);
    const NPROT = 192, ROWS = 360, ISO = [23, 77, 131, 170];

    // illustrative cell-type profiles
    const profiles = CELL_TYPES.map(() => {
      const p = new Float32Array(NPROT).map(() => 0.08 + r() * 0.12);
      for (let k = 0; k < 14; k++) p[Math.floor(r() * NPROT)] = 0.65 + r() * 0.35;
      for (let k = 0; k < 26; k++) p[Math.floor(r() * NPROT)] = 0.3 + r() * 0.2;
      ISO.forEach((j) => { p[j] = 0.04; });
      return p;
    });
    function makeImage(w, h, fn) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d'), img = cx.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const col = cmap[Math.round(clamp(fn(x, y)) * 255)]; const o = (y * w + x) * 4;
        img.data[o] = col.r; img.data[o + 1] = col.g; img.data[o + 2] = col.b; img.data[o + 3] = 255;
      }
      cx.putImageData(img, 0, 0); return c;
    }
    const rowType = d3.range(ROWS).map(() => { let u = r(), acc = 0; for (let i = 0; i < CELL_TYPES.length; i++) { acc += CELL_TYPES[i].p; if (u <= acc) return i; } return 0; }).sort();
    const cellImg = makeImage(NPROT, ROWS, (x, y) => profiles[rowType[y]][x] + gauss(r) * 0.09);
    const rnaImg = makeImage(480, ROWS, (x, y) => (r() < 0.05 + 0.08 * ((x * 7 + rowType[y] * 97) % 41 < 4) ? 0.35 + r() * 0.6 : 0.02));
    const sevCols = d3.range(12).map(() => Math.floor(r() * NPROT));
    const keep = d3.range(NPROT).filter((j) => !ISO.includes(j));
    const patients = d3.range(76).map((i) => {
      const w = CELL_TYPES.map(() => r()); const s = d3.sum(w);
      const prof = new Float32Array(NPROT);
      for (let j = 0; j < NPROT; j++) prof[j] = d3.sum(profiles, (p, t) => p[j] * w[t] / s) + gauss(r) * 0.03 + (i >= 53 && sevCols.includes(j) ? 0.18 : 0);
      return prof;
    });
    const patImg = makeImage(keep.length, 76, (x, y) => patients[y][keep[x]] * 1.25);

    const target = {
      0: { mx: 200, mw: 400, rna: 0, agg: 0 },
      1: { mx: 60, mw: 200, rna: 1, agg: 0 },
      2: { mx: 200, mw: 400, rna: 0, agg: 0 },
      3: { mx: 200, mw: 400, rna: 0, agg: 1 },
    };
    const st = { mx: 200, mw: 400, rna: 0, agg: 0 };
    let step = 0, offset = 0;
    const MY = 110, MH = 400;

    function frame(t, dt) {
      const tg = target[step], k = reduceMotion ? 1 : 1 - Math.pow(0.0025, dt / 1000);
      for (const key in tg) st[key] = lerp(st[key], tg[key], k);
      if (!reduceMotion) offset = (offset + dt * 0.03 * (1 - st.agg)) % ROWS;
      cv.clear(); cv.world();
      const ctx = cv.ctx; ctx.imageSmoothingEnabled = false;
      // cells (scrolling rows)
      if (st.agg < 0.999) {
        ctx.globalAlpha = 1 - st.agg;
        const o = Math.floor(offset), h1 = ROWS - o, squash = lerp(1, 0.3, st.agg);
        const H = MH * squash, y0 = MY + (MH - H) / 2;
        ctx.drawImage(cellImg, 0, o, NPROT, h1, st.mx, y0, st.mw, H * h1 / ROWS);
        if (o > 0) ctx.drawImage(cellImg, 0, 0, NPROT, o, st.mx, y0 + H * h1 / ROWS, st.mw, H * o / ROWS);
      }
      if (st.rna > 0.01) {
        ctx.globalAlpha = st.rna;
        const o = Math.floor(offset), h1 = ROWS - o, x = lerp(400, 280, st.rna);
        ctx.drawImage(rnaImg, 0, o, 480, h1, x, MY, 460, MH * h1 / ROWS);
        if (o > 0) ctx.drawImage(rnaImg, 0, 0, 480, o, x, MY + MH * h1 / ROWS, 460, MH * o / ROWS);
      }
      if (st.agg > 0.001) {
        ctx.globalAlpha = st.agg;
        ctx.drawImage(patImg, st.mx, MY, st.mw, MH);
        for (let i = 0; i < 76; i++) {
          ctx.fillStyle = i < 53 ? C.mild : C.severe;
          ctx.fillRect(st.mx - 16, MY + (i * MH) / 76 + 0.6, 9, MH / 76 - 1.2);
        }
      }
      ctx.globalAlpha = 1;
      // fade top/bottom edges for the "stream" feel
      if (st.agg < 0.5) {
        const g1 = ctx.createLinearGradient(0, MY, 0, MY + 40); g1.addColorStop(0, 'rgba(7,11,22,1)'); g1.addColorStop(1, 'rgba(7,11,22,0)');
        ctx.fillStyle = g1; ctx.fillRect(0, MY - 1, 800, 41);
        const g2 = ctx.createLinearGradient(0, MY + MH - 40, 0, MY + MH); g2.addColorStop(0, 'rgba(7,11,22,0)'); g2.addColorStop(1, 'rgba(7,11,22,1)');
        ctx.fillStyle = g2; ctx.fillRect(0, MY + MH - 40, 800, 41);
      }
    }
    loopWhileVisible(document.getElementById('stage-data'), frame);

    handlers.data = (s) => {
      step = s;
      swapLayer(labels, (g) => {
        const L = (x, y, txt, anchor = 'start', cls = 'svg-label') => g.append('text').attr('class', cls).attr('x', x).attr('y', y).attr('text-anchor', anchor).text(txt);
        if (s === 0 || s === 2) {
          const big = L(400, 70, '0', 'middle', 'svg-big');
          if (s === 0) big.transition().duration(reduceMotion ? 0 : 1600).tween('text', () => { const i = d3.interpolateRound(0, 647366); return (t) => big.text(fmt(i(t)) + ' cells'); });
          else big.text('647,366 cells');
          L(400, 545, '192 proteins (ADTs) →', 'middle', 'svg-label svg-mono');
          L(185, 310, 'cells ↓', 'end', 'svg-label svg-mono');
        }
        if (s === 1) {
          L(160, 70, '192 proteins', 'middle', 'svg-label svg-mono').style('fill', '#fff');
          L(510, 70, '24,737 genes (RNA)', 'middle', 'svg-label svg-mono').style('fill', '#fff');
          L(400, 545, 'same 647,366 cells, two measurements', 'middle', 'svg-label svg-label--sm');
        }
        if (s === 2) {
          ISO.forEach((j, n) => {
            const x = 200 + (j + 0.5) * 400 / NPROT;
            g.append('rect').attr('x', x - 4).attr('y', MY - 8).attr('width', 8).attr('height', MH + 16).attr('rx', 3)
              .attr('fill', 'rgba(251,191,36,.12)').attr('stroke', C.warn).attr('stroke-width', 1.5);
            g.append('text').attr('x', x).attr('y', MY - 16).attr('text-anchor', 'middle').attr('class', 'svg-mono').style('fill', C.warn).style('font-size', '12px').text(`iso ${n + 1}`);
          });
        }
        if (s === 3) {
          L(400, 70, '76 patients × 188 proteins', 'middle', 'svg-big').style('font-size', '30px');
          L(176, 140, 'non-severe', 'end', 'svg-label svg-label--sm').style('fill', C.mild);
          L(176, 490, 'severe', 'end', 'svg-label svg-label--sm').style('fill', C.severe);
          L(400, 545, 'one aggregated profile per patient (illustrative values)', 'middle', 'svg-label svg-label--sm');
        }
      });
    };
  }

  // =========================================================
  // 05 · COMPRESS — slider + AUROC chart
  // =========================================================
  function initCompress() {
    const slider = document.getElementById('k-slider');
    const kV = document.getElementById('k-value'), kP = document.getElementById('k-pct'), kT = document.getElementById('k-tubes');
    const tilesEl = document.getElementById('tiles');
    const N = 188, PER_TUBE = 12;
    const order = d3.shuffle(d3.range(N), rng(4)); // illustrative removal order
    const rank = new Array(N); order.forEach((tileIdx, r) => { rank[tileIdx] = r; });
    const tiles = d3.range(N).map(() => { const d = document.createElement('div'); d.className = 'tile'; tilesEl.appendChild(d); return d; });

    // chart
    const svg = d3.select('#auroc-chart');
    const W = 560, H = 380, m = { t: 20, r: 24, b: 46, l: 54 };
    const x = d3.scaleLog().domain([1, 200]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0.4, 1]).range([H - m.b, m.t]);
    svg.append('g').attr('class', 'gridline').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat('')).call((g) => g.select('.domain').remove());
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues([1, 2, 5, 10, 20, 50, 100, 188]).tickFormat(d3.format('d')));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6));
    svg.append('text').attr('class', 'svg-label svg-label--sm').attr('x', (m.l + W - m.r) / 2).attr('y', H - 8).attr('text-anchor', 'middle').text('number of markers (log scale)');
    svg.append('text').attr('class', 'svg-label svg-label--sm').attr('transform', `translate(14,${(m.t + H - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('AUROC');
    // chance line
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0.5)).attr('y2', y(0.5)).attr('stroke', C.text3).attr('stroke-dasharray', '4 4');
    svg.append('text').attr('class', 'svg-label svg-label--sm').attr('x', m.l + 6).attr('y', y(0.5) - 6).text('chance');
    // pending band
    svg.append('rect').attr('x', m.l).attr('y', y(0.95)).attr('width', W - m.l - m.r).attr('height', y(0.55) - y(0.95))
      .attr('fill', 'url(#hatch)').attr('opacity', 0.5);
    const hatch = svg.append('defs').append('pattern').attr('id', 'hatch').attr('width', 8).attr('height', 8).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
    hatch.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 8).attr('stroke', 'rgba(139,156,255,.12)').attr('stroke-width', 3);
    svg.append('text').attr('class', 'svg-label svg-label--sm').attr('x', x(4)).attr('y', y(0.9)).attr('text-anchor', 'middle').text('final curve pending');

    // preliminary results (README, Milestone P2)
    const pts = [
      { k: 188, m: 0.655, sd: 0.138, label: 'L2 · all 188', c: C.accent },
      { k: 21, m: 0.638, sd: 0.136, label: 'L1 · ~21 selected', c: C.mild },
    ];
    const pg = svg.selectAll('g.pt').data(pts).join('g').attr('class', 'pt');
    pg.append('line').attr('x1', (d) => x(d.k)).attr('x2', (d) => x(d.k)).attr('y1', (d) => y(d.m - d.sd)).attr('y2', (d) => y(d.m + d.sd)).attr('stroke', (d) => d.c).attr('stroke-width', 2);
    pg.append('line').attr('x1', (d) => x(d.k) - 6).attr('x2', (d) => x(d.k) + 6).attr('y1', (d) => y(d.m - d.sd)).attr('y2', (d) => y(d.m - d.sd)).attr('stroke', (d) => d.c).attr('stroke-width', 2);
    pg.append('line').attr('x1', (d) => x(d.k) - 6).attr('x2', (d) => x(d.k) + 6).attr('y1', (d) => y(d.m + d.sd)).attr('y2', (d) => y(d.m + d.sd)).attr('stroke', (d) => d.c).attr('stroke-width', 2);
    pg.append('circle').attr('cx', (d) => x(d.k)).attr('cy', (d) => y(d.m)).attr('r', 6).attr('fill', (d) => d.c).attr('stroke', '#070b16').attr('stroke-width', 2);
    pg.append('text').attr('class', 'svg-label svg-mono').style('font-size', '12px').style('fill', (d) => d.c)
      .attr('x', (d) => x(d.k) - 10).attr('y', (d) => y(d.m) + 4).attr('text-anchor', 'end').text((d) => `${d.label}  ${d.m.toFixed(3)}`);

    const cursor = svg.append('g');
    cursor.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', '#fff').attr('stroke-opacity', 0.5);
    const cursorLabel = cursor.append('text').attr('class', 'svg-mono').attr('y', m.t + 4).attr('text-anchor', 'middle').style('fill', '#fff').style('font-size', '12px');

    function update() {
      const k = +slider.value;
      kV.textContent = k; kP.textContent = Math.round((k / N) * 100) + '%'; kT.textContent = Math.ceil(k / PER_TUBE);
      slider.style.setProperty('--fill', ((k - 1) / (N - 1)) * 100 + '%');
      tiles.forEach((t, i) => t.classList.toggle('is-off', rank[i] >= k));
      cursor.attr('transform', `translate(${x(k)},0)`);
      cursorLabel.attr('dy', -8).text(`k = ${k}`).attr('text-anchor', k > 120 ? 'end' : k < 2 ? 'start' : 'middle');
    }
    slider.addEventListener('input', update);
    update();
  }

  // =========================================================
  // 06 · FLOW — simulated cytometer acquisition with a gate
  // =========================================================
  function initFlow() {
    const fluor = [
      { f: 'FITC', c: '#4ade80' }, { f: 'PE', c: '#facc15' }, { f: 'PerCP-Cy5.5', c: '#f87171' }, { f: 'PE-Cy7', c: '#fb923c' },
      { f: 'APC', c: '#f43f5e' }, { f: 'APC-Cy7', c: '#c084fc' }, { f: 'BV421', c: '#818cf8' }, { f: 'BV510', c: '#22d3ee' },
    ];
    fluor.forEach((d, i) => { d.m = 'Marker ' + String.fromCharCode(65 + i); });
    const list = document.getElementById('channels');
    let axes = [0, 1]; // [x, y]
    let patient = 'mild';
    function renderList() {
      list.innerHTML = fluor.map((d, i) => {
        const ax = axes[0] === i ? 'X' : axes[1] === i ? 'Y' : '';
        return `<li class="channel${ax ? ' is-selected' : ''}" data-i="${i}" tabindex="0" role="button" aria-pressed="${!!ax}">
          <span class="channel__dot" style="background:${d.c};color:${d.c}"></span>
          <span>${d.m}${ax ? `<span class="channel__axis">${ax}-axis</span>` : ''}</span>
          <span class="channel__fluor">${d.f}</span></li>`;
      }).join('');
      document.getElementById('flow-x').textContent = `${fluor[axes[0]].m} · ${fluor[axes[0]].f}`;
      document.getElementById('flow-y').textContent = `${fluor[axes[1]].m} · ${fluor[axes[1]].f}`;
    }
    function choose(i) {
      if (axes.includes(i)) return;
      axes = [axes[1], i]; // newest pick becomes Y, previous Y becomes X
      renderList(); reset();
    }
    list.addEventListener('click', (e) => { const li = e.target.closest('.channel'); if (li) choose(+li.dataset.i); });
    list.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('channel')) { e.preventDefault(); choose(+e.target.dataset.i); } });
    document.querySelectorAll('.toggle button').forEach((b) => b.addEventListener('click', () => {
      patient = b.dataset.patient;
      document.querySelectorAll('.toggle button').forEach((o) => o.setAttribute('aria-selected', String(o === b)));
      reset();
    }));

    const canvas = document.getElementById('flow-canvas');
    const ctx = canvas.getContext('2d');
    const GW = 140, GH = 120, MAXN = 30000, PAD = { l: 34, b: 32, t: 14, r: 14 };
    const hist = new Float32Array(GW * GH);
    const turbo = lut(d3.interpolateTurbo);
    let pops = [], gate = null, n = 0, inGate = 0, r = rng(1);
    let W = 0, H = 0, dpr = 1;
    function resize() { const b = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = b.width; H = b.height; canvas.width = W * dpr; canvas.height = H * dpr; }
    new ResizeObserver(resize).observe(canvas); resize();

    function reset() {
      const pr = rng(axes[0] * 13 + axes[1] * 7 + 1);
      pops = [
        { mx: 0.2 + pr() * 0.1, my: 0.2 + pr() * 0.12, sx: 0.07, sy: 0.08, w: 0.55, rho: 0.2 },
        { mx: 0.55 + pr() * 0.15, my: 0.25 + pr() * 0.15, sx: 0.09, sy: 0.07, w: 0.3, rho: -0.1 },
        { mx: 0.62 + pr() * 0.12, my: 0.68 + pr() * 0.1, sx: 0.07, sy: 0.07, w: 0.12, rho: 0.35 },
      ];
      if (patient === 'severe') { pops[2].w = 0.32; pops[2].mx += 0.05; pops[0].w = 0.4; }
      const s = d3.sum(pops, (p) => p.w); pops.forEach((p) => { p.w /= s; });
      const g = pops[2]; gate = { x0: g.mx - 2.3 * g.sx, x1: g.mx + 2.3 * g.sx, y0: g.my - 2.3 * g.sy, y1: g.my + 2.3 * g.sy };
      hist.fill(0); n = 0; inGate = 0; r = rng(axes[0] * 31 + axes[1] * 17 + (patient === 'severe' ? 5 : 0));
    }
    function sample() {
      let u = r(), p = pops[0];
      for (const q of pops) { if (u < q.w) { p = q; break; } u -= q.w; }
      const a = gauss(r), b = gauss(r);
      return [p.mx + p.sx * a, p.my + p.sy * (p.rho * a + Math.sqrt(1 - p.rho * p.rho) * b)];
    }
    function frame() {
      const add = reduceMotion ? MAXN : 260;
      for (let i = 0; i < add && n < MAXN; i++) {
        const [vx, vy] = sample();
        if (vx < 0 || vx >= 1 || vy < 0 || vy >= 1) continue;
        hist[Math.floor(vy * GH) * GW + Math.floor(vx * GW)]++; n++;
        if (vx >= gate.x0 && vx <= gate.x1 && vy >= gate.y0 && vy <= gate.y1) inGate++;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b, cw = pw / GW, ch = ph / GH;
      ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath(); ctx.moveTo(PAD.l + (pw * k) / 4, PAD.t); ctx.lineTo(PAD.l + (pw * k) / 4, PAD.t + ph); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t + (ph * k) / 4); ctx.lineTo(PAD.l + pw, PAD.t + (ph * k) / 4); ctx.stroke();
      }
      let max = 1; for (let i = 0; i < hist.length; i++) if (hist[i] > max) max = hist[i];
      const lm = Math.log1p(max);
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const c = hist[j * GW + i]; if (!c) continue;
        ctx.fillStyle = turbo[Math.round(255 * (0.1 + 0.85 * Math.log1p(c) / lm))].css;
        ctx.fillRect(PAD.l + i * cw, PAD.t + ph - (j + 1) * ch, cw + 0.4, ch + 0.4);
      }
      // gate
      const gx = PAD.l + gate.x0 * pw, gy = PAD.t + ph - gate.y1 * ph, gw = (gate.x1 - gate.x0) * pw, gh = (gate.y1 - gate.y0) * ph;
      ctx.strokeStyle = C.warn; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.strokeRect(gx, gy, gw, gh); ctx.setLineDash([]);
      ctx.fillStyle = C.warn; ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText('Gate 1', gx + 4, gy - 6);
      // axes
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + ph); ctx.lineTo(PAD.l + pw, PAD.t + ph); ctx.stroke();
      document.querySelector('#gate-readout strong').textContent = n ? `${((inGate / n) * 100).toFixed(1)}%  ·  ${fmt(n)} events` : '–';
    }
    renderList(); reset();
    loopWhileVisible(canvas, frame);
  }

  // ---------- boot ----------
  function boot() {
    initNav();
    initHero();
    initPatient();
    initBlood();
    initCite();
    initData();
    initCompress();
    initFlow();
    initSteps();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

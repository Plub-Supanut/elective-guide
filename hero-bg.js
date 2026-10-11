/* ─────────────────────────────────────────────────────────────
   ฉากหลัง hero: "เส้นทางจากคณะฯ สู่ที่หมาย"
   จุด 117 จุด = สถาบัน 117 แห่ง · เส้นโค้ง = เส้นทางจากจุฬาฯ
   ใช้ canvas 2D (ไม่พึ่งไลบรารี) หยุดวาดเมื่อหลุดจอ และเคารพ prefers-reduced-motion
   ───────────────────────────────────────────────────────────── */
(() => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const overlay = hero.querySelector('.hero-overlay');
  hero.insertBefore(canvas, overlay || hero.firstChild);
  const ctx = canvas.getContext('2d', { alpha: true });
  let running = true;

  // สุ่มแบบกำหนด seed ได้ → รูปแบบเดิมทุกครั้งที่เปิด
  let seed = 20261011;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const COLORS = ['rgba(168,196,160,', 'rgba(224,151,122,', 'rgba(232,180,198,', 'rgba(245,239,230,'];
  const POINTS = 117;
  let dots = [], arcs = [], W = 0, H = 0, dpr = 1;
  let origin = { x: 0, y: 0 };
  let pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function build() {
    seed = 20261011;
    const rect = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // จุดกำเนิด (คณะแพทยศาสตร์ จุฬาฯ) — วางไว้ค่อนไปทางซ้ายล่าง ให้เส้นโค้งกวาดขึ้น
    origin = { x: W * 0.34, y: H * 0.78 };

    dots = [];
    for (let i = 0; i < POINTS; i++) {
      const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.62);
      dots.push({
        x: W * 0.5 + Math.cos(a) * r * W * 0.52,
        y: H * 0.5 + Math.sin(a) * r * H * 0.46,
        r: 0.7 + rnd() * 1.5,
        c: COLORS[Math.floor(rnd() * COLORS.length)],
        A: 0.16 + rnd() * 0.34,
        ph: rnd() * Math.PI * 2,
        sp: 0.25 + rnd() * 0.5,
      });
    }
    // เลือกจุดที่ไกลออกไปพอสมควรมาลากเส้น (ไม่ให้เส้นเต็มจอ)
    arcs = dots
      .map((d, i) => ({ d, i, dist: Math.hypot(d.x - origin.x, d.y - origin.y) }))
      .filter(o => o.dist > Math.min(W, H) * 0.18)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 26)
      .map((o, k) => ({ ...o, start: k * 0.9, dur: 3.4 + (k % 5) * 0.45 }));
  }

  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const arcPath = (x1, y1, x2, y2, bow) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    return [mx - dy / len * len * bow, my + dx / len * len * bow];
  };

  function frame(t) {
    if (!running) return;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    const time = t / 1000;

    // เส้นทางที่ค่อย ๆ ลากออกแล้วจางหาย
    if (!reduced) {
      arcs.forEach(a => {
        const local = ((time + a.start) % 9) / a.dur;
        if (local > 1) return;
        const p = ease(Math.min(1, local));
        const [cx, cy] = arcPath(origin.x, origin.y, a.d.x, a.d.y, 0.16);
        const bx = (1 - p) * (1 - p) * origin.x + 2 * (1 - p) * p * cx + p * p * a.d.x;
        const by = (1 - p) * (1 - p) * origin.y + 2 * (1 - p) * p * cy + p * p * a.d.y;
        const alpha = Math.sin(local * Math.PI) * 0.55;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.quadraticCurveTo(cx, cy, bx, by);
        ctx.strokeStyle = `rgba(196,113,75,${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      });
    }

    // จุดสถาบัน — ลอยช้า ๆ แต่ละจุดคนละจังหวะ
    dots.forEach(d => {
      const dx = reduced ? 0 : Math.sin(time * d.sp + d.ph) * 6;
      const dy = reduced ? 0 : Math.cos(time * d.sp * 0.8 + d.ph) * 5;
      ctx.beginPath();
      ctx.arc(d.x + dx + pointer.x, d.y + dy + pointer.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = d.c + (d.A * (reduced ? 1 : 0.72 + 0.28 * Math.sin(time * 0.8 + d.ph))).toFixed(3) + ')';
      ctx.fill();
    });

    // จุดกำเนิดเต้นเบา ๆ
    ctx.beginPath();
    ctx.arc(origin.x + pointer.x, origin.y + pointer.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(196,113,75,0.75)';
    ctx.fill();
    if (!reduced) requestAnimationFrame(frame);
  }

  build();
  frame(0);
  if (!reduced) requestAnimationFrame(frame);

  // หยุดวาดเมื่อ hero หลุดจอ (ประหยัดแบต)
  if ('IntersectionObserver' in window && !reduced) {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !running) { running = true; requestAnimationFrame(frame); }
      else if (!e.isIntersecting) { running = false; }
    }, { threshold: 0.02 }).observe(hero);
  }

  // ขยับตามเมาส์เล็กน้อย (parallax)
  if (!reduced && window.matchMedia('(pointer: fine)').matches) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 18;
      pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 14;
    });
    const lerp = () => {
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      requestAnimationFrame(lerp);
    };
    lerp();
  }

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { build(); if (reduced) frame(0); }, 200);
  });
})();

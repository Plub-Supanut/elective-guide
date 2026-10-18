/* ─────────────────────────────────────────────────────────────
   ลูกเล่นเล็ก ๆ ที่ทำให้เว็บดูมีชีวิต (ไม่พึ่งไลบรารี)
   1) แถบความคืบหน้าการอ่าน
   2) ตัวเลขการ์ดสรุปวิ่งขึ้นเมื่อเลื่อนถึง
   3) ไฟสปอตไลต์ตามเมาส์บนการ์ด
   4) เมนูบนไฮไลต์ตามส่วนที่กำลังอ่าน
   ทั้งหมดเคารพ prefers-reduced-motion
   ───────────────────────────────────────────────────────────── */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  // ── 1) แถบความคืบหน้า ────────────────────────────────────────
  // premium.js สร้าง .eg-progress ไว้แล้ว — เว้นแถบเดียว ไม่ให้มีแถบซ้อนกัน 2 อัน

  // ── 2) ตัวเลขการ์ดสรุปวิ่งขึ้น ─────────────────────────────────
  const nums = [...document.querySelectorAll('.stat-num')];
  const countUp = (el) => {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const target = parseInt(el.textContent.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(target)) return;
    if (reduced || target === 0) { el.textContent = String(target); return; }
    const dur = 520, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = String(target);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) { countUp(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.4 });
    nums.forEach(n => io.observe(n));
  }

  // ── 3) สปอตไลต์ตามเมาส์บนการ์ด ────────────────────────────────
  if (finePointer && !reduced) {
    let raf = 0, last = null;
    document.addEventListener('pointermove', (e) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const card = last.target && last.target.closest ? last.target.closest('.card, .ssc-card, .tip-card, .stat-card') : null;
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${(((last.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${(((last.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      });
    }, { passive: true });
  }

  // ── 4) เมนูบนไฮไลต์ตามส่วนที่อ่านอยู่ ─────────────────────────
  const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const pairs = links
    .map(a => ({ a, el: document.getElementById(a.getAttribute('href').slice(1)) }))
    .filter(p => p.el);
  if (pairs.length && 'IntersectionObserver' in window) {
    const setActive = (id) => pairs.forEach(p => p.a.classList.toggle('active', p.el.id === id));
    const spy = new IntersectionObserver((es) => {
      const hit = es.filter(e => e.isIntersecting)
        .sort((x, y) => y.intersectionRatio - x.intersectionRatio)[0];
      if (hit) setActive(hit.target.id);
    }, { rootMargin: '-45% 0px -50% 0px', threshold: [0, 0.25, 0.6] });
    pairs.forEach(p => spy.observe(p.el));
    window.addEventListener('scroll', () => {
      if (window.scrollY < 120) setActive('');
    }, { passive: true });
  }
  // ── 5) เมนู "เพิ่มเติม" บนมือถือ ───────────────────────────────
  const moreBtn = document.getElementById('navMoreBtn');
  const moreMenu = document.getElementById('navMoreMenu');
  if (moreBtn && moreMenu) {
    const close = () => { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); };
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = moreMenu.hidden;
      moreMenu.hidden = !open;
      moreBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      // ใช้ contains(): ผู้ใช้มักกดที่ <svg>/<circle> ข้างในปุ่ม ไม่ใช่ตัวปุ่ม
      if (!moreMenu.hidden && !moreMenu.contains(e.target) && !moreBtn.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    moreMenu.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  }
})();

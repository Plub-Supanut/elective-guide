/* =======================================================================
   PREMIUM LAYER (JS) — ของเพิ่มทับ ไม่แก้ไฟล์เดิม
   1) แถบความคืบหน้าการเลื่อน + สถานะเนวิเกชัน
   2) ตัวเลขวิ่งเมื่อปรากฏ (uiarc · "numbers that move")
   3) ไฟส่องตามเคอร์เซอร์บนแผ่นแผนที่
   ปิดการเคลื่อนไหวทั้งหมดเมื่อ prefers-reduced-motion: reduce
   ======================================================================= */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. progress hairline + nav state ─────────────────────────── */
  const bar = document.createElement('div');
  bar.className = 'eg-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  const nav = document.getElementById('stickyNav');
  let queueScroll = false;
  const onScroll = () => {
    if (queueScroll) return;
    queueScroll = true;
    requestAnimationFrame(() => {
      queueScroll = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.setProperty('--eg-p', p.toFixed(4));
      // nav ลอยโปร่งใสบน hero → เปลี่ยนเป็นแถบทึบเมื่อพ้น hero (เดิมเปลี่ยนที่ 8px ทำให้แถบทึบ
      // ไปทับ hero ทันทีที่เลื่อนนิดเดียว)
      if (nav) {
        const hero = document.getElementById('hero');
        const solidAt = Math.max(80, (hero ? hero.offsetHeight : window.innerHeight) - 96);
        nav.classList.toggle('eg-scrolled', window.scrollY > solidAt);
      }
      flushPending();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();   // ตั้งสถานะเริ่มต้น (เช่นเปิดมาที่ #anchor ที่เลื่อนอยู่แล้ว)

  /* ── 2. ตัวเลขวิ่งเมื่อปรากฏ ──────────────────────────────────── */
  const COUNT_SEL = [
    '#map-facts .map-fact',
    '#map-legend .legend-count',
    '#map-near .map-near-km',
    '#map-card .map-card-facts dd',
  ].join(', ');
  const NUM_RX = /\d[\d,]*/g;
  const pending = new Set();
  const seen = new WeakSet();

  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > -60 && r.top < (window.innerHeight || 0) + 60;
  };

  function animateNumber(el) {
    if (el.dataset.egBusy === '1') return;
    const orig = el.textContent;
    if (el.dataset.egText === orig) { pending.delete(el); return; }
    const matches = [...orig.matchAll(NUM_RX)];
    if (!matches.length) { el.dataset.egText = orig; pending.delete(el); return; }
    el.classList.add('eg-num');
    if (reduced) { el.dataset.egText = orig; pending.delete(el); return; }

    let tpl = '';
    let idx = 0;
    for (const m of matches) { tpl += orig.slice(idx, m.index) + '\u0000'; idx = m.index + m[0].length; }
    tpl += orig.slice(idx);
    const targets = matches.map((m) => parseInt(m[0].replace(/,/g, ''), 10));

    el.dataset.egBusy = '1';
    const D = 520;
    const t0 = performance.now();
    const step = () => {
      if (!el.isConnected) return;               // การ์ดถูกวาดใหม่ระหว่างวิ่ง → หยุดเงียบ ๆ
      const t = Math.min(1, Math.max(0, (performance.now() - t0) / D));
      const e = 1 - Math.pow(1 - t, 3);
      let k = 0;
      el.textContent = tpl.replace(/\u0000/g, () => String(Math.round(targets[k++] * e)));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = orig;          // จบที่ค่าเดิมเป๊ะ ๆ (ทดสอบวัดซ้ำได้)
        el.dataset.egText = orig;
        el.dataset.egBusy = '0';
        pending.delete(el);
      }
    };
    requestAnimationFrame(step);
  }

  function flushPending() {
    if (!pending.size) return;
    for (const el of [...pending]) {
      if (!el.isConnected) { pending.delete(el); continue; }
      if (inView(el)) animateNumber(el);
    }
  }

  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(COUNT_SEL).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      pending.add(el);
    });
    flushPending();
  }

  scan(document);

  if ('MutationObserver' in window) {
    let timer = 0;
    const mo = new MutationObserver(() => {
      if (timer) return;
      timer = window.setTimeout(() => { timer = 0; scan(document); }, 80);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ── 3. ไฟส่องตามเคอร์เซอร์บนแผ่นแผนที่ ──────────────────────── */
  const section = document.querySelector('.map-section');
  const paper = document.querySelector('.map-paper');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (section && paper && finePointer && !reduced) {
    let raf = 0;
    let mx = 0;
    let my = 0;
    const apply = () => {
      raf = 0;
      paper.style.setProperty('--eg-mx', mx + 'px');
      paper.style.setProperty('--eg-my', my + 'px');
    };
    section.addEventListener('pointermove', (e) => {
      const r = paper.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
      section.classList.add('eg-glint');
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
    section.addEventListener('pointerleave', () => section.classList.remove('eg-glint'));
  }
})();

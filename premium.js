/* =======================================================================
   PREMIUM LAYER (JS)
   แถบความคืบหน้าการอ่าน (hairline) + สถานะเนวิเกชัน

   • หน้าแรกมี hero เต็มจอ: เนวิเกชันลอยโปร่งใส แล้วเปลี่ยนเป็นแถบทึบ
     เมื่อเลื่อนผ่าน 30% ของ hero (ไม่รอให้พ้น hero ทั้งจอ)
   • หน้าอื่นไม่มี hero → CSS จัดการแถบทึบไว้แล้ว ที่นี่จึงไม่ต้องทำอะไร
   • เคารพ prefers-reduced-motion: ไม่มีแอนิเมชันเพิ่ม เฉพาะการเปลี่ยนสถานะ
   ======================================================================= */
(() => {
  'use strict';

  const NAV_SOLID_RATIO = 0.3;    // 30% แรกของ hero = ยังโปร่งใส
  const NAV_MIN_SOLID_AT = 80;    // กัน hero เตี้ย: อย่างน้อย 80px

  const nav = document.getElementById('stickyNav');
  const hero = document.getElementById('hero');

  /* ── แถบความคืบหน้า ────────────────────────────────────────────── */
  const progress = document.createElement('div');
  progress.className = 'eg-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);

  let queued = false;

  const paint = () => {
    queued = false;

    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    progress.style.setProperty('--eg-p', ratio.toFixed(4));

    if (nav) {
      const solidAt = Math.max(
        NAV_MIN_SOLID_AT,
        hero ? hero.offsetHeight * NAV_SOLID_RATIO : window.innerHeight
      );
      nav.classList.toggle('eg-scrolled', window.scrollY > solidAt);
    }
  };

  const requestPaint = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  };

  window.addEventListener('scroll', requestPaint, { passive: true });
  window.addEventListener('resize', requestPaint, { passive: true });
  paint();   // เปิดมาที่ anchor ที่เลื่อนอยู่แล้วก็ให้สถานะถูกตั้งแต่แรก
})();

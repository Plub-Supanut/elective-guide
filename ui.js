/* ============================================================
   ELECTIVE GUIDE — ui.js
   พฤติกรรมร่วมของทุกหน้า (ไม่ผูกกับเนื้อหาหน้าใดหน้าหนึ่ง)
   - เผยการ์ด/หัวข้อตอนเลื่อนถึง (.fade-up)
   - เงาใต้แถบเมนูตอนเลื่อน
   - เลื่อนแบบนุ่มเมื่อกดลิงก์ #anchor ภายในหน้า
   - ปุ่มกลับขึ้นด้านบน
   - ทำความสะอาดข้อความหัวการ์ด (ตัดช่องว่าง/บรรทัดเกิน)
   เนื้อหาที่เป็นของหน้าใดหน้าหนึ่ง (ค้นหา/การ์ด/แผนที่) อยู่ในไฟล์ของหน้านั้น
   ============================================================ */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 1) fade-up on scroll ──────────────────────────────────────
  const fadeEls = document.querySelectorAll('.fade-up');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    fadeEls.forEach(el => el.classList.add('visible'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (!e.isIntersecting) return;
        const delay = Math.min(i * 40, 200);
        setTimeout(() => e.target.classList.add('visible'), delay);
        io.unobserve(e.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    fadeEls.forEach(el => io.observe(el));
  }

  // ── 2) เงาใต้แถบเมนูตอนเลื่อน ────────────────────────────────
  const nav = document.getElementById('stickyNav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.style.boxShadow = window.scrollY > 20
        ? '0 2px 24px rgba(44,40,36,0.14)'
        : '0 1px 12px rgba(44,40,36,0.06)';
    }, { passive: true });
  }

  // ── 3) anchor ภายในหน้า: เลื่อนแบบนุ่ม เว้นที่ให้แถบเมนู ──────
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const sel = link.getAttribute('href');
      if (!sel || sel === '#') return;
      const target = document.querySelector(sel);
      if (!target) return;
      e.preventDefault();
      // ถ้าผลค้นหาซ่อนรายการอยู่ ล้างก่อน เพื่อไม่ให้ลงจอดในที่ว่าง
      const results = document.getElementById('searchResults');
      if (results && results.classList.contains('active')) {
        document.getElementById('searchClear')?.click();
      }
      const offset = 78;   // ตรงกับ html { scroll-padding-top: 78px }
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  // ── 4) ปุ่มกลับขึ้นด้านบน ────────────────────────────────────
  const toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.className = 'to-top';
  toTop.setAttribute('aria-label', 'กลับขึ้นด้านบน');
  toTop.textContent = '↑';
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));
  document.body.appendChild(toTop);
  window.addEventListener('scroll', () => {
    toTop.classList.toggle('visible', window.scrollY > 800);
  }, { passive: true });

  // ── 5) ทำความสะอาดข้อความหัวการ์ด ───────────────────────────
  // ตัด \n/ช่องว่างหัวท้ายใน text node ตรง ๆ หัวการ์ดมี <span class="code">101</span>
  // ข้างใน จึงห้ามแตะ element ลูก และต้องคงช่องว่างนำหน้า (ไม่งั้น "101ม.ขอนแก่น")
  const tidyCardText = () => {
    document.querySelectorAll('.card-title, .card .card-sub, .inst-name, .map-near-pick, .map-card-name').forEach(el => {
      el.childNodes.forEach(n => {
        if (n.nodeType !== 3) return;
        const raw = n.nodeValue;
        const hasPrevEl = n.previousSibling && n.previousSibling.nodeType === 1;
        let t = raw.replace(/[\s\u00a0]+/g, ' ');
        const leading = hasPrevEl && t.replace(/\u00a0/g, ' ').trim() !== '';
        const keepNbsp = leading && /^\u00a0/.test(t);
        t = t.replace(/\u00a0/g, ' ').trim();
        n.nodeValue = (leading && t !== '' ? (keepNbsp ? '\u00a0' : ' ') : '') + t;
      });
    });
  };
  tidyCardText();
  if (document.readyState !== 'complete') window.addEventListener('load', tidyCardText, { once: true });
  setTimeout(tidyCardText, 900);
})();

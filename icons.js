/* ─────────────────────────────────────────────────────────────
   icons.js — แทน emoji ด้วยไอคอน SVG เส้น (stroke) ชุดเดียว
   เหตุผล: emoji สีสันไม่เข้ากับชุดสี sand/sage/terracotta และดูเป็นของเล่น
   วิธี: ใส่ sprite ครั้งเดียว แล้วแทน "emoji ตัวแรก" ของข้อความด้วย <svg>
   ถ้าเบราว์เซอร์ไม่รันสคริปต์ ผู้ใช้ยังเห็น emoji เดิม (ไม่พัง)
   ───────────────────────────────────────────────────────────── */
(() => {
  const ICONS = {
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mobile: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    printer: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>',
    sparkle: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5 19.7 17l1.5.7-1.5.7L19 20l-.7-1.6-1.5-.7 1.5-.7z"/>',
    city: '<path d="M3 21h18"/><path d="M5 21V7l5-3v17"/><path d="M10 21V10l6-3v14"/><path d="M16 21v-7l4-2v9"/>',
    scales: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6a3 3 0 0 0 6 0z"/><path d="m19 7 3 6a3 3 0 0 1-6 0z"/><path d="M8 21h8"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    hospital: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
    syringe: '<path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3a2.4 2.4 0 0 1-3.4 0l-3.6-3.6a2.4 2.4 0 0 1 0-3.4L12 2"/><path d="m9 11 4 4"/><path d="m5 15 4 4"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-5M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>',
    bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v9M9 10v9M15 10v9M19 10v9"/><path d="M3 21h18"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    mountain: '<path d="m3 20 7-12 4 7 2-3 5 8z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    hotel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 16h18"/><path d="M7 16v-5h5v5"/><path d="M16 12h.01"/>',
  };

  const EMOJI = {
    '👤': 'user', '📞': 'phone', '☎': 'phone', '📱': 'mobile', '✉': 'mail',
    '📠': 'printer', '🏠': 'home', '🏡': 'home', '🏢': 'building', '🏥': 'hospital',
    '📍': 'pin', '📌': 'pin', '💰': 'money', '📄': 'file', '📝': 'file',
    '📋': 'clipboard', '🔗': 'link', '🔒': 'lock', '🌐': 'globe', '🎓': 'cap',
    '🔍': 'search', '✨': 'sparkle', '🏙': 'city', '⚖': 'scales', '⚠': 'alert',
    '⭐': 'star', '❌': 'x', '✕': 'x', '💬': 'message', '💉': 'syringe', '🕐': 'clock', 'ℹ': 'info',
    '🏛': 'bank', '📖': 'book', '📅': 'calendar', '🏔': 'mountain', '🦠': 'shield', '🏨': 'hotel',
  };

  // สร้าง sprite
  const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sprite.setAttribute('aria-hidden', 'true');
  sprite.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  sprite.innerHTML = Object.entries(ICONS).map(([k, p]) =>
    `<symbol id="eg-i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${p}</symbol>`
  ).join('');
  document.body.prepend(sprite);

  const makeIcon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'eg-icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#eg-i-${name}`);
    svg.appendChild(use);
    return svg;
  };

  // emoji (อาจมี variation selector) ที่ต้นข้อความ
  const LEAD = /^(\s*)([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}])\uFE0F?(\s*)/u;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'TITLE']);
  let replaced = 0;

  const walk = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (!n.nodeValue || !LEAD.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const m = node.nodeValue.match(LEAD);
      if (!m) continue;
      const name = EMOJI[m[2]];
      if (!name) continue;
      const parent = node.parentElement;
      parent.insertBefore(makeIcon(name), node);
      const rest = node.nodeValue.slice(m[0].length);
      // คงช่องว่างหลังไอคอนไว้ ถ้ายังมีข้อความต่อ (เช่น "📝 ต้นฉบับ" → ไอคอน + " ต้นฉบับ")
      node.nodeValue = m[1] + (rest.trim() ? ' ' : '') + rest;
      if (!node.nodeValue.trim()) node.nodeValue = '';
      replaced++;
    }
  };

  const run = () => {
    walk(document.body);
    // พื้นที่ที่สร้างภายหลัง (ผลค้นหา, การ์ดแผนที่) — แทนให้ด้วยเมื่อมีของใหม่
    if ('MutationObserver' in window) {
      const mo = new MutationObserver((muts) => {
        for (const mu of muts) {
          for (const n of mu.addedNodes) {
            if (n.nodeType === 1) walk(n);
            else if (n.nodeType === 3 && n.parentElement) walk(n.parentElement);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    if (window.console && location.search.includes('debug-icons')) console.log('[icons] replaced', replaced);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();

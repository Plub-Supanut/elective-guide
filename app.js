/* ============================================================
   ELECTIVE GUIDE — app.js
   Search, filter, animations, interactions
   ============================================================ */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Intersection Observer: fade-up on scroll ──────────────────
const fadeEls = document.querySelectorAll('.fade-up');
if (reduceMotion) {
  fadeEls.forEach(el => el.classList.add('visible'));
} else {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        const delay = Math.min(i * 40, 200);
        setTimeout(() => e.target.classList.add('visible'), delay);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  fadeEls.forEach(el => io.observe(el));
}

// ── Sticky nav shadow on scroll ──────────────────────────────
const nav = document.getElementById('stickyNav');
window.addEventListener('scroll', () => {
  nav.style.boxShadow = window.scrollY > 20
    ? '0 2px 24px rgba(44,40,36,0.14)'
    : '0 1px 12px rgba(44,40,36,0.06)';
}, { passive: true });

// ── Build a flat index of all cards for search ───────────────
// (Built BEFORE the expand hints are appended, so hint text never
//  pollutes search results.)
const allCards = Array.from(document.querySelectorAll('.card'));
const mainList = document.getElementById('institutions');

const cardIndex = allCards.map(card => {
  const tags = (card.dataset.tags || '').toLowerCase();
  return {
    el: card,
    tags: tags.split(/\s+/).filter(Boolean),
    searchable: tags + ' ' + card.innerText.toLowerCase(),
  };
});

// ── Filter buttons ────────────────────────────────────────────
const filterBtns = document.querySelectorAll('.filter-btn');
let activeFilter = 'all';

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    syncFilterUI();
    runSearch();
  });
});

// ── การ์ดสถิติ 4 อัน = ทางลัดกรอง (ไม่ใช่แค่ตัวเลขโชว์) ─────────
const statCards = document.querySelectorAll('.stat-card[data-stat]');

function syncFilterUI() {
  filterBtns.forEach(b => {
    const on = b.dataset.filter === activeFilter;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  statCards.forEach(c => {
    const on = c.dataset.stat === activeFilter && activeFilter !== 'all';
    c.classList.toggle('is-active', on);
    c.setAttribute('aria-pressed', String(on));
  });
}

statCards.forEach(card => {
  card.addEventListener('click', () => {
    activeFilter = card.dataset.stat;
    syncFilterUI();
    runSearch();
    document.getElementById('searchResults')?.setAttribute('aria-live', 'polite');
    if (activeFilter === 'all') {
      // «แสดงทั้งหมด» = กลับไปดูรายชื่อเต็มที่อยู่ถัดลงไป (ไม่ต้องกรอง)
      document.getElementById('institutions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const sec = document.getElementById('search');
    if (sec) {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      sec.classList.remove('flash');
      void sec.offsetWidth;              // ให้ animation เล่นใหม่ได้ทุกครั้ง
      sec.classList.add('flash');
      setTimeout(() => sec.classList.remove('flash'), 2400);
    }
  });
});

// ── Search input ──────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
let searchTimer = null;

searchInput.addEventListener('input', () => {
  searchClear.classList.toggle('visible', searchInput.value.length > 0);
  // Debounced: re-rendering on every keystroke blocked the main
  // thread ~40ms on a common character (janky typing on mobile).
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 120);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  runSearch();
  searchInput.focus();
});

// Exact tag match — substring matching made the จุฬา filter also
// match "chulabhorn" and made "rama" match "ramathibodi".
function matchesFilter(card, filter) {
  if (filter === 'all') return true;
  const entry = cardIndex.find(c => c.el === card);
  if (!entry) return true;
  return entry.tags.includes(filter);
}

const filterLabel = {
  all: 'ทั้งหมด', chula: 'จุฬา (ภาควิชา)', university: 'มหาวิทยาลัย',
  hospital: 'โรงพยาบาล/ศูนย์', regional: 'ภูมิภาค', dormitory: 'มีที่พัก',
};

function clearAll() {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  activeFilter = 'all';
  filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
  runSearch();
}

function runSearch() {
  const results = document.getElementById('searchResults');
  const q = searchInput.value.trim().toLowerCase();
  const filterActive = activeFilter !== 'all';

  // Nothing searched or filtered: restore the full list.
  if (q === '' && !filterActive) {
    results.classList.remove('active');
    results.innerHTML = '';
    mainList.hidden = false;
    return;
  }

  const matched = cardIndex.filter(({ el, searchable }) =>
    matchesFilter(el, activeFilter) && (q === '' || searchable.includes(q)));

  // One results panel; the section list is hidden while it is showing,
  // so the reader never scrolls past blank section headers.
  mainList.hidden = true;
  results.classList.add('active');
  results.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'results-head';

  const count = document.createElement('p');
  count.className = 'results-count';
  const what = q === '' ? `ตัวกรอง «${filterLabel[activeFilter]}»` : `คำค้น «${searchInput.value.trim()}»`;
  count.innerHTML = matched.length
    ? `พบ <strong>${matched.length}</strong> รายการ จาก${what}`
    : `ไม่พบรายการจาก${what}`;
  head.appendChild(count);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'results-reset';
  reset.textContent = '✕ ล้างการค้นหา / ตัวกรอง';
  reset.addEventListener('click', clearAll);
  head.appendChild(reset);
  results.appendChild(head);

  if (!matched.length) {
    const empty = document.createElement('p');
    empty.className = 'results-empty';
    empty.textContent = 'ลองใช้คำค้นอื่น เช่น ชื่อโรงพยาบาล ภาควิชา ชื่อผู้ประสานงาน หรือเบอร์โทร';
    results.appendChild(empty);
    return;
  }

  matched.forEach(({ el }) => {
    const clone = el.cloneNode(true);
    // Result cards always open collapsed, and must drop the scroll
    // reveal class: a fresh clone is never seen by the observer, so it
    // would otherwise stay at .fade-up's opacity:0.
    clone.classList.remove('fade-up', 'visible');
    clone.classList.remove('expanded');
    clone.setAttribute('aria-expanded', 'false');
    const hint = clone.querySelector('.expand-hint');
    if (hint) hint.textContent = '▾ ดูรายละเอียดเพิ่มเติม';
    const det = clone.querySelector('.card-detail');
    if (det) { det.style.maxHeight = '0'; det.style.opacity = '0'; }
    if (q) highlightCard(clone, q);
    clone.classList.add('result-clone');
    results.appendChild(clone);
  });
}

// Highlight matches by building nodes — never re-parse text as HTML.
function highlightCard(card, q) {
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  const targets = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement && node.parentElement.closest('.expand-hint')) continue;
    if (node.textContent.toLowerCase().includes(q)) targets.push(node);
  }
  targets.forEach(node => {
    const lower = node.textContent.toLowerCase();
    const frag = document.createDocumentFragment();
    let i = 0;
    while (i < node.textContent.length) {
      const at = lower.indexOf(q, i);
      if (at === -1) { frag.appendChild(document.createTextNode(node.textContent.slice(i))); break; }
      if (at > i) frag.appendChild(document.createTextNode(node.textContent.slice(i, at)));
      const mark = document.createElement('mark');
      mark.className = 'highlight';
      mark.textContent = node.textContent.slice(at, at + q.length);
      frag.appendChild(mark);
      i = at + q.length;
    }
    node.parentNode.replaceChild(frag, node);
  });
}

// ── Card detail expand/collapse ───────────────────────────────
function setExpanded(card, open) {
  const detail = card.querySelector('.card-detail');
  if (!detail) return;
  const hint = card.querySelector('.expand-hint');

  card.classList.toggle('expanded', open);
  card.setAttribute('aria-expanded', open ? 'true' : 'false');

  if (open) {
    detail.style.overflow = 'hidden';
    detail.style.transition = 'max-height 0.4s ease, opacity 0.4s ease';
    detail.style.maxHeight = '0';
    detail.style.opacity = '0';
    requestAnimationFrame(() => {
      detail.style.maxHeight = detail.scrollHeight + 'px';
      detail.style.opacity = '1';
    });
    // The open panel is released to max-height:none once the animation
    // ends, so a later reflow (window resize, browser font size / zoom,
    // text re-wrap) can never clip the content again.
  } else {
    detail.style.maxHeight = detail.scrollHeight + 'px';
    void detail.offsetHeight;   // commit the height before animating to 0
    detail.style.maxHeight = '0';
    detail.style.opacity = '0';
  }
  if (hint) hint.textContent = open ? '▴ ซ่อนรายละเอียด' : '▾ ดูรายละเอียดเพิ่มเติม';
}

document.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  if (e.target.closest('a')) return;             // never hijack a link click
  if (e.target.closest('.card-detail')) return;  // let people select/copy detail text
  if (!card.querySelector('.card-detail')) return;
  setExpanded(card, !card.classList.contains('expanded'));
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest ? e.target.closest('.card') : null;
  if (!card || e.target !== card) return;
  if (!card.querySelector('.card-detail')) return;
  e.preventDefault();
  setExpanded(card, !card.classList.contains('expanded'));
});

// Initialize: collapse all card-details, add hints + keyboard affordances.
document.querySelectorAll('.card').forEach(card => {
  const detail = card.querySelector('.card-detail');
  if (!detail) return;
  detail.style.maxHeight = '0';
  detail.style.opacity = '0';
  detail.style.overflow = 'hidden';
  detail.style.transition = 'max-height 0.4s ease, opacity 0.4s ease';

  // Release the fixed height once an open animation finishes.
  detail.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'max-height' && e.target === detail && card.classList.contains('expanded')) {
      detail.style.maxHeight = 'none';
    }
  });

  card.style.cursor = 'pointer';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-expanded', 'false');

  const hint = document.createElement('div');
  hint.className = 'expand-hint';
  hint.textContent = '▾ ดูรายละเอียดเพิ่มเติม';
  hint.setAttribute('aria-hidden', 'true');
  card.appendChild(hint);
});

// ── Smooth anchor scrolling with offset for sticky nav ────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const sel = link.getAttribute('href');
    if (!sel || sel === '#') return;
    const target = document.querySelector(sel);
    if (!target) return;
    e.preventDefault();
    // If a search/filter is hiding the list, clear it first so the
    // anchor never drops the reader into an empty section.
    if (mainList.hidden) clearAll();
    const offset = 70;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
});

// ── Back to top ───────────────────────────────────────────────
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

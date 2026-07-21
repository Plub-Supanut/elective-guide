/* ============================================================
   ELECTIVE GUIDE — app.js
   Search, filter, animations, interactions
   ============================================================ */

// ── Intersection Observer: fade-up on scroll ──────────────────
const fadeEls = document.querySelectorAll('.fade-up');
const ioOptions = { threshold: 0.1, rootMargin: '0px 0px -40px 0px' };
const io = new IntersectionObserver((entries) => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      // stagger siblings slightly
      const delay = Math.min(i * 40, 200);
      setTimeout(() => e.target.classList.add('visible'), delay);
      io.unobserve(e.target);
    }
  });
}, ioOptions);
fadeEls.forEach(el => io.observe(el));

// ── Sticky nav shadow on scroll ──────────────────────────────
const nav = document.getElementById('stickyNav');
window.addEventListener('scroll', () => {
  nav.style.boxShadow = window.scrollY > 20
    ? '0 2px 24px rgba(44,40,36,0.14)'
    : '0 1px 12px rgba(44,40,36,0.06)';
}, { passive: true });

// ── Build a flat index of all cards for search ───────────────
const allCards = Array.from(document.querySelectorAll('.card'));

// Collect searchable text per card
const cardIndex = allCards.map(card => {
  const tags = (card.dataset.tags || '').toLowerCase();
  const text = card.innerText.toLowerCase();
  return { el: card, searchable: tags + ' ' + text };
});

// Clone each card for search results panel
const searchResults = document.getElementById('searchResults');
const cardClones = allCards.map(card => {
  const clone = card.cloneNode(true);
  clone.style.opacity = '0';
  clone.style.transform = 'translateY(18px)';
  clone.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
  return clone;
});

// ── Filter buttons ────────────────────────────────────────────
const filterBtns = document.querySelectorAll('.filter-btn');
let activeFilter = 'all';

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    runSearch();
  });
});

// ── Search input ──────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

searchInput.addEventListener('input', () => {
  searchClear.classList.toggle('visible', searchInput.value.length > 0);
  runSearch();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  runSearch();
});

function matchesFilter(card, filter) {
  if (filter === 'all') return true;
  const tags = (card.dataset.tags || '').toLowerCase();
  if (filter === 'dormitory') return tags.includes('dormitory');
  return tags.includes(filter);
}

function runSearch() {
  const q = searchInput.value.trim().toLowerCase();
  const isActive = q.length > 0 || activeFilter !== 'all';

  if (!isActive) {
    searchResults.classList.remove('active');
    searchResults.innerHTML = '';
    // Restore original cards
    allCards.forEach(c => { c.style.display = ''; });
    return;
  }

  // Show search panel
  searchResults.classList.add('active');
  searchResults.innerHTML = '';

  const matched = [];
  cardIndex.forEach((item, idx) => {
    const filterOk = matchesFilter(item.el, activeFilter);
    const searchOk = q === '' || item.searchable.includes(q);
    if (filterOk && searchOk) {
      matched.push({ idx, item });
    }
    // Hide/show original cards based on filter
    item.el.style.display = (filterOk && q === '') ? '' : 'none';
  });

  if (q.length > 0) {
    if (matched.length === 0) {
      searchResults.innerHTML = '<p style="text-align:center;color:var(--warm-gray);padding:2rem;grid-column:1/-1">ไม่พบผลการค้นหา กรุณาลองคำค้นอื่น</p>';
      return;
    }

    matched.forEach(({ idx }) => {
      const clone = cardIndex[idx].el.cloneNode(true);
      // Highlight
      if (q) highlightCard(clone, q);
      clone.style.opacity = '0';
      clone.style.transform = 'translateY(16px)';
      clone.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      clone.style.display = '';
      searchResults.appendChild(clone);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          clone.style.opacity = '1';
          clone.style.transform = 'translateY(0)';
        });
      });
    });
  } else {
    // Filter only — restore visibility
    allCards.forEach(card => {
      card.style.display = matchesFilter(card, activeFilter) ? '' : 'none';
    });
    searchResults.classList.remove('active');
    searchResults.innerHTML = '';
  }
}

function highlightCard(card, q) {
  // Only highlight in text nodes within card-body and card-header
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  const toReplace = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.toLowerCase().includes(q)) {
      toReplace.push(node);
    }
  }
  toReplace.forEach(node => {
    const regex = new RegExp(`(${escapeRe(q)})`, 'gi');
    const span = document.createElement('span');
    span.innerHTML = node.textContent.replace(regex, '<mark class="highlight">$1</mark>');
    node.parentNode.replaceChild(span, node);
  });
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Card detail expand/collapse (click anywhere on card body) ─
document.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  // Don't toggle if clicking a link
  if (e.target.tagName === 'A') return;
  const detail = card.querySelector('.card-detail');
  if (!detail) return;

  const isOpen = card.classList.contains('expanded');
  if (isOpen) {
    card.classList.remove('expanded');
    detail.style.maxHeight = detail.scrollHeight + 'px';
    requestAnimationFrame(() => {
      detail.style.maxHeight = '0';
      detail.style.opacity = '0';
    });
  } else {
    card.classList.add('expanded');
    detail.style.maxHeight = '0';
    detail.style.opacity = '0';
    detail.style.overflow = 'hidden';
    detail.style.transition = 'max-height 0.4s ease, opacity 0.4s ease';
    requestAnimationFrame(() => {
      detail.style.maxHeight = detail.scrollHeight + 'px';
      detail.style.opacity = '1';
    });
  }

  // Update hint text — works for both original cards and search-result clones
  const hint = card.querySelector('.expand-hint');
  if (hint) {
    hint.textContent = card.classList.contains('expanded')
      ? '▴ ซ่อนรายละเอียด'
      : '▾ ดูรายละเอียดเพิ่มเติม';
  }
});

// Initialize: collapse all card-details
document.querySelectorAll('.card-detail').forEach(d => {
  d.style.maxHeight = '0';
  d.style.opacity = '0';
  d.style.overflow = 'hidden';
  d.style.transition = 'max-height 0.4s ease, opacity 0.4s ease';
});

// Add expand hint to cards with details
document.querySelectorAll('.card').forEach(card => {
  if (card.querySelector('.card-detail')) {
    card.style.cursor = 'pointer';
    const hint = document.createElement('div');
    hint.className = 'expand-hint';
    hint.textContent = '▾ ดูรายละเอียดเพิ่มเติม';
    hint.style.cssText = `
      font-size:0.78rem;color:var(--sage-dark);padding:0.5rem 1.4rem 0.8rem;
      font-weight:500;transition:color 0.2s;user-select:none;
    `;
    card.appendChild(hint);
    // Hint text is updated by the global click handler above (works for clones too)
  }
});

// ── Smooth anchor scrolling with offset for sticky nav ────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const offset = 70;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

/* ============================================================
   ELECTIVE GUIDE — app.js
   ค้นหา / ตัวกรอง / แท็บหมวด / การกาง-หุบการ์ด
   (โหลดเฉพาะหน้า institutions.html)

   หมายเหตุ: fade-up, เงาแถบเมนู, anchor นุ่ม, ปุ่มกลับขึ้นบน และ tidy ข้อความ
   ย้ายไปอยู่ ui.js แล้ว เพราะใช้ร่วมทุกหน้า — ไฟล์นี้เหลือเฉพาะของหน้าสถาบัน
   ============================================================ */

// ── Build a flat index of all cards for search ───────────────
// (Built BEFORE the expand hints are appended, so hint text never
//  pollutes search results.)
const allCards = Array.from(document.querySelectorAll('.card'));
const mainList = document.getElementById('institutions');

// ── คำพ้อง / การเขียนแบบย่อ (aliases.js) ──────────────────────
const SYNONYMS = window.SEARCH_SYNONYMS || [];

// คำที่เขียนเต็มกับแบบย่อใช้แทนกันได้ — ตัดออกทั้งสองฝั่งก่อนเทียบ
// (รพ.ชลบุรี = โรงพยาบาลชลบุรี, ภาควิชากายวิภาค = กายวิภาคศาสตร์, CU = จุฬาฯ)
const FILLER = /(โรงพยาบาล|รพ\.|คณะแพทยศาสตร์|มหาวิทยาลัย|ศูนย์แพทยศาสตร์ศึกษาชั้นคลินิก|ศูนย์การแพทย์|ศูนย์|สถาบัน|ภาควิชา|แผนก|สาขาวิชา|สาขา|วิทยาลัย|แห่งชาติ|hospital|university|faculty|department|dept|institute|centre|center|college|school|and)/gi;
const normText = s => s.toLowerCase().replace(FILLER, '').replace(/[\s.\-–—()«»"'/]/g, '');

// คำสั้น (เช่น «มข») ต้องยืนเป็นคำโดด ไม่งั้น «หมอ» จะถูกนับว่ามี «มอ»
function hasTerm(text, term) {
  const t = term.toLowerCase();
  if (t.length >= 4) return text.includes(t);
  let i = text.indexOf(t);
  while (i > -1) {
    const before = text[i - 1] || ' ';
    const after = text[i + t.length] || ' ';
    if (!/[฀-๿a-z0-9]/.test(before) && !/[฀-๿a-z0-9]/.test(after)) return true;
    i = text.indexOf(t, i + 1);
  }
  return false;
}

// การ์ดที่มีคำใดในกลุ่มคำพ้อง → คำอื่นในกลุ่มเดียวกันค้นเจอด้วย
function aliasTerms(text) {
  const out = [];
  SYNONYMS.forEach(group => {
    if (group.some(term => hasTerm(text, term))) out.push(group.join(' '));
  });
  return out.join(' ');
}

const cardIndex = allCards.map(card => {
  const tags = (card.dataset.tags || '').toLowerCase();
  // ใช้ textContent ไม่ใช่ innerText: ต้องค้นเจอข้อความใน «ดูรายละเอียดเพิ่มเติม»
  // ที่ยังไม่กาง (innerText ข้ามข้อความที่ถูกซ่อน/ตัดด้วย overflow)
  //   (non-breaking space ที่ใช้กัน «ต่อ» กับเลขไม่ให้แยกจากกัน) ต้องถือเป็นช่องว่างปกติด้วย
  // ตัด ZWSP (zero-width space ที่ใช้กำหนดจุดตัดบรรทัดคำไทย) ออกก่อนทำดัชนี
  const body = card.textContent.replace(/​/g, '').replace(/[\s ]+/g, ' ').toLowerCase();
  const base = tags + ' ' + body;
  const searchable = base + ' ' + aliasTerms(base).toLowerCase();
  const title = (card.querySelector('.card-title')?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const titleBase = title + ' ' + tags;
  return {
    el: card,
    tags: tags.split(/\s+/).filter(Boolean),
    title,
    region: card.dataset.region || '',
    code: (card.querySelector('.code')?.textContent || '').trim(),
    freeDorm: /ที่พักฟรี/.test(card.querySelector('.badge-dormitory')?.textContent || ''),
    // รวมคำพ้องของชื่อ/แท็กด้วย → ค้น «จุฬาฯ» แล้วการ์ดภาควิชาจุฬาฯ ขึ้นก่อน
    titleNorm: normText(titleBase + ' ' + aliasTerms(titleBase).toLowerCase()),
    searchable,
    searchableNorm: normText(searchable),
  };
});

// ── ตัวกรองแบบเลือกได้หลายเงื่อนไข ────────────────────────────
// แบ่ง 3 กลุ่ม: ประเภท / ภูมิภาค / อื่น ๆ
// เลือกหลายอันในกลุ่มเดียวกัน = หรือ (OR) · เลือกข้ามกลุ่ม = และ (AND)
const filterBtns = Array.from(document.querySelectorAll('.filter-btn'));
const filterClearBtn = document.getElementById('filterClear');
const sortSelect = document.getElementById('sortSelect');
const statCards = document.querySelectorAll('.stat-card[data-stat]');
const groups = { type: new Set(), region: new Set(), extra: new Set() };
let sortMode = 'default';

const groupOf = f => (f.startsWith('region:') ? 'region'
  : (f === 'dormitory' || f === 'dorm-free') ? 'extra' : 'type');
const selected = () => [...groups.type, ...groups.region, ...groups.extra];
const activeCount = () => selected().length;
const anyFilter = () => activeCount() > 0;

// การ์ดผ่านตัวกรองไหม — เทียบทีละกลุ่ม
function cardMatches(item) {
  if (groups.type.size) {
    const ok = [...groups.type].some(f => f === 'regional-plain'
      ? (item.tags.includes('regional') && !item.tags.includes('cpird'))
      : item.tags.includes(f));
    if (!ok) return false;
  }
  // ชิปใช้ค่า «region:north» แต่ข้อมูลการ์ดเก็บเป็น «north»
  if (groups.region.size && !groups.region.has('region:' + item.region)) return false;
  if (groups.extra.size) {
    const ok = [...groups.extra].some(f => f === 'dormitory'
      ? item.tags.includes('dormitory') : item.freeDorm);
    if (!ok) return false;
  }
  return true;
}

function syncFilterUI() {
  filterBtns.forEach(b => {
    const on = groups[groupOf(b.dataset.filter)].has(b.dataset.filter);
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (filterClearBtn) {
    const n = activeCount();
    filterClearBtn.hidden = n === 0;
    filterClearBtn.textContent = n > 1 ? `✕ ล้างตัวกรอง (${n})` : '✕ ล้างตัวกรอง';
  }
  // ปุ่ม «ตัวกรอง» บนมือถือ: แสดงจำนวนที่เลือกอยู่
  const mobCount = document.getElementById('mobileFilterCount');
  if (mobCount) {
    const n = activeCount();
    mobCount.textContent = String(n);
    mobCount.hidden = n === 0;
  }

  // การ์ดสถิติ = ทางลัด: ติดสว่างเมื่อเลือกตัวกรองนั้นอันเดียว
  statCards.forEach(c => {
    const f = c.dataset.stat;
    const on = f !== 'all' && activeCount() === 1 && groups[groupOf(f)].has(f);
    c.classList.toggle('is-active', on);
    c.setAttribute('aria-pressed', String(on));
  });
}

function toggleFilter(f) {
  const grpName = groupOf(f);
  const g = groups[grpName];
  if (grpName === 'region') {
    // เลือกได้ทีละภาค: กดภาคเดิม = ปิด, กดภาคใหม่ = สลับภาค
    const wasSelected = g.has(f);
    g.clear();
    if (!wasSelected) g.add(f);
  } else {
    g.has(f) ? g.delete(f) : g.add(f);
  }
  syncFilterUI();
  runSearch();
}

filterBtns.forEach(b => b.addEventListener('click', () => toggleFilter(b.dataset.filter)));
filterClearBtn?.addEventListener('click', clearAll);
sortSelect?.addEventListener('change', () => {
  sortMode = sortSelect.value;
  runSearch();
});

// ── การ์ดสถิติ 4 อัน = ทางลัดกรอง (ไม่ใช่แค่ตัวเลขโชว์) ─────────
statCards.forEach(card => {
  card.addEventListener('click', () => {
    const f = card.dataset.stat;
    if (f === 'all') {
      clearAll();
      // «แสดงรายชื่อทั้งหมด» = กลับไปดูรายชื่อเต็มที่อยู่ถัดลงไป
      document.getElementById('institutions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // กดอันที่เลือกอยู่ซ้ำ = ยกเลิก (ไม่ค้างกรอง)
    if (card.getAttribute('aria-pressed') === 'true') {
      clearAll();
      return;
    }
    groups.type.clear(); groups.region.clear(); groups.extra.clear();
    groups[groupOf(f)].add(f);
    syncFilterUI();
    runSearch();
    document.getElementById('searchResults')?.setAttribute('aria-live', 'polite');
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

const filterLabel = {
  chula: 'จุฬา (ภาควิชา)', university: 'มหาวิทยาลัย', hospital: 'โรงพยาบาล/ศูนย์',
  cpird: 'ศพช.', 'regional-plain': 'รพ.จังหวัด', private: 'เอกชน',
  'region:bkk': 'กทม.', 'region:central': 'กลาง', 'region:north': 'เหนือ',
  'region:isan': 'อีสาน', 'region:south': 'ใต้', 'region:east': 'ตะวันออก',
  dormitory: 'มีที่พัก', 'dorm-free': 'ที่พักฟรี',
};

function clearAll() {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  groups.type.clear(); groups.region.clear(); groups.extra.clear();
  syncFilterUI();
  runSearch();
}

// ── เก็บเงื่อนไขไว้ใน URL → ส่งลิงก์ให้เพื่อนเปิดแล้วได้ผลเดียวกัน ──
function syncURL() {
  const p = new URLSearchParams(location.search);
  const f = selected();
  f.length ? p.set('f', f.join(',')) : p.delete('f');
  sortMode === 'default' ? p.delete('sort') : p.set('sort', sortMode);
  const q = searchInput.value.trim();
  q ? p.set('q', q) : p.delete('q');
  const qs = p.toString();
  history.replaceState(null, '', (qs ? `${location.pathname}?${qs}` : location.pathname) + location.hash);
}

function runSearch() {
  const results = document.getElementById('searchResults');
  const q = searchInput.value.trim().toLowerCase();

  // การ์ดทุกใบต้องหุบไว้เสมอเมื่อผลลัพธ์เปลี่ยน
  collapseAllCards();

  // ไม่มีคำค้นและไม่มีตัวกรอง → กลับไปแสดงรายชื่อเต็มตามปกติ
  if (q === '' && !anyFilter()) {
    results.classList.remove('active');
    results.innerHTML = '';
    mainList.hidden = false;
    syncURL();
    return;
  }

  const qNorm = normText(q);
  // คำค้นสั้น ๆ (เช่น «มข») ต้องยืนเป็นคำโดด ไม่งั้น «ความขัดแย้ง» จะถูกนับว่ามี «มข»
  const rawHit = text => (q.length >= 4 ? text.includes(q) : hasTerm(text, q));
  // เส้นทางที่ตัดคำเต็ม/คำย่อออก (รพ. → โรงพยาบาล) ใช้เฉพาะเมื่อมีคำถูกตัดจริง
  // ไม่งั้นคำสั้นอย่าง «ENT» จะไปแมตช์กลางคำอื่น (stu**dent**, depart**ment**)
  const punctStripped = q.replace(/[\s.\-–—()«»"'/]/g, '');
  const useNorm = qNorm !== punctStripped && qNorm.length >= 2;

  const matched = cardIndex.filter(item =>
    cardMatches(item) && (q === '' || rawHit(item.searchable) ||
      (useNorm && item.searchableNorm.includes(qNorm))));

  // เรียงผลลัพธ์: ถ้าผู้ใช้เลือกเอง ใช้ที่เลือก · ถ้าไม่ เลือกให้เองตามความเกี่ยวข้อง
  if (sortMode === 'code') {
    matched.sort((x, y) => (x.code || 'zzz').localeCompare(y.code || 'zzz'));
  } else if (sortMode === 'name') {
    const bare = item => item.title.replace(/^\s*\d{3}\s*/, '');
    matched.sort((x, y) => bare(x).localeCompare(bare(y), 'th'));
  } else if (sortMode === 'dorm') {
    matched.sort((x, y) => (y.tags.includes('dormitory') ? 1 : 0) - (x.tags.includes('dormitory') ? 1 : 0));
  } else if (q) {
    // ชื่อการ์ด/แท็กตรงก่อน แล้วค่อยการ์ดที่ตรงแค่ในเนื้อหา (ค้น «จุฬาฯ» ให้ภาควิชาขึ้นก่อน)
    const score = item => (rawHit(item.title) || (qNorm.length >= 2 && item.titleNorm.includes(qNorm)) ? 2 : 1);
    matched.sort((x, y) => score(y) - score(x));
  }

  // One results panel; the section list is hidden while it is showing,
  // so the reader never scrolls past blank section headers.
  mainList.hidden = true;
  results.classList.add('active');
  results.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'results-head';

  const count = document.createElement('p');
  count.className = 'results-count';
  const what = [];
  if (q) what.push(`คำค้น «${searchInput.value.trim()}»`);
  if (groups.type.size) what.push(`ประเภท ${[...groups.type].map(f => filterLabel[f] || f).join(' + ')}`);
  if (groups.region.size) what.push(`ภูมิภาค ${[...groups.region].map(f => filterLabel[f] || f).join(' + ')}`);
  if (groups.extra.size) what.push([...groups.extra].map(f => filterLabel[f] || f).join(' + '));
  const from = what.length ? ` จาก${what.join(' · ')}` : '';
  count.innerHTML = matched.length
    ? `พบ <strong>${matched.length}</strong> รายการ${from}`
    : `ไม่พบรายการ${from}`;
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
    empty.textContent = (q && anyFilter())
      ? 'ไม่พบที่ตรงกับทั้งคำค้นและตัวกรองนี้ ลองตัดตัวกรองบางอันออก หรือใช้คำค้นสั้นลง'
      : anyFilter()
        ? 'ไม่พบที่ตรงกับตัวกรองนี้ ลองลดเงื่อนไขลง หรือกด «ล้างตัวกรอง»'
        : 'ลองใช้คำค้นอื่น เช่น ชื่อโรงพยาบาล ภาควิชา ชื่อผู้ประสานงาน หรือเบอร์โทร';
    results.appendChild(empty);
    syncURL();               // สำคัญ: แม้ผลลัพธ์เป็น 0 ก็ต้องซิงก์ URL ให้ตรงกับที่เห็นบนจอ
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
    const det = clone.querySelector('.card-detail');
    if (det) { det.style.maxHeight = '0'; det.style.opacity = '0'; }
    if (q) highlightCard(clone, q);
    if (q) highlightSynonym(clone, q, qNorm);
    // คำค้นไปตรงกับข้อความที่ซ่อนอยู่ใน «ดูรายละเอียดเพิ่มเติม» →
    // ห้ามกางให้เอง (การ์ดต้องหุบไว้จนผู้ใช้กด) แค่บอกว่าตรงกับส่วนไหน
    const hiddenLabel = hiddenMatchLabel(clone, q);
    const hint = clone.querySelector('.expand-hint');
    if (hint) {
      hint.textContent = hiddenLabel
        ? `▾ ตรงใน «${hiddenLabel}» · กดเพื่อดู`
        : '▾ ดูรายละเอียดเพิ่มเติม';
      hint.classList.toggle('has-match', !!hiddenLabel);
    }
    clone.classList.add('result-clone');
    results.appendChild(clone);
  });
  equalizeCardRows();
  syncURL();
}

// ถ้าคำค้นตรงเพราะเป็น «คำพ้อง» (เช่น พิมพ์ Siriraj แต่การ์ดเขียน ศิริราช)
// ให้ไฮไลต์คำที่ตรงจริงในการ์ดให้เห็น ไม่งั้นจะไม่เห็นว่าตรงตรงไหน
function highlightSynonym(card, q, qNorm) {
  if (card.querySelector('mark.highlight') || qNorm.length < 2) return;
  const group = SYNONYMS.find(g => g.some(t => normText(t) === qNorm));
  if (!group) return;
  const text = card.textContent.toLowerCase();
  const term = group.find(t => t.length >= 3 && text.includes(t.toLowerCase()));
  if (term) highlightCard(card, term.toLowerCase());
}

// Highlight matches by building nodes — never re-parse text as HTML.
function highlightCard(card, q) {
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  const targets = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement && node.parentElement.closest('.expand-hint')) continue;
    const clean = node.textContent.replace(/​/g, '');
    if (node.textContent.toLowerCase().includes(q)) {
      targets.push(node);
    } else if (clean.toLowerCase().includes(q)) {
      // โหนดนี้มี ZWSP คั่นกลางคำ — ไฮไลต์ทั้งโหนด (แทนที่จะหาตำแหน่งเป๊ะ)
      node.__whole = true;
      targets.push(node);
    }
  }
  targets.forEach(node => {
    if (node.__whole) {
      const mark = document.createElement('mark');
      mark.className = 'highlight';
      mark.textContent = node.textContent;
      node.replaceWith(mark);
      return;
    }
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

// ถ้าคำค้นไปตรงกับข้อความที่ซ่อนอยู่ใน «ดูรายละเอียดเพิ่มเติม»
// ระบบต้อง «ไม่กางการ์ดเอง» (การ์ดหุบไว้จนกว่าผู้ใช้จะกดเอง)
// หน้าที่ของฟังก์ชันนี้คือบอกว่าตรงกับ «ส่วนไหน» เพื่อเอาไปแสดงบนแถวล่างของการ์ด
function hiddenMatchLabel(card, q) {
  if (!q) return '';
  const det = card.querySelector('.card-detail');
  if (!det) return '';
  if (!det.textContent.toLowerCase().includes(q)) return '';

  const holders = Array.from(det.querySelectorAll('li, p, h4, .special-box, .detail-group'));
  const hit = holders.find(h => h.textContent.toLowerCase().includes(q));
  const scope = hit ? (hit.closest('.detail-group, .special-box') || det) : det;
  const heading = scope.querySelector('h4') || det.querySelector('h4');
  const label = heading ? heading.textContent : 'รายละเอียดเพิ่มเติม';

  // ตัดอีโมจิ/เครื่องหมายนำหน้าออกให้เหลือแต่ชื่อส่วน เช่น «🏠 รายละเอียดที่พัก» → «รายละเอียดที่พัก»
  return label
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// หุบการ์ดทุกใบ (เว้นใบที่ระบุ) — เรียกทุกครั้งที่ผลค้นหาเปลี่ยน และตอนกด Esc
function collapseAllCards(except) {
  document.querySelectorAll('.card.expanded').forEach(card => {
    if (except && card === except) return;
    if (!card.querySelector('.card-detail')) return;
    setExpanded(card, false);
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
    // เปิดได้ทีละใบ: หุบใบที่เปิดค้างไว้ก่อน (หน้าไม่ยาว และผู้ใช้ไม่หลงว่ากางอะไรไว้)
    collapseAllCards(card);
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

// Esc = หุบการ์ดที่เปิดอยู่ทั้งหมด
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') collapseAllCards();
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

// ── การ์ดในแถวเดียวกันให้สูงเท่ากัน ────────────────────────────
// ใช้ min-height ต่อแถว (แทน align-items: stretch) เพราะ stretch จะถ่าง
// การ์ดใบข้าง ๆ ตามไปด้วยตอนที่อีกใบกางรายละเอียด จนเหลือที่ว่างท้ายการ์ด
const equalizeTargets = () => [
  ...document.querySelectorAll('.cards-grid'),
  ...document.querySelectorAll('.ssc-grid'),
  ...document.querySelectorAll('#searchResults.active'),
];

function equalizeCardRows() {
  equalizeTargets().forEach(grid => {
    if (grid.offsetParent === null) return; // ซ่อนอยู่ วัดตำแหน่งไม่ได้
    const cards = Array.from(grid.children).filter(c =>
      c.classList.contains('card') || c.classList.contains('ssc-card'));
    if (cards.length < 2) return;

    const rows = new Map();
    cards.forEach(card => {
      const top = card.offsetTop;
      let key = null;
      for (const k of rows.keys()) { if (Math.abs(k - top) < 4) { key = k; break; } }
      if (key === null) { rows.set(top, [card]); } else { rows.get(key).push(card); }
    });

    rows.forEach(list => {
      if (list.length < 2) { list.forEach(c => { c.style.minHeight = ''; }); return; }
      // ใบที่กางอยู่สูงไม่ใช่ความสูงจริง — ปล่อยแถวนี้ไว้ตามเดิม
      if (list.some(c => c.classList.contains('expanded'))) return;
      list.forEach(c => { c.style.minHeight = ''; });
      const h = Math.max(...list.map(c => c.getBoundingClientRect().height));
      list.forEach(c => { c.style.minHeight = Math.ceil(h) + 'px'; });
    });
  });
}

let equalizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(equalizeTimer);
  equalizeTimer = setTimeout(equalizeCardRows, 150);
}, { passive: true });
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(equalizeCardRows);
}

equalizeCardRows();

// ── Smooth anchor scrolling / back-to-top ─────────────────────
// ย้ายไป ui.js แล้ว เพื่อให้ทุกหน้าได้พฤติกรรมเดียวกัน

// ── แท็บหมวดสถาบัน (?c=slug) ─────────────────────────────────
// หน้าเดียวมีการ์ด 117 ใบ ถ้าปล่อยยาวจะกลายเป็น long-strip
// แท็บนี้ทำให้ดูทีละหมวดได้ และเก็บสถานะใน URL เพื่อแชร์ลิงก์ได้
const catBar = document.getElementById('catBar');
const catSections = Array.from(document.querySelectorAll('main .inst-section[data-cat]'));

function applyCat(slug) {
  const known = new Set(catSections.map(s => s.dataset.cat));
  const active = known.has(slug) ? slug : 'all';

  catSections.forEach(s => { s.hidden = active !== 'all' && s.dataset.cat !== active; });
  if (catBar) {
    catBar.querySelectorAll('[data-cat-link]').forEach(a => {
      const on = a.dataset.catLink === active;
      a.classList.toggle('active', on);
      a.setAttribute('aria-current', on ? 'true' : 'false');
      a.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  const p = new URLSearchParams(location.search);
  if (active === 'all') p.delete('c'); else p.set('c', active);
  const qs = p.toString();
  history.replaceState(null, '', (qs ? `${location.pathname}?${qs}` : location.pathname) + location.hash);

  equalizeCardRows();
  return active;
}

if (catBar && catSections.length) {
  catBar.addEventListener('click', (e) => {
    const link = e.target.closest('[data-cat-link]');
    if (!link) return;
    e.preventDefault();
    // แตะแท็บที่กำลังเลือกอยู่ซ้ำ = ยกเลิก (กลับไป «ทั้งหมด»)
    const next = link.classList.contains('active') ? 'all' : link.dataset.catLink;
    const active = applyCat(next);
    // ถ้ามีผลค้นหาค้างอยู่ ให้กลับเป็นรายการเต็มก่อน ไม่งั้นจะเห็นแต่ผลค้นหา
    if (searchInput.value.trim() || anyFilter()) clearAll();
    if (active !== 'all') {
      const sec = catSections.find(s => s.dataset.cat === active);
      if (sec) {
        const top = sec.getBoundingClientRect().top + window.scrollY - 150;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  });
}

// ── ตัวกรองแบบ bottom sheet (มือถือ) ───────────────────────────
// ใช้ <dialog> ของเบราว์เซอร์ → backdrop/focus trap/Esc ได้ฟรีแบบ native
const filterSheet = document.getElementById('filterSheet');
const filterSheetBody = document.getElementById('filterSheetBody');
const mobileFilterBtn = document.getElementById('mobileFilterBtn');
const filterSheetClose = document.getElementById('filterSheetClose');
const filterSheetApply = document.getElementById('filterSheetApply');
const filterSheetClear = document.getElementById('filterSheetClear');
const MOBILE_MQ = window.matchMedia('(max-width: 720px)');

const moveFiltersForViewport = () => {
  const panel = document.querySelector('.filter-panel--inline');
  const summary = document.querySelector('.summary-strip');
  if (!filterSheet || !filterSheetBody || !panel || !summary) return;

  if (MOBILE_MQ.matches) {
    if (panel.parentElement !== filterSheetBody) filterSheetBody.append(panel, summary);
  } else {
    if (panel.parentElement === filterSheetBody) {
      const toolbar = document.querySelector('.toolbar');
      toolbar.append(panel, summary);
    }
    if (filterSheet.open) filterSheet.close();
  }
};
moveFiltersForViewport();
MOBILE_MQ.addEventListener('change', moveFiltersForViewport);

mobileFilterBtn?.addEventListener('click', () => {
  if (!filterSheet) return;
  filterSheet.showModal();
  mobileFilterBtn.setAttribute('aria-expanded', 'true');
});
filterSheetClose?.addEventListener('click', () => filterSheet.close());
filterSheetApply?.addEventListener('click', () => filterSheet.close());
filterSheetClear?.addEventListener('click', () => clearAll());
filterSheet?.addEventListener('close', () => mobileFilterBtn?.setAttribute('aria-expanded', 'false'));
// แตะ backdrop = ปิด
filterSheet?.addEventListener('click', (e) => { if (e.target === filterSheet) filterSheet.close(); });

// ── VISUAL SCAN: สีภูมิภาค + ป้าย + กราฟภาพรวม ─────────────────
// สีประจำภาค (ใช้ร่วมกับป้ายภูมิภาคบนการ์ดในหน้า «สถาบัน»)
const REGION_TH = {
  bkk: 'กทม.', central: 'กลาง', north: 'เหนือ',
  isan: 'อีสาน', south: 'ใต้', east: 'ตะวันออก',
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function paintRegionCues() {
  allCards.forEach(card => {
    const region = card.dataset.region;
    if (!region) return;
    card.style.setProperty('--r-color', `var(--r-${region}, var(--border))`);
    card.classList.add('has-region');

    const header = card.querySelector('.card-header');
    if (!header || header.querySelector('.region-chip')) return;
    const chip = document.createElement('span');
    chip.className = 'region-chip';
    chip.style.setProperty('--r-color', `var(--r-${region}, var(--border))`);
    chip.textContent = REGION_TH[region] || region;
    header.appendChild(chip);
  });
}

function buildScanChart() {
  const panel = document.getElementById('scanPanel');
  if (!panel) return;

  const counts = {};
  allCards.forEach(card => {
    const r = card.dataset.region;
    if (r) counts[r] = (counts[r] || 0) + 1;
  });
  const order = ['bkk', 'central', 'north', 'isan', 'south', 'east'].filter(r => counts[r]);
  if (!order.length) return;

  // แถบเดียวเรียงต่อกันตามสัดส่วน + ป้ายสีด้านล่าง (กดเพื่อกรองภาคนั้น)
  const bar = document.createElement('div');
  bar.className = 'scan-mini-bar';
  bar.setAttribute('aria-hidden', 'true');

  const legend = document.createElement('div');
  legend.className = 'scan-mini-legend';

  for (const r of order) {
    const seg = document.createElement('span');
    seg.className = 'scan-mini-seg';
    seg.style.setProperty('--r-color', `var(--r-${r})`);
    seg.style.flexGrow = String(counts[r]);
    bar.appendChild(seg);

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'scan-mini-chip';
    chip.style.setProperty('--r-color', `var(--r-${r})`);
    chip.setAttribute('aria-label', `กรองเฉพาะภาค${REGION_TH[r]} ${counts[r]} แห่ง`);
    chip.title = `กรองเฉพาะภาค${REGION_TH[r]} ${counts[r]} แห่ง`;
    chip.innerHTML = `<span class="dot"></span>${REGION_TH[r]} <b>${counts[r]}</b>`;
    chip.addEventListener('click', () => {
      document.querySelector(`.filter-btn[data-filter="region:${r}"]`)?.click();
      document.getElementById('institutions')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    legend.appendChild(chip);
  }

  panel.replaceChildren(bar, legend);
}

paintRegionCues();
buildScanChart();

// ── เริ่มต้นจาก URL (ลิงก์ที่แชร์กันมาเปิดแล้วได้ตัวกรองเดิม) ───
(function initFromURL() {
  const p = new URLSearchParams(location.search);
  const valid = f => /^(chula|university|hospital|cpird|regional-plain|private|dormitory|dorm-free)$/.test(f) || /^region:(bkk|central|east|north|isan|south)$/.test(f);
  (p.get('f') || '').split(',').filter(valid).forEach(f => {
    const grp = groupOf(f);
    if (grp === 'region') {
      groups.region.clear();
      groups.region.add(f);
    } else {
      groups[grp].add(f);
    }
  });

  const s = p.get('sort');
  if (s && sortSelect && Array.from(sortSelect.options).some(o => o.value === s)) {
    sortMode = s;
    sortSelect.value = s;
  }
  const q = p.get('q');
  if (q) {
    searchInput.value = q;
    searchClear.classList.add('visible');
  }
  syncFilterUI();
  if (q || anyFilter()) runSearch();
})();

// เริ่มจาก ?c= (แท็บหมวดที่แชร์มากัน เช่น institutions.html?c=cpird)
applyCat(new URLSearchParams(location.search).get('c') || 'all');

// ── ทำความสะอาดข้อความหัวการ์ด ────────────────────────────────
// ย้ายไป ui.js แล้ว (ใช้ร่วมทุกหน้า)


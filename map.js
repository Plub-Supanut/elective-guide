/* ─────────────────────────────────────────────────────────────
   แผนที่สถาบัน — วาดจาก map-data.js (เส้นขอบจังหวัด + พิกัดจาก OSM)
   ทำงานเฉพาะเมื่อมี #elective-map อยู่ในหน้า
   ───────────────────────────────────────────────────────────── */
(() => {
  const host = document.getElementById('elective-map');
  const M = window.ELECTIVE_MAP;
  if (!host || !M || !M.pins) return;

  const NS = 'http://www.w3.org/2000/svg';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // สีและชื่อภาค (ใช้ชุดเดียวกับทั้งเว็บ: ครีม/เสจ/เทอร์รา/ดัสก์)
  const REGION = {
    bkk:     { name: 'กรุงเทพฯ',   color: '#c4714b' },
    central: { name: 'ภาคกลาง',    color: '#7d9b76' },
    north:   { name: 'ภาคเหนือ',   color: '#c9849a' },
    isan:    { name: 'ภาคอีสาน',   color: '#b3893f' },
    south:   { name: 'ภาคใต้',     color: '#6f8c9b' },
  };
  const count = r => M.pins.filter(p => p.r === r).length;

  // จุดอ้างอิง: คณะแพทยศาสตร์ จุฬาฯ (ใช้ลากเส้นจากบ้านไปที่หมาย)
  const LON0 = 97.343, LAT0 = 20.464, COS = Math.cos(13 * Math.PI / 180);
  const proj = (lon, lat) => [(lon - LON0) * COS * 100, (LAT0 - lat) * 100];
  const [HOME_X, HOME_Y] = proj(100.5346, 13.7383);

  // ── โครง SVG ─────────────────────────────────────────────────
  host.replaceChildren();                 // ลบข้อความสำรอง (กรณีเปิด JS ไม่ได้)

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', M.viewBox);
  svg.setAttribute('class', 'map-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `แผนที่ประเทศไทยแสดงที่ตั้งสถาบัน ${M.pins.length} แห่ง`);

  const gLand  = document.createElementNS(NS, 'g');
  gLand.setAttribute('class', 'map-land');
  const landPath = document.createElementNS(NS, 'path');
  landPath.setAttribute('d', M.paths);
  gLand.appendChild(landPath);

  const gArcs = document.createElementNS(NS, 'g');
  gArcs.setAttribute('class', 'map-arcs');
  const gPins = document.createElementNS(NS, 'g');
  gPins.setAttribute('class', 'map-pins');

  svg.append(gLand, gArcs, gPins);
  host.appendChild(svg);

  const tip = document.createElement('div');
  tip.className = 'map-tip';
  tip.hidden = true;                     // ซ่อนไว้ก่อน ไม่งั้นเป็นกล่องดำเปล่า ๆ ค้างบนแผนที่
  tip.setAttribute('role', 'status');
  host.appendChild(tip);

  // ── หมุด ─────────────────────────────────────────────────────
  const pins = [];
  M.pins.forEach((p, i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'map-pin');
    g.dataset.region = p.r;
    g.dataset.index = i;
    g.style.setProperty('--i', i);

    // พื้นที่กด: กว้างขึ้นบนจอแคบ (แผนที่ถูกย่อ หมุดจึงเล็ก กดยาก)
    const narrow = window.matchMedia('(max-width: 900px)').matches;
    const hit = document.createElementNS(NS, 'circle');
    hit.setAttribute('cx', p.x); hit.setAttribute('cy', p.y);
    hit.setAttribute('r', narrow ? 20 : 10);
    hit.setAttribute('class', 'pin-hit');

    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('r', 4.0);
    dot.setAttribute('class', p.a ? 'pin-dot' : 'pin-dot is-approx');
    if (p.a) {
      dot.setAttribute('fill', REGION[p.r] ? REGION[p.r].color : '#6b6157');
    } else {
      // พิกัดไม่ตรง — แสดงเป็นวงกลมกลวง และบอกในป้ายว่าเป็นตำแหน่งโดยประมาณ
      dot.setAttribute('fill', 'none');
      dot.setAttribute('stroke', REGION[p.r] ? REGION[p.r].color : '#6b6157');
      dot.setAttribute('stroke-width', '1.6');
    }

    g.append(hit, dot);
    gPins.appendChild(g);
    pins.push({ g, dot, p });
  });

  // ── ป้ายบอกข้อมูลเมื่อชี้หมุด ──────────────────────────────────
  const vb = M.viewBox.split(' ').map(Number);       // [x y w h]
  const badgeOf = p => {
    const out = [];
    if (p.t.includes('cpird')) out.push('ศพช.');
    if (p.t.includes('chula')) out.push('จุฬาฯ');
    if (p.t.includes('university')) out.push('มหาวิทยาลัย');
    if (p.t.includes('hospital')) out.push('รพ./ศูนย์');
    if (p.d) out.push('มีที่พัก');
    if (p.f) out.push('ที่พักฟรี');
    return out;
  };

  const showTip = (p, el) => {
    const rg = REGION[p.r] ? REGION[p.r].name : '';
    const badges = badgeOf(p).map(b => `<span>${b}</span>`).join('');
    const note = p.a ? '' : '<em class="approx">ตำแหน่งโดยประมาณ (ไม่พบพิกัดตรงจาก OSM)</em>';
    tip.innerHTML = `<strong>${p.n}</strong><em>${rg}</em>${note}<div class="map-tip-badges">${badges}</div>`;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const box = host.getBoundingClientRect();
    const x = r.left + r.width / 2 - box.left;
    const y = r.top - box.top;
    tip.style.left = `${Math.max(8, Math.min(box.width - 8, x))}px`;
    tip.style.top = `${Math.max(4, y)}px`;
    // ป้ายจะถูกจัดให้อยู่เหนือหมุด; ถ้าติดขอบบนให้พลิกลงล่าง
    tip.classList.toggle('below', y < 90);
  };
  const hideTip = () => { tip.hidden = true; };

  // ── เส้นทางจากจุฬาฯ ไปยังหมุดที่ชี้ ────────────────────────────
  const drawArc = (p) => {
    gArcs.replaceChildren();
    const mx = (HOME_X + p.x) / 2, my = (HOME_Y + p.y) / 2;
    const dx = p.x - HOME_X, dy = p.y - HOME_Y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx - dy / len * len * 0.22, cy = my + dx / len * len * 0.22;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `M${HOME_X.toFixed(1)},${HOME_Y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    path.setAttribute('class', 'map-arc');
    gArcs.appendChild(path);
    if (!reduced) {
      const L = path.getTotalLength();
      path.style.strokeDasharray = L;
      path.style.strokeDashoffset = L;
      path.getBoundingClientRect();                 // บังคับ reflow ให้ transition ทำงาน
      path.style.transition = 'stroke-dashoffset 520ms cubic-bezier(.4,0,.2,1)';
      path.style.strokeDashoffset = 0;
    }
    const home = document.createElementNS(NS, 'circle');
    home.setAttribute('cx', HOME_X.toFixed(1)); home.setAttribute('cy', HOME_Y.toFixed(1));
    home.setAttribute('r', 5); home.setAttribute('class', 'map-home');
    gArcs.appendChild(home);
  };
  const clearArc = () => gArcs.replaceChildren();

  // ── ผูกเหตุการณ์ ─────────────────────────────────────────────
  pins.forEach(({ g, p }) => {
    g.addEventListener('pointerenter', () => {
      g.classList.add('on');
      host.classList.add('touching');
      showTip(p, g);
      drawArc(p);
    });
    g.addEventListener('pointerleave', () => {
      g.classList.remove('on');
      host.classList.remove('touching');
      hideTip();
      clearArc();
    });
    g.addEventListener('click', () => {
      const card = [...document.querySelectorAll('.card')].find(c => {
        const t = c.querySelector('.card-title');
        return t && t.textContent.trim() === p.n;
      });
      if (!card) return;
      card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      card.classList.remove('map-flash');
      void card.offsetWidth;
      card.classList.add('map-flash');
      setTimeout(() => card.classList.remove('map-flash'), 2200);
      hideTip();
    });
  });

  // ── คำอธิบาย (legend) ────────────────────────────────────────
  const legend = document.querySelector('#map-legend');
  if (legend) {
    Object.entries(REGION).forEach(([key, meta]) => {
      const li = document.createElement('li');
      li.className = 'map-legend-row';
      li.dataset.region = key;
      li.innerHTML = `<span class="legend-dot" style="background:${meta.color}"></span>${meta.name}`
        + `<span class="legend-count">${count(key)}</span>`;
      legend.appendChild(li);
    });
  }
  // ── ระยะทางจากคณะฯ (คิดจากพิกัดจริง) ─────────────────────────
  const home = proj(100.5346, 13.7383);
  const toXY = (lon, lat) => proj(lon, lat);
  const kmOf = (p) => {
    // แปลงกลับจากหน่วยแผนที่ → องศา → ระยะจริง (haversine ย่อ)
    const lat = LAT0 - p.y / 100, lon = p.x / (100 * COS) + LON0;
    const dLat = (lat - 13.7383) * 111.32;
    const dLon = (lon - 100.5346) * 111.32 * Math.cos(13.7383 * Math.PI / 180);
    return Math.hypot(dLat, dLon);
  };
  const nearBox = document.querySelector('#map-near');
  if (nearBox) {
    const away = M.pins
      .filter(p => p.t.includes('chula') === false)          // ไม่นับภาควิชาในคณะฯ (อยู่ที่เดียวกัน)
      .map(p => ({ p, km: kmOf(p) }))
      .filter(o => o.km > 1)
      .sort((a, b) => a.km - b.km);
    const row = (o, tag) => `<li class="map-near-row" data-name="${o.p.n.replace(/"/g, '&quot;')}">`
      + `<span class="map-near-tag">${tag}</span><span class="map-near-name">${o.p.n}</span>`
      + `<span class="map-near-km">${Math.round(o.km)} กม.</span></li>`;
    nearBox.innerHTML = `<h3 class="map-near-title">ระยะทางจากคณะฯ</h3><ul class="map-near-list">`
      + away.slice(0, 2).map(o => row(o, 'ใกล้สุด')).join('')
      + away.slice(-3).reverse().map(o => row(o, 'ไกลสุด')).join('')
      + '</ul><p class="map-near-note">ระยะเส้นตรงจากคณะแพทยศาสตร์ จุฬาฯ</p>';
    nearBox.querySelectorAll('.map-near-row').forEach(li => {
      li.addEventListener('click', () => {
        const card = [...document.querySelectorAll('.card')].find(c => {
          const t = c.querySelector('.card-title');
          return t && t.textContent.trim() === li.dataset.name;
        });
        if (!card) return;
        card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
        card.classList.remove('map-flash');
        void card.offsetWidth;
        card.classList.add('map-flash');
        setTimeout(() => card.classList.remove('map-flash'), 2200);
      });
    });
  }

  const facts = document.querySelector('#map-facts');
  if (facts) {
    const dorm = M.pins.filter(p => p.d).length;
    const free = M.pins.filter(p => p.f).length;
    facts.innerHTML = [
      `${M.pins.length} สถาบัน`,
      `${Object.keys(REGION).length} ภาค`,
      `มีที่พัก ${dorm}`,
      `ที่พักฟรี ${free}`,
    ].map(t => `<span class="map-fact">${t}</span>`).join('');
  }

  host.querySelectorAll('.map-legend-row').forEach(row => {
    const r = row.dataset.region;
    row.addEventListener('pointerenter', () => { svg.classList.add('focus-' + r); gArcs.replaceChildren(); });
    row.addEventListener('pointerleave', () => svg.classList.remove('focus-' + r));
    row.addEventListener('click', () => {
      const chip = document.querySelector(`.filter-btn[data-filter="region:${r}"]`);
      if (chip) { chip.click(); document.getElementById('institutions')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
    });
  });

  // ── เปิดตัวเมื่อเลื่อนมาถึง ───────────────────────────────────
  const paper = host.closest('.map-paper') || host;
  if (reduced) {
    paper.classList.add('in');
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) { paper.classList.add('in'); io.disconnect(); } });
    }, { threshold: 0.16 });
    io.observe(paper);
  } else {
    paper.classList.add('in');
  }
})();

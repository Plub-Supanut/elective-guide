/* ─────────────────────────────────────────────────────────────
   แผนที่สถาบัน (ฉบับ interactive)
   - ซูม/แพนได้อิสระ (ล้อเมาส์ · ลาก · หยิก · ดับเบิลคลิก · ปุ่ม · คีย์บอร์ด)
   - ชี้จุด → การ์ดย่อข้างแผนที่ (ไม่ลอยทับแผนที่) · คลิก → ซูมเข้าหาจุด + การ์ดเต็ม
   - คลิกแล้วไม่เลื่อนหน้าเว็บ · มีปุ่ม «ไปที่การ์ดเต็มในรายการ» ให้กดเอง
   - ภาควิชาจุฬาฯ 25 แห่งรวมเป็นจุดเดียว กดแล้วเปิดแผนผังอาคาร (ข้อมูลจากแบบฟอร์มต้นฉบับ)
   - โหมด 3D (WebGL) ใช้การ์ดเดียวกัน
   ───────────────────────────────────────────────────────────── */
(() => {
  const host = document.getElementById('elective-map');
  const paper = document.querySelector('.map-paper');
  const M = window.ELECTIVE_MAP;
  if (!host || !M || !M.pins) return;

  const NS = 'http://www.w3.org/2000/svg';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;   // จอสัมผัสไม่มี hover → ห้ามค้างสถานะ "เพ่งดู"

  // ── สี/ชื่อภาค (ชุดเดียวกับทั้งเว็บ) ──────────────────────────
  const REGION = {
    bkk:     { name: 'กรุงเทพฯ',  color: '#c4714b' },
    central: { name: 'ภาคกลาง',   color: '#7d9b76' },
    north:   { name: 'ภาคเหนือ',  color: '#c9849a' },
    isan:    { name: 'ภาคอีสาน',  color: '#b3893f' },
    south:   { name: 'ภาคใต้',    color: '#6f8c9b' },
  };
  const colorOf = r => (REGION[r] ? REGION[r].color : '#6b6157');
  const count = r => M.pins.filter(p => p.r === r).length;

  // สีภาคแบบ "ทึบ" ที่ผสมกับสีกระดาษไว้ล่วงหน้า
  // เหตุผล: ถ้าใช้ fill-opacity ต่ำ ๆ แล้วตีเส้นขอบจังหวัด สีจะซ้อนกันจนเป็น «เส้นเข้ม» เต็มไปหมด
  // วิธีนี้ทำให้พื้นที่ภาคเป็นสีทึบเรียบเนียน ไม่มีรอยต่อจังหวัดให้ตาลาย
  const PAPER_RGB = [243, 235, 223];
  const mixHex = (hex, t) => '#' + [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16))
    .map((v, i) => Math.round(v * t + PAPER_RGB[i] * (1 - t)).toString(16).padStart(2, '0'))
    .join('');

  // ── ระยะทาง "ขับรถ" จากคณะฯ ───────────────────────────────────
  // สร้างล่วงหน้าด้วย tools/build-drive-distances.mjs (Google Distance Matrix ถ้ามีคีย์ · ไม่มีก็ใช้ OSRM)
  // เก็บเป็น map-drive.js → เว็บไม่ต้องเรียก API ตอนผู้ใช้เปิด
  const DRIVE = (window.ELECTIVE_DRIVE && window.ELECTIVE_DRIVE.byName) || null;
  const driveOf = (p) => (DRIVE ? DRIVE[p.n] || null : null);
  const driveProv = () => (window.ELECTIVE_DRIVE || {}).provider === 'google' ? 'Google Maps' : 'OpenStreetMap (OSRM)';

  // ── จุดอ้างอิงคณะแพทยศาสตร์ จุฬาฯ + วิธีคิดระยะทาง ────────────
  const LON0 = 97.343, LAT0 = 20.464, COS = Math.cos(13 * Math.PI / 180);
  const proj = (lon, lat) => [(lon - LON0) * COS * 100, (LAT0 - lat) * 100];
  const [HOME_X, HOME_Y] = proj(100.5346, 13.7383);
  const kmOf = (p) => {
    const lat = LAT0 - p.y / 100, lon = p.x / (100 * COS) + LON0;
    const dLat = (lat - 13.7383) * 111.32;
    const dLon = (lon - 100.5346) * 111.32 * Math.cos(13.7383 * Math.PI / 180);
    return Math.hypot(dLat, dLon);
  };
  const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

  // ── ป้ายกำกับบนการ์ด ──────────────────────────────────────────
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

  // ── หาการ์ดในรายการ + กระโดดไป (เฉพาะเมื่อกดปุ่ม) ─────────────
  const findCard = (name) => [...document.querySelectorAll('.card')].find(c => {
    const t = c.querySelector('.card-title');
    return t && t.textContent.trim() === name;
  });
  const jumpToCard = (name) => {
    const el = findCard(name);
    if (!el) return;
    const hidden = el.offsetParent === null;
    if (hidden) document.getElementById('filterClear')?.click();
    const flash = () => {
      el.classList.remove('map-flash');
      void el.offsetWidth;
      el.classList.add('map-flash');
      setTimeout(() => el.classList.remove('map-flash'), 2600);
    };
    const go = () => {
      const dist = Math.abs(el.getBoundingClientRect().top - window.innerHeight / 2);
      const instant = reduced || dist > window.innerHeight * 1.6;
      el.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'center' });
      if (instant) { flash(); return; }
      let done = false;
      const fin = () => { if (done) return; done = true; window.removeEventListener('scrollend', fin); flash(); };
      window.addEventListener('scrollend', fin, { once: true });
      setTimeout(fin, 4000);
    };
    if (hidden) requestAnimationFrame(() => requestAnimationFrame(go));
    else go();
  };

  // ══ โครง SVG ══════════════════════════════════════════════════
  host.replaceChildren();
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', M.viewBox);
  svg.setAttribute('class', 'map-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `แผนที่ประเทศไทยแสดงที่ตั้งสถาบัน ${M.pins.length} แห่ง`);

  const gLand = document.createElementNS(NS, 'g'); gLand.setAttribute('class', 'map-land');
  const landPath = document.createElementNS(NS, 'path');
  landPath.setAttribute('d', M.paths);
  gLand.appendChild(landPath);
  const gArcs = document.createElementNS(NS, 'g'); gArcs.setAttribute('class', 'map-arcs');
  const gPins = document.createElementNS(NS, 'g'); gPins.setAttribute('class', 'map-pins');
  const gChula = document.createElementNS(NS, 'g'); gChula.setAttribute('class', 'map-chula');
  const gZoom = document.createElementNS(NS, 'g'); gZoom.setAttribute('class', 'map-zoom');
  gZoom.append(gLand, gArcs, gPins, gChula);
  svg.appendChild(gZoom);
  host.appendChild(svg);

  // ตัดสีภาคให้พอดีกับเส้นขอบประเทศ (สีไม่ล้นออกนอกแผ่นดิน)
  const defs = document.createElementNS(NS, 'defs');
  const clip = document.createElementNS(NS, 'clipPath');
  clip.setAttribute('id', 'eg-land-clip');
  clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const clipShape = document.createElementNS(NS, 'path');
  clipShape.setAttribute('d', M.paths);
  clip.appendChild(clipShape);
  defs.appendChild(clip);
  svg.insertBefore(defs, svg.firstChild);

  // ══ หมุด ══════════════════════════════════════════════════════
  const chulaPins = M.pins.filter(p => p.t.includes('chula'));
  const normalPins = M.pins.filter(p => !p.t.includes('chula'));
  const dots = [];
  const PIN_R = 4.4, HALO_R = 9.6, HIT_R = 14;

  // กลุ่มหมุดรายภาค — ยก/จางพร้อมแผ่นภาคเสมอ (จุดหมุดเป็น entity เดียวกับภาค)
  const pinGroups = {};
  const pinGroupFor = (r) => {
    if (!pinGroups[r]) {
      const pg = document.createElementNS(NS, 'g');
      pg.setAttribute('class', 'pin-group');
      pg.dataset.region = r;
      gPins.appendChild(pg);
      pinGroups[r] = pg;
    }
    return pinGroups[r];
  };

  const addDot = (p, opts = {}) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'map-pin');
    g.dataset.region = p.r;
    g.style.setProperty('--i', dots.length);
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('cx', p.x); halo.setAttribute('cy', p.y);
    halo.setAttribute('r', opts.haloR || HALO_R);
    halo.setAttribute('class', 'pin-halo');
    halo.setAttribute('fill', colorOf(p.r));
    const hit = document.createElementNS(NS, 'circle');
    hit.setAttribute('cx', p.x); hit.setAttribute('cy', p.y);
    hit.setAttribute('r', opts.hitR || HIT_R);
    hit.setAttribute('class', 'pin-hit');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    dot.setAttribute('r', opts.r || PIN_R);
    dot.setAttribute('class', p.a ? 'pin-dot' : 'pin-dot is-approx');
    if (p.a) dot.setAttribute('fill', colorOf(p.r));
    else { dot.setAttribute('fill', 'none'); dot.setAttribute('stroke', colorOf(p.r)); dot.setAttribute('stroke-width', '2'); }
    g.append(halo, hit, dot);
    (opts.group || pinGroupFor(p.r)).appendChild(g);
    const rec = { g, dot, halo, hit, p, cluster: !!opts.cluster, baseR: opts.r || PIN_R, baseHit: opts.hitR || HIT_R, baseHalo: opts.haloR || HALO_R };
    dots.push(rec);
    return rec;
  };

  normalPins.forEach(p => addDot(p));

  const chulaPoint = { x: HOME_X, y: HOME_Y, r: 'bkk', n: 'คณะแพทยศาสตร์ จุฬาฯ', t: 'chula hospital', a: 1, d: false, f: false };
  const chulaRec = chulaPins.length ? addDot(chulaPoint, { r: 7.6, hitR: 18, haloR: 13, group: pinGroupFor('bkk'), cluster: true }) : null;
  if (chulaRec) {
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', HOME_X); ring.setAttribute('cy', HOME_Y);
    ring.setAttribute('r', 14); ring.setAttribute('class', 'chula-ring');
    pinGroups.bkk.insertBefore(ring, chulaRec.g);
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', HOME_X + 18); label.setAttribute('y', HOME_Y - 12);
    label.setAttribute('class', 'chula-label');
    label.textContent = `รพ.จุฬาฯ · ${chulaPins.length} ภาควิชา`;
    pinGroups.bkk.appendChild(label);
  }
  if (pinGroups.bkk) gPins.appendChild(pinGroups.bkk);   // กทม. หนาแน่นสุด → วาดบนสุด (จุดจุฬาฯ ต้องกดได้)
  const cardEl = document.getElementById('map-card');
  let selected = null;

  const paintCard = (html) => {
    if (!cardEl) return;
    cardEl.hidden = false;
    cardEl.innerHTML = html;
    cardEl.querySelector('.map-card-close')?.addEventListener('click', () => closeCard());
  };
  let nearList = [];                       // สถาบันที่อยู่ตำแหน่งเดียวกันกับที่เพิ่งคลิก (ตัวที่เลือกอยู่อันดับแรก)
  const nearHtml = () => !nearList.length ? '' : `<div class="map-card-near"><p>ตำแหน่งเดียวกัน (${nearList.length})</p>${nearList
    .map((q, i) => `<button type="button" class="map-near-pick${q === selected ? ' is-current' : ''}" data-near="${i}">${q.n}</button>`)
    .join('')}</div>`;
  const wireNear = () => {
    cardEl.querySelectorAll('.map-near-pick').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = nearList[+btn.dataset.near];
        const found = q && dots.find(d => d.p === q);
        if (found) openPin(found, nearList.slice());
      });
    });
  };

  const showCard = (p, mode) => {
    if (!cardEl) return;
    const rg = REGION[p.r] ? REGION[p.r].name : '';
    const dv = driveOf(p);
    paintCard(`
      <button type="button" class="map-card-close" aria-label="ปิด">✕</button>
      <p class="map-card-eyebrow">${rg}</p>
      <h3 class="map-card-name">${p.n}</h3>
      <div class="map-card-badges">${badgeOf(p).map(b => `<span>${b}</span>`).join('')}</div>
      <dl class="map-card-facts">
        ${dv ? `<div class="is-drive"><dt>ขับรถจากคณะฯ</dt><dd>${dv.km} กม. · ≈${dv.min} นาที</dd></div>` : ''}
        <div><dt>${dv ? 'เส้นตรง' : 'ระยะจากคณะฯ'}</dt><dd>${Math.round(kmOf(p))} กม.${dv ? '' : ' (เส้นตรง)'}</dd></div>
        ${p.a ? '' : '<div><dt>พิกัด</dt><dd>ตำแหน่งโดยประมาณ</dd></div>'}
      </dl>
      ${dv ? '<p class="map-card-traffic">เวลาเป็นค่าประมาณ ขึ้นกับช่วงเวลาและการจราจร</p>' : ''}
      ${mode === 'full'
        ? '<button type="button" class="map-card-go">ไปที่การ์ดเต็มในรายการ ↓</button>'
        : ''}
      ${(p.__near && p.__near.length) ? nearHtml() : ''}`);
    cardEl.querySelector('.map-card-go')?.addEventListener('click', () => jumpToCard(p.n));
    wireNear();
  };
  const closeCard = () => {
    selected = null;
    dots.forEach(d => d.g.classList.remove('on'));
    if (cardEl) { cardEl.hidden = true; cardEl.innerHTML = ''; }
  };

  // ══ แผนผังอาคารคณะแพทยศาสตร์ จุฬาฯ (isometric) ════════════════
  const campusData = M.chula;
  const iso = (x, y, z) => [ (x - y) * 0.866, (x + y) * 0.5 - z ];
  const campusSvg = () => {
    if (!campusData) return '';
    const B = campusData.buildings;
    const pts = [];
    B.forEach(b => [[b.x, b.y], [b.x + b.w, b.y + b.d]].forEach(([x, y]) => pts.push(iso(x, y, 0))));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs) - 150, maxX = Math.max(...xs) + 150;   // เผื่อที่ให้ป้ายชื่ออาคาร
    const minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 80;
    const W = maxX - minX, H = maxY - minY;
    const ox = -minX, oy = -minY;
    const byId = Object.fromEntries(B.map(b => [b.id, b]));
    const P = (p) => `${(p[0] + ox).toFixed(1)},${(p[1] + oy).toFixed(1)}`;

    const faces = B.map(b => {
      const z1 = b.h;
      const a = iso(b.x, b.y, z1), bb = iso(b.x + b.w, b.y, z1),
            c = iso(b.x + b.w, b.y + b.d, z1), d = iso(b.x, b.y + b.d, z1),
            c0 = iso(b.x + b.w, b.y + b.d, 0), d0 = iso(b.x, b.y + b.d, 0), b0 = iso(b.x + b.w, b.y, 0);
      return `<g class="campus-bld" data-b="${b.id}">
        <polygon class="campus-face side" points="${P(c)} ${P(d)} ${P(d0)} ${P(c0)}"/>
        <polygon class="campus-face side2" points="${P(bb)} ${P(c)} ${P(c0)} ${P(b0)}"/>
        <polygon class="campus-face top" points="${P(a)} ${P(bb)} ${P(c)} ${P(d)}"/>
      </g>`;
    }).join('');

    const dotsSvg = (campusData.depts || []).map((d) => {
      const b = byId[d.b];
      if (!b) return '';
      const same = campusData.depts.filter(x => x.b === d.b);
      const idx = same.findIndex(x => x.n === d.n);
      const fx = b.x + b.w * (0.18 + 0.64 * ((idx + 0.5) / same.length));
      const fy = b.y + b.d * 0.5;
      const [px, py] = iso(fx, fy, b.h);
      const pin = M.pins.find(p => p.n === d.n) || { a: 1, r: 'bkk' };
      return `<g class="campus-dept" data-name="${d.n}" tabindex="0" role="button"
                 aria-label="${d.n}${d.f ? ' ชั้น ' + d.f : ''}">
        <circle cx="${(px + ox).toFixed(1)}" cy="${(py + oy).toFixed(1)}" r="8" class="campus-hit"/>
        <circle cx="${(px + ox).toFixed(1)}" cy="${(py + oy).toFixed(1)}" r="3.6" fill="${colorOf(pin.r)}" class="campus-dot"/>
      </g>`;
    }).join('');

    const labels = B.map(b => {
      const [lx, ly] = iso(b.x + b.w * 0.5, b.y + b.d + 22, 0);
      const c = campusData.depts.filter(d => d.b === b.id);
      return `<text class="campus-label" x="${(lx + ox).toFixed(1)}" y="${(ly + oy).toFixed(1)}">${b.short}${c.length ? ' · ' + c.length + ' ภาควิชา' : ''}</text>`;
    }).join('');

    const unplaced = (campusData.unplaced || []).filter(n => M.pins.some(p => p.n === n)).map(n => `<button type="button" class="campus-chip" data-name="${n}">${n.replace('ภาควิชา', '')}</button>`).join('');

    return `<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" class="map-campus" role="img"
                 aria-label="แผนผังอาคารคณะแพทยศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย">
        ${faces}${labels}${dotsSvg}
      </svg>
      ${unplaced ? `<p class="campus-sub">ไม่ระบุอาคารในแบบฟอร์ม</p><div class="campus-chips">${unplaced}</div>` : ''}
`;
  };

  const openCampus = (near) => {
    if (near && near.length) nearList = near;       // เคสคลิกชนจุดจุฬาฯ: ให้เลือกสถาบันที่ตั้งตรงนั้นได้
    selected = 'chula';
    dots.forEach(d => d.g.classList.toggle('on', d.cluster));
    paintCard(`
      <button type="button" class="map-card-close" aria-label="ปิด">✕</button>
      <p class="map-card-eyebrow">กรุงเทพฯ · อาคารในคณะแพทยศาสตร์</p>
      <h3 class="map-card-name">คณะแพทยศาสตร์ จุฬาฯ</h3>
      <div class="map-card-badges"><span>${chulaPins.length} ภาควิชา/หน่วยงาน</span><span>แผนผังอาคาร</span></div>
      ${campusSvg()}
      ${nearHtml()}`);
    cardEl.querySelectorAll('.campus-dept').forEach(gEl => {
      const pin2 = M.pins.find(p => p.n === gEl.dataset.name) || { n: gEl.dataset.name, r: 'bkk', t: 'chula', a: 1 };
      const act = () => showCard(pin2, 'full');
      gEl.addEventListener('pointerenter', () => gEl.classList.add('on'));
      gEl.addEventListener('pointerleave', () => gEl.classList.remove('on'));
      gEl.addEventListener('click', act);
      gEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    });
    cardEl.querySelectorAll('.campus-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const pin2 = M.pins.find(p => p.n === chip.dataset.name);
        if (pin2) showCard(pin2, 'full');
      });
    });
      wireNear();
  };

  // ══ แผ่นภาค — ยกพร้อมหมุดและป้ายชื่อของภาคนั้น (entity เดียว) ══════
  const gPlates = document.createElementNS(NS, 'g');
  gPlates.setAttribute('class', 'map-plates');
  gPlates.setAttribute('clip-path', 'url(#eg-land-clip)');   // สีภาคไม่ล้นออกนอกเส้นขอบประเทศ
  // ป้ายชื่อภาคอยู่นอกกลุ่มที่ถูก clip — ไม่งั้นป้ายของภาคที่แผ่นดินแคบ (ภาคใต้) จะโดนตัดครึ่ง
  const gLabels = document.createElementNS(NS, 'g');
  gLabels.setAttribute('class', 'map-labels');
  gLand.after(gPlates);                        // ทับเส้นขอบจังหวัด แต่ใต้หมุด
  gPlates.after(gLabels);                      // ต้องแทรก «หลัง» ที่ gPlates อยู่ในต้นไม้แล้ว

  const LABEL_NUDGE = { bkk: [142, 106], central: [-46, 54], isan: [0, 0], north: [0, 0], south: [0, 0] };
  const plates = {};
  Object.entries(M.regionPaths || {}).forEach(([r, d]) => {
    if (!d || !REGION[r]) return;
    const list = M.pins.filter(p => p.r === r);
    if (!list.length) return;
    const lab = (M.regionLabels && M.regionLabels[r]) || [0, 0];
    const nudge = LABEL_NUDGE[r] || [0, 0];

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'plate');
    g.dataset.region = r;
    g.style.setProperty('--rc', REGION[r].color);
    g.style.setProperty('--rc-soft', mixHex(REGION[r].color, 0.34));
    g.style.setProperty('--rc-lift', mixHex(REGION[r].color, 0.58));

    const face = document.createElementNS(NS, 'path');
    face.setAttribute('d', d);
    face.setAttribute('class', 'plate-face');
    const hit = document.createElementNS(NS, 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('class', 'plate-hit');
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', `ภาค${REGION[r].name} — ${list.length} สถาบัน`);

    const wrap = document.createElementNS(NS, 'g');
    wrap.setAttribute('class', 'plate-label-wrap');
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('class', 'plate-label');
    label.setAttribute('x', (lab[0] + nudge[0]).toFixed(1));
    label.setAttribute('y', (lab[1] + nudge[1]).toFixed(1));
    label.textContent = `${REGION[r].name} · ${list.length}`;
    wrap.appendChild(label);

    const labG = document.createElementNS(NS, 'g');
    labG.setAttribute('class', 'plate-labels');
    labG.dataset.region = r;
    labG.appendChild(wrap);
    gLabels.appendChild(labG);

    g.append(face, hit);
    gPlates.appendChild(g);

    // จุดหมุนร่วม: จุดกลางของแผ่น → แผ่นกับหมุดของภาคนี้ยกพร้อมกันเป๊ะ
    const bb = face.getBBox();
    const ox = (bb.x + bb.width / 2).toFixed(1), oy = (bb.y + bb.height / 2).toFixed(1);
    g.style.transformOrigin = `${ox}px ${oy}px`;
    const pg = pinGroupFor(r);
    pg.style.transformOrigin = `${ox}px ${oy}px`;
    plates[r] = { g, pinG: pg, wrap, label, labG, labX: lab[0] + nudge[0], labY: lab[1] + nudge[1] };
  });

  // แผ่นรองป้ายชื่อ — สร้างหลังวัดข้อความจริงได้
  Object.values(plates).forEach(({ wrap, label }) => {
    try {
      const tb = label.getBBox();
      const rect = document.createElementNS(NS, 'rect');
      const padX = 7.5, padY = 4.5;
      rect.setAttribute('x', (tb.x - padX).toFixed(1));
      rect.setAttribute('y', (tb.y - padY).toFixed(1));
      rect.setAttribute('width', (tb.width + padX * 2).toFixed(1));
      rect.setAttribute('height', (tb.height + padY * 2).toFixed(1));
      rect.setAttribute('rx', '6');
      rect.setAttribute('class', 'plate-label-bg');
      wrap.insertBefore(rect, label);
    } catch (_) {}
  });

  // ══ กระจุกหมุด: พื้นที่ที่หมุดแน่น (กทม.) รวมเป็นจุดเดียวพร้อมตัวเลข ══
  // ปัญหาเดิม: 50 จุดใน กทม. ซ้อนทับกันจนอ่านไม่ออก · ใหม่: ปุ่มตัวเลข → กดแล้วซูมเข้าไปจนแยกออก
  const HUB_R = 15;
  const HUB_PX = 13;        // รัศมีจริงบนจอ (px) — คงที่ไม่ว่าจะจอใหญ่หรือเล็ก
  const HUB_HIT_PX = 22;    // เป้าสัมผัสขั้นต่ำ = 44px เส้นผ่านศูนย์กลาง
  const gHubs = document.createElementNS(NS, 'g');
  gHubs.setAttribute('class', 'map-hubs');
  gPins.after(gHubs);
  const hubList = [];
  {
    // จับกลุ่มแบบ "เพื่อนบ้านใกล้กัน" (ไม่ใช่ตาราง) — กทม. ที่หมุดกระจุกจึงรวมเป็นก้อนเดียวจริง
    const R = 11, MIN = 5;
    const pool = dots.filter(rec => !rec.cluster);
    const used = new Set();
    pool.forEach((seed) => {
      if (used.has(seed)) return;
      const list = pool.filter(r => !used.has(r) && Math.hypot(r.p.x - seed.p.x, r.p.y - seed.p.y) <= R);
      if (list.length < MIN) return;
      list.forEach(r => used.add(r));
      const cx = list.reduce((s, r) => s + r.p.x, 0) / list.length;
      const cy = list.reduce((s, r) => s + r.p.y, 0) / list.length;
      const rad = 11 + Math.min(9, list.length * 0.5);     // ยิ่งมาก ยิ่งวงใหญ่
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'pin-hub');
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');
      g.dataset.region = list[0].p.r;
      g.style.setProperty('--rc', colorOf(list[0].p.r));
      g.style.transformBox = 'view-box';
      g.style.transformOrigin = '0 0';
      g.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
      g.setAttribute('aria-label', `${list.length} สถาบันในพื้นที่นี้ — กดเพื่อซูมเข้า`);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', '0'); dot.setAttribute('cy', '0');
      dot.setAttribute('r', rad.toFixed(1));
      dot.setAttribute('class', 'hub-dot');
      dot.setAttribute('fill', colorOf(list[0].p.r));
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('class', 'hub-count');
      txt.setAttribute('x', '0'); txt.setAttribute('y', '0');
      txt.setAttribute('font-size', (rad * 1.02).toFixed(1));
      txt.textContent = String(list.length);
      const hit = document.createElementNS(NS, 'circle');
      hit.setAttribute('cx', '0'); hit.setAttribute('cy', '0');
      hit.setAttribute('r', rad.toFixed(1));
      hit.setAttribute('class', 'hub-hit');
      g.append(hit, dot, txt);
      const zoomIn = (e) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        focusPin({ x: cx, y: cy }, 3.4);
      };
      g.addEventListener('click', zoomIn);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') zoomIn(e); });
      gHubs.appendChild(g);
      list.forEach((rec) => { rec.g.classList.add('in-hub'); rec.hub = g; });
      hubList.push({ g, dot, txt, hit, cx, cy, rad, list });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  สถานะของ "ภาค" — ออกแบบใหม่ทั้งชุด
  //   • hover / focus  = "เพ่งดู"  → ภาคนั้นสว่างขึ้น หมุดเด่นชัด ป้ายสรุปตัวเลขจริงโผล่
  //                     และ "ไม่ขยับกล้อง" (เดิมยกแผ่นลอยขึ้นเฉย ๆ = ไม่สื่ออะไร)
  //   • คลิก            = "ยืนยัน" → กรองรายการสถาบันด้านล่าง + เลื่อนไปดู
  //   • ตัวกรองที่กดค้าง = ภาคนั้นติดสว่างต่อ ไม่ต้องเอาเมาส์ชี้
  // ══════════════════════════════════════════════════════════════
  const gStats = document.createElementNS(NS, 'g');
  gStats.setAttribute('class', 'map-stats');
  gHubs.after(gStats);

  const statEls = {};
  const statsOf = (r) => {
    const list = M.pins.filter(p => p.r === r);
    const kms = list.map(p => { const d = driveOf(p); return d ? d.km : kmOf(p); }).filter(k => k > 1);
    return { n: list.length, min: kms.length ? Math.min(...kms) : 0, max: kms.length ? Math.max(...kms) : 0 };
  };

  // ป้ายสรุปของภาค (สร้างครั้งแรกที่ใช้) — ย่อ/ขยายสวนทางกล้องด้วย --lk
  const statChip = (r) => {
    if (r in statEls) return statEls[r];
    const pl = plates[r];
    if (!pl) { statEls[r] = null; return null; }
    const s = statsOf(r);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'plate-stat');
    const box = document.createElementNS(NS, 'rect');
    box.setAttribute('class', 'plate-stat-bg');
    box.setAttribute('rx', '7');
    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('class', 'plate-stat-text');
    txt.setAttribute('x', pl.labX.toFixed(1));
    txt.setAttribute('y', (pl.labY + 34).toFixed(1));
    txt.textContent = `${s.n} สถาบัน · ใกล้สุด ${Math.round(s.min)} กม. · ไกลสุด ${Math.round(s.max)} กม.`;
    g.append(box, txt);
    gStats.appendChild(g);
    try {
      const tb = txt.getBBox();
      box.setAttribute('x', (tb.x - 10).toFixed(1));
      box.setAttribute('y', (tb.y - 5.5).toFixed(1));
      box.setAttribute('width', (tb.width + 20).toFixed(1));
      box.setAttribute('height', (tb.height + 11).toFixed(1));
    } catch (_) {}
    statEls[r] = g;
    return g;
  };

  let previewRegion = null;
  const selectedRegions = () => {
    const set = new Set();
    document.querySelectorAll('.filter-btn[data-filter^="region:"]').forEach(btn => {
      if (btn.getAttribute('aria-pressed') === 'true') set.add(btn.dataset.filter.split(':')[1]);
    });
    return set;
  };

  const paintRegions = () => {
    const sel = selectedRegions();
    const pre = previewRegion;
    Object.entries(plates).forEach(([r, pl]) => {
      const lit = pre ? pre === r : sel.has(r);
      const dim = !!pre && pre !== r;
      pl.g.classList.toggle('lit', lit);
      pl.g.classList.toggle('dim', dim);
      pl.g.classList.toggle('sel', !pre && sel.has(r));
      if (pl.pinG) { pl.pinG.classList.toggle('lit', lit); pl.pinG.classList.toggle('dim', dim); }
      if (pl.labG) { pl.labG.classList.toggle('lit', lit); pl.labG.classList.toggle('dim', dim); }
      if (pl.wrap) { pl.wrap.classList.toggle('lit', lit); pl.wrap.classList.toggle('dim', dim); pl.wrap.classList.toggle('sel', !pre && sel.has(r)); }
    });
    hubList.forEach(h => {
      const r = h.g.dataset.region;
      h.g.classList.toggle('lit', !!pre && pre === r);
      h.g.classList.toggle('dim', !!pre && pre !== r);
    });
    const litRegions = pre ? [pre] : [...sel];
    const solo = litRegions.length === 1 ? litRegions[0] : null;
    Object.keys(plates).forEach(r => {
      const el = solo ? statChip(r) : statEls[r];
      if (el) el.classList.toggle('on', solo === r);
    });
  };

  const preview = (r) => { previewRegion = r || null; paintRegions(); };

  Object.entries(plates).forEach(([r, pl]) => {
    const enter = () => preview(r);
    const leave = () => preview(null);
    if (canHover) {                       // hover/focus มีความหมายเฉพาะจอที่มีเมาส์
      pl.g.addEventListener('pointerenter', enter);
      pl.g.addEventListener('pointerleave', leave);
      pl.g.addEventListener('focusin', enter);
      pl.g.addEventListener('focusout', leave);
    }
    const use = (scroll = true) => {
      const chip = document.querySelector(`.filter-btn[data-filter="region:${r}"]`);
      if (chip) {
        chip.click();
        if (scroll) document.getElementById('institutions')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
    };
    pl.g.addEventListener('click', (e) => {
      if (moved > 6) return;
      e.stopPropagation();
      use(false);           // คลิกบนแผนที่ = เลือกภาค ไม่ต้องกระโดดหน้าเว็บ (เลื่อนเฉพาะเมื่อคลิกจากรายการภาค)
      preview(null);
    });
    pl.g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); use(); }
    });
  });

  // ══ กล้อง: ซูมออกได้ถึง 3/5 ของกรอบ · แพนให้ภาคไหนก็มาอยู่กลางจอได้ ═════
  const VB = M.viewBox.split(' ').map(Number);
  const K_MIN = 0.6, K_MAX = 9;
  const cam = { k: 1, tx: 0, ty: 0, kT: 1, txT: 0, tyT: 0, raf: 0 };
  const clampK = (k) => Math.max(K_MIN, Math.min(K_MAX, k));
  // ขอบเขตแบบ "จุดใดก็ได้ในแผนที่ ถูกเลื่อนมาอยู่กลางกรอบได้" — ไม่ตีบตันเหมือนเมื่อก่อน
  const bounds = (k) => ({
    x0: VB[2] / 2 - VB[2] * k, x1: VB[2] / 2,
    y0: VB[3] / 2 - VB[3] * k, y1: VB[3] / 2,
  });
  const clampCam = () => {
    cam.kT = clampK(cam.kT);
    const b = bounds(cam.kT);
    cam.txT = Math.max(b.x0, Math.min(b.x1, cam.txT));
    cam.tyT = Math.max(b.y0, Math.min(b.y1, cam.tyT));
  };
  // ยางยืด: ลากเลยขอบได้แบบต้านมือ ไม่กระแทก (ปล่อยแล้วสปริงกลับเอง)
  const rubber = (v, lo, hi, span) => {
    if (v < lo) return lo - Math.min((lo - v) * 0.34, span * 0.22);
    if (v > hi) return hi + Math.min((v - hi) * 0.34, span * 0.22);
    return v;
  };
  const applyCam = () => {
    gZoom.setAttribute('transform', `translate(${cam.tx.toFixed(2)} ${cam.ty.toFixed(2)}) scale(${cam.k.toFixed(4)})`);
    // ป้ายชื่อภาคหดตามซูม → ขนาดบนจอคงที่
    gPlates.style.setProperty('--lk', (1 / cam.k).toFixed(4));
    svg.style.setProperty('--lk', (1 / cam.k).toFixed(4));   // ป้ายสรุปภาค + ป้ายที่อยู่ในเลเยอร์อื่น
    const f = 1 / Math.pow(cam.k, 0.55);
    dots.forEach(d => {
      d.dot.setAttribute('r', (d.baseR * f).toFixed(2));
      d.halo.setAttribute('r', (d.baseHalo * Math.max(f, 0.7)).toFixed(2));
      d.hit.setAttribute('r', (d.baseHit * Math.max(f, 0.55)).toFixed(2));
    });
    svg.classList.toggle('is-zoomed', cam.k > 1.15);
    // กระจุกหมุด: คงขนาดบนจอ + เปิดออกเมื่อซูมพอ ("กดตัวเลข → ซูมเข้า → แยกเป็นจุด")
    const hs = Math.pow(cam.k, -0.55);
    const rect0 = svg.getBoundingClientRect();
    const upx = rect0.width > 0 ? rect0.width / VB[2] : 0.58;   // พิกเซลต่อหน่วย viewBox ที่ k=1
    const hf = Math.pow(cam.k, 0.45) * upx;                     // ตัวคูณจริงบนจอของกลุ่มกระจุก
    hubList.forEach(h => {
      h.g.style.transform = `translate(${h.cx.toFixed(1)}px, ${h.cy.toFixed(1)}px) scale(${hs.toFixed(3)})`;
      const r = hf > 0 ? HUB_PX / hf : h.rad;                   // คงขนาดบนจอทุกจอ ทุกซูม
      h.dot.setAttribute('r', r.toFixed(1));
      h.txt.setAttribute('font-size', (r * 1.02).toFixed(1));
      if (h.hit) h.hit.setAttribute('r', Math.max(r, hf > 0 ? HUB_HIT_PX / hf : r).toFixed(1));
    });
    svg.classList.toggle('hub-open', cam.k > 2.4);
    // นิ้วเดียวลากได้เฉพาะตอนซูมอยู่ (ตอนไม่ซูมต้องเลื่อนหน้าเว็บได้ — ไม่งั้นจอเล็กจะติดกับแผนที่)
    svg.style.touchAction = cam.k > 1.02 ? 'none' : 'pan-y';
    // ซ่อนป้ายชื่อภาคที่จุดยึดหลุดกรอบ (ไม่งั้นโดนขอบตัดครึ่ง ดูเหมือนบั๊ก)
    Object.values(plates).forEach(pl => {
      const sx = pl.labX * cam.k + cam.tx, sy = pl.labY * cam.k + cam.ty;
      // ป้ายถูกย่อ/ขยายสวนทางกล้อง (คงขนาดบนจอ) → ขนาดในหน่วย viewBox คงที่ วัดครั้งเดียวพอ
      if (pl.halfW == null) {
        try {
          const b = pl.wrap.getBoundingClientRect(), sr = svg.getBoundingClientRect();
          pl.halfW = b.width > 1 ? (b.width / 2) / (sr.width / VB[2]) : 26;
          pl.halfH = b.height > 1 ? (b.height / 2) / (sr.height / VB[3]) : 12;
        } catch (_) { pl.halfW = 26; pl.halfH = 12; }
      }
      const hw = pl.halfW + 1.5, hh = pl.halfH + 1.5;
      pl.wrap.classList.toggle('off',
        sx - hw < 0 || sx + hw > VB[2] || sy - hh < 0 || sy + hh > VB[3]);
    });
  };
  const stepCam = () => {
    cam.raf = 0;
    const ease = reduced ? 1 : 0.26;
    cam.k += (cam.kT - cam.k) * ease;
    cam.tx += (cam.txT - cam.tx) * ease;
    cam.ty += (cam.tyT - cam.ty) * ease;
    if (Math.abs(cam.kT - cam.k) < 0.0012 && Math.abs(cam.txT - cam.tx) < 0.35 && Math.abs(cam.tyT - cam.ty) < 0.35) {
      cam.k = cam.kT; cam.tx = cam.txT; cam.ty = cam.tyT;
      applyCam();
      return;
    }
    applyCam();
    cam.raf = requestAnimationFrame(stepCam);
  };
  const kickCam = () => { if (!cam.raf) cam.raf = requestAnimationFrame(stepCam); };
  const zoomAt = (factor, clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * VB[2];
    const py = ((clientY - r.top) / r.height) * VB[3];
    const wx = (px - cam.tx) / cam.k, wy = (py - cam.ty) / cam.k;
    cam.kT = clampK(cam.kT * factor);
    cam.txT = px - wx * cam.kT;
    cam.tyT = py - wy * cam.kT;
    clampCam(); kickCam();
  };
  const resetCam = () => { cam.kT = 1; cam.txT = 0; cam.tyT = 0; kickCam(); };



  // ── ท่าทาง: ล้อเมาส์ · ลาก · หยิกสองนิ้ว · ดับเบิลคลิก · คีย์บอร์ด ──
  let dragging = false, lastX = 0, lastY = 0, moved = 0, pinchStart = 0, pinchK = 1, captured = false;
  let vx = 0, vy = 0, lastT = 0;                 // ความเร็วสำหรับแรงเหวี่ยง
  const pointers = new Map();
  const isTouch = (e) => e.pointerType === 'touch';

  // สองนิ้ว = เราจัดการเอง ห้ามเบราว์เซอร์เลื่อนหน้าไปด้วย (นิ้วเดียวยังเลื่อนหน้าได้ตามปกติ)
  const twoFinger = (e) => { if (e.touches.length > 1) e.preventDefault(); };
  svg.addEventListener('touchstart', twoFinger, { passive: false });
  svg.addEventListener('touchmove', twoFinger, { passive: false });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    // แทร็กแพด/ล้อเมาส์: หยิกบนแทร็กแพดจะมาเป็น ctrlKey + deltaY
    const step = e.ctrlKey ? 0.012 : 0.0018;
    zoomAt(Math.exp(-e.deltaY * step), e.clientX, e.clientY);
  }, { passive: false });

  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0; vx = 0; vy = 0; lastT = e.timeStamp;
    // หมายเหตุ: ห้าม setPointerCapture ตอนนี้ — ถ้าจับตั้งแต่กด คลิกจะไม่ถึงหมุด
    if (pointers.size === 1) {
      // นิ้วเดียว: ถ้ายังไม่ซูม แผนที่พอดีกรอบ → ปล่อยให้นิ้วเลื่อนหน้าเว็บตามปกติ
      //           ถ้าซูมอยู่แล้ว → ลากเพื่อแพนแผนที่ (ผู้ใช้บ่นว่า "pan map ในมือถือไม่ได้")
      if (isTouch(e) && cam.k <= 1.02) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      svg.classList.add('grabbing');
    } else if (pointers.size === 2) {
      dragging = false;
      for (const id of pointers.keys()) { try { svg.setPointerCapture(id); } catch (_) {} }
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      pinchK = cam.kT;
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {                            // หยิกซูม (นิ้ว/แทร็กแพด)
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart > 0) {
        const r = svg.getBoundingClientRect();
        const px = ((a.x + b.x) / 2 - r.left) / r.width * VB[2];
        const py = ((a.y + b.y) / 2 - r.top) / r.height * VB[3];
        const wx = (px - cam.tx) / cam.k, wy = (py - cam.ty) / cam.k;
        cam.kT = clampK(pinchK * (d / pinchStart));
        cam.txT = px - wx * cam.kT;
        cam.tyT = py - wy * cam.kT;
        clampCam(); kickCam();
      }
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6 && !captured) {                    // เริ่มลากจริงแล้ว → จับ pointer ให้ลากนอกแผนที่ได้
      captured = true;
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      gArcs.replaceChildren();
    }
    const r = svg.getBoundingClientRect();
    const dt = Math.max(1, e.timeStamp - lastT);
    const ux = (dx / r.width) * VB[2] / cam.k, uy = (dy / r.height) * VB[3] / cam.k;
    vx = ux / dt; vy = uy / dt;                      // หน่วยแผนที่ต่อมิลลิวินาที
    cam.tx += ux; cam.ty += uy;
    const b = bounds(cam.k);
    cam.tx = rubber(cam.tx, b.x0, b.x1, VB[2]);      // ลากเลยขอบได้แบบต้านมือ
    cam.ty = rubber(cam.ty, b.y0, b.y1, VB[3]);
    cam.txT = cam.tx; cam.tyT = cam.ty;
    applyCam();
    lastX = e.clientX; lastY = e.clientY; lastT = e.timeStamp;
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (pointers.size === 0) {
      const wasDrag = dragging;
      dragging = false;
      captured = false;
      svg.classList.remove('grabbing');
      try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
      const b = bounds(cam.k);
      // แรงเหวี่ยงแบบมืออาชีพ: เหวี่ยงต่อเฉพาะตอน "สะบัด" จริง
      // — ถ้าปล่อยช้า หรือหยุดนิ่งก่อนปล่อย (เล็งตำแหน่ง) ต้องหยุดตรงจุดเป๊ะ
      const idle = e.timeStamp - lastT;
      const fling = Math.hypot(vx, vy) > 0.12 && idle < 90;
      const glide = 130;
      let txT = fling ? cam.tx + vx * glide : cam.tx;
      let tyT = fling ? cam.ty + vy * glide : cam.ty;
      txT = Math.max(b.x0, Math.min(b.x1, txT));
      tyT = Math.max(b.y0, Math.min(b.y1, tyT));
      cam.txT = txT; cam.tyT = tyT;
      if (wasDrag) kickCam();
      vx = 0; vy = 0;
    }
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  svg.addEventListener('dblclick', (e) => {
    e.preventDefault();
    clearTimeout(clickTimer);
    setHover(null);
    if (cam.kT > 2.6) resetCam();
    else zoomAt(2.4, e.clientX, e.clientY);
  });

  // คลิก = หมุดที่ใกล้ที่สุดก่อน → ไม่มีก็ปิดการ์ด/ย้อนมุม (หน่วง 250ms ให้ดับเบิลคลิกได้ก่อน)
  let clickTimer = 0;
  svg.addEventListener('click', (e) => {
    if (moved > 6) return;
    const hit = pickAt(e.clientX, e.clientY, lastType === 'touch');
    if (hit) { e.stopPropagation(); openPin(hit.rec, nearFrom(hit)); return; }
    if (e.target.closest('.plate')) return;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      if (selected) { closeCard(); return; }
      if (cam.kT > 1.15) resetCam();
    }, 180);
  });

  // คีย์บอร์ด (ไม่มีปุ่มบนจอ แต่ยังใช้คีย์บอร์ดได้)
  paper.setAttribute('tabindex', '0');
  paper.setAttribute('aria-label', 'แผนที่สถาบัน');
  paper.addEventListener('keydown', (e) => {
    const r = svg.getBoundingClientRect();
    const stepPx = 70;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? stepPx : e.key === 'ArrowRight' ? -stepPx : 0;
      const dy = e.key === 'ArrowUp' ? stepPx : e.key === 'ArrowDown' ? -stepPx : 0;
      cam.txT += (dx / r.width) * VB[2] / cam.kT;
      cam.tyT += (dy / r.height) * VB[3] / cam.kT;
      clampCam(); kickCam();
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.4, r.left + r.width / 2, r.top + r.height / 2); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(1 / 1.4, r.left + r.width / 2, r.top + r.height / 2); }
    else if (e.key === '0') { e.preventDefault(); resetCam(); }
    else if (e.key === 'Escape') closeCard();
  });

  // เลื่อนเข้า-ออกจากจอ: หยุดอนิเมชันกล้องเมื่อไม่มอง
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      if (!e.isIntersecting && cam.raf) { cancelAnimationFrame(cam.raf); cam.raf = 0; cam.k = cam.kT; cam.tx = cam.txT; cam.ty = cam.tyT; applyCam(); }
    }, { threshold: 0.02 }).observe(paper);
  }

  const focusPin = (p, target = 3.6) => {
    const k = Math.max(cam.kT, target);
    cam.kT = k;
    cam.txT = VB[2] / 2 - p.x * k;     // transform คือ translate * scale → จุด (px,py) อยู่ที่ px*k+tx
    cam.tyT = VB[3] / 2 - p.y * k;
    clampCam(); kickCam();
  };

  // ── เลือกหมุดแบบ "ใกล้ที่สุด" (แก้ปัญหาหมุดทับกัน — คลิกกลางจุดที่เห็นต้องได้ตัวนั้น) ──
  const HIT_PX = 16;                               // รัศมีรอบจุดบนจอ (พิกเซล)
  const pickAt = (clientX, clientY, touch) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * VB[2];
    const py = ((clientY - r.top) / r.height) * VB[3];
    const wx = (px - cam.tx) / cam.k, wy = (py - cam.ty) / cam.k;
    const unit = (r.width / VB[2]) * cam.k;
    const reach = touch ? HIT_PX * 1.7 : HIT_PX;
    const hubsOpen = svg.classList.contains('hub-open');
    // วงกระจุกต้อง "ชนะ" การ hit-test: จุดจุฬาฯ อยู่ห่างศูนย์กลางวงไม่ถึง 1px
    // ถ้าไม่กันไว้ ชี้/คลิกวงจะได้การ์ด «คณะแพทยศาสตร์ จุฬาฯ» แทนที่จะเป็นปุ่มซูมเข้า
    if (!hubsOpen) {
      for (const h of hubList) {
        if (Math.hypot(h.cx - wx, h.cy - wy) * unit <= HUB_HIT_PX) return null;
      }
    }
    const cands = [];
    dots.forEach(rec => {
      if (!hubsOpen && rec.hub) return;                 // หมุดที่ถูกรวมอยู่ในกระจุก ยังกดไม่ได้จนกว่าจะซูม
      const d = Math.hypot(rec.p.x - wx, rec.p.y - wy) * unit;
      if (d <= reach + rec.baseR * unit) cands.push({ rec, d });
    });
    if (!cands.length) return null;
    // กติกา: "ระยะใกล้สุดชนะเสมอ" — คลิกกลางจุดที่เห็นได้ตัวนั้น
    cands.sort((a, b) => a.d - b.d || (b.rec.cluster ? 1 : 0) - (a.rec.cluster ? 1 : 0));
    return { rec: cands[0].rec, wx, wy, unit };
  };

  // รายการ "ตำแหน่งเดียวกัน": ตัวที่ถูกเลือกมาก่อน แล้วเรียงตัวอื่นตามระยะจากจุดที่คลิก
  const nearFrom = (hit) => {
    const others = dots
      .filter(d => d !== hit.rec)
      .map(d => ({ p: d.p, d: Math.hypot(d.p.x - hit.wx, d.p.y - hit.wy) * hit.unit }))
      .filter(x => x.d < 6)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5)
      .map(x => x.p);
    return [hit.rec.p, ...others];
  };

  let hoverRec = null;
  const setHover = (rec) => {
    if (hoverRec === rec) return;
    if (hoverRec) hoverRec.g.classList.remove('hover');
    hoverRec = rec;
    svg.classList.toggle('pin-hot', !!rec);
    if (rec) {
      rec.g.classList.add('hover');
      rec.g.parentNode.appendChild(rec.g);
      if (!selected) showCard(rec.p, 'preview');
      if (!reduced) showArc(rec.p);
    } else if (!selected) {
      if (cardEl) { cardEl.hidden = true; cardEl.innerHTML = ''; }
      clearArc();
    }
  };

  let lastType = 'mouse';
  svg.addEventListener('pointermove', (e) => {
    if (dragging || pointers.size > 0) return;
    lastType = e.pointerType;
    const h = pickAt(e.clientX, e.clientY, isTouch(e));
    setHover(h ? h.rec : null);
  }, { passive: true });
  svg.addEventListener('pointerleave', () => { if (!dragging) setHover(null); });

  const openPin = (rec, near) => {
    if (rec.cluster) { openCampus(near || []); return; }
    nearList = (near || []).slice();
    rec.p.__near = nearList.length > 1 ? nearList : [];   // แสดงแถวเลือกเฉพาะเมื่อมีหลายสถาบันที่ตำแหน่งเดียวกัน
    selected = rec.p;
    dots.forEach(d => d.g.classList.toggle('on', d === rec));
    rec.g.parentNode.appendChild(rec.g);
    showCard(rec.p, 'full');
    focusPin(rec.p);
    showArc(rec.p);
  };

  // เส้นทางจากคณะฯ ไปจุดที่เลือก (แสดงเฉพาะตอนชี้/เลือก — ไม่มีแล้วตอนเลื่อนผ่าน)
  const drawArcTo = (p) => {
    gArcs.replaceChildren();
    const mx = (HOME_X + p.x) / 2, my = (HOME_Y + p.y) / 2;
    const dx = p.x - HOME_X, dy = p.y - HOME_Y, len = Math.hypot(dx, dy) || 1;
    const cx = mx - dy / len * len * 0.2, cy = my + dx / len * len * 0.2;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `M${HOME_X.toFixed(1)},${HOME_Y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    path.setAttribute('class', 'map-arc');
    gArcs.appendChild(path);
    if (!reduced) {
      const L = path.getTotalLength();
      path.style.strokeDasharray = L;
      path.style.strokeDashoffset = L;
      path.getBoundingClientRect();
      path.style.transition = 'stroke-dashoffset 460ms cubic-bezier(.4,0,.2,1)';
      path.style.strokeDashoffset = 0;
    }
    const home = document.createElementNS(NS, 'circle');
    home.setAttribute('cx', HOME_X.toFixed(1)); home.setAttribute('cy', HOME_Y.toFixed(1));
    home.setAttribute('r', 6); home.setAttribute('class', 'map-home');
    gArcs.appendChild(home);
  };
  const showArc = (p) => { if (p.t.includes('chula')) return; drawArcTo(p); };
  const clearArc = () => { if (!selected) gArcs.replaceChildren(); };

  // ══ legend + ระยะทาง (คงของเดิม) ═════════════════════════════
  const legend = document.getElementById('map-legend');
  if (legend) {
    Object.entries(REGION).forEach(([key, meta]) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-legend-row';
      btn.dataset.region = key;
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `<span class="legend-dot" style="background:${meta.color}"></span>${meta.name}`
        + `<span class="legend-count">${count(key)}</span>`;
      li.appendChild(btn);
      legend.appendChild(li);
    });
    const syncPressed = () => {
      legend.querySelectorAll('.map-legend-row').forEach(btn => {
        const chip = document.querySelector(`.filter-btn[data-filter="region:${btn.dataset.region}"]`);
        if (!chip) return;
        const want = chip.getAttribute('aria-pressed') || 'false';
        if (btn.getAttribute('aria-pressed') !== want) btn.setAttribute('aria-pressed', want);
      });
      paintRegions();          // ภาคที่ถูกกรองอยู่ = ติดสว่างบนแผนที่ด้วย (เห็นสถานะโดยไม่ต้อง hover)
    };
    syncPressed();
    const chipPanel = document.querySelector('.filter-btns') || document.body;
    new MutationObserver(syncPressed).observe(chipPanel, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });

    // legend = ข้อมูลประกอบ ไม่ใช่ปุ่ม (ผู้ใช้สั่ง: แผนที่/showcase เฉย ๆ ไม่ interactive)
    legend.querySelectorAll('.map-legend-row').forEach(row => {
      row.removeAttribute('aria-pressed');
      row.tabIndex = -1;
      row.style.cursor = 'default';
    });
  }

  const facts = document.querySelector('#map-facts');
  if (facts) {
    const dorm = M.pins.filter(p => p.d).length;
    const free = M.pins.filter(p => p.f).length;
    facts.innerHTML = [`${M.pins.length} สถาบัน`, '5 ภาค', `มีที่พัก ${dorm}`, `ที่พักฟรี ${free}`]
      .map(t => `<span class="map-fact">${t}</span>`).join('');
  }

  const nearBox = document.querySelector('#map-near');
  if (nearBox) {
    const away = M.pins
      .filter(p => !p.t.includes('chula'))
      .map(p => { const d = driveOf(p); return { p, km: d ? d.km : kmOf(p), min: d ? d.min : null, drive: !!d }; })
      .filter(o => o.km > 1)
      .sort((a, b) => a.km - b.km);
    const row = (o, tag) => `<li class="map-near-row" tabindex="0" role="button" data-name="${o.p.n.replace(/"/g, '&quot;')}">`
      + `<span class="map-near-tag">${tag}</span><span class="map-near-name">${o.p.n}</span>`
      + `<span class="map-near-km">${o.km >= 100 ? Math.round(o.km) : o.km} กม.${o.min != null ? ` · ≈${o.min} น.` : ''}</span></li>`;
    nearBox.innerHTML = `<h3 class="map-near-title">ระยะทางขับรถจากคณะฯ</h3><ul class="map-near-list">`
      + away.slice(0, 2).map(o => row(o, 'ใกล้สุด')).join('')
      + away.slice(-3).reverse().map(o => row(o, 'ไกลสุด')).join('')
      + `</ul><p class="map-near-note">เส้นทางถนน · ${driveProv()} · เวลาเป็นค่าประมาณ (ขึ้นกับเวลาและการจราจร)</p>`;
    nearBox.querySelectorAll('.map-near-row').forEach(li => {
      const go = () => jumpToCard(li.dataset.name);
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  // ══ เปิดตัวเมื่อเลื่อนมาถึง ═══════════════════════════════════
  if (reduced) paper.classList.add('in');
  else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) { paper.classList.add('in'); io.disconnect(); } });
    }, { threshold: 0.16 });
    io.observe(paper);
  } else paper.classList.add('in');

  applyCam();
  window.__MAP = { cam, zoomAt, resetCam, dots, focusPin, closeCard, openCampus };

  // == โหมดแสดงผลอย่างเดียว: แผนที่เป็นภาพ ไม่ใช่ตัวควบคุม ==
  try {
    // ต้องปิดที่ .map-paper ด้วย — handler ลาก/ซูมผูกที่ชั้นนี้ (ไม่ใช่ที่ svg)
    paper.style.pointerEvents = 'none';
    paper.style.touchAction = 'auto';
    svg.style.pointerEvents = 'none';
    svg.style.touchAction = 'auto';
    // ตัด listener ทั้งหมดที่ผูกกับ svg — โคลนโหนดใหม่สะอาดที่สุด (pointer-events: none ปิดไม่หมดในเบราว์เซอร์จริง)
    const clean0 = svg.cloneNode(true);
    clean0.style.pointerEvents = 'none';
    clean0.style.touchAction = 'auto';
    clean0.setAttribute('aria-hidden', 'true');
    clean0.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.parentNode.replaceChild(clean0, svg);
    clean0.querySelectorAll('[tabindex]').forEach(el => el.removeAttribute('tabindex'));
    clean0.querySelectorAll('[role="button"]').forEach(el => el.removeAttribute('role'));
    window.__MAP.staticView = clean0;
    svg.querySelectorAll('[tabindex]').forEach(el => el.removeAttribute('tabindex'));
    svg.querySelectorAll('[role="button"]').forEach(el => el.removeAttribute('role'));
    svg.setAttribute('aria-hidden', 'true');
    paper.style.cursor = 'default';
    paper.removeAttribute('tabindex');
    const card = document.getElementById('map-card');
    if (card) { card.hidden = true; card.setAttribute('aria-hidden', 'true'); }
    document.querySelectorAll('.map-near-row').forEach(el => {
      el.removeAttribute('tabindex'); el.removeAttribute('role'); el.style.pointerEvents = 'none';
    });
  } catch (e) {}
})();

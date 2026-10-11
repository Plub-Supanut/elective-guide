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
    const go = () => {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      el.classList.remove('map-flash');
      void el.offsetWidth;
      el.classList.add('map-flash');
      setTimeout(() => el.classList.remove('map-flash'), 2200);
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
  const depthPath = document.createElementNS(NS, 'path');      // ขอบหนาของแผ่นประเทศ (ให้ดูเป็น slab)
  depthPath.setAttribute('d', M.paths);
  depthPath.setAttribute('class', 'map-land-depth');
  gLand.appendChild(depthPath);
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

  // ══ หมุด ══════════════════════════════════════════════════════
  const chulaPins = M.pins.filter(p => p.t.includes('chula'));
  const normalPins = M.pins.filter(p => !p.t.includes('chula'));
  const dots = [];
  const PIN_R = 4.0, HIT_R = 11;

  const addDot = (p, opts = {}) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'map-pin');
    g.dataset.region = p.r;
    const hit = document.createElementNS(NS, 'circle');
    hit.setAttribute('cx', p.x); hit.setAttribute('cy', p.y);
    hit.setAttribute('r', opts.hitR || HIT_R);
    hit.setAttribute('class', 'pin-hit');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    dot.setAttribute('r', opts.r || PIN_R);
    dot.setAttribute('class', p.a ? 'pin-dot' : 'pin-dot is-approx');
    if (p.a) dot.setAttribute('fill', colorOf(p.r));
    else { dot.setAttribute('fill', 'none'); dot.setAttribute('stroke', colorOf(p.r)); dot.setAttribute('stroke-width', '1.6'); }
    g.append(hit, dot);
    (opts.group || gPins).appendChild(g);
    const rec = { g, dot, hit, p, cluster: !!opts.cluster, baseR: opts.r || PIN_R, baseHit: opts.hitR || HIT_R };
    dots.push(rec);
    return rec;
  };

  normalPins.forEach(p => addDot(p));

  const chulaPoint = { x: HOME_X, y: HOME_Y, r: 'bkk', n: 'คณะแพทยศาสตร์ จุฬาฯ', t: 'chula hospital', a: 1, d: false, f: false };
  const chulaRec = chulaPins.length ? addDot(chulaPoint, { r: 6.4, hitR: 16, group: gChula, cluster: true }) : null;
  if (chulaRec) {
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', HOME_X); ring.setAttribute('cy', HOME_Y);
    ring.setAttribute('r', 10); ring.setAttribute('class', 'chula-ring');
    gChula.insertBefore(ring, chulaRec.g);
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', HOME_X + 14); label.setAttribute('y', HOME_Y - 9);
    label.setAttribute('class', 'chula-label');
    label.textContent = `รพ.จุฬาฯ · ${chulaPins.length} ภาควิชา`;
    gChula.appendChild(label);
  }

  // ══ การ์ดข้างแผนที่ ═══════════════════════════════════════════
  const cardEl = document.getElementById('map-card');
  let selected = null;

  const paintCard = (html) => {
    if (!cardEl) return;
    cardEl.hidden = false;
    cardEl.innerHTML = html;
    cardEl.querySelector('.map-card-close')?.addEventListener('click', () => closeCard());
  };
  const showCard = (p, mode) => {
    if (!cardEl) return;
    const rg = REGION[p.r] ? REGION[p.r].name : '';
    paintCard(`
      <button type="button" class="map-card-close" aria-label="ปิด">✕</button>
      <p class="map-card-eyebrow">${rg}</p>
      <h3 class="map-card-name">${p.n}</h3>
      <div class="map-card-badges">${badgeOf(p).map(b => `<span>${b}</span>`).join('')}</div>
      <dl class="map-card-facts">
        <div><dt>ระยะจากคณะฯ</dt><dd>${Math.round(kmOf(p))} กม. (เส้นตรง)</dd></div>
        ${p.a ? '' : '<div><dt>พิกัด</dt><dd>ตำแหน่งโดยประมาณ</dd></div>'}
      </dl>
      ${mode === 'full'
        ? '<button type="button" class="map-card-go">ไปที่การ์ดเต็มในรายการ ↓</button>'
        : ''}`);
    cardEl.querySelector('.map-card-go')?.addEventListener('click', () => jumpToCard(p.n));
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
      const [lx, ly] = iso(b.x + b.w * 0.5, b.y + b.d + 14, 0);
      const c = campusData.depts.filter(d => d.b === b.id);
      return `<text class="campus-label" x="${(lx + ox).toFixed(1)}" y="${(ly + oy).toFixed(1)}">${b.short}${c.length ? ' · ' + c.length + ' ภาควิชา' : ''}</text>`;
    }).join('');

    const unplaced = (campusData.unplaced || []).map(n => `<button type="button" class="campus-chip" data-name="${n}">${n.replace('ภาควิชา', '')}</button>`).join('');

    return `<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" class="map-campus" role="img"
                 aria-label="แผนผังอาคารคณะแพทยศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย">
        ${faces}${labels}${dotsSvg}
      </svg>
      ${unplaced ? `<p class="campus-sub">ไม่ระบุอาคารในแบบฟอร์ม (กดเพื่อดูการ์ด)</p><div class="campus-chips">${unplaced}</div>` : ''}
      <p class="campus-note">${campusData.source || ''}</p>`;
  };

  const openCampus = () => {
    selected = 'chula';
    dots.forEach(d => d.g.classList.toggle('on', d.cluster));
    paintCard(`
      <button type="button" class="map-card-close" aria-label="ปิด">✕</button>
      <p class="map-card-eyebrow">กรุงเทพฯ · อาคารในคณะแพทยศาสตร์</p>
      <h3 class="map-card-name">คณะแพทยศาสตร์ จุฬาฯ</h3>
      <div class="map-card-badges"><span>${chulaPins.length} ภาควิชา/หน่วยงาน</span><span>แผนผังอาคาร</span></div>
      ${campusSvg()}`);
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
  };

  // ══ แผ่นภาค — ใช้เส้นขอบจังหวัดจริงของแต่ละภาค (ยกขึ้น/ลดลงได้) ══════════
  const gPlates = document.createElementNS(NS, 'g');
  gPlates.setAttribute('class', 'map-plates');
  gLand.after(gPlates);                        // ทับเส้นขอบจังหวัด แต่ใต้หมุด

  const LABEL_NUDGE = { bkk: [108, 46], central: [-18, 34], isan: [0, 0], north: [0, 0], south: [0, 0] };
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

    const depth = document.createElementNS(NS, 'path');      // ขอบหนา = ความหนาของแผ่น
    depth.setAttribute('d', d);
    depth.setAttribute('class', 'plate-depth');

    const face = document.createElementNS(NS, 'path');       // หน้าแผ่น
    face.setAttribute('d', d);
    face.setAttribute('class', 'plate-face');

    const hit = document.createElementNS(NS, 'path');        // พื้นที่กด/โฟกัส
    hit.setAttribute('d', d);
    hit.setAttribute('class', 'plate-hit');
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', `ภาค${REGION[r].name} — ${list.length} สถาบัน`);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('class', 'plate-label');
    label.setAttribute('x', (lab[0] + nudge[0]).toFixed(1));
    label.setAttribute('y', (lab[1] + nudge[1]).toFixed(1));
    label.textContent = `${REGION[r].name} · ${list.length}`;

    g.append(depth, face, hit, label);
    gPlates.appendChild(g);
    plates[r] = { g, label };
  });

  const raisePlate = (r, on) => {
    Object.entries(plates).forEach(([key, pl]) => {
      pl.g.classList.toggle('up', on && key === r);
      pl.g.classList.toggle('dim', on && key !== r);
    });
  };
  Object.entries(plates).forEach(([r, pl]) => {
    const enter = () => raisePlate(r, true);
    const leave = () => raisePlate(r, false);
    pl.g.addEventListener('pointerenter', enter);
    pl.g.addEventListener('pointerleave', leave);
    pl.g.addEventListener('focusin', enter);
    pl.g.addEventListener('focusout', leave);
    const use = () => {
      const chip = document.querySelector(`.filter-btn[data-filter="region:${r}"]`);
      if (chip) {
        chip.click();
        document.getElementById('institutions')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
    };
    pl.g.addEventListener('click', (e) => { if (moved > 6) return; e.stopPropagation(); use(); });
    pl.g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); use(); }
    });
  });

  // ══ กล้อง: ซูม + แพน ด้วยท่าทางเท่านั้น (ไม่มีปุ่ม) ═════════════
  const VB = M.viewBox.split(' ').map(Number);
  const PAD = 0.14;                                  // ยอมให้ลากเลยขอบได้นิดหน่อย (ยางยืด)
  const cam = { k: 1, tx: 0, ty: 0, kT: 1, txT: 0, tyT: 0, raf: 0 };
  const bounds = (k) => ({
    x0: -(VB[2] * (k - 1)) / k - VB[2] * PAD,
    x1: VB[2] * PAD,
    y0: -(VB[3] * (k - 1)) / k - VB[3] * PAD,
    y1: VB[3] * PAD,
  });
  const clampCam = () => {
    cam.kT = Math.max(1, Math.min(7, cam.kT));
    const b = bounds(cam.kT);
    cam.txT = Math.max(b.x0, Math.min(b.x1, cam.txT));
    cam.tyT = Math.max(b.y0, Math.min(b.y1, cam.tyT));
  };
  const applyCam = () => {
    gZoom.setAttribute('transform', `translate(${cam.tx.toFixed(2)} ${cam.ty.toFixed(2)}) scale(${cam.k.toFixed(4)})`);
    // ป้ายชื่อภาคหดตามซูม → ขนาดบนจอคงที่ ไม่บวมเป็นตัวเบ้อเริ่มตอนซูมเข้า
    gPlates.style.setProperty('--lk', (1 / cam.k).toFixed(4));
    // หมุดเล็กลงเมื่อซูมเข้า (ไม่ให้บวมทับกัน) แต่ไม่เล็กจนมองไม่เห็น
    const f = 1 / Math.pow(cam.k, 0.55);
    dots.forEach(d => {
      d.dot.setAttribute('r', (d.baseR * f).toFixed(2));
      d.hit.setAttribute('r', (d.baseHit * Math.max(f, 0.55)).toFixed(2));
    });
    svg.classList.toggle('is-zoomed', cam.k > 1.15);
  };
  const stepCam = () => {
    cam.raf = 0;
    const ease = reduced ? 1 : 0.2;
    cam.k += (cam.kT - cam.k) * ease;
    cam.tx += (cam.txT - cam.tx) * ease;
    cam.ty += (cam.tyT - cam.ty) * ease;
    if (Math.abs(cam.kT - cam.k) < 0.0015 && Math.abs(cam.txT - cam.tx) < 0.4 && Math.abs(cam.tyT - cam.ty) < 0.4) {
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
    cam.kT = Math.max(1, Math.min(7, cam.kT * factor));
    cam.txT = px - wx * cam.kT;
    cam.tyT = py - wy * cam.kT;
    clampCam(); kickCam();
  };
  const resetCam = () => { cam.kT = 1; cam.txT = 0; cam.tyT = 0; kickCam(); };

  // ── ท่าทาง: ล้อเมาส์ · ลาก · หยิกสองนิ้ว · ดับเบิลคลิก · คีย์บอร์ด ──
  let dragging = false, lastX = 0, lastY = 0, moved = 0, pinchStart = 0, pinchK = 1, captured = false;
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
    moved = 0;
    // หมายเหตุ: ห้าม setPointerCapture ตอนนี้ — ถ้าจับตั้งแต่กด คลิกจะไม่ถึงหมุด (อีเวนต์ถูกเปลี่ยนเป้าไปที่ svg)
    //          จะจับก็ต่อเมื่อ "ลากจริง" (ขยับเกิน 6px) หรือตอนหยิกสองนิ้วเท่านั้น
    if (pointers.size === 1) {
      if (isTouch(e)) { /* นิ้วเดียว = เลื่อนหน้าเว็บตามปกติ ไม่แย่ง */ return; }
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
        cam.kT = Math.max(1, Math.min(7, pinchK * (d / pinchStart)));
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
      gArcs.replaceChildren();                       // ลากแล้วอย่าให้เส้นทางค้าง
    }
    const r = svg.getBoundingClientRect();
    // ลากตามมือ: แปลงระยะพิกเซลเป็นหน่วยแผนที่ แล้วหารด้วยซูมปัจจุบัน
    cam.tx += (dx / r.width) * VB[2] / cam.k;
    cam.ty += (dy / r.height) * VB[3] / cam.k;
    const b = bounds(cam.k);
    cam.tx = Math.max(b.x0, Math.min(b.x1, cam.tx));
    cam.ty = Math.max(b.y0, Math.min(b.y1, cam.ty));
    cam.txT = cam.tx; cam.tyT = cam.ty;
    applyCam();
    lastX = e.clientX; lastY = e.clientY;
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (pointers.size === 0) {
      dragging = false;
      captured = false;
      svg.classList.remove('grabbing');
      try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
      // คืนตำแหน่งถ้าลากเลยขอบ (ยางยืด)
      const b = bounds(cam.k);
      cam.txT = Math.max(b.x0 + VB[2] * PAD, Math.min(b.x1 - VB[2] * PAD, cam.tx));
      cam.tyT = Math.max(b.y0 + VB[3] * PAD, Math.min(b.y1 - VB[3] * PAD, cam.ty));
      kickCam();
    }
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  svg.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (cam.kT > 1.4) resetCam();
    else zoomAt(2.2, e.clientX, e.clientY);
  });

  // คลิกพื้นที่ว่าง = ปิดการ์ด แล้วย้อนกลับมาที่มุมเต็มประเทศ
  svg.addEventListener('click', (e) => {
    if (moved > 6) return;
    if (e.target.closest('.map-pin')) return;
    if (e.target.closest('.plate')) return;
    if (selected) { closeCard(); return; }
    if (cam.kT > 1.15) resetCam();
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

  // ── ผูกเหตุการณ์ให้หมุด ───────────────────────────────────────
  dots.forEach(rec => {
    const { g, p } = rec;
    g.addEventListener('pointerenter', (e) => {
      if (dragging) return;
      g.classList.add('hover');
      if (!selected) showCard(p, 'preview');
      if (!reduced && e.clientX) showArc(p);
    });
    g.addEventListener('pointerleave', () => {
      g.classList.remove('hover');
      if (!selected) { if (cardEl) { cardEl.hidden = true; cardEl.innerHTML = ''; } }
      clearArc();
    });
    g.addEventListener('click', (e) => {
      if (moved > 6) return;
      e.stopPropagation();
      if (rec.cluster) { openCampus(); return; }
      selected = p;
      dots.forEach(d => d.g.classList.toggle('on', d === rec));
      showCard(p, 'full');
      focusPin(p);
      showArc(p);
    });
  });

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
    home.setAttribute('r', 4); home.setAttribute('class', 'map-home');
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
    };
    syncPressed();
    const chipPanel = document.querySelector('.filter-btns') || document.body;
    new MutationObserver(syncPressed).observe(chipPanel, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });

    legend.querySelectorAll('.map-legend-row').forEach(row => {
      const r = row.dataset.region;
      const light = () => raisePlate(r, true);
      const unlight = () => raisePlate(r, false);
      row.addEventListener('pointerenter', light);
      row.addEventListener('pointerleave', unlight);
      row.addEventListener('focus', light);
      row.addEventListener('blur', unlight);
      row.addEventListener('click', () => {
        const chip = document.querySelector(`.filter-btn[data-filter="region:${r}"]`);
        if (chip) { chip.click(); document.getElementById('institutions')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
      });
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
      .map(p => ({ p, km: kmOf(p) }))
      .filter(o => o.km > 1)
      .sort((a, b) => a.km - b.km);
    const row = (o, tag) => `<li class="map-near-row" tabindex="0" role="button" data-name="${o.p.n.replace(/"/g, '&quot;')}">`
      + `<span class="map-near-tag">${tag}</span><span class="map-near-name">${o.p.n}</span>`
      + `<span class="map-near-km">${Math.round(o.km)} กม.</span></li>`;
    nearBox.innerHTML = `<h3 class="map-near-title">ระยะทางจากคณะฯ</h3><ul class="map-near-list">`
      + away.slice(0, 2).map(o => row(o, 'ใกล้สุด')).join('')
      + away.slice(-3).reverse().map(o => row(o, 'ไกลสุด')).join('')
      + '</ul><p class="map-near-note">ระยะเส้นตรงจากคณะแพทยศาสตร์ จุฬาฯ</p>';
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
})();

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
        : '<p class="map-card-hint">คลิกที่จุดเพื่อดูรายละเอียด</p>'}`);
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

  // ══ กล้อง: ซูม + แพน (นุ่มนวล) ════════════════════════════════
  const VB = M.viewBox.split(' ').map(Number);
  const cam = { k: 1, tx: 0, ty: 0, kT: 1, txT: 0, tyT: 0, raf: 0 };
  const clampCam = () => {
    cam.kT = Math.max(1, Math.min(9, cam.kT));
    const w = VB[2], h = VB[3];
    cam.txT = Math.max(-(w * (cam.kT - 1)) / cam.kT, Math.min(0, cam.txT));
    cam.tyT = Math.max(-(h * (cam.kT - 1)) / cam.kT, Math.min(0, cam.tyT));
  };
  const applyCam = () => {
    gZoom.setAttribute('transform', `translate(${cam.tx} ${cam.ty}) scale(${cam.k})`);
    const f = 1 / Math.pow(cam.k, 0.62);
    dots.forEach(d => {
      d.dot.setAttribute('r', d.baseR * f);
      d.hit.setAttribute('r', d.baseHit * Math.max(f, 0.5));
    });
    const z = document.getElementById('map-zoom-level');
    if (z) z.textContent = cam.k.toFixed(1) + '×';
  };
  const stepCam = () => {
    cam.raf = 0;
    const ease = reduced ? 1 : 0.18;
    cam.k += (cam.kT - cam.k) * ease;
    cam.tx += (cam.txT - cam.tx) * ease;
    cam.ty += (cam.tyT - cam.ty) * ease;
    if (Math.abs(cam.kT - cam.k) < 0.002 && Math.abs(cam.txT - cam.tx) < 0.5 && Math.abs(cam.tyT - cam.ty) < 0.5) {
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
    cam.kT = Math.max(1, Math.min(9, cam.kT * factor));
    cam.txT = px - wx * cam.kT;
    cam.tyT = py - wy * cam.kT;
    clampCam(); kickCam();
  };
  const zoomCenter = (factor) => {
    const r = svg.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  };
  const focusPin = (p, target = 4.5) => {
    cam.kT = Math.max(cam.kT, target);
    cam.txT = VB[2] / 2 - (p.x / VB[2] * VB[2] / cam.kT) * cam.kT;
    cam.txT = VB[2] / 2 - p.x * 1;
    cam.tyT = VB[3] / 2 - p.y * 1;
    cam.txT = VB[2] / 2 - p.x * 1;
    clampCam(); kickCam();
  };
  const resetCam = () => { cam.kT = 1; cam.txT = 0; cam.tyT = 0; kickCam(); };

  // ── อินพุต ────────────────────────────────────────────────────
  let dragging = false, lastX = 0, lastY = 0, moved = 0;
  const pointers = new Map();
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY);
  }, { passive: false });
  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; try { svg.setPointerCapture(e.pointerId); } catch (_) {} svg.classList.add('grabbing'); }
  });
  svg.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (svg._pinch) zoomAt(dist / svg._pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      svg._pinch = dist;
      return;
    }
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      const r = svg.getBoundingClientRect();
      cam.tx = Math.max(-(VB[2] * (cam.k - 1)) / cam.k, Math.min(0, cam.tx + (dx / r.width) * VB[2] / cam.k));
      cam.ty = Math.max(-(VB[3] * (cam.k - 1)) / cam.k, Math.min(0, cam.ty + (dy / r.height) * VB[3] / cam.k));
      cam.txT = cam.tx; cam.tyT = cam.ty;
      applyCam();
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) svg._pinch = 0;
    if (pointers.size === 0) { dragging = false; svg.classList.remove('grabbing'); try { svg.releasePointerCapture(e.pointerId); } catch (_) {} }
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('dblclick', (e) => { e.preventDefault(); zoomAt(2, e.clientX, e.clientY); });

  document.getElementById('map-zoom-in')?.addEventListener('click', () => zoomCenter(1.7));
  document.getElementById('map-zoom-out')?.addEventListener('click', () => zoomCenter(1 / 1.7));
  document.getElementById('map-zoom-reset')?.addEventListener('click', resetCam);
  const paper = host.closest('.map-paper') || host;
  paper.setAttribute('tabindex', '0');
  paper.setAttribute('aria-label', 'แผนที่สถาบัน — ลูกศรเพื่อเลื่อน, + และ - เพื่อซูม, 0 เพื่อย้อนกลับ');
  paper.addEventListener('keydown', (e) => {
    const r = svg.getBoundingClientRect();
    const pxs = 70;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? pxs : e.key === 'ArrowRight' ? -pxs : 0;
      const dy = e.key === 'ArrowUp' ? pxs : e.key === 'ArrowDown' ? -pxs : 0;
      cam.txT += (dx / r.width) * VB[2] / cam.kT;
      cam.tyT += (dy / r.height) * VB[3] / cam.kT;
      clampCam(); kickCam();
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomCenter(1.4); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomCenter(1 / 1.4); }
    else if (e.key === '0') { e.preventDefault(); resetCam(); }
    else if (e.key === 'Escape') closeCard();
  });

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

/* ══ แผนที่ 3D (WebGL ล้วน ไม่ใช้ไลบรารี) ═══════════════════════
     โหมด «กลางคืน»: เส้นขอบจังหวัดเป็นเส้นลวด 3D + หมุด 117 จุดเรืองแสง
     หมุนได้ด้วยการลาก · หมุดที่ชี้จะโตขึ้นและขึ้นชื่อ · กดแล้วไปการ์ดเหมือนโหมด 2D
     ถ้าเครื่องไม่รองรับ WebGL ปุ่ม 3D จะไม่แสดงและใช้แผนที่ 2D ตามปกติ
     ═════════════════════════════════════════════════════════════ */
  const stage3d = (() => {
    const canvas = document.createElement('canvas');
    canvas.className = 'map-3d';
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false })
            || canvas.getContext('experimental-webgl');
    if (!gl) return null;

    // ── เมทริกซ์ 4x4 (column-major แบบ WebGL) ──
    const mul = (a, b) => {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    };
    const persp = (fovy, aspect, near, far) => {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    };
    const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); };
    const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); };
    const trans = (x, y, z) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
    const scale = (s) => new Float32Array([s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]);

    const VSH_LINE = `
      attribute vec3 aPos; attribute float aSide;
      uniform mat4 uMVP;
      varying float vSide; varying float vDepth;
      void main() {
        vec4 p = uMVP * vec4(aPos, 1.0);
        gl_Position = p;
        vSide = aSide;
        vDepth = clamp((p.z / p.w + 1.0) * 0.5, 0.0, 1.0);
      }`;
    const FSH_LINE = `
      precision mediump float;
      varying float vSide; varying float vDepth;
      uniform vec3 uTop; uniform vec3 uBottom;
      void main() {
        vec3 c = mix(uTop, uBottom, vSide);
        float a = mix(1.0, 0.5, vDepth) * mix(1.0, 0.62, vSide);
        gl_FragColor = vec4(c * (1.0 - vDepth * 0.12), a);
      }`;
    const VSH_PIN = `
      attribute vec3 aPos; attribute vec3 aColor; attribute float aSize;
      uniform mat4 uMVP; uniform float uScale; uniform float uGrow;
      varying vec3 vColor; varying float vDepth;
      void main() {
        vec4 p = uMVP * vec4(aPos, 1.0);
        gl_Position = p;
        // ต้องจำกัดขนาดจุด — ถ้าไม่จำกัด พอหมุดใกล้กล้อง ขนาดจะพุ่งเป็นหลายร้อยพิกเซล
        // แล้วการวาดจะหนักจนเครื่องค้าง (เจอจริงตอนทดสอบ)
        gl_PointSize = clamp(aSize * uScale * (1.0 + uGrow) / max(1.5, p.w), 2.0, 24.0);
        vColor = aColor;
        vDepth = clamp((p.z / p.w + 1.0) * 0.5, 0.0, 1.0);
      }`;
    const FSH_PIN = `
      precision mediump float;
      varying vec3 vColor; varying float vDepth;
      uniform float uDim;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float core = smoothstep(0.5, 0.06, d);
        float halo = smoothstep(0.5, 0.0, d) * 0.35;
        float a = (core + halo) * mix(1.0, 0.22, uDim) * mix(1.0, 0.55, vDepth);
        gl_FragColor = vec4(vColor, a);
      }`;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const program = (vs, fs) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    };

    let lineProg, pinProg;
    try { lineProg = program(VSH_LINE, FSH_LINE); pinProg = program(VSH_PIN, FSH_PIN); }
    catch (e) { return null; }

    // ── แปลงข้อมูลแผนที่ → เรขาคณิต 3D ──
    const VB = M.viewBox.split(' ').map(Number);
    const CX = VB[2] / 2, CY = VB[3] / 2, UNIT = 760;      // ย่อให้ประเทศสูง ~1 หน่วย
    const rings = M.paths.split('M').filter(Boolean).map(seg =>
      seg.replace('Z', '').trim().split(' ').map(pair => pair.split(',').map(Number)));

    const lineVerts = [], lineSides = [];
    const push = (x, y, z, side) => { lineVerts.push((x - CX) / UNIT, (y - CY) / UNIT, z); lineSides.push(side); };
    const Z_TOP = 0, Z_BOTTOM = -0.055;
    rings.forEach(r => {
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        push(a[0], a[1], Z_TOP, 0); push(b[0], b[1], Z_TOP, 0);           // เส้นขอบบน
        push(a[0], a[1], Z_BOTTOM, 1); push(b[0], b[1], Z_BOTTOM, 1);    // เส้นขอบล่าง (เงา)
        if (i % 4 === 0) { push(a[0], a[1], Z_TOP, 1); push(a[0], a[1], Z_BOTTOM, 1); }  // เส้นเชื่อมแนวตั้ง
      }
    });
    const lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lineVerts), gl.STATIC_DRAW);
    const sideBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sideBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lineSides), gl.STATIC_DRAW);

    const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const pinPos = [], pinCol = [], pinSize = [];
    M.pins.forEach(p => {
      pinPos.push((p.x - CX) / UNIT, (p.y - CY) / UNIT, 0.012);
      const c = hex2rgb((REGION[p.r] || { color: '#6b6157' }).color);
      pinCol.push(c[0], c[1], c[2]);
      pinSize.push(p.a ? 7.2 : 5.6);
    });
    const pinCount = M.pins.length;
    const mkBuf = (arr) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return b; };
    const posBuf = mkBuf(pinPos), colBuf = mkBuf(pinCol), sizeBuf = mkBuf(pinSize);
    const state = { yaw: 0.22, pitch: -1.02, drag: false, lx: 0, ly: 0, spin: 0, focus: null, hover: -1, visible: false, raf: 0, dpr: 1 };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      state.dpr = Math.min(window.devicePixelRatio || 1, state.dprCap || 1.5);
      canvas.width = Math.max(300, Math.round(r.width * state.dpr));
      canvas.height = Math.max(300, Math.round(r.height * state.dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (!state.visible) draw(0);
    };

    const mvpOf = (yaw) => {
      const aspect = canvas.width / Math.max(1, canvas.height);
      const P = persp(Math.PI / 4.2, aspect, 0.1, 20);
      const V = trans(0, 0.10, -2.05);
      const M = mul(mul(rotY(yaw), rotX(state.pitch)), scale(0.80));
      return mul(P, mul(V, M));
    };

    const project = (mvp) => {
      const out = [];
      for (let i = 0; i < pinCount; i++) {
        const x = pinPos[i * 3], y = pinPos[i * 3 + 1], z = pinPos[i * 3 + 2];
        const w = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
        if (w <= 0.05) { out.push(null); continue; }
        const sx = (mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12]) / w;
        const sy = (mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13]) / w;
        out.push({ x: (sx * 0.5 + 0.5) * canvas.clientWidth, y: (-sy * 0.5 + 0.5) * canvas.clientHeight, w, r: M.pins[i].r });
      }
      return out;
    };

    let lastProj = [];
    const draw = (t) => {
      // แกว่งซ้าย-ขวาช้า ๆ (±0.22 ราด) แทนการหมุนวน เพื่อให้แผนที่อยู่ในกรอบเสมอ
      const base = (state.drag || reduced) ? 0 : Math.sin((t || 0) * 0.00016) * 0.22;
      const yaw = state.yaw + base;
      const mvp = mvpOf(yaw);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // เส้นขอบจังหวัด
      gl.useProgram(lineProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, 'uMVP'), false, mvp);
      gl.uniform3fv(gl.getUniformLocation(lineProg, 'uTop'), hex2rgb('#cfe3c4'));
      gl.uniform3fv(gl.getUniformLocation(lineProg, 'uBottom'), hex2rgb('#7d9b76'));
      const aPos = gl.getAttribLocation(lineProg, 'aPos');
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      const aSide = gl.getAttribLocation(lineProg, 'aSide');
      gl.bindBuffer(gl.ARRAY_BUFFER, sideBuf);
      gl.enableVertexAttribArray(aSide);
      gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, lineVerts.length / 3);

      // หมุด
      gl.useProgram(pinProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(pinProg, 'uMVP'), false, mvp);
      gl.uniform1f(gl.getUniformLocation(pinProg, 'uScale'), Math.max(1.1, canvas.height / 700) * 1.6);
      gl.uniform1f(gl.getUniformLocation(pinProg, 'uDim'), state.focus ? 1 : 0);
      const pPos = gl.getAttribLocation(pinProg, 'aPos');
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(pPos);
      gl.vertexAttribPointer(pPos, 3, gl.FLOAT, false, 0, 0);
      const pCol = gl.getAttribLocation(pinProg, 'aColor');
      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.enableVertexAttribArray(pCol);
      gl.vertexAttribPointer(pCol, 3, gl.FLOAT, false, 0, 0);
      const pSize = gl.getAttribLocation(pinProg, 'aSize');
      gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
      gl.enableVertexAttribArray(pSize);
      gl.vertexAttribPointer(pSize, 1, gl.FLOAT, false, 0, 0);
      gl.uniform1f(gl.getUniformLocation(pinProg, 'uGrow'), 0);
      gl.drawArrays(gl.POINTS, 0, pinCount);

      // หมุดที่ชี้อยู่ วาดซ้ำให้โตขึ้น
      if (state.hover >= 0) {
        gl.uniform1f(gl.getUniformLocation(pinProg, 'uGrow'), 0.9);
        gl.drawArrays(gl.POINTS, state.hover, 1);
      }
      lastProj = project(mvp);
    };

    let t0 = 0, lastT = 0, slowFrames = 0, lowPower = false;
    let needDraw = true;
    const requestDraw = () => { needDraw = true; };
    const loop = (t) => {
      if (!state.visible) return;
      if (!t0) t0 = t;
      const dt = lastT ? t - lastT : 16;
      lastT = t;
      slowFrames = dt > 80 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (!lowPower && slowFrames > 8) {
        // เครื่องช้า/ไม่มี GPU (เช่นโหมด software) → หยุดหมุน ลดความละเอียด
        // แล้ววาดเฉพาะตอนมีการขยับ ไม่วาดซ้ำทุกเฟรม จะได้ไม่บล็อกหน้าเว็บ
        lowPower = true;
        state.spin = 0;
        state.dprCap = 1;
        resize();
        requestDraw();
      }
      if (lowPower) {
        if (needDraw) { draw(t - t0); needDraw = false; }
      } else {
        draw(t - t0);
      }
      state.raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (state.raf) return;
      state.visible = true;
      resize();
      state.raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      state.visible = false;
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
    };

    // ── ลากหมุน ──
    canvas.addEventListener('pointerdown', (e) => {
      state.drag = true; state.lx = e.clientX; state.ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('grabbing');
    });
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      if (state.drag) {
        state.yaw += (e.clientX - state.lx) * 0.006;
        state.pitch = Math.max(-1.35, Math.min(-0.55, state.pitch + (e.clientY - state.ly) * 0.004));
        state.lx = e.clientX; state.ly = e.clientY;
        requestDraw();
        if (reduced) draw(0);
        return;
      }
      // หาหมุดที่ใกล้ที่สุดในระยะ 20px
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = -1, bd = 20 * 20;
      lastProj.forEach((q, i) => {
        if (!q) return;
        const d = (q.x - mx) ** 2 + (q.y - my) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      if (best !== state.hover) {
        state.hover = best;
        requestDraw();
        if (best >= 0) {
          const q = lastProj[best];
          showCard(M.pins[best], 'preview');
          canvas.style.cursor = 'pointer';
        } else {
          if (!selected) { cardEl.hidden = true; cardEl.innerHTML = ''; }
          canvas.style.cursor = '';
        }
        if (reduced) draw(0);
      }
    });
    const endDrag = (e) => {
      state.drag = false;
      canvas.classList.remove('grabbing');
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', () => { state.hover = -1; if (!selected) { cardEl.hidden = true; cardEl.innerHTML = ''; } if (reduced) draw(0); });
    canvas.addEventListener('click', () => {
      if (state.hover < 0) return;
      const p = M.pins[state.hover];
      selected = p;
      showCard(p, 'full');            // แสดงการ์ดเต็ม ไม่เลื่อนหน้าเว็บ
    });

    // ── สลับโหมด 2D/3D ──
    const btn = document.querySelector('#map-mode-toggle');
    if (btn) {
      btn.hidden = false;
      const setMode = (three) => {
        (host.closest('.map-paper') || host).classList.toggle('is-3d', three);   // คลาสต้องอยู่ที่ .map-paper ให้ตรงกับ CSS
        btn.setAttribute('aria-pressed', String(three));
        btn.textContent = three ? '🗺 แผนที่ 2D' : '🌐 แผนที่ 3D';
        const hint = document.querySelector('#map-hint-3d');
        if (hint) hint.hidden = !three;
        if (three) { canvas.style.display = 'block'; requestAnimationFrame(() => { resize(); start(); }); }
        else { stop(); if (!selected) { cardEl.hidden = true; cardEl.innerHTML = ''; } }
      };
      btn.addEventListener('click', () => { lowPower = lowPower && false; setMode(btn.getAttribute('aria-pressed') !== 'true'); });
      // หยุดวาดเมื่อเลื่อนออกจากส่วนแผนที่
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([e]) => {
          if (btn.getAttribute('aria-pressed') !== 'true') return;
          if (e.isIntersecting) start(); else stop();
        }, { threshold: 0.05 }).observe(host);
      }
      window.addEventListener('resize', () => { if (btn.getAttribute('aria-pressed') === 'true') resize(); });
    }

    host.appendChild(canvas);
    return {
      setFocus: (r) => { state.focus = r; if (state.visible && reduced) draw(0); },
      isOn: () => document.querySelector('#map-mode-toggle')?.getAttribute('aria-pressed') === 'true',
      start, stop,
    };
  })();

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
      const light = () => { svg.classList.add('focus-' + r); if (typeof stage3d !== 'undefined' && stage3d) stage3d.setFocus(r); };
      const unlight = () => { svg.classList.remove('focus-' + r); if (typeof stage3d !== 'undefined' && stage3d) stage3d.setFocus(null); };
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

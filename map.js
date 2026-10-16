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
    east:    { name: 'ภาคตะวันออก', color: '#9385b5' },
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
  const gBkkExplode = document.createElementNS(NS, 'g'); gBkkExplode.setAttribute('class', 'bkk-explode-layer'); gBkkExplode.style.display = 'none';
  const gPins = document.createElementNS(NS, 'g'); gPins.setAttribute('class', 'map-pins');
  const gChula = document.createElementNS(NS, 'g'); gChula.setAttribute('class', 'map-chula');
  const gZoom = document.createElementNS(NS, 'g'); gZoom.setAttribute('class', 'map-zoom');
  gZoom.append(gLand, gArcs, gBkkExplode, gPins, gChula);
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

  // ══ พิกัดกระจายหมุดใน กทม. (Bangkok Exploded Coordinates) ═════
  // สถาบันใน กทม. มี 50 แห่ง กระจุกกันในพื้นที่แคบ ~30px บนแผนที่ทั้งประเทศ
  // จำลองแรงผลัก (repulsion) เพื่อกระจายหมุดให้อยู่ห่างกันอย่างน้อย 20 หน่วย พร้อมเส้นโยง
  const BKK_EXPLODE_MAP = {
    "106 รามาธิบดี (Rama)": { ox: 310.1, oy: 669.5, ex: 288.9, ey: 679.3, dx: -21.2, dy: 9.8, short: "106 รามาธิบดี", group: "uni" },
    "107 วชิรพยาบาล (BM)": { ox: 308.4, oy: 668.3, ex: 280.7, ey: 643.3, dx: -27.7, dy: -25.0, short: "107 วชิรพยาบาล", group: "uni" },
    "108 ศิริราชพยาบาล (มหิดล)": { ox: 303.7, oy: 668.4, ex: 261.7, ey: 656.6, dx: -42.0, dy: -11.8, short: "108 ศิริราช", group: "uni" },
    "109 โรงพยาบาลราชวิถี": { ox: 311.1, oy: 670.0, ex: 310.5, ey: 639.3, dx: -0.6, dy: -30.7, short: "109 รพ.ราชวิถี", group: "general" },
    "110 พระมงกุฎเกล้า (PCM)": { ox: 310.7, oy: 669.5, ex: 297.3, ey: 653.5, dx: -13.4, dy: -16.0, short: "110 พระมงกุฎฯ", group: "uni" },
    "124 สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง": { ox: 335.2, oy: 673.4, ex: 407.5, ey: 680.9, dx: 72.3, dy: 7.5, short: "124 สจล.ลาดกระบัง", group: "uni" },
    "201 รพ.เจริญกรุงประชารักษ์": { ox: 307.1, oy: 677.0, ex: 279.2, ey: 709.3, dx: -27.9, dy: 32.3, short: "201 เจริญกรุงฯ", group: "general" },
    "203 รพ.ตำรวจ": { ox: 311.5, oy: 672.2, ex: 315.3, ey: 696.4, dx: 3.8, dy: 24.2, short: "203 รพ.ตำรวจ", group: "general" },
    "204 รพ.นพรัตนราชธานี": { ox: 314.8, oy: 668.8, ex: 326.6, ey: 653.6, dx: 11.8, dy: -15.2, short: "204 นพรัตนฯ", group: "general" },
    "205 รพ.เลิดสิน": { ox: 309.3, oy: 674.2, ex: 295.3, ey: 697.5, dx: -14.0, dy: 23.3, short: "205 รพ.เลิดสิน", group: "general" },
    "206 รพ.พระปิ่นเกล้า": { ox: 306.7, oy: 670.1, ex: 280.5, ey: 663.3, dx: -26.2, dy: -6.8, short: "206 พระปิ่นเกล้า", group: "general" },
    "207 รพ.สิรินธร": { ox: 327.8, oy: 674.6, ex: 380.6, ey: 686.6, dx: 52.8, dy: 12.0, short: "207 รพ.สิรินธร", group: "general" },
    "302 สถาบันจิตเวชศาสตร์สมเด็จเจ้าพระยา": { ox: 308.1, oy: 673.4, ex: 281.2, ey: 683.3, dx: -26.9, dy: 9.9, short: "302 สมเด็จเจ้าพระยา", group: "special" },
    "303 สถาบันประสาทวิทยา": { ox: 319.2, oy: 669.5, ex: 345.7, ey: 659.0, dx: 26.5, dy: -10.5, short: "303 สถาบันประสาทฯ", group: "special" },
    "304 รพ.ยุวประสาทไวทโยปถัมภ์": { ox: 317.0, oy: 687.0, ex: 333.6, ey: 740.1, dx: 16.6, dy: 53.1, short: "304 รพ.ยุวประสาทฯ", group: "special" },
    "305 สถาบันโรคทรวงอก": { ox: 309.7, oy: 660.2, ex: 301.2, ey: 620.4, dx: -8.5, dy: -39.8, short: "305 สถาบันโรคทรวงอก", group: "special" },
    "307 สถาบันสุขภาพเด็กแห่งชาติฯ (รพ.เด็ก)": { ox: 320.0, oy: 669.8, ex: 361.9, ey: 670.6, dx: 41.9, dy: 0.8, short: "307 สถาบันสุขภาพเด็ก", group: "special" },
    "309 คณะเวชศาสตร์เขตร้อน (มหิดล)": { ox: 317.3, oy: 676.2, ex: 349.7, ey: 691.3, dx: 32.4, dy: 15.1, short: "309 เวชศาสตร์เขตร้อน", group: "special" },
    "รพ.จุฬาภรณ์": { ox: 315.2, oy: 658.3, ex: 325.9, ey: 614.0, dx: 10.7, dy: -44.3, short: "รพ.จุฬาภรณ์", group: "special" },
    "รพ.ภูมิพลอดุลยเดช (BB)": { ox: 319.0, oy: 655.3, ex: 342.7, ey: 603.1, dx: 23.7, dy: -52.2, short: "รพ.ภูมิพลอดุลยเดช", group: "general" },
    "โรงพยาบาลบำรุงราษฎร์": { ox: 312.7, oy: 671.8, ex: 334.6, ey: 680.5, dx: 21.9, dy: 8.7, short: "รพ.บำรุงราษฎร์", group: "general" },
    "โรงพยาบาลสงฆ์": { ox: 316.6, oy: 676.6, ex: 333.3, ey: 702.9, dx: 16.7, dy: 26.3, short: "รพ.สงฆ์", group: "general" },
    "สถาบันกัลยาณ์ราชนครินทร์": { ox: 291.3, oy: 670.2, ex: 225.5, ey: 667.7, dx: -65.8, dy: -2.5, short: "สถาบันกัลยาณ์ฯ", group: "special" },
    "สถาบันพยาธิวิทยา": { ox: 304.7, oy: 676.3, ex: 265.1, ey: 695.1, dx: -39.6, dy: 18.8, short: "สถาบันพยาธิวิทยา", group: "special" },
    "สถาบันมะเร็งแห่งชาติ": { ox: 310.3, oy: 678.6, ex: 297.5, ey: 717.4, dx: -12.8, dy: 38.8, short: "สถาบันมะเร็งแห่งชาติ", group: "special" },
    "สถาบันโรคผิวหนัง": { ox: 311.1, oy: 678.8, ex: 317.3, ey: 714.9, dx: 6.2, dy: 36.1, short: "สถาบันโรคผิวหนัง", group: "special" }
  };

  // สร้างเส้นโยงและป้ายชื่อสำหรับโหมดกระจายผัง กทม.
  Object.entries(BKK_EXPLODE_MAP).forEach(([name, d]) => {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', d.ox); line.setAttribute('y1', d.oy);
    line.setAttribute('x2', d.ex); line.setAttribute('y2', d.ey);
    line.setAttribute('class', 'bkk-leader-line');

    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', d.ox); dot.setAttribute('cy', d.oy);
    dot.setAttribute('r', '1.8');
    dot.setAttribute('class', 'bkk-origin-dot');

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', (d.ex + (d.dx >= 0 ? 5.5 : -5.5)).toFixed(1));
    label.setAttribute('y', (d.ey + 2.5).toFixed(1));
    label.setAttribute('class', 'bkk-pin-label');
    label.setAttribute('text-anchor', d.dx >= 0 ? 'start' : 'end');
    label.textContent = d.short;

    gBkkExplode.append(line, dot, label);
  });

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

  const LABEL_NUDGE = {   // คำนวณจากรูปทรงจริง: ทุกป้ายต้องอยู่ในภาคของตัวเอง + ไม่ทับกัน
    north: [0, 0], south: [0, 0], isan: [0, 0],            // ค่าจากตัวสร้างอยู่ในภาคแล้ว
    central: [-3, -69],   // ขึ้นไปอยู่แถบภาคกลางเหนือกรุงเทพ (อยู่ในภาคจริง ห่างขอบ 9.5 หน่วย)
    bkk: [7, -4],         // กลางกรุงเทพพอดี (centroid ของภาค กทม.)
    east: [71, 36],       // ลงไปพื้นที่กว้างของภาคตะวันออก
  };
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

  // ไม่รวมหมุดเป็นวงแดงใหญ่พร้อมเลข 22 (ผู้ใช้ติว่าไม่สวยและบังหมุดสถาบันใน กทม.)
  // แสดงหมุดสถาบันทุกแห่งอย่างชัดเจน และจุดจุฬาฯ มีวง Chula-ring พิเศษอยู่แล้ว
  const HUB_HIT_PX = 0;
  const hubList = [];

  // ══════════════════════════════════════════════════════════════
  //  สถานะของ "ภาค" — ออกแบบใหม่ทั้งชุด
  //   • hover / focus  = "เพ่งดู"  → ภาคนั้นสว่างขึ้น หมุดเด่นชัด ป้ายสรุปตัวเลขจริงโผล่
  //                     และ "ไม่ขยับกล้อง" (เดิมยกแผ่นลอยขึ้นเฉย ๆ = ไม่สื่ออะไร)
  //   • คลิก            = "ยืนยัน" → กรองรายการสถาบันด้านล่าง + เลื่อนไปดู
  //   • ตัวกรองที่กดค้าง = ภาคนั้นติดสว่างต่อ ไม่ต้องเอาเมาส์ชี้
  // ══════════════════════════════════════════════════════════════
  const gStats = document.createElementNS(NS, 'g');
  gStats.setAttribute('class', 'map-stats');
  gPins.after(gStats);

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
    pl.g.addEventListener('click', (e) => {
      if (moved > 6) return;
      e.stopPropagation();
      toggleRegion(r);
      preview(null);
    });
    pl.g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRegion(r); }
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
    // จอสัมผัส: pan-y เสมอ เพื่อให้การปัดนิ้วเลื่อนหน้าเว็บไม่ติดขัด
    svg.style.touchAction = 'pan-y';
    // ป้ายชื่อภาค: ไม่ซ่อนตอนมุมมองปกติ (แก้ปัญหาป้ายภาคกลาง/กรุงเทพฯ หาย)
    // ซ่อนเฉพาะตอนที่ซูมลึกจริง ๆ (k > 1.25) และจุดยึดหลุดขอบจอ
    Object.values(plates).forEach(pl => {
      if (cam.k <= 1.25) {
        pl.wrap.classList.remove('off');
        return;
      }
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

  let bkkExploded = false;
  function setBkkExploded(on) {
    bkkExploded = !!on;
    const btn = document.getElementById('map-bkk-explode-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', bkkExploded ? 'true' : 'false');
      btn.classList.toggle('is-active', bkkExploded);
    }
    svg.classList.toggle('bkk-exploded', bkkExploded);
    if (gBkkExplode) gBkkExplode.style.display = bkkExploded ? 'block' : 'none';

    // ย้ายหมุดใน กทม. ออกไปตามตำแหน่งที่คำนวณไว้
    dots.forEach(rec => {
      if (rec.p.r !== 'bkk') return;
      const off = BKK_EXPLODE_MAP[rec.p.n];
      if (off) {
        rec.g.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
        rec.g.style.transform = bkkExploded ? `translate(${off.dx}px, ${off.dy}px)` : '';
      }
    });

    const expPanel = document.getElementById('map-bkk-explorer');
    if (expPanel) expPanel.hidden = !bkkExploded;

    if (bkkExploded) {
      cam.kT = 3.6;
      cam.txT = VB[2] / 2 - 312 * cam.kT;
      cam.tyT = VB[3] / 2 - 671 * cam.kT;
      clampCam(); kickCam();
    }
  }

  function zoomToRegion(r) {
    if (!r) { resetCam(); return; }
    if (r === 'bkk') {
      cam.kT = 3.6;
      cam.txT = VB[2] / 2 - 312 * cam.kT;
      cam.tyT = VB[3] / 2 - 671 * cam.kT;
      clampCam(); kickCam();
      return;
    }
    const pl = plates[r];
    if (!pl) return;
    const bb = pl.g.querySelector('.plate-face')?.getBBox?.();
    if (bb) {
      const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
      const fit = Math.min(VB[2] / bb.width, VB[3] / bb.height) * 0.72;
      cam.kT = Math.max(1.2, Math.min(3.6, fit));
      cam.txT = VB[2] / 2 - cx * cam.kT;
      cam.tyT = VB[3] / 2 - cy * cam.kT;
      clampCam(); kickCam();
    }
  }

  function toggleRegion(r) {
    const chip = document.querySelector(`.filter-btn[data-filter="region:${r}"]`);
    const isCurrentlyActive = chip && chip.getAttribute('aria-pressed') === 'true';
    if (chip) chip.click();

    if (!isCurrentlyActive) {
      // เพิ่งเลือกภาคนี้
      zoomToRegion(r);
      if (r === 'bkk') {
        setBkkExploded(true);
      } else if (bkkExploded) {
        setBkkExploded(false);
      }
    } else {
      // เพิ่งยกเลิกภาคนี้
      resetCam();
      if (bkkExploded) setBkkExploded(false);
    }
  }



  // ── ท่าทาง: ล้อเมาส์ · ลาก · หยิกสองนิ้ว · ดับเบิลคลิก · คีย์บอร์ด ──
  let dragging = false, lastX = 0, lastY = 0, moved = 0, pinchStart = 0, pinchK = 1, captured = false;
  let vx = 0, vy = 0, lastT = 0;                 // ความเร็วสำหรับแรงเหวี่ยง
  const pointers = new Map();
  const isTouch = (e) => e.pointerType === 'touch';

  // สองนิ้ว = เราจัดการเอง ห้ามเบราว์เซอร์เลื่อนหน้าไปด้วย (นิ้วเดียวยังเลื่อนหน้าได้ตามปกติ)
  const twoFinger = (e) => { if (e.touches.length > 1) e.preventDefault(); };
  svg.addEventListener('touchstart', twoFinger, { passive: false });
  svg.addEventListener('touchmove', twoFinger, { passive: false });

  // ป้องกัน scroll hijacking: ซูมด้วย wheel เฉพาะเมื่อกด Ctrl/Cmd เท่านั้น
  let hintTimer = null;
  const scrollHint = document.getElementById('map-scroll-hint');
  const showScrollHint = () => {
    if (!scrollHint) return;
    scrollHint.classList.add('visible');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => scrollHint.classList.remove('visible'), 1600);
  };

  svg.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const step = 0.007;
      zoomAt(Math.exp(-e.deltaY * step), e.clientX, e.clientY);
    } else {
      // ปล่อยให้หน้าเว็บเลื่อนตามปกติ และแสดงคำแนะนำสั้น ๆ
      showScrollHint();
    }
  }, { passive: false });

  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0; vx = 0; vy = 0; lastT = e.timeStamp;
    // หมายเหตุ: ห้าม setPointerCapture ตอนนี้ — ถ้าจับตั้งแต่กด คลิกจะไม่ถึงหมุด
    if (pointers.size === 1) {
      // บนจอสัมผัส (มือถือ): นิ้วเดียวปล่อยให้ scroll หน้าเว็บตามธรรมชาติ
      // แพน/ซูมในมือถือใช้ 2 นิ้ว pinch หรือกดปุ่ม zoom +/- ด้านขวา
      if (isTouch(e)) return;
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
    let px = p.x, py = p.y;
    if (bkkExploded && p.r === 'bkk') {
      const off = BKK_EXPLODE_MAP[p.n];
      if (off) { px += off.dx; py += off.dy; }
    }
    const k = Math.max(cam.kT, target);
    cam.kT = k;
    cam.txT = VB[2] / 2 - px * k;     // transform คือ translate * scale → จุด (px,py) อยู่ที่ px*k+tx
    cam.tyT = VB[3] / 2 - py * k;
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
      let rx = rec.p.x, ry = rec.p.y;
      if (bkkExploded && rec.p.r === 'bkk') {
        const off = BKK_EXPLODE_MAP[rec.p.n];
        if (off) { rx += off.dx; ry += off.dy; }
      }
      const d = Math.hypot(rx - wx, ry - wy) * unit;
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
      .map(d => {
        let rx = d.p.x, ry = d.p.y;
        if (bkkExploded && d.p.r === 'bkk') {
          const off = BKK_EXPLODE_MAP[d.p.n];
          if (off) { rx += off.dx; ry += off.dy; }
        }
        return { p: d.p, d: Math.hypot(rx - hit.wx, ry - hit.wy) * hit.unit };
      })
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
    let px = p.x, py = p.y;
    if (bkkExploded && p.r === 'bkk') {
      const off = BKK_EXPLODE_MAP[p.n];
      if (off) { px += off.dx; py += off.dy; }
    }
    const mx = (HOME_X + px) / 2, my = (HOME_Y + py) / 2;
    const dx = px - HOME_X, dy = py - HOME_Y, len = Math.hypot(dx, dy) || 1;
    const cx = mx - dy / len * len * 0.2, cy = my + dx / len * len * 0.2;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `M${HOME_X.toFixed(1)},${HOME_Y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`);
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

  // ══ legend + ระยะทาง (2-way คลิกภาคเชื่อมกับแผนที่) ══════════════
  const legend = document.getElementById('map-legend');
  if (legend) {
    Object.entries(REGION).forEach(([key, meta]) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-legend-row';
      btn.dataset.region = key;
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('role', 'button');
      btn.tabIndex = 0;
      btn.innerHTML = `<span class="legend-dot" style="background:${meta.color}"></span>${meta.name}`
        + `<span class="legend-count">${count(key)}</span>`;
      btn.addEventListener('click', () => toggleRegion(key));
      btn.addEventListener('pointerenter', () => preview(key));
      btn.addEventListener('pointerleave', () => preview(null));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleRegion(key);
        }
      });
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
  }

  const facts = document.querySelector('#map-facts');
  if (facts) {
    const dorm = M.pins.filter(p => p.d).length;
    const free = M.pins.filter(p => p.f).length;
    facts.innerHTML = [`${M.pins.length} สถาบัน`, `${Object.keys(REGION).length} ภาค`, `มีที่พัก ${dorm}`, `ที่พักฟรี ${free}`]
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

  // ══ FEATURE: Search-on-map ════════════════════════════════════
  // พิมพ์ชื่อสถาบัน → ผลลัพธ์ dropdown → คลิก → กล้องบินไปหาหมุด
  const searchInput = document.getElementById('map-search-input');
  const searchResults = document.getElementById('map-search-results');
  if (searchInput && searchResults) {
    let searchTimer = null;
    const pinataSearch = (q) => {
      const norm = q.trim().toLowerCase();
      if (!norm) { searchResults.hidden = true; searchResults.replaceChildren(); return; }
      const hits = M.pins.filter(p => p.n.toLowerCase().includes(norm)).slice(0, 8);
      if (!hits.length) { searchResults.hidden = true; searchResults.replaceChildren(); return; }
      searchResults.replaceChildren();
      hits.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'map-search-item';
        btn.innerHTML = `<span class="map-search-dot" style="background:${colorOf(p.r)}"></span>`
          + `<span class="map-search-name">${p.n}</span>`
          + `<span class="map-search-region">${REGION[p.r]?.name || ''}</span>`;
        btn.addEventListener('click', () => {
          searchInput.value = p.n;
          searchResults.hidden = true;
          const rec = dots.find(d => d.p === p);
          if (rec) openPin(rec, []);
        });
        searchResults.appendChild(btn);
      });
      searchResults.hidden = false;
    };
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => pinataSearch(searchInput.value), 120);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { searchResults.hidden = true; searchInput.blur(); }
      if (e.key === 'ArrowDown' && !searchResults.hidden) {
        e.preventDefault();
        searchResults.querySelector('.map-search-item')?.focus();
      }
    });
    searchResults.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { searchResults.hidden = true; searchInput.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); (e.target.nextElementSibling || searchResults.firstElementChild)?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (e.target.previousElementSibling || searchResults.lastElementChild)?.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) searchResults.hidden = true;
    });
  }

  // ══ FEATURE: Layer Toggle (ที่พัก) ═══════════════════════════
  // กรองหมุดแสดงเฉพาะสถาบันที่มี/ไม่มีที่พัก
  let activeLayer = null;  // null | 'dorm' | 'free'
  const applyLayer = () => {
    dots.forEach(rec => {
      if (!activeLayer) {
        rec.g.classList.remove('layer-dim');
      } else if (activeLayer === 'dorm') {
        rec.g.classList.toggle('layer-dim', !rec.p.d && !rec.cluster);
      } else if (activeLayer === 'free') {
        rec.g.classList.toggle('layer-dim', !rec.p.f && !rec.cluster);
      }
    });
    hubList.forEach(h => {
      if (!activeLayer) { h.g.classList.remove('layer-dim'); return; }
      const anyMatch = h.list.some(r => activeLayer === 'dorm' ? r.p.d : r.p.f);
      h.g.classList.toggle('layer-dim', !anyMatch);
    });
    document.querySelectorAll('.map-layer-btn').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.layer === activeLayer ? 'true' : 'false');
    });
  };
  document.querySelectorAll('.map-layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeLayer = btn.dataset.layer === activeLayer ? null : btn.dataset.layer;
      applyLayer();
    });
  });

  // ══ FEATURE: ใกล้บ้านฉัน (Province proximity) ════════════════
  // เลือกจังหวัดบ้านเกิด → highlight สถาบันที่อยู่ในภาคนั้น (พร้อมซูมไปที่ภาค)
  const PROV_REGION = {
    // ภาคเหนือ
    'เชียงใหม่':'north','เชียงราย':'north','ลำพูน':'north','ลำปาง':'north','แม่ฮ่องสอน':'north',
    'พะเยา':'north','แพร่':'north','น่าน':'north','อุตรดิตถ์':'north','ตาก':'north',
    'สุโขทัย':'north','พิษณุโลก':'north','พิจิตร':'north','กำแพงเพชร':'north','เพชรบูรณ์':'north',
    // ภาคกลาง
    'กรุงเทพมหานคร':'bkk','นนทบุรี':'bkk','ปทุมธานี':'bkk','สมุทรปราการ':'bkk',
    'อยุธยา':'central','สระบุรี':'central','ลพบุรี':'central','สิงห์บุรี':'central',
    'อ่างทอง':'central','ชัยนาท':'central','นครสวรรค์':'central','อุทัยธานี':'central',
    'สุพรรณบุรี':'central','นครปฐม':'central','สมุทรสาคร':'central','สมุทรสงคราม':'central',
    'ราชบุรี':'central','กาญจนบุรี':'central','เพชรบุรี':'central','ประจวบคีรีขันธ์':'central',
    // ภาคตะวันออก
    'ชลบุรี':'east','ระยอง':'east','จันทบุรี':'east','ตราด':'east','ฉะเชิงเทรา':'east',
    'ปราจีนบุรี':'east','สระแก้ว':'east','นครนายก':'east',
    // ภาคอีสาน
    'นครราชสีมา':'isan','ขอนแก่น':'isan','อุดรธานี':'isan','อุบลราชธานี':'isan',
    'สกลนคร':'isan','บึงกาฬ':'isan','หนองคาย':'isan','หนองบัวลำภู':'isan',
    'เลย':'isan','ชัยภูมิ':'isan','บุรีรัมย์':'isan','สุรินทร์':'isan',
    'ศรีสะเกษ':'isan','ร้อยเอ็ด':'isan','มหาสารคาม':'isan','กาฬสินธุ์':'isan',
    'มุกดาหาร':'isan','ยโสธร':'isan','อำนาจเจริญ':'isan','นครพนม':'isan',
    // ภาคใต้
    'สงขลา':'south','ภูเก็ต':'south','สุราษฎร์ธานี':'south','นครศรีธรรมราช':'south',
    'กระบี่':'south','ตรัง':'south','พัทลุง':'south','สตูล':'south',
    'ปัตตานี':'south','ยะลา':'south','นราธิวาส':'south','ชุมพร':'south',
    'ระนอง':'south','พังงา':'south',
  };
  const PROVINCES_BY_REGION = {};
  Object.entries(PROV_REGION).forEach(([p, r]) => { (PROVINCES_BY_REGION[r] = PROVINCES_BY_REGION[r] || []).push(p); });

  let homeRegion = null;
  const homeSelect = document.getElementById('map-home-prov');
  if (homeSelect) {
    Object.entries(REGION).forEach(([key, meta]) => {
      const group = document.createElement('optgroup');
      group.label = meta.name;
      (PROVINCES_BY_REGION[key] || []).sort().forEach(p => {
        const opt = document.createElement('option');
        opt.value = key + ':' + p;
        opt.textContent = p;
        group.appendChild(opt);
      });
      if (group.children.length) homeSelect.appendChild(group);
    });
    const applyHome = () => {
      dots.forEach(rec => {
        rec.g.classList.toggle('home-near', !!homeRegion && rec.p.r === homeRegion);
        rec.g.classList.toggle('home-far', !!homeRegion && rec.p.r !== homeRegion && !rec.cluster);
      });
      hubList.forEach(h => {
        h.g.classList.toggle('home-near', !!homeRegion && h.g.dataset.region === homeRegion);
        h.g.classList.toggle('home-far', !!homeRegion && h.g.dataset.region !== homeRegion);
      });
      Object.entries(plates).forEach(([r, pl]) => {
        pl.g.classList.toggle('home-lit', !!homeRegion && r === homeRegion);
        pl.g.classList.toggle('home-dim', !!homeRegion && r !== homeRegion);
      });
      // ซูมไปที่ภาคบ้านเกิด
      if (homeRegion && plates[homeRegion]) {
        const bb = plates[homeRegion].g.querySelector('.plate-face')?.getBBox?.();
        if (bb) {
          const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
          const fit = Math.min(VB[2] / bb.width, VB[3] / bb.height) * 0.65;
          cam.kT = Math.max(1.2, Math.min(3.5, fit));
          cam.txT = VB[2] / 2 - cx * cam.kT;
          cam.tyT = VB[3] / 2 - cy * cam.kT;
          clampCam(); kickCam();
        }
      } else if (!homeRegion) {
        resetCam();
      }
    };
    homeSelect.addEventListener('change', () => {
      const v = homeSelect.value;
      homeRegion = v ? v.split(':')[0] : null;
      applyHome();
    });
    const clearHomeBtn = document.getElementById('map-home-clear');
    if (clearHomeBtn) {
      clearHomeBtn.addEventListener('click', () => {
        homeSelect.value = '';
        homeRegion = null;
        applyHome();
      });
    }
  }

  // ══ FEATURE: Compare Mode ═════════════════════════════════════
  // กดปุ่ม Compare แล้วเลือก 2 สถาบัน → แสดง side-by-side ใน panel
  let compareMode = false;
  let compareList = [];   // max 2 pins
  const comparePanel = document.getElementById('map-compare-panel');
  const compareToggle = document.getElementById('map-compare-toggle');

  const renderCompare = () => {
    if (!comparePanel) return;
    if (!compareList.length) { comparePanel.hidden = true; return; }
    comparePanel.hidden = false;
    const cols = compareList.map(p => {
      const dv = driveOf(p);
      const km = Math.round(dv ? dv.km : kmOf(p));
      const badges = badgeOf(p).map(b => `<span>${b}</span>`).join('');
      return `<div class="cmp-col">
        <p class="cmp-region" style="color:${colorOf(p.r)}">${REGION[p.r]?.name || ''}</p>
        <h4 class="cmp-name">${p.n}</h4>
        <div class="cmp-badges">${badges}</div>
        <dl class="cmp-facts">
          <div><dt>ระยะทาง</dt><dd>${km} กม.${dv ? ` · ≈${dv.min} น.` : ' (เส้นตรง)'}</dd></div>
          <div><dt>ที่พัก</dt><dd>${p.d ? (p.f ? '✅ ฟรี' : '✅ มี') : '—'}</dd></div>
          <div><dt>ประเภท</dt><dd>${p.t.includes('university') ? 'มหาวิทยาลัย' : p.t.includes('hospital') ? 'รพ./ศูนย์' : 'สถาบัน'}</dd></div>
        </dl>
        <button type="button" class="cmp-remove" data-name="${p.n}">✕ ลบออก</button>
      </div>`;
    });
    if (compareList.length === 1) cols.push(`<div class="cmp-col cmp-empty"><p>เลือกสถาบันที่ 2 บนแผนที่</p></div>`);
    comparePanel.querySelector('.cmp-cols').innerHTML = cols.join('<div class="cmp-vs">VS</div>');
    comparePanel.querySelectorAll('.cmp-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        compareList = compareList.filter(p => p.n !== btn.dataset.name);
        dots.forEach(d => d.g.classList.toggle('cmp-selected', compareList.includes(d.p)));
        renderCompare();
      });
    });
  };

  if (compareToggle) {
    compareToggle.addEventListener('click', () => {
      compareMode = !compareMode;
      compareToggle.setAttribute('aria-pressed', compareMode ? 'true' : 'false');
      compareToggle.classList.toggle('is-active', compareMode);
      if (!compareMode) {
        compareList = [];
        dots.forEach(d => d.g.classList.remove('cmp-selected'));
        if (comparePanel) comparePanel.hidden = true;
      }
      host.classList.toggle('compare-mode', compareMode);
    });
  }

  // Hook เข้ากับ openPin เดิม: ถ้า compareMode → เพิ่มใน compareList แทนเปิด card
  const _origOpenPin = openPin;
  // ไม่ override openPin โดยตรง แต่ใช้ event delegation ผ่าน click listener ที่ svg
  // (เพราะ openPin ถูกเรียกจาก hit-test ใน svg click ด้านบน)
  // แทนที่จะ monkey-patch ให้เพิ่ม compare logic ก่อน openPin ถูกเรียกใน click handler
  svg.addEventListener('click', (e) => {
    if (!compareMode || moved > 6) return;
    const h = pickAt(e.clientX, e.clientY, false);
    if (!h || h.rec.cluster) return;
    e.stopImmediatePropagation();
    const p = h.rec.p;
    if (compareList.find(x => x === p)) return;  // ป้องกัน duplicate
    if (compareList.length >= 2) compareList.shift();
    compareList.push(p);
    dots.forEach(d => d.g.classList.toggle('cmp-selected', compareList.includes(d.p)));
    renderCompare();
  }, true);   // capture: true → ทำงานก่อน listener อื่น

  // ══ FEATURE: Bangkok Explorer List ════════════════════════════
  const expPanel = document.getElementById('map-bkk-explorer');
  const expList = document.getElementById('map-bkk-exp-list');
  const expClose = document.getElementById('map-bkk-exp-close');
  const bkkToggle = document.getElementById('map-bkk-explode-toggle');

  if (bkkToggle) {
    bkkToggle.addEventListener('click', () => setBkkExploded(!bkkExploded));
  }
  if (expClose) {
    expClose.addEventListener('click', () => setBkkExploded(false));
  }

  if (expPanel && expList) {
    let currentExpGroup = 'all';
    const bkkAllPins = M.pins.filter(p => p.r === 'bkk');

    const renderBkkList = () => {
      expList.replaceChildren();
      const filtered = bkkAllPins.filter(p => {
        if (currentExpGroup === 'all') return true;
        if (p.t.includes('chula')) return currentExpGroup === 'chula';
        const grp = BKK_EXPLODE_MAP[p.n]?.group || 'general';
        return grp === currentExpGroup;
      });

      filtered.forEach(p => {
        const isChula = p.t.includes('chula');
        const grp = isChula ? 'chula' : (BKK_EXPLODE_MAP[p.n]?.group || 'general');
        const tagMap = { chula: 'จุฬาฯ', uni: 'มหาลัย', general: 'ทั่วไป', special: 'เฉพาะทาง' };

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'bkk-exp-item' + (isChula ? ' is-chula' : '');
        item.innerHTML = `<span class="bkk-item-name">${p.n}</span>`
          + `<span class="bkk-item-tag">${tagMap[grp] || ''}</span>`;

        item.addEventListener('click', () => {
          if (isChula) {
            openCampus(chulaPins);
          } else {
            const rec = dots.find(d => d.p === p);
            if (rec) openPin(rec, []);
          }
        });
        expList.appendChild(item);
      });
    };

    expPanel.querySelectorAll('.bkk-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        expPanel.querySelectorAll('.bkk-tab').forEach(t => t.classList.toggle('is-active', t === tab));
        currentExpGroup = tab.dataset.group;
        renderBkkList();
      });
    });

    renderBkkList();
  }

  // ══ Zoom controls buttons (+ / − / ⟲) ════════════════════════
  const btnZoomIn = document.getElementById('map-zoom-in');
  const btnZoomOut = document.getElementById('map-zoom-out');
  const btnZoomReset = document.getElementById('map-zoom-reset');
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = svg.getBoundingClientRect();
      zoomAt(1.4, r.left + r.width / 2, r.top + r.height / 2);
    });
  }
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = svg.getBoundingClientRect();
      zoomAt(1 / 1.4, r.left + r.width / 2, r.top + r.height / 2);
    });
  }
  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', (e) => {
      e.stopPropagation();
      resetCam();
    });
  }

  window.__MAP = { cam, zoomAt, resetCam, dots, focusPin, closeCard, openCampus, compareList, setBkkExploded, toggleRegion };
})();


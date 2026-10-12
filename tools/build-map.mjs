#!/usr/bin/env node
/**
 * สร้าง map-data.js (เส้นขอบจังหวัด + เส้นขอบภาค + พิกัดสถาบัน) สำหรับแผนที่ในหน้าเว็บ
 *
 * วิธีใช้:  node tools/build-map.mjs
 * ต้องมี:   tools/map-geocode.json  (แคชพิกัดจาก OpenStreetMap/Nominatim — commit ไว้ในรีโป)
 * ดึงข้อมูลเส้นขอบจังหวัดจาก GitHub ครั้งเดียวตอนรัน (ต้องต่อเน็ต)
 *
 * หมายเหตุ: ไฟล์ผลลัพธ์ map-data.js ถูก commit ไว้แล้ว เว็บใช้ไฟล์นั้นตรง ๆ
 *           สคริปต์นี้รันใหม่เฉพาะเมื่อรายชื่อสถาบันเปลี่ยน (เช่น หลังซิงก์ข้อมูล)
 */
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
import fs from 'node:fs';
import path from 'node:path';

const CAMPUS = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'chula-campus.json'), 'utf8'));

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, 'tools', 'map-geocode.json');
const OUT = path.join(ROOT, 'map-data.js');
const SRC_URL = 'https://raw.githubusercontent.com/apisit/thailand.json/master/thailand.json';

// ── การฉายแผนที่ (เหมือนกับฝั่ง Python ที่ใช้ทดลอง) ──────────────────────────
const LON0 = 97.343, LAT0 = 20.464;
const COS = Math.cos((13 * Math.PI) / 180);
const SCALE = 100;
const project = (lon, lat) => [ (lon - LON0) * COS * SCALE, (LAT0 - lat) * SCALE ];

// ── ย่อเส้น (Douglas-Peucker) ───────────────────────────────────────────────
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [p1, p2] = [pts[0], pts[pts.length - 1]];
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const den = Math.hypot(dx, dy);
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = den ? Math.abs(dy * px - dx * py + p2[0] * p1[1] - p2[1] * p1[0]) / den
                  : Math.hypot(px - p1[0], py - p1[1]);
    if (d > dmax) { dmax = d; idx = i; }
  }
  return dmax > eps ? [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)] : [p1, p2];
}

// ── ช่วยเหลือเชิงเรขาคณิต (พิกัดลอน/แลต) ────────────────────────────────────
const bboxOf = (ring) => ring.reduce((b, [x, y]) => ({
  x0: Math.min(b.x0, x), x1: Math.max(b.x1, x),
  y0: Math.min(b.y0, y), y1: Math.max(b.y1, y),
}), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

const inRing = (lon, lat, ring) => {                       // ray casting
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

async function main() {
  console.log('ดึงเส้นขอบจังหวัด…');
  const geo = await (await fetch(SRC_URL)).json();

  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const entries = Object.values(cache).filter(v => v.lat != null && v.lon != null);

  // ── 1) จัดจังหวัดเข้าภาค โดยดูว่าหมุดสถาบันตกอยู่ในจังหวัดไหน (เสียงส่วนมาก) ──
  const prov = [];                       // { name, rings, bbox, region }
  for (const f of geo.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const rings = polys.map(p => p[0]);                 // ใช้เส้นรอบนอก
    const all = rings.flat();
    prov.push({ name: f.properties.name, rings, bbox: bboxOf(all), region: null, votes: {} });
  }
  for (const v of entries) {
    const hit = prov.find(p => v.lon >= p.bbox.x0 && v.lon <= p.bbox.x1 && v.lat >= p.bbox.y0 && v.lat <= p.bbox.y1
      && p.rings.some(r => inRing(v.lon, v.lat, r)));
    if (!hit) continue;
    hit.votes[v.region] = (hit.votes[v.region] || 0) + 1;
  }
  for (const p of prov) {
    const best = Object.entries(p.votes).sort((a, b) => b[1] - a[1])[0];
    if (best) p.region = best[0];
  }
  // จังหวัดที่ไม่มีหมุดเลย → ใช้ภาคของจังหวัดที่ใกล้ที่สุด (เทียบจุดกลาง)
  const centre = (p) => [(p.bbox.x0 + p.bbox.x1) / 2, (p.bbox.y0 + p.bbox.y1) / 2];
  for (const p of prov) {
    if (p.region) continue;
    const [cx, cy] = centre(p);
    let best = null, bestD = Infinity;
    for (const q of prov) {
      if (!q.region) continue;
      const [qx, qy] = centre(q);
      const d = Math.hypot(cx - qx, cy - qy) * (q.region === 'bkk' ? 1.6 : 1);  // กทม. เล็ก ไม่ควรดูดจังหวัดไกล
      if (d < bestD) { bestD = d; best = q; }
    }
    p.region = best ? best.region : 'central';
  }
  const tally = {};
  prov.forEach(p => { tally[p.region] = (tally[p.region] || 0) + 1; });
  console.log('  จังหวัดต่อภาค:', JSON.stringify(tally));

  // ── 2) สร้างเส้นขอบจังหวัด (รวม) + เส้นขอบภาค (แยก) ─────────────────────────
  const EPS = 2.6;               // หน่วยบนแผนที่ (~3 กม.)
  const parts = [];
  const regionParts = {};
  const regionBox = {};
  let raw = 0, kept = 0;
  for (const p of prov) {
    const out = [];
    for (const ring of p.rings) {
      raw += ring.length;
      const s = rdp(ring.map(c => project(c[0], c[1])), EPS);
      kept += s.length;
      if (s.length < 3) continue;
      out.push('M' + s.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + 'Z');
      const b = regionBox[p.region] = regionBox[p.region] || { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      for (const [x, y] of s) {
        b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
        b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
      }
    }
    const d = out.join(' ');
    parts.push(d);
    (regionParts[p.region] = regionParts[p.region] || []).push(d);
  }
  console.log(`  จุด ${raw} → ${kept} (${(kept / raw * 100).toFixed(1)}%)`);

  // ── 3) พิกัดสถาบัน ─────────────────────────────────────────────────────────
  const pins = [];
  const seen = new Map();       // จุดซ้ำ (ภาควิชาในคณะฯ) → กระจายเป็นวง
  const stray = new Set();
  for (const v of entries) {
    let [x, y] = project(v.lon, v.lat);
    const k = `${x.toFixed(0)},${y.toFixed(0)}`;
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    if (n > 0) {                                   // วนกระจายรอบจุดเดิมแบบคงที่
      const ring = Math.floor((n - 1) / 8) + 1;
      const ang = ((n - 1) % 8) / 8 * Math.PI * 2;
      x += Math.cos(ang) * 9 * ring;
      y += Math.sin(ang) * 9 * ring;
    }
    // ตรวจว่าหมุดตกอยู่ในภาคที่ตัวเองอ้างไหม — ถ้าไม่ ให้จดไว้เตือน
    const hit = prov.find(p => v.lon >= p.bbox.x0 && v.lon <= p.bbox.x1 && v.lat >= p.bbox.y0 && v.lat <= p.bbox.y1
      && p.rings.some(r => inRing(v.lon, v.lat, r)));
    if (n === 0) {
      if (hit && hit.region !== v.region) stray.add(`${v.title} (บอก ${v.region} · จริง ${hit.region})`);
      if (!hit) stray.add(`${v.title} (ตกนอกประเทศ?)`);
    }
    pins.push({
      n: clean(v.title), r: v.region, x: +x.toFixed(1), y: +y.toFixed(1),
      t: v.tags || '',
      // a: 1 = พิกัดจริง (รวมภาควิชาจุฬาฯ ที่ใช้พิกัดคณะฯ) · 0 = ตำแหน่งโดยประมาณ (ระดับจังหวัด/ภาค)
      a: ['province-centroid', 'approximate'].includes(v.src) ? 0 : 1,
      // ที่พักฟรีนับเป็นมีที่พักด้วย (ให้ตรงกับตัวกรอง «มีที่พัก» = 24)
      d: (v.dorm || v.free) ? 1 : 0, f: v.free ? 1 : 0,
    });
  }
  pins.sort((a, b) => a.r.localeCompare(b.r) || a.n.localeCompare(b.n, 'th'));

  // ── 4) ป้ายชื่อภาค: จุดกลางของหมุดในภาคนั้น ────────────────────────────────
  const labels = {};
  for (const r of Object.keys(regionParts)) {
    const list = pins.filter(p => p.r === r);
    const xs = list.map(p => p.x), ys = list.map(p => p.y);
    labels[r] = list.length
      ? [+(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1), +(ys.reduce((a, b) => a + b, 0) / ys.length).toFixed(1)]
      : [+((regionBox[r].x0 + regionBox[r].x1) / 2).toFixed(1), +((regionBox[r].y0 + regionBox[r].y1) / 2).toFixed(1)];
  }

  const vb = `0 0 ${((105.63 - LON0) * COS * SCALE).toFixed(0)} ${((LAT0 - 5.63) * SCALE).toFixed(0)}`;
  const js = `/* สร้างโดย tools/build-map.mjs — อย่าแก้ด้วยมือ
   ข้อมูล: เส้นขอบจังหวัดจาก apisit/thailand.json · พิกัดจาก OpenStreetMap (Nominatim) */
window.ELECTIVE_MAP = {
  viewBox: '${vb}',
  paths: '${parts.join(' ')}',
  regionPaths: ${JSON.stringify(Object.fromEntries(Object.entries(regionParts).map(([r, ds]) => [r, ds.join(' ')])))},
  regionLabels: ${JSON.stringify(labels)},
  pins: ${JSON.stringify(pins)},
  chula: ${JSON.stringify(CAMPUS)},
};
`;
  fs.writeFileSync(OUT, js);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  const approx = pins.filter(p => p.a === 0).length;
  console.log(`เขียน ${path.relative(ROOT, OUT)} — ${pins.length} จุด (โดยประมาณ ${approx}) · ${kb} KB`);
  if (stray.size) {
    console.log(`\n⚠️ หมุดที่ภาคไม่ตรงกับจังหวัดที่ตกอยู่ (${stray.size}):`);
    [...stray].sort().forEach(s => console.log('  ·', s));
  }
}

main().catch(e => { console.error('ล้มเหลว:', e.message); process.exit(1); });

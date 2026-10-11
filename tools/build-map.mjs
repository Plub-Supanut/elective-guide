#!/usr/bin/env node
/**
 * สร้าง map-data.js (เส้นขอบจังหวัด + พิกัดสถาบัน) สำหรับแผนที่ในหน้าเว็บ
 *
 * วิธีใช้:  node tools/build-map.mjs
 * ต้องมี:   tools/map-geocode.json  (แคชพิกัดจาก OpenStreetMap/Nominatim — commit ไว้ในรีโป)
 * ดึงข้อมูลเส้นขอบจังหวัดจาก GitHub ครั้งเดียวตอนรัน (ต้องต่อเน็ต)
 *
 * หมายเหตุ: ไฟล์ผลลัพธ์ map-data.js ถูก commit ไว้แล้ว เว็บใช้ไฟล์นั้นตรง ๆ
 *           สคริปต์นี้รันใหม่เฉพาะเมื่อรายชื่อสถาบันเปลี่ยน (เช่น หลังซิงก์ข้อมูล)
 */
import fs from 'node:fs';
import path from 'node:path';

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

async function main() {
  console.log('ดึงเส้นขอบจังหวัด…');
  const geo = await (await fetch(SRC_URL)).json();

  const EPS = 2.6;               // หน่วยบนแผนที่ (~3 กม.)
  const parts = [];
  let raw = 0, kept = 0;
  for (const f of geo.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const ring of poly) {
      raw += ring.length;
      const s = rdp(ring.map(c => project(c[0], c[1])), EPS);
      kept += s.length;
      if (s.length < 3) continue;
      parts.push('M' + s.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + 'Z');
    }
  }
  console.log(`  จุด ${raw} → ${kept} (${(kept / raw * 100).toFixed(1)}%)`);

  // ── พิกัดสถาบัน ─────────────────────────────────────────────────────────
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const pins = [];
  const seen = new Map();       // จุดซ้ำ (ภาควิชาในคณะฯ) → กระจายเป็นวง
  for (const v of Object.values(cache)) {
    if (v.lat == null || v.lon == null) continue;
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
    pins.push({
      n: v.title, r: v.region, x: +x.toFixed(1), y: +y.toFixed(1),
      t: v.tags || '',
      // a: 1 = พิกัดจริง (รวมภาควิชาจุฬาฯ ที่ใช้พิกัดคณะฯ) · 0 = ตำแหน่งโดยประมาณ (ระดับจังหวัด/ภาค)
      a: ['province-centroid', 'approximate'].includes(v.src) ? 0 : 1,
      // ที่พักฟรีนับเป็นมีที่พักด้วย (ให้ตรงกับตัวกรอง «มีที่พัก» = 24)
      d: (v.dorm || v.free) ? 1 : 0, f: v.free ? 1 : 0,
    });
  }
  pins.sort((a, b) => a.r.localeCompare(b.r) || a.n.localeCompare(b.n, 'th'));

  const vb = `0 0 ${((105.63 - LON0) * COS * SCALE).toFixed(0)} ${((LAT0 - 5.63) * SCALE).toFixed(0)}`;
  const js = `/* สร้างโดย tools/build-map.mjs — อย่าแก้ด้วยมือ
   ข้อมูล: เส้นขอบจังหวัดจาก apisit/thailand.json · พิกัดจาก OpenStreetMap (Nominatim) */
window.ELECTIVE_MAP = {
  viewBox: '${vb}',
  paths: '${parts.join('')}',
  pins: ${JSON.stringify(pins)},
};
`;
  fs.writeFileSync(OUT, js);
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  const approx = pins.filter(p => p.a === 0).length;
  console.log(`เขียน ${path.relative(ROOT, OUT)} — ${pins.length} จุด (โดยประมาณ ${approx}) · ${kb} KB`);
}

main().catch(e => { console.error('ล้มเหลว:', e.message); process.exit(1); });

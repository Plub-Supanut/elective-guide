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

// ชื่อจังหวัดในข้อมูลต้นทางเป็นอังกฤษ → แปลงเป็นไทย (ใช้แสดงในตัวเลือกจังหวัด)
const TH_NAME = {
  'Amnat Charoen': 'อำนาจเจริญ', 'Ang Thong': 'อ่างทอง', 'Bangkok Metropolis': 'กรุงเทพมหานคร',
  'Bueng Kan': 'บึงกาฬ', 'Buri Ram': 'บุรีรัมย์', 'Chachoengsao': 'ฉะเชิงเทรา', 'Chai Nat': 'ชัยนาท',
  'Chaiyaphum': 'ชัยภูมิ', 'Chanthaburi': 'จันทบุรี', 'Chiang Mai': 'เชียงใหม่', 'Chiang Rai': 'เชียงราย',
  'Chon Buri': 'ชลบุรี', 'Chumphon': 'ชุมพร', 'Kalasin': 'กาฬสินธุ์', 'Kamphaeng Phet': 'กำแพงเพชร',
  'Kanchanaburi': 'กาญจนบุรี', 'Khon Kaen': 'ขอนแก่น', 'Krabi': 'กระบี่', 'Lampang': 'ลำปาง',
  'Lamphun': 'ลำพูน', 'Loei': 'เลย', 'Lop Buri': 'ลพบุรี', 'Mae Hong Son': 'แม่ฮ่องสอน',
  'Maha Sarakham': 'มหาสารคาม', 'Mukdahan': 'มุกดาหาร', 'Nakhon Nayok': 'นครนายก',
  'Nakhon Pathom': 'นครปฐม', 'Nakhon Phanom': 'นครพนม', 'Nakhon Ratchasima': 'นครราชสีมา',
  'Nakhon Sawan': 'นครสวรรค์', 'Nakhon Si Thammarat': 'นครศรีธรรมราช', 'Nan': 'น่าน',
  'Narathiwat': 'นราธิวาส', 'Nong Bua Lam Phu': 'หนองบัวลำภู', 'Nong Khai': 'หนองคาย',
  'Nonthaburi': 'นนทบุรี', 'Pathum Thani': 'ปทุมธานี', 'Pattani': 'ปัตตานี', 'Phangnga': 'พังงา',
  'Phatthalung': 'พัทลุง', 'Phayao': 'พะเยา', 'Phetchabun': 'เพชรบูรณ์', 'Phetchaburi': 'เพชรบุรี',
  'Phichit': 'พิจิตร', 'Phitsanulok': 'พิษณุโลก', 'Phra Nakhon Si Ayutthaya': 'พระนครศรีอยุธยา',
  'Phrae': 'แพร่', 'Phuket': 'ภูเก็ต', 'Prachin Buri': 'ปราจีนบุรี',
  'Prachuap Khiri Khan': 'ประจวบคีรีขันธ์', 'Ranong': 'ระนอง', 'Ratchaburi': 'ราชบุรี',
  'Rayong': 'ระยอง', 'Roi Et': 'ร้อยเอ็ด', 'Sa Kaeo': 'สระแก้ว', 'Sakon Nakhon': 'สกลนคร',
  'Samut Prakan': 'สมุทรปราการ', 'Samut Sakhon': 'สมุทรสาคร', 'Samut Songkhram': 'สมุทรสงคราม',
  'Saraburi': 'สระบุรี', 'Satun': 'สตูล', 'Si Sa Ket': 'ศรีสะเกษ', 'Sing Buri': 'สิงห์บุรี',
  'Songkhla': 'สงขลา', 'Sukhothai': 'สุโขทัย', 'Suphan Buri': 'สุพรรณบุรี',
  'Surat Thani': 'สุราษฎร์ธานี', 'Surin': 'สุรินทร์', 'Tak': 'ตาก', 'Trang': 'ตรัง', 'Trat': 'ตราด',
  'Ubon Ratchathani': 'อุบลราชธานี', 'Udon Thani': 'อุดรธานี', 'Uthai Thani': 'อุทัยธานี',
  'Uttaradit': 'อุตรดิตถ์', 'Yala': 'ยะลา', 'Yasothon': 'ยโสธร',
};

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
  // ── แก้ไขภาคจังหวัดที่อัลกอริทึมโหวต/สืบทอดให้ผิดอย่างชัดเจน (QA 18 ต.ค. 2026) ──
  // 6 จังหวัดนี้ผลจากเสียงโหวต/การสืบทอดเดิมย้อมผิดภาค (เช่น สมุทรปราการเสมอ 1:1 แล้วชนะเป็น bkk,
  // เลยไม่มีหมุดแล้วสืบทอดจากอุตรดิตถ์, เพชรบูรณ์สืบทอดจากชัยภูมิ, สุพรรณบุรีมีหมุด 501 ใส่ภาคผิด,
  // ชัยนาท/กาญจนบุรีได้ north จาก cascade) จึงกำหนดภาคแบบตายตัวแทน — จังหวัดอื่นยังใช้โหวต+สืบทอดเหมือนเดิม
  const REGION_FIX = {
    'Samut Prakan': 'central',   // เดิม bkk (หมุดในจังหวัดเสมอ 1:1 bkk/central)
    'Loei': 'isan',              // เดิม north (สืบทอดจากอุตรดิตถ์) — เลยคือภาคอีสาน
    'Phetchabun': 'central',     // เดิม isan (สืบทอดจากชัยภูมิ) — เพชรบูรณ์ไม่ใช่ภาคอีสาน
    'Suphan Buri': 'central',    // เดิม north (หมุด 501 ถูกใส่ภาคผิด)
    'Chai Nat': 'central',       // เดิม north (cascade: อุทัยธานี ← นครสวรรค์)
    'Kanchanaburi': 'central',   // เดิม north (cascade: สุพรรณบุรี)
  };
  for (const p of prov) if (REGION_FIX[p.name]) p.region = REGION_FIX[p.name];
  const tally = {};
  prov.forEach(p => { tally[p.region] = (tally[p.region] || 0) + 1; });
  console.log('  จังหวัดต่อภาค:', JSON.stringify(tally));

  // ── 2) สร้างเส้นขอบจังหวัด (รวม) + เส้นขอบภาค (แยก) + เส้นขอบจังหวัดรายจังหวัด ──
  const EPS = 2.6;               // หน่วยบนแผนที่ (~3 กม.)
  const EPS_PROV = 4.2;          // เส้นจังหวัดรายจังหวัดใช้หยาบกว่า เพื่อไม่ให้ไฟล์ใหญ่
  const parts = [];
  const regionParts = {};
  const regionBox = {};
  const provList = [];           // { n: ไทย, r, d: path, bb: [x0,y0,x1,y1] }
  let raw = 0, kept = 0;
  for (const p of prov) {
    const out = [];
    const outProv = [];
    const bb = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const ring of p.rings) {
      raw += ring.length;
      const proj = ring.map(c => project(c[0], c[1]));
      const s = rdp(proj, p.region === 'bkk' ? 0.35 : EPS);
      kept += s.length;
      if (s.length < 3) continue;
      out.push('M' + s.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + 'Z');
      const sp = rdp(proj, p.region === 'bkk' ? 0.35 : EPS_PROV);
      if (sp.length >= 3) outProv.push('M' + sp.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + 'Z');
      const b = regionBox[p.region] = regionBox[p.region] || { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      for (const [x, y] of s) {
        b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
        b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
        bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x);
        bb.y0 = Math.min(bb.y0, y); bb.y1 = Math.max(bb.y1, y);
      }
    }
    const d = out.join(' ');
    parts.push(d);
    (regionParts[p.region] = regionParts[p.region] || []).push(d);
    if (outProv.length) {
      provList.push({
        n: TH_NAME[p.name] || p.name,
        r: p.region,
        d: outProv.join(' '),
        bb: [+bb.x0.toFixed(1), +bb.y0.toFixed(1), +bb.x1.toFixed(1), +bb.y1.toFixed(1)],
      });
    }
  }
  provList.sort((a, b) => a.n.localeCompare(b.n, 'th'));
  console.log(`  จุด ${raw} → ${kept} (${(kept / raw * 100).toFixed(1)}%)`);

  // ── 3) พิกัดสถาบัน (พิกัดจริงตาม ละติจูด/ลองจิจูด ไม่เลื่อนตำแหน่ง) ───────────
  const pins = [];
  const stray = new Set();
  for (const v of entries) {
    const [x, y] = project(v.lon, v.lat);
    // ตรวจว่าหมุดตกอยู่ในภาคที่ตัวเองอ้างไหม — ถ้าไม่ ให้จดไว้เตือน
    const hit = prov.find(p => v.lon >= p.bbox.x0 && v.lon <= p.bbox.x1 && v.lat >= p.bbox.y0 && v.lat <= p.bbox.y1
      && p.rings.some(r => inRing(v.lon, v.lat, r)));
    if (hit && hit.region !== v.region) stray.add(`${v.title} (บอก ${v.region} · จริง ${hit.region})`);
    if (!hit) stray.add(`${v.title} (ตกนอกประเทศ?)`);
    pins.push({
      n: clean(v.title), r: v.region, x: +x.toFixed(1), y: +y.toFixed(1),
      t: v.tags || '',
      // a: 1 = พิกัดจริง (รวมภาควิชาจุฬาฯ ที่ใช้พิกัดคณะฯ) · 0 = ตำแหน่งโดยประมาณ (ระดับจังหวัด/ภาค)
      a: ['province-centroid', 'approximate'].includes(v.src) ? 0 : 1,
      // ที่พักฟรีนับเป็นมีที่พักด้วย (ให้ตรงกับตัวกรอง «มีที่พัก» = 24)
      d: (v.dorm || v.free) ? 1 : 0, f: v.free ? 1 : 0,
      // จังหวัดที่หมุดตกอยู่ (ชื่อไทย) — ใช้กับตัวเลือก «อยู่จังหวัดไหน»
      pv: hit ? (TH_NAME[hit.name] || hit.name) : '',
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
  prov: ${JSON.stringify(provList)},
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

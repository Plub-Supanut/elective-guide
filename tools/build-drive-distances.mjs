/* ─────────────────────────────────────────────────────────────
   tools/build-drive-distances.mjs
   ดึง "ระยะทางขับรถ" จากคณะแพทยศาสตร์ จุฬาฯ ไปยังทุกสถาบัน
   แล้วเขียนผลลัพธ์เป็น map-drive.js (เว็บ static ไม่ต้องเรียก API ตอนรัน)

   ผู้ให้บริการ (เลือกอัตโนมัติ):
     1) Google Maps Distance Matrix — ใช้เมื่อมี env GOOGLE_MAPS_API_KEY
        (ต้องเปิด billing + Distance Matrix API ในโปรเจกต์ Google Cloud)
     2) OSRM (OpenStreetMap) — ฟรี ไม่ต้องใช้คีย์ ใช้โครงข่ายถนนจริง โปรไฟล์ driving
        ใช้เมื่อไม่มีคีย์ของ Google

   รัน:  node tools/build-drive-distances.mjs
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEO = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/map-geocode.json'), 'utf8'));

// จุดกำเนิด = คณะแพทยศาสตร์ จุฬาฯ (ตรงกับ HOME_X/HOME_Y ใน map.js)
const ORIGIN = { lat: 13.7383, lon: 100.5346 };

// โครงสร้างเดียวกับ map.js เพื่อถอด lat/lon จากพิกัด SVG เมื่อไม่มีใน geocode
const LON0 = 97.343, LAT0 = 20.464, COS = Math.cos((13 * Math.PI) / 180);
const unproj = (x, y) => [LAT0 - y / 100, x / (100 * COS) + LON0];

const sandbox = { window: {} };
const src = fs.readFileSync(path.join(ROOT, 'map-data.js'), 'utf8');
new Function('window', src)(sandbox.window);
const M = sandbox.window.ELECTIVE_MAP;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── ชุดพิกัดปลายทาง ─────────────────────────────────────────
const targets = M.pins.map((p) => {
  const g = GEO[p.n];
  let lat, lon, src2;
  if (g && typeof g.lat === 'number') { lat = g.lat; lon = g.lon; src2 = 'geocode'; }
  else { [lat, lon] = unproj(p.x, p.y); src2 = 'projected'; }
  return { n: p.n, lat, lon, src: src2 };
});
console.log(`ปลายทาง ${targets.length} แห่ง (geocode ${targets.filter(t => t.src === 'geocode').length} · ประมาณจากพิกัดแผนที่ ${targets.filter(t => t.src === 'projected').length})`);

const out = { provider: null, generated: new Date().toISOString(), origin: ORIGIN, mode: 'driving', byName: {} };

// ── ผู้ให้บริการ 1: Google Distance Matrix ──────────────────
async function viaGoogle(key) {
  const CHUNK = 25;                     // 25 ปลายทาง/คำขอ (จำกัด 100 elements)
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${ORIGIN.lat},${ORIGIN.lon}`);
    url.searchParams.set('destinations', chunk.map((t) => `${t.lat},${t.lon}`).join('|'));
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('departure_time', 'now');   // ให้ได้เวลาที่คิดการจราจร
    url.searchParams.set('language', 'th');
    url.searchParams.set('key', key);
    const res = await fetch(url);
    const j = await res.json();
    if (j.status !== 'OK') throw new Error(`Google: ${j.status} ${j.error_message || ''}`);
    const els = j.rows[0].elements;
    els.forEach((e, k) => {
      if (e.status !== 'OK') { console.warn('  ข้าม', chunk[k].n, e.status); return; }
      out.byName[chunk[k].n] = {
        km: +(e.distance.value / 1000).toFixed(1),
        min: Math.round((e.duration_in_traffic ? e.duration_in_traffic.value : e.duration.value) / 60),
      };
    });
    console.log(`  Google ${Math.min(i + CHUNK, targets.length)}/${targets.length}`);
    await sleep(250);
  }
  out.provider = 'google';
}

// ── ผู้ให้บริการ 2: OSRM (ไม่ต้องใช้คีย์) ────────────────────
async function viaOSRM() {
  const CHUNK = 80;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const coords = [`${ORIGIN.lon},${ORIGIN.lat}`, ...chunk.map((t) => `${t.lon},${t.lat}`)].join(';');
    const dests = chunk.map((_, k) => k + 1).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${dests}&annotations=distance,duration`;
    const j = await (await fetch(url)).json();
    if (j.code !== 'Ok') throw new Error(`OSRM: ${j.code} ${j.message || ''}`);
    const dist = j.distances[0], dur = j.durations[0];
    chunk.forEach((t, k) => {
      if (dist[k] == null) { console.warn('  หาเส้นทางไม่ได้:', t.n); return; }
      out.byName[t.n] = { km: +(dist[k] / 1000).toFixed(1), min: Math.round(dur[k] / 60) };
    });
    console.log(`  OSRM ${Math.min(i + CHUNK, targets.length)}/${targets.length}`);
    await sleep(1200);                  // เคารพ rate limit ของเซิร์ฟเวอร์สาธารณะ
  }
  out.provider = 'osrm';
}

const key = process.env.GOOGLE_MAPS_API_KEY;
if (key) { console.log('ใช้ Google Maps Distance Matrix'); await viaGoogle(key); }
else { console.log('ไม่พบ GOOGLE_MAPS_API_KEY → ใช้ OSRM (โครงข่ายถนน OpenStreetMap, driving)'); await viaOSRM(); }

const got = Object.keys(out.byName).length;
console.log(`ได้ระยะทาง ${got}/${targets.length} แห่ง`);
if (got < targets.length * 0.9) { console.error('ได้ไม่ครบ 90% — ยกเลิก ไม่เขียนไฟล์'); process.exit(1); }

fs.writeFileSync(path.join(ROOT, 'tools/drive-distances.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(
  path.join(ROOT, 'map-drive.js'),
  `/* สร้างโดย tools/build-drive-distances.mjs — อย่าแก้ด้วยมือ\n` +
  `   ระยะทางขับรถจากคณะแพทยศาสตร์ จุฬาฯ · ผู้ให้บริการ: ${out.provider} · ${out.generated}\n` +
  `   ข้อมูลถูกเก็บเป็นไฟล์ (ไม่เรียก API ตอนผู้ใช้เปิดเว็บ) */\n` +
  `window.ELECTIVE_DRIVE = ${JSON.stringify(out)};\n`
);
console.log('เขียน tools/drive-distances.json และ map-drive.js แล้ว');

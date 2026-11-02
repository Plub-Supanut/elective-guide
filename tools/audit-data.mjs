#!/usr/bin/env node
/**
 * tools/audit-data.mjs — ตรวจ «ความครบ» และ «ความสด» ของข้อมูลในเว็บ
 *
 * ทำอะไร
 *   1) นับของจริงจากหน้าเว็บ (ไม่เชื่อตัวเลขที่พิมพ์ค้างไว้)
 *   2) ตรวจความถูกต้องเชิงโครงสร้าง: id ซ้ำ · ลิงก์ภายในพัง · จำนวนการ์ดไม่ตรงกับตัวเลขที่โชว์
 *   3) ตรวจความครบ: การ์ดที่มีเบอร์/อีเมล/ที่พัก/ชั้นปี/วันที่ตรวจ
 *   4) ตรวจความสด: การ์ดที่ยังไม่มี data-verified หรือตรวจล่าสุดเกิน 12 เดือน
 *   5) เขียนแผง «ข้อมูลที่เว็บมีตอนนี้» ลงหน้าแรก (กรอบ marker) + docs/data-status.md
 *
 * วิธีใช้
 *   node tools/audit-data.mjs            ตรวจ + เขียนรายงาน
 *   node tools/audit-data.mjs --check    ตรวจอย่างเดียว ไม่เขียนไฟล์ (exit 1 = มี error)
 *
 * ไฟล์ที่เขียน
 *   index.html            เฉพาะกรอบ <!-- COVERAGE:START/END -->
 *   docs/data-status.md   รายงานที่คนอ่านได้ (commit)
 *   data/audit-report.json สรุปสำหรับ CI (ไม่ commit)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHECK = process.argv.includes('--check');

const PAGES = ['index.html', 'institutions.html', 'map.html', 'inside.html', 'outside.html', 'tips.html'];
const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const today = new Date();
const thaiToday = `${today.getDate()} ${TH_MONTH[today.getMonth()]} ${today.getFullYear() + 543}`;
const STALE_DAYS = 365;

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const count = (s, re) => (s.match(re) || []).length;

const errors = [];
const warnings = [];

// ── 1) ตรวจทุกหน้า: marker · nav · id ซ้ำ · ลิงก์ภายใน ──────────
const pages = {};
for (const file of PAGES) {
  if (!fs.existsSync(path.join(ROOT, file))) {
    errors.push(`ไม่พบไฟล์ ${file}`);
    continue;
  }
  const html = read(file);
  pages[file] = html;

  for (const region of ['HEAD', 'NAV', 'FOOTER', 'SCRIPTS']) {
    if (!html.includes(`<!-- SHELL:${region}:START -->`)) errors.push(`${file}: ไม่มี marker SHELL:${region}`);
  }
  const navLinks = [...html.matchAll(/<a href="([a-z]+\.html)"[^>]*>/g)].map(m => m[1]);
  const uniqNav = [...new Set(navLinks)];
  if (uniqNav.length < 6) warnings.push(`${file}: เมนูมีลิงก์ไม่ครบ 6 หน้า (${uniqNav.length})`);
  if (!/aria-current="page"/.test(html)) warnings.push(`${file}: ไม่ได้ระบุหน้าปัจจุบันในเมนู`);

  // id ซ้ำ
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) errors.push(`${file}: id ซ้ำ — ${[...new Set(dup)].join(', ')}`);

  // ลิงก์ภายในต้องมีไฟล์จริง
  const links = [...html.matchAll(/href="([^"#?]+\.html)(?:[?#][^"]*)?"/g)].map(m => m[1]);
  const missing = [...new Set(links)].filter(l => !fs.existsSync(path.join(ROOT, l)));
  if (missing.length) errors.push(`${file}: ลิงก์ไปไฟล์ที่ไม่มี — ${missing.join(', ')}`);
}

// ── 2) เก็บข้อมูลการ์ดแต่ละใบ ──────────────────────────────────
const html = pages['institutions.html'] || '';
const cardStarts = [...html.matchAll(/class="card fade-up/g)].map(m => m.index);
const cards = cardStarts.map((start, i) => {
  const end = i + 1 < cardStarts.length ? cardStarts[i + 1] : html.length;
  const block = html.slice(start, end);
  const pick = re => (block.match(re) || [])[1] || '';
  const verified = pick(/data-verified="(\d{4}-\d{2}-\d{2})"/);
  return {
    tags: pick(/data-tags="([^"]*)"/),
    region: pick(/data-region="([^"]*)"/),
    years: pick(/data-years="([^"]*)"/),
    verified,
    hasPhone: /href="tel:/.test(block),
    hasEmail: /href="mailto:/.test(block),
    hasDorm: /badge-dormitory/.test(block),
    hasDetail: /class="card-detail"/.test(block),
    name: (block.match(/class="card-title"[^>]*>([\s\S]*?)<\/h3>/) || [, ''])[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  };
});
const total = cards.length;

const withPhone = cards.filter(c => c.hasPhone).length;
const withEmail = cards.filter(c => c.hasEmail).length;
const withDorm = cards.filter(c => c.hasDorm).length;
const withYears = cards.filter(c => c.years).length;
const withVerified = cards.filter(c => c.verified).length;

const stale = cards.filter(c => {
  if (!c.verified) return false;
  return (today.getTime() - Date.parse(c.verified)) / 86400000 > STALE_DAYS;
});

// ── 3) ตัวเลขที่โชว์บนเว็บต้องตรงกับของจริง ────────────────────
const home = pages['index.html'] || '';
const statNums = [...home.matchAll(/class="stat-num">(\d+)</g)].map(m => Number(m[1]));
if (statNums.length) {
  if (statNums[0] !== total) errors.push(`หน้าแรกโชว์ «${statNums[0]} สถาบัน» แต่ในการ์ดจริงมี ${total} ใบ`);
  for (const [i, label] of [[1, 'ศพช.'], [2, 'มีที่พัก'], [3, 'ภาควิชาจุฬาฯ']]) {
    if (statNums[i] === undefined) continue;
    const real = label === 'ศพช.'
      ? cards.filter(c => /(^|\s)cpird(\s|$)/i.test(c.tags)).length
      : label === 'มีที่พัก' ? withDorm
        : cards.filter(c => /(^|\s)chula(\s|$)/.test(c.tags)).length;
    if (statNums[i] !== real) warnings.push(`หน้าแรกโชว์ «${statNums[i]} ${label}» แต่ของจริง ${real}`);
  }
}

// แท็บหมวด: ผลรวมต้องเท่ากับจำนวนการ์ด และแต่ละหมวดต้องตรงกับ section
const catChips = [...html.matchAll(/data-cat-link="([a-z]+)"[^>]*>[\s\S]*?class="cat-n">(\d+)</g)]
  .map(m => ({ key: m[1], n: Number(m[2]) }));
const catSum = catChips.filter(c => c.key !== 'all').reduce((a, c) => a + c.n, 0);
if (catChips.length) {
  const allChip = catChips.find(c => c.key === 'all');
  if (allChip && allChip.n !== total) errors.push(`แท็บ «ทั้งหมด» โชว์ ${allChip.n} แต่มีการ์ด ${total} ใบ`);
  if (catSum !== total) errors.push(`ผลรวมทุกหมวด (${catSum}) ไม่เท่ากับจำนวนการ์ด (${total})`);

  // นับการ์ดจริงในแต่ละ section[data-cat]
  const sections = [...html.matchAll(/<section[^>]*data-cat="([a-z]+)"[^>]*>([\s\S]*?)<\/section>/g)]
    .map(m => ({ key: m[1], n: count(m[2], /class="card fade-up/g) }));
  for (const chip of catChips) {
    if (chip.key === 'all') continue;
    const sec = sections.find(s => s.key === chip.key);
    if (!sec) { errors.push(`ไม่พบ section ของหมวด «${chip.key}»`); continue; }
    if (sec.n !== chip.n) errors.push(`หมวด «${chip.key}» โชว์ ${chip.n} แต่ในหน้ามี ${sec.n} ใบ`);
  }
}

// ── 4) ตรวจคำศัพท์ที่ใช้กรอง ──────────────────────────────────
const cpirdLower = cards.filter(c => /(^|\s)cpird(\s|$)/.test(c.tags)).length;
const cpirdUpper = cards.filter(c => /(^|\s)CPIRD(\s|$)/.test(c.tags)).length;
if (cpirdLower && cpirdUpper) warnings.push(`แท็ก cpird พิมพ์ไม่เหมือนกัน (เล็ก ${cpirdLower} / ใหญ่ ${cpirdUpper})`);
const dormFree = cards.filter(c => /dorm-free/.test(c.tags)).length;
const dormFreeBadge = count(html, /ที่พักฟรี/g);
if (!dormFree && dormFreeBadge) warnings.push(`มีป้าย «ที่พักฟรี» ${dormFreeBadge} ที่ แต่ไม่มีแท็ก dorm-free ที่ตัวกรองใช้`);
const regionalPlain = cards.filter(c => /regional-plain/.test(c.tags)).length;
if (!regionalPlain) warnings.push('ตัวกรอง «รพ.จังหวัด» (regional-plain) ไม่มีแท็กนี้ในการ์ดเลย — กดแล้วจะไม่เจออะไร');

// ── 5) เขียนแผงความครบลงหน้าแรก ────────────────────────────────
// หมายเหตุ: แผงนี้ไม่มี indent นำหน้า เพราะ regex ด้านล่างกิน «ช่องว่างต้นบรรทัด» ไปด้วย
// (เดิมไม่กิน ทำให้ทุกครั้งที่รัน indent เพิ่มขึ้นเรื่อย ๆ แล้ว bot commit ขยับบรรทัดเปล่า ๆ)
const coveragePanel = () => `    <!-- COVERAGE:START -->
    <section class="coverage-section" aria-labelledby="coverage-title">
      <div class="container">
        <h2 id="coverage-title" class="section-title fade-up">ข้อมูลที่เว็บมีตอนนี้</h2>
        <p class="section-sub fade-up">
          ตัวเลขชุดนี้คำนวณจากหน้าเว็บจริงทุกครั้งที่รัน <code>npm run audit</code> — ไม่ได้พิมพ์มือ
        </p>
        <ul class="coverage-grid fade-up">
          <li><strong>${total}</strong><span>สถาบัน / ภาควิชา</span></li>
          <li><strong>${withPhone}</strong><span>มีเบอร์โทร</span></li>
          <li><strong>${withEmail}</strong><span>มีอีเมล</span></li>
          <li><strong>${withDorm}</strong><span>มีที่พัก</span></li>
          <li><strong>${withYears}</strong><span>ระบุชั้นปี</span></li>
          <li><strong>${withVerified}</strong><span>มีวันที่ตรวจ</span></li>
        </ul>
        <p class="coverage-note fade-up">
          ${withYears === 0
    ? 'ข้อมูล «ชั้นปีที่รับ» ของสถาบันยังไม่มีในต้นฉบับ (ฟอร์มไม่ได้เก็บช่องนี้) — ปุ่ม «ชั้นปี» จึงเน้นผลกับหน้า «ในคณะ» และ «นอกคณะ» ก่อน'
    : `ระบุชั้นปีแล้ว ${withYears} จาก ${total} แห่ง`}
          · ตรวจล่าสุด ${thaiToday} ·
          <a href="https://github.com/Plub-Supanut/elective-guide/issues/new">เจอข้อมูลผิด? แจ้งได้</a>
        </p>
      </div>
    </section>
    <!-- COVERAGE:END -->`;

const report = {
  checkedAt: new Date().toISOString(),
  total,
  coverage: { withPhone, withEmail, withDorm, withYears, withVerified },
  stale: stale.map(c => ({ name: c.name, verified: c.verified })),
  errors,
  warnings,
};

if (!CHECK) {
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'audit-report.json'), JSON.stringify(report, null, 2) + '\n');

  // แผงบนหน้าแรก
  if (home.includes('<!-- COVERAGE:START -->')) {
    const next = home.replace(/^[ \t]*<!-- COVERAGE:START -->[\s\S]*?^[ \t]*<!-- COVERAGE:END -->/m, coveragePanel());
    if (next !== home) fs.writeFileSync(path.join(ROOT, 'index.html'), next);
  } else {
    errors.push('index.html ไม่มีกรอบ <!-- COVERAGE:START/END --> สำหรับใส่แผงความครบ');
  }

  // รายงานที่คนอ่านได้
  const md = `# สถานะข้อมูลของเว็บ

ไฟล์นี้สร้างจาก \`npm run audit\` — ห้ามแก้ด้วยมือ (ตรวจล่าสุด ${thaiToday})

## ความครบของข้อมูลการ์ดสถาบัน

| หัวข้อ | มี | จากทั้งหมด |
|---|---:|---:|
| สถาบัน / ภาควิชา | ${total} | ${total} |
| เบอร์โทร | ${withPhone} | ${total} |
| อีเมล | ${withEmail} | ${total} |
| ที่พัก | ${withDorm} | ${total} |
| ระบุชั้นปี (data-years) | ${withYears} | ${total} |
| มีวันที่ตรวจ (data-verified) | ${withVerified} | ${total} |

## ความสด

${stale.length
    ? `- เกิน ${STALE_DAYS} วันแล้ว **${stale.length} รายการ**\n${stale.map(c => `  - ${c.name} (ตรวจล่าสุด ${c.verified})`).join('\n')}`
    : `- ไม่มีรายการที่เกิน ${STALE_DAYS} วัน`}
${withVerified === 0 ? '- ยังไม่มีการ์ดใบไหนระบุ `data-verified` — เพิ่มได้ทีละใบเมื่อมีคนตรวจข้อมูลกับต้นทาง' : ''}

## ปัญหาที่เจอ

${errors.length ? errors.map(e => `- ❌ ${e}`).join('\n') : '- ไม่มี error'}

${warnings.length ? warnings.map(w => `- ⚠️ ${w}`).join('\n') : '- ไม่มีคำเตือน'}
`;
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'data-status.md'), md);

  console.log(`✓ ตรวจ ${PAGES.length} หน้า · การ์ด ${total} ใบ · เบอร์ ${withPhone} · อีเมล ${withEmail} · ที่พัก ${withDorm} · ชั้นปี ${withYears} · วันที่ตรวจ ${withVerified}`);
  if (errors.length) console.log(`✗ error ${errors.length}: \n  - ` + errors.join('\n  - '));
  if (warnings.length) console.log(`• คำเตือน ${warnings.length}: \n  - ` + warnings.join('\n  - '));
  console.log('  → เขียน docs/data-status.md + data/audit-report.json + แผงใน index.html');
} else {
  console.log(`ตรวจ ${total} ใบ · error ${errors.length} · คำเตือน ${warnings.length}`);
  if (errors.length) errors.forEach(e => console.log('  ✗ ' + e));
}

process.exit(errors.length ? 1 : 0);

#!/usr/bin/env node
/**
 * tools/build-shell.mjs — เติม «เปลือก» ที่เหมือนกันทุกหน้า (head · nav · footer · scripts)
 * ให้ตรงกันทั้งเว็บจากที่เดียว
 *
 * ทำไมต้องมี
 *   เว็บนี้แยกเป็นหลายหน้า (หน้าแรก / สถาบัน / ในคณะ / นอกคณะ / คำแนะนำ)
 *   ถ้าปล่อยให้เขียนเมนูซ้ำ 6 ที่ วันหนึ่งจะลืมแก้ที่หนึ่งแล้วเมนูเพี้ยน
 *   สคริปต์นี้เขียนทับเฉพาะ «กรอบ marker» ที่กำหนด ไม่แตะเนื้อหาหน้า
 *
 * วิธีใช้
 *   node tools/build-shell.mjs           เขียนทับกรอบ marker ให้ตรงกับ template
 *   node tools/build-shell.mjs --check   ไม่เขียนไฟล์ แค่บอกว่ามีหน้าไหนไม่ตรง (exit 2 = ไม่ตรง)
 *
 * marker ในแต่ละหน้า
 *   <!-- SHELL:HEAD:START -->    ... <!-- SHELL:HEAD:END -->
 *   <!-- SHELL:NAV:START -->     ... <!-- SHELL:NAV:END -->
 *   <!-- SHELL:FOOTER:START -->  ... <!-- SHELL:FOOTER:END -->
 *   <!-- SHELL:SCRIPTS:START --> ... <!-- SHELL:SCRIPTS:END -->
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHECK = process.argv.includes('--check');

const CSS_VERSION = '20261108i';

// ── ทุกหน้าของเว็บ (แหล่งความจริงเดียว: nav · เมนูมือถือ · ฟุตเตอร์ · shell) ──
const PAGES = [
  {
    file: 'index.html',
    key: 'index',
    nav: 'หน้าแรก',
    navPrimary: true,
    title: 'คู่มือ Elective · นิสิตแพทย์จุฬาฯ',
    desc: 'รวมข้อมูลการติดต่อ ที่พัก ค่าใช้จ่าย ของสถาบันและภาควิชาที่รับนิสิตแพทย์จุฬาฯ ไป elective พร้อมช่องทางยื่นความจำนงวิชาเลือกในและนอกคณะ',
    scripts: ['ui.js', 'hero-bg.js', 'icons.js', 'flair.js', 'premium.js'],
  },
  {
    file: 'institutions.html',
    key: 'institutions',
    nav: 'สถาบัน',
    navPrimary: true,
    title: 'สถาบันและภาควิชา · คู่มือ Elective',
    desc: 'ค้นหาและกรองสถาบัน 117 แห่งที่รับนิสิตแพทย์จุฬาฯ ไป elective — ผู้ประสานงาน เบอร์โทร อีเมล ที่พัก ค่าใช้จ่าย',
    scripts: ['ui.js', 'aliases.js', 'app.js', 'icons.js', 'flair.js', 'premium.js'],
  },
  {
    file: 'inside.html',
    key: 'inside',
    nav: 'ในคณะ',
    title: 'รายวิชาเลือก « ใน » คณะ · คู่มือ Elective',
    desc: 'ช่องทางแสดงความจำนงรายวิชาเลือกในคณะแพทยศาสตร์ จุฬาฯ กำหนดการ ข้อมูลรายวิชาแยกชั้นปี และช่องทางติดต่อ',
    scripts: ['ui.js', 'icons.js', 'flair.js', 'premium.js'],
  },
  {
    file: 'outside.html',
    key: 'outside',
    nav: 'นอกคณะ',
    title: 'รายวิชาเลือก « นอกคณะ » · คู่มือ Elective',
    desc: 'ช่องทางยื่นความจำนง elective นอกคณะ กำหนดการรายชั้นปี หลักเกณฑ์และเอกสารจากฝ่ายวิชาการ คณะแพทยศาสตร์ จุฬาฯ',
    scripts: ['ui.js', 'icons.js', 'flair.js', 'premium.js'],
  },
  {
    file: 'tips.html',
    key: 'tips',
    nav: 'คำแนะนำ',
    title: 'ก่อนไป elective · คู่มือ Elective',
    desc: 'สิ่งที่ต้องเตรียมก่อนไป elective — เอกสาร วัคซีน ที่พัก การเดินทาง และข้อควรระวัง',
    scripts: ['ui.js', 'icons.js', 'flair.js', 'premium.js'],
  },
  {
    file: '404.html',
    key: '404',
    inNav: false,
    nav: 'ไม่พบหน้านี้',
    title: '404 — ไม่พบหน้านี้ · คู่มือ Elective',
    desc: 'ไม่พบหน้าที่ต้องการ — ลิงก์อาจเปลี่ยนไปหลังจัดโครงเว็บใหม่ กลับไปหน้าแรกหรือเลือกหน้าจากเมนู',
    scripts: ['ui.js', 'icons.js', 'flair.js', 'premium.js'],
  },
];

// เมนูทั้งสามที่แสดงเฉพาะหน้าที่อยู่ในเมนู (404 ไม่ขึ้นเมนู)
const NAV_PAGES = PAGES.filter(p => p.inNav !== false);

// โลโก้: เข็มทิศ (ครึ่งสว่าง/ครึ่งทราย) + จุดกลางสีเขียว — ใช้ซ้ำได้ทุกที่
// ไอคอน/OG เป็นไฟล์ใน assets/ (สร้างจาก assets/logo-mark.svg)
const LOGO_SVG = (id, cls = '') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
              <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#c4714b"/><stop offset="1" stop-color="#a8542e"/>
              </linearGradient></defs>
              <rect width="64" height="64" rx="15" fill="url(#${id})"/>
              <path d="M47 16 L37.2 36.5 L17 48 L26.8 27.5 Z" fill="#fdfaf6"/>
              <path d="M47 16 L26.8 27.5 L17 48 Z" fill="#e7d2ba"/>
              <circle cx="32" cy="32" r="3.5" fill="#7d9b76" stroke="#fdfaf6" stroke-width="1.7"/>
            </svg>`;
const SITE_URL = 'https://plub-supanut.github.io/elective-guide/';

const GITHUB_SVG = `            <svg height="20" viewBox="0 0 16 16" width="20" aria-hidden="true" fill="currentColor">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.46-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
            </svg>`;

const head = p => `    <meta charset="UTF-8" />
    <script>document.documentElement.classList.add('js');</script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>
      // ตั้งธีมก่อนวาดหน้า (กันจอกระพริบ): เลือกที่บันทึกไว้ ถ้าไม่เคยเลือกใช้ค่าของระบบ
      try {
        var themePref = localStorage.getItem('eg:theme');
        var sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme =
          (themePref === 'dark' || themePref === 'light') ? themePref : (sysDark ? 'dark' : 'light');
      } catch (e) {}
    </script>
    <title>${p.title}</title>
    <meta name="description" content="${p.desc}" />
    <!-- ฟอนต์ self-host (Thai + Latin subset) — ไม่พึ่ง Google Fonts แล้ว -->
    <link rel="preload" as="font" type="font/woff2" href="fonts/lora-700-latin.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="fonts/noto-serif-thai-700-thai.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="fonts/noto-sans-thai-400-thai.woff2" crossorigin />
    <link rel="stylesheet" href="fonts/fonts.css" />
    <link rel="icon" type="image/svg+xml" href="assets/favicon.svg?v=${CSS_VERSION}" />
    <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png" />
    <link rel="apple-touch-icon" href="assets/apple-touch-icon.png" />
    <link rel="manifest" href="site.webmanifest" />
    <meta name="theme-color" content="#f5efe6" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#15110d" media="(prefers-color-scheme: dark)" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Elective Guide" />
    <meta property="og:title" content="${p.title}" />
    <meta property="og:description" content="${p.desc}" />
    <meta property="og:url" content="${SITE_URL}${p.file}" />
    <meta property="og:image" content="${SITE_URL}assets/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Elective Guide — คู่มือ elective นิสิตแพทย์จุฬาฯ" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${p.title}" />
    <meta name="twitter:description" content="${p.desc}" />
    <meta name="twitter:image" content="${SITE_URL}assets/og-image.png" />
    <link rel="stylesheet" href="style.css?v=${CSS_VERSION}" />
    <link rel="stylesheet" href="premium.css" />
    <noscript><style>.fade-up{opacity:1;transform:none}</style></noscript>`;

// เมนูทั้งสามที่ (แถบหลัก · เมนูมือถือ · ฟุตเตอร์) สร้างจาก PAGES ชุดเดียว
// เพิ่มหน้าใหม่ = เพิ่มใน PAGES ที่เดียว (เดิมต้องแก้ 3 ที่และลืมได้ง่าย)
const linkTo = (p, active, cls = '') =>
  `<a href="${p.file}"${cls}${p.key === active ? ' aria-current="page"' : ''}>${p.nav}</a>`;
const NAV_PRIMARY = PAGES.filter(p => p.navPrimary);

const nav = active => {
  const cur = key => (key === active ? ' aria-current="page"' : '');
  return `    <nav class="sticky-nav" id="stickyNav">
      <div class="nav-inner">
        <a class="nav-logo" href="index.html" aria-label="Elective Guide — หน้าแรก">
          ${LOGO_SVG('egTileNav', 'nav-logo-mark')}<span class="nav-logo-text">Elective Guide</span>
        </a>
        <span class="nav-page-title" id="navPageTitle" aria-hidden="true"></span>
        <div class="nav-links">
          ${NAV_PAGES.map(p => linkTo(p, active, p.navPrimary ? ' class="nav-primary"' : '')).join('\n          ')}
          
          <button type="button" class="theme-toggle" data-theme-toggle aria-label="ธีม: ตามระบบ (กดเพื่อเปลี่ยน)" title="ธีม: ตามระบบ">
            <span class="theme-ico" aria-hidden="true">🌗</span>
          </button>
          <div class="year-switch year-switch--nav" role="group" aria-label="ชั้นปีของฉัน">
            <button type="button" data-year="4" aria-pressed="false" title="เน้นข้อมูลของชั้นปีที่ 4">ปี 4</button>
            <button type="button" data-year="5" aria-pressed="false" title="เน้นข้อมูลของชั้นปีที่ 5">ปี 5</button>
            <button type="button" data-year="6" aria-pressed="false" title="เน้นข้อมูลของชั้นปีที่ 6">ปี 6</button>
          </div>
          <a href="https://github.com/Plub-Supanut/elective-guide" target="_blank" rel="noopener noreferrer" class="nav-github" aria-label="GitHub Repository">
${GITHUB_SVG}
          </a>
          <button type="button" class="nav-more" id="navMoreBtn" aria-expanded="false" aria-controls="navMoreMenu" aria-label="เมนูเพิ่มเติม">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
          </button>
        </div>
        <div class="nav-more-menu" id="navMoreMenu" hidden>
          ${NAV_PAGES.map(p => linkTo(p, active)).join('\n          ')}
          
          <a href="https://github.com/Plub-Supanut/elective-guide" target="_blank" rel="noopener noreferrer">GitHub</a>
          <button type="button" class="theme-toggle" data-theme-toggle>
            <span class="theme-ico" aria-hidden="true">🌗</span><span class="theme-label">ธีม: ตามระบบ</span>
          </button>
          <div class="year-switch year-switch--menu" role="group" aria-label="ชั้นปีของฉัน (เมนูมือถือ)">
            <button type="button" data-year="4" aria-pressed="false">ปี 4</button>
            <button type="button" data-year="5" aria-pressed="false">ปี 5</button>
            <button type="button" data-year="6" aria-pressed="false">ปี 6</button>
          </div>
        </div>
      </div>
    </nav>`;
};

const footer = `    <footer class="footer">
      <div class="container">
        <p class="footer-title">
          ${LOGO_SVG('egTileFoot', 'footer-mark')}
          <span>คู่มือ Elective · นิสิตแพทย์จุฬาลงกรณ์มหาวิทยาลัย</span>
        </p>
        <p class="footer-links">
          ${NAV_PAGES.map(p => linkTo(p, null)).join('\n          <span aria-hidden="true">·</span>\n          ')}
        </p>
        <p class="footer-sub">
          ข้อมูลจากปีการศึกษา 2565–2567 ถ้าจะไปจริง เช็คกับสถาบันอีกครั้งนะ
        </p>
        <p class="footer-sub footer-report">
          เจอข้อมูลผิด หรือมีที่ที่ยังไม่มีในเว็บ?
          <a href="https://github.com/Plub-Supanut/elective-guide/issues/new">แจ้งได้ที่นี่</a>
        </p>
        <p class="footer-sub" style="margin-top: 0.4rem; font-size: 0.85em; opacity: 0.8;">
          Built with DeepSeek ✨
        </p>
      </div>
    </footer>`;

const scripts = list =>
  list.map(src => `    <script src="${src}"></script>`).join('\n');

// ── แทนที่กรอบ marker ────────────────────────────────────────────────────
const REGIONS = [
  { name: 'HEAD', inner: p => head(p) },
  { name: 'NAV', inner: p => nav(p.key) },
  { name: 'FOOTER', inner: () => footer },
  { name: 'SCRIPTS', inner: p => scripts(p.scripts) },
];

let problems = 0;
let changed = 0;

// เทียบเนื้อหาโดยไม่สนใจ EOL: Windows ที่ core.autocrlf=true จะได้ worktree เป็น CRLF
// ถ้าเทียบดิบ ๆ จะเข้าใจผิดว่าทุกหน้า «ไม่ตรง template» ทั้งที่เนื้อหาเหมือนกัน
const lf = s => s.replace(/\r\n/g, '\n');

for (const page of PAGES) {
  const file = path.join(ROOT, page.file);
  if (!fs.existsSync(file)) {
    console.error(`✗ ไม่พบไฟล์ ${page.file}`);
    problems++;
    continue;
  }
  const before = lf(fs.readFileSync(file, 'utf8'));
  let next = before;

  for (const region of REGIONS) {
    const start = `<!-- SHELL:${region.name}:START -->`;
    const end = `<!-- SHELL:${region.name}:END -->`;
    const a = next.indexOf(start);
    const b = next.indexOf(end);
    if (a === -1 || b === -1) {
      console.error(`✗ ${page.file}: ไม่พบ marker ${start} / ${end}`);
      problems++;
      continue;
    }
    next = next.slice(0, a + start.length) +
      '\n' + region.inner(page) + '\n    ' +
      next.slice(b);
  }

  if (next === before) continue;
  changed++;
  if (CHECK) {
    console.log(`• ${page.file}: shell ไม่ตรงกับ template`);
  } else {
    fs.writeFileSync(file, next);
    console.log(`• ${page.file}: เขียนเปลือกหน้าใหม่แล้ว`);
  }
}

if (problems) process.exit(3);
if (CHECK) {
  console.log(changed ? `✗ มี ${changed} หน้าที่ shell ไม่ตรง` : '✓ shell ตรงกันทุกหน้า');
  process.exit(changed ? 2 : 0);
}
console.log(changed ? `✓ อัปเดต ${changed} หน้า` : '✓ เปลือกหน้าตรงกันอยู่แล้ว — ไม่มีอะไรต้องแก้');

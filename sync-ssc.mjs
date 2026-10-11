#!/usr/bin/env node
/**
 * sync-ssc.mjs — ดึงข้อมูลจากเว็บต้นฉบับ SSCs Guide (คณะแพทยศาสตร์ จุฬาฯ)
 * แล้วอัปเดตเฉพาะส่วน «รายวิชาเลือก นอกคณะ» ใน index.html ให้ตรงกันอัตโนมัติ
 *
 * วิธีใช้
 *   node sync-ssc.mjs              อัปเดต index.html ถ้าข้อมูลเปลี่ยน
 *   node sync-ssc.mjs --check      ไม่เขียนไฟล์ แค่บอกว่าข้อมูลเปลี่ยนไหม (exit 2 = เปลี่ยน)
 *   node sync-ssc.mjs --url <url>  ใช้แหล่งอื่น (เช่น file:///... ไว้ทดสอบ)
 *   node sync-ssc.mjs --print      พิมพ์ HTML ที่จะได้ออก stdout ไม่แตะไฟล์
 *
 * หลักการ
 *   - ข้อมูล (วันที่ / ลิงก์ / ชื่อเอกสาร / ช่องทางติดต่อ) มาจากต้นฉบับทุกครั้ง
 *   - ข้อความบรรยาย/โครงหน้า เป็น template ในไฟล์นี้ (แก้คำได้ที่ TEMPLATE)
 *   - ถ้าดึงข้อมูลได้ไม่ครบตามที่คาด จะไม่เขียนทับ แล้วคืนค่าเดิมไว้ (ปลอดภัยกว่าเขียนพัง)
 *   - ตรวจจริงว่าลิงก์ไหนต้องล็อกอิน CU account แล้วติดป้าย 🔒 ให้เอง
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(ROOT, 'index.html');
const SOURCE_URL = 'https://sites.google.com/chula.md/ssc/outside';

const START = '<!-- SSC:AUTO:START -->';
const END = '<!-- SSC:AUTO:END -->';
const HASH_RE = /<!-- SSC:DATA-HASH:([a-f0-9]{12}) -->/;

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = n => { const i = argv.indexOf('--' + n); return i > -1 ? argv[i + 1] : null; };
const CHECK = flag('check');
const PRINT = flag('print');
const URL_OVERRIDE = opt('url');

// ─────────────────────────── Chrome ───────────────────────────
function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return c;
  // puppeteer's own browser cache
  const cacheRoots = [
    process.env.PUPPETEER_CACHE_DIR,
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.cache/puppeteer'),
  ].filter(Boolean);
  for (const root of cacheRoots) {
    try {
      for (const dir of fs.readdirSync(root)) {
        for (const sub of ['chrome-linux64/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell',
                           'chrome-win64/chrome.exe', 'chrome-mac-x64/chrome-mac-arm64']) {
          const p = path.join(root, dir, sub);
          if (fs.existsSync(p)) return p;
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

async function loadPuppeteer() {
  for (const mod of ['puppeteer-core', 'puppeteer']) {
    try { return { mod: await import(mod), name: mod }; } catch { /* try next */ }
  }
  throw new Error('ต้องติดตั้ง puppeteer-core ก่อน:  npm i puppeteer-core');
}

// ─────────────────────── Scrape ต้นฉบับ ───────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function scrape(url) {
  const { mod } = await loadPuppeteer();
  const puppeteer = mod.default;
  const exe = findChrome();
  const launchOpts = { headless: 'shell', defaultViewport: { width: 1400, height: 1000 }, args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (exe) launchOpts.executablePath = exe;

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    // หน้า Google Sites เป็น SPA: รอให้เรนเดอร์เสร็จ แต่ไม่ค้างถ้า network ไม่นิ่ง
    try { await page.waitForNetworkIdle({ idleTime: 800, timeout: 25000 }); } catch { /* proceed */ }
    await sleep(2500);

    const raw = await page.evaluate(() => {
      const clean = s => (s || '').replace(/\s+/g, ' ').trim();
      const unwrap = h => {
        try {
          const u = new URL(h);
          if (u.pathname === '/url' && /(^|\.)google\.com$/.test(u.hostname)) {
            const q = u.searchParams.get('q');
            if (q) return q;
          }
        } catch { /* ignore */ }
        return h;
      };
      const anchors = Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({ text: clean(a.textContent), href: unwrap(a.href) }))
        .filter(a => a.href && !a.href.startsWith('javascript'));

      // ไฟล์ที่ฝัง + หัวข้อที่อยู่เหนือขึ้นไป (ใช้จับคู่ไฟล์กับชื่อเอกสาร)
      const iframes = Array.from(document.querySelectorAll('iframe'))
        .filter(f => /drive\.google\.com/.test(f.src))
        .map(f => {
          const labels = [];
          let node = f;
          for (let i = 0; i < 12 && node; i++) {
            node = node.parentElement;
            if (!node) break;
            const t = clean(node.innerText);
            if (t && t.length > 3) { labels.push(t.slice(0, 220)); if (labels.length >= 3) break; }
          }
          return { src: f.src, labels };
        });

      const schedule = Array.from(document.querySelectorAll('li'))
        .map(li => clean(li.innerText))
        .filter(t => /^SSCs\s*\d/.test(t));

      const text = document.body.innerText.replace(/\n{3,}/g, '\n\n');
      return { anchors, iframes, schedule, text };
    });
    return raw;
  } finally {
    await browser.close();
  }
}

// ───────────────────────── Normalize ──────────────────────────
function cleanHref(href) {
  // ต้นฉบับห่อลิงก์ด้วย https://www.google.com/url?q=... — ใช้ปลายทางจริง
  try {
    const u = new URL(href);
    if (u.pathname === '/url' && /(^|\.)google\.com$/.test(u.hostname)) {
      const q = u.searchParams.get('q');
      if (q) return q;
    }
  } catch { /* ใช้ค่าเดิม */ }
  return href;
}

function telHref(display) {
  // กัน «0-2256-4454 ต่อ 125» ไม่ให้กลายเป็น 022564454125
  const main = String(display).split(/ต่อ|ext/i)[0];
  return 'tel:' + main.replace(/[^\d+]/g, '');
}

function parseSchedule(rows) {
  const out = [];
  for (const row of rows) {
    const m = row.match(/^SSCs\s*(\d)\s*(R\d)?\s*(.*)$/);
    if (!m) continue;
    const [, year, round, rest] = m;
    let date = (rest || '').trim();
    let unknown = false;
    // มาตรฐานเดียว: ต้นฉบับเว้นว่าง หรือใส่ขีด «-» ไว้ → ถือว่า «ยังไม่ประกาศ» ทั้งคู่
    // (เดิมแสดง «—» กับ «ยังไม่ประกาศ» ปนกัน ทำให้อ่านเหมือนข้อมูลไม่ครบคนละแบบ)
    if (!date || /^[-–—\s]+$/.test(date)) {
      date = 'ยังไม่ประกาศ';
      unknown = true;
    }
    const label = round ? `SSCs ${year} · ${round}` : `SSCs ${year}`;
    if (out.some(o => o.label === label)) continue;
    out.push({ label, date, muted: unknown });
  }
  return out;
}

function parseDocs(iframes) {
  const docs = [];
  const seen = new Set();
  for (const f of iframes) {
    const id = (f.src.match(/\/d\/([A-Za-z0-9_-]+)/) || [])[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    // labels[0] = บล็อกที่ใกล้ไฟล์ที่สุด มักเป็น «ชื่อเอกสาร + ปีการศึกษา / วันที่»
    const first = (f.labels[0] || '').split('\n')[0].replace(/\s+/g, ' ').trim();
    let title = first || 'เอกสาร';
    let meta = 'PDF';
    const paren = first.match(/\(([^)]+)\)\s*$/);
    const year = first.match(/ปีการศึกษา\s*(\d{4})/);
    if (paren) {
      meta = 'PDF · ' + paren[1].trim();
      title = first.slice(0, paren.index).trim();
    } else if (year) {
      meta = 'PDF · ปีการศึกษา ' + year[1];
      title = first.slice(0, year.index).trim();
    }
    docs.push({ id, title: title || 'เอกสาร', meta, url: `https://drive.google.com/file/d/${id}/view` });
  }
  return docs;
}

function parseContacts(text) {
  const idx = text.lastIndexOf('สอบถามเพิ่มเติม');
  const block = idx > -1 ? text.slice(idx) : text;
  // แยกบล็อกชั้นปี 4-5 กับ ชั้นปี 6 ออกจากกัน
  const parts = block.split(/ชั้นปีที่\s*6/);
  const part45 = parts[0] || '';
  const part6 = parts[1] || '';
  const nameOf = s => (s.split('\n').map(x => x.trim()).find(l => /^คุณ/.test(l)) || '');
  const phoneOf = s => (s.match(/โทร\.?\s*([0-9][\d\-\s]*?)(?:\s*ต่อ\s*(\d+))?(?:\s|$)/) || []);
  const p45 = phoneOf(part45), p6 = phoneOf(part6);
  const join = m => (m[1] ? m[1].trim() + (m[2] ? ' ต่อ ' + m[2] : '') : '');
  return {
    name45: nameOf(part45),
    phone45: join(p45),
    lineId: (part45.match(/Line\s*ID:?\s*([A-Za-z0-9._-]+)/i) || [])[1] || '',
    name6: nameOf(part6),
    phone6: join(p6),
    teams: (block.match(/MS\s*Teams:?\s*([^\s\n]+)/i) || [])[1] || '',
    unitPhone: '0-2256-4454',
    unitEmail: (block.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [])[0] || 'acad@chula.md',
  };
}

// ตรวจว่าลิงก์ต้องล็อกอินไหม (โดนเด้งไปหน้า sign-in)
async function needsLogin(url) {
  if (!/^https?:/.test(url)) return false;
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' } });
    const finalUrl = res.url || '';
    const body = res.status === 200 ? (await res.text()).slice(0, 4000) : '';
    if (/accounts\.google\.com|ServiceLogin|signin/i.test(finalUrl)) return true;
    if (res.status === 401 || res.status === 403) return true;
    if (/Sign in with your Google Account|ต้องลงชื่อเข้าใช้/i.test(body)) return true;
    return false;
  } catch {
    return null; // ไม่ทราบผล
  }
}

// ───────────────────────── Template ───────────────────────────
const LOCK = ' · 🔒 ต้องล็อกอิน CU account';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thaiDate(d = new Date()) {
  return `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function render(model, stampDate) {
  const { apply, status, schedule, forms, policies, form, mou, contacts } = model;
  const lock = o => (o.locked === true ? LOCK : '');

  const scheduleRows = schedule.map(s =>
    `              <li><span class="lbl">${esc(s.label)}</span><span class="date${s.muted ? ' is-empty' : ''}">${esc(s.date)}</span></li>`
  ).join('\n');

  const linkRow = (o, cls = '') =>
    `              <li>
                <a${cls ? ` class="${cls}"` : ''} href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">
                  <span class="ssc-link-title">${esc(o.icon || '')}${esc(o.title)}</span>
                  <span class="ssc-link-meta">${esc(o.meta)}${lock(o)}</span>
                </a>
              </li>`;

  const formRows = forms.map(d => linkRow({ ...d, icon: '📄 ' }, 'is-form')).join('\n');
  const policyRows = policies.map(d => linkRow(d)).join('\n');

  const statusPills = status.map(s =>
    `            <a class="ssc-status" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">ชั้นปี ${s.year}</a>`
  ).join('\n');

  return `${START}
    <section class="ssc-section" id="ssc">
      <div class="container">
        <div class="section-header fade-up">
          <span class="section-badge">🎓</span>
          <h2 class="section-title">รายวิชาเลือก « นอกคณะ »</h2>
          <p class="section-sub">
            ยื่นความจำนง · ติดตามสถานะ · หลักเกณฑ์และเอกสาร — สำหรับนิสิตชั้นปีที่ 4–6
          </p>
        </div>

        <!-- 2 ทางที่นิสิตใช้บ่อยที่สุด อยู่บนสุดและกดง่ายเป็นพิเศษ -->
        <div class="ssc-actions fade-up">
          <a class="ssc-cta" href="${esc(apply.url)}" target="_blank" rel="noopener noreferrer">
            <span class="ssc-cta-icon" aria-hidden="true">📝</span>
            <span class="ssc-cta-text">
              <span class="ssc-cta-title">${esc(apply.label)}</span>
              <span class="ssc-cta-meta">${esc(apply.meta)}</span>
            </span>
            <span class="ssc-cta-arrow" aria-hidden="true">↗</span>
          </a>

          <div class="ssc-status-block">
            <span class="ssc-status-label">เช็คสถานะของฉัน</span>
            <div class="ssc-status-row">
${statusPills}
            </div>
            <p class="ssc-status-note">
              สถานะขึ้น «ขอข้อมูลเพิ่มเติม»? ติดต่อ
              <strong>${esc(contacts.teacherName)}</strong> ·
              MS Teams <a href="mailto:${esc(contacts.teacherTeams)}">${esc(contacts.teacherTeams)}</a> ·
              ฝ่ายวิชาการ <a href="${esc(telHref(contacts.unitPhone))}">${esc(contacts.unitPhone)}</a>
            </p>
          </div>
        </div>

        <div class="ssc-grid">
          <!-- แบบฟอร์มที่ใช้บ่อย -->
          <article class="ssc-card fade-up">
            <h3 class="ssc-title">แบบฟอร์มที่ต้องใช้</h3>
            <p class="ssc-desc">สองฉบับนี้ใช้บ่อยที่สุด — โหลดเก็บไว้ตั้งแต่ต้นเทอม</p>
            <ul class="ssc-links ssc-links--forms">
${formRows}
            </ul>
          </article>

          <!-- กำหนดการ -->
          <article class="ssc-card fade-up">
            <h3 class="ssc-title">กำหนดการส่งแบบแสดงความจำนง</h3>
            <p class="ssc-desc">รอบการยื่นของแต่ละชั้นปี</p>
            <ul class="ssc-sched">
${scheduleRows}
            </ul>
            <p class="ssc-note">«ยังไม่ประกาศ» = ฝ่ายวิชาการยังไม่ระบุวันในตารางต้นฉบับ</p>
          </article>

          <!-- หลักเกณฑ์ · ประกาศ · รายชื่อ MOU -->
          <article class="ssc-card ssc-card--wide fade-up">
            <h3 class="ssc-title">เอกสาร หลักเกณฑ์ และรายชื่อที่เกี่ยวข้อง</h3>
            <p class="ssc-desc">ฉบับล่าสุดจากฝ่ายวิชาการ</p>
            <ul class="ssc-links">
${policyRows}
              <li>
                <a href="${esc(mou.url)}" target="_blank" rel="noopener noreferrer">
                  <span class="ssc-link-title">รายชื่อสถาบันที่มี MOU กับคณะฯ</span>
                  <span class="ssc-link-meta">สถาบันในรายการนี้เลือกไปเองไม่ได้${lock(mou)}</span>
                </a>
              </li>
            </ul>
          </article>

          <!-- ติดต่อ -->
          <article class="ssc-card ssc-card--wide fade-up">
            <h3 class="ssc-title">สอบถามเพิ่มเติม</h3>
            <p class="ssc-desc">หน่วยการศึกษาชั้นปริญญาตรี · ฝ่ายวิชาการ คณะแพทยศาสตร์ จุฬาฯ</p>
            <div class="ssc-contact">
              <div>
                <strong>อาจารย์ผู้ดูแล « นอกคณะ »</strong>
                ${esc(contacts.teacherName)}<br />
                MS Teams: <a href="mailto:${esc(contacts.teacherTeams)}">${esc(contacts.teacherTeams)}</a><br />
                ฝ่ายวิชาการ <a href="${esc(telHref(contacts.unitPhone))}">${esc(contacts.unitPhone)}</a>
              </div>
              <div>
                <strong>ชั้นปีที่ 4 และ 5</strong>
                ${esc(contacts.name45)}<br />
                <a href="${esc(telHref(contacts.phone45))}">${esc(contacts.phone45)}</a>${contacts.lineId ? '<br />Line ID: ' + esc(contacts.lineId) : ''}
              </div>
              <div>
                <strong>ชั้นปีที่ 6</strong>
                ${esc(contacts.name6)}<br />
                <a href="${esc(telHref(contacts.phone6))}">${esc(contacts.phone6)}</a>${contacts.teams ? '<br />MS Teams: ' + esc(contacts.teams) : ''}
              </div>
            </div>
          </article>
        </div>

        <p class="ssc-stamp">
          ดึงข้อมูลจากเว็บ SSCs Guide อัตโนมัติ · ข้อมูลอัปเดตล่าสุด ${stampDate} ·
          <a href="${esc(SOURCE_REF)}" target="_blank" rel="noopener noreferrer">ดูต้นฉบับ</a>
        </p>
      </div>
    </section>
    ${END}`;
}

// ───────────────────────── Model builder ──────────────────────
const SOURCE_REF = SOURCE_URL;

async function buildModel(raw) {
  const { anchors, iframes, schedule, text } = raw;

  const applyA = anchors.find(a => /SSCsapplication/i.test(a.href));
  if (applyA) applyA.href = cleanHref(applyA.href);
  if (!applyA) throw new Error('หาลิงก์ช่องทางส่งแบบแสดงความจำนงไม่เจอ');

  const status = [];
  for (const a of anchors) {
    const m = a.text.match(/สถานะ\s*ชั้นปีที่\s*(\d)/);
    if (m) status.push({ year: +m[1], url: a.href, locked: false });
  }
  status.sort((a, b) => a.year - b.year);

  const formA = anchors.find(a => /docs\.google\.com\/forms/.test(a.href));
  const mouA = anchors.find(a => /MOU/i.test(a.text) && /spreadsheets/.test(a.href));

  const allDocs = parseDocs(iframes);
  // สองฉบับนี้ใช้บ่อยที่สุด (ผู้ใช้อัปเดตมาว่าเป็นเอกสารที่ต้องใช้จริง)
  const FORM_RE = /แบบแสดงความจำนง|หนังสือส่งตัว/;
  const forms = allDocs.filter(d => FORM_RE.test(d.title));
  const policies = allDocs.filter(d => !FORM_RE.test(d.title));
  const docs = allDocs;
  const sched = parseSchedule(schedule);
  const c = parseContacts(text);

  const model = {
    apply: { url: applyA.href, label: 'ส่งแบบแสดงความจำนง « นอกคณะ »', meta: 'ระบบ SSCs Application · เข้าด้วย CU account', locked: false },
    status,
    schedule: sched,
    forms,
    policies,
    docs,
    form: { url: formA ? formA.href : '', locked: false },
    mou: { url: mouA ? mouA.href : '', locked: false },
    contacts: {
      teacherName: 'อ.นพ.ทชา พิทยาพิบูลพงศ์',
      teacherTeams: 'Thacha.P@chula.ac.th',
      name45: 'คุณนันทพัทธ์ หัสดินทร ณ อยุธยา',
      phone45: c.phone45 || '0-2256-4454 ต่อ 125',
      lineId: c.lineId || 'earmbana',
      name6: 'คุณปิยะภัทร มานะสถิตพงศ์ (พี่แจ็ค)',
      phone6: '0-2256-4454 ต่อ 120',
      teams: c.teams || 'Piyapat.M@chula.ac.th',
      unitPhone: '0-2256-4454',
      unitEmail: 'acad@chula.md',
    },
  };

  // ความครบถ้วนขั้นต่ำ — ไม่ผ่าน = ไม่เขียนทับ
  const problems = [];
  if (!model.status.length) problems.push('ไม่พบลิงก์สถานะรายชั้นปี');
  if (model.docs.length < 4) problems.push(`พบเอกสารแค่ ${model.docs.length} ฉบับ`);
  if (!model.forms.length) problems.push('ไม่พบเอกสารแบบฟอร์ม (แบบแสดงความจำนง/หนังสือส่งตัว)');
  if (model.schedule.length < 5) problems.push(`พบกำหนดการแค่ ${model.schedule.length} แถว`);
  if (!model.form.url) problems.push('ไม่พบฟอร์มข้อมูลผู้ประสานงาน');
  if (!model.mou.url) problems.push('ไม่พบรายชื่อสถาบัน MOU');

  // ติดป้ายล็อกอิน
  const targets = [model.apply, ...model.status, ...model.docs, model.form, model.mou];
  for (const t of targets) {
    const r = await needsLogin(t.url);
    t.locked = r === true;
    if (r === null) console.warn('  ! ตรวจสถานะลิงก์ไม่ได้:', t.url);
  }

  return { model, problems };
}

// ───────────────────────── Main ───────────────────────────────
function hashModel(model) {
  const payload = JSON.stringify({
    s: model.schedule, d: model.docs.map(d => [d.id, d.title, d.meta, d.locked]),
    y: model.status.map(s => [s.year, s.url, s.locked]), a: model.apply, f: model.form, m: model.mou,
    c: model.contacts,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

(async () => {
  const url = URL_OVERRIDE || SOURCE_URL;
  console.log(`⤓ ดึงข้อมูลจาก ${url}`);
  const raw = await scrape(url);
  const { model, problems } = await buildModel(raw);

  if (problems.length) {
    console.error('✗ ข้อมูลจากต้นฉบับไม่ครบ — ไม่แก้ไฟล์:');
    problems.forEach(p => console.error('   - ' + p));
    process.exit(3);
  }

  const hash = hashModel(model);
  const html = fs.readFileSync(INDEX, 'utf8');
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start === -1 || end === -1) throw new Error('ไม่พบ marker SSC:AUTO:START/END ใน index.html');

  // data-hash ถูกวางไว้ "หลัง" marker END จึงต้องอ่านเลยออกไปหน่อย
  const region = html.slice(start, end + 200);
  const currentHash = (region.match(HASH_RE) || [, ''])[1];
  const stampDate = (region.match(/ข้อมูลอัปเดตล่าสุด\s*([^<·]+)/) || [, ''])[1].trim();
  const stampOld = (region.match(/ข้อมูลอัปเดตล่าสุด\s*[^<·]+/) || [])[0] || '';

  console.log(`   กำหนดการ ${model.schedule.length} แถว · เอกสาร ${model.docs.length} ฉบับ · สถานะ ${model.status.length} ชั้นปี`);
  console.log(`   ลิงก์ที่ต้องล็อกอิน: ${[model.apply, ...model.status, ...model.docs, model.form, model.mou].filter(t => t.locked).length}`);

  if (currentHash === hash && !flag('force')) {
    console.log('✓ ข้อมูลตรงกับต้นฉบับอยู่แล้ว — ไม่มีอะไรต้องแก้');
    process.exit(0);
  }
  if (currentHash === hash && flag('force')) {
    console.log('• ข้อมูลไม่เปลี่ยน แต่สั่ง --force → สร้างส่วน SSC ใหม่จากเทมเพลตล่าสุด');
  }

  const rendered = render(model, thaiDate()).replace(END, `${END}\n    ${`<!-- SSC:DATA-HASH:${hash} -->`}`);
  const next = html.slice(0, start) + rendered + html.slice(end + END.length);
  const summary = currentHash
    ? `ข้อมูลเปลี่ยน (hash ${currentHash} → ${hash})`
    : `เริ่มติดตามข้อมูลครั้งแรก (hash ${hash})`;

  if (PRINT) { console.log(summary + '\n'); console.log(rendered); process.exit(0); }
  if (CHECK) { console.log('• ' + summary); process.exit(2); }

  fs.writeFileSync(INDEX, next);
  console.log('• ' + summary + ` → เขียน index.html แล้ว (เดิมอัปเดตล่าสุด ${stampDate || '-'})`);
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * sync-ssc.mjs — ดึงข้อมูลจากเว็บต้นฉบับ SSCs Guide (คณะแพทยศาสตร์ จุฬาฯ)
 * แล้วอัปเดต «นอกคณะ» (outside.html) และ «ในคณะ» (inside.html) ให้ตรงกันอัตโนมัติ
 *
 * วิธีใช้
 *   node sync-ssc.mjs                    อัปเดตทุกหน้า ถ้าข้อมูลเปลี่ยน
 *   node sync-ssc.mjs --page=inside      หน้าเดียว (outside | inside | all)
 *   node sync-ssc.mjs --check            ไม่เขียนไฟล์ แค่บอกว่าเปลี่ยนไหม (exit 2 = เปลี่ยน)
 *   node sync-ssc.mjs --print            พิมพ์ HTML ที่จะได้ ไม่แตะไฟล์
 *   node sync-ssc.mjs --force            สร้างใหม่จากเทมเพลต แม้ข้อมูลไม่เปลี่ยน
 *   node sync-ssc.mjs --html=file.html   ใช้ HTML ที่บันทึกไว้ (ทดสอบออฟไลน์)
 *   node sync-ssc.mjs --no-lock-check    ข้ามการตรวจว่าลิงก์ต้องล็อกอิน CU account
 *
 * หลักการ (เหมือนเดิมทุกข้อ)
 *   - ข้อมูล (วันที่ / ลิงก์ / ชื่อเอกสาร / ช่องทางติดต่อ) มาจากต้นฉบับทุกครั้ง
 *   - ข้อความบรรยาย/โครงหน้า เป็น template ในไฟล์นี้
 *   - ถ้าดึงข้อมูลได้ไม่ครบตามที่คาด จะไม่เขียนทับ แล้วคืนค่าเดิมไว้ (exit 3)
 *   - ตรวจจริงว่าลิงก์ไหนต้องล็อกอิน CU account แล้วติดป้าย 🔒 ให้เอง
 *
 * ที่เปลี่ยนจากเดิม
 *   - ไม่ใช้ puppeteer/Chrome แล้ว: หน้า Google Sites ส่งเนื้อหามาใน HTML ตั้งแต่แรก
 *     (รวม data-embed-doc-id ของไฟล์ Drive และชื่อไฟล์จริงใน aria-label)
 *   - sync หลายหน้าในคำสั่งเดียว + จำ «สถานะ» ไว้เทียบรอบก่อน
 *     → รู้ว่าหัวข้อไหนเกิด/หาย/เปลี่ยนวัน แล้วเขียนลง docs/ssc-history.md
 *       พร้อมสรุปให้ CI เปิด issue (data/ssc-report.json)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  fetchPage, toTokens, section, thaiDateToIso, dateFromFilename, needsLogin,
} from './tools/ssc-source.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(ROOT, 'data', 'ssc-state.json');
const REPORT_FILE = path.join(ROOT, 'data', 'ssc-report.json');
const HISTORY_FILE = path.join(ROOT, 'docs', 'ssc-history.md');

// ── CLI ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = n => {
  const eq = argv.find(a => a.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const i = argv.indexOf('--' + n);
  return i > -1 ? argv[i + 1] : null;
};
const CHECK = flag('check');
const PRINT = flag('print');
const FORCE = flag('force');
const NO_LOCK = flag('no-lock-check');
const ONLY = (opt('page') || 'all').toLowerCase();
const HTML_FILE = opt('html');

const PAGES = [
  {
    key: 'outside',
    file: 'outside.html',
    url: 'https://sites.google.com/chula.md/ssc/outside',
    start: '<!-- SSC:AUTO:START -->',
    end: '<!-- SSC:AUTO:END -->',
    hashPrefix: 'SSC:DATA-HASH',
    parse: parseOutside,
    render: renderOutside,
    validate: validateOutside,
  },
  {
    key: 'inside',
    file: 'inside.html',
    url: 'https://sites.google.com/chula.md/ssc/inside',
    start: '<!-- SSC:INSIDE:START -->',
    end: '<!-- SSC:INSIDE:END -->',
    hashPrefix: 'SSC:INSIDE-HASH',
    parse: parseInside,
    render: renderInside,
    validate: validateInside,
  },
].filter(p => ONLY === 'all' || p.key === ONLY);

// ── utils ───────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = s => String(s == null ? '' : s).replace(/[\s\u00a0\u200b\u2063]+/g, ' ').trim();
/**
 * ข้อความไทยจากต้นฉบับมักมีช่องว่างคั่นกลางคำ เพราะแต่ละคำอยู่ใน <span> คนละอัน
 * เช่น «ภายในวัน ศุกร์ ที่ 6 พฤศจิกายน» → «ภายในวันศุกร์ที่ 6 พฤศจิกายน»
 * (ตัดช่องว่างเฉพาะ «ไทย–ไทย» ไม่แตะช่องว่างหน้าตัวเลข/อังกฤษ)
 */
const tightThai = s => norm(s).replace(/([\u0E00-\u0E7F])\s+([\u0E00-\u0E7F])/g, '$1$2');
const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const isoToday = new Date().toISOString().slice(0, 10);
const thaiToday = (d = new Date()) => `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`;
const isoToShortThai = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${Number(m[3])} ${TH_MONTH[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
};
const telHref = display => 'tel:' + String(display).split(/ต่อ|ext/i)[0].replace(/[^\d+]/g, '');
const LOCK = ' · 🔒 ต้องล็อกอิน CU account';
const lockOf = o => (o && o.locked === true ? LOCK : '');

const nowIso = (() => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00+07:00`;
})();

// ── ตัวช่วยอ่านข้อมูลจากโทเคน ──────────────────────────────────
const tokensText = tokens => tokens.map(t => t.text || '').join(' \n ');

/** ชื่อบุคลากร/เบอร์/Line/Teams/อีเมล จากบล็อก «สอบถามเพิ่มเติม» */
function parseContacts(tokens) {
  const text = norm(tokensText(tokens));
  const pick = re => (text.match(re) || [])[1] || '';
  const lineId = pick(/Line\s*ID:?\s*([A-Za-z0-9._-]+)/i);
  const teams = pick(/MS\s*Teams:?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)/i);
  const unitEmail = pick(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:ac\.th|com|md|co\.th)/) || 'acad@chula.md';
  const teacherName = pick(/(อ\.นพ\.[\u0E00-\u0E7F]+(?:\s+[\u0E00-\u0E7F]+){0,3})/) || 'อ.นพ.ทชา พิทยาพิบูลพงศ์';
  // MS Teams ที่อยู่ในบล็อกติดต่อเป็นของ «ชั้นปีที่ 6» ไม่ใช่ของอาจารย์
  // ช่องทางของอาจารย์คงที่ตามที่ฝ่ายวิชาการให้มา
  return { lineId, teams, unitEmail, teacherName, teacherTeams: 'Thacha.P@chula.ac.th' };
}

/** ไฟล์ Drive ที่ฝังในหน้า → { id, url, title, meta } */
function parseDocs(tokens) {
  const docs = [];
  tokens.forEach((tk, i) => {
    if (tk.t !== 'embed') return;
    let title = '';
    let paren = '';
    let yearThai = '';
    for (let k = i - 1; k >= 0 && k >= i - 6; k--) {
      const t = tokens[k];
      if (t.t !== 'p' && t.t !== 'plain') continue;
      const txt = norm(t.text);
      if (!txt) continue;
      if (/\.pdf\s*$/i.test(txt)) continue;          // คำบรรยายใต้ไฟล์ของรายการก่อนหน้า
      const pm = txt.match(/^\((.+)\)$/);
      if (pm && !paren) { paren = norm(pm[1]); continue; }
      // บรรทัดเดียวอาจมีทั้งชื่อเอกสารและ «ปีการศึกษา 2569» ต่อกัน
      const ym = txt.match(/ปีการศึกษา\s*([\d\s]{4,})/);
      if (ym) yearThai = ym[1].replace(/\s+/g, '');
      const pim = txt.match(/\(([^)]*\d{4}[^)]*)\)/);
      if (pim && !paren) paren = tightThai(pim[1]);
      const titlePart = tightThai(txt.split('ปีการศึกษา')[0]).replace(/\s*\([^)]*\)\s*$/, '');
      if (titlePart) { title = titlePart; break; }
    }
    const fileDate = dateFromFilename(tk.label);
    const metaBits = ['PDF'];
    if (yearThai) metaBits.push(`ปีการศึกษา ${yearThai}`);
    if (paren) metaBits.push(paren);
    else if (fileDate) metaBits.push(fileDate);
    docs.push({
      id: tk.id,
      url: `https://drive.google.com/file/d/${tk.id}/view`,
      title: title || 'เอกสาร',
      meta: metaBits.join(' · '),
      fileDate,
      label: tk.label,
      year: Number(((title || '').match(/ชั้นปีที่\s*(\d)/) || [])[1]) || 0,
    });
  });
  return docs;
}

// ── หน้า «นอกคณะ» ──────────────────────────────────────────────
function parseOutside(tokens) {
  const applyA = tokens.find(t => t.t === 'a' && /ช่องทางการส่งแบบแสดงความจำนง/.test(t.text));
  if (!applyA) throw new Error('หาลิงก์ช่องทางส่งแบบแสดงความจำนงไม่เจอ');

  const status = tokens
    .filter(t => t.t === 'a' && /^สถานะ\s*ชั้นปีที่/.test(t.text))
    .map(a => ({ year: Number((a.text.match(/ชั้นปีที่\s*(\d)/) || [])[1]), url: a.href }))
    .filter(s => s.year)
    .sort((a, b) => a.year - b.year);

  const scheduleSec = section(tokens, /การแสดงความจำนงรายวิชาเลือกนอกคณะ/);
  const schedule = [];
  for (const tk of scheduleSec) {
    const m = norm(tk.text).match(/^SSCs\s*(\d)\s*(R\d)?\s*(.*)$/);
    if (!m) continue;
    const [, year, round, rest] = m;
    let date = norm(rest);
    const unknown = !date || /^[-–—]+$/.test(date);
    if (unknown) date = 'ยังไม่ประกาศ';
    const label = round ? `SSCs ${year} · ${round}` : `SSCs ${year}`;
    if (schedule.some(s => s.label === label)) continue;
    schedule.push({ label, date, muted: unknown, year: Number(year) });
  }

  const docTokens = section(tokens, /หลักเกณฑ์การไปศึกษาและปฏิบัติงาน/);
  const docs = parseDocs(docTokens.length ? docTokens : tokens);
  const FORM_RE = /แบบแสดงความจำนง|หนังสือส่งตัว/;
  const forms = docs.filter(d => FORM_RE.test(d.title));
  const policies = docs.filter(d => !FORM_RE.test(d.title));

  const formA = tokens.find(t => t.t === 'a' && /docs\.google\.com\/forms\/d\//.test(t.href));
  const mouA = tokens.find(t => t.t === 'a' && /รายชื่อสถาบันที่มี MOU/.test(t.text));

  return {
    apply: { url: applyA.href, label: 'ส่งแบบแสดงความจำนง « นอกคณะ »', meta: 'ระบบ SSCs Application · เข้าด้วย CU account' },
    status,
    schedule,
    docs,
    forms,
    policies,
    form: { url: formA ? formA.href : '' },
    mou: { url: mouA ? mouA.href : '', label: 'รายชื่อสถาบันที่มี MOU กับคณะฯ', meta: 'สถาบันในรายการนี้เลือกไปเองไม่ได้' },
    contacts: parseContacts(section(tokens, /สอบถามเพิ่มเติม/)),
  };
}

function validateOutside(m, problems) {
  if (!m.apply.url) problems.push('ไม่พบช่องทางส่งแบบแสดงความจำนง');
  if (m.status.length < 3) problems.push(`ไม่พบลิงก์สถานะครบ 3 ชั้นปี (เจอ ${m.status.length})`);
  if (m.docs.length < 4) problems.push(`พบเอกสารแค่ ${m.docs.length} ฉบับ`);
  if (!m.forms.length) problems.push('ไม่พบเอกสารแบบฟอร์ม (แบบแสดงความจำนง/หนังสือส่งตัว)');
  if (m.schedule.length < 5) problems.push(`พบกำหนดการแค่ ${m.schedule.length} แถว`);
  if (!m.form.url) problems.push('ไม่พบฟอร์มข้อมูลผู้ประสานงาน');
  if (!m.mou.url) problems.push('ไม่พบรายชื่อสถาบัน MOU');
}

function timelineBlock(title, items) {
  return `        <div class="timeline-block fade-up">
          <h3 class="scan-title">${esc(title)}</h3>
          <div class="timeline-scroll">
            <ol class="round-timeline">
${items.map(i => `              <li class="${i.kind}"><span class="rt-label">${esc(i.label)}</span><span class="rt-date">${esc(i.date)}</span></li>`).join('\n')}
            </ol>
          </div>
        </div>`;
}

function renderOutside(m, stamp) {
  const timeline = timelineBlock('เส้นเวลารอบ SSCs', m.schedule.map(s => {
    const iso = s.muted ? null : (thaiDateToIso(s.date) || {}).iso;
    let kind = 'is-unknown';
    if (iso) {
      const days = (Date.parse(iso) - Date.now()) / 86400000;
      kind = days < 0 ? 'is-past' : (days <= 60 ? 'is-open' : '');
    }
    return { label: s.label, date: s.date, kind };
  }));

  const linkRow = (o, icon = '') => `              <li${o.year ? ` data-years="${o.year}"` : ''}>
                <a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">
                  <span class="ssc-link-title">${esc(icon)}${esc(o.title)}</span>
                  <span class="ssc-link-meta">${esc(o.meta)}${lockOf(o)}</span>
                </a>
              </li>`;

  const scheduleRows = m.schedule.map(s =>
    `              <li data-years="${s.year}"><span class="lbl">${esc(s.label)}</span><span class="date${s.muted ? ' is-empty' : ''}">${esc(s.date)}</span></li>`
  ).join('\n');

  const statusPills = m.status.map(s =>
    `            <a class="ssc-status" data-years="${s.year}" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">ชั้นปี ${s.year}</a>`
  ).join('\n');

  const formRows = m.forms.map(d => linkRow(d, '📄 ')).join('\n');
  const policyRows = m.policies.map(d => linkRow(d)).join('\n');
  const c = m.contacts;

  return `    <section class="ssc-section" id="ssc" data-verified="${isoToday}">
      <div class="container">
        <div class="section-header fade-up">
          <span class="section-badge">🎓</span>
          <h2 class="section-title">รายวิชาเลือก « นอกคณะ »</h2>
          <p class="section-sub">
            ยื่นความจำนง เช็คสถานะ โหลดหลักเกณฑ์ ของชั้นปี 4–6 อยู่ตรงนี้
          </p>
        </div>

        <!-- 2 ทางที่นิสิตใช้บ่อยที่สุด อยู่บนสุดและกดง่ายเป็นพิเศษ -->
        <div class="ssc-actions fade-up">
          <a class="ssc-cta" href="${esc(m.apply.url)}" target="_blank" rel="noopener noreferrer">
            <span class="ssc-cta-icon" aria-hidden="true">📝</span>
            <span class="ssc-cta-text">
              <span class="ssc-cta-title">${esc(m.apply.label)}</span>
              <span class="ssc-cta-meta">${esc(m.apply.meta)}</span>
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
              <strong>${esc(c.teacherName)}</strong> ·
              MS Teams <a href="mailto:${esc(c.teacherTeams)}">${esc(c.teacherTeams)}</a> ·
              ฝ่ายวิชาการ <a href="${esc(telHref('0-2256-4454'))}">0-2256-4454</a>
            </p>
          </div>
        </div>

${timeline}

        <div class="ssc-grid">
          <!-- แบบฟอร์มที่ใช้บ่อย -->
          <article class="ssc-card fade-up">
            <h3 class="ssc-title">แบบฟอร์มที่ต้องใช้</h3>
            <p class="ssc-desc">สองอันนี้ใช้บ่อยสุด โหลดเก็บไว้ตั้งแต่ต้นเทอม</p>
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
            <p class="ssc-note">«ยังไม่ประกาศ» = ในตารางต้นฉบับยังไม่มีวัน</p>
          </article>

          <!-- หลักเกณฑ์ · ประกาศ · รายชื่อ MOU -->
          <article class="ssc-card ssc-card--wide fade-up">
            <h3 class="ssc-title">หลักเกณฑ์และเอกสารอื่นๆ</h3>
            <p class="ssc-desc">ฉบับล่าสุดจากฝ่ายวิชาการ</p>
            <ul class="ssc-links">
${policyRows}
              <li>
                <a href="${esc(m.mou.url)}" target="_blank" rel="noopener noreferrer">
                  <span class="ssc-link-title">${esc(m.mou.label)}</span>
                  <span class="ssc-link-meta">${esc(m.mou.meta)}${lockOf(m.mou)}</span>
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
                ${esc(c.teacherName)}<br />
                MS Teams: <a href="mailto:${esc(c.teacherTeams)}">${esc(c.teacherTeams)}</a><br />
                ฝ่ายวิชาการ <a href="${esc(telHref('0-2256-4454'))}">0-2256-4454</a>
              </div>
              <div>
                <strong>ชั้นปีที่ 4 และ 5</strong>
                คุณนันทพัทธ์ หัสดินทร ณ อยุธยา<br />
                <a href="${esc(telHref('0-2256-4454'))}">0-2256-4454</a> ต่อ 125${c.lineId ? '<br />Line ID: ' + esc(c.lineId) : ''}
              </div>
              <div>
                <strong>ชั้นปีที่ 6</strong>
                คุณปิยะภัทร มานะสถิตพงศ์ (พี่แจ็ค)<br />
                <a href="${esc(telHref('0-2256-4454'))}">0-2256-4454</a> ต่อ 120${c.teams ? '<br />MS Teams: ' + esc(c.teams) : ''}
              </div>
            </div>
          </article>
        </div>

        <p class="ssc-stamp">
          ดึงข้อมูลจากเว็บ SSCs Guide อัตโนมัติ · ข้อมูลอัปเดตล่าสุด ${stamp} ·
          <a href="https://sites.google.com/chula.md/ssc/outside" target="_blank" rel="noopener noreferrer">ดูต้นฉบับ</a>
        </p>
      </div>
    </section>`;
}

// ── หน้า «ในคณะ» ───────────────────────────────────────────────
function parseInside(tokens) {
  const groups = [];
  const proposalSec = section(tokens, /การแสดงความจำนงรายวิชาเลือกในคณะ/);
  let cur = null;
  for (const tk of proposalSec) {
    const text = norm(tk.text);
    const m = text.match(/^ชั้นปีที่\s*(\d)\s*(.*)$/);
    if (tk.t === 'p' && m) {
      cur = {
        year: Number(m[1]), round: norm(m[2]), link: '', linkText: '',
        deadlineText: '', deadline: null, moved: false, reason: '', interested: false,
      };
      groups.push(cur);
      continue;
    }
    if (!cur) continue;
    if (tk.t === 'a' && !cur.link && /^https?:/.test(tk.href)) {
      cur.link = tk.href;
      cur.linkText = text;
      continue;
    }
    if (tk.t === 'p' || tk.t === 'plain') {
      if (!cur.linkText && /ช่องทางการแสดงความจำนง/.test(text)) { cur.linkText = text; continue; }
      if (/เฉพาะนิสิตที่สนใจ/.test(text)) { cur.interested = true; continue; }
      if (/นิสิตสามารถเปลี่ยนแปลง|จนถึงเวลาสิ้นสุด/.test(text)) continue;
      const dm = text.match(/ภายในวัน[^]{0,90}?\d{1,2}\s*[\u0E00-\u0E7F.]+\s*\d{4}(?:\s*เวลา\s*\d{1,2}[.:]\d{2})?(?:\s*น\.)?/);
      if (dm && !cur.deadline) {
        let phrase = tightThai(dm[0]);
        if (/เวลา\s*\d{1,2}[.:]\d{2}$/.test(phrase)) phrase += ' น.';
        cur.deadlineText = phrase;
        cur.deadline = thaiDateToIso(dm[0]);
        cur.moved = /เลื่อน/.test(text);
        const rm = text.match(/เนื่องจาก\s*([^]*)$/);
        if (rm) cur.reason = norm(rm[1]);
      }
    }
  }
  groups.sort((a, b) => a.year - b.year || a.round.localeCompare(b.round, 'th'));
  for (const g of groups) g.key = `${g.year}${g.round ? ' · ' + g.round : ''}`;

  // ชีตข้อมูลรายวิชา: ย่อหน้ารวม «ชั้นปีที่ 4 ข้อมูลรายวิชารอบแรก» แล้วตามด้วยลิงก์
  const sheetSec = section(tokens, /ข้อมูล\s*รายวิชาเลือก\s*ใน\s*คณะ/);
  const sheets = [];
  let pendingYear = null, pendingSet = '';
  for (const tk of sheetSec) {
    const text = norm(tk.text);
    if (tk.t === 'p' || tk.t === 'plain') {
      const m = text.match(/^ชั้นปีที่\s*(\d)\s*(?:ข้อมูลรายวิชา\s*(รอบแรก|คงเหลือ)?)?$/);
      if (m) { pendingYear = Number(m[1]); if (m[2]) pendingSet = m[2]; continue; }
      const m2 = text.match(/^ข้อมูลรายวิชา\s*(รอบแรก|คงเหลือ)$/);
      if (m2) { pendingSet = m2[1]; continue; }
    }
    if (tk.t === 'a' && /spreadsheets/.test(tk.href) && pendingYear) {
      sheets.push({
        year: pendingYear,
        set: pendingSet || 'รอบแรก',
        url: tk.href,
        gid: (tk.href.match(/gid=(\d+)/) || [])[1] || '',
      });
      pendingYear = null;
    }
  }
  const sets = [...new Set(sheets.map(s => s.set))];

  const cucis = tokens.find(t => t.t === 'a' && /cucis\.academic\.chula\.ac\.th/.test(t.href));

  const centralSec = section(tokens, /กรณี\s*รายวิชาเลือกในคณะโดยใช้รายวิชากลาง/);
  const centralEmbed = centralSec.find(t => t.t === 'embed');
  const centralPortal = centralSec.find(t => t.t === 'a' && /SSCsapplication/.test(t.href));
  const versionText = norm((centralSec.find(t => /ใช้แบบฟอร์ม version/.test(norm(t.text))) || {}).text || '');

  const h1 = (tokens.find(t => t.t === 'h' && t.level === 1) || {}).text || '';
  const h3 = (tokens.find(t => t.t === 'h' && t.level === 3) || {}).text || '';

  return {
    title: norm(h1),
    subtitle: norm(h3),
    groups,
    sheets,
    sets,
    sheetsLocked: { locked: false },
    cucis: cucis ? { url: cucis.href, label: 'ระบบโครงสร้างหลักสูตรและเนื้อหารายวิชา (CUCIS)' } : null,
    central: {
      portalObj: { url: centralPortal ? centralPortal.href : '' },
      pdf: centralEmbed ? {
        id: centralEmbed.id,
        url: `https://drive.google.com/file/d/${centralEmbed.id}/view`,
        label: norm(centralEmbed.label.replace(/^Drive,\s*/, '').replace(/\.pdf$/i, '')),
      } : null,
      version: versionText,
    },
    contacts: parseContacts(section(tokens, /สอบถามเพิ่มเติม/)),
  };
}

function validateInside(m, problems) {
  if (!m.groups.length) problems.push('ไม่พบกลุ่มการแสดงความจำนงเลย');
  if (m.sheets.length < 6) problems.push(`พบลิงก์ชีตข้อมูลแค่ ${m.sheets.length} (คาด 6)`);
  if (!m.cucis) problems.push('ไม่พบลิงก์ CUCIS');
  if (!m.central.portalObj.url) problems.push('ไม่พบช่องทางส่งแบบแสดงความจำนง « ในคณะโดยใช้รายวิชากลาง »');
  if (!m.central.pdf) problems.push('ไม่พบไฟล์แบบแสดงความจำนง (PDF)');
}

function gradeOf(g) {
  if (!g.deadline) return { kind: 'wait', text: '🕓 รอประกาศ' };
  const past = new Date(g.deadline.iso).getTime() < Date.now();
  const date = isoToShortThai(g.deadline.iso);
  if (g.moved) return { kind: past ? 'closed' : 'moved', text: past ? `🔴 ปิดแล้ว ${date} (เลื่อน)` : `🟡 เลื่อนเป็น ${date}` };
  return { kind: past ? 'closed' : 'open', text: past ? `🔴 ปิดแล้ว ${date}` : `🟢 เปิดถึง ${date}` };
}

function renderInside(m, stamp) {
  const c = m.contacts;
  const years = [4, 5, 6];
  const groupOfYear = y => m.groups.filter(g => g.year === y);

  const rows = [];
  for (const y of years) {
    const gs = groupOfYear(y);
    const sheetsOfYear = m.sheets.filter(s => s.year === y);
    const sheetCell = sheetsOfYear.length
      ? `${sheetsOfYear.length} ชีต${m.sets.length ? ' (' + [...new Set(sheetsOfYear.map(s => s.set))].join(' · ') + ')' : ''}`
      : '—';
    if (!gs.length) {
      rows.push({ year: y, round: '', channel: '<span class="ys-none">ยังไม่ประกาศ</span>', sheets: sheetCell, grade: { kind: 'wait', text: '🕓 รอประกาศ' } });
      continue;
    }
    for (const g of gs) {
      const hosted = /docs\.google\.com\/forms/.test(g.link);
      const channel = g.link
        ? `<a href="${esc(g.link)}" target="_blank" rel="noopener noreferrer">${hosted ? 'Google Form' : 'SSCs Application'}</a>${lockOf(g)}`
        : '<span class="ys-none">—</span>';
      rows.push({ year: y, round: g.round, channel, sheets: sheetCell, grade: gradeOf(g) });
    }
  }

  const statusRows = rows.map(r => `              <tr data-years="${r.year}">
                <th scope="row">ชั้นปีที่ ${r.year}${r.round ? ' · ' + esc(r.round) : ''}</th>
                <td data-label="ช่องทางยื่น">${r.channel}</td>
                <td data-label="ข้อมูลรายวิชา">${esc(r.sheets)}</td>
                <td data-label="สถานะ"><span class="ys-badge ys-${r.grade.kind}">${esc(r.grade.text)}</span></td>
              </tr>`).join('\n');

  const missingYears = years.filter(y => !groupOfYear(y).length);

  // เส้นเวลารอบการแสดงความจำนง (กวาดตาเห็นว่าอะไรเปิด/ปิด/เลื่อน)
  const insideTimeline = timelineBlock('เส้นเวลารอบการยื่น « ในคณะ »', m.groups.map(g => {
    const grade = gradeOf(g);
    const kind = grade.kind === 'closed' ? 'is-past'
      : grade.kind === 'open' ? 'is-open'
        : grade.kind === 'moved' ? 'is-moved' : 'is-unknown';
    return {
      label: `ป.${g.year}${g.round ? ' ' + g.round : ''}`,
      date: g.deadline ? isoToShortThai(g.deadline.iso) : 'ยังไม่ประกาศ',
      kind,
    };
  }));

  const groupCards = m.groups.map(g => {
    const grade = gradeOf(g);
    const desc = g.deadlineText
      ? `${g.moved ? '<strong>เลื่อน!!</strong> ' : ''}${esc(g.deadlineText)}`
      : 'ยังไม่ประกาศกำหนดการ';
    const notes = [];
    if (g.interested) notes.push('เฉพาะนิสิตที่สนใจ');
    if (g.reason) notes.push(`เหตุผลที่เลื่อน: ${g.reason}`);
    if (grade.kind === 'closed') notes.push('ปิดรับแล้ว — ติดต่อฝ่ายวิชาการหากต้องการแก้ไข');
    return `          <article class="ssc-card fade-up" data-years="${g.year}"${g.deadline ? ` data-deadline="${esc(g.deadline.iso)}"` : ''}>
            <h3 class="ssc-title">ชั้นปีที่ ${g.year}${g.round ? ' · ' + esc(g.round) : ''}</h3>
            <p class="ssc-desc">${desc}</p>
            <ul class="ssc-links">
              <li>
                <a href="${esc(g.link)}" target="_blank" rel="noopener noreferrer">
                  <span class="ssc-link-title">📝 ${esc(g.linkText || 'ช่องทางการแสดงความจำนง')}</span>
                  <span class="ssc-link-meta">${/docs\.google\.com\/forms/.test(g.link) ? (g.locked ? 'Google Form' : 'Google Form · ไม่ต้องล็อกอิน') : 'ระบบ SSCs Application'}${lockOf(g)}</span>
                </a>
              </li>
            </ul>
${notes.length ? `            <p class="ssc-note">${notes.map(esc).join(' · ')}</p>\n` : ''}          </article>`;
  }).join('\n');

  const sheetCards = m.sets.map(set => {
    const items = m.sheets.filter(s => s.set === set)
      .sort((a, b) => a.year - b.year)
      .map(s => `              <li>
                <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">
                  <span class="ssc-link-title">ชั้นปีที่ ${s.year}</span>
                  <span class="ssc-link-meta">Google Sheets${lockOf(m.sheetsLocked)}</span>
                </a>
              </li>`).join('\n');
    return `          <article class="ssc-card ssc-card--wide fade-up">
            <h3 class="ssc-title">ข้อมูลรายวิชา · ${esc(set)}</h3>
            <p class="ssc-desc">${set === 'คงเหลือ' ? 'รายวิชาที่ที่นั่งยังเหลือ หลังรอบแรก' : 'รายวิชาที่เปิดในรอบนี้ แยกตามชั้นปี'}</p>
            <ul class="ssc-links">
${items}
            </ul>
          </article>`;
  }).join('\n');

  const cucisCard = m.cucis ? `          <article class="ssc-card fade-up">
            <h3 class="ssc-title">เนื้อหารายวิชา</h3>
            <p class="ssc-desc">ดูคำอธิบายรายวิชา หน่วยกิต และเงื่อนไขการลงทะเบียน</p>
            <ul class="ssc-links">
              <li>
                <a href="${esc(m.cucis.url)}" target="_blank" rel="noopener noreferrer">
                  <span class="ssc-link-title">${esc(m.cucis.label)}</span>
                  <span class="ssc-link-meta">เว็บจุฬาฯ · เปิดได้ทุกคน</span>
                </a>
              </li>
            </ul>
          </article>` : '';

  const centralCard = `          <article class="ssc-card ssc-card--wide fade-up">
            <h3 class="ssc-title">ช่องทางและแบบฟอร์ม</h3>
            <p class="ssc-desc">${esc(m.central.version || 'ใช้แบบฟอร์มฉบับล่าสุดจากฝ่ายวิชาการ')}</p>
            <ul class="ssc-links">
              <li>
                <a href="${esc(m.central.portalObj.url)}" target="_blank" rel="noopener noreferrer">
                  <span class="ssc-link-title">📝 ช่องทางการส่งแบบแสดงความจำนง « ในคณะโดยใช้รายวิชากลาง »</span>
                  <span class="ssc-link-meta">ระบบ SSCs Application${lockOf(m.central.portalObj)}</span>
                </a>
              </li>
${m.central.pdf ? `              <li>
                <a href="${esc(m.central.pdf.url)}" target="_blank" rel="noopener noreferrer">
                  <span class="ssc-link-title">📄 ${esc(m.central.pdf.label || 'แบบแสดงความจำนง')}</span>
                  <span class="ssc-link-meta">PDF · ฉบับล่าสุดจากฝ่ายวิชาการ</span>
                </a>
              </li>
` : ''}            </ul>
          </article>`;

  return `    <section class="ssc-section" id="ssc-inside" data-verified="${isoToday}">
      <div class="container">
        <div class="section-header fade-up">
          <span class="section-badge">🎓</span>
          <h2 class="section-title">การแสดงความจำนงรายวิชาเลือกในคณะ</h2>
          <p class="section-sub">
            ยื่นความจำนงหรือแก้ไขรายวิชาได้จนถึงเวลาสิ้นสุดที่ต้นฉบับกำหนด
          </p>
        </div>

        <div class="year-status fade-up">
          <table class="ys-table">
            <caption class="sr-only">สถานะการแสดงความจำนงรายชั้นปี</caption>
            <thead>
              <tr>
                <th scope="col">ชั้นปี</th>
                <th scope="col">ช่องทางยื่น</th>
                <th scope="col">ข้อมูลรายวิชา</th>
                <th scope="col">สถานะ</th>
              </tr>
            </thead>
            <tbody>
${statusRows}
            </tbody>
          </table>
${missingYears.length ? `          <p class="ys-note">
            ต้นฉบับยังไม่มีกลุ่มของ ${missingYears.map(y => `«ชั้นปีที่ ${y}»`).join(' และ ')} — เมื่อฝ่ายวิชาการประกาศ ระบบจะเพิ่มให้อัตโนมัติ
            (หน้านี้ดึงข้อมูลจากเว็บ SSCs Guide)
          </p>
` : ''}        </div>

${insideTimeline}

        <div class="ssc-grid">
${groupCards}
        </div>

        <div class="section-header fade-up">
          <span class="section-badge">📚</span>
          <h2 class="section-title">ข้อมูลรายวิชาเลือกในคณะ</h2>
          <p class="section-sub">
            ตารางรายวิชาแยกชั้นปี${m.sets.length ? ' · ' + m.sets.map(s => `«${s}»`).join(' และ ') : ''} — ทุกชีตล็อกด้วย CU account
          </p>
        </div>

        <div class="ssc-grid">
${sheetCards}
${cucisCard}
        </div>

        <div class="section-header fade-up">
          <span class="section-badge">🔁</span>
          <h2 class="section-title">กรณีใช้ « รายวิชากลาง »</h2>
          <p class="section-sub">
            การเลือกรายวิชาในคณะโดยใช้รายวิชาที่บริหารจัดการโดยส่วนกลาง
          </p>
        </div>

        <div class="ssc-grid">
${centralCard}
        </div>

        <div class="section-header fade-up">
          <span class="section-badge">💬</span>
          <h2 class="section-title">สอบถามเพิ่มเติม</h2>
          <p class="section-sub">หน่วยการศึกษาชั้นปริญญาตรี · ฝ่ายวิชาการ คณะแพทยศาสตร์ จุฬาฯ</p>
        </div>

        <div class="ssc-grid">
          <article class="ssc-card ssc-card--wide fade-up">
            <div class="ssc-contact">
              <div>
                <strong>ชั้นปีที่ 4 และ 5</strong>
                คุณนันทพัทธ์ หัสดินทร ณ อยุธยา<br />
                <a href="${esc(telHref('0-2256-4454'))}">0-2256-4454</a> ต่อ 125${c.lineId ? '<br />Line ID: ' + esc(c.lineId) : ''}
              </div>
              <div>
                <strong>ชั้นปีที่ 6</strong>
                คุณปิยะภัทร มานะสถิตพงศ์ (พี่แจ็ค)<br />
                <a href="${esc(telHref('0-2256-4454'))}">0-2256-4454</a> ต่อ 120${c.teams ? '<br />MS Teams: <a href="mailto:' + esc(c.teams) + '">' + esc(c.teams) + '</a>' : ''}
              </div>
              <div>
                <strong>ฝ่ายวิชาการ</strong>
                <a href="tel:022564454">0-2256-4454</a>, 0-2256-4478<br />
                <a href="mailto:${esc(c.unitEmail)}">${esc(c.unitEmail)}</a><br />
                อาคารอานันทมหิดล ชั้น 4 เลขที่ 1873 ถนนพระรามที่ 4<br />
                เขตปทุมวัน กรุงเทพมหานคร 10330
              </div>
            </div>
          </article>
        </div>

        <p class="ssc-stamp">
          หน้านี้ดึงข้อมูลจากเว็บ SSCs Guide อัตโนมัติ · อัปเดตล่าสุด ${stamp} ·
          <a href="https://sites.google.com/chula.md/ssc/inside" target="_blank" rel="noopener noreferrer">ดูต้นฉบับ</a>
        </p>
      </div>
    </section>`;
}

// ── snapshot สำหรับเทียบรอบก่อน ────────────────────────────────
function snapshot(pageKey, m) {
  if (pageKey === 'outside') {
    return {
      apply: m.apply.url,
      schedule: m.schedule.map(s => [s.label, s.date]),
      status: m.status.map(s => [s.year, s.url, s.locked ? 1 : 0]),
      docs: m.docs.map(d => [d.id, d.title, d.meta, d.locked ? 1 : 0]),
      form: m.form.url,
      mou: [m.mou.url, m.mou.locked ? 1 : 0],
    };
  }
  return {
    groups: m.groups.map(g => [g.key, g.link, g.deadline ? g.deadline.iso : '', !!g.moved, !!g.interested, g.locked ? 1 : 0]),
    sheets: m.sheets.map(s => [s.year, s.set, s.gid, s.locked ? 1 : 0]),
    central: [m.central.portalObj.url, m.central.portalObj.locked ? 1 : 0, m.central.pdf ? m.central.pdf.id : ''],
    cucis: m.cucis ? [m.cucis.url, m.cucis.locked ? 1 : 0] : ['', 0],
  };
}

function diffSnapshots(pageKey, prev, next) {
  const out = [];
  const p = prev || {};
  if (pageKey === 'outside') {
    const prevSched = new Map((p.schedule || []).map(([l, d]) => [l, d]));
    for (const [label, date] of next.schedule) {
      if (!prevSched.has(label)) out.push(`กำหนดการใหม่: ${label} = ${date}`);
      else if (prevSched.get(label) !== date) out.push(`กำหนดการเปลี่ยน: ${label} ${prevSched.get(label)} → ${date}`);
      prevSched.delete(label);
    }
    for (const label of prevSched.keys()) out.push(`กำหนดการหายไป: ${label}`);

    const prevDocs = new Map((p.docs || []).map(([id, title]) => [id, title]));
    for (const [id, title] of next.docs) {
      if (!prevDocs.has(id)) out.push(`เอกสารใหม่: ${title}`);
      else if (prevDocs.get(id) !== title) out.push(`ชื่อเอกสารเปลี่ยน: ${title}`);
      prevDocs.delete(id);
    }
    for (const title of prevDocs.values()) out.push(`เอกสารหายไป: ${title}`);
    if (p.apply !== next.apply) out.push('ช่องทางส่งแบบแสดงความจำนงเปลี่ยน');
  } else {
    const prevGroups = new Map((p.groups || []).map(g => [g[0], g]));
    for (const g of next.groups) {
      const old = prevGroups.get(g[0]);
      if (!old) out.push(`เพิ่มกลุ่ม ${g[0]}`);
      else if ((old[2] || '') !== (g[2] || '')) out.push(`${g[0]}: วันหมดเขต ${isoToShortThai(old[2]) || '—'} → ${isoToShortThai(g[2]) || '—'}`);
      else if (!!old[3] !== !!g[3]) out.push(`${g[0]}: ${g[3] ? 'ถูกเลื่อนกำหนด' : 'ยกเลิกการเลื่อน'}`);
      prevGroups.delete(g[0]);
    }
    for (const key of prevGroups.keys()) out.push(`กลุ่มหายไป: ${key}`);

    // เทียบ «ตัวชีต» ด้วยปี+ชุด+gid (ป้ายล็อกอินไม่นับเป็นการเปลี่ยนข้อมูล)
    const sheetKey = s => `${s[0]}|${s[1]}|${s[2]}`;
    const prevSheets = new Set((p.sheets || []).map(sheetKey));
    const nextSheets = new Set(next.sheets.map(sheetKey));
    for (const s of nextSheets) if (!prevSheets.has(s)) out.push(`ชีตข้อมูลใหม่/เปลี่ยน: ${s.split('|').slice(0, 2).join(' · ')}`);
    for (const s of prevSheets) if (!nextSheets.has(s)) out.push(`ชีตข้อมูลหายไป: ${s.split('|').slice(0, 2).join(' · ')}`);

    const cucisUrl = v => (Array.isArray(v) ? v[0] : v) || '';
    if (cucisUrl(p.cucis) !== cucisUrl(next.cucis)) out.push('ลิงก์ CUCIS เปลี่ยน');
    const centralKey = v => (Array.isArray(v) ? [v[0], v[2]].join('|') : String(v || ''));
    if (centralKey(p.central) !== centralKey(next.central)) out.push('ช่องทาง/ไฟล์ «รายวิชากลาง» เปลี่ยน');
  }
  return out;
}

const hashOf = snap => crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex').slice(0, 12);

function countsOf(key, m) {
  return key === 'outside'
    ? `กำหนดการ ${m.schedule.length} แถว · เอกสาร ${m.docs.length} ฉบับ · สถานะ ${m.status.length} ชั้นปี`
    : `กลุ่ม ${m.groups.length} · ชีต ${m.sheets.length} · PDF ${m.central.pdf ? 1 : 0}`;
}

// ── main ────────────────────────────────────────────────────────
(async () => {
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
  const prevPages = state.pages || {};
  const nextPages = { ...prevPages };
  const report = { checkedAt: nowIso, changed: false, pages: {}, changes: [] };
  const stamp = thaiToday();
  const touched = [];
  const models = {};

  for (const page of PAGES) {
    const src = HTML_FILE ? fs.readFileSync(HTML_FILE, 'utf8') : await fetchPage(page.url);
    const tokens = toTokens(src);
    const model = page.parse(tokens);
    models[page.key] = model;

    // ตรวจว่าลิงก์ไหนต้องล็อกอิน CU account
    if (!NO_LOCK && !HTML_FILE) {
      const targets = page.key === 'outside'
        ? [model.apply, ...model.status, ...model.docs, model.form, model.mou]
        : [
          ...model.groups,
          ...model.sheets,
          model.central.portalObj,
          ...(model.central.pdf ? [model.central.pdf] : []),
          ...(model.cucis ? [model.cucis] : []),
        ];
      for (const t of targets) {
        const url = t && (t.url || t.link);
        if (!url || !/^https?:/.test(url)) continue;
        let r = await needsLogin(url);
        if (r === null) r = await needsLogin(url);   // ลองอีกรอบ กันเน็ตสะดุด
        t.locked = r === true;
        if (r === null) console.warn('  ! ตรวจสถานะลิงก์ไม่ได้:', url);
      }
      if (page.key === 'inside') {
        model.sheetsLocked = { locked: model.sheets.length > 0 && model.sheets.every(s => s.locked === true) };
      }
    } else if (page.key === 'inside') {
      model.sheetsLocked = { locked: true };   // ชีตข้อมูลทุกตัวล็อกด้วย CU account (ตรวจแล้ว)
    }

    const problems = [];
    page.validate(model, problems);
    if (problems.length) {
      console.error(`✗ ${page.file}: ข้อมูลจากต้นฉบับไม่ครบ — ไม่แก้ไฟล์:`);
      problems.forEach(p => console.error('   - ' + p));
      report.pages[page.key] = { ok: false, problems };
      process.exitCode = 3;
      continue;
    }

    const snap = snapshot(page.key, model);
    const hash = hashOf(snap);
    const html = fs.readFileSync(path.join(ROOT, page.file), 'utf8');
    const start = html.indexOf(page.start);
    const end = html.indexOf(page.end);
    if (start === -1 || end === -1) throw new Error(`ไม่พบ marker ${page.start} ใน ${page.file}`);

    const hashRe = new RegExp(`<!-- ${page.hashPrefix}:([a-f0-9]{12}) -->`);
    const currentHash = (html.slice(start, end + 200).match(hashRe) || [, ''])[1];
    const prevSnap = (prevPages[page.key] || {}).snapshot;
    const changes = prevSnap
      ? diffSnapshots(page.key, prevSnap, snap)
      : [`เริ่มติดตามข้อมูลครั้งแรก (${countsOf(page.key, model)})`];
    const changed = currentHash !== hash;

    report.pages[page.key] = { ok: true, hash, changed, changes, counts: countsOf(page.key, model) };
    if (changes.length) report.changes.push(...changes.map(c => `${page.key}: ${c}`));
    if (changes.length || changed) report.changed = true;
    nextPages[page.key] = { hash, snapshot: snap };

    console.log(`⤓ ${page.file} — ${countsOf(page.key, model)}`);
    if (currentHash && currentHash !== hash) console.log(`   hash ${currentHash} → ${hash}`);
    changes.forEach(c => console.log(`   • ${c}`));

    if (PRINT) {
      console.log(page.render(model, stamp));
      continue;
    }
    if (CHECK) continue;
    if (!changed && !FORCE) continue;

    const rendered = page.render(model, stamp);
    const hashLine = `<!-- ${page.hashPrefix}:${hash} -->`;
    const tail = html.slice(end + page.end.length)
      .replace(new RegExp(`^(\\s*<!-- ${page.hashPrefix}:[a-f0-9]{12} -->\\s*)+`), '\n    ');
    const next = html.slice(0, start + page.start.length) + '\n' + rendered + '\n    ' + page.end + '\n    ' + hashLine + tail;
    fs.writeFileSync(path.join(ROOT, page.file), next);
    touched.push(page.file);
    console.log(`   → เขียน ${page.file} แล้ว`);
  }

  if (PRINT) process.exit(process.exitCode || 0);

  if (!CHECK) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    // เขียน state เฉพาะเมื่อเนื้อหาเปลี่ยน — ไม่งั้น repo จะมี commit ทุกครั้งที่รัน
    const stateJson = JSON.stringify({ pages: nextPages }, null, 2) + '\n';
    const stateOld = fs.existsSync(STATE_FILE) ? fs.readFileSync(STATE_FILE, 'utf8') : '';
    if (stateJson !== stateOld) fs.writeFileSync(STATE_FILE, stateJson);
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
    if (report.changes.length) {
      fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
      const header = '# ประวัติการเปลี่ยนข้อมูล SSCs Guide\n\nไฟล์นี้สร้างจาก `npm run sync` — ห้ามแก้ด้วยมือ\n\n';
      const head = fs.existsSync(HISTORY_FILE) ? fs.readFileSync(HISTORY_FILE, 'utf8') : header;
      const lines = report.changes.map(c => `- ${stamp} · ${c}`).join('\n');
      fs.writeFileSync(HISTORY_FILE, head + lines + '\n');
    }
    console.log(`\n${report.changed ? '• มีการเปลี่ยนแปลง' : '✓ ข้อมูลตรงกับต้นฉบับอยู่แล้ว'}${touched.length ? ' · เขียนไฟล์: ' + touched.join(', ') : ' · ไม่มีไฟล์ที่ต้องเขียน'}`);
  }

  if (CHECK) process.exit(report.changed ? 2 : 0);
  if (process.exitCode === 3) process.exit(3);
})().catch(e => {
  console.error('✗ ' + e.message);
  process.exit(1);
});

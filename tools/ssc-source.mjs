/**
 * tools/ssc-source.mjs — อ่านหน้าเว็บต้นฉบับ SSCs Guide (Google Sites)
 *
 * ทำไมไม่ใช้ Chrome แล้ว
 *   Google Sites ส่งเนื้อหามาใน HTML ตั้งแต่แรก (SSR) — รวมถึง id ของไฟล์ Drive
 *   ที่ฝังอยู่ (data-embed-doc-id) และชื่อไฟล์จริง (aria-label)
 *   จึงดึงด้วย fetch ธรรมดาได้ ไม่ต้องพึ่ง puppeteer/Chrome อีก
 *   → sync รันได้ทุกที่ เร็ว และเบามาก (เดิมต้องติดตั้ง Chrome ~150 MB)
 *
 * วิธีทำงาน
 *   1) fetchPage(url)            ดึง HTML ดิบ
 *   2) toTokens(html)            แปลงเป็น «โทเคน» เรียงตามลำดับบนหน้า
 *                                (หัวข้อ / ย่อหน้า / ลิงก์ / ไฟล์ฝัง)
 *   3) helpers ด้านล่าง           หา section, unwrap ลิงก์ Google, แปลงวันที่ไทย
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchPage(url, { timeout = 45000 } = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': UA, 'accept-language': 'th,en;q=0.8' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`ดึงหน้าไม่สำเร็จ (HTTP ${res.status}): ${url}`);
  return res.text();
}

// ลิงก์ในต้นฉบับถูกห่อด้วย https://www.google.com/url?q=… — ใช้ปลายทางจริง
export function unwrap(href) {
  if (!href) return '';
  // href ใน HTML มัก escape &amp; → ถอดก่อน ไม่งั้น query string เพี้ยน
  const raw = href.replace(/&amp;/g, '&').replace(/&#38;/g, '&');
  try {
    const u = new URL(raw.startsWith('//') ? 'https:' + raw : raw, 'https://example.invalid');
    if (u.pathname === '/url' && /(^|\.)google\.com$/.test(u.hostname)) {
      const q = u.searchParams.get('q');
      if (q) return q;
    }
    return raw;
  } catch {
    return raw;
  }
}

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&lt;': '<', '&gt;': '>', '&laquo;': '«', '&raquo;': '»',
};
const decode = s => s.replace(/&(nbsp|amp|quot|#39|apos|lt|gt|laquo|raquo);/g, m => ENTITIES[m] ?? m);
const clean = s => decode(s).replace(/[\s\u00a0\u200b]+/g, ' ').trim();

/**
 * แปลง HTML ของ Google Sites เป็นโทเคนเรียงตามลำดับการอ่าน
 * คืนค่าเป็น array ของ
 *   { t:'h', level, text }          หัวข้อ h1–h4
 *   { t:'p', text }                 ย่อหน้า
 *   { t:'li', text }                รายการ
 *   { t:'a', href, text }           ลิงก์ (text = ข้อความที่อยู่ในลิงก์)
 *   { t:'embed', id, label }        ไฟล์ Drive ที่ฝังในหน้า
 *   { t:'plain', text }             ข้อความลอย (ไม่มีแท็กห่อ)
 */
export function toTokens(html) {
  let s = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // ไฟล์ Drive: เก็บ id + ชื่อไฟล์จริงจาก aria-label ของ iframe
  s = s.replace(/<div[^>]*data-embed-doc-id="([^"]+)"[^>]*>([\s\S]{0,2000}?)<iframe[^>]*aria-label="([^"]*)"[^>]*>/gi,
    (m, id, mid, label) => `\u2063⟦EMBED:${id}⟧⟦LABEL:${label}⟧`);
  s = s.replace(/<div[^>]*data-embed-doc-id="([^"]+)"[^>]*>/gi, (m, id) => `\u2063⟦EMBED:${id}⟧`);
  s = s.replace(/<iframe[^>]*aria-label="([^"]*)"[^>]*>/gi, (m, label) => `⟦LABEL:${label}⟧`);

  s = s.replace(/<h([1-4])[^>]*>/gi, (m, n) => `\n⟪H${n}⟫`);
  s = s.replace(/<\/h[1-4]>/gi, '\n');
  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>/gi, (m, href) => `⟦A:${href}⟧`);
  s = s.replace(/<\/a>/gi, '⟦/A⟧');
  s = s.replace(/<li\b[^>]*>/gi, '\n⟪LI⟫');
  s = s.replace(/<\/li>/gi, '\n');
  s = s.replace(/<p\b[^>]*>/gi, '\n⟪P⟫');
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, ' ');
  s = s.replace(/<\/(div|td|tr|table|section|article)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');

  const tokens = [];
  const re = /⟦A:([^⟧]*)⟧|⟦\/A⟧|⟦EMBED:([^⟧]+)⟧|⟦LABEL:([^⟧]*)⟧|⟪(H[1-4]|P|LI)⟫/g;
  let buf = '';
  let pending = null;      // 'p' | 'li' | 'H1'..'H4'
  let link = null;         // { href, parts: [] }
  let lastEmbed = null;

  const flush = () => {
    const text = clean(buf);
    buf = '';
    if (!text) { pending = null; return; }
    if (link) { link.parts.push(text); pending = null; return; }
    if (!pending) tokens.push({ t: 'plain', text });
    else if (pending.startsWith('H')) tokens.push({ t: 'h', level: Number(pending[1]), text });
    else if (pending === 'P') tokens.push({ t: 'p', text });
    else if (pending === 'LI') tokens.push({ t: 'li', text });
    pending = null;
  };

  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    buf += s.slice(last, m.index);
    last = re.lastIndex;

    if (m[1] !== undefined) {
      flush();
      link = { href: unwrap(m[1]), parts: [] };
    } else if (m[0] === '⟦/A⟧') {
      flush();
      if (link) {
        const text = clean(link.parts.join(' '));
        if (link.href) tokens.push({ t: 'a', href: link.href, text });
        link = null;
      }
    } else if (m[2] !== undefined) {
      flush();
      lastEmbed = { t: 'embed', id: m[2], label: '' };
      tokens.push(lastEmbed);
    } else if (m[3] !== undefined) {
      flush();
      const label = clean(m[3]);
      if (lastEmbed && /^Drive/i.test(label)) lastEmbed.label = label;
    } else if (m[4]) {
      flush();
      pending = m[4];
    }
  }
  buf += s.slice(last);
  flush();
  if (link) {
    const text = clean(link.parts.join(' '));
    if (link.href) tokens.push({ t: 'a', href: link.href, text });
  }

  // ลิงก์ที่ไม่มีข้อความ (anchor ครอบบล็อกทั้งบล็อก) ต้องเก็บไว้เพราะ href มีค่า
  return tokens.filter(tk => (tk.t === 'embed' || tk.t === 'a' ? true : tk.text !== ''));
}

// ── helpers ─────────────────────────────────────────────────────
export const textOf = tk => (tk && tk.text) || '';

/** หา «section» ตามหัวข้อ (h1–h3) คืนโทเคนตั้งแต่หัวข้อจนถึงหัวข้อระดับเดียวกัน/สูงกว่า */
export function section(tokens, headingRe) {
  const start = tokens.findIndex(tk => tk.t === 'h' && headingRe.test(tk.text));
  if (start === -1) return [];
  const level = tokens[start].level;
  let end = tokens.length;
  for (let i = start + 1; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t === 'h' && tk.level <= level) { end = i; break; }
  }
  return tokens.slice(start + 1, end);
}

/** ทุกย่อหน้า/ข้อความใน section ตามเงื่อนไข */
export const matchP = (tokens, re) => tokens.filter(tk => (tk.t === 'p' || tk.t === 'plain' || tk.t === 'li') && re.test(tk.text));

/** ลิงก์ใน section ที่ข้อความตรงเงื่อนไข (หรือ href ตรงเงื่อนไข) */
export const matchA = (tokens, reText, reHref) =>
  tokens.filter(tk => tk.t === 'a' && ((reText && reText.test(tk.text)) || (reHref && reHref.test(tk.href))));

/** วันที่ไทย → ISO (ค.ศ.) เช่น «6 พฤศจิกายน 2569 เวลา 20.00 น.» → 2026-11-06T20:00+07:00 */
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export function thaiDateToIso(text) {
  if (!text) return null;
  // บางที่เขียนย่อ «ม.ค.» «ก.พ.» ฯลฯ
  const short = { 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6,
    'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12 };
  const monthOf = name => {
    const i = TH_MONTHS.indexOf(name);
    if (i >= 0) return i + 1;
    return short[name] || 0;
  };
  const m = text.match(/(\d{1,2})\s*([\u0E00-\u0E7F.]+?)\s*(\d{4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = monthOf(m[2]);
  if (!month || !day) return null;
  const year = Number(m[3]) > 2400 ? Number(m[3]) - 543 : Number(m[3]);
  const tm = text.match(/(\d{1,2})[.:](\d{2})/);
  const hh = tm ? String(Math.min(23, Number(tm[1]))).padStart(2, '0') : '';
  const mm = tm ? String(Math.min(59, Number(tm[2]))).padStart(2, '0') : '';
  const time = hh ? `T${hh}:${mm}:00+07:00` : 'T00:00:00+07:00';
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${time}`;
  return { iso, day, month, year, hasTime: !!hh };
}

/** ISO (YYYY-MM-DD…) → «6 พ.ย. 2569» แบบไทย */
export function isoToThai(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1].replace('าคม', 'าคม')} ${Number(m[1]) + 543}`;
}

/** ชื่อไฟล์ Drive → วันที่ไทย ถ้าชื่อมี [2569-10-01] (ปีในชื่อเป็น พ.ศ.) */
export function dateFromFilename(label) {
  const m = String(label || '').match(/\[(\d{4})-(\d{2})-(\d{2})\]/);
  if (!m) return '';
  const year = Number(m[1]) > 2400 ? Number(m[1]) : Number(m[1]) + 543;
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${year}`;
}

/** ตรวจว่าลิงก์ต้องล็อกอิน CU account ไหม (คืน true / false / null = ไม่ทราบ) */
export async function needsLogin(url) {
  if (!/^https?:/.test(url)) return false;

  // ระบบของคณะฯ (portal.md.chula.ac.th) ล็อกด้วย CU account ทุกเส้นทางที่เว็บนี้ลิงก์ไป
  // (SSCs Application / SSCs 6 R0 / SSCs 6) — ตรวจด้วย fetch ไม่ได้ผลเพราะเด้งไปหน้า login ของมหาวิทยาลัย
  if (/^https?:\/\/portal\.md\.chula\.ac\.th\//i.test(url)) return true;

  // ไฟล์ Drive: วิธีชัดเจนที่สุดคือลองดาวน์โหลดตรง ๆ
  // — ถ้าเปิดสาธารณะจะได้ไฟล์ PDF จริง (%PDF) ถ้าล็อกจะได้หน้า HTML ของ Google
  const drive = String(url).match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{20,})/);
  if (drive) {
    try {
      const res = await fetch(`https://drive.google.com/uc?export=download&id=${drive[1]}`, {
        redirect: 'follow',
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return res.status === 401 || res.status === 403;
      const buf = Buffer.from(await res.arrayBuffer());
      return !buf.slice(0, 5).toString('latin1').startsWith('%PDF');
    } catch {
      return null;
    }
  }

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(20000),
    });
    const finalUrl = res.url || '';
    const body = res.status === 200 ? (await res.text()).slice(0, 4000) : '';
    if (/accounts\.google\.com|ServiceLogin|signin/i.test(finalUrl)) return true;
    if (res.status === 401 || res.status === 403) return true;
    if (/Sign in with your Google Account|ต้องลงชื่อเข้าใช้/i.test(body)) return true;
    return false;
  } catch {
    return null;
  }
}

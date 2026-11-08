# DESIGN.md — Elective Guide

คู่มือระบบออกแบบของเว็บนี้ (static site · vanilla CSS/JS · ไม่มี build step)
ใช้เป็น brief กลางเมื่อแก้ UI หรือให้ agent ทำงานต่อ — ค่าทั้งหมดตรงกับ `style.css`

---

## 1. ตัวตน

- **ใครใช้:** นิสิตแพทย์จุฬาฯ ที่ต้องเลือกที่ไป elective
- **งานหลักของหน้า:** หา "ที่ไหน · ติดต่อใคร · ต้องเตรียมอะไร" ได้เร็ว
- **น้ำเสียงภาพ:** สงบ อ่านง่าย มีความอบอุ่นแบบกระดาษ/งานพิมพ์ ไม่ใช่ SaaS สีสันจัด
- **โทน:** sand/paper + sage + terracotta + dusk (อ้างอิงพาเลตต์ Yoga-inspired)
- **ห้าม:** gradient ม่วง AI, เงานุ่มฟุ้งทุกการ์ด, การ์ตูน/อีโมจิประดับที่ไม่สื่อความ, ตัวเลข/ป้ายที่ไม่มีหน้าที่

## 2. โทเคนสี

| Token | Light | Dark | ใช้กับ |
|---|---|---|---|
| `--sand` | `#f5efe6` | `#15110d` | พื้นหน้า |
| `--sand-mid` | `#ede4d7` | `#1e1812` | พื้นรอง / thead / hover |
| `--sand-dark` | `#d8cbbf` | `#2b221a` | ขอบเน้น |
| `--off-white` | `#fdfaf6` | `#1f1913` | พื้นการ์ด/ชีต |
| `--charcoal` | `#2c2824` | `#f1e9dd` | ข้อความหลัก |
| `--warm-gray` | `#6b6157` | `#b6a999` | ข้อความรอง |
| `--sage` / `-light` / `-dark` | `#7d9b76` / `#a8c4a0` / `#4f7047` | `#8fae86` / `#a8c4a0` / `#b9d3ae` | สีรอง / สำเร็จ / เปิดรับ |
| `--terra` / `-light` / `-deep` / `-ink` | `#c4714b` / `#e0977a` / `#a85b36` / `#8f4527` | `#d07d55` / `#e7a681` / `#b86239` / `#f0b28c` | สีหลัก / CTA / ลิงก์ |
| `--dusk` / `-light` | `#c9849a` / `#e8b4c6` | `#c9849a` / `#e8b4c6` | เน้นรอง / ป้ายพิเศษ |
| `--border` | `rgba(100,80,60,.12)` | `rgba(245,239,230,.16)` | เส้นคั่น |

**สีภาค (ใช้ทั้งการ์ด/ป้าย/กราฟ):** `--r-bkk #c4714b` · `--r-central #7d9b76` · `--r-north #c9849a` · `--r-isan #b3893f` · `--r-south #6f8c9b` · `--r-east #9385b5`

**กฎข้อความ:** บนพื้นสีเข้มใช้ `--solid-sage #4f6a49` / `--solid-terra #a2562f` เมื่อต้องมีตัวอักษรขาว (ผ่าน AA ทั้งสองธีม) · ข้อความบนพื้นอ่อนใช้ `--terra-ink`, บนพื้นมืดใช้ `--terra-light`

## 3. ไทป์

- **หัวเรื่อง:** Lora / Noto Serif Thai — `--font-head`
- **เนื้อหา/ปุ่ม:** Inter / Noto Sans Thai — `--font-body`
- สเกล: page title `clamp(1.6rem, 7.6vw, 2.4rem)` · section `clamp(1.35rem, 6vw, 2.4rem)` · body 15px / 1.75 · meta 12–13px
- ภาษาไทยมีสระบน/ล่าง: หัวข้อใช้ line-height ≥ 1.26, ลิงก์ที่ตัดบรรทัดใช้ ≥ 1.5
- ใช้ `text-wrap: balance` กับหัวข้อ และ `pretty` กับย่อหน้า — หลีกเลี่ยงบรรทัดสุดท้ายที่มีคำเดียว

## 4. องค์ประกอบ

- **App bar:** โลโก้ (เข็มทิศ) + ชื่อหน้าปัจจุบัน + เมนู ⋯ (มือถือ) · ลิงก์หน้า/ธีม/GitHub อยู่ในเมนู
- **ปุ่ม:** `btn-primary` (พื้น `--solid-terra`, ขาว), `btn-ghost` (ขอบชัด+พื้นอ่อน), `.filter-btn`/`.cat-chip` (ขอบ+พื้นอ่อน, เลือกอยู่สีทึบ) — ทุกปุ่ม `inline-flex; align-items:center; justify-content:center`, เป้าสัมผัส ≥ 44px
- **การ์ด:** พื้น `--off-white`, ขอบ `--border`, radius 12–14 · การ์ดที่กางได้มีแถวล่าง `.expand-hint` สี terracotta อ่อน (บอกว่ากดได้)
- **Section header:** badge ไอคอน + หัวข้อ + คำอธิบาย · หัวข้อกลางหน้าเว้นจากเนื้อหาก่อนหน้า ≥ 3.2rem
- **ตัวกรอง:** desktop = แถวชิปใน toolbar · mobile = ปุ่ม "ตัวกรอง" + `<dialog>` bottom sheet (backdrop blur, drag handle, ปุ่มล้าง/ดูผลลัพธ์)
- **ตัวเลข:** ในชิป/ป้ายใช้ `align-items:center` + `line-height:1` และล้าง margin ของ `.stat-num` (margin เดิมใช้เฉพาะการ์ดสถิติหน้าแรก)
- **ลิงก์ภายนอก:** เติม ↗ และ `target="_blank" rel="noopener noreferrer"`

## 5. Motion

- มีเฉพาะที่สื่อความหมาย: fade-up ตอนเลื่อน (IntersectionObserver), แถบความคืบหน้าอ่าน, ตัวเลขวิ่งครั้งแรก, hover lift ของการ์ด, press scale 0.97, bottom sheet slide
- ปิดทั้งหมดเมื่อ `prefers-reduced-motion: reduce`
- ไม่มี scroll hijack, ไม่มี parallax หนัก, ไม่มี WebGL เพิ่ม (มี hero canvas เดิมเท่านั้น)

## 6. Accessibility

- โฟกัส: `outline: 2px solid var(--terra)` ทุก interactive
- สถานะสลับใช้ `aria-pressed`; หน้าปัจจุบันใช้ `aria-current="page"`
- ตัวกรองที่ซ้ำ = ยกเลิก (chips, แท็บหมวด, การ์ดสรุป)
- เป้าสัมผัส ≥ 44px · ไม่มี horizontal overflow ที่ 390px · `-webkit-tap-highlight-color: transparent`
- ข้อความทุกคู่ผ่าน WCAG AA (ตรวจด้วยสคริปต์ dark-mode audit ทุกครั้งที่แก้สี)

## 7. โครงไฟล์

```text
index.html · institutions.html · inside.html · outside.html · tips.html · 404.html
style.css            ← โทเคน + คอมโพเนนต์ (สารบัญ 30 ส่วนท้ายไฟล์)
premium.css          ← ชั้นตกแต่งเพิ่ม (progress, nav glass, micro-interaction)
ui.js                ← nav/ธีม/แถบความคืบหน้า/ปีที่เลือก
app.js               ← ค้นหา/กรอง/การ์ด/ตัวกรองมือถือ (หน้า สถาบัน)
sync-ssc.mjs         ← ดึงข้อมูล SSCs Guide → inside.html / outside.html
tools/build-shell.mjs← head/nav/footer กลาง (PAGES = แหล่งความจริงเดียว)
tools/audit-data.mjs ← ตรวจความครบ/ความสดของข้อมูล
assets/              ← โลโก้ · favicon · OG image
```

## 8. การนำเข้า design toolbox (บันทึกตัดสินใจ)

| Resource | ใช้ได้ไหม | หมายเหตุ |
|---|---|---|
| IconMCP | **ใช้แล้ว** | ไอคอน `sliders` / `close` / `check` ใน UI ตัวกรองมือถือ (3 ตัวเท่านั้น) |
| Refero Styles (DESIGN.md) | **ใช้** | ไฟล์นี้คือผลลัพธ์ — โทเคน/คอมโพเนนต์/กฎจากของจริงในโปรเจกต์ |
| Navbar / Footer / CTA galleries | อ้างอิงเท่านั้น | ใช้ตรวจ IA/ลำดับ CTA ไม่ลอกดีไซน์ |
| Amicro / Evil Buttons / EasyUI / Oxyn | ยังไม่ใช้ | เป็น React/Motion/shadcn — โปรเจกต์นี้ vanilla ไม่มี build step; แนวคิด (press/hover) มีอยู่แล้วใน `premium.css` |
| Scrolltide / Scroll Shaders | ไม่ใช้ | paid + WebGL/scroll-driven หนัก ผิดกับคาแรกเตอร์หน้าเว็บ |

**ถ้าจะเพิ่มในอนาคต (เรียงตามความคุ้ม):** ไอคอนชุดเดียวกันแทนอีโมจิในป้ายหัวข้อ → ปุ่มคัดลอกอีเมล/เบอร์ในการ์ด → หน้า 404/OG อัปเดตเมื่อเนื้อหาเปลี่ยน

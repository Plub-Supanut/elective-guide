<div align="center">
  <img src="assets/logo-mark.svg" alt="Elective Guide logo" width="88" />
  <h1>Elective Guide</h1>
  <p><strong>คู่มือ elective สำหรับนิสิตแพทย์จุฬาฯ</strong> — เบอร์โทร ผู้ประสานงาน ที่พัก ค่าใช้จ่าย ของ 117 สถาบัน/ภาควิชา ในที่เดียว</p>
  <img src="docs/preview.jpg" alt="หน้าแรก Elective Guide" width="100%" />
  <p>
    <a href="https://plub-supanut.github.io/elective-guide/"><img src="https://img.shields.io/badge/live-online-2f5d8a?style=flat-square" alt="Live site"></a>
    <a href="https://github.com/Plub-Supanut/elective-guide/actions/workflows/sync-ssc.yml"><img src="https://github.com/Plub-Supanut/elective-guide/actions/workflows/sync-ssc.yml/badge.svg" alt="Sync SSC data"></a>
    <a href="https://github.com/Plub-Supanut/elective-guide/commits/main"><img src="https://img.shields.io/github/last-commit/Plub-Supanut/elective-guide?style=flat-square&label=last%20update" alt="Last commit"></a>
    <img src="https://img.shields.io/badge/static-no%20build-7d9b76?style=flat-square" alt="Static, no build">
  </p>
  <p>
    <a href="https://plub-supanut.github.io/elective-guide/"><strong>เปิดเว็บไซต์</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/Plub-Supanut/plub-standard/blob/main/GITHUB_STANDARD.md">Project standard</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/Plub-Supanut/elective-guide">GitHub</a>
  </p>
</div>

---

## Overview

เว็บรวมข้อมูลสำหรับนิสิตแพทย์จุฬาฯ ที่จะไป elective — แยกเป็น **5 หน้า** (หน้าแรก · สถาบัน · ในคณะ · นอกคณะ · คำแนะนำ) โดยหน้า «นอกคณะ» ดึงกำหนดการและเอกสารจาก SSCs Guide มาอัปเดตเองทุกสัปดาห์

ข้อมูลเดิมอยู่ใน Google Form และเว็บ SSC ที่อ่านยาก โปรเจกต์นี้จึงทำให้ค้นหาและเปรียบเทียบได้ง่ายขึ้น

## Features

- **117 สถาบัน/ภาควิชา** — เบอร์โทร อีเมล ผู้ประสานงาน ที่อยู่ ที่พัก ค่าใช้จ่าย และหมายเหตุเฉพาะ
- **ค้นหาได้ทั้งไทย อังกฤษ และตัวย่อ** — `ศิริราช` = `Siriraj` = `รพ.ศิริราช`
- **ตัวกรอง + เรียง + แท็บหมวด 8 หมวด** — หาเฉพาะที่ตรงเงื่อนไข
- **หน้าในคณะ/นอกคณะ** — ตารางสถานะรายชั้นปี กำหนดการ SSCs และเอกสาร PDF
- **Sync อัตโนมัติ** — GitHub Actions ดึงข้อมูลจากต้นฉบับทุกสัปดาห์
- **Static ล้วน** — ไม่มี build step และไม่ต้องติดตั้ง dependency

## Screenshots

![ตัวอย่างการค้นหา](docs/search.jpg)

## Quick start

เปิดเว็บได้เลย: **https://plub-supanut.github.io/elective-guide/**

เปิดในเครื่อง:

```bash
git clone https://github.com/Plub-Supanut/elective-guide.git
cd elective-guide
python -m http.server 8765
# เปิด http://127.0.0.1:8765


```

## Project structure

```text
index.html          หน้าแรก
institutions.html   สถาบัน + ค้นหา/ตัวกรอง
inside.html         รายวิชาในคณะ
outside.html        รายวิชานอกคณะ (sync จาก SSCs)
tips.html           คำแนะนำ
data/               ข้อมูลสถาบัน/รายวิชา
tools/              build-shell, audit-data, ssc-source
fonts/              ฟอนต์ self-host
```

## Development

```bash
node tools/build-shell.mjs        # เติม head/nav/footer ทุกหน้า
node tools/build-shell.mjs --check
node tools/audit-data.mjs         # ตรวจความครบของข้อมูล
node tools/audit-data.mjs --check
node sync-ssc.mjs                 # ดึงข้อมูล SSCs ล่าสุด
```

## Data & attribution

ข้อมูลอ้างอิงจากประกาศและเอกสารของคณะแพทยศาสตร์ จุฬาฯ และ SSCs Guide — ใช้เพื่อการศึกษาเท่านั้น
โปรดตรวจสอบกับประกาศล่าสุดของคณะ/ภาควิชาก่อนใช้งานจริง

## Standard

โปรเจกต์นี้ทำตาม [Plub-Supanut Project Standard](https://github.com/Plub-Supanut/plub-standard/blob/main/GITHUB_STANDARD.md)

## License

เนื้อหาและโค้ด © 2026 Plub-Supanut — ใช้เพื่อการศึกษาและการวางแผน elective ของนิสิตแพทย์

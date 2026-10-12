# คลัง UI ที่ดูมา → เลือกอะไรไปใช้กับเว็บนี้ (สำรวจ 2026-10-12)

โน้ตสำคัญ: คลังทั้ง 8 แห่งเป็น **React/shadcn component library** ทั้งหมด (ติดตั้งผ่าน `shadcn add` / MCP)
แต่เว็บนี้เป็น **static HTML/CSS/JS ไม่มี build step** → จึง *พอร์ตเฉพาะไอเดีย/เอฟเฟกต์* มาเขียนเป็น CSS/JS เอง
ไม่ได้เพิ่มไลบรารีเข้าโปรเจกต์ (ขนาดไฟล์และความเรียบง่ายคงเดิม)

| คลัง | มีอะไรเด่น | นำมาใช้แล้วในรอบนี้ | ยังเหลือเป็นไอเดีย |
|---|---|---|---|
| **23rd.dev** | shaders/backgrounds/interactive (Live Orb, Shader Sky, Logo Burst) | วงแหวน "หายใจ" ที่หมุดจุฬาฯ · วงแหวนเต้นที่หมุดที่เลือก · glow ตอน hover หมุด | shader พื้นหลัง hero (ปัจจุบันมี canvas «เส้นทางจากคณะฯ» อยู่แล้ว) |
| **bencho.dev** | micro-interactions Hover/Press/Drag/Slide/Swipe/Type | ยก–กดทุกชิ้นที่แตะได้ (scale 0.97) · แสงกวาดผ่านปุ่มหลัก · แถวเลื่อนตาม hover | drag-to-reorder, swipe gesture |
| **uiarc.dev** | 157 animated components: animated numbers, text anims (blur/words/lines/wipe) | **ตัวเลขวิ่ง** (สถิติ 117 สถาบัน · legend 50/22/20/11/14 · ระยะทาง กม.) | text reveal ตอนหัวข้อเข้ามาในจอ (blur → ชัด) |
| **beautifului.dev** | AI-native: loading state, approval card, tool chips, glass surfaces | **พื้นผิวการ์ดพรีเมียม** (gradient hairline + เงานุ่ม + glass) · entry stagger ทีละบรรทัด | loading shimmer ตอนรอข้อมูลรอบใหม่ |
| **boardui.com** | dashboard system: 19 charts, 400+ design tokens, Figma | — | กราฟสถิติ (เช่น จำนวนสถาบันต่อภาค) ถ้าจะทำหน้ารวมสถิติ |
| **opensourceui.in** | React/Next copy-paste, MIT — mockups, widgets, วัสดุแบบ hardware เงา | — | วัสดุแบบ "เครื่องจริง" (gloss) ถ้าทำ mockup มือถือ |
| **audiocn.dev** | faders/knobs/meters/visualizer | — (ไอเดีย meter) | แถบ meter ถ้าจะโชว์สัดส่วนข้อมูลแบบเคลื่อนไหว |
| **termcn.dev** | terminal UI (Ink/OpenTUI) 30+ ธีม | — | แนวคิด theme switcher แบบ 30 ธีม |

## สิ่งที่ใส่เข้าไปจริงในรอบนี้ (ไฟล์ใหม่ 2 ไฟล์ — ไม่แก้โค้ดเดิม)

- `premium.css` + `premium.js` (เพิ่ม `<link>`/`<script>` 2 บรรทัดใน `index.html` เท่านั้น)
- แถบความคืบหน้าการเลื่อน (hairline gradient) · เนวิเกชันแบบกระจก + ขีดเส้นใต้ไล่สี
- ตัวเลขวิ่งเมื่อปรากฏ (ปิดเมื่อ `prefers-reduced-motion: reduce`)
- พื้นผิวการ์ด: gradient hairline border + glass + เงาซ้อน + entry animation + stagger
- หมุดจุฬาฯ หายใจ · วงแหวนหมุดที่เลือก · glow ตอน hover · ไฟส่องตามเคอร์เซอร์บนแผ่นแผนที่
- micro-interaction ยก/กดทุกชิ้น + แสงกวาดผ่านปุ่มหลัก

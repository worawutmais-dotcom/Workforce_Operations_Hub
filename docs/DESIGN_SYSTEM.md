# BVN Admin Console — Design System

สถานะ: **เริ่มต้น (token layer + เอกสาร)** — ยังไม่ได้แยกไฟล์ (ตามที่ owner เลือก "design system ก่อน" 18 พ.ย. 2569).
แหล่งความจริงของ token: บล็อก `:root{…}` ที่ **ต้นไฟล์** `admin_codex/index.html` (คอมเมนต์กำกับไว้แล้ว).

> กฎข้อเดียวที่สำคัญสุด: **เปลี่ยนค่าที่ `:root` เท่านั้น อย่าฝังสี/ระยะ/มุมโค้งตรง ๆ ใน rule.** เขียน style ใหม่ให้อ้าง token เสมอ เพื่อให้แก้ที่เดียวแล้วเปลี่ยนทั้งระบบ.

---

## 1. สี (Color tokens)

### Brand & surfaces
| Token | Light | ใช้กับ |
|---|---|---|
| `--ink` | `#172014` | ตัวอักษรหลัก |
| `--muted` | `#697362` | ตัวอักษรรอง / label |
| `--bg` | `#f7f9f5` | พื้นหลังหน้า (canvas) |
| `--card` | `#ffffff` | พื้นการ์ด/พาเนล |
| `--line` | `#e6ebe2` | เส้นขอบ/ตาราง |
| `--line-soft` | `#f1f5ee` | เส้น/พื้นอ่อน |
| `--navy` `--navy2` `--panel` | `#1e2818` `#304020` | sidebar / พื้นเข้ม (dark chrome) |

### Primary accent (แบรนด์ — ชื่อ `blue` แต่เป็น "navy")
| Token | Light | ใช้กับ |
|---|---|---|
| `--blue` | `#1e3a5f` | ปุ่มหลัก, active, ลิงก์, accent |
| `--blue-ink` | `#152c47` | ตัวเลข/หัวข้อเน้น, ตัวอักษรบนพื้น soft |
| `--blue-soft` | `#e9eef5` | พื้นอ่อนของ accent (ghost button, highlight) |

> ⚠️ **ชื่อ `--blue*` คือสี navy ของแบรนด์ ไม่ใช่สีฟ้าจริง** (ชื่อเดิมติดมาจากอดีต) — เวลาอ่านโค้ดอย่าสับสน.

### Semantic status
| Token | Light | ความหมาย |
|---|---|---|
| `--green` / `--green-soft` | `#168b45` / `#e6f8ea` | สำเร็จ / ครบ / มาทำงาน |
| `--amber` / `--amber-soft` | `#d9731a` / `#fbeede` | เตือน / มาสาย / ต้องตรวจ |
| `--red` / `--red-soft` | `#c93b3b` / `#fbe9e9` | ผิดพลาด / อันตราย / ขาดงาน |

> อย่าสื่อสถานะด้วยสีอย่างเดียว — ใส่ไอคอน/ข้อความกำกับเสมอ (accessibility).

---

## 2. ระยะห่าง (Spacing) — ฐาน 4px
`--space-1:4` · `--space-2:8` · `--space-3:12` · `--space-4:16` · `--space-5:24` · `--space-6:32` · `--space-8:48`

เขียน style ใหม่ให้ใช้ `padding:var(--space-3) var(--space-4)` แทนเลข px ลอย ๆ. (โค้ดเก่ายังใช้ px ตรง ๆ อยู่ — ค่อย ๆ ย้ายมาใช้ token เมื่อแก้แต่ละจุด.)

## 3. ตัวอักษร (Type scale)
| Token | ขนาด | ใช้กับ |
|---|---|---|
| `--text-xs` | 11px | caption, meta เล็ก |
| `--text-sm` | 12px | label, sub |
| `--text-base` | 13px | **body** (ค่าเริ่มต้น) |
| `--text-lg` | 15px | หัวข้อย่อย |
| `--text-xl` | 18px | หัวพาเนล |
| `--text-2xl` | 23px | หัวหน้า/route |
| `--font-sans` | IBM Plex Sans Thai → Inter → system | ฟอนต์หลัก |

น้ำหนัก: ใช้ 400/500/600 เป็นหลัก (เลี่ยง 700–800 ยกเว้นตัวเลขเน้น). ตัวเลขเงิน/เวลาใช้ `font-variant-numeric:tabular-nums`.

## 4. มุมโค้ง & เงา
- Radius: `--radius-sm:8` · `--radius:12` (การ์ด/พาเนลมาตรฐาน) · `--radius-lg:16` (modal/การ์ดใหญ่)
- เงา: `--shadow` (resting เบา) · `--shadow-lg` (ลอย/modal)
- Focus: `--ring` (`:focus-visible` ใช้ตัวนี้เสมอ — ห้ามลบ outline โดยไม่แทนด้วย ring)

---

## 5. Dark mode
override อยู่ที่บล็อก `:root[data-theme="dark"]{…}` ใต้ `:root` หลัก — กำหนดเฉพาะ token ที่ต้องเปลี่ยน (ink/bg/line/card/blue...). เพราะทุกอย่างอ้าง token การทำ dark จึงเป็นแค่การ override ค่าไม่กี่ตัว. (ปัจจุบันแอปตรึงเป็น light เป็นหลัก.)

---

## 6. หนี้ทางเทคนิคที่ต้องรู้ (สำคัญสำหรับคนแก้ต่อ)

1. **หลายเลเยอร์ CSS ทับกันด้วยลำดับ** — มีบล็อก style ที่ append ท้าย ๆ (ชื่อภายในว่า "redesign-v2" ใกล้ `</style>`) ที่ **ชนะ cascade** เพราะมาทีหลัง. ถ้าแก้สไตล์แล้วไม่เห็นผล ให้หา rule ตัวหลังสุดที่ match. มี token เฉพาะเลเยอร์นั้น เช่น `--ops-navy` ที่ไม่ได้อยู่ใน `:root` หลัก.
2. **มี dead CSS ค้าง** — เช่น `.tcd-state` `.tcd-meta` `.pm-strip` `.pm-cell` และคลาส `hr-*`/`ins-*` จากดีไซน์เก่า ที่ markup ไม่ใช้แล้ว (ฝังในบรรทัด style ยาว ๆ จึงยังไม่ลบ) — เป็น MEDIUM follow-up.
3. **ยังเป็นไฟล์เดียว ~4,000 บรรทัด** — การแยกไฟล์จริง (index.html + app.css + app.js หรือ build รวมไฟล์เดียว) รอการตัดสินใจเรื่องวิธี host console. ดู `docs/ENTERPRISE_REVIEW_2026-11-18.md` ข้อ HIGH/MEDIUM.

---

## 7. วิธีขยาย (Checklist)
- เพิ่มสี/ระยะ/ขนาดใหม่ → เพิ่มที่ `:root` (+ override ใน dark ถ้าจำเป็น) แล้วอ้าง token
- ทำคอมโพเนนต์ใหม่ → ใช้ `--card` + `--line` + `--radius` + `--shadow` เป็นฐาน, ปุ่มหลักใช้ `--blue`
- สถานะ → `--green/amber/red` (+ `-soft` สำหรับพื้น) พร้อมข้อความ/ไอคอน
- อย่าสร้างสีใหม่นอก token โดยไม่จำเป็น — ถ้าต้องใช้ ให้เพิ่มเป็น token ก่อน

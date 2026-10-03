# Context ของ kthok-core (server)

ความรู้ที่ AI (และคนในทีม) ต้องใช้ทำงานกับ repo นี้ อ่านไฟล์ที่เกี่ยวข้องก่อนลงมือ แทนการไล่อ่านโค้ดทั้งหมด
อีกฝั่งของระบบคือ `../kthok-client` ซึ่งมี `context/` ของตัวเอง

| ไฟล์ | เนื้อหา | อ่านเมื่อ |
| --- | --- | --- |
| [privacy.md](privacy.md) | **กรอบความเป็นนิรนาม + checklist** (สำเนาเดียวกับอีก repo) | ทุกครั้ง ก่อนเริ่มงาน |
| [core.md](core.md) | modules, pattern, DB | แก้ server |
| [ops.md](ops.md) | env, วิธีรันและเทส | รัน/เทส/deploy |
| [decisions.md](decisions.md) | การตัดสินใจที่เจ้าของเลือกแล้ว | ก่อนเสนออะไรที่อาจขัดของเดิม |
| [open-items.md](open-items.md) | งานค้าง ความเสี่ยง ไอเดีย | วางแผน |
| [changelog.md](changelog.md) | log งานที่ AI ทำใน repo นี้ | ดูว่าทำอะไรไปแล้ว |

## กฎการอัปเดต (บังคับ)

ทุกครั้งที่ใช้ AI แก้โค้ดหรือ config ใน repo นี้:

1. ตรวจกับ `privacy.md` ก่อนลงมือ ถ้าขัด ให้หยุดถามเจ้าของ
2. หลังทำเสร็จ เพิ่ม entry ใน `changelog.md` (ระบุผลต่อความเป็นนิรนามทุกครั้ง)
3. อัปเดตไฟล์ที่เนื้อหาเปลี่ยน: โครง/pattern/DB → `core.md`, env/รัน/Docker → `ops.md`, ตัดสินใจใหม่ → `decisions.md`, งานค้าง → `open-items.md`, ข้อมูลที่เก็บ → `privacy.md`; ฟีเจอร์ที่ผู้ใช้เห็นให้บันทึกใน `../kthok-client/context/product.md` ด้วย
4. ถ้างานแตะทั้งสอง repo ให้อัปเดต context ของทั้งสองฝั่ง และถ้าแก้ `privacy.md` ต้องแก้ให้ตรงกันทั้งคู่
5. commit การแก้ context แยกเป็น `docs(context): ...`
6. เขียนให้สั้น เก็บแต่สิ่งที่อ่านจากโค้ดไม่ได้ง่าย ๆ

Stop hook (`.claude/scripts/context-guard.sh`) ไม่ให้จบงานถ้ามี commit โค้ดใหม่กว่า changelog และมี agent `kthok-context` ช่วยเขียนอัปเดตให้

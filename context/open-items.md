# งานค้าง / ความเสี่ยง (server)

ลบข้อที่เสร็จแล้วออก (บันทึกใน changelog) ฝั่งหน้าเว็บดู `../kthok-client/context/open-items.md`

## ต้องทำก่อนเปิดให้คนใช้จริง

- [ ] เปลี่ยน `SESSION_SECRET` (ยังเป็นค่าเดียวกับ Google secret) และตั้ง `USER_HASH_SECRET` แยก — ต้องทำก่อนมีผู้ใช้ เปลี่ยนทีหลังแบน/บล็อกหลุด
- [ ] เจ้าของตั้ง `ADMIN_STUDENT_IDS` เอง
- [ ] คุยกับเพื่อนในทีมเรื่อง schema ที่ถูกแทนที่ ก่อน push
- [ ] ทดสอบ TURN จริง

## ไอเดียที่เสนอไว้ ยังไม่ได้สั่ง

- report + หน้าจัดการแบน (ต้องตกลงเรื่องหลักฐาน — ขัดกับไม่เก็บข้อความ ดู privacy.md)
- ไม่จับคู่ซ้ำคนเดิมติด ๆ
- test (matchmaking, word filter, session cipher), CI/CD + deploy, ลดขนาด image (~1GB), health check + JSON log

## ข้อจำกัด

- instance เดียว (state ใน memory)
- สถิติรอบล่าสุด ≤30s หายถ้า process ตายกะทันหัน
- กรองคำหยาบในข้อความเสียงไม่ได้ ทางเดียวคือบล็อก

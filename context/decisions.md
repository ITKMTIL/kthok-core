# การตัดสินใจ (ฝั่ง server/ข้อมูล)

เพิ่มต่อท้ายเมื่อเจ้าของตัดสินใจอะไรใหม่ ฝั่งหน้าเว็บดู `../kthok-client/context/decisions.md`

## 2026-10-02

- จับคู่แบบบังคับ: เข้าห้องที่รอ หรือเปิดห้องใหม่, ขอคณะได้ รอ 8s แล้ว fallback (fallback ทันทีทำให้การเลือกคณะไร้ความหมาย)
- เริ่มด้วย mock user ไม่มี auth
- โค้ดไม่มี comment, commit แยกตามเรื่อง ไม่แปะว่าทำโดย AI

## 2026-10-03

- feature module (`auth chat matchmaking music ...`) + `common/{constants,utils,rate-limit}` + `config`
- ล็อกอิน Google เฉพาะ `@kmitl.ac.th`, คณะจากรหัสหลัก 3–4 (รหัสคณะจาก seed ของเพื่อนในทีม)
- rate limit + กรองคำหยาบ (ตัดคำว่า "กะหรี่" ออกจาก list เพราะชนกับแกงกะหรี่)
- session เข้ารหัส AES-256-GCM แก้คณะเองไม่ได้
- reconnect grace 120s ด้วย connection state recovery
- โทร: `CALL_ENABLED` เปิดปิดได้, Cloudflare TURN, บังคับ relay ซ่อน IP
- DB (ไม่บังคับ): hash ตัวตน + แบน, บล็อก, สถิติรายวัน, feedback. **ยังไม่ทำ report** (เจ้าของเลือก)
- schema ของเพื่อน (`User`/`Faculty`/seed) ถูกแทนด้วย `users`/`blocks`/`daily_stats`
- admin = รหัสใน `ADMIN_STUDENT_IDS` (เทียบเป็น hash), endpoint `/admin/overview`
- Docker compose + build script `linux/amd64`
- ข้อความเสียง: server เป็นแค่ทางผ่าน ไม่เก็บ, ตรวจ magic bytes/ขนาด/ความยาว, `VOICE_ENABLED`
- admin จับคู่บัญชีตัวเองได้เพื่อเทส
- context + agents อยู่ในแต่ละ repo แยกกัน AI ต้องอัปเดต context ทุกครั้ง ยึดกรอบนิรนาม

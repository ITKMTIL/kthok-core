# Changelog งานที่ AI ทำใน kthok-core

เพิ่ม entry ใหม่ด้านบนสุด รูปแบบ:

```
## YYYY-MM-DD — หัวข้อสั้น
- ทำอะไร (commit hash)
- ความเป็นนิรนาม: ไม่กระทบ / กระทบ → ผ่าน checklist ใน privacy.md อย่างไร
- context ที่อัปเดต: ไฟล์ไหน
```

## 2026-10-03 — ฟีเจอร์ชุด 1–10
- `8f77785` หัวข้อ/ไม่จับซ้ำ/คนรอ/หน่วงคนป่วน, prompts, `e26cdad` เกม, `74bba00` followup + reports + admin endpoints + migration reports, `54f8ae1` push + migration push_subscriptions, README
- ความเป็นนิรนาม: กระทบ ผ่าน checklist โดยเจ้าของอนุมัติ — `reports` เก็บหลักฐานเข้ารหัส 30 วันเฉพาะข้อความที่ผ่านการตรวจ HMAC, admin เห็นแค่ "ผู้ใช้ #id"; `push_subscriptions` ผูก hash, payload แค่ kind; contact/HMAC อยู่ memory ≤10 นาที; stats `{faculties, topics}` ไม่มีตัวเลขต่อคณะ
- context ที่อัปเดต: privacy, core, ops, decisions, open-items, changelog

## 2026-10-03 — ตั้งระบบ context + agents
- เพิ่ม `context/`, `.claude/agents` (kthok-check, kthok-tester, kthok-scout, kthok-context), `.claude/scripts` (test-stack, context-guard), Stop hook; `CLAUDE.md` อยู่ในเครื่อง (ถูก gitignore โดยเพื่อนในทีม)
- ความเป็นนิรนาม: ไม่กระทบ
- context ที่อัปเดต: สร้างใหม่ทั้งหมด

## 2026-10-03 — ข้อความเสียง + admin จับคู่ตัวเอง
- `ace576c` admin self-match, `a4e45dc` voice relay + `VOICE_ENABLED` + stat `voice`, `5ba976b` README
- ความเป็นนิรนาม: ผ่าน — ไฟล์เสียงอยู่ใน memory แล้วส่งต่อทันที ไม่ลงดิสก์/DB/log; self-match ใช้ hash
- context ที่อัปเดต: รวมในการสร้างครั้งแรก

## ก่อนหน้า (2026-10-02 → 2026-10-03)
- สร้าง server ทั้งหมด: จับคู่, auth, แชต, เพลง, รีแอคชัน, โทร/TURN, DB, สถิติ, admin, Docker — ดู `decisions.md` และ git log

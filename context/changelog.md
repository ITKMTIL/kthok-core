# Changelog งานที่ AI ทำใน kthok-core

เพิ่ม entry ใหม่ด้านบนสุด รูปแบบ:

```
## YYYY-MM-DD — หัวข้อสั้น
- ทำอะไร (commit hash)
- ความเป็นนิรนาม: ไม่กระทบ / กระทบ → ผ่าน checklist ใน privacy.md อย่างไร
- context ที่อัปเดต: ไฟล์ไหน
```

## 2026-10-03 — push ส่งเฉพาะเครื่องที่ซ่อนอยู่
- `c3e7e18` ผูก endpoint กับ socket และส่งเฉพาะเครื่องนั้น, throttle ต่อ endpoint ตั้งได้ด้วย `PUSH_THROTTLE_MS`, เพิ่ม `.claude/scripts/push-e2e.cjs` (15/15 PASS)
- ความเป็นนิรนาม: ไม่กระทบ — payload ยังเป็นแค่ `{kind}` (ตรวจด้วยการถอดรหัสจริง)
- context ที่อัปเดต: core, ops, changelog

## 2026-10-03 — เกมดูดวง
- `c3c2bb8` เกม taksa + tarot ใน games module
- ความเป็นนิรนาม: ผ่าน — เก็บแค่วันในสัปดาห์ใน memory ของห้อง, เปิดให้อีกฝ่ายเห็นเฉพาะเมื่อผู้ใช้เลือก (ค่าเริ่มต้นปิด)
- context ที่อัปเดต: core, privacy (ทั้งสอง repo), changelog

## 2026-10-03 — ชุดที่ 2: แชตเสริม, คำต้องห้าม, image เล็ก
- `bdee310` สติกเกอร์/ตอบกลับ/ยกเลิกส่ง/อ่านแล้ว, `dee8c1c` คำต้องห้ามใน DB + admin endpoints + migration banned_words, `2e087c1` image runner ~300MB + migrate image, prompt keys, `5b9d9b6` test-stack ใช้ /tmp
- ความเป็นนิรนาม: ไม่กระทบเพิ่ม — `banned_words` เก็บแค่คำ, read receipt ส่งแค่ id ข้อความและปิดได้, unsend ลบ HMAC ออกจาก memory ด้วย, สติกเกอร์/เสียงไม่มี HMAC จึงแนบรายงานไม่ได้
- context ที่อัปเดต: core, ops, decisions, open-items, changelog

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

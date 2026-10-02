<p align="center">
  <img src="docs/logo.svg" width="120" height="120" alt="โลโก้ K-Thok">
</p>

<h1 align="center">K-Thok — core</h1>

<p align="center">แชตนิรนามสำหรับชาว สจล. กดแล้วจับคู่ให้เลย</p>

**K-Thok** ย่อมาจาก *KMITL Thok* (thok = talk) เป็นเว็บแชตนิรนามสำหรับนักศึกษา สจล.
กดหาห้องแล้วระบบจับคู่ให้ทันที ไม่มีการปัดหรือรอ match

repo นี้คือ server (NestJS + socket.io) ทำหน้าที่จับคู่ ส่งต่อข้อความ และยืนยันตัวตน
ใช้คู่กับหน้าเว็บ [kthok-client](https://github.com/ITKMTIL/kthok-client)

## แรงบันดาลใจ

ได้ไอเดียมาจาก [Drinks On Me](https://drinksonme.live/) — บาร์ทิพย์สำหรับคุยกับคนแปลกหน้า
โค้ดทั้งหมดเขียนขึ้นใหม่ และโปรเจกต์นี้ไม่มีส่วนเกี่ยวข้องกับทีมงาน Drinks On Me

## ฟีเจอร์หลักของ server

- **จับคู่แบบบังคับ** — มีห้องรออยู่ก็เข้าเลย ไม่มีก็เปิดห้องใหม่ ห้องละ 2 คน
- **เลือกคณะ** — ผู้ใช้ขอคณะที่อยากคุยด้วยได้ ถ้าไม่มีจะรอ `PREFERENCE_GRACE_MS` แล้วย้ายไปห้องว่างอื่น
- **ล็อกอินด้วย Google** — รับเฉพาะอีเมลนักศึกษา ดึงคณะจากรหัสนักศึกษา แล้วออก session token แบบเข้ารหัส (AES-256-GCM)
- **แชต** — ส่งต่อข้อความ สถานะกำลังพิมพ์ รีแอคชัน พร้อมกรองคำหยาบและจำกัดความถี่
- **คิวเพลง YouTube** ต่อห้อง — server ถือสถานะเพลง ทุกคนในห้องเห็นตรงกัน
- **สัญญาณโทรเสียง** — ส่งต่อ offer/answer/ICE ของ WebRTC และออก credential TURN อายุสั้น
- **รอการกลับมา** — socket หลุดแล้วห้องยังอยู่ช่วงหนึ่ง กลับมาทันก็คุยต่อได้

### ความเป็นส่วนตัว

- ไม่มีฐานข้อมูล สถานะทั้งหมดอยู่ใน memory restart แล้วหายหมด
- ไม่เก็บเนื้อหาข้อความ เก็บแค่ id ของข้อความล่าสุดเพื่อให้รีแอคชันทำงาน
- อีเมลและรหัสนักศึกษาใช้ตอนล็อกอินเท่านั้น รหัสนักศึกษากับคณะอยู่ใน session token ที่เข้ารหัสไว้ฝั่งผู้ใช้
- เสียงของการโทรไม่ผ่าน server นี้

## เทคโนโลยี

NestJS 11 · TypeScript · socket.io · google-auth-library

## เริ่มใช้งาน

ต้องมี Node.js 20.12 ขึ้นไป และ [pnpm](https://pnpm.io/)

```bash
pnpm install
cp .env.example .env
pnpm start:dev
```

server เปิดที่ http://localhost:3001 ไฟล์ `.env` ถูกอ่านตอนเริ่ม process แก้แล้วต้อง restart

### ตัวแปรใน `.env`

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `PORT` | `3001` | port ของ server |
| `CLIENT_ORIGIN` | ว่าง | origin ที่อนุญาต คั่นด้วย `,` เว้นว่าง = `http://localhost:3000` และ `*.trycloudflare.com` ควรตั้งเองตอน production |
| `GOOGLE_CLIENT_ID` | ว่าง | OAuth Client ID เว้นว่าง = โหมดทดลอง ไม่บังคับล็อกอิน |
| `SESSION_SECRET` | ว่าง | ค่าลับสำหรับเข้ารหัส session จำเป็นเมื่อเปิดล็อกอิน สร้างด้วย `openssl rand -hex 32` |
| `ALLOWED_EMAIL_DOMAIN` | `kmitl.ac.th` | โดเมนอีเมลที่ล็อกอินได้ |
| `PREFERENCE_GRACE_MS` | `8000` | เวลารอคณะที่ขอก่อนย้ายไปห้องว่างอื่น |
| `RECONNECT_GRACE_MS` | `120000` | เวลาที่เก็บห้องไว้เมื่อ socket หลุด |
| `CALL_ENABLED` | `true` | ตั้ง `false` เพื่อปิดระบบโทรทั้งหมด |
| `CALL_MIN_MESSAGES` | `5` | ต้องคุยกันกี่ข้อความก่อนถึงจะโทรได้ |
| `TURN_KEY_ID`, `TURN_KEY_API_TOKEN` | ว่าง | key ของ Cloudflare Realtime TURN เว้นว่าง = ใช้ STUN อย่างเดียว |
| `CALL_FORCE_RELAY` | `true` | ให้เสียงทุกสายผ่าน TURN เพื่อไม่ให้คู่สนทนาเห็น IP กัน |

### คำสั่ง

| คำสั่ง | ทำอะไร |
| --- | --- |
| `pnpm start:dev` | รันแบบ watch |
| `pnpm build` / `pnpm start:prod` | build และรันแบบ production |
| `pnpm lint` | ตรวจโค้ดด้วย ESLint |

## โครงสร้างโปรเจกต์

```
src/
  auth/          ล็อกอิน Google, session token, แปลงรหัสนักศึกษาเป็นคณะ
  chat/          gateway หลัก: เชื่อมต่อ, จับคู่, ข้อความ, ปิดห้อง
  matchmaking/   logic จับคู่และจัดการห้อง
  music/         คิวเพลงต่อห้อง
  reactions/     รีแอคชันบนข้อความ
  call/          สัญญาณโทรและ credential TURN
  common/        ของใช้ร่วม: รายชื่อคณะ, rate limit, กรองคำ, ตัวช่วย YouTube
  config/        โหลด env, CORS, ตัวเลือกของ gateway, feature flag
```

## ทำงานอย่างไร (คร่าว ๆ)

1. หน้าเว็บส่ง Google ID token มาที่ `POST /auth/google` → server ตรวจกับ Google แล้วตอบ session token
2. หน้าเว็บต่อ socket.io พร้อม token → server ตรวจ แล้วแจ้งคณะและ feature ที่เปิดอยู่
3. `match:find` → เข้าห้องที่รออยู่หรือเปิดห้องใหม่
4. event ในห้องถูกส่งต่อให้อีกฝ่ายหลังผ่านการตรวจและ rate limit
5. ออกจากห้องหรือหลุดเกินเวลา → ห้องและสถานะทั้งหมดถูกลบ

### Socket event

| กลุ่ม | จากหน้าเว็บ | จาก server |
| --- | --- | --- |
| จับคู่ | `match:find`, `room:leave` | `match:found`, `match:fallback`, `room:closed`, `partner:presence`, `stats` |
| แชต | `chat:send`, `chat:typing`, `chat:react` | `chat:message`, `chat:typing`, `chat:reaction` |
| เพลง | `music:add`, `music:play`, `music:pause`, `music:skip`, `music:remove` | `music:state` |
| โทร | `call:invite`, `call:accept`, `call:decline`, `call:end`, `call:signal`, `call:ice` | `call:incoming`, `call:accepted`, `call:ended`, `call:signal` |
| ระบบ | — | `auth:ok`, `auth:error`, `features` |

## ข้อจำกัดที่ควรรู้

- รันได้ instance เดียว เพราะสถานะอยู่ใน memory
- ยังไม่มีระบบ report หรือ block ผู้ใช้
- รายชื่อคณะและรหัสคณะต้องแก้ให้ตรงกันกับฝั่ง client (`src/common/constants/faculties.ts` และ `src/auth/utils/student.ts`)

---

โปรเจกต์นี้พัฒนาโดยมี AI ช่วยเขียนโค้ด ([Claude Code](https://claude.com/claude-code)) ภายใต้การกำกับและตรวจทานของทีมผู้พัฒนา

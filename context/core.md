# kthok-core (NestJS 11 + socket.io)

Port 3001. ทุกอย่างของห้องอยู่ใน memory → รันได้ instance เดียว. Prisma/Postgres ไม่บังคับ (ไม่มี `DATABASE_URL` = ข้าม DB ทั้งหมด).

## Modules (`src/`)

| module | หน้าที่ |
| --- | --- |
| `auth/` | `POST /auth/google` ตรวจ ID token → sealed session; `utils/session-cipher.ts` (AES-256-GCM), `utils/student.ts` (รหัส → คณะ) |
| `chat/chat.gateway.ts` | gateway หลัก: connection auth, `features` emit, `match:find`, `room:leave/block/feedback`, `chat:send/typing`, reconnect grace (`pendingClose`), stats |
| `matchmaking/` | rooms ใน memory, `Participant {socketId, nickname, faculty, userHash, admin, avoid}`, `canPair` (ไม่จับตัวเอง ยกเว้น admin, ไม่จับคู่ที่บล็อก) |
| `music/` | คิว YouTube ต่อห้อง, ตรวจชื่อผ่าน oEmbed |
| `reactions/` | track id ข้อความล่าสุด 200 อัน/ห้อง, คนละ 1 รีแอคชัน |
| `call/` | สัญญาณ WebRTC, ring timeout, `turn.service.ts` ออก credential Cloudflare |
| `voice/` | `voice:send` → ตรวจ magic bytes (webm/mp4/ogg), ≤512KB, ≤60s, peaks 48 ตัว, 6/นาที → `voice:message` ให้คู่ |
| `users/` | `hashOf`, `touch`, `isBanned`, `avoidList`, `block`, `isAdmin` (`ADMIN_STUDENT_IDS` → hash) |
| `stats/` | buffer นับรายวัน flush ทุก 30s, TZ +7; metrics: login match preference_requested preference_met message voice call room room_seconds block feedback_up feedback_down peak_online |
| `admin/` | `GET /admin/overview?days=` Bearer session, 401/403/503 |
| `prisma/` | `enabled` getter, ไม่ต่อ DB ถ้าไม่มี URL |
| `common/` | `constants/{faculties,reactions}`, `utils/{ack,word-filter,youtube}`, `rate-limit/` |
| `config/` | `env`, `origins` (CORS + `*.trycloudflare.com`), `gateway` (`GATEWAY_OPTIONS`, connection state recovery), `features` (`CALL_ENABLED`, `VOICE_ENABLED`) |

## Pattern

- gateway ใหม่: `@WebSocketGateway(GATEWAY_OPTIONS)`, ตรวจ payload เอง, ack `{ok:true,...}` หรือ `fail('code')`, rate limit ผ่าน `RateLimitService.allow(socketId, key, {max, windowMs})`
- ต้องอยู่ในห้องที่จับคู่แล้ว: `matchmaking.activeRoomOf` + `partnerOf`
- ข้อความ/เสียงทุกชิ้น: `reactions.track` + `calls.noteMessage` + `stats.count`
- feature flag ใหม่: `config/features.ts` + ใส่ใน `features` emit ของ chat gateway + `.env.example` + README

## Database

`prisma/schema.prisma`: `users`, `blocks`, `daily_stats` (ดู privacy.md). migration `20261003000000_init`. postinstall รัน `prisma generate`. Docker entrypoint รัน `prisma migrate deploy` เมื่อมี URL. Prisma อ่าน `kthok-core/.env` เอง → ตอนเทสต้องส่ง `DATABASE_URL=` ว่างตรง ๆ.

## Socket events

ดูตารางใน `kthok-core/README.md` หัวข้อ Socket event

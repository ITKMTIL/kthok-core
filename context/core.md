# kthok-core (NestJS 11 + socket.io)

Port 3001. ทุกอย่างของห้องอยู่ใน memory → รันได้ instance เดียว. Prisma/Postgres ไม่บังคับ (ไม่มี `DATABASE_URL` = ข้าม DB ทั้งหมด).

## Modules (`src/`)

| module | หน้าที่ |
| --- | --- |
| `auth/` | `POST /auth/google` ตรวจ ID token → sealed session; `utils/session-cipher.ts` (AES-256-GCM), `utils/student.ts` (รหัส → คณะ) |
| `chat/chat.gateway.ts` | gateway หลัก: connection auth, `features` emit, `match:find`, `room:leave/block/feedback`, `chat:send/typing`, reconnect grace (`pendingClose`), stats |
| `matchmaking/` | rooms ใน memory, `Participant {socketId, key, nickname, faculty, topic, userHash, admin, avoid, recent, penaltyUntil}`, room มี `topic`; `canPair` (ไม่จับตัวเองยกเว้น admin, ไม่จับคู่ที่บล็อก), ข้ามคู่ล่าสุด 3 คนจนกว่า fallback (ทุกห้องตั้ง fallback ที่ max(grace, penalty)), `waitingSummary()` → stats `{faculties, topics}` |
| `music/` | คิว YouTube ต่อห้อง, ตรวจชื่อผ่าน oEmbed |
| `reactions/` | track id ข้อความล่าสุด 200 อัน/ห้อง, คนละ 1 รีแอคชัน |
| `call/` | สัญญาณ WebRTC, ring timeout, `turn.service.ts` ออก credential Cloudflare |
| `prompts/` | `chat:prompt` สุ่มรหัสคำถาม `group.index` (ตามหัวข้อ, ไม่ซ้ำในห้อง) ส่งทั้งสองฝั่ง; ข้อความจริงอยู่ใน client `lib/i18n` (จำนวนต้องตรง `PROMPT_COUNTS`) |
| `moderation/` | `WordListService` โหลด `banned_words` แล้ว `setExtraBannedWords` ให้ word-filter (regex ระดับ module) |
| `games/` | `game:start/move/end` → `game:state` มุมมองต่อคน (`viewOf`), XO + RPS, ผู้เล่นอ้างด้วย socketId |
| `followup/` | record หลังจบห้องต่อ socket (trail: HMAC ข้อความ/null สำหรับเสียง+สติกเกอร์, sender, at; contact) ใช้ตรวจ `replyTo`, `chat:unsend` (≤60s เจ้าของเท่านั้น), `chat:read` (ต้องเป็นข้อความของอีกฝ่าย) อายุ `FOLLOWUP_MS`; `room:keep` แลก contact เมื่อกดทั้งคู่, `room:report` ตรวจ HMAC แล้วส่งให้ reports |
| `reports/` | ตาราง `reports` หลักฐานเข้ารหัส (`sealSession` key `evidence:`+SESSION_SECRET), purge รายชั่วโมง, list/resolve/unban, `countAgainst` |
| `push/` | `web-push` + VAPID, presence (hidden/disconnected) ต่อ socket, `nudge(socketId, kind)` throttle 30s, ลบ subscription 404/410 |
| `voice/` | `voice:send` → ตรวจ magic bytes (webm/mp4/ogg), ≤512KB, ≤60s, peaks 48 ตัว, 6/นาที → `voice:message` ให้คู่ |
| `users/` | `hashOf`, `touch`, `isBanned`, `avoidList`, `block`, `strikes`, `isAdmin` (`ADMIN_STUDENT_IDS` → hash), `onBan`/`notifyBan` (chat gateway เตะ socket ของคนที่ถูกระงับ) |
| `stats/` | buffer นับรายวัน flush ทุก 30s, TZ +7; metrics: login match preference_requested preference_met message sticker voice call room room_seconds block feedback_up feedback_down report keep_offer keep_mutual peak_online |
| `admin/` | Bearer session ของ admin: `GET /admin/overview` (+`totals.openReports`), `GET /admin/reports?status=`, `POST /admin/reports/:id/resolve`, `POST /admin/users/:id/unban`; 401/403/503 |
| `prisma/` | `enabled` getter, ไม่ต่อ DB ถ้าไม่มี URL |
| `common/` | `constants/{faculties,reactions}`, `utils/{ack,word-filter,youtube}`, `rate-limit/` |
| `config/` | `env`, `origins` (CORS + `*.trycloudflare.com`), `gateway` (`GATEWAY_OPTIONS`, connection state recovery), `features` (`CALL_ENABLED`, `VOICE_ENABLED`) |

## Pattern

- gateway ใหม่: `@WebSocketGateway(GATEWAY_OPTIONS)`, ตรวจ payload เอง, ack `{ok:true,...}` หรือ `fail('code')`, rate limit ผ่าน `RateLimitService.allow(socketId, key, {max, windowMs})`
- ต้องอยู่ในห้องที่จับคู่แล้ว: `matchmaking.activeRoomOf` + `partnerOf`
- ข้อความ/เสียงทุกชิ้น: `reactions.track` + `calls.noteMessage` + `stats.count`; ข้อความ text ต้อง `followup.note` (หลัง mask คำหยาบ) เพื่อให้รายงานตรวจได้
- event ที่ส่งถึงคู่และควรเตือนตอนปิดจอ: เรียก `push.nudge(partnerSocketId, kind)`
- state ต่อห้องใหม่ต้อง clear ใน `closeRoomOf` ของ chat gateway (music, prompts, games, reactions, calls, followup.end)
- feature flag ใหม่: `config/features.ts` + ใส่ใน `features` emit ของ chat gateway + `.env.example` + README

## Database

`prisma/schema.prisma`: `users`, `blocks`, `daily_stats`, `reports`, `push_subscriptions`, `banned_words` (ดู privacy.md). migrations `..._init`, `..._reports`, `..._push_subscriptions`, `20261003120000_banned_words` (สร้าง SQL ด้วย `prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script`). postinstall รัน `prisma generate`. Docker entrypoint รัน `prisma migrate deploy` เมื่อมี URL. Prisma อ่าน `kthok-core/.env` เอง → ตอนเทสต้องส่ง `DATABASE_URL=` ว่างตรง ๆ.

## Socket events

ดูตารางใน `kthok-core/README.md` หัวข้อ Socket event

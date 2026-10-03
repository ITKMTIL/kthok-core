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
- **ห้องตามหัวข้อ** — คุยทั่วไป / ติวสอบ / เกม / อยากระบาย / หาเพื่อนกินข้าว จับคู่เฉพาะหัวข้อเดียวกัน และบอก lobby ว่าคณะ/หัวข้อไหนมีคนรอ (ไม่บอกจำนวน)
- **ไม่จับคู่ซ้ำทันที** — จำคู่ล่าสุด 3 คน จะกลับมาเจอกันได้ก็ต่อเมื่อรอเกินช่วง grace แล้วไม่มีคนอื่น
- **หน่วงคนป่วน** — ถูกบล็อกหรือรายงานใน 7 วันตั้งแต่ 3 ครั้ง ต้องรอ 30 วินาทีก่อนจับคู่ (6 ครั้งขึ้นไป 90 วินาที)
- **ล็อกอินด้วย Google** — รับเฉพาะอีเมลนักศึกษา ดึงคณะจากรหัสนักศึกษา แล้วออก session token แบบเข้ารหัส (AES-256-GCM)
- **แชต** — ส่งต่อข้อความ สถานะกำลังพิมพ์ รีแอคชัน พร้อมกรองคำหยาบและจำกัดความถี่
- **คิวเพลง YouTube** ต่อห้อง — server ถือสถานะเพลง ทุกคนในห้องเห็นตรงกัน
- **คำถามชวนคุยและมินิเกม** — สุ่มคำถามธีม สจล. ตามหัวข้อห้อง, XO และเป่ายิ้งฉุบ โดย server ถือ state
- **อยากคุยต่อ** — หลังจบห้อง 10 นาที ถ้ากดทั้งคู่ server ส่ง contact ที่แต่ละคนพิมพ์ให้กัน ไม่เก็บไว้
- **รายงาน** — ผู้ใช้เลือกข้อความแนบได้ server ตรวจกับลายเซ็น (HMAC) ของข้อความที่ส่งจริงในห้อง เก็บแบบเข้ารหัส ลบเองใน 30 วัน admin ตรวจและระงับบัญชีได้ คนที่ถูกระงับหลุดทันที
- **Push notification** — เตือนเมื่อจับคู่ได้ มีข้อความ สายเรียกเข้า หรือมีคนอยากคุยต่อ ตอนแท็บถูกซ่อน ส่งแค่ชนิดเหตุการณ์ ไม่ส่งเนื้อหา
- **ข้อความเสียง** — ส่งต่อไฟล์เสียงไม่เกิน 60 วินาทีให้อีกฝ่าย ตรวจชนิดไฟล์และขนาดก่อน ไม่เก็บไฟล์ไว้
- **สัญญาณโทรเสียง** — ส่งต่อ offer/answer/ICE ของ WebRTC และออก credential TURN อายุสั้น
- **รอการกลับมา** — socket หลุดแล้วห้องยังอยู่ช่วงหนึ่ง กลับมาทันก็คุยต่อได้
- **บล็อกและระงับบัญชี** — คู่ที่บล็อกกันจะไม่ถูกจับคู่อีก บัญชีที่ถูกระงับเชื่อมต่อไม่ได้
- **สถิติการใช้งาน** — นับยอดรวมรายวัน (จับคู่ ข้อความ ข้อความเสียง สายโทร ความพอใจ) และมี endpoint สำหรับหน้า dashboard ของ admin

### ความเป็นส่วนตัว

- สถานะห้อง ข้อความ คิวเพลง และสายโทรอยู่ใน memory เท่านั้น restart แล้วหายหมด
- ไม่เก็บเนื้อหาข้อความ เก็บแค่ id และ HMAC ของข้อความใน memory (เพื่อรีแอคชันและตรวจหลักฐานตอนรายงาน) ลบเมื่อห้องจบเกิน 10 นาที
- ข้อความจะถูกเก็บก็ต่อเมื่อผู้ใช้เลือกแนบตอนรายงานเท่านั้น (เข้ารหัส, ลบใน 30 วัน)
- contact ของ "อยากคุยต่อ" ผ่าน memory แล้วส่งต่อเมื่อกดทั้งคู่ ไม่ลงฐานข้อมูล
- ไม่เก็บอีเมล รหัสนักศึกษา หรือนามแฝง
- เสียงของการโทรไม่ผ่าน server นี้ ส่วนข้อความเสียงผ่านแค่ memory แล้วส่งต่อทันที

สิ่งที่เก็บในฐานข้อมูล (เมื่อตั้ง `DATABASE_URL`):

| ตาราง | เก็บอะไร | ใช้ทำอะไร |
| --- | --- | --- |
| `users` | HMAC ของรหัสนักศึกษา (ย้อนกลับไม่ได้), คณะ, เวลาใช้งานล่าสุด, วันที่ถูกระงับ | ระงับบัญชี นับผู้ใช้ |
| `blocks` | คู่ของผู้ใช้ที่บล็อกกัน | ไม่จับคู่ซ้ำ |
| `daily_stats` | ยอดรวมรายวันต่อ metric และคณะ | รายงานการใช้งาน |
| `reports` | ผู้รายงาน/ผู้ถูกรายงาน (id ภายใน), เหตุผล, หลักฐานที่เข้ารหัส, สถานะ, วันหมดอายุ 30 วัน | ให้ admin ตรวจ |
| `push_subscriptions` | endpoint และ key ของ push ที่ผู้ใช้เปิดเอง ผูกกับ users | ส่งแจ้งเตือน ลบเมื่อปิดหรือ endpoint หมดอายุ |

## เทคโนโลยี

NestJS 11 · TypeScript · socket.io · Prisma + PostgreSQL · google-auth-library

## เริ่มใช้งาน

ต้องมี Node.js 20.12 ขึ้นไป และ [pnpm](https://pnpm.io/)

```bash
pnpm install
cp .env.example .env
pnpm start:dev
```

server เปิดที่ http://localhost:3001 ไฟล์ `.env` ถูกอ่านตอนเริ่ม process แก้แล้วต้อง restart

### ฐานข้อมูล (ไม่บังคับ)

ไม่ตั้ง `DATABASE_URL` server ก็รันได้ แต่จะไม่มีการบล็อก การระงับบัญชี และสถิติ
ถ้าจะใช้ เปิด Postgres จาก compose แล้วสร้างตาราง:

```bash
docker compose up -d db
echo 'DATABASE_URL=postgresql://kthok:kthok@localhost:5432/kthok' >> .env
pnpm exec prisma migrate deploy
```

การระงับบัญชีทำจากหน้า `/admin` ของ client (ตรวจรายงาน → ระงับ 1/7/30 วันหรือถาวร, ยกฟ้อง, ปลดระงับ)

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
| `VOICE_ENABLED` | `true` | ตั้ง `false` เพื่อปิดข้อความเสียง |
| `CALL_MIN_MESSAGES` | `5` | ต้องคุยกันกี่ข้อความก่อนถึงจะโทรได้ |
| `TURN_KEY_ID`, `TURN_KEY_API_TOKEN` | ว่าง | key ของ Cloudflare Realtime TURN เว้นว่าง = ใช้ STUN อย่างเดียว |
| `CALL_FORCE_RELAY` | `true` | ให้เสียงทุกสายผ่าน TURN เพื่อไม่ให้คู่สนทนาเห็น IP กัน |
| `DATABASE_URL` | ว่าง | connection string ของ PostgreSQL เว้นว่าง = ไม่ใช้ฐานข้อมูล |
| `USER_HASH_SECRET` | ว่าง | ค่าลับสำหรับทำ hash รหัสนักศึกษา เว้นว่าง = ใช้ `SESSION_SECRET` ห้ามเปลี่ยนหลังมีผู้ใช้แล้ว ไม่งั้นการบล็อกและการระงับจะหลุด |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | ว่าง | key ของ Web Push สร้างด้วย `pnpm exec web-push generate-vapid-keys` เว้นว่าง = ปิด push |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | ช่องทางติดต่อที่ส่งให้ push service |
| `FOLLOWUP_MS` | `600000` | เวลาหลังจบห้องที่ยังกด "อยากคุยต่อ" หรือรายงานได้ |
| `ADMIN_STUDENT_IDS` | ว่าง | รหัสนักศึกษาของ admin คั่นด้วย `,` ใช้เปิดหน้า dashboard และจับคู่กับบัญชีตัวเองได้ (เปิดสองแท็บเพื่อทดสอบ) |

### คำสั่ง

| คำสั่ง | ทำอะไร |
| --- | --- |
| `pnpm start:dev` | รันแบบ watch |
| `pnpm build` / `pnpm start:prod` | build และรันแบบ production |
| `pnpm lint` | ตรวจโค้ดด้วย ESLint |

## Docker

image ทั้งหมด build สำหรับ `linux/amd64`

```bash
./scripts/build-image.sh
```

ได้ 2 image:

| image | ขนาดโดยประมาณ | ใช้ทำอะไร |
| --- | --- | --- |
| `kthok-core` | ~300MB | ตัว server มีแค่ dependency ที่ใช้ตอนรัน (ตัด Prisma CLI, TypeScript และไฟล์ wasm ที่ไม่ได้ใช้ออก) |
| `kthok-core-migrate` | ~1GB | รัน `prisma migrate deploy` ครั้งเดียวแล้วจบ ใช้ก่อนเริ่ม server ทุกครั้งที่มี migration ใหม่ |

ตั้งชื่อและ tag ได้ด้วยตัวแปร เช่น `IMAGE=registry.example.com/kthok-core TAG=1.0.0 PUSH=1 ./scripts/build-image.sh`

ถ้าไม่ได้ใช้ compose ให้รัน migrate เองก่อน: `docker run --rm -e DATABASE_URL=... kthok-core-migrate`

`docker-compose.yml` รวม Postgres, migrate, core และ client ไว้ด้วยกัน (core รอให้ migrate จบก่อน) โดยคาดว่า clone `kthok-client` ไว้ข้าง ๆ repo นี้:

```bash
docker compose build
docker compose up -d
```

compose อ่านค่าจาก `.env` ของ repo นี้ ค่าที่ใช้ตอน build หน้าเว็บคือ `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_CORE_URL` และ `NEXT_PUBLIC_SITE_URL`
ตั้ง `POSTGRES_PASSWORD` ก่อนใช้งานจริง

## โครงสร้างโปรเจกต์

```
src/
  admin/         endpoint สถิติ รายงาน และการระงับบัญชีสำหรับ dashboard
  auth/          ล็อกอิน Google, session token, แปลงรหัสนักศึกษาเป็นคณะ
  chat/          gateway หลัก: เชื่อมต่อ, จับคู่, ข้อความ, ปิดห้อง
  matchmaking/   logic จับคู่และจัดการห้อง
  music/         คิวเพลงต่อห้อง
  reactions/     รีแอคชันบนข้อความ
  call/          สัญญาณโทรและ credential TURN
  voice/         ส่งต่อข้อความเสียง
  prompts/       คำถามชวนคุย
  games/         XO และเป่ายิ้งฉุบ
  followup/      หลังจบห้อง: อยากคุยต่อ และรายงาน
  reports/       เก็บ/ตรวจรายงาน เข้ารหัสหลักฐาน ลบเมื่อหมดอายุ
  push/          Web Push
  users/         ผู้ใช้แบบ hash, การระงับ, การบล็อก
  stats/         ตัวนับสถิติรายวัน
  prisma/        การเชื่อมต่อฐานข้อมูล
  common/        ของใช้ร่วม: รายชื่อคณะ, rate limit, กรองคำ, ตัวช่วย YouTube
  config/        โหลด env, CORS, ตัวเลือกของ gateway, feature flag
```

## ทำงานอย่างไร (คร่าว ๆ)

1. หน้าเว็บส่ง Google ID token มาที่ `POST /auth/google` → server ตรวจกับ Google แล้วตอบ session token
2. หน้าเว็บต่อ socket.io พร้อม token → server ตรวจ แล้วแจ้งคณะและ feature ที่เปิดอยู่
3. `match:find` → เข้าห้องที่รออยู่หรือเปิดห้องใหม่
4. event ในห้องถูกส่งต่อให้อีกฝ่ายหลังผ่านการตรวจและ rate limit
5. ออกจากห้องหรือหลุดเกินเวลา → ห้องและสถานะทั้งหมดถูกลบ

แผนภาพของแต่ละฟีเจอร์อยู่ในหัวข้อ [Flow การทำงานของแต่ละฟีเจอร์](#flow-การทำงานของแต่ละฟีเจอร์) ด้านล่าง

### Socket event

| กลุ่ม | จากหน้าเว็บ | จาก server |
| --- | --- | --- |
| จับคู่ | `match:find` (`topic`, `preferFaculty`), `room:leave`, `room:block`, `room:feedback` | `match:found`, `match:fallback`, `room:closed`, `partner:presence`, `stats` |
| แชต | `chat:send`, `chat:typing`, `chat:react`, `chat:prompt` | `chat:message`, `chat:typing`, `chat:reaction`, `chat:prompt` |
| เกม | `game:start`, `game:move`, `game:end` | `game:state` |
| หลังจบห้อง | `room:keep`, `room:report` | `room:keep-offered`, `room:contact` |
| แจ้งเตือน | `presence:visibility`, `push:subscribe`, `push:unsubscribe` | — |
| เพลง | `music:add`, `music:play`, `music:pause`, `music:skip`, `music:remove` | `music:state` |
| ข้อความเสียง | `voice:send` | `voice:message` |
| โทร | `call:invite`, `call:accept`, `call:decline`, `call:end`, `call:signal`, `call:ice` | `call:incoming`, `call:accepted`, `call:ended`, `call:signal` |
| ระบบ | — | `auth:ok`, `auth:error`, `auth:banned`, `features` |

HTTP สำหรับ admin (Bearer session ของ admin): `GET /admin/overview?days=`, `GET /admin/reports?status=open|closed`, `POST /admin/reports/:id/resolve` (`{action: "dismiss"}` หรือ `{action: "ban", days: 1|7|30|null, reason}`), `POST /admin/users/:id/unban`

## Flow การทำงานของแต่ละฟีเจอร์

ชื่อ event ในแผนภาพตรงกับที่ใช้ในโค้ดจริง ผู้ใช้สองคนในห้องเรียกว่า A และ B กดที่หัวข้อเพื่อเปิดดูแผนภาพ

### ภาพรวมระบบ

```mermaid
flowchart LR
  subgraph Browser["Browser ของผู้ใช้"]
    Web["kthok-client<br/>Next.js"]
  end
  subgraph Server["kthok-core (NestJS)"]
    Auth["auth<br/>POST /auth/google"]
    Chat["chat gateway<br/>จับคู่ + ข้อความ"]
    Music["music gateway"]
    Reactions["reactions gateway"]
    Call["call gateway"]
    Memory[("สถานะห้อง<br/>ใน memory")]
  end
  Google["Google<br/>ตรวจ ID token"]
  YouTube["YouTube<br/>player + oEmbed"]
  Turn["Cloudflare TURN"]

  Web -- "HTTPS" --> Auth
  Web <-- "socket.io" --> Chat
  Web <-- "socket.io" --> Music
  Web <-- "socket.io" --> Reactions
  Web <-- "socket.io" --> Call
  Auth --> Google
  Music --> YouTube
  Call --> Turn
  Chat --- Memory
  Music --- Memory
  Reactions --- Memory
  Call --- Memory
  Web -. "เสียงโทร (WebRTC)" .-> Turn
  Web -. "วิดีโอเพลง" .-> YouTube
```

gateway ทั้งหมดใช้ socket เส้นเดียวกัน ไม่มีฐานข้อมูลเก็บข้อความ

<details>
<summary><b>1. ล็อกอินด้วยอีเมลนักศึกษา</b></summary>

ทำงานเมื่อ core ตั้ง `GOOGLE_CLIENT_ID` ไว้ ถ้าไม่ตั้งจะเป็นโหมดทดลองที่ข้ามขั้นตอนนี้

```mermaid
sequenceDiagram
  autonumber
  actor U as ผู้ใช้
  participant W as หน้าเว็บ
  participant G as Google
  participant C as core

  U->>W: กดปุ่ม Sign in with Google
  W->>G: เปิดหน้าต่างเลือกบัญชี
  G-->>W: ID token
  W->>C: POST /auth/google { credential }
  C->>G: ตรวจลายเซ็นและ audience ของ token
  G-->>C: อีเมลที่ยืนยันแล้ว
  alt ไม่ใช่อีเมลนักศึกษา หรือไม่รู้จักรหัสคณะ
    C-->>W: 403 พร้อมเหตุผล
    W-->>U: แสดงข้อความแจ้ง
  else ผ่าน
    Note over C: ดึงรหัสนักศึกษาและคณะจากอีเมล<br/>เข้ารหัสเป็น session token (AES-256-GCM)
    C-->>W: { token }
    Note over W: เก็บ token ใน localStorage<br/>อ่านหรือแก้ข้างในไม่ได้
    W->>C: ต่อ socket.io พร้อม token
    alt token ใช้ไม่ได้หรือหมดอายุ
      C-->>W: auth:error แล้วตัดการเชื่อมต่อ
      W-->>U: กลับไปหน้าล็อกอิน
    else token ถูกต้อง
      C-->>W: auth:ok { faculty }
      C-->>W: features { call }
      W-->>U: เข้าหน้า lobby คณะถูกล็อกตามรหัสนักศึกษา
    end
  end
```

</details>

<details>
<summary><b>2. จับคู่และเลือกคณะ</b></summary>

ผู้ใช้กด "หาเพื่อนคุย" หน้าเว็บส่ง `match:find` พร้อมนามแฝงและคณะที่อยากคุยด้วย (ถ้ามี)

```mermaid
flowchart TD
  Start(["match:find"]) --> Check{"ผ่าน rate limit<br/>และนามแฝงใช้ได้"}
  Check -- "ไม่ผ่าน" --> Reject["ตอบ error<br/>กลับหน้า lobby"]
  Check -- "ผ่าน" --> Pref{"เลือกคณะไว้ไหม"}

  Pref -- "ไม่ได้เลือก" --> AnyOpen{"มีห้องรออยู่ไหม"}
  AnyOpen -- "มี" --> Join["เข้าห้องนั้น<br/>ห้องที่เจ้าของขอคณะเราได้ก่อน"]
  AnyOpen -- "ไม่มี" --> Create["เปิดห้องใหม่แล้วรอ"]

  Pref -- "เลือก" --> PrefOpen{"มีห้องของคนคณะนั้นรออยู่ไหม"}
  PrefOpen -- "มี" --> JoinPref["เข้าห้องนั้น<br/>ตรงคณะที่ขอ"]
  PrefOpen -- "ไม่มี" --> CreateWait["เปิดห้องใหม่แล้วรอ<br/>PREFERENCE_GRACE_MS"]
  CreateWait --> Someone{"มีคนเข้ามาก่อนหมดเวลาไหม"}
  Someone -- "มี" --> Matched
  Someone -- "ไม่มี" --> Other{"มีห้องอื่นรออยู่ไหม"}
  Other -- "มี" --> Move["ย้ายไปห้องนั้น<br/>ไม่ตรงคณะที่ขอ"]
  Other -- "ไม่มี" --> Open["match:fallback<br/>รอต่อ รับทุกคณะ"]

  Join --> Matched(["match:found ถึงทั้งสองฝั่ง"])
  JoinPref --> Matched
  Move --> Matched
  Create --> Waiting(["รอคนถัดไปกดหาห้อง"])
  Open --> Waiting
  Waiting --> Matched
```

</details>

<details>
<summary><b>3. แชตและรีแอคชัน</b></summary>

```mermaid
sequenceDiagram
  autonumber
  participant A as หน้าเว็บ A
  participant C as core
  participant B as หน้าเว็บ B

  A->>C: chat:typing { typing: true }
  C->>B: chat:typing

  A->>C: chat:send { text }
  Note over C: ตรวจความยาวและ rate limit<br/>แทนคำหยาบด้วย ***<br/>จำ id ข้อความ ไม่เก็บเนื้อหา
  alt ส่งถี่เกินไป
    C-->>A: ack rate_limited
    Note over A: แจ้งเตือน ข้อความที่พิมพ์ยังอยู่
  else ผ่าน
    C->>B: chat:message { id, text, at }
    C-->>A: ack พร้อมข้อความที่กรองแล้ว
  end

  B->>C: chat:react { messageId, reaction }
  Note over C: รับเฉพาะ emoji 6 ตัวที่กำหนด<br/>คนละ 1 รีแอคชันต่อข้อความ
  C->>A: chat:reaction { mine, theirs }
  C->>B: chat:reaction { mine, theirs }
```

</details>

<details>
<summary><b>4. ฟังเพลงด้วยกัน</b></summary>

core เป็นผู้ถือสถานะเพลงของห้อง หน้าเว็บทั้งสองฝั่งปรับ player ให้ตรงกับสถานะนั้น

```mermaid
sequenceDiagram
  autonumber
  participant A as หน้าเว็บ A
  participant C as core
  participant Y as YouTube
  participant B as หน้าเว็บ B

  A->>C: music:add { url }
  C->>Y: ขอชื่อคลิปผ่าน oEmbed
  alt ไม่มีคลิปหรือห้ามฝัง
    C-->>A: ack video_unavailable
  else ใช้ได้
    Note over C: ไม่มีเพลงเล่นอยู่ = เล่นเลย<br/>มีแล้ว = ต่อคิว
    C->>A: music:state
    C->>B: music:state
  end

  loop ทุก 0.5 วินาทีในแต่ละหน้าเว็บ
    Note over A,B: เทียบ player กับ music:state<br/>โหลดคลิป เล่น หยุด หรือ seek ถ้าเพี้ยนเกิน 2 วินาที
  end

  B->>C: music:pause
  C->>A: music:state { playing: false }
  C->>B: music:state { playing: false }

  Note over A,B: คลิปจบหรือเล่นไม่ได้
  A->>C: music:skip { trackId }
  B->>C: music:skip { trackId }
  Note over C: trackId เดียวกันถูกข้ามแค่ครั้งเดียว
  C->>A: music:state เพลงถัดไป
  C->>B: music:state เพลงถัดไป
```

</details>

<details>
<summary><b>5. โทรคุยเสียง</b></summary>

core ส่งต่อเฉพาะสัญญาณ ตัวเสียงวิ่งผ่าน WebRTC ระหว่างสองเครื่อง หรือผ่าน TURN เมื่อบังคับ relay

```mermaid
sequenceDiagram
  autonumber
  participant A as หน้าเว็บ A (คนโทร)
  participant C as core
  participant T as Cloudflare TURN
  participant B as หน้าเว็บ B (คนรับ)

  Note over A: ขอสิทธิ์ใช้ไมค์
  A->>C: call:invite
  alt ปิดระบบโทร / คุยยังไม่ถึง CALL_MIN_MESSAGES / มีสายค้าง
    C-->>A: ack error
  else โทรได้
    C->>B: call:incoming
    Note over B: เสียงเรียกเข้า รอกดรับ
  end

  alt B ไม่รับใน 30 วินาที
    C->>A: call:ended { no_answer }
    C->>B: call:ended { no_answer }
  else B กดไม่รับ
    B->>C: call:decline
    C->>A: call:ended { declined }
  else B กดรับ
    Note over B: ขอสิทธิ์ใช้ไมค์
    B->>C: call:ice
    C->>T: ขอ credential อายุสั้น
    T-->>C: iceServers
    C-->>B: iceServers + relayOnly
    B->>C: call:accept
    C->>A: call:accepted
    A->>C: call:ice
    C-->>A: iceServers + relayOnly
    A->>C: call:signal { offer }
    C->>B: call:signal { offer }
    B->>C: call:signal { answer }
    C->>A: call:signal { answer }
    A-->>B: แลก ICE candidate ผ่าน call:signal
    Note over A,B: ต่อ WebRTC สำเร็จ เสียงไม่ผ่าน core
    A->>C: call:end
    C->>B: call:ended { hangup }
  end
```

</details>

<details>
<summary><b>6. หลุดแล้วกลับห้องเดิม</b></summary>

ใช้ connection state recovery ของ socket.io ห้องถูกเก็บไว้ `RECONNECT_GRACE_MS` หลัง socket หลุด

```mermaid
sequenceDiagram
  autonumber
  participant A as หน้าเว็บ A
  participant C as core
  participant B as หน้าเว็บ B

  Note over A: พับจอ หรือเน็ตสะดุด
  A--xC: socket หลุด
  Note over C: ยังไม่ปิดห้อง เริ่มจับเวลา
  C->>B: partner:presence { away: true }
  B->>C: chat:send
  Note over C: เก็บ event ของ A ไว้รอส่ง

  alt A กลับมาทันเวลา
    A->>C: ต่อใหม่ด้วย session เดิม
    Note over C: ยกเลิกการจับเวลา
    C->>A: ส่ง event ที่พลาดไปย้อนหลัง
    C->>B: partner:presence { away: false }
    Note over A: คุยต่อในห้องเดิม ข้อความเดิมอยู่ครบ
  else เกินเวลา
    Note over C: ปิดห้อง ลบคิวเพลง รีแอคชัน และสายโทร
    C->>B: room:closed
  end
```

กด "ออก" หรือปิดหน้าเว็บจะส่ง `room:leave` และปิดห้องทันทีโดยไม่รอ

</details>

<details>
<summary><b>7. แชร์บทสนทนาเป็นรูป</b></summary>

ทำงานในหน้าเว็บทั้งหมด ไม่มีการส่งข้อมูลไป core

```mermaid
flowchart LR
  Share["กดปุ่มแชร์"] --> Select["เลือกข้อความ<br/>สูงสุด 20"]
  Select --> Card["จัดลงการ์ด<br/>ซ่อนนามแฝงอีกฝ่ายเป็นค่าเริ่มต้น"]
  Card --> Render["แปลงเป็น PNG กว้าง 1080px<br/>ใน browser"]
  Render --> Save["บันทึกรูป"]
  Render --> Copy["คัดลอก"]
  Render --> Sheet["share sheet ของระบบ"]
```

</details>

<details>
<summary><b>8. ข้อความเสียง</b></summary>

core ส่งต่อไฟล์เสียงอย่างเดียว ไม่เขียนลงดิสก์หรือฐานข้อมูล ไฟล์อยู่ใน memory ของ browser ทั้งสองฝั่งจนออกจากห้อง

```mermaid
sequenceDiagram
  participant A as หน้าเว็บ A
  participant C as core
  participant B as หน้าเว็บ B

  Note over A: กดไมค์ อัดด้วย MediaRecorder<br/>หยุดเองที่ 60 วินาที<br/>เก็บระดับเสียงเป็น waveform 48 แท่ง
  A->>C: voice:send (ไฟล์เสียง, ความยาว, waveform)
  alt ปิดระบบ / ไฟล์เกิน 512KB / ไม่ใช่ webm, mp4, ogg / ส่งถี่เกิน
    C-->>A: ack ไม่สำเร็จ
  else ผ่าน
    C->>B: voice:message (ไฟล์เสียง + mime)
    C-->>A: ack พร้อม id ข้อความ
  end
  Note over A,B: สร้าง blob URL ในเครื่อง ฟังซ้ำ เลื่อนตำแหน่ง<br/>และเร่งความเร็วได้ เพลง YouTube ลดเสียงระหว่างอัดหรือฟัง
  Note over A,B: ออกจากห้อง → revoke blob URL ไฟล์หายจากเครื่อง
```

</details>

<details>
<summary><b>9. หลังจบห้อง: อยากคุยต่อ และรายงาน</b></summary>

core จำห้องที่เพิ่งจบไว้ใน memory 10 นาที (`FOLLOWUP_MS`) พร้อม HMAC ของข้อความแต่ละอัน ไม่เก็บตัวข้อความ

```mermaid
sequenceDiagram
  participant A as หน้าเว็บ A
  participant C as core
  participant B as หน้าเว็บ B
  participant D as ฐานข้อมูล

  Note over A,B: ห้องจบ (ใครกดออกก็ได้ ทั้งคู่เห็นหน้าจบห้อง)
  A->>C: room:keep (contact ของ A)
  C->>B: room:keep-offered
  B->>C: room:keep (contact ของ B)
  C->>A: room:contact (contact ของ B)
  C->>B: room:contact (contact ของ A)
  Note over C: contact ไม่ลงฐานข้อมูล

  A->>C: room:report (เหตุผล, ข้อความที่เลือกแนบ)
  alt ข้อความไม่ตรงกับ HMAC ที่ส่งจริง / รายงานซ้ำ
    C-->>A: ack ไม่สำเร็จ
  else ผ่าน
    C->>D: reports (หลักฐานเข้ารหัส AES-256-GCM, หมดอายุ 30 วัน)
    C-->>A: ack สำเร็จ
  end
  Note over D: admin ตรวจที่ /admin → ระงับบัญชี → core ตัดการเชื่อมต่อคนนั้นทันที
```

</details>

<details>
<summary><b>10. Push notification</b></summary>

```mermaid
sequenceDiagram
  participant W as หน้าเว็บ + service worker
  participant C as core
  participant P as push service ของเบราว์เซอร์

  W->>W: ผู้ใช้กดเปิด → ขอสิทธิ์ → pushManager.subscribe(VAPID key)
  W->>C: push:subscribe (endpoint, keys)
  C->>C: เก็บใน push_subscriptions ผูกกับ users
  W->>C: presence:visibility (hidden: true) เมื่อสลับแท็บ
  Note over C: มีจับคู่ / ข้อความ / สายเรียกเข้า / คนอยากคุยต่อ<br/>และแท็บถูกซ่อน (เว้นช่วง 30 วินาทีต่อชนิด)
  C->>P: ส่ง {kind} อย่างเดียว ไม่มีเนื้อหาหรือชื่อ
  P->>W: push event → service worker แสดงข้อความภาษาไทยตาม kind
```

</details>

## ข้อจำกัดที่ควรรู้

- รันได้ instance เดียว เพราะสถานะอยู่ใน memory
- ตัวนับสถิติถูกเขียนลงฐานข้อมูลเป็นรอบ ถ้า process ถูกปิดกะทันหัน ตัวเลขรอบล่าสุด (ไม่เกิน 30 วินาที) จะหาย
- รายชื่อคณะและรหัสคณะต้องแก้ให้ตรงกันกับฝั่ง client (`src/common/constants/faculties.ts` และ `src/auth/utils/student.ts`)

---

โปรเจกต์นี้พัฒนาโดยมี AI ช่วยเขียนโค้ด ([Claude Code](https://claude.com/claude-code)) ภายใต้การกำกับและตรวจทานของทีมผู้พัฒนา

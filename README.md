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

แผนภาพของแต่ละฟีเจอร์อยู่ในหัวข้อ [Flow การทำงานของแต่ละฟีเจอร์](#flow-การทำงานของแต่ละฟีเจอร์) ด้านล่าง

### Socket event

| กลุ่ม | จากหน้าเว็บ | จาก server |
| --- | --- | --- |
| จับคู่ | `match:find`, `room:leave` | `match:found`, `match:fallback`, `room:closed`, `partner:presence`, `stats` |
| แชต | `chat:send`, `chat:typing`, `chat:react` | `chat:message`, `chat:typing`, `chat:reaction` |
| เพลง | `music:add`, `music:play`, `music:pause`, `music:skip`, `music:remove` | `music:state` |
| โทร | `call:invite`, `call:accept`, `call:decline`, `call:end`, `call:signal`, `call:ice` | `call:incoming`, `call:accepted`, `call:ended`, `call:signal` |
| ระบบ | — | `auth:ok`, `auth:error`, `features` |

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

## ข้อจำกัดที่ควรรู้

- รันได้ instance เดียว เพราะสถานะอยู่ใน memory
- ยังไม่มีระบบ report หรือ block ผู้ใช้
- รายชื่อคณะและรหัสคณะต้องแก้ให้ตรงกันกับฝั่ง client (`src/common/constants/faculties.ts` และ `src/auth/utils/student.ts`)

---

โปรเจกต์นี้พัฒนาโดยมี AI ช่วยเขียนโค้ด ([Claude Code](https://claude.com/claude-code)) ภายใต้การกำกับและตรวจทานของทีมผู้พัฒนา

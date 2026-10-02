# K-Thok — flow การทำงานของแต่ละฟีเจอร์

แผนภาพด้านล่างอธิบายลำดับการทำงานระหว่าง **หน้าเว็บ** ([kthok-client](https://github.com/ITKMTIL/kthok-client)) กับ **core** (repo นี้)
ชื่อ event ตรงกับที่ใช้ในโค้ดจริง ผู้ใช้สองคนในห้องเรียกว่า A และ B

- [ภาพรวมระบบ](#ภาพรวมระบบ)
- [1. ล็อกอินด้วยอีเมลนักศึกษา](#1-ล็อกอินด้วยอีเมลนักศึกษา)
- [2. จับคู่และเลือกคณะ](#2-จับคู่และเลือกคณะ)
- [3. แชตและรีแอคชัน](#3-แชตและรีแอคชัน)
- [4. ฟังเพลงด้วยกัน](#4-ฟังเพลงด้วยกัน)
- [5. โทรคุยเสียง](#5-โทรคุยเสียง)
- [6. หลุดแล้วกลับห้องเดิม](#6-หลุดแล้วกลับห้องเดิม)
- [7. แชร์บทสนทนาเป็นรูป](#7-แชร์บทสนทนาเป็นรูป)

## ภาพรวมระบบ

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

## 1. ล็อกอินด้วยอีเมลนักศึกษา

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

## 2. จับคู่และเลือกคณะ

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

## 3. แชตและรีแอคชัน

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

## 4. ฟังเพลงด้วยกัน

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

## 5. โทรคุยเสียง

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

## 6. หลุดแล้วกลับห้องเดิม

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

## 7. แชร์บทสนทนาเป็นรูป

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

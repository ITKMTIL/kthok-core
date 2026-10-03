# Ops ของ kthok-core

## รันตอนพัฒนา

- `pnpm start:dev` (port 3001) — เจ้าของรันเอง watcher อาจค้างหลัง git เขียนไฟล์ทับ (merge/reset/สลับ branch) → เทียบ `dist/` กับ `src/` แล้ว `pnpm exec tsc -p tsconfig.build.json --incremental false` ถ้าค้าง
- DB: `docker compose up -d db` (user/pass/db = kthok/kthok/kthok, `127.0.0.1:5432`) แล้ว `pnpm exec prisma migrate deploy`
- ไม่ใช้ Docker: `pnpm exec prisma dev --detach` ต้องต่อท้าย URL ด้วย `&pgbouncer=true&connection_limit=1`
- client อยู่ที่ `../kthok-client` (port 3000), tunnel cloudflared → อาจมีคนจริงต่ออยู่

## env

ตารางเต็มใน README. สำคัญ: `GOOGLE_CLIENT_ID`, `SESSION_SECRET`, `USER_HASH_SECRET`, `DATABASE_URL`, `ADMIN_STUDENT_IDS`, `CLIENT_ORIGIN`, `CALL_ENABLED`, `VOICE_ENABLED`, `CALL_MIN_MESSAGES`, `TURN_KEY_ID`, `TURN_KEY_API_TOKEN`, `CALL_FORCE_RELAY`, `PREFERENCE_GRACE_MS`, `RECONNECT_GRACE_MS`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (สร้างด้วย `pnpm exec web-push generate-vapid-keys`), `FOLLOWUP_MS`. ค่าจริงเจ้าของใส่เอง

## Docker

ทุก image `--platform=linux/amd64`, multi-stage `node:22-slim`, pnpm 10.26.1 (corepack). `scripts/build-image.sh`, `docker-compose.yml` (db + core + client). entrypoint รัน `prisma migrate deploy` เมื่อมี `DATABASE_URL`. image ~1GB (ยังไม่ได้ลด)

## เทส (ห้ามใช้ 3000/3001)

```bash
.claude/scripts/test-stack.sh core | up | down
.claude/scripts/test-stack.sh node script.cjs
```

- core 3056 build ไป `$TMPDIR/kthok-test/core`, ส่ง `GOOGLE_CLIENT_ID=` `DATABASE_URL=` ว่างตรง ๆ (Prisma อ่าน `.env` เอง)
- partner จำลอง = socket.io-client script (`node` subcommand ใช้ deps ของ client), faculty id เช่น `engineering`
- ห้ามเปิดเพลง YouTube ในเทส
- เทสที่ต้องมี auth + DB (report, block, push, admin): `pnpm exec prisma dev --name kthoktest --detach` → migrate deploy → รัน `$TMPDIR/kthok-test/core/main.js` เองด้วย `GOOGLE_CLIENT_ID=test.apps SESSION_SECRET=testsecret DATABASE_URL=<url>&pgbouncer=true&connection_limit=1` แล้วสร้าง token ด้วย `sealSession({v:2, sub: HMAC(secret, studentId), faculty, exp}, secret)` จาก dist; จบแล้ว `prisma dev stop/rm kthoktest`
- check: `pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec eslint src`

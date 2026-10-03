const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const ece = require('http_ece');
const { io } = require('socket.io-client');
const { sealSession } = require('/tmp/kthok-test/core/auth/utils/session-cipher.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = (sid) => sealSession({ v: 2, sub: crypto.createHmac('sha256', 'testsecret').update(sid).digest('hex'), faculty: 'engineering', exp: Date.now() + 3600e3 }, 'testsecret');

const devices = {};
function device(name) {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  devices[name] = { ecdh, auth, got: [] };
  return { endpoint: 'https://localhost:8443/push/' + name, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
}
const server = https.createServer({ key: fs.readFileSync('/tmp/kthok-test/key.pem'), cert: fs.readFileSync('/tmp/kthok-test/cert.pem') }, (req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    const name = req.url.split('/').pop(); const d = devices[name];
    let payload = '?';
    try { payload = ece.decrypt(Buffer.concat(chunks), { version: 'aes128gcm', privateKey: d.ecdh, authSecret: d.auth }).toString(); } catch (e) { payload = 'DECRYPT_FAIL ' + e.message; }
    d.got.push({ payload, ttl: req.headers.ttl, vapid: /^vapid t=/.test(req.headers.authorization || ''), urgency: req.headers.urgency });
    res.writeHead(201); res.end();
  });
});
const sock = (sid) => io('http://localhost:3056', { auth: { token: tok(sid) } });
const counts = () => Object.fromEntries(Object.entries(devices).map(([k, v]) => [k, v.got.length]));
const result = [];
const check = (name, ok, extra = '') => result.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : ''));

(async () => {
  await new Promise((r) => server.listen(8443, r));
  const A = sock('66070001'), Aweb = sock('66070001'), B = sock('66070002'), C = sock('66070003');
  let feat; A.on('features', (f) => (feat = f));
  await sleep(800);
  check('features carry VAPID public key', typeof feat?.push === 'string' && feat.push.length > 60);
  console.log('subscribe phone', JSON.stringify(await A.emitWithAck('push:subscribe', { subscription: device('phone') })));
  console.log('subscribe laptop (other socket, same user)', JSON.stringify(await Aweb.emitWithAck('push:subscribe', { subscription: device('laptop') })));
  check('bad subscription rejected', (await A.emitWithAck('push:subscribe', { subscription: { endpoint: 'http://x', keys: {} } })).error === 'invalid_subscription');

  A.emit('presence:visibility', { hidden: true });
  await A.emitWithAck('match:find', { nickname: 'A' });
  await sleep(200);
  await B.emitWithAck('match:find', { nickname: 'B' }); await sleep(800);
  check('match push to hidden waiting owner (phone only)', devices.phone.got.length === 1 && devices.laptop.got.length === 0, JSON.stringify(counts()));
  check('payload is only {kind}', devices.phone.got[0]?.payload === '{"kind":"match"}', devices.phone.got[0]?.payload);
  check('VAPID auth + TTL + urgency headers', devices.phone.got[0]?.vapid && devices.phone.got[0]?.ttl === '120' && devices.phone.got[0]?.urgency === 'high', JSON.stringify(devices.phone.got[0]));

  A.emit('presence:visibility', { hidden: false }); await sleep(100);
  await B.emitWithAck('chat:send', { text: 'visible now' }); await sleep(600);
  check('no push while page visible', devices.phone.got.length === 1, JSON.stringify(counts()));

  A.emit('presence:visibility', { hidden: true }); await sleep(100);
  await B.emitWithAck('chat:send', { text: 'secret text' }); await sleep(600);
  check('message push when hidden', devices.phone.got.length === 2 && devices.phone.got[1].payload === '{"kind":"message"}', JSON.stringify(devices.phone.got.map((g) => g.payload)));
  check('message text never in payload', !devices.phone.got.some((g) => g.payload.includes('secret')));
  await B.emitWithAck('chat:send', { text: 'again' }); await sleep(600);
  check('throttled within window', devices.phone.got.length === 2, JSON.stringify(counts()));
  check('laptop (not in this room) never pushed', devices.laptop.got.length === 0);

  await sleep(2100);
  console.log('call invite', JSON.stringify(await B.emitWithAck('call:invite'))); await sleep(600);
  check('call push', devices.phone.got.some((g) => g.payload === '{"kind":"call"}'), JSON.stringify(devices.phone.got.map((g) => g.payload)));
  B.emit('call:end');

  A.disconnect(); await sleep(300);
  check('nothing sent on disconnect itself', devices.phone.got.length === 3, JSON.stringify(counts()));
  await B.emitWithAck('room:leave'); await sleep(300);
  console.log('keep offer from B', JSON.stringify(await B.emitWithAck('room:keep', { contact: 'ig: b' }))); await sleep(600);
  check('keep push while disconnected (grace)', devices.phone.got.some((g) => g.payload === '{"kind":"keep"}'), JSON.stringify(devices.phone.got.map((g) => g.payload)));

  await sleep(2100);
  const A2 = sock('66070001'); await sleep(600);
  await A2.emitWithAck('push:subscribe', { subscription: { endpoint: 'https://localhost:8443/push/phone', keys: { p256dh: devices.phone.ecdh.getPublicKey().toString('base64url'), auth: devices.phone.auth.toString('base64url') } } });
  A2.emit('presence:visibility', { hidden: true });
  await A2.emitWithAck('match:find', { nickname: 'A2' }); await sleep(200);
  const before = devices.phone.got.length;
  await C.emitWithAck('match:find', { nickname: 'C' }); await sleep(800);
  check('new socket after reconnect gets match push again', devices.phone.got.length === before + 1, JSON.stringify(counts()));

  await sleep(2100);
  console.log('unsubscribe', JSON.stringify(await A2.emitWithAck('push:unsubscribe', { endpoint: 'https://localhost:8443/push/phone' })));
  await C.emitWithAck('chat:send', { text: 'after unsub' }); await sleep(600);
  check('no push after unsubscribe', devices.phone.got.length === before + 1, JSON.stringify(counts()));
  console.log(result.join('\n'));
  process.exit(0);
})();

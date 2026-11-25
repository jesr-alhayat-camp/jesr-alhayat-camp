const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { authorizePassword, digits, matches, readSession, session, transition } = require('./recovery.cjs');

if (Buffer.byteLength(process.env.CAMP_RECOVERY_SECRET || '') < 32) {
  throw new Error('Set a stable CAMP_RECOVERY_SECRET of at least 32 random bytes.');
}

const project = 'aljalacamp-test';
const app = initializeApp({
  credential: applicationDefault(), projectId: project,
  databaseURL: 'https://' + project + '-default-rtdb.firebaseio.com'
});
const auth = getAuth(app);
const db = getDatabase(app);
const requests = db.ref('first_activation');
const endpoints = new Set(['/api/start', '/api/verify', '/api/status', '/api/password']);
const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/recovery.js': ['recovery.js', 'text/javascript; charset=utf-8'],
  '/recovery.css': ['recovery.css', 'text/css; charset=utf-8']
};

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if ((req.headers['content-type'] || '').split(';')[0] !== 'application/json') throw new Error('Unsupported body');
  let raw = '';
  for await (const part of req) {
    raw += part;
    if (Buffer.byteLength(raw) > 2048) throw new Error('Request too large');
  }
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid body');
  return data;
}

async function lookupFamily(id) {
  const snap = await db.ref('db_families').get();
  const rows = Object.values(snap.val() || {}).filter(row => digits(row?.[2]) === id);
  return rows.length === 1 ? rows[0] : null;
}

const emailOf = id => id + '@camp.local';

async function accountExists(id) {
  try {
    await auth.getUserByEmail(emailOf(id));
    return true;
  } catch (error) {
    if (error.code === 'auth/user-not-found') return false;
    throw error;
  }
}

async function createFamilyAccount(id, password) {
  const [row, portal] = await Promise.all([lookupFamily(id), db.ref('portal/' + id).get()]);
  if (!row || !portal.exists()) return 'contact';
  if (await accountExists(id)) return 'existing';

  const uid = 'family-activation-' + id;
  const claim = await db.ref('claims/' + uid).transaction(current => {
    if (!current) return {id};
    if (current.id === id) return current;
  });
  if (!claim.committed) return 'contact';

  try {
    await auth.createUser({uid, email:emailOf(id), password});
    return 'completed';
  } catch (error) {
    if (['auth/email-already-exists','auth/uid-already-exists'].includes(error.code)) return 'existing';
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const name = req.url?.split('?')[0];
  if (req.method === 'GET' && Object.hasOwn(staticFiles, name)) {
    const [file, contentType] = staticFiles[name];
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    });
    res.end(fs.readFileSync(path.join(__dirname, 'site', file)));
    return;
  }
  if (!endpoints.has(name)) return send(res, 404, {error:'not-found'});
  if (req.method !== 'POST') return send(res, 405, {error:'method'});

  let body;
  try { body = await readJson(req); } catch { return send(res, 400, {error:'request'}); }
  try {
    if (name === '/api/start') {
      const id = digits(body.id);
      if (!/^\d{9}$/.test(id)) return send(res, 400, {error:'identity'});
      return send(res, 200, {session:session(id)});
    }

    const identity = readSession(body.session);
    if (!identity) return send(res, 401, {error:'session'});
    const ref = requests.child(identity.key);

    if (name === '/api/verify') {
      const row = await lookupFamily(identity.id);
      let outcome = 'incorrect';
      if (row && matches(row, body)) {
        const portal = await db.ref('portal/' + identity.id).get();
        if (await accountExists(identity.id)) outcome = 'existing';
        else outcome = portal.exists() ? 'verified' : 'contact';
      }
      const result = await ref.transaction(current => transition(current, identity, outcome, Date.now()));
      const record = result.snapshot.val();
      if (record?.owner === identity.owner && record.until > Date.now()) {
        return send(res, 200, {state:record.state});
      }
      if (record?.state !== 'attempts' || record.failures >= 3) {
        return send(res, 200, {state:'locked'});
      }
      return send(res, 200, {state:'incorrect', remaining:3 - record.failures});
    }

    if (name === '/api/status') {
      const record = (await ref.get()).val();
      const current = record?.until > Date.now();
      const locked = current && record.state === 'attempts' && record.failures >= 3;
      const state = locked ? 'locked' : current && record.owner === identity.owner ? record.state : 'questions';
      return send(res, 200, {state});
    }

    const password = body.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 64
        || !/[A-Za-z\u0600-\u06ff]/.test(password) || !/\d/.test(password)) {
      return send(res, 400, {error:'password'});
    }
    const reservation = await ref.transaction(current => authorizePassword(current, identity, Date.now()));
    if (!reservation.committed) return send(res, 409, {error:'authorization'});
    const reservationExpiry = reservation.snapshot.val().until;

    const state = await createFamilyAccount(identity.id, password);
    await ref.transaction(current => {
      if (current?.state === 'processing' && current.owner === identity.owner && current.until === reservationExpiry) {
        return {state, owner:identity.owner, until:Date.now() + 2 * 60_000};
      }
    });
    return send(res, 200, {state});
  } catch (error) {
    console.error('Activation operation failed:', error.code || 'internal');
    return send(res, 503, {error:'service'});
  }
});

server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1',
  () => console.log('First activation service ready for aljalacamp-test'));

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

const { issueFamilyResetLink, linkedFamily, requireRecentAdmin } = require('./family-reset.cjs');
const { createPasswordStore } = require('./password-store.cjs');
const { changeManagedPassword } = require('./managed-password.cjs');
const project = process.env.CAMP_FIREBASE_PROJECT || 'aljalacamp-test';
if (!['aljalacamp-test', 'alhayacamp-a31eb'].includes(project)) {
  throw new Error('Unsupported CAMP_FIREBASE_PROJECT.');
}
const passwordStore = project === 'alhayacamp-a31eb'
  ? createPasswordStore(process.env.CAMP_PASSWORD_ENCRYPTION_KEY) : null;
const adminOrigin = 'https://' + project + '.web.app';
const adminPaths = new Set(['/api/admin/reset-link', '/api/admin/reveal']);
const changePath = '/api/change-password';
const resetPath = '/api/complete-reset';
const apiKey = process.env.CAMP_FIREBASE_WEB_API_KEY;
if (passwordStore && (!apiKey || !/^https:\/\/[^/]+\/?$/.test(process.env.CAMP_PUBLIC_SERVICE_URL || ''))) {
  throw new Error('Set CAMP_FIREBASE_WEB_API_KEY and the HTTPS CAMP_PUBLIC_SERVICE_URL.');
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 64
    && /[A-Za-z\u0600-\u06ff]/.test(password) && /\d/.test(password);
}

async function firebaseReset(oobCode, newPassword) {
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=' + encodeURIComponent(apiKey), {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({oobCode, newPassword}),
    signal: AbortSignal.timeout(10000)
  });
  if (response.status === 400) throw Object.assign(new Error('Invalid reset code.'), {code:'reset-code'});
  if (!response.ok) throw new Error('Firebase reset request failed.');
  return response.json();
}
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
    const createAccount = () => auth.createUser({uid, email:emailOf(id), password});
    if (passwordStore) {
      await changeManagedPassword(db.ref('managed_family_passwords/' + uid), passwordStore, uid, password, createAccount);
    } else {
      await createAccount();
    }
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
    const content = fs.readFileSync(path.join(__dirname, 'site', file), 'utf8');
    res.end(name === '/' && passwordStore
      ? content.replace('مخيم الأصدقاء الجلاء', 'مخيم جسر الحياة').replace('https://aljalacamp-test.web.app/', adminOrigin + '/')
      : content);
    return;
  }
  if (name === '/healthz' && req.method === 'GET') {
    return send(res, 200, {status:'ok'});
  }
  if (adminPaths.has(name) || name === changePath) {
    if (req.headers.origin !== adminOrigin) return send(res, 403, {error:'origin'});
    res.setHeader('Access-Control-Allow-Origin', adminOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
  }
  if (!endpoints.has(name) && !adminPaths.has(name) && name !== changePath && name !== resetPath) return send(res, 404, {error:'not-found'});
  if (req.method !== 'POST') return send(res, 405, {error:'method'});

  let body;
  try { body = await readJson(req); } catch { return send(res, 400, {error:'request'}); }
  try {
    if (adminPaths.has(name) || name === changePath || name === resetPath) {
      const token = (req.headers.authorization || '').match(/^Bearer (\S+)$/)?.[1];
      try {
        if (name === '/api/admin/reset-link') {
          const firebaseLink = await issueFamilyResetLink(auth, db, token, body.id);
          if (!passwordStore) return send(res, 200, {link:firebaseLink});
          const code = new URL(firebaseLink).searchParams.get('oobCode');
          if (!code) throw new Error('Missing reset code.');
          const link = new URL('/?reset=' + encodeURIComponent(code), process.env.CAMP_PUBLIC_SERVICE_URL);
          return send(res, 200, {link:link.href});
        }
        if (!passwordStore) return send(res, 404, {error:'not-found'});
        if (name === '/api/admin/reveal') {
          const administrator = await requireRecentAdmin(auth, db, token);
          const user = await linkedFamily(auth, db, body.id);
          const record = (await db.ref('managed_family_passwords/' + user.uid).get()).val();
          if (record?.state !== 'ready') return send(res, 404, {error:'unavailable'});
          const password = passwordStore.decrypt(user.uid, record.encrypted);
          await db.ref('family_account_audit').push({
            action:'family-password-revealed', adminUid:administrator.uid, familyUid:user.uid, at:Date.now()
          });
          return send(res, 200, {password});
        }
        if (!validPassword(body.password)) return send(res, 400, {error:'password'});
        if (name === resetPath) {
          if (typeof body.code !== 'string' || !/^[\w-]{10,512}$/.test(body.code)) {
            return send(res, 400, {error:'reset-code'});
          }
          const result = await firebaseReset(body.code);
          const id = /^([0-9]{9})@camp\.local$/.exec(result.email)?.[1];
          const user = await linkedFamily(auth, db, id);
          const ref = db.ref('managed_family_passwords/' + user.uid);
          await changeManagedPassword(ref, passwordStore, user.uid, body.password, () => firebaseReset(body.code, body.password));
          return send(res, 200, {state:'completed'});
        }
        let account;
        try { account = await auth.verifyIdToken(token, true); }
        catch { return send(res, 401, {error:'reauthenticate'}); }
        const now = Math.floor(Date.now() / 1000);
        if (!Number.isFinite(account.auth_time) || account.auth_time > now + 30 || now - account.auth_time > 300) {
          return send(res, 401, {error:'reauthenticate'});
        }
        const id = /^([0-9]{9})@camp\.local$/.exec(account.email)?.[1];
        const user = await linkedFamily(auth, db, id);
        if (user.uid !== account.uid) return send(res, 403, {error:'account'});
        const ref = db.ref('managed_family_passwords/' + user.uid);
        await changeManagedPassword(ref, passwordStore, user.uid, body.password, () => auth.updateUser(user.uid, {password:body.password}));
        return send(res, 200, {state:'completed'});
      } catch (error) {
        const status = {identity:400, 'reset-code':400, reauthenticate:401, role:403, account:404, busy:409}[error.code];
        if (status) return send(res, status, {error:error.code});
        throw error;
      }
    }
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
  () => console.log('First activation service ready for ' + project));

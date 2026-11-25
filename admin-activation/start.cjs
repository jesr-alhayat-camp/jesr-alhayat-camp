const http = require('node:http');
const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { issueCode } = require('./issue-code.cjs');

const address = '127.0.0.1';
const port = 8765;
const origin = 'https://aljalacamp-test.web.app';
const inProgress = new Set();
const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'aljalacamp-test',
  databaseURL: 'https://aljalacamp-test-default-rtdb.firebaseio.com'
});
const auth = getAuth(app);
const db = getDatabase(app);

function reply(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.host !== address + ':' + port || req.headers.origin !== origin) {
    reply(res, 403, { error: 'origin' });
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Vary', 'Origin');
  const url = new URL(req.url, 'http://' + address + ':' + port);
  if (url.pathname !== '/issue') {
    reply(res, 404, { error: 'not-found' });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const id = url.searchParams.get('family');
  if (req.method !== 'POST' || !/^\d{9}$/.test(id || '')) {
    reply(res, 400, { error: 'family' });
    return;
  }

  const token = (req.headers.authorization || '').match(/^Bearer (\S+)$/)?.[1];
  if (!token) {
    reply(res, 401, { error: 'auth' });
    return;
  }

  let admin;
  try {
    admin = await auth.verifyIdToken(token, true);
  } catch {
    reply(res, 401, { error: 'auth' });
    return;
  }

  try {
    const role = await db.ref('admins/' + admin.uid).get();
    if (role.val() !== 'super_admin') {
      reply(res, 403, { error: 'role' });
      return;
    }
    if (inProgress.has(id)) {
      reply(res, 409, { error: 'busy' });
      return;
    }

    inProgress.add(id);
    try {
      reply(res, 200, { code: await issueCode(id, auth, db) });
    } finally {
      inProgress.delete(id);
    }
  } catch (error) {
    const reason = ['missing-family', 'duplicate-family', 'existing-account', 'conflicting-link'].includes(error.code)
      ? error.code
      : 'service';
    reply(res, 409, { error: reason });
  }
});
server.listen(port, address, () => console.log('Activation service ready at http://' + address + ':' + port));

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Module = require('node:module');

test('family activation, reveal, reset and password change keep the same linked account', async () => {
  const id = '123456789';
  const email = id + '@camp.local';
  const uid = 'family-activation-' + id;
  const row = [];
  row[2] = id;
  row[5] = '0591234567';
  row[8] = 'اسم تجريبي';
  row[9] = '987654321';
  row[11] = 'اسم تجريبي ثاني';
  row[12] = '999888777';
  row[26] = '4';
  const records = new Map([['db_families', [row]], ['portal/' + id, {id}], ['admins/admin', 'super_admin']]);
  const users = new Map();
  const audits = [];
  const resetCode = 'synthetic-reset-token';
  let resetUsed = false;
  const snapshot = value => ({val: () => value ?? null, exists: () => value != null});
  const db = {
    ref(path) {
      return {
        child: key => db.ref(path + '/' + key),
        get: async () => snapshot(records.get(path)),
        transaction: async update => {
          const value = update(records.get(path) ?? null);
          if (value === undefined) return {committed:false, snapshot:snapshot(records.get(path))};
          records.set(path, value);
          return {committed:true, snapshot:snapshot(value)};
        },
        push: async entry => { audits.push(entry); }
      };
    }
  };
  const auth = {
    async getUserByEmail(address) {
      if (users.has(address)) return users.get(address);
      throw Object.assign(new Error('Missing test user'), {code:'auth/user-not-found'});
    },
    async createUser(user) { users.set(user.email, user); return user; },
    async verifyIdToken(token, checkRevoked) {
      assert.equal(checkRevoked, true);
      if (!['admin-token', 'family-token'].includes(token)) throw new Error('Invalid test token');
      return {uid:token === 'admin-token' ? 'admin' : uid, email, auth_time:Math.floor(Date.now() / 1000)};
    },
    async generatePasswordResetLink() { return 'https://example.invalid/?oobCode=' + resetCode; },
    async updateUser(target, updates) {
      assert.equal(target, uid);
      Object.assign(users.get(email), updates);
    }
  };

  const originalLoad = Module._load;
  const originalListen = http.Server.prototype.listen;
  const request = global.fetch;
  let server;
  Module._load = function (name, ...args) {
    if (name === 'firebase-admin/app') return {applicationDefault:() => ({}), initializeApp:() => ({})};
    if (name === 'firebase-admin/auth') return {getAuth:() => auth};
    if (name === 'firebase-admin/database') return {getDatabase:() => db};
    return originalLoad.call(this, name, ...args);
  };
  http.Server.prototype.listen = function () {
    server = this;
    return originalListen.call(this, 0, '127.0.0.1');
  };
  global.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'identitytoolkit.googleapis.com');
    const payload = JSON.parse(options.body);
    if (payload.oobCode !== resetCode || resetUsed) return new Response('{}', {status:400});
    if (payload.newPassword) {
      resetUsed = true;
      await auth.updateUser(uid, {password:payload.newPassword});
    }
    return Response.json({email});
  };

  Object.assign(process.env, {
    CAMP_FIREBASE_PROJECT:'alhayacamp-a31eb',
    CAMP_RECOVERY_SECRET:'synthetic-activation-secret-for-tests',
    CAMP_PASSWORD_ENCRYPTION_KEY:'ab'.repeat(32),
    CAMP_FIREBASE_WEB_API_KEY:'synthetic-api-key',
    CAMP_PUBLIC_SERVICE_URL:'https://synthetic-service.example'
  });

  try {
    require('./start.cjs');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const origin = 'https://alhayacamp.web.app';
    const post = async (route, body, token, site = origin) => {
      const headers = {'Content-Type':'application/json', Origin:site};
      if (token) headers.Authorization = 'Bearer ' + token;
      const response = await request(base + '/api/' + route, {method:'POST', headers, body:JSON.stringify(body)});
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return {status:response.status, body:await response.json()};
    };
    assert.equal((await request(base + '/healthz')).status, 200);
    const lockId = '111222333';
    for (let remaining = 2; remaining >= 1; remaining--) {
      assert.deepEqual((await post('start', {id:lockId, phone:'1234567'})).body, {state:'incorrect', remaining});
    }
    assert.equal((await post('start', {id:lockId, phone:'1234567'})).body.state, 'locked');
    assert.equal((await post('start', {id:lockId, phone:'7654321'})).body.state, 'locked');
    assert.deepEqual((await post('start', {id, phone:'7654321'})).body, {state:'incorrect', remaining:2});
    const {session} = (await post('start', {id, phone:'1234567'})).body;
    assert.ok(session);
    assert.deepEqual((await post('verify', {session, spouse:'000000000', members:'4'})).body, {state:'incorrect', remaining:1});
    const answers = {session, spouse:'987654321', members:'4'};
    assert.equal((await post('verify', answers)).body.state, 'verified');
    const secondSession = (await post('start', {id, phone:'1234567'})).body.session;
    assert.equal((await post('verify', {...answers, session:secondSession, spouse:'999888777'})).body.state, 'busy');
    assert.equal((await post('password', {session:secondSession, password:'Unauthorized synthetic 1'})).status, 409);
    assert.equal((await post('password', {session, password:'First synthetic 1'})).body.state, 'completed');
    assert.equal((await post('admin/reveal', {id}, 'family-token')).status, 403);
    assert.equal((await post('admin/reveal', {id}, 'admin-token', 'https://other.example')).status, 403);
    assert.equal((await post('admin/reveal', {id}, 'admin-token')).body.password, 'First synthetic 1');
    const retrySession = (await post('start', {id, phone:'1234567'})).body.session;
    assert.equal((await post('verify', {...answers, session:retrySession})).body.state, 'existing');
    for (const record of records.values()) {
      if (record?.state === 'completed') record.until = 0;
    }
    assert.equal((await post('verify', {...answers, session:retrySession})).body.state, 'existing');
    assert.equal((await post('password', {session:retrySession, password:'Forbidden synthetic 9'})).status, 409);
    const reset = await post('admin/reset-link', {id}, 'admin-token');
    assert.equal(new URL(reset.body.link).searchParams.get('reset'), resetCode);
    assert.equal((await post('complete-reset', {code:resetCode, password:'Reset synthetic 2'})).body.state, 'completed');
    assert.equal((await post('complete-reset', {code:resetCode, password:'Repeat synthetic 3'})).status, 400);
    assert.equal((await post('admin/reveal', {id}, 'admin-token')).body.password, 'Reset synthetic 2');
    assert.equal((await post('change-password', {password:'Changed synthetic 4'}, 'family-token')).body.state, 'completed');
    assert.equal((await post('admin/reveal', {id}, 'admin-token')).body.password, 'Changed synthetic 4');
    assert.equal(users.get(email).uid, uid);
    assert.deepEqual(records.get('claims/' + uid), {id});
    assert.ok(audits.every(entry => !JSON.stringify(entry).includes('synthetic 4')));
  } finally {
    Module._load = originalLoad;
    http.Server.prototype.listen = originalListen;
    global.fetch = request;
    if (server) await new Promise(resolve => server.close(resolve));
  }
});

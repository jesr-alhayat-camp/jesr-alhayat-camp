const test = require('node:test');
const assert = require('node:assert/strict');
const { issueFamilyResetLink } = require('./family-reset.cjs');

function setup({ role = 'super_admin', link = '123456789', age = 0 } = {}) {
  const calls = [];
  const auth = {
    verifyIdToken: async (token, checkRevoked) => {
      assert.equal(token, 'synthetic-token');
      assert.equal(checkRevoked, true);
      return { uid: 'admin', auth_time: 1000 - age };
    },
    getUserByEmail: async email => ({ uid: 'existing-uid', email }),
    generatePasswordResetLink: async email => {
      calls.push(email);
      return 'https://example.invalid/reset';
    }
  };
  const db = {
    ref: path => ({
      get: async () => ({ val: () => path === 'admins/admin' ? role : { id: link } }),
      push: async value => { calls.push(value.action); }
    })
  };
  return { auth, db, calls };
}

test('issues a reset for the existing, correctly linked account and audits it', async () => {
  const { auth, db, calls } = setup();
  const link = await issueFamilyResetLink(auth, db, 'synthetic-token', '123456789', 1000);
  assert.equal(link, 'https://example.invalid/reset');
  assert.deepEqual(calls, ['123456789@camp.local', 'family-password-reset-issued']);
});

test('rejects stale authentication, other roles and mismatched accounts', async () => {
  for (const [options, code] of [[{ age: 301 }, 'reauthenticate'], [{ role: 'limited_admin' }, 'role'], [{ link: '987654321' }, 'account']]) {
    const { auth, db, calls } = setup(options);
    await assert.rejects(issueFamilyResetLink(auth, db, 'synthetic-token', '123456789', 1000), { code });
    assert.deepEqual(calls, []);
  }
});

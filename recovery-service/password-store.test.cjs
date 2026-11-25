const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createPasswordStore } = require('./password-store.cjs');

test('password records round-trip and bind to the Firebase account', () => {
  const store = createPasswordStore(randomBytes(32).toString('hex'));
  const password = 'Synthetic password 2026';
  const record = store.encrypt('synthetic-family-a', password);
  assert.ok(!JSON.stringify(record).includes(password));
  assert.equal(store.decrypt('synthetic-family-a', record), password);
  assert.throws(() => store.decrypt('synthetic-family-b', record));
});

test('rejects a weak key and modified password records', () => {
  assert.throws(() => createPasswordStore('short'));
  const store = createPasswordStore(randomBytes(32).toString('hex'));
  const record = store.encrypt('synthetic-family-a', 'Synthetic password 2026');
  const bytes = Buffer.from(record.ciphertext, 'base64url');
  bytes[0] ^= 1;
  assert.throws(() => store.decrypt('synthetic-family-a', {
    ...record, ciphertext: bytes.toString('base64url')
  }));
});

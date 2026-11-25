const test = require('node:test');
const assert = require('node:assert/strict');
const { changeManagedPassword } = require('./managed-password.cjs');

function setup() {
  let record = {state:'ready', encrypted:{ciphertext:'synthetic-old'}};
  const ref = {
    transaction: async update => {
      const next = update(record);
      if (next === undefined) return {committed:false};
      record = next;
      return {committed:true, snapshot:{val:() => next}};
    }
  };
  const store = {encrypt: (uid, password) => ({ciphertext: uid + ':' + password.length})};
  return {ref, store, record: () => record};
}

test('publishes the new encrypted record only after the account changes', async () => {
  const ctx = setup();
  await changeManagedPassword(ctx.ref, ctx.store, 'uid', 'synthetic-password', async () => {
    assert.equal(ctx.record().state, 'pending');
    assert.equal(ctx.record().encrypted, undefined);
  });
  assert.deepEqual(ctx.record(), {state:'ready', encrypted:{ciphertext:'uid:18'}});
});

test('a failed update hides the uncertain password and permits a later recovery', async () => {
  const ctx = setup();
  await assert.rejects(changeManagedPassword(ctx.ref, ctx.store, 'uid', 'synthetic-password', async () => {
    throw new Error('synthetic failure');
  }));
  assert.deepEqual(ctx.record(), {state:'unavailable'});
  await changeManagedPassword(ctx.ref, ctx.store, 'uid', 'synthetic-password', async () => {});
  assert.equal(ctx.record().state, 'ready');
});

test('only one concurrent update can run per account', async () => {
  const ctx = setup();
  await changeManagedPassword(ctx.ref, ctx.store, 'uid', 'synthetic-password', async () => {
    await assert.rejects(changeManagedPassword(ctx.ref, ctx.store, 'uid', 'other-password', async () => {
      assert.fail('concurrent change must not run');
    }), {code:'busy'});
  });
});

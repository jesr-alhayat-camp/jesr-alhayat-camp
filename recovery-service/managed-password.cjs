const { randomUUID } = require('node:crypto');
const { updateExisting } = require('./update-existing.cjs');

async function changeManagedPassword(ref, store, uid, password, updateAccount) {
  const encrypted = store.encrypt(uid, password);
  const owner = randomUUID();
  const reservation = await ref.transaction(current => {
    if (current?.state === 'pending') return;
    return {state:'pending', owner};
  });
  if (!reservation.committed) {
    throw Object.assign(new Error('Password update already pending.'), {code:'busy'});
  }

  let result;
  try {
    result = await updateAccount();
  } catch (error) {
    await updateExisting(ref, current => {
      if (current?.state === 'pending' && current.owner === owner) return {state:'unavailable'};
    });
    throw error;
  }

  const confirmed = await updateExisting(ref, current => {
    if (current?.state === 'pending' && current.owner === owner) return {state:'ready', encrypted};
  });
  if (!confirmed) {
    throw Object.assign(new Error('Password storage state changed during the update.'), {code:'storage-conflict'});
  }
  return result;
}

module.exports = { changeManagedPassword };

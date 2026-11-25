const { randomBytes } = require('node:crypto');

async function getOrCreateFamilyAccount(auth, uid, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }

  try {
    return await auth.createUser({ uid, email, password: randomBytes(32).toString('hex') });
  } catch (error) {
    if (error.code !== 'auth/email-already-exists' && error.code !== 'auth/uid-already-exists') throw error;
    return auth.getUserByEmail(email);
  }
}

function issuanceError(code) {
  return Object.assign(new Error(code), { code });
}

async function issueCode(id, auth, db) {
  if (!/^\d{9}$/.test(id || '')) throw issuanceError('invalid-family');

  const uid = 'family-activation-' + id;
  const email = id + '@camp.local';
  const [families, portal] = await Promise.all([
    db.ref('db_families').get(),
    db.ref('portal/' + id).get()
  ]);
  const matchingRows = Object.values(families.val() || {}).filter(row => {
    const recordedId = String(row?.[2] ?? '')
      .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
      .replace(/\D/g, '');
    return recordedId === id;
  });
  if (matchingRows.length > 1) throw issuanceError('duplicate-family');
  if (!matchingRows.length || !portal.exists()) throw issuanceError('missing-family');

  const user = await getOrCreateFamilyAccount(auth, uid, email);
  if (user.uid !== uid || user.disabled || user.metadata.lastSignInTime) {
    throw issuanceError('existing-account');
  }

  const result = await db.ref('claims/' + user.uid).transaction(current => {
    if (current === null) return { id };
    return current.id === id ? current : undefined;
  });
  if (!result.committed) throw issuanceError('conflicting-link');

  const link = new URL(await auth.generatePasswordResetLink(email));
  const code = link.searchParams.get('oobCode');
  if (link.searchParams.get('mode') !== 'resetPassword' || !code) throw issuanceError('missing-code');
  return code;
}

module.exports = { issueCode };

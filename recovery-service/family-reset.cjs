function resetError(code) {
  return Object.assign(new Error(code), { code });
}

async function requireRecentAdmin(auth, db, token, now = Math.floor(Date.now() / 1000)) {
  if (!token) throw resetError('reauthenticate');

  let admin;
  try {
    admin = await auth.verifyIdToken(token, true);
  } catch {
    throw resetError('reauthenticate');
  }
  if (!Number.isFinite(admin.auth_time) || admin.auth_time > now + 30 || now - admin.auth_time > 300) {
    throw resetError('reauthenticate');
  }

  const role = await db.ref('admins/' + admin.uid).get();
  if (role.val() !== 'super_admin') throw resetError('role');

  return admin;
}

async function linkedFamily(auth, db, id) {
  if (typeof id !== 'string' || !/^\d{9}$/.test(id)) throw resetError('identity');
  const email = id + '@camp.local';
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === 'auth/user-not-found') throw resetError('account');
    throw error;
  }
  const claim = await db.ref('claims/' + user.uid).get();
  if (user.disabled || claim.val()?.id !== id) throw resetError('account');

  return user;
}

async function issueFamilyResetLink(auth, db, token, id, now = Math.floor(Date.now() / 1000)) {
  const admin = await requireRecentAdmin(auth, db, token, now);
  const user = await linkedFamily(auth, db, id);
  const link = await auth.generatePasswordResetLink(user.email);
  await db.ref('family_account_audit').push({
    action: 'family-password-reset-issued',
    adminUid: admin.uid,
    familyUid: user.uid,
    at: now * 1000
  });
  return link;
}

module.exports = { issueFamilyResetLink, linkedFamily, requireRecentAdmin };

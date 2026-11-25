const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

const windowMs = 30 * 60_000;
const setupMs = 10 * 60_000;
const processingMs = 2 * 60_000;
const secret = process.env.CAMP_RECOVERY_SECRET;

function digits(value) {
  return String(value ?? '')
    .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[\u06f0-\u06f9]/g, c => String(c.charCodeAt(0) - 0x6f0))
    .replace(/\D/g, '');
}

function sign(value) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function session(id, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    id, expires: now + windowMs + setupMs, nonce: randomBytes(24).toString('base64url')
  })).toString('base64url');
  return payload + '.' + sign(payload);
}

function readSession(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 350) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url'));
    if (!/^\d{9}$/.test(value.id) || value.expires <= now) return null;
    return { id: value.id, key: sign(value.id), owner: sign(token) };
  } catch {
    return null;
  }
}

function matches(row, answers) {
  const spouses = [digits(row?.[8]), digits(row?.[11])].filter(id => /^\d{9}$/.test(id));
  const phone = digits(row?.[5]);
  const members = Number(digits(row?.[26]));
  return spouses.includes(digits(answers.spouse)) && members > 0
    && /^\d{1,3}$/.test(digits(answers.members)) && Number(digits(answers.members)) === members
    && phone.length >= 7 && /^\d{7}$/.test(digits(answers.phone))
    && phone.slice(-7) === digits(answers.phone);
}

function transition(current, identity, outcome, now) {
  if (current?.until > now && current.state !== 'attempts') return;
  const attempts = current?.until > now ? current.failures : 0;
  if (attempts >= 3) return;
  if (outcome !== 'incorrect') return {state:outcome, owner:identity.owner, until:now + setupMs};
  return {
    state:'attempts', failures:attempts + 1,
    until:attempts ? current.until : now + windowMs
  };
}

function authorizePassword(current, identity, now) {
  if (current?.owner !== identity.owner || current.state !== 'verified' || current.until <= now) return;
  return {...current, state:'processing', until:now + processingMs};
}

module.exports = {authorizePassword, digits, matches, readSession, session, transition};

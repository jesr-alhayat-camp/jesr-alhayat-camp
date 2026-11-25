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

const phoneTag = (id, suffix) => sign('phone:' + id + ':' + suffix);
const phoneSuffix = row => digits(row?.[5]).slice(-7);

function session(id, suffix, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    id, phoneTag:phoneTag(id, suffix), expires: now + windowMs + setupMs, nonce: randomBytes(24).toString('base64url')
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
    if (!/^\d{9}$/.test(value.id) || !/^[-_A-Za-z0-9]{43}$/.test(value.phoneTag || '') || value.expires <= now) return null;
    return { id: value.id, phoneTag:value.phoneTag, key: sign(value.id), owner: sign(token) };
  } catch {
    return null;
  }
}

function matches(row, answers, identity) {
  const spouses = [digits(row?.[9]), digits(row?.[12])].filter(id => /^\d{9}$/.test(id));
  const suffix = phoneSuffix(row);
  const members = Number(digits(row?.[26]));
  return spouses.includes(digits(answers.spouse)) && members > 0
    && /^\d{1,3}$/.test(digits(answers.members)) && Number(digits(answers.members)) === members
    && /^\d{7}$/.test(suffix) && identity.phoneTag === phoneTag(identity.id, suffix);
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

module.exports = {authorizePassword, digits, matches, phoneSuffix, readSession, session, transition};

const { createCipheriv, createDecipheriv, randomBytes, scryptSync } = require('node:crypto');

function createPasswordStore(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('Set CAMP_PASSWORD_ENCRYPTION_KEY to a random secret of at least 32 bytes.');
  }

  const key = /^[a-f0-9]{64}$/i.test(secret) ? Buffer.from(secret, 'hex')
    : scryptSync(secret, 'jesr-family-password-key-v1', 32);
  const associatedData = uid => Buffer.from('camp-family-password:v1:' + uid);

  return {
    encrypt(uid, password) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(associatedData(uid));
      const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
      return {
        version: 1,
        iv: iv.toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
        tag: cipher.getAuthTag().toString('base64url')
      };
    },

    decrypt(uid, record) {
      if (record.version !== 1) throw new Error('Unsupported password record version.');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64url'));
      decipher.setAAD(associatedData(uid));
      decipher.setAuthTag(Buffer.from(record.tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(record.ciphertext, 'base64url')),
        decipher.final()
      ]).toString('utf8');
    }
  };
}

module.exports = { createPasswordStore };

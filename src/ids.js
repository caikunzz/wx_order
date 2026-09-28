import crypto from 'crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function id() {
  return crypto.randomBytes(8).toString('hex')
}

export function token() {
  return crypto.randomBytes(24).toString('hex')
}

export function inviteCode() {
  const bytes = crypto.randomBytes(6)
  let code = ''
  for (let i = 0; i < bytes.length; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return code
}

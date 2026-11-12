import { randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// Password hashing with scrypt (Node's built-in, memory-hard). No app imports,
// so scripts/staff.ts can use it directly. Stored as
// scrypt$N$r$p$<salt base64>$<hash base64>, so the cost can be raised later
// without breaking existing hashes.

const COST = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEY_LENGTH = 32

const derive = (password: string, salt: Buffer, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, opts, (err, key) => (err ? reject(err) : resolve(key))))

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, COST)
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, n, r, p, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const key = await derive(password, Buffer.from(salt, 'base64'), {
    N: Number(n), r: Number(r), p: Number(p), maxmem: COST.maxmem,
  })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/** A readable random password for a new account, e.g. "mint-ruby-4823-ocean". */
export function generatePassword() {
  const words = ['amber', 'bolt', 'cedar', 'delta', 'ember', 'fjord', 'gale', 'harbor', 'iris', 'jade', 'kelp', 'lumen',
    'maple', 'nova', 'ocean', 'pine', 'quartz', 'ridge', 'sage', 'tide', 'umber', 'vale', 'willow', 'zephyr']
  const pick = () => words[randomInt(words.length)]
  const digits = String(randomInt(10_000)).padStart(4, '0')
  return `${pick()}-${pick()}-${digits}-${pick()}-${pick()}`
}

/** Shortest password staff may set. */
export const MIN_PASSWORD_LENGTH = 12

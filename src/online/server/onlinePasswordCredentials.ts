import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const PASSWORD_HASH_PREFIX = "scrypt:v1";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const PASSWORD_CREDENTIAL_HASH_PATTERN =
  /^scrypt:v1:16384:8:1:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/;

function deriveScryptKey(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: 64 * 1024 * 1024,
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key);
      }
    );
  });
}

export function isOnlineAccountPasswordCredentialHash(credential: string): boolean {
  return PASSWORD_CREDENTIAL_HASH_PATTERN.test(credential);
}

export async function hashOnlineAccountPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await deriveScryptKey(password, salt, KEY_BYTES);
  return [
    PASSWORD_HASH_PREFIX,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join(":");
}

export async function verifyOnlineAccountPassword(
  password: string,
  credential: string
): Promise<boolean> {
  if (!isOnlineAccountPasswordCredentialHash(credential)) return false;
  const [, , nText, rText, pText, saltText, hashText] = credential.split(":");
  const expected = Buffer.from(hashText, "base64url");
  if (Number(nText) !== SCRYPT_N || Number(rText) !== SCRYPT_R || Number(pText) !== SCRYPT_P) {
    return false;
  }
  const actual = await deriveScryptKey(password, Buffer.from(saltText, "base64url"), expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

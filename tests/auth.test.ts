import { describe, expect, it } from 'vitest';
import { checkCredentials, signSession, verifySession } from '@/lib/auth';

describe('auth', () => {
  it('accepts the default admin credentials and rejects wrong ones', () => {
    expect(checkCredentials('admin', 'admin123')).toBe(true);
    expect(checkCredentials('admin', 'wrong')).toBe(false);
    expect(checkCredentials('root', 'admin123')).toBe(false);
    expect(checkCredentials('', '')).toBe(false);
  });

  it('signs a session and verifies it back to the username', async () => {
    const cookie = await signSession('admin');
    expect(cookie).toContain('.');
    expect(await verifySession(cookie)).toBe('admin');
  });

  it('rejects a tampered or forged cookie', async () => {
    const cookie = await signSession('admin');
    const [payload] = cookie.split('.');
    expect(await verifySession(`${payload}.deadbeef`)).toBeNull();     // bad signature
    expect(await verifySession('garbage')).toBeNull();                 // no dot
    expect(await verifySession(undefined)).toBeNull();
    // payload swapped to another user keeps the old signature → must fail
    const other = Buffer.from('hacker').toString('base64url');
    expect(await verifySession(`${other}.${cookie.split('.')[1]}`)).toBeNull();
  });
});

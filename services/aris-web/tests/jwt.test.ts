import { describe, expect, it } from 'vitest';
import { signSessionJwt, verifySessionJwt } from '@/lib/auth/jwt';

describe('jwt session signing', () => {
  it('signs and verifies payload', async () => {
    const token = await signSessionJwt({
      sub: 'user_1',
      email: 'admin@example.com',
      role: 'operator',
      jti: 'jti-1',
    });

    const payload = await verifySessionJwt(token);

    expect(payload.sub).toBe('user_1');
    expect(payload.email).toBe('admin@example.com');
    expect(payload.role).toBe('operator');
    expect(payload.jti).toBe('jti-1');
  });
});

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { ensureTenantTables } from '@/lib/tenant';
import { verifyPassword } from '@/lib/password';

export interface AuthUser {
  id: string;
  phone: string;
  role: string;
}

// Authenticate against clockin.admin_users.
// Returns null on any failure (unknown phone, wrong password, etc.).
export async function authenticate(phone: string, password: string): Promise<AuthUser | null> {
  if (!/^\d{11}$/.test(phone) || !/^\d{6}$/.test(password)) return null;

  try {
    await ensureTenantTables();
    const result = await db.execute(sql`
      SELECT id, phone, role, password_hash
      FROM   clockin.admin_users
      WHERE  phone = ${phone}
      LIMIT  1
    `) as unknown as {
      rows?: Array<{ id: number; phone: string; role: string; password_hash: string }>;
    };

    const user = result.rows?.[0];
    if (!user) return null;

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return null;

    await db.execute(sql`
      UPDATE clockin.admin_users
      SET    last_login_at = NOW()
      WHERE  id = ${user.id}
    `);

    return {
      id:    String(user.id),
      phone: user.phone,
      role:  user.role,
    };
  } catch (e) {
    console.error('[auth] authenticate failed', e);
    return null;
  }
}

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { ensureTenantTables } from '@/lib/tenant';
import { verifyPassword } from '@/lib/password';
import { getVirtualAdminUser, getVirtualInviteAdminUser, isVirtualDbEnabled, markVirtualAdminLogin } from '@/lib/virtualDb';

export interface AuthUser {
  id: string;
  phone: string;
  role: string;
}

// Authenticate against clockin.admin_users.
// Returns null on any failure (unknown phone, wrong password, etc.).
export async function authenticate(phone: string, password: string): Promise<AuthUser | null> {
  if (!phone.trim() || !password.trim()) return null;

  try {
    if (isVirtualDbEnabled()) {
      const user = getVirtualAdminUser(phone);
      if (!user) return null;
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return null;
      markVirtualAdminLogin(user.id);
      return { id: String(user.id), phone: user.phone, role: user.role };
    }

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

export async function getInviteLoginUser(phone?: string): Promise<AuthUser | null> {
  try {
    if (isVirtualDbEnabled()) {
      const user = getVirtualInviteAdminUser(phone);
      if (!user) return null;
      markVirtualAdminLogin(user.id);
      return { id: String(user.id), phone: user.phone, role: user.role };
    }

    await ensureTenantTables();
    const result = phone?.trim()
      ? await db.execute(sql`
          SELECT id, phone, role
          FROM   clockin.admin_users
          WHERE  phone = ${phone.trim()}
          LIMIT  1
        `)
      : await db.execute(sql`
          SELECT id, phone, role
          FROM   clockin.admin_users
          ORDER BY id
          LIMIT  1
        `) as unknown as {
      rows?: Array<{ id: number; phone: string; role: string }>;
    };

    const user = (result as unknown as { rows?: Array<{ id: number; phone: string; role: string }> }).rows?.[0];
    if (!user) return null;

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
    console.error('[auth] getInviteLoginUser failed', e);
    return null;
  }
}

'use server';

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { ensureTenantTables, upsertTenantConfig, markSetupCompleted, isSetupCompleted } from '@/lib/tenant';
import { hashPassword } from '@/lib/password';
import { getSession } from '@/lib/session';
import { recordAuditLog } from '@/lib/audit';

type SetupInput = {
  factoryShortName: string;
  phone: string;
  password: string;
};

type SetupResult =
  | { ok: true }
  | { ok: false; error: string };

const PHONE_RE = /^\d{11}$/;
const PWD_RE = /^\d{6}$/;

export async function completeSetup(input: SetupInput): Promise<SetupResult> {
  if (await isSetupCompleted()) return { ok: false, error: '系统已经初始化过，不能重复执行向导。' };

  const factoryShortName = (input.factoryShortName ?? '').trim();
  const phone = (input.phone ?? '').trim();
  const password = (input.password ?? '').trim();

  if (factoryShortName.length < 1 || factoryShortName.length > 10) {
    return { ok: false, error: '工厂简称需为 1-10 字。' };
  }
  if (!PHONE_RE.test(phone))  return { ok: false, error: '手机号必须是 11 位数字。' };
  if (!PWD_RE.test(password)) return { ok: false, error: '密码必须是 6 位数字。' };

  try {
    await ensureTenantTables();

    // 1) Create admin
    const passwordHash = await hashPassword(password);
    const insertResult = await db.execute(sql`
      INSERT INTO clockin.admin_users (phone, password_hash, role)
      VALUES (${phone}, ${passwordHash}, 'admin')
      ON CONFLICT (phone) DO NOTHING
      RETURNING id, phone, role
    `) as unknown as { rows?: Array<{ id: number; phone: string; role: string }> };

    const admin = insertResult.rows?.[0];
    if (!admin) {
      return { ok: false, error: '该手机号已注册管理员，无法重复创建。' };
    }

    // 2) Write tenant config + mark setup complete
    await upsertTenantConfig({ factoryShortName });
    await markSetupCompleted();

    // 3) Auto-login
    const session = await getSession();
    session.isLoggedIn = true;
    session.userId     = String(admin.id);
    session.userName   = factoryShortName;
    session.userPhone  = admin.phone;
    session.role       = admin.role;
    await session.save();

    // 4) Audit
    await recordAuditLog({
      action: 'setup_completed',
      actionLabel: '完成首启向导',
      pageUrl: '/setup',
      user: { userId: String(admin.id), userName: factoryShortName, userPhone: admin.phone },
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '初始化失败' };
  }
}

'use server';

import { upsertTenantConfig } from '@/lib/tenant';
import { recordAuditLog } from '@/lib/audit';
import { requireAuth } from '@/lib/requireAuth';

type SaveInput = {
  factoryShortName: string;
  logoBase64: string | null;     // null = remove logo, '' = leave unchanged
};

type SaveResult =
  | { ok: true }
  | { ok: false; error: string };

const MAX_LOGO_BYTES = 200 * 1024; // 200 KB

export async function saveFactoryInfo(input: SaveInput): Promise<SaveResult> {
  await requireAuth();
  const factoryShortName = (input.factoryShortName ?? '').trim();
  if (factoryShortName.length < 1 || factoryShortName.length > 10) {
    return { ok: false, error: '工厂简称需为 1-10 字。' };
  }

  const patch: Parameters<typeof upsertTenantConfig>[0] = { factoryShortName };

  if (input.logoBase64 === null) {
    patch.logoBase64 = null;
  } else if (typeof input.logoBase64 === 'string' && input.logoBase64.length > 0) {
    // Validate data URL format and size before storing.
    if (!/^data:image\/(png|jpeg|jpg);base64,/.test(input.logoBase64)) {
      return { ok: false, error: '只支持 PNG / JPG 格式。' };
    }
    if (input.logoBase64.length > MAX_LOGO_BYTES * 1.4) {
      return { ok: false, error: 'Logo 文件过大，请先压缩。' };
    }
    patch.logoBase64 = input.logoBase64;
  }

  await upsertTenantConfig(patch);

  await recordAuditLog({
    action: 'update_factory_info',
    actionLabel: '修改工厂信息',
    pageUrl: '/settings/factory',
    detail: {
      shortNameLength: factoryShortName.length,
      logoChanged: input.logoBase64 !== '',
    },
  });

  return { ok: true };
}

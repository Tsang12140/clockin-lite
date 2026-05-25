'use server';

import { upsertTenantConfig, encryptSecret } from '@/lib/tenant';
import { clearWeatherCache, fetchWeatherLocationVerification } from '@/lib/weatherServer';
import type { WeatherLocationVerification } from '@/lib/weather';
import { getSession } from '@/lib/session';
import { recordAuditLog } from '@/lib/audit';

type SaveResult = { ok: true } | { ok: false; error: string };

export async function toggleWeatherEnabled(enabled: boolean): Promise<SaveResult> {
  if (!(await isLoggedIn())) return { ok: false, error: '请先登录。' };
  try {
    await upsertTenantConfig({ weatherEnabled: enabled });
    clearWeatherCache();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '操作失败' };
  }
}

async function isLoggedIn(): Promise<boolean> {
  const session = await getSession();
  return session.isLoggedIn === true;
}

export async function saveWeatherConfig(input: {
  key?: string;
  locationId?: string;
  city?: string;
  host?: string;
}): Promise<SaveResult> {
  if (!(await isLoggedIn())) {
    return { ok: false, error: '请先登录。' };
  }

  const key = input.key?.trim() ?? '';
  const locationId = input.locationId?.trim() ?? '';
  const city = input.city?.trim() ?? '';
  const host = input.host?.trim().replace(/^https?:\/\//, '') ?? '';
  if (!locationId && !city) {
    return { ok: false, error: '位置 ID 和城市名至少填写一个。' };
  }

  try {
    const patch: Parameters<typeof upsertTenantConfig>[0] = {
      weatherProvider: 'qweather',
      weatherLocationId: locationId || null,
      weatherCity: city || null,
      weatherApiHost: host || null,
    };
    if (key) {
      patch.weatherEncryptedKey = encryptSecret(key);
    }
    await upsertTenantConfig(patch);
    clearWeatherCache();
    await recordAuditLog({
      action: 'save_weather_config',
      actionLabel: '修改天气配置',
      pageUrl: '/settings/weather',
      detail: {
        source: key ? 'db-key-updated' : 'db-key-unchanged',
        hasLocationId: Boolean(locationId),
        hasCity: Boolean(city),
      },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '保存失败' };
  }
}

type VerifyResult =
  | { ok: true; location: WeatherLocationVerification }
  | { ok: false; error: string };

export async function verifyWeatherLocation(input: {
  key?: string;
  locationId: string;
  host?: string;
}): Promise<VerifyResult> {
  if (!(await isLoggedIn())) {
    return { ok: false, error: '请先登录。' };
  }

  const key = input.key?.trim() ?? '';
  const locationId = input.locationId.trim();
  const host = input.host?.trim().replace(/^https?:\/\//, '') ?? '';
  if (!locationId) {
    return { ok: false, error: '位置 ID 不能为空' };
  }
  const result = await fetchWeatherLocationVerification({
    key: key || undefined,
    locationId,
    host: host || undefined,
  });
  if (!result.ok) {
    return { ok: false, error: result.detail };
  }
  return { ok: true, location: result.location };
}

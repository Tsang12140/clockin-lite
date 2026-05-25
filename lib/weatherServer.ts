import 'server-only';

import { getTenantConfig, decryptSecret } from '@/lib/tenant';
import { findQWeatherLocation } from '@/lib/qweatherLocations';
import type {
  WeatherConfigStatus,
  WeatherDay,
  WeatherLocationVerification,
  WeatherSnapshot,
} from '@/lib/weather';

type ResolvedWeatherConfig = {
  key: string;
  locationId: string;
  city: string;
  apiHost: string;
  enabled: boolean;
};

// Module-level in-memory cache (lives until server restart).
let locIdCache: string | null = null;
let snapshotCache: { data: WeatherSnapshot | null; ts: number } | null = null;
let historyCache: Record<string, WeatherDay> = {};
const CACHE_MS = 30 * 60 * 1000;

// City lookup uses the universal GeoAPI host (works with any QWeather key).
// Weather data uses the free-tier host by default; set QWEATHER_HOST to override
// (e.g. for paid plans with a project-specific subdomain like xxx.re.qweatherapi.com).
const GEO_HOST = 'geoapi.qweather.com';
const WEATHER_HOST = (process.env.QWEATHER_HOST ?? 'devapi.qweather.com').trim().replace(/^https?:\/\//, '');

// Env key takes priority; but if QWEATHER_HOST is not set in env, the host configured
// in the DB settings UI is used as fallback. This lets deployments set the key via env
// while configuring the host through the web interface.
async function resolveWeatherConfig(): Promise<ResolvedWeatherConfig | null> {
  const envKey = (process.env.QWEATHER_KEY ?? '').trim();

  try {
    const config = await getTenantConfig();
    const dbHost = (config?.weatherApiHost ?? '').trim().replace(/^https?:\/\//, '');
    const enabled = config?.weatherEnabled ?? true;

    if (envKey) {
      const envHost = (process.env.QWEATHER_HOST ?? '').trim().replace(/^https?:\/\//, '');
      return {
        key: envKey,
        locationId: (process.env.QWEATHER_LOCATION ?? '').trim(),
        city: (process.env.QWEATHER_CITY ?? '').trim(),
        apiHost: envHost || dbHost || WEATHER_HOST,
        enabled,
      };
    }

    if (!config?.weatherEncryptedKey) return null;
    const key = decryptSecret(config.weatherEncryptedKey).trim();
    if (!key) return null;

    return {
      key,
      locationId: (config.weatherLocationId ?? '').trim(),
      city: (config.weatherCity ?? '').trim(),
      apiHost: dbHost || WEATHER_HOST,
      enabled,
    };
  } catch {
    if (envKey) {
      return {
        key: envKey,
        locationId: (process.env.QWEATHER_LOCATION ?? '').trim(),
        city: (process.env.QWEATHER_CITY ?? '').trim(),
        apiHost: (process.env.QWEATHER_HOST ?? WEATHER_HOST).trim().replace(/^https?:\/\//, ''),
        enabled: true,
      };
    }
    return null;
  }
}

export async function getWeatherConfigStatus(): Promise<WeatherConfigStatus> {
  const envKey = (process.env.QWEATHER_KEY ?? '').trim();

  try {
    const config = await getTenantConfig();
    const dbHost = (config?.weatherApiHost ?? '').trim().replace(/^https?:\/\//, '');
    const enabled = config?.weatherEnabled ?? true;

    if (envKey) {
      const envHost = (process.env.QWEATHER_HOST ?? '').trim().replace(/^https?:\/\//, '');
      return {
        source: 'env',
        hasKey: true,
        locationId: (process.env.QWEATHER_LOCATION ?? '').trim(),
        city: (process.env.QWEATHER_CITY ?? '').trim(),
        apiHost: envHost || dbHost || WEATHER_HOST,
        enabled,
      };
    }

    if (config?.weatherEncryptedKey) {
      const key = decryptSecret(config.weatherEncryptedKey);
      if (key) {
        return {
          source: 'db',
          hasKey: true,
          locationId: (config.weatherLocationId ?? '').trim(),
          city: (config.weatherCity ?? '').trim(),
          apiHost: dbHost || WEATHER_HOST,
          enabled,
        };
      }
    }

    return {
      source: 'none',
      hasKey: false,
      locationId: (config?.weatherLocationId ?? '').trim(),
      city: (config?.weatherCity ?? '').trim(),
      apiHost: dbHost || WEATHER_HOST,
      enabled,
    };
  } catch {
    const envHost = (process.env.QWEATHER_HOST ?? WEATHER_HOST).trim().replace(/^https?:\/\//, '');
    return { source: envKey ? 'env' : 'none', hasKey: Boolean(envKey), locationId: '', city: '', apiHost: envHost, enabled: true };
  }
}

export function clearWeatherCache(): void {
  locIdCache = null;
  snapshotCache = null;
  historyCache = {};
}

async function resolveLocId(): Promise<string | null> {
  if (locIdCache) return locIdCache;

  const cfg = await resolveWeatherConfig();
  if (!cfg) return null;

  if (cfg.locationId) {
    locIdCache = cfg.locationId;
    return locIdCache;
  }

  // No implicit city fallback: missing location means the weather module stays hidden.
  if (!cfg.city) return null;

  try {
    const response = await fetch(
      `https://${GEO_HOST}/v2/city/lookup?location=${encodeURIComponent(cfg.city)}&key=${cfg.key}`,
      { next: { revalidate: 24 * 60 * 60 } },
    );
    const data = await response.json();
    if (data.code === '200' && data.location?.[0]?.id) {
      locIdCache = String(data.location[0].id);
      return locIdCache;
    }
  } catch {
    return null;
  }

  return null;
}

// Verifies by calling /v7/weather/3d — works for all subscription types including
// new project-specific subdomains (*.re.qweatherapi.com) that don't expose a GeoAPI.
// Location name is resolved locally from QWEATHER_LOCATION_GROUPS instead of the API.
export async function fetchWeatherLocationVerification(
  params?: { key?: string; locationId?: string; host?: string },
): Promise<{ ok: true; location: WeatherLocationVerification } | { ok: false; code: string; detail: string }> {
  const cfg = !params?.key || !params?.locationId ? await resolveWeatherConfig() : null;
  const key = (params?.key ?? cfg?.key ?? '').trim();
  const locId = (params?.locationId ?? cfg?.locationId ?? '').trim();
  if (!key || !locId) return { ok: false, code: 'missing', detail: 'key 或 locationId 为空' };

  const inputHost = (params?.host ?? '').trim().replace(/^https?:\/\//, '');
  const weatherHost = inputHost || (cfg?.apiHost ?? '') || WEATHER_HOST;

  try {
    const url = `https://${weatherHost}/v7/weather/3d?location=${locId}&key=${key}`;
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json() as { code?: string };

    if (data.code !== '200') {
      const hint =
        data.code === '401' ? '（Key 无效）' :
        data.code === '402' ? '（超出调用限额）' :
        data.code === '404' ? '（位置 ID 不存在）' : '';
      return { ok: false, code: data.code ?? String(response.status), detail: `API ${data.code ?? response.status}${hint}，host=${weatherHost}` };
    }

    const local = findQWeatherLocation(locId);
    return {
      ok: true,
      location: {
        id:   locId,
        name: local?.district ?? locId,
        adm2: local?.city ?? '',
        adm1: local?.province ?? '',
      },
    };
  } catch (err) {
    return { ok: false, code: 'exception', detail: String(err) };
  }
}

async function fetchDailyWeather(locId: string, key: string, days: 7 | 3, host: string): Promise<WeatherDay[] | null> {
  try {
    const response = await fetch(
      `https://${host}/v7/weather/${days}d?location=${locId}&key=${key}`,
      { next: { revalidate: 1800 } },
    );
    const data = await response.json();
    if (data.code !== '200' || !Array.isArray(data.daily)) return null;
    return data.daily as WeatherDay[];
  } catch {
    return null;
  }
}

interface HistoricalWeatherHourly {
  time:       string;
  icon:       string;
  text:       string;
  windDir?:   string;
  windScale?: string;
}

interface HistoricalWeatherDaily {
  date:    string;
  tempMax: string;
  tempMin: string;
}

function pickHistoricalRepresentative(hourly: HistoricalWeatherHourly[] | undefined): HistoricalWeatherHourly | null {
  if (!hourly?.length) return null;
  return hourly.find(item => item.time.endsWith('12:00'))
    ?? hourly.find(item => item.time.endsWith('15:00'))
    ?? hourly[Math.floor(hourly.length / 2)]
    ?? hourly[0]
    ?? null;
}

export async function fetchHistoricalWeatherDay(date: string): Promise<WeatherDay | null> {
  if (historyCache[date]) return historyCache[date];

  const cfg = await resolveWeatherConfig();
  if (!cfg?.key) return null;

  try {
    const locId = await resolveLocId();
    if (!locId) return null;

    const response = await fetch(
      `https://${cfg.apiHost}/v7/historical/weather?location=${locId}&date=${date.replaceAll('-', '')}&key=${cfg.key}`,
      { next: { revalidate: 24 * 60 * 60 } },
    );
    const data = await response.json();
    if (data.code !== '200' || !data.weatherDaily) return null;

    const daily = data.weatherDaily as HistoricalWeatherDaily;
    const representative = pickHistoricalRepresentative(data.weatherHourly as HistoricalWeatherHourly[] | undefined);
    if (!representative) return null;

    const weatherDay: WeatherDay = {
      fxDate:       daily.date,
      textDay:      representative.text,
      tempMax:      daily.tempMax,
      tempMin:      daily.tempMin,
      iconDay:      representative.icon,
      windDirDay:   representative.windDir ?? '',
      windScaleDay: representative.windScale ?? '',
    };
    historyCache = { ...historyCache, [date]: weatherDay };
    return weatherDay;
  } catch {
    return null;
  }
}

export async function fetchWeatherSnapshot(): Promise<WeatherSnapshot | null> {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.ts < CACHE_MS) return snapshotCache.data;

  const cfg = await resolveWeatherConfig();
  if (!cfg?.key || cfg.enabled === false) {
    snapshotCache = { data: null, ts: now };
    return null;
  }

  try {
    const locId = await resolveLocId();
    if (!locId) {
      snapshotCache = { data: null, ts: now };
      return null;
    }

    const daily = await fetchDailyWeather(locId, cfg.key, 7, cfg.apiHost) ?? await fetchDailyWeather(locId, cfg.key, 3, cfg.apiHost);
    if (!daily) return null;

    const today = daily[0] ?? null;
    const tomorrow = daily[1] ?? null;
    const data = today && tomorrow ? { today, tomorrow, days: daily.slice(0, 7) } : null;
    snapshotCache = { data, ts: now };
    return data;
  } catch {
    snapshotCache = { data: null, ts: now };
    return null;
  }
}

export async function fetchTomorrowWeather(): Promise<WeatherDay | null> {
  const snapshot = await fetchWeatherSnapshot();
  return snapshot?.tomorrow ?? null;
}

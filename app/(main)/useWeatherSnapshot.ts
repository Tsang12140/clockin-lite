'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WeatherDay, WeatherSnapshot } from '@/lib/weather';

const WEATHER_REFRESH_MS = 30 * 60 * 1000;
const WEATHER_DAY_CACHE_KEY = 'clockin_weather_days_v1';

function mergeSnapshotWithCachedDays(snapshot: WeatherSnapshot | null): WeatherSnapshot | null {
  if (!snapshot) return null;

  let cachedDays: WeatherDay[] = [];
  try {
    const raw = localStorage.getItem(WEATHER_DAY_CACHE_KEY);
    cachedDays = raw ? JSON.parse(raw) as WeatherDay[] : [];
  } catch {
    cachedDays = [];
  }

  const merged = new Map<string, WeatherDay>();
  for (const day of cachedDays) {
    if (day?.fxDate) merged.set(day.fxDate, day);
  }
  for (const day of snapshot.days ?? [snapshot.today, snapshot.tomorrow]) {
    if (day?.fxDate) merged.set(day.fxDate, day);
  }

  const days = [...merged.values()].sort((a, b) => a.fxDate.localeCompare(b.fxDate)).slice(-14);
  try {
    localStorage.setItem(WEATHER_DAY_CACHE_KEY, JSON.stringify(days));
  } catch {}

  return { ...snapshot, days };
}

export function useWeatherSnapshot(initialSnapshot?: WeatherSnapshot | null, activeDate?: string | null) {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(initialSnapshot ?? null);

  const refresh = useCallback(async (date?: string | null) => {
    try {
      const query = date ? `?date=${encodeURIComponent(date)}` : '';
      const response = await fetch(`/api/weather${query}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as { weatherSnapshot?: WeatherSnapshot | null };
      if (data.weatherSnapshot) setSnapshot(mergeSnapshotWithCachedDays(data.weatherSnapshot));
    } catch {}
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSnapshot(current => mergeSnapshotWithCachedDays(current));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onFocus = () => refresh();
    const onPageShow = () => refresh();
    const interval = window.setInterval(onFocus, WEATHER_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!activeDate) return;
    const timer = window.setTimeout(() => refresh(activeDate), 0);
    return () => window.clearTimeout(timer);
  }, [activeDate, refresh]);

  return { snapshot, refresh };
}

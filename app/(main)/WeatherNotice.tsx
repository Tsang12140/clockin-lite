'use client';

import { useEffect, useState } from 'react';
import { findWeatherDay, getWeatherDecisionForDay, getWeatherEmoji } from '@/lib/weather';
import type { WeatherSnapshot } from '@/lib/weather';
import { addDays, getMonday } from '@/lib/utils';
import WeatherBg from './WeatherBg';
import { useWeatherSnapshot } from './useWeatherSnapshot';

export default function WeatherNotice({
  initialSnapshot,
  variant = 'mobile',
  surface = 'card',
  className = '',
  today,
  selectedDate,
  workEndHour,
}: {
  initialSnapshot?: WeatherSnapshot | null;
  variant?: 'mobile' | 'desktop';
  surface?: 'card' | 'plain';
  className?: string;
  today?: string;
  selectedDate?: string | null;
  workEndHour?: number;
}) {
  const [weatherHour, setWeatherHour] = useState<number | null>(null);
  const selectedPastWeatherDate = today && selectedDate && selectedDate < today && selectedDate >= getMonday(today)
    ? selectedDate
    : null;
  const { snapshot, refresh } = useWeatherSnapshot(initialSnapshot ?? null, selectedPastWeatherDate);

  useEffect(() => {
    const readWeatherHour = () => setWeatherHour(new Date().getHours());
    readWeatherHour();
    const timer = window.setInterval(readWeatherHour, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const weatherThreshold = workEndHour ?? 15;
  const defaultWeatherDate = today && (weatherHour ?? 12) < weatherThreshold ? today : today ? addDays(today, 1) : null;
  const defaultWeather = defaultWeatherDate
    ? findWeatherDay(snapshot ?? null, defaultWeatherDate)
      ?? ((weatherHour ?? 12) < weatherThreshold ? snapshot?.today : snapshot?.tomorrow)
      ?? null
    : snapshot?.tomorrow ?? null;
  const selectedWeather = selectedDate ? findWeatherDay(snapshot ?? null, selectedDate) : null;
  const isSelectedPastAllowed = Boolean(selectedPastWeatherDate);
  const canUseSelectedWeather = Boolean(today && selectedDate && selectedDate !== today && selectedWeather && (selectedDate >= today || isSelectedPastAllowed));
  const displayWeather = canUseSelectedWeather ? selectedWeather : defaultWeather;
  const weatherLabel = canUseSelectedWeather && selectedDate
    ? `${parseInt(selectedDate.slice(5, 7))}月${parseInt(selectedDate.slice(8, 10))}日`
    : (defaultWeatherDate === today ? '今日' : '明日');
  const weatherDecision = getWeatherDecisionForDay(snapshot ?? null, displayWeather);

  if (!displayWeather) return null;

  const message = `${weatherLabel} ${displayWeather.textDay}，${displayWeather.tempMin}~${displayWeather.tempMax}°C${weatherDecision?.tempHint ? ` · ${weatherDecision.tempHint}` : ''}`;
  const desktopMessage = `${displayWeather.textDay}，${displayWeather.tempMin}~${displayWeather.tempMax}°C${weatherDecision?.tempHint ? ` · ${weatherDecision.tempHint}` : ''}`;

  if (variant === 'desktop') {
    const surfaceClass = surface === 'plain'
      ? 'rounded-xl shadow-none'
      : 'rounded-2xl shadow-sm';
    return (
      <button
        type="button"
        onClick={() => refresh(selectedPastWeatherDate)}
        className={`relative isolate min-h-20 w-full overflow-hidden text-left ${surfaceClass} ${weatherDecision?.showAnimation ? '' : 'bg-[#F8FAFF]'} ${className}`}
      >
        {weatherDecision?.showAnimation && <WeatherBg category={weatherDecision.category} />}
        <div className="relative z-10 flex min-h-20 items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-gray-500">{weatherLabel}天气</div>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <span className="text-[20px] shrink-0">{getWeatherEmoji(displayWeather.iconDay)}</span>
              <span className="block min-w-0 overflow-hidden text-[15px] font-semibold leading-snug text-gray-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{desktopMessage}</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => refresh(selectedPastWeatherDate)}
      className={`relative z-0 isolate h-12 w-full overflow-hidden -mt-px text-left ${weatherDecision?.showAnimation ? '' : 'bg-[#F8FAFF]'} ${className}`}
    >
      {weatherDecision?.showAnimation && <WeatherBg category={weatherDecision.category} />}
      <div className="relative z-10 h-full flex items-center px-4">
        <div className="flex items-center gap-1.5 min-w-0 text-[12px] font-medium text-gray-500">
          <span className="shrink-0">{getWeatherEmoji(displayWeather.iconDay)}</span>
          <span className="truncate">{desktopMessage}</span>
        </div>
      </div>
    </button>
  );
}

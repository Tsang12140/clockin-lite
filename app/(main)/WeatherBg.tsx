'use client';

import type { CSSProperties } from 'react';
import type { WeatherCategory } from '@/lib/weather';

const RAIN_CONFIG: Record<'rainy' | 'heavy-rainy' | 'rainstorm' | 'thunderstorm', { count: number; speed: number; stagger: number }> = {
  rainy: { count: 14, speed: 0.72, stagger: 0.19 },
  'heavy-rainy': { count: 22, speed: 0.56, stagger: 0.13 },
  rainstorm: { count: 32, speed: 0.42, stagger: 0.08 },
  thunderstorm: { count: 28, speed: 0.46, stagger: 0.09 },
};
const SNOW_FLAKES = 10;

function renderRain(category: 'rainy' | 'heavy-rainy' | 'rainstorm' | 'thunderstorm') {
  const config = RAIN_CONFIG[category];
  const hasDarkDrops = category === 'heavy-rainy' || category === 'rainstorm' || category === 'thunderstorm';
  const hasLightning = category === 'thunderstorm';

  return (
    <div className={`weather-bg weather-bg--${category}`} aria-hidden>
      {hasLightning && (
        <>
          <div className="lightning-bolt lightning-bolt--main" />
          <div className="lightning-bolt lightning-bolt--side" />
          <div className="lightning-bolt lightning-bolt--small" />
        </>
      )}
      {Array.from({ length: config.count }, (_, i) => {
        const isDark = hasDarkDrops && i % 3 === 0;
        const style = {
          left: `${((i * 97) % 100) + 0.5}%`,
          animationDelay: `${((i * config.stagger) % 1.3).toFixed(2)}s`,
          animationDuration: `${(config.speed + (i % 5) * 0.055).toFixed(2)}s`,
        } satisfies CSSProperties;

        return (
          <div
            key={i}
            className={`rain-drop ${isDark ? 'rain-drop--dark' : ''}`}
            style={style}
          />
        );
      })}
    </div>
  );
}

export default function WeatherBg({ category }: { category: WeatherCategory }) {
  if (category === 'sunny') {
    return (
      <div className="weather-bg weather-bg--sunny" aria-hidden>
        <div className="sun-core" />
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`sun-orb sun-orb--${i}`} />
        ))}
      </div>
    );
  }

  if (category === 'rainy' || category === 'heavy-rainy' || category === 'rainstorm' || category === 'thunderstorm') {
    return renderRain(category);
  }

  if (category === 'snowy') {
    return (
      <div className="weather-bg weather-bg--snowy" aria-hidden>
        {Array.from({ length: SNOW_FLAKES }, (_, i) => (
          <div
            key={i}
            className="snow-flake"
            style={{
              left:             `${((i * 113) % 96) + 2}%`,
              animationDelay:   `${((i * 0.31) % 2).toFixed(2)}s`,
              animationDuration:`${(1.8 + (i % 4) * 0.3).toFixed(2)}s`,
              fontSize:         `${10 + (i % 3) * 4}px`,
            }}
          >
            ❄
          </div>
        ))}
      </div>
    );
  }

  if (category === 'cloudy') {
    return (
      <div className="weather-bg weather-bg--cloudy" aria-hidden>
        <div className="cloud cloud--1" />
        <div className="cloud cloud--2" />
      </div>
    );
  }

  return (
    <div className="weather-bg weather-bg--foggy" aria-hidden>
      <div className="fog-line fog-line--1" />
      <div className="fog-line fog-line--2" />
      <div className="fog-line fog-line--3" />
    </div>
  );
}

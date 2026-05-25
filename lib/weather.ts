export interface WeatherDay {
  fxDate:       string;
  textDay:      string;
  tempMax:      string;
  tempMin:      string;
  iconDay:      string;
  windDirDay:   string;
  windScaleDay: string;
}

export interface WeatherSnapshot {
  today:    WeatherDay;
  tomorrow: WeatherDay;
  days?:    WeatherDay[];
}

export interface WeatherLocationVerification {
  id:   string;
  name: string;
  adm2: string;
  adm1: string;
}

export type WeatherConfigStatus = {
  source: 'env' | 'db' | 'none';
  hasKey: boolean;
  locationId: string;
  city: string;
  apiHost: string;
  enabled: boolean;
};

export type WeatherCategory = 'sunny' | 'rainy' | 'heavy-rainy' | 'rainstorm' | 'thunderstorm' | 'snowy' | 'cloudy' | 'foggy';

export function getWeatherCategory(iconCode: string): WeatherCategory {
  const c = parseInt(iconCode);
  if (c === 100 || c === 150) return 'sunny';
  if (c >= 302 && c <= 304)   return 'thunderstorm';
  if ([308, 310, 311, 312, 317, 318].includes(c)) return 'rainstorm';
  if ([307, 315, 316].includes(c)) return 'heavy-rainy';
  if (c >= 300 && c <= 318)   return 'rainy';
  if (c >= 400 && c <= 410)   return 'snowy';
  if (c >= 500 && c <= 515)   return 'foggy';
  return 'cloudy';
}

export function getWeatherEmoji(iconCode: string): string {
  const c = parseInt(iconCode);
  if (c === 100 || c === 150) return '☀️';
  if (c === 101 || c === 151) return '⛅';
  if (c === 102 || c === 152) return '🌤️';
  if (c === 103 || c === 153) return '⛅';
  if (c === 104 || c === 154) return '☁️';
  if (c === 302 || c === 303) return '⛈️';
  if (c >= 300 && c <= 318)   return '🌧️';
  if (c >= 400 && c <= 410)   return '❄️';
  if (c >= 500 && c <= 515)   return '🌫️';
  return '🌡️';
}

export function getWeatherDecision(snapshot: WeatherSnapshot | null) {
  if (!snapshot) return null;

  return getWeatherDecisionForDay(snapshot, snapshot.tomorrow);
}

export function findWeatherDay(snapshot: WeatherSnapshot | null, date: string): WeatherDay | null {
  if (!snapshot) return null;
  const fromDays = snapshot.days?.find(day => day.fxDate === date);
  if (fromDays) return fromDays;
  if (snapshot.today.fxDate === date) return snapshot.today;
  if (snapshot.tomorrow.fxDate === date) return snapshot.tomorrow;
  return null;
}

export function getWeatherDecisionForDay(snapshot: WeatherSnapshot | null, targetDay: WeatherDay | null) {
  if (!snapshot || !targetDay) return null;

  const todayCategory = getWeatherCategory(snapshot.today.iconDay);
  const targetCategory = getWeatherCategory(targetDay.iconDay);
  const todayAvg = (parseFloat(snapshot.today.tempMax) + parseFloat(snapshot.today.tempMin)) / 2;
  const targetAvg = (parseFloat(targetDay.tempMax) + parseFloat(targetDay.tempMin)) / 2;
  const tempDelta = Math.round(targetAvg - todayAvg);
  const hasBigTempChange = Math.abs(tempDelta) >= 5;
  const precipCategories: WeatherCategory[] = ['rainy', 'heavy-rainy', 'rainstorm', 'thunderstorm', 'snowy'];
  const todayPrecip = precipCategories.includes(todayCategory);
  const targetPrecip = precipCategories.includes(targetCategory);

  const showAnimation =
    targetPrecip ||
    (todayPrecip && !targetPrecip) ||
    hasBigTempChange;

  const tempHint = hasBigTempChange
    ? tempDelta > 0
      ? `升温${tempDelta}°C，注意防晒补水`
      : `降温${Math.abs(tempDelta)}°C，注意添衣`
    : null;

  return {
    showAnimation,
    tempHint,
    category: targetCategory,
    todayCategory,
    tomorrowCategory: targetCategory,
    targetCategory,
    tempDelta,
  };
}

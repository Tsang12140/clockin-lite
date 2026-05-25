import {
  QWEATHER_LOCATION_GROUPS,
  QWEATHER_LOCATION_SOURCE,
  QWEATHER_LOCATION_VERSION,
} from '@/lib/qweatherLocations.generated';
import type {
  QWeatherLocationCity,
  QWeatherLocationItem,
  QWeatherLocationProvince,
} from '@/lib/qweatherLocations.generated';

export {
  QWEATHER_LOCATION_GROUPS,
  QWEATHER_LOCATION_SOURCE,
  QWEATHER_LOCATION_VERSION,
};

export type {
  QWeatherLocationCity,
  QWeatherLocationItem,
  QWeatherLocationProvince,
};

export type QWeatherLocationSelection = {
  province: string;
  city: string;
  district: string;
  id: string;
};

export function findQWeatherLocation(id: string): QWeatherLocationSelection | null {
  const targetId = id.trim();
  if (!targetId) return null;

  for (const province of QWEATHER_LOCATION_GROUPS) {
    for (const city of province.cities) {
      const item = city.items.find(location => location.id === targetId);
      if (item) {
        return {
          province: province.name,
          city: city.name,
          district: item.name,
          id: item.id,
        };
      }
    }
  }

  return null;
}

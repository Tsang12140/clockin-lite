import { fetchHistoricalWeatherDay, fetchWeatherSnapshot } from '@/lib/weatherServer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date');
  const weatherSnapshot = await fetchWeatherSnapshot();
  const historyDay = date ? await fetchHistoricalWeatherDay(date) : null;
  const mergedSnapshot = weatherSnapshot && historyDay
    ? {
        ...weatherSnapshot,
        days: [
          ...(weatherSnapshot.days ?? [weatherSnapshot.today, weatherSnapshot.tomorrow]).filter(day => day.fxDate !== historyDay.fxDate),
          historyDay,
        ].sort((a, b) => a.fxDate.localeCompare(b.fxDate)),
      }
    : weatherSnapshot;

  return Response.json(
    { weatherSnapshot: mergedSnapshot },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

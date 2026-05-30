type WorkedHoursRecord = {
  employeeId: number | null;
  hours: string | null;
  workDate?: string | null;
};

function normalizeHalfHour(value: string | null): string | null {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const rounded = Math.round(parsed * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function chooseTypicalWorkedHours(
  records: WorkedHoursRecord[],
  fallback = '8',
): Record<number, string> {
  const fallbackHours = normalizeHalfHour(fallback) ?? '8';
  const byEmployee = new Map<number, {
    counts: Map<string, number>;
    latestHours: string | null;
    latestDate: string;
  }>();

  for (const record of records) {
    if (!record.employeeId) continue;
    const hours = normalizeHalfHour(record.hours);
    if (!hours) continue;

    const entry = byEmployee.get(record.employeeId) ?? {
      counts: new Map<string, number>(),
      latestHours: null,
      latestDate: '',
    };
    entry.counts.set(hours, (entry.counts.get(hours) ?? 0) + 1);

    const workDate = record.workDate ?? '';
    if (workDate >= entry.latestDate) {
      entry.latestDate = workDate;
      entry.latestHours = hours;
    }
    byEmployee.set(record.employeeId, entry);
  }

  const result: Record<number, string> = {};
  for (const [employeeId, entry] of byEmployee) {
    let topCount = 0;
    for (const count of entry.counts.values()) topCount = Math.max(topCount, count);

    const candidates = [...entry.counts.entries()]
      .filter(([, count]) => count === topCount)
      .map(([hours]) => hours);

    result[employeeId] = candidates.includes(fallbackHours)
      ? fallbackHours
      : entry.latestHours && candidates.includes(entry.latestHours)
        ? entry.latestHours
        : candidates.sort((a, b) => Number.parseFloat(b) - Number.parseFloat(a))[0] ?? fallbackHours;
  }

  return result;
}

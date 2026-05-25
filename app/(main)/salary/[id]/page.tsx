import { getPayslipData } from '@/lib/queries';
import { notFound } from 'next/navigation';
import PayslipView from './PayslipView';

export const dynamic = 'force-dynamic';

export default async function PayslipPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { id } = await params;
  const sp      = await searchParams;
  const empId   = parseInt(id);
  const now     = new Date();
  const year    = parseInt(sp.year  ?? String(now.getFullYear()));
  const month   = parseInt(sp.month ?? String(now.getMonth() + 1));

  const {
    emp,
    records,
    rateHistory,
    allEmps,
    workSchedule,
    legalHolidayDates,
    adjustedWorkdayDates,
    overtimeMultipliers,
  } = await getPayslipData(empId, year, month);

  if (!emp) notFound();

  return (
    <PayslipView
      emp={emp}
      records={records}
      rateHistory={rateHistory}
      year={year}
      month={month}
      allEmps={allEmps}
      workSchedule={workSchedule}
      legalHolidayDates={legalHolidayDates}
      adjustedWorkdayDates={adjustedWorkdayDates}
      overtimeMultipliers={overtimeMultipliers}
    />
  );
}

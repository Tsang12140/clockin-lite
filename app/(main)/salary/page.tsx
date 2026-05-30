import { getMonthlySalary } from '@/lib/queries';
import { getSalaryPayDay } from '@/lib/tenant';
import SalaryPage from './SalaryPage';

export const dynamic = 'force-dynamic';

export default async function Salary({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const payDay = await getSalaryPayDay();
  const defaultDate = new Date(now.getFullYear(), now.getMonth() - (now.getDate() > payDay ? 0 : 1), 1);
  const year  = parseInt(params.year  ?? String(defaultDate.getFullYear()));
  const month = parseInt(params.month ?? String(defaultDate.getMonth() + 1));

  const data = await getMonthlySalary(year, month);
  return <SalaryPage data={data} year={year} month={month} />;
}

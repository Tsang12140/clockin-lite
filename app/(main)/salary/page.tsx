import { getMonthlySalary } from '@/lib/queries';
import SalaryPage from './SalaryPage';

export const dynamic = 'force-dynamic';

export default async function Salary({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const now   = new Date();
  const year  = parseInt(params.year  ?? String(now.getFullYear()));
  const month = parseInt(params.month ?? String(now.getMonth() + 1));

  const data = await getMonthlySalary(year, month);
  return <SalaryPage data={data} year={year} month={month} />;
}

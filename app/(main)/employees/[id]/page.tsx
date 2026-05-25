import { getEmployeeDetailData } from '@/lib/queries';
import { notFound } from 'next/navigation';
import EmployeeDetail from './EmployeeDetail';

export const dynamic = 'force-dynamic';

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const empId = parseInt(id);

  const { emp, rateHistory, aliases } = await getEmployeeDetailData(empId);

  if (!emp) notFound();

  return <EmployeeDetail emp={emp} rateHistory={rateHistory} aliases={aliases} />;
}

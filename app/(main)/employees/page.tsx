import { getAllEmployees } from '@/lib/queries';
import EmployeeList from './EmployeeList';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const employees = await getAllEmployees();
  return <EmployeeList employees={employees} />;
}

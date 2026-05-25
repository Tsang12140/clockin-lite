import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

function formatAccount(account: string | undefined) {
  const value = account?.trim();
  if (!value) return '未知账号';
  if (/^\d+$/.test(value)) {
    return value.length > 4 ? `尾号 ${value.slice(-4)}` : value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const account = session.userPhone || session.userName || session.userId;

  return Response.json({
    account: formatAccount(account),
  });
}

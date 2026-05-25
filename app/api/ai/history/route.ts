import { getAIChatHistory } from '@/lib/ai/history';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ ok: false, items: [] }, { status: 401 });
  }
  const aiUserId = session.userId ?? session.userPhone ?? null;
  const url = new URL(request.url);
  const result = await getAIChatHistory({
    userId: aiUserId,
    before: url.searchParams.get('before'),
    limit: url.searchParams.get('limit'),
  });

  return Response.json(result, { status: result.ok ? 200 : 500 });
}

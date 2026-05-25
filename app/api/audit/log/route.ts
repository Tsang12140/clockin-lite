import { recordAuditLog } from '@/lib/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type AuditRequest = {
  action?: unknown;
  actionLabel?: unknown;
  pageUrl?: unknown;
  detail?: unknown;
};

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return Response.json({ ok: false }, { status: 401 });
    }
    const body = await request.json() as AuditRequest;
    const action = typeof body.action === 'string' ? body.action : 'page_view';
    const actionLabel = typeof body.actionLabel === 'string' ? body.actionLabel : '访问页面';
    const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl : null;
    const detail = body.detail && typeof body.detail === 'object'
      ? body.detail as Record<string, unknown>
      : null;

    await recordAuditLog({ action, actionLabel, pageUrl, detail });
    return Response.json({ ok: true });
  } catch (error) {
    console.warn('[audit] api log failed', error);
    return Response.json({ ok: false }, { status: 500 });
  }
}

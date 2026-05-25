import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { generateSummaryExcel } from '@/lib/exportSummary';
import { recordAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { filename, data } = await generateSummaryExcel();
    await recordAuditLog({
      action: 'download_summary_excel',
      actionLabel: '下载总表',
      pageUrl: '/settings/backup',
      user: session,
      detail: { filename, bytes: data.length },
    });
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[export] summary failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 },
    );
  }
}

import { createManualSqlBackup } from '@/lib/backup';
import { recordAuditLog } from '@/lib/audit';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const backup = await createManualSqlBackup();
    await recordAuditLog({
      action: 'download_backup',
      actionLabel: '下载数据库备份',
      pageUrl: '/settings/backup',
      user: session,
      detail: { filename: backup.filename, bytes: backup.data.length },
    });

    return new Response(new Uint8Array(backup.data), {
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${backup.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[backup] manual download failed', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Backup failed' },
      { status: 500 },
    );
  }
}

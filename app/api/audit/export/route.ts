import { listAuditLogs } from '@/lib/audit';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';

function csvCell(value: unknown): string {
  const text = value == null
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function stamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

export async function GET() {
  await requireAuth();
  const logs = await listAuditLogs(500);
  const header = [
    '时间',
    '账号',
    '手机号',
    '设备备注',
    '设备',
    '城市',
    'IP',
    '动作',
    '说明',
    '页面',
    '详情',
  ];
  const rows = logs.map(log => [
    log.createdAt,
    log.userName,
    log.userPhone,
    log.note,
    log.device,
    log.city,
    log.ip,
    log.action,
    log.actionLabel,
    log.pageUrl,
    log.detail,
  ]);
  const csv = [header, ...rows]
    .map(row => row.map(csvCell).join(','))
    .join('\n');

  return new Response(`\uFEFF${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clockin-audit-${stamp()}.csv"`,
    },
  });
}

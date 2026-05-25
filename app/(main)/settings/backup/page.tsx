import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getS3BackupStatus, listBackupRuns } from '@/lib/backupConfig';
import BackupPanel from './BackupPanel';

export const dynamic = 'force-dynamic';

export default async function BackupSettingsPage() {
  const [status, runs] = await Promise.all([
    getS3BackupStatus(),
    listBackupRuns(20).catch(() => []),
  ]);
  const runSummaries = runs.map(run => ({
    id: run.id,
    provider: run.provider,
    kind: run.kind,
    status: run.status,
    fileName: run.fileName,
    location: run.location,
    sizeBytes: run.sizeBytes,
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
  }));

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-2xl md:px-6 md:py-5">
        <div className="flex items-center bg-white px-4 pb-4 pt-5 shadow-sm md:rounded-2xl">
          <Link href="/settings" className="mr-3 p-1 text-gray-400">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-[17px] font-semibold text-[#1A3A8F]">备份</h1>
        </div>

        <div className="space-y-3 px-3 py-3 md:px-0">
          <BackupPanel status={status} runs={runSummaries} />
        </div>
      </div>
    </div>
  );
}

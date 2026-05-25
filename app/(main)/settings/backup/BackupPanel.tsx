'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, CloudUpload, Download, Loader2, XCircle } from 'lucide-react';
import { saveS3ConfigAction, uploadS3BackupNowAction } from './actions';
import type { S3BackupStatus } from '@/lib/backupConfig';

export type BackupRunSummary = {
  id: number;
  provider: string;
  kind: string;
  status: string;
  fileName: string | null;
  location: string | null;
  sizeBytes: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type Props = {
  status: S3BackupStatus;
  runs: BackupRunSummary[];
};

function formatBytes(value: number | null) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BackupPanel({ status, runs }: Props) {
  const [enabled, setEnabled] = useState(status.enabled);
  const [endpoint, setEndpoint] = useState(status.endpoint || 'https://s3.amazonaws.com');
  const [region, setRegion] = useState(status.region || 'us-east-1');
  const [bucket, setBucket] = useState(status.bucket);
  const [prefix, setPrefix] = useState(status.prefix || 'backups/db');
  const [forcePathStyle, setForcePathStyle] = useState(status.forcePathStyle);
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, startSaving] = useTransition();
  const [isUploading, startUploading] = useTransition();
  const router = useRouter();

  const save = () => {
    setMessage('');
    startSaving(async () => {
      const result = await saveS3ConfigAction({
        enabled,
        endpoint,
        region,
        bucket,
        prefix,
        forcePathStyle,
        accessKeyId: accessKeyId.trim() || undefined,
        secretAccessKey: secretAccessKey.trim() || undefined,
      });
      if (result.ok) {
        setAccessKeyId('');
        setSecretAccessKey('');
        setMessage(result.message);
        router.refresh();
      } else {
        setMessage(result.error);
      }
    });
  };

  const upload = () => {
    setMessage('');
    startUploading(async () => {
      const result = await uploadS3BackupNowAction();
      setMessage(result.ok ? result.message : result.error);
      router.refresh();
    });
  };

  const sourceBadge =
    status.source === 'env' ? (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">ENV 优先</span>
    ) : status.hasCredentials ? (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">DB 已配置</span>
    ) : (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">未配置</span>
    );

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-medium text-gray-800">一键导出总表</div>
            <div className="mt-0.5 text-[12px] text-gray-400">员工信息 + 全量考勤记录 Excel</div>
          </div>
          <a
            href="/api/export/summary"
            className="flex h-10 items-center gap-2 rounded-xl bg-[#F0F4FA] px-3 text-[13px] font-medium text-[#1A3A8F]"
          >
            <Download size={15} />
            下载
          </a>
        </div>

        <button
          type="button"
          onClick={upload}
          disabled={isUploading || !status.hasCredentials}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#3370FF] text-[15px] font-medium text-white shadow-sm disabled:opacity-40"
        >
          {isUploading ? <Loader2 size={17} className="animate-spin" /> : <CloudUpload size={17} />}
          上传备份到 S3
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[15px] font-medium text-gray-800">S3 配置</span>
          {sourceBadge}
        </div>

        <div className="mb-3 flex items-center justify-between rounded-xl bg-[#F8FAFF] px-3 py-2.5">
          <span className="text-[13px] text-gray-500">启用远端备份</span>
          <button
            type="button"
            onClick={() => setEnabled(value => !value)}
            className={`relative h-7 w-[52px] rounded-full transition-colors ${enabled ? 'bg-[#3370FF]' : 'bg-gray-200'}`}
          >
            <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] text-gray-500">Endpoint</span>
            <input value={endpoint} onChange={e => setEndpoint(e.target.value)} className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[13px] text-gray-500">Region</span>
              <input value={region} onChange={e => setRegion(e.target.value)} className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] text-gray-500">Bucket</span>
              <input value={bucket} onChange={e => setBucket(e.target.value)} className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none" />
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className="text-[13px] text-gray-500">Prefix</span>
            <input value={prefix} onChange={e => setPrefix(e.target.value)} className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[13px] text-gray-500">Access Key</span>
              <input value={accessKeyId} onChange={e => setAccessKeyId(e.target.value)} autoComplete="off" className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none" placeholder={status.hasCredentials ? '留空不变' : ''} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] text-gray-500">Secret Key</span>
              <input value={secretAccessKey} onChange={e => setSecretAccessKey(e.target.value)} type="password" autoComplete="off" className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none" placeholder={status.hasCredentials ? '留空不变' : ''} />
            </label>
          </div>
          <label className="flex items-center gap-2 rounded-xl bg-[#F8FAFF] px-3 py-2.5">
            <input type="checkbox" checked={forcePathStyle} onChange={e => setForcePathStyle(e.target.checked)} />
            <span className="text-[13px] text-gray-500">Path-style URL</span>
          </label>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#3370FF] text-[14px] font-medium text-white shadow-sm disabled:opacity-40"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : '保存配置'}
        </button>
      </div>

      {message && (
        <div className="rounded-2xl bg-white px-4 py-3 text-[13px] text-[#1A3A8F] shadow-sm">
          {message}
        </div>
      )}

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 text-[15px] font-medium text-gray-800">备份历史</div>
        {runs.length === 0 ? (
          <div className="rounded-xl bg-[#F8FAFF] px-3 py-3 text-[12px] text-gray-400">暂无记录</div>
        ) : (
          <div className="space-y-3">
            {runs.map(run => {
              const ok = run.status === 'success';
              return (
                <div key={run.id} className="flex gap-3">
                  <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                    {ok ? <CheckCircle size={15} /> : <XCircle size={15} />}
                  </span>
                  <div className="min-w-0 flex-1 rounded-xl bg-[#F8FAFF] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-[13px] font-medium text-gray-700">{run.fileName || run.provider}</span>
                      <span className="shrink-0 text-[11px] text-gray-400">{formatTime(run.startedAt)}</span>
                    </div>
                    <div className="mt-1 truncate text-[12px] text-gray-400">
                      {ok ? `${run.provider.toUpperCase()} · ${formatBytes(run.sizeBytes)}` : run.error}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

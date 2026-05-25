'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, EyeOff, Loader2, Save, Trash2 } from 'lucide-react';

// ─── Info tip ───────────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close, { once: true });
    document.addEventListener('scroll', close, { once: true, capture: true });
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, { capture: true });
    };
  }, [open]);

  const left = typeof window !== 'undefined'
    ? Math.max(8, Math.min(pos.x - 110, window.innerWidth - 228))
    : pos.x - 110;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        className="ml-1 inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold text-gray-400"
        aria-label="说明"
      >
        i
      </button>
      {open && (
        <span
          className="fixed z-50 w-[220px] rounded-2xl bg-white px-3.5 py-3 text-[12px] leading-[1.6] text-gray-600 shadow-xl ring-1 ring-black/8"
          style={{ left, top: pos.y - 8, transform: 'translateY(-100%)' }}
          onClick={e => e.stopPropagation()}
        >
          {text}
        </span>
      )}
    </>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type AIConfigStatus = {
  enabled: boolean;
  provider: string;
  apiStyle: 'openai-chat';
  baseUrl: string;
  model: string;
  rulesPrompt: string;
  hasApiKey: boolean;
  updatedAt: string | null;
};

type PresetSummary = {
  id: string;
  notes: string;
  provider: string;
  baseUrl: string;
  model: string;
  rulesPrompt: string;
  hasApiKey: boolean;
  createdAt: string;
};

const providerOptions = [
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { value: 'openai',   label: 'OpenAI',   baseUrl: 'https://api.openai.com/v1' },
  { value: 'custom',   label: '自定义',   baseUrl: '' },
];

function providerLabel(provider: string, baseUrl: string): string {
  if (provider === 'deepseek') return 'DeepSeek';
  if (provider === 'openai') return 'OpenAI';
  try { return new URL(baseUrl).hostname; } catch { return provider || '自定义'; }
}

const CUSTOM_MODEL = '__custom__';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AIConfigPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AIConfigStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('');
  const [rulesPrompt, setRulesPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [validated, setValidated] = useState(false);

  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetNotes, setPresetNotes] = useState('');

  const modelInList = fetchedModels.includes(model);
  const selectValue = modelInList ? model : CUSTOM_MODEL;
  const showSelect = fetchedModels.length > 0;
  const showTextInput = !showSelect || selectValue === CUSTOM_MODEL;

  const applyStatus = (next: AIConfigStatus) => {
    setStatus(next);
    setEnabled(next.enabled);
    setProvider(next.provider);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
    setRulesPrompt(next.rulesPrompt);
    setApiKey('');
    setSelectedPresetId(null);
    setValidated(false);
    setFetchedModels([]);
  };

  const callApi = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/settings/ai-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.message || '操作失败');
    return data;
  };

  useEffect(() => {
    let active = true;
    setBusy(true);
    Promise.all([
      callApi({ action: 'status' }),
      callApi({ action: 'list-presets' }),
    ]).then(([statusData, presetsData]) => {
      if (!active) return;
      applyStatus(statusData.status);
      setPresets(presetsData.presets ?? []);
    }).catch(error => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : '加载失败。');
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, []);

  const changeProvider = (value: string) => {
    setProvider(value);
    const opt = providerOptions.find(item => item.value === value);
    if (opt && value !== 'custom') setBaseUrl(opt.baseUrl);
    setFetchedModels([]);
    setValidated(false);
  };

  // Validate key + fetch models in one action
  const validateAndFetch = async () => {
    setBusy(true);
    setMessage('');
    setValidated(false);
    const isKeyPlaceholder = apiKey === '****';
    const shared = {
      baseUrl,
      apiKey: isKeyPlaceholder ? '' : apiKey,
      presetId: isKeyPlaceholder && selectedPresetId ? selectedPresetId : undefined,
    };
    try {
      // Try /models endpoint first
      const resp = await fetch('/api/settings/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch-models', ...shared }),
      });
      const modelsData = await resp.json() as { ok: boolean; models?: string[]; message?: string };

      if (modelsData.ok && modelsData.models && modelsData.models.length > 0) {
        setFetchedModels(modelsData.models);
        if (!modelsData.models.includes(model)) setModel(modelsData.models[0] ?? '');
        setValidated(true);
        setMessage(`验证成功，共 ${modelsData.models.length} 个可用模型。`);
      } else {
        // Provider doesn't expose /models — fall back to a chat test
        const testData = await callApi({ action: 'test', provider, model, ...shared })
          .catch((e: Error) => ({ ok: false, message: e.message }));
        setValidated(testData.ok === true);
        setMessage(
          testData.ok
            ? `${testData.message}（该接口不返回模型列表，请手动填写模型名）`
            : (modelsData.message ?? testData.message ?? '验证失败'),
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '验证失败。');
    } finally {
      setBusy(false);
    }
  };

  const loadPreset = (preset: PresetSummary) => {
    setProvider(preset.provider);
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
    setRulesPrompt(preset.rulesPrompt);
    setApiKey(preset.hasApiKey ? '****' : '');
    setSelectedPresetId(preset.id);
    setValidated(false);
    setFetchedModels([]);
    setMessage(`已载入预设 ${preset.id}${preset.notes ? ' · ' + preset.notes : ''}，确认后点保存生效。`);
  };

  const save = async () => {
    setBusy(true);
    setMessage('');
    const isKeyPlaceholder = apiKey === '****';
    try {
      const data = await callApi({
        action: 'save',
        enabled: enabled || Boolean(apiKey.trim() && !isKeyPlaceholder),
        provider,
        baseUrl,
        model,
        rulesPrompt,
        apiKey: isKeyPlaceholder ? '' : apiKey,
        presetId: isKeyPlaceholder && selectedPresetId ? selectedPresetId : undefined,
      });
      applyStatus(data.status);
      router.refresh();
      setMessage(data.status.enabled ? '已保存，聊天会调用 AI。' : '已保存，AI 开关仍关闭。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setBusy(false);
    }
  };

  const savePreset = async () => {
    setBusy(true);
    setMessage('');
    const isKeyPlaceholder = apiKey === '****';
    try {
      const data = await callApi({
        action: 'save-preset',
        notes: presetNotes,
        provider,
        baseUrl,
        model,
        rulesPrompt,
        apiKey: isKeyPlaceholder ? '' : apiKey,
        presetId: isKeyPlaceholder && selectedPresetId ? selectedPresetId : undefined,
      });
      setPresets(prev => [...prev, data.preset]);
      setPresetNotes('');
      setShowSavePreset(false);
      setMessage(`预设 ${data.preset.id} 已保存。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存预设失败。');
    } finally {
      setBusy(false);
    }
  };

  const deletePreset = async (id: string) => {
    setBusy(true);
    setMessage('');
    try {
      await callApi({ action: 'delete-preset', id });
      setPresets(prev => prev.filter(p => p.id !== id));
      if (selectedPresetId === id) { setSelectedPresetId(null); setApiKey(''); }
      setDeleteConfirmId(null);
      setMessage(`预设 ${id} 已删除。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-2xl md:px-6 md:py-5">
        <div className="flex items-center bg-white px-4 pb-4 pt-5 shadow-sm md:rounded-2xl">
          <Link href="/settings/developer" className="mr-3 p-1 text-gray-400">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-[17px] font-semibold text-[#1A3A8F]">AI 助手配置</h1>
        </div>

        <div className="space-y-3 px-3 py-3 md:px-0">

          {/* ── Presets ── */}
          {presets.length > 0 && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-3 text-[13px] font-semibold text-gray-700">已保存预设</div>
              <div className="space-y-2">
                {presets.map(preset => (
                  <div
                    key={preset.id}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${selectedPresetId === preset.id ? 'bg-[#EBF0FF]' : 'bg-[#F0F4FA]'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[12px] text-[#3370FF]">{preset.id}</span>
                        {preset.notes && <span className="truncate text-[13px] text-gray-500">· {preset.notes}</span>}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-gray-400">
                        {preset.model}{preset.hasApiKey ? ' · Key: ****' : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadPreset(preset)}
                      className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-[#3370FF] shadow-sm"
                    >
                      加载
                    </button>
                    {deleteConfirmId === preset.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => deletePreset(preset.id)}
                          disabled={busy}
                          className="rounded-lg bg-red-500 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
                        >
                          确认删除
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="rounded-lg bg-white px-2 py-1.5 text-[12px] text-gray-400 shadow-sm"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(preset.id)}
                        className="shrink-0 rounded-lg bg-white p-1.5 text-gray-400 shadow-sm"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Main form ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">

            {/* AI toggle */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[15px] font-semibold text-gray-800">AI 开关</div>
                <div className="mt-0.5 text-[12px] text-gray-400">
                  {!status
                    ? '加载中…'
                    : status.enabled && status.hasApiKey
                      ? `目前生效：${providerLabel(status.provider, status.baseUrl)} · ${status.model}`
                      : status.enabled
                        ? '目前生效：开关已开，但缺少 API Key'
                        : status.hasApiKey
                          ? `目前关闭（已配置 ${providerLabel(status.provider, status.baseUrl)} · ${status.model}）`
                          : '目前已关闭，尚未配置'
                  }
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabled(v => !v)}
                className={`relative h-7 w-[52px] rounded-full transition-colors ${enabled ? 'bg-[#3370FF]' : 'bg-gray-200'}`}
              >
                <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>

            {status?.hasApiKey && !enabled && (
              <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-700">
                API Key 已保存，但 AI 开关还没打开。
              </div>
            )}

            <div className="grid gap-3">

              {/* Provider */}
              <label className="grid gap-1.5">
                <span className="text-[13px] font-medium text-gray-600">服务商 Provider</span>
                <select
                  value={provider}
                  onChange={e => changeProvider(e.target.value)}
                  className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none"
                >
                  {providerOptions.map(item => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              {/* Base URL */}
              <label className="grid gap-1.5">
                <span className="flex items-center text-[13px] font-medium text-gray-600">
                  接口地址 Base URL
                  <InfoTip text="服务商提供的接口根地址，需兼容 OpenAI Chat Completions 格式。DeepSeek 填 https://api.deepseek.com 即可。" />
                </span>
                <input
                  value={baseUrl}
                  onChange={e => { setBaseUrl(e.target.value); setFetchedModels([]); setValidated(false); }}
                  className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none"
                  placeholder="https://api.deepseek.com"
                />
              </label>

              {/* API Key + 获取模型 */}
              <div className="grid gap-1.5">
                <span className="flex items-center justify-between text-[13px] font-medium text-gray-600">
                  <span className="flex items-center">
                    密钥 API Key
                    <InfoTip text="加密保存在服务器本地，不会随代码提交到 GitHub，也不会再次显示在页面里。" />
                  </span>
                  {status?.hasApiKey && (
                    <span className="flex items-center gap-1 text-[12px] font-normal text-gray-400">
                      <EyeOff size={12} />已配置
                    </span>
                  )}
                </span>
                <div className="flex gap-2">
                  <input
                    value={apiKey}
                    onChange={e => {
                      setApiKey(e.target.value);
                      if (e.target.value !== '****') setSelectedPresetId(null);
                      setValidated(false);
                    }}
                    type="password"
                    autoComplete="off"
                    className="h-11 min-w-0 flex-1 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none"
                    placeholder={status?.hasApiKey ? '留空则保留原 Key' : '填入 API Key'}
                  />
                  <button
                    type="button"
                    onClick={validateAndFetch}
                    disabled={!baseUrl || busy}
                    className={`h-11 shrink-0 rounded-xl px-4 text-[13px] font-medium transition-colors disabled:opacity-40 ${
                      validated
                        ? 'bg-green-100 text-green-700'
                        : 'bg-[#EBF0FF] text-[#3370FF]'
                    }`}
                  >
                    {busy
                      ? <Loader2 size={14} className="animate-spin" />
                      : validated ? '✓ 已验证' : '获取模型'
                    }
                  </button>
                </div>
              </div>

              {/* Model */}
              <div className="grid gap-1.5">
                <span className="text-[13px] font-medium text-gray-600">模型 Model</span>
                {showSelect && (
                  <select
                    value={selectValue}
                    onChange={e => {
                      if (e.target.value !== CUSTOM_MODEL) setModel(e.target.value);
                    }}
                    className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none"
                  >
                    {fetchedModels.map(m => <option key={m} value={m}>{m}</option>)}
                    <option value={CUSTOM_MODEL}>手动输入…</option>
                  </select>
                )}
                {showTextInput && (
                  <input
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none"
                    placeholder="deepseek-chat"
                  />
                )}
              </div>

              {/* Message (shown between model and prompt) */}
              {message && (
                <div className={`rounded-xl px-3 py-2.5 text-[12px] leading-5 ${
                  validated
                    ? 'bg-green-50 text-green-700'
                    : message.includes('失败') || message.includes('不正确')
                      ? 'bg-red-50 text-red-600'
                      : 'bg-[#F0F4FA] text-gray-600'
                }`}>
                  {message}
                </div>
              )}

              {/* Prompt (last) */}
              <label className="grid gap-1.5">
                <span className="flex items-center text-[13px] font-medium text-gray-600">
                  规则提示词 Prompt
                  <InfoTip text="填写 AI 助手的表达风格和业务口径，例如回答语气、日期格式偏好等。安全限制、数据查询和页面跳转逻辑由后端固定控制，不受此处影响。" />
                </span>
                <textarea
                  value={rulesPrompt}
                  onChange={e => setRulesPrompt(e.target.value)}
                  rows={8}
                  className="min-h-38 resize-y rounded-xl bg-[#F0F4FA] px-3 py-3 text-[13px] leading-5 text-gray-800 outline-none placeholder:text-gray-400"
                  placeholder={'回答必须简短，先说结论。\n问异常时，休息日不算异常。\n没有数据就说未查询到。'}
                />
              </label>

            </div>

            {/* Save button */}
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="flex h-11 items-center gap-2 rounded-xl bg-[#3370FF] px-10 text-[14px] font-semibold text-white shadow-sm disabled:opacity-40"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                保存配置
              </button>
            </div>

            {status?.updatedAt && (
              <div className="mt-2 text-center text-[11px] text-gray-400">
                上次保存：{new Date(status.updatedAt).toLocaleString('zh-CN')}
              </div>
            )}

            {/* Save as preset */}
            <div className="mt-4 border-t border-gray-50 pt-3">
              {!showSavePreset ? (
                <button
                  type="button"
                  onClick={() => setShowSavePreset(true)}
                  className="w-full rounded-xl bg-[#F0F4FA] py-2.5 text-[13px] font-medium text-gray-500"
                >
                  另存为预设…
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={presetNotes}
                    onChange={e => setPresetNotes(e.target.value)}
                    placeholder="备注（可选）"
                    className="h-10 flex-1 rounded-xl bg-[#F0F4FA] px-3 text-[13px] text-gray-800 outline-none"
                  />
                  <button
                    type="button"
                    onClick={savePreset}
                    disabled={busy}
                    className="h-10 rounded-xl bg-[#3370FF] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSavePreset(false); setPresetNotes(''); }}
                    className="h-10 rounded-xl bg-[#F0F4FA] px-3 text-[13px] text-gray-400"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

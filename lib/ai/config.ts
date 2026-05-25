import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IronSession } from 'iron-session';
import { getSession, type SessionData } from '@/lib/session';
import { isVirtualDbEnabled } from '@/lib/virtualDb';

export type AIProviderConfig = {
  enabled: boolean;
  provider: string;
  apiStyle: 'openai-chat';
  baseUrl: string;
  model: string;
  rulesPrompt: string;
  apiKey?: string;
};

export type AIConfigStatus = Omit<AIProviderConfig, 'apiKey'> & {
  hasApiKey: boolean;
  updatedAt: string | null;
};

export type AIAvailability = {
  enabled: boolean;
  hasApiKey: boolean;
  baseUrl: string;
  model: string;
};

export type PresetEntry = {
  id: string;
  notes: string;
  provider: string;
  baseUrl: string;
  model: string;
  rulesPrompt: string;
  encryptedApiKey?: string;
  apiKeyIv?: string;
  apiKeyTag?: string;
  createdAt: string;
};

export type PresetSummary = Omit<PresetEntry, 'encryptedApiKey' | 'apiKeyIv' | 'apiKeyTag'> & {
  hasApiKey: boolean;
};

type StoredAIConfig = Omit<AIProviderConfig, 'apiKey'> & {
  encryptedApiKey?: string;
  apiKeyIv?: string;
  apiKeyTag?: string;
  updatedAt: string;
  presets?: PresetEntry[];
};

export type AIConfigSession = IronSession<SessionData>;

const DEV_PASSWORD_SALT = 'clockin-ai-dev-v1';
const CONFIG_PATH = path.join(process.cwd(), '.runtime', 'ai-config.json');

const DEFAULT_CONFIG: StoredAIConfig = {
  enabled: true,
  provider: 'deepseek',
  apiStyle: 'openai-chat',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  rulesPrompt: [
    '回答必须简短，先说结论。',
    '只能依据 facts 回答，没有数据就说未查询到。',
    '问异常时，休息日和节假日不算异常。',
    '问请假最多时，只统计 status=leave。',
    '日期超过 5 个时只列前 5 个，然后说“等”。',
    '本年度内日期不要写年份，用“4月2号”；同月多个日期写“4月2号、3号、8号”。',
    '休勤、休息日、漏录、异常和月度工时问题，优先给“打开月度工资”或“看工资条”动作。',
    '如果用户说“这几个人”“刚才那些人”“按刚才的”，必须结合最近上下文继续回答，不要重新反问。',
  ].join('\n'),
  updatedAt: '',
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function encryptionSecret() {
  const secret = process.env.AI_CONFIG_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'development') return 'clockin-local-dev-only-not-for-production';
    throw new Error('AI_CONFIG_SECRET or SESSION_SECRET must be set');
  }
  return secret;
}

function encryptionKey() {
  return scryptSync(encryptionSecret(), 'clockin-ai-config', 32);
}

function encryptValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedApiKey: encrypted.toString('base64'),
    apiKeyIv: iv.toString('base64'),
    apiKeyTag: tag.toString('base64'),
  };
}

function decryptValue(config: StoredAIConfig) {
  if (!config.encryptedApiKey || !config.apiKeyIv || !config.apiKeyTag) return undefined;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(config.apiKeyIv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(config.apiKeyTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(config.encryptedApiKey, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

async function resolveSession(session?: AIConfigSession): Promise<AIConfigSession | undefined> {
  if (!isVirtualDbEnabled()) return undefined;
  return session ?? getSession();
}

function storedFromSession(session: AIConfigSession): StoredAIConfig {
  const stored = session.aiConfig;
  if (!stored) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    enabled: stored.enabled,
    provider: stored.provider || DEFAULT_CONFIG.provider,
    apiStyle: 'openai-chat',
    baseUrl: stored.baseUrl || DEFAULT_CONFIG.baseUrl,
    model: stored.model || DEFAULT_CONFIG.model,
    rulesPrompt: stored.rulesPrompt ?? DEFAULT_CONFIG.rulesPrompt,
    updatedAt: stored.updatedAt || '',
  };
}

function apiKeyFromStoredConfig(config: StoredAIConfig, session?: AIConfigSession): string | undefined {
  if (isVirtualDbEnabled()) return session?.aiConfig?.apiKey;
  return decryptValue(config);
}

export function verifyDeveloperPassword(password: string) {
  const envPassword = process.env.DEV_PASSWORD;
  const actual = Buffer.from(sha256(`${DEV_PASSWORD_SALT}:${password}`), 'hex');
  // If DEV_PASSWORD is set in env, compare against its hash; otherwise fall back to nothing (deny all)
  if (!envPassword) return false;
  const expected = Buffer.from(sha256(`${DEV_PASSWORD_SALT}:${envPassword}`), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readStoredConfig(session?: AIConfigSession): Promise<StoredAIConfig> {
  const runtimeSession = await resolveSession(session);
  if (runtimeSession) return storedFromSession(runtimeSession);

  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function getAIConfigStatus(session?: AIConfigSession): Promise<AIConfigStatus> {
  const runtimeSession = await resolveSession(session);
  const config = await readStoredConfig(runtimeSession);
  const envHasKey = Boolean(process.env.AI_API_KEY);
  return {
    enabled: config.enabled || process.env.AI_ENABLED === 'true',
    provider: process.env.AI_PROVIDER || config.provider,
    apiStyle: 'openai-chat',
    baseUrl: process.env.AI_BASE_URL || config.baseUrl,
    model: process.env.AI_MODEL || config.model,
    rulesPrompt: config.rulesPrompt,
    hasApiKey: envHasKey || Boolean(apiKeyFromStoredConfig(config, runtimeSession) || config.encryptedApiKey),
    updatedAt: config.updatedAt || null,
  };
}

export async function getAIProviderConfig(session?: AIConfigSession): Promise<AIProviderConfig | null> {
  const runtimeSession = await resolveSession(session);
  const stored = await readStoredConfig(runtimeSession);
  const apiKey = process.env.AI_API_KEY || apiKeyFromStoredConfig(stored, runtimeSession);
  const enabled = stored.enabled || process.env.AI_ENABLED === 'true';
  const baseUrl = process.env.AI_BASE_URL || stored.baseUrl;
  const model = process.env.AI_MODEL || stored.model;

  if (!enabled || !apiKey || !baseUrl || !model) return null;

  return {
    enabled,
    provider: process.env.AI_PROVIDER || stored.provider,
    apiStyle: 'openai-chat',
    baseUrl,
    model,
    rulesPrompt: stored.rulesPrompt,
    apiKey,
  };
}

export async function getAIAvailability(session?: AIConfigSession): Promise<AIAvailability> {
  const runtimeSession = await resolveSession(session);
  const stored = await readStoredConfig(runtimeSession);
  return {
    enabled: stored.enabled || process.env.AI_ENABLED === 'true',
    hasApiKey: Boolean(process.env.AI_API_KEY || apiKeyFromStoredConfig(stored, runtimeSession) || stored.encryptedApiKey),
    baseUrl: process.env.AI_BASE_URL || stored.baseUrl,
    model: process.env.AI_MODEL || stored.model,
  };
}

export async function saveAIProviderConfig(input: {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  rulesPrompt: string;
  apiKey?: string;
  presetId?: string;
}, session?: AIConfigSession) {
  const runtimeSession = await resolveSession(session);
  const current = await readStoredConfig(runtimeSession);
  const provider = input.provider.trim() || 'custom';
  const baseUrl = input.baseUrl.trim();
  const model = input.model.trim();
  const rulesPrompt = input.rulesPrompt.trim();
  const updatedAt = new Date().toISOString();

  if (runtimeSession) {
    const preset = input.presetId
      ? runtimeSession.aiPresets?.find(item => item.id === input.presetId)
      : undefined;
    const apiKey = input.apiKey?.trim() || preset?.apiKey || runtimeSession.aiConfig?.apiKey;
    runtimeSession.aiConfig = {
      enabled: input.enabled,
      provider,
      apiStyle: 'openai-chat',
      baseUrl,
      model,
      rulesPrompt,
      apiKey,
      updatedAt,
    };
    await runtimeSession.save();
    return getAIConfigStatus(runtimeSession);
  }

  const next: StoredAIConfig = {
    ...current,
    enabled: input.enabled,
    provider,
    apiStyle: 'openai-chat',
    baseUrl,
    model,
    rulesPrompt,
    updatedAt,
  };

  if (input.apiKey?.trim()) {
    Object.assign(next, encryptValue(input.apiKey.trim()));
  } else if (input.presetId) {
    const preset = current.presets?.find(p => p.id === input.presetId);
    if (preset?.encryptedApiKey) {
      next.encryptedApiKey = preset.encryptedApiKey;
      next.apiKeyIv = preset.apiKeyIv;
      next.apiKeyTag = preset.apiKeyTag;
    }
  }

  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return getAIConfigStatus();
}

// ---- Preset helpers ----

function generatePresetId(existing: Array<{ id: string }>): string {
  const now = new Date();
  const prefix = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const todayCount = existing.filter(p => p.id.startsWith(prefix)).length;
  return `${prefix}${String(todayCount + 1).padStart(2, '0')}`;
}

export async function listPresets(session?: AIConfigSession): Promise<PresetSummary[]> {
  const runtimeSession = await resolveSession(session);
  if (runtimeSession) {
    return (runtimeSession.aiPresets ?? []).map(({ apiKey, ...rest }) => ({
      ...rest,
      hasApiKey: Boolean(apiKey),
    }));
  }

  const config = await readStoredConfig();
  return (config.presets ?? []).map(({ encryptedApiKey, apiKeyIv, apiKeyTag, ...rest }) => ({
    ...rest,
    hasApiKey: Boolean(encryptedApiKey),
  }));
}

export async function savePreset(input: {
  notes: string;
  provider: string;
  baseUrl: string;
  model: string;
  rulesPrompt: string;
  apiKey?: string;
  fromPresetId?: string;
}, session?: AIConfigSession): Promise<PresetSummary> {
  const runtimeSession = await resolveSession(session);
  if (runtimeSession) {
    const presets = runtimeSession.aiPresets ?? [];
    const source = input.fromPresetId ? presets.find(p => p.id === input.fromPresetId) : undefined;
    const apiKey = input.apiKey?.trim() || source?.apiKey;
    const entry = {
      id: generatePresetId(presets),
      notes: input.notes.trim(),
      provider: input.provider.trim() || 'custom',
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      rulesPrompt: input.rulesPrompt.trim(),
      apiKey,
      createdAt: new Date().toISOString(),
    };
    runtimeSession.aiPresets = [...presets, entry];
    await runtimeSession.save();
    const summary = {
      id: entry.id,
      notes: entry.notes,
      provider: entry.provider,
      baseUrl: entry.baseUrl,
      model: entry.model,
      rulesPrompt: entry.rulesPrompt,
      createdAt: entry.createdAt,
    };
    return { ...summary, hasApiKey: Boolean(apiKey) };
  }

  const config = await readStoredConfig();
  const presets = config.presets ?? [];
  const id = generatePresetId(presets);

  const entry: PresetEntry = {
    id,
    notes: input.notes.trim(),
    provider: input.provider.trim() || 'custom',
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
    rulesPrompt: input.rulesPrompt.trim(),
    createdAt: new Date().toISOString(),
  };

  if (input.apiKey?.trim()) {
    Object.assign(entry, encryptValue(input.apiKey.trim()));
  } else if (input.fromPresetId) {
    const source = presets.find(p => p.id === input.fromPresetId);
    if (source?.encryptedApiKey) {
      entry.encryptedApiKey = source.encryptedApiKey;
      entry.apiKeyIv = source.apiKeyIv;
      entry.apiKeyTag = source.apiKeyTag;
    }
  }

  const next: StoredAIConfig = { ...config, presets: [...presets, entry] };
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  const { encryptedApiKey, apiKeyIv, apiKeyTag, ...summary } = entry;
  return { ...summary, hasApiKey: Boolean(encryptedApiKey) };
}

export async function deletePreset(id: string, session?: AIConfigSession): Promise<void> {
  const runtimeSession = await resolveSession(session);
  if (runtimeSession) {
    runtimeSession.aiPresets = (runtimeSession.aiPresets ?? []).filter(p => p.id !== id);
    await runtimeSession.save();
    return;
  }

  const config = await readStoredConfig();
  const next: StoredAIConfig = {
    ...config,
    presets: (config.presets ?? []).filter(p => p.id !== id),
  };
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

export async function fetchAvailableModels(input: {
  baseUrl: string;
  apiKey?: string;
  presetId?: string;
}, session?: AIConfigSession): Promise<{ ok: true; models: string[] } | { ok: false; message: string }> {
  const runtimeSession = await resolveSession(session);
  const stored = await readStoredConfig(runtimeSession);

  let resolvedApiKey: string | undefined = process.env.AI_API_KEY || apiKeyFromStoredConfig(stored, runtimeSession);
  if (!input.apiKey && input.presetId) {
    if (runtimeSession) {
      resolvedApiKey = runtimeSession.aiPresets?.find(p => p.id === input.presetId)?.apiKey;
    } else {
      const preset = (stored.presets ?? []).find(p => p.id === input.presetId);
      if (preset) resolvedApiKey = decryptValue(preset as unknown as StoredAIConfig);
    }
  } else if (input.apiKey?.trim()) {
    resolvedApiKey = input.apiKey.trim();
  }

  const baseUrl = (input.baseUrl || process.env.AI_BASE_URL || stored.baseUrl).replace(/\/$/, '');
  if (!baseUrl || !resolvedApiKey) {
    return { ok: false, message: '需要先填写 Base URL 和 API Key。' };
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${resolvedApiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return { ok: false, message: `获取失败：HTTP ${response.status}` };
    }
    const data = await response.json() as { data?: Array<{ id?: unknown }> };
    if (!Array.isArray(data?.data)) {
      return { ok: false, message: '接口未返回标准模型列表，请手动输入。' };
    }
    const models = data.data
      .map(m => (typeof m.id === 'string' ? m.id : ''))
      .filter(Boolean)
      .sort();
    return { ok: true, models };
  } catch {
    return { ok: false, message: '请求失败，该 Provider 可能不支持 /models 接口，请手动输入。' };
  }
}

export async function testAIProviderConfig(input?: Partial<AIProviderConfig> & { presetId?: string }, session?: AIConfigSession) {
  const runtimeSession = await resolveSession(session);
  const stored = await readStoredConfig(runtimeSession);

  let resolvedApiKey: string | undefined = process.env.AI_API_KEY || apiKeyFromStoredConfig(stored, runtimeSession);
  if (!input?.apiKey && input?.presetId) {
    if (runtimeSession) {
      resolvedApiKey = runtimeSession.aiPresets?.find(p => p.id === input.presetId)?.apiKey;
    } else {
      const preset = (stored.presets ?? []).find(p => p.id === input.presetId);
      if (preset) resolvedApiKey = decryptValue(preset as unknown as StoredAIConfig);
    }
  }

  const saved = {
    enabled: stored.enabled,
    provider: process.env.AI_PROVIDER || stored.provider,
    apiStyle: 'openai-chat' as const,
    baseUrl: process.env.AI_BASE_URL || stored.baseUrl,
    model: process.env.AI_MODEL || stored.model,
    rulesPrompt: stored.rulesPrompt,
    apiKey: resolvedApiKey,
  };
  const { presetId: _pid, apiKey: inputApiKey, ...restProps } = input ?? {};
  const config = {
    ...saved,
    ...restProps,
    // Explicit apiKey in input takes priority; otherwise use the server-resolved key.
    // Never let undefined from the spread clobber the resolved key.
    apiKey: inputApiKey || resolvedApiKey,
  };

  if (!config?.apiKey || !config.baseUrl || !config.model) {
    return { ok: false, message: '还没有配置完整的 Base URL、模型和 API Key。' };
  }

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: '只回答 OK。' },
          { role: 'user', content: '测试连接' },
        ],
      }),
    });

    if (!response.ok) {
      return { ok: false, message: `连接失败：HTTP ${response.status}` };
    }

    return { ok: true, message: '连接成功。' };
  } catch {
    return { ok: false, message: '连接失败，请检查网络、Base URL 或 API Key。' };
  }
}

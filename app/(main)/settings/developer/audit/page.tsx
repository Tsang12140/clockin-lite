import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { listAuditFingerprints, listAuditLogs, type AuditFingerprintItem, type AuditLogItem } from '@/lib/audit';
import { saveAuditNote } from './actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{ view?: string; filter?: string }>;
};

type LogFilter = 'all' | 'important' | 'modify' | 'visit' | 'ai' | 'error';

const IMPORTANT_ACTIONS = new Set([
  'save_attendance',
  'unlock_attendance',
  'clear_attendance',
  'create_employee',
  'update_employee',
  'update_employee_aliases',
  'add_rate_history',
  'mark_employee_inactive',
  'developer_unlock',
  'save_ai_config',
  'save_ai_preset',
  'delete_ai_preset',
]);

const VISIT_ACTIONS = new Set(['page_view']);
const ACCOUNT_ACTIONS = new Set(['login', 'logout']);
const ERROR_ACTIONS = new Set(['client_error', 'ai_error']);
const AI_ACTIONS = new Set(['ai_request', 'ai_response']);
const LOW_SIGNAL_ACTIONS = new Set(['ui_click', 'page_duration']);
const MODIFY_ACTIONS = new Set([
  'save_attendance',
  'unlock_attendance',
  'clear_attendance',
  'create_employee',
  'update_employee',
  'update_employee_aliases',
  'add_rate_history',
  'mark_employee_inactive',
  'save_ai_config',
  'save_ai_preset',
  'delete_ai_preset',
]);
const RISK_ACTIONS = new Set([
  'unlock_attendance',
  'clear_attendance',
  'add_rate_history',
  'mark_employee_inactive',
  'save_ai_config',
  'delete_ai_preset',
]);

const FILTERS: Array<{ value: LogFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'important', label: '重要操作' },
  { value: 'modify', label: '修改记录' },
  { value: 'visit', label: '登录访问' },
  { value: 'ai', label: 'AI' },
  { value: 'error', label: '错误' },
];

function shortPhone(phone: string | null) {
  if (!phone) return null;
  return phone.length > 4 ? phone.slice(-4) : phone;
}

function shortCity(city: string | null) {
  if (!city || city === '未知') return '未知城市';
  return city
    .replace(/市/g, '')
    .replace(/省/g, '')
    .replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区/g, '');
}

function deviceType(device: string | null) {
  if (!device) return '未知设备';
  return device.split('·')[0]?.trim() || device;
}

function pageName(pageUrl: string | null) {
  if (!pageUrl) return '未知页面';
  if (pageUrl === '/') return '首页';
  if (pageUrl.startsWith('/salary/')) return '工资条';
  if (pageUrl.startsWith('/salary')) return '月度工资';
  if (pageUrl.startsWith('/employees/')) return '员工详情';
  if (pageUrl.startsWith('/employees')) return '员工管理';
  if (pageUrl.startsWith('/settings/developer/audit')) return '操作日志';
  if (pageUrl.startsWith('/settings/developer/ai-config')) return 'AI 配置';
  if (pageUrl.startsWith('/settings/developer')) return '开发人员选项';
  if (pageUrl.startsWith('/settings')) return '设置';
  if (pageUrl.startsWith('/login')) return '登录页';
  return pageUrl;
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Math.max(0, Date.now() - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  if (diff < minute) return '刚刚';
  if (diff < 2 * hour) {
    return diff < hour ? `${Math.floor(diff / minute)} 分钟前` : '1 小时前';
  }

  const now = new Date();
  const time = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((todayOnly - dateOnly) / (24 * hour));

  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `昨天 ${time}`;
  if (dayDiff === 2) return `前天 ${time}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function actorName(item: Pick<AuditFingerprintItem, 'note' | 'userPhone' | 'device' | 'city'>) {
  if (item.note) return item.note;
  const tail = shortPhone(item.userPhone);
  return [tail ? `尾号${tail}` : '未知账号', deviceType(item.device), shortCity(item.city)].join(' · ');
}

function actionTarget(label: string) {
  return label.includes('：') ? label.split('：').slice(1).join('：') : '';
}

function eventSentence(log: AuditLogItem) {
  const actor = actorName(log);
  const target = actionTarget(log.actionLabel);
  switch (log.action) {
    case 'login':
      return { tag: '登录', text: `${actor} 登录了系统` };
    case 'logout':
      return { tag: '退出', text: `${actor} 退出了系统` };
    case 'page_view':
      return { tag: '访问', text: `${actor} 打开了${pageName(log.pageUrl)}` };
    case 'page_duration':
      return { tag: '停留', text: `${actor} 在${pageName(log.pageUrl)}停留了一会` };
    case 'ui_click':
      return { tag: '点击', text: `${actor} ${log.actionLabel}` };
    case 'developer_unlock':
      return { tag: '开发', text: `${actor} 进入了开发人员选项` };
    case 'save_attendance':
      return { tag: '工时', text: `${actor} 登记了工时${target ? `：${target}` : ''}` };
    case 'unlock_attendance':
      return { tag: '解锁', text: `${actor} 解锁了工时${target ? `：${target}` : ''}` };
    case 'clear_attendance':
      return { tag: '清空', text: `${actor} 清空了工时${target ? `：${target}` : ''}` };
    case 'create_employee':
      return { tag: '新增', text: `${actor} 新增了员工${target ? `：${target}` : ''}` };
    case 'update_employee':
      return { tag: '员工', text: `${actor} 修改了员工资料${target ? `：${target}` : ''}` };
    case 'update_employee_aliases':
      return { tag: '花名', text: `${actor} 修改了员工花名${target ? `：${target}` : ''}` };
    case 'add_rate_history':
      return { tag: '工资', text: `${actor} 修改了工资${target ? `：${target}` : ''}` };
    case 'mark_employee_inactive':
      return { tag: '离职', text: `${actor} 标记了员工离职${target ? `：${target}` : ''}` };
    case 'save_ai_config':
      return { tag: 'AI配置', text: `${actor} 修改了 AI 配置` };
    case 'save_ai_preset':
      return { tag: 'AI预设', text: `${actor} 保存了 AI 预设` };
    case 'delete_ai_preset':
      return { tag: '删除', text: `${actor} 删除了 AI 预设` };
    case 'ai_request':
      return { tag: 'AI', text: `${actor} 向 AI 提问` };
    case 'ai_response':
      return { tag: 'AI', text: 'AI 完成了回复' };
    case 'ai_error':
      return { tag: '错误', text: 'AI 请求失败，可能需要查看接口' };
    case 'client_error':
      return { tag: '错误', text: `${actor} 遇到了前端报错` };
    default:
      return { tag: '事件', text: `${actor} 触发了${log.actionLabel || '未知事件'}` };
  }
}

function eventTone(action: string) {
  if (ERROR_ACTIONS.has(action)) {
    return {
      border: 'border-red-200 border-l-red-500',
      bg: 'bg-red-50/70',
      icon: 'bg-white',
      text: 'text-red-700',
      badge: 'bg-red-100 text-red-700',
      flag: '风险',
    };
  }
  if (RISK_ACTIONS.has(action)) {
    return {
      border: 'border-amber-200 border-l-amber-500',
      bg: 'bg-amber-50/80',
      icon: 'bg-white',
      text: 'text-amber-900',
      badge: 'bg-amber-100 text-amber-800',
      flag: '重要',
    };
  }
  if (IMPORTANT_ACTIONS.has(action)) {
    return {
      border: 'border-[#BFD0FF] border-l-[#3370FF]',
      bg: 'bg-[#F2F6FF]',
      icon: 'bg-[#EBF0FF]',
      text: 'text-[#1A3A8F]',
      badge: 'bg-[#E4ECFF] text-[#1A3A8F]',
      flag: '重要',
    };
  }
  if (ACCOUNT_ACTIONS.has(action)) {
    return {
      border: 'border-green-100 border-l-green-300',
      bg: 'bg-white',
      icon: 'bg-green-50',
      text: 'text-green-700',
      badge: 'bg-green-50 text-green-700',
      flag: '',
    };
  }
  return {
    border: 'border-gray-100 border-l-gray-200',
    bg: 'bg-white',
    icon: 'bg-gray-50',
    text: 'text-gray-700',
    badge: 'bg-gray-100 text-gray-500',
    flag: '',
  };
}

function buildStats(logs: AuditLogItem[], fingerprints: AuditFingerprintItem[]) {
  const todayLogs = logs.filter(log => isToday(log.createdAt));
  return [
    { label: '今日事件', value: todayLogs.length },
    { label: '活跃设备', value: new Set(todayLogs.map(log => log.fingerprintId)).size || fingerprints.length },
    { label: 'AI 请求', value: todayLogs.filter(log => log.action === 'ai_request').length },
    { label: '可能 bug', value: todayLogs.filter(log => ERROR_ACTIONS.has(log.action)).length },
  ];
}

function Stats({ logs, fingerprints }: { logs: AuditLogItem[]; fingerprints: AuditFingerprintItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {buildStats(logs, fingerprints).map(item => (
        <div key={item.label} className="rounded-xl border border-white bg-white/80 px-3 py-3 shadow-sm">
          <div className="text-[12px] font-normal text-gray-400">{item.label}</div>
          <div className="mt-1 text-[20px] font-medium text-[#1A3A8F]">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function topItem<T>(items: T[], label: (item: T) => string | null) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = label(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
}

function featureName(log: AuditLogItem) {
  if (log.action.startsWith('ai_')) return 'AI 助手';
  if (log.action === 'save_attendance' || log.action === 'unlock_attendance' || log.action === 'clear_attendance') return '今日录入';
  if (log.action.includes('employee')) return '员工管理';
  if (log.action === 'add_rate_history') return '员工工资';
  return pageName(log.pageUrl);
}

function validFilter(value: string | undefined): LogFilter {
  return FILTERS.some(item => item.value === value) ? value as LogFilter : 'all';
}

function logTime(log: AuditLogItem) {
  const time = new Date(log.createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isLoginFollowedPageView(log: AuditLogItem, logs: AuditLogItem[]) {
  if (log.action !== 'page_view') return false;
  if (log.pageUrl !== '/') return false;
  const time = logTime(log);
  return logs.some(item => (
    item.fingerprintId === log.fingerprintId
    && item.action === 'login'
    && time >= logTime(item)
    && time - logTime(item) <= 5000
  ));
}

function shouldShowForFilter(log: AuditLogItem, filter: LogFilter, logs: AuditLogItem[]) {
  if (isLoginFollowedPageView(log, logs)) return false;

  if (filter === 'important') return IMPORTANT_ACTIONS.has(log.action) || ERROR_ACTIONS.has(log.action);
  if (filter === 'modify') return MODIFY_ACTIONS.has(log.action);
  if (filter === 'visit') return ACCOUNT_ACTIONS.has(log.action) || VISIT_ACTIONS.has(log.action);
  if (filter === 'ai') return AI_ACTIONS.has(log.action) || log.action === 'ai_error';
  if (filter === 'error') return ERROR_ACTIONS.has(log.action);

  if (LOW_SIGNAL_ACTIONS.has(log.action)) return false;
  if (log.action === 'ai_response') return false;
  return true;
}

function displayLogs(logs: AuditLogItem[], filter: LogFilter) {
  const seenPageViews = new Map<string, number>();
  return logs.filter(log => {
    if (!shouldShowForFilter(log, filter, logs)) return false;
    if (log.action !== 'page_view') return true;

    const key = `${log.fingerprintId}|${log.pageUrl ?? ''}`;
    const time = logTime(log);
    const last = seenPageViews.get(key);
    if (last && Math.abs(last - time) <= 30000) return false;
    seenPageViews.set(key, time);
    return true;
  });
}

function buildInsights(logs: AuditLogItem[]) {
  const todayLogs = logs.filter(log => isToday(log.createdAt));
  const scope = todayLogs.length > 0 ? todayLogs : logs;
  const peak = topItem(scope, log => {
    const date = new Date(log.createdAt);
    return Number.isNaN(date.getTime()) ? null : `${date.getHours()} 点`;
  });
  const feature = topItem(scope.filter(log => log.action !== 'page_duration'), featureName);
  const aiRequests = scope.filter(log => log.action === 'ai_request').length;
  const errors = scope.filter(log => ERROR_ACTIONS.has(log.action));

  return [
    { label: '高峰时段', value: peak ? `${peak[0]} · ${peak[1]} 次` : '暂无' },
    { label: '高需求功能', value: feature ? `${feature[0]} · ${feature[1]} 次` : '暂无' },
    { label: 'AI 使用', value: `${aiRequests} 次提问` },
    { label: '疑似 bug', value: errors.length > 0 ? `${errors.length} 次错误` : '暂无' },
  ];
}

function InsightPanel({ logs }: { logs: AuditLogItem[] }) {
  return (
    <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-[14px] font-medium text-gray-800">使用分析</h2>
        <div className="mt-0.5 text-[12px] font-normal text-gray-400">用来判断高峰时段、常用功能和可能的问题</div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {buildInsights(logs).map(item => (
          <div key={item.label} className="rounded-xl bg-[#F8FAFF] px-3 py-3">
            <div className="text-[12px] font-normal text-gray-400">{item.label}</div>
            <div className="mt-1 truncate text-[13px] font-medium text-[#1A3A8F]">{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilterTabs({ active }: { active: LogFilter }) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {FILTERS.map(item => (
        <Link
          key={item.value}
          href={item.value === 'all' ? '/settings/developer/audit' : `/settings/developer/audit?filter=${item.value}`}
          className={`shrink-0 rounded-full px-3 py-2 text-[13px] font-medium transition-colors ${
            active === item.value
              ? 'bg-[#3370FF] text-white shadow-sm'
              : 'bg-white text-[#1A3A8F] ring-1 ring-[#E4ECFF]'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function EventStream({ logs, filter }: { logs: AuditLogItem[]; filter: LogFilter }) {
  const filterLabel = FILTERS.find(item => item.value === filter)?.label ?? '全部';
  return (
    <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-medium text-gray-800">{filterLabel}</h2>
        <span className="text-[12px] font-normal text-gray-400">{logs.length} 条</span>
      </div>

      <div className="space-y-2">
        {logs.length === 0 && (
          <div className="rounded-xl bg-[#F8FAFF] px-3 py-8 text-center text-[13px] font-normal text-gray-400">
            暂无日志
          </div>
        )}
        {logs.map(log => {
          const sentence = eventSentence(log);
          const tone = eventTone(log.action);
          return (
            <div key={log.id} className={`flex gap-3 rounded-xl border border-l-4 ${tone.border} ${tone.bg} px-3 py-3`}>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.icon} text-[17px]`}>
                {log.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <div className={`min-w-0 flex-1 truncate text-[13px] font-medium ${tone.text}`}>{sentence.text}</div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
                    {sentence.tag}
                  </span>
                  {tone.flag && (
                    <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100">
                      {tone.flag}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] font-normal text-gray-400">
                  <span className="shrink-0">{relativeTime(log.createdAt)}</span>
                  <span className="shrink-0">·</span>
                  <span className="shrink-0">{shortCity(log.city)}</span>
                  <span className="shrink-0">·</span>
                  <span className="shrink-0">{deviceType(log.device)}</span>
                  <span className="shrink-0">·</span>
                  <span className="min-w-0 truncate">{pageName(log.pageUrl)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FingerprintList({ fingerprints }: { fingerprints: AuditFingerprintItem[] }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-medium text-gray-800">设备指纹</h2>
          <div className="mt-0.5 text-[12px] font-normal text-gray-400">有备注时只显示备注，展开后看完整信息</div>
        </div>
        <span className="text-[12px] font-normal text-gray-400">{fingerprints.length} 个</span>
      </div>

      <div className="space-y-2">
        {fingerprints.length === 0 && (
          <div className="rounded-xl bg-[#F8FAFF] px-3 py-8 text-center text-[13px] font-normal text-gray-400">
            暂无设备指纹
          </div>
        )}
        {fingerprints.map(item => (
          <details key={item.id} className="group rounded-xl border border-gray-100 bg-[#F8FAFF] p-3">
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[17px] shadow-sm">
                {item.emoji}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-800">
                {actorName(item)}
              </span>
              <ChevronRight size={16} className="shrink-0 text-gray-300 transition group-open:rotate-90" />
            </summary>

            <div className="mt-3 rounded-lg bg-white px-3 py-2 text-[12px] font-normal leading-6 text-gray-500">
              <div>账号：{item.userName || '未知'} {item.userPhone ? `/${item.userPhone}` : ''}</div>
              <div>位置：{item.city || '未知'} · {item.ip || '未知IP'}</div>
              <div>设备：{item.device || '未知设备'}</div>
              <div className="truncate">指纹：{item.id}</div>
            </div>

            <form action={saveAuditNote} className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={item.id} />
              <input
                name="note"
                defaultValue={item.note ?? ''}
                placeholder="备注，比如：老板手机"
                className="h-9 min-w-0 flex-1 rounded-lg bg-white px-3 text-[13px] font-normal text-gray-700 outline-none ring-1 ring-gray-100 focus:ring-[#3370FF]/30"
              />
              <button className={`h-9 rounded-lg px-3 text-[13px] font-medium ${
                item.note
                  ? 'bg-white text-[#1A3A8F] ring-1 ring-[#E4ECFF]'
                  : 'bg-[#3370FF] text-white'
              }`}>
                {item.note ? '修改' : '备注'}
              </button>
            </form>
          </details>
        ))}
      </div>
    </section>
  );
}

export default async function AuditPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view = params?.view === 'fingerprints' ? 'fingerprints' : 'logs';
  const filter = validFilter(params?.filter);
  const [fingerprints, logs] = await Promise.all([
    listAuditFingerprints(),
    listAuditLogs(),
  ]);
  const visibleLogs = displayLogs(logs, filter);

  return (
    <div className="audit-log-page min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-3xl md:px-6 md:py-5">
        <div className="flex items-center bg-white px-4 pb-4 pt-5 shadow-sm md:rounded-2xl">
          <Link href="/settings/developer" className="mr-3 p-1 text-gray-400">
            <ChevronLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-semibold text-[#1A3A8F]">操作日志</h1>
            <div className="mt-0.5 text-[12px] font-normal text-gray-400">用人话看登录、访问和关键操作</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {view === 'logs' && (
              <a
                href="/api/audit/export"
                download
                className="inline-flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-[13px] font-medium text-[#1A3A8F] ring-1 ring-[#E4ECFF]"
              >
                <Download size={14} />
                导出
              </a>
            )}
            <Link
              href={view === 'logs' ? '/settings/developer/audit?view=fingerprints' : '/settings/developer/audit'}
              className="rounded-lg bg-[#E8EEF8] px-3 py-2 text-[13px] font-medium text-[#1A3A8F]"
            >
              {view === 'logs' ? '设备指纹' : '返回日志'}
            </Link>
          </div>
        </div>

        <div className="px-3 py-3 md:px-0">
          {view === 'logs' ? (
            <>
              <Stats logs={visibleLogs} fingerprints={fingerprints} />
              <InsightPanel logs={logs} />
              <FilterTabs active={filter} />
              <EventStream logs={visibleLogs} filter={filter} />
            </>
          ) : (
            <FingerprintList fingerprints={fingerprints} />
          )}
        </div>
      </div>
    </div>
  );
}

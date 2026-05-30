import { getAIProviderConfig } from '@/lib/ai/config';
import { saveAIChatLog } from '@/lib/ai/history';
import { buildMonthlySummaryPrompt } from '@/lib/ai/monthlySummaryPrompt';
import { recordAuditLog } from '@/lib/audit';
import { getMonthlySalary } from '@/lib/queries';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type MonthlySalaryRows = Awaited<ReturnType<typeof getMonthlySalary>>;

function validMonth(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

function validYear(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function summarizeRows(rows: MonthlySalaryRows) {
  const paidRows = rows.filter(row => row.totalHours > 0 || row.totalWage > 0);
  const activeRows = rows.filter(row => row.status === 'active');
  const inactivePaidRows = paidRows.filter(row => row.status !== 'active');
  const totalHours = round(paidRows.reduce((sum, row) => sum + row.totalHours, 0));
  const totalWage = round(paidRows.reduce((sum, row) => sum + row.totalWage, 0));
  const sortedByWage = [...paidRows].sort((a, b) => b.totalWage - a.totalWage);
  const sortedByLowHours = [...paidRows].sort((a, b) => a.totalHours - b.totalHours);

  return {
    employeeCount: rows.length,
    activeEmployeeCount: activeRows.length,
    paidEmployeeCount: paidRows.length,
    inactivePaidEmployeeCount: inactivePaidRows.length,
    totalHours,
    totalWage,
    avgHourlyCost: totalHours > 0 ? round(totalWage / totalHours) : 0,
    topWageEmployees: sortedByWage.slice(0, 5).map(row => ({
      id: row.id,
      name: row.name,
      status: row.status,
      positionName: row.positionName,
      totalHours: round(row.totalHours),
      totalWage: round(row.totalWage),
      recordCount: row.recordCount,
    })),
    lowHourEmployees: sortedByLowHours.slice(0, 5).map(row => ({
      id: row.id,
      name: row.name,
      status: row.status,
      positionName: row.positionName,
      totalHours: round(row.totalHours),
      totalWage: round(row.totalWage),
      recordCount: row.recordCount,
    })),
    inactivePaidEmployees: inactivePaidRows.map(row => ({
      id: row.id,
      name: row.name,
      totalHours: round(row.totalHours),
      totalWage: round(row.totalWage),
      recordCount: row.recordCount,
    })),
    employees: rows.map(row => ({
      id: row.id,
      name: row.name,
      status: row.status,
      positionName: row.positionName,
      totalHours: round(row.totalHours),
      totalWage: round(row.totalWage),
      recordCount: row.recordCount,
    })),
  };
}

function badRequest(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const session = await getSession();
  if (!session.isLoggedIn) {
    return badRequest('请先登录。', 401);
  }

  try {
    const body = await request.json() as { year?: unknown; month?: unknown };
    const now = new Date();
    const year = validYear(body.year) ?? now.getFullYear();
    const month = validMonth(body.month) ?? now.getMonth() + 1;
    const config = await getAIProviderConfig(session);
    if (!config) {
      return badRequest('还没有配置好 AI 助手，请先到 AI 设置里填写 Base URL、API Key 和模型。', 409);
    }

    const previous = shiftMonth(year, month, -1);
    const lastYear = { year: year - 1, month };
    const ytdMonths = Array.from({ length: month }, (_, index) => index + 1);
    const [
      currentRows,
      previousRows,
      lastYearRows,
      ...yearToDateRows
    ] = await Promise.all([
      getMonthlySalary(year, month),
      getMonthlySalary(previous.year, previous.month),
      getMonthlySalary(lastYear.year, lastYear.month),
      ...ytdMonths.map(itemMonth => getMonthlySalary(year, itemMonth)),
    ]);

    const facts = {
      year,
      month,
      current: summarizeRows(currentRows),
      previousMonth: {
        year: previous.year,
        month: previous.month,
        ...summarizeRows(previousRows),
      },
      lastYearSameMonth: {
        year: lastYear.year,
        month: lastYear.month,
        ...summarizeRows(lastYearRows),
      },
      yearToDate: yearToDateRows.map((rows, index) => ({
        year,
        month: ytdMonths[index],
        ...summarizeRows(rows),
      })),
    };

    const prompt = buildMonthlySummaryPrompt(facts);
    await recordAuditLog({
      action: 'ai_monthly_summary_request',
      actionLabel: 'AI 月度总结',
      pageUrl: `/salary?year=${year}&month=${month}`,
      user: session,
      detail: {
        year,
        month,
        employeeCount: facts.current.employeeCount,
        paidEmployeeCount: facts.current.paidEmployeeCount,
      },
    });

    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: '你是小微工厂考勤工资助手，只根据用户给出的结构化数据做总结。' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    const payload = await response.json().catch(() => null) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    } | null;

    if (!response.ok) {
      const message = payload?.error?.message || `AI 服务返回 HTTP ${response.status}`;
      throw new Error(message);
    }

    const summary = payload?.choices?.[0]?.message?.content?.trim();
    if (!summary) throw new Error('AI 服务没有返回总结内容。');

    await saveAIChatLog({
      userId: session.userId ?? session.userPhone ?? 'user',
      userPhone: session.userPhone ?? null,
      userMessage: `${year}年${month}月工资表：生成月度总结`,
      assistantReply: summary,
      mode: 'ai',
      pageUrl: `/salary?year=${year}&month=${month}`,
      actions: [],
    });

    await recordAuditLog({
      action: 'ai_monthly_summary_response',
      actionLabel: 'AI 月度总结完成',
      pageUrl: `/salary?year=${year}&month=${month}`,
      user: session,
      detail: {
        year,
        month,
        latencyMs: Date.now() - startedAt,
      },
    });

    return Response.json({ ok: true, summary });
  } catch (error) {
    console.error('[ai-monthly-summary] failed', error);
    await recordAuditLog({
      action: 'ai_error',
      actionLabel: 'AI 月度总结失败',
      pageUrl: null,
      user: session,
      detail: {
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      },
    });
    return badRequest(
      error instanceof Error ? error.message : '月度总结生成失败，请稍后再试。',
      500,
    );
  }
}

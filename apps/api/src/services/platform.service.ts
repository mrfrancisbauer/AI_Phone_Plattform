/**
 * Platform-level services for the Super-Admin console: settings store, KPI
 * dashboard aggregation, billing rollups, monitoring and system info.
 *
 * All of this is cross-tenant by design and is only ever reached through the
 * platform-role guarded admin routes.
 */
import os from 'node:os';
import { createRequire } from 'node:module';
import { PLAN_PRICING, type Plan } from '@ai-phone/shared';

const requireCjs = createRequire(import.meta.url);
import { config, costRates } from '../config.js';
import { prisma } from '../db.js';

// --- Settings --------------------------------------------------------------

export interface PlatformAiSettings {
  defaultModel: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  voice: string;
}

export const DEFAULT_AI_SETTINGS: PlatformAiSettings = {
  defaultModel: config.LLM_MODEL,
  fallbackModel: 'gpt-4o',
  temperature: 0.3,
  maxTokens: 1024,
  voice: 'alloy',
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return (row?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown, updatedBy?: string): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: value as object, updatedBy },
    update: { value: value as object, updatedBy },
  });
}

// --- Dashboard KPIs --------------------------------------------------------

function startOfDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function startOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function dashboardKpis() {
  const today = startOfDay();
  const month = startOfMonth();

  const [
    tenantsTotal,
    tenantsActive,
    activeNumbers,
    callsToday,
    callsMonth,
    minutesAgg,
    usageMonth,
    dbOk,
    activeTenantsForMrr,
    routingPoolAvailable,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { paused: false } }),
    prisma.phoneNumber.count({ where: { active: true } }),
    prisma.call.count({ where: { startedAt: { gte: today } } }),
    prisma.call.count({ where: { startedAt: { gte: month } } }),
    prisma.call.aggregate({ _sum: { durationSeconds: true }, where: { startedAt: { gte: month } } }),
    prisma.usageEvent.aggregate({
      _sum: { llmCost: true, telephonyCost: true, sttCost: true, ttsCost: true, platformMarkup: true, totalCost: true },
      where: { createdAt: { gte: month } },
    }),
    checkDb(),
    prisma.tenant.findMany({ where: { paused: false }, select: { plan: true } }),
    prisma.routingNumber.count({ where: { status: 'available' } }),
  ]);

  const mrr = activeTenantsForMrr.reduce((sum, t) => sum + (PLAN_PRICING[t.plan as Plan] ?? 0), 0);

  return {
    tenantsTotal,
    tenantsActive,
    activeNumbers,
    callsToday,
    callsMonth,
    minutesMonth: Math.round((minutesAgg._sum.durationSeconds ?? 0) / 60),
    openaiCost: num(usageMonth._sum.llmCost),
    telephonyCost: num(usageMonth._sum.telephonyCost),
    sttCost: num(usageMonth._sum.sttCost),
    ttsCost: num(usageMonth._sum.ttsCost),
    platformRevenue: num(usageMonth._sum.totalCost),
    profit: num(usageMonth._sum.platformMarkup),
    mrr,
    arr: mrr * 12,
    routingPoolAvailable,
    apiStatus: 'ok' as const,
    dbStatus: dbOk ? ('ok' as const) : ('down' as const),
  };
}

/** Time series for the dashboard charts (last `days` days). */
export async function dashboardCharts(days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  const [calls, usage, tenants] = await Promise.all([
    prisma.call.findMany({
      where: { startedAt: { gte: since } },
      select: { startedAt: true, durationSeconds: true, leadCategory: true },
    }),
    prisma.usageEvent.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, totalCost: true } }),
    prisma.tenant.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);

  const day = (d: Date) => d.toISOString().slice(0, 10);
  const callsPerDay = bucket(calls.map((c) => day(c.startedAt)));
  const costPerDay = bucketSum(usage.map((u) => [day(u.createdAt), Number(u.totalCost)] as [string, number]));
  const newTenants = bucket(tenants.map((t) => day(t.createdAt)));

  const durationByDay = new Map<string, { total: number; count: number }>();
  for (const c of calls) {
    const k = day(c.startedAt);
    const e = durationByDay.get(k) ?? { total: 0, count: 0 };
    e.total += c.durationSeconds;
    e.count += 1;
    durationByDay.set(k, e);
  }
  const avgDuration = [...durationByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, value: v.count ? Math.round(v.total / v.count) : 0 }));

  const leads = { A: 0, B: 0, C: 0 } as Record<string, number>;
  for (const c of calls) if (c.leadCategory) leads[c.leadCategory] = (leads[c.leadCategory] ?? 0) + 1;

  return {
    callsPerDay: seriesFrom(callsPerDay),
    costPerDay: seriesFrom(costPerDay),
    newTenants: seriesFrom(newTenants),
    avgDuration,
    leadDistribution: leads,
  };
}

// --- Billing ---------------------------------------------------------------

export async function billingOverview(range: 'today' | 'month' | 'year') {
  const now = new Date();
  let since: Date;
  if (range === 'today') since = startOfDay(now);
  else if (range === 'year') since = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  else since = startOfMonth(now);

  const agg = await prisma.usageEvent.aggregate({
    _sum: { llmCost: true, telephonyCost: true, sttCost: true, ttsCost: true, platformMarkup: true, totalCost: true },
    _count: true,
    where: { createdAt: { gte: since } },
  });
  const activeTenants = await prisma.tenant.findMany({ where: { paused: false }, select: { plan: true } });
  const mrr = activeTenants.reduce((s, t) => s + (PLAN_PRICING[t.plan as Plan] ?? 0), 0);

  return {
    range,
    since: since.toISOString(),
    events: agg._count,
    openaiCost: num(agg._sum.llmCost),
    telephonyCost: num(agg._sum.telephonyCost),
    sttCost: num(agg._sum.sttCost),
    ttsCost: num(agg._sum.ttsCost),
    platformMarkup: num(agg._sum.platformMarkup),
    revenue: num(agg._sum.totalCost),
    profit: num(agg._sum.platformMarkup),
    markupPercent: costRates.markupPercent,
    mrr,
    arr: mrr * 12,
  };
}

// --- Monitoring ------------------------------------------------------------

export async function monitoring() {
  const dbOk = await checkDb();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramUsedPct = Math.round(((totalMem - freeMem) / totalMem) * 100);
  const load = os.loadavg()[0] ?? 0;
  const cpuPct = Math.min(100, Math.round((load / (os.cpus().length || 1)) * 100));

  const status = (ok: boolean, warn = false) => (ok ? (warn ? 'warn' : 'ok') : 'down');

  return {
    services: [
      { name: 'API', status: 'ok' },
      { name: 'Database', status: status(dbOk) },
      { name: 'Redis', status: 'not_configured' },
      { name: 'OpenAI', status: config.OPENAI_API_KEY ? 'ok' : 'not_configured' },
      { name: 'Twilio', status: config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN ? 'ok' : 'not_configured' },
      { name: 'Mail', status: config.EMAIL_PROVIDER === 'resend' && config.RESEND_API_KEY ? 'ok' : 'console' },
    ],
    resources: {
      cpuPct,
      ramPct: ramUsedPct,
      ramUsedMb: Math.round((totalMem - freeMem) / 1048576),
      ramTotalMb: Math.round(totalMem / 1048576),
      // Disk metrics require host access; reported as derived/unknown locally.
      diskPct: null as number | null,
      loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
      uptimeSeconds: Math.round(process.uptime()),
    },
  };
}

// --- System info -----------------------------------------------------------

export async function systemInfo() {
  let dbVersion = 'unknown';
  try {
    const rows = await prisma.$queryRawUnsafe<{ version: string }[]>('SELECT version()');
    dbVersion = rows[0]?.version?.split(' ').slice(0, 2).join(' ') ?? 'unknown';
  } catch {
    /* db down */
  }
  const migrations = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    'SELECT migration_name FROM "_prisma_migrations" ORDER BY finished_at DESC',
  ).catch(() => [] as { migration_name: string }[]);

  return {
    appVersion: process.env.APP_VERSION ?? '0.1.0',
    build: process.env.GIT_SHA ?? 'dev',
    nodeVersion: process.version,
    prismaVersion: getDepVersion('@prisma/client'),
    dbVersion,
    migrationsApplied: migrations.map((m) => m.migration_name),
    env: config.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

// --- helpers ---------------------------------------------------------------

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function num(v: unknown): number {
  return v == null ? 0 : Math.round(Number(v) * 1e6) / 1e6;
}
function bucket(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}
function bucketSum(pairs: [string, number][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const [k, v] of pairs) m.set(k, (m.get(k) ?? 0) + v);
  return m;
}
function seriesFrom(m: Map<string, number>) {
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}
function getDepVersion(pkg: string): string {
  try {
    return (requireCjs(`${pkg}/package.json`) as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

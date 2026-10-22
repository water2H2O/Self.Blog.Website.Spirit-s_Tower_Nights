const DAY = 86400000;
const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const fmtYi = (tokens) => `${(tokens / 1e8).toFixed(2)} 亿`;
export const perMillion = (tokens, cost) => tokens > 0 && cost > 0 ? cost / tokens * 1e6 : null;

/** Anchor to the export snapshot, never pretend a stale export is live data.
 * Missing dates are unknown, not zero. Today (at export time) is never complete.
 */
export function summarizeTokens(data) {
  const rows = [...(data.daily ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return null;
  const snapshot = new Date(data.fetchedAt);
  if (!Number.isFinite(snapshot.getTime())) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(snapshot);
  const yesterdayDate = shift(today, -1);
  const byDate = new Map(rows.map(row => [row.date, row]));
  const window = (offset, count) => Array.from({ length: count }, (_, i) => byDate.get(shift(yesterdayDate, -offset - i)));
  const total = (items, key) => items.reduce((sum, row) => sum + (row?.[key] ?? 0), 0);
  const week = window(0, 7), previous = window(7, 7);
  const completeWeek = week.every(Boolean), completePrevious = previous.every(Boolean);
  const previousTokens = total(previous, 'tokens');
  const monthKey = today.slice(0, 7);
  const monthRows = rows.filter(row => row.date.startsWith(monthKey) && row.date <= today);
  const monthTokens = total(monthRows, 'tokens'), monthCost = total(monthRows, 'cost');
  const elapsed = Number(today.slice(8)) - 1;
  const completeMonth = Array.from({ length: elapsed }, (_, i) => byDate.get(`${monthKey}-${String(i + 1).padStart(2, '0')}`));
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const observedMonth = completeMonth.filter(Boolean);
  const observedDays = observedMonth.length;
  const canPredict = observedDays >= 7;
  const completeCost = total(observedMonth, 'cost');
  return {
    today, yesterdayDate, yesterday: byDate.get(yesterdayDate) ?? null,
    weekAverage: completeWeek ? total(week, 'tokens') / 7 : null,
    weekChange: completeWeek && completePrevious && previousTokens > 0 ? (total(week, 'tokens') / previousTokens - 1) * 100 : null,
    monthTokens, monthCost, monthLabel: `${Number(today.slice(5, 7))} 月`,
    unitPrice: perMillion(monthTokens, monthCost), elapsed,
    prediction: canPredict ? { tokens: total(observedMonth, 'tokens') / observedDays * daysInMonth, cost: completeCost > 0 ? completeCost / observedDays * daysInMonth : null, observedDays, missingDays: elapsed - observedDays } : null,
    snapshotLabel: `${today} ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(snapshot)} 北京时间`,
    showCost: monthCost > 0,
    sourceLabel: (data.source ?? '').includes('local') ? '本机 DSH 会话日志' : 'DeepSeek 开放平台及中转站导出',
  };
}

import { perMillion } from './token-stats.mjs';

export const TABLE_FAMILIES = ['deepseek', 'gpt', 'claude'];
export const familyOf = (label) => TABLE_FAMILIES.find(name => label.toLowerCase().includes(name)) ?? null;

/** Fixed art owns three family seats. Other models get visible guest seats, not a fourth art caption.
 * Same-family variants share one seat, with active dates counted as a union.
 */
export function arrangeCanteen(series = [], daily = []) {
  const active = series.filter(s => s.tokens > 0);
  const sumTokens = active.reduce((sum, s) => sum + s.tokens, 0);
  const decorate = (members, family = null) => {
    const tokens = members.reduce((sum, s) => sum + s.tokens, 0);
    const hasCost = members.every(s => typeof s.cost === 'number' && Number.isFinite(s.cost));
    const cost = hasCost ? members.reduce((sum, s) => sum + s.cost, 0) : null;
    const dates = new Set(daily.filter(day => members.some(s => (day.parts?.[s.label] ?? 0) > 0)).map(day => day.date));
    return {
      family, label: members.map(s => s.label).join('、'),
      shortName: members.length === 1 ? members[0].label.split('·').pop().trim() : `${family === 'gpt' ? 'GPT' : family === 'claude' ? 'Claude' : 'DeepSeek'} · ${members.length} 个型号`,
      tokens, cost, share: sumTokens > 0 ? Math.round(tokens / sumTokens * 1000) / 10 : 0,
      days: dates.size, unitPrice: hasCost ? perMillion(tokens, cost) : null,
      isGlm: members.some(s => /glm/i.test(s.label)),
    };
  };
  return {
    seats: TABLE_FAMILIES.map(family => {
      const members = active.filter(s => familyOf(s.label) === family);
      return members.length ? decorate(members, family) : { family, shortName: family === 'gpt' ? 'GPT' : family === 'claude' ? 'Claude' : 'DeepSeek', tokens: 0, cost: null, share: 0, days: 0, unitPrice: null, empty: true };
    }),
    guests: active.filter(s => !familyOf(s.label)).sort((a, b) => b.tokens - a.tokens).map(s => decorate([s])),
  };
}

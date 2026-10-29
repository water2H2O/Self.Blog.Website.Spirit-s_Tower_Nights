import { perMillion } from './token-stats.mjs';

export const TABLE_FAMILIES = ['deepseek', 'gpt', 'claude'];
export const MAX_TABLE_VARIANTS = 2;

/** 生图模型另坐加桌：先判用途，避免 gpt-image 被 GPT 主桌吞掉。 */
export const isImageModel = (label) => /(?:^|[-_/\s·])image(?:[-_/\s]|$)/i.test(label);
export const familyOf = (label) => {
  if (isImageModel(label)) return null;
  return TABLE_FAMILIES.find(name => label.toLowerCase().includes(name)) ?? null;
};

/**
 * 三联画固定对应 DeepSeek / GPT / Claude，其他用途或家族另坐加桌。
 * 主桌合计仍含全部型号；只把用量最高的两个展开成小卡，其余在 /token/ 保留完整明细。
 * 出勤按日期并集计算，不能把多个型号同一天的出勤加两次。
 */
export function arrangeCanteen(series = [], daily = []) {
  const active = series.filter(s => s.tokens > 0);
  const sumTokens = active.reduce((sum, s) => sum + s.tokens, 0);
  const decorate = (members, family = null, withVariants = true) => {
    const tokens = members.reduce((sum, s) => sum + s.tokens, 0);
    const hasCost = members.every(s => typeof s.cost === 'number' && Number.isFinite(s.cost));
    const cost = hasCost ? members.reduce((sum, s) => sum + s.cost, 0) : null;
    const dates = new Set(daily.filter(day => members.some(s => (day.parts?.[s.label] ?? 0) > 0)).map(day => day.date));
    const ranked = [...members].sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label));
    return {
      family, label: members.map(s => s.label).join('、'),
      shortName: members.length === 1 ? members[0].label.split('·').pop().trim() : `${family === 'gpt' ? 'GPT' : family === 'claude' ? 'Claude' : 'DeepSeek'} · ${members.length} 个型号`,
      tokens, cost, share: sumTokens > 0 ? Math.round(tokens / sumTokens * 1000) / 10 : 0,
      days: dates.size, unitPrice: hasCost ? perMillion(tokens, cost) : null,
      isGlm: members.some(s => /glm/i.test(s.label)),
      isImage: members.some(s => isImageModel(s.label)),
      multi: members.length > 1,
      // 单型号也有小卡，但小卡不能继续递归。合计行由页面统一保留，三列起点才对齐。
      variants: withVariants
        ? ranked.slice(0, MAX_TABLE_VARIANTS).map(s => decorate([s], family, false))
        : [],
      hiddenVariantCount: withVariants ? Math.max(0, members.length - MAX_TABLE_VARIANTS) : 0,
    };
  };
  return {
    seats: TABLE_FAMILIES.map(family => {
      const members = active.filter(s => familyOf(s.label) === family);
      return members.length ? decorate(members, family) : { family, shortName: family === 'gpt' ? 'GPT' : family === 'claude' ? 'Claude' : 'DeepSeek', tokens: 0, cost: null, share: 0, days: 0, unitPrice: null, empty: true, variants: [], hiddenVariantCount: 0 };
    }),
    guests: active.filter(s => !familyOf(s.label)).sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label)).map(s => decorate([s], null, false)),
  };
}

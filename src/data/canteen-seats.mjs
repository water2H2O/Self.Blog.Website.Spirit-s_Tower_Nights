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
 * 加桌客人按家族归组：同一个家族的多个型号坐一张卡。
 * 以前是一个型号一张卡，Gemini 一进来就变成 4-argon / 3.8-flash 两桌，挤在加桌行里像重复座位。
 */
export const GUEST_NAMES = { gemini: 'Gemini', glm: 'GLM', image: 'GPT-Image' };
export const guestFamilyOf = (label) => {
  if (isImageModel(label)) return 'image';
  if (/gemini/i.test(label)) return 'gemini';
  if (/glm/i.test(label)) return 'glm';
  return label;
};

/**
 * 三联画固定对应 DeepSeek / GPT / Claude，其他用途或家族另坐加桌。
 * 主桌合计仍含全部型号；只把用量最高的两个展开成小卡，其余在 /token/ 保留完整明细。
 * 出勤按日期并集计算，不能把多个型号同一天的出勤加两次。
 */
export function arrangeCanteen(series = [], daily = []) {
  // 生图模型的 token 可能极少甚至为 0，别让它因为「token 为 0」被整条丢掉
  const active = series.filter(s => s.tokens > 0 || s.image || s.perImage != null);
  const sumTokens = active.reduce((sum, s) => sum + s.tokens, 0);
  const decorate = (members, family = null, withVariants = true, displayName = null) => {
    const tokens = members.reduce((sum, s) => sum + s.tokens, 0);
    const hasCost = members.every(s => typeof s.cost === 'number' && Number.isFinite(s.cost));
    const cost = hasCost ? members.reduce((sum, s) => sum + s.cost, 0) : null;
    const dates = new Set(daily.filter(day => members.some(s => (day.parts?.[s.label] ?? 0) > 0)).map(day => day.date));
    const ranked = [...members].sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label));
    const requests = members.reduce((sum, s) => sum + (s.requests ?? 0), 0);
    const image = members.some(s => isImageModel(s.label));
    // 生图按张计费：单价 = 这个模型花的钱 ÷ 出了几张，按百万 tokens 算没有意义
    const perImage = image && hasCost && requests > 0 ? cost / requests : null;
    const single = members.length === 1;
    return {
      family, label: members.map(s => s.label).join('、'),
      // 合并后的加桌卡用家族名（Gemini），单型号仍显示型号全名
      shortName: single
        ? members[0].label.split('·').pop().trim()
        : `${displayName ?? (family === 'gpt' ? 'GPT' : family === 'claude' ? 'Claude' : 'DeepSeek')} · ${members.length} 个型号`,
      memberCount: members.length,
      members: ranked.map(s => s.label.split('·').pop().trim()),
      tokens, cost, share: sumTokens > 0 ? Math.round(tokens / sumTokens * 1000) / 10 : 0,
      days: dates.size,
      requests,
      perImage,
      // 生图不给「每百万 tokens」—— 那个数会大得离谱且没有解释力
      unitPrice: hasCost && !image ? perMillion(tokens, cost) : null,
      isGlm: members.some(s => /glm/i.test(s.label)),
      isGemini: members.some(s => /gemini/i.test(s.label)),
      isImage: image,
      multi: members.length > 1,
      // 单型号也有小卡，但小卡不能继续递归。合计行由页面统一保留，三列起点才对齐。
      variants: withVariants
        ? ranked.slice(0, MAX_TABLE_VARIANTS).map(s => decorate([s], family, false))
        : [],
      hiddenVariantCount: withVariants ? Math.max(0, members.length - MAX_TABLE_VARIANTS) : 0,
    };
  };
  // 加桌按家族合并：同一家族的多个型号坐一张卡，出勤与花费都按这张卡合计
  const guestGroups = new Map();
  for (const s of active.filter(s => !familyOf(s.label))) {
    const key = guestFamilyOf(s.label);
    if (!guestGroups.has(key)) guestGroups.set(key, []);
    guestGroups.get(key).push(s);
  }
  return {
    seats: TABLE_FAMILIES.map(family => {
      const members = active.filter(s => familyOf(s.label) === family);
      return members.length ? decorate(members, family) : { family, shortName: family === 'gpt' ? 'GPT' : family === 'claude' ? 'Claude' : 'DeepSeek', tokens: 0, cost: null, share: 0, days: 0, unitPrice: null, empty: true, variants: [], hiddenVariantCount: 0, memberCount: 0, members: [] };
    }),
    guests: [...guestGroups.entries()]
      .map(([key, members]) => decorate(members, null, false, GUEST_NAMES[key] ?? key))
      .sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label)),
  };
}

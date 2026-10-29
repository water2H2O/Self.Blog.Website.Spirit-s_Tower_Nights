import assert from 'node:assert/strict';
import fs from 'node:fs';
import { arrangeCanteen } from '../src/data/canteen-seats.mjs';
const series = [
  { label: '中转站 · glm-5.3-flash', tokens: 50, cost: 0.01 },
  { label: '中转站 · claude-opus-5', tokens: 10, cost: 1 },
  { label: '中转站 · claude-opus-5-5', tokens: 20, cost: 2 },
  { label: '官方 · deepseek-flash', tokens: 100, cost: 1 },
];
const daily = [
  { date: '2026-10-23', parts: { '中转站 · claude-opus-5': 5, '中转站 · claude-opus-5-5': 20, '中转站 · glm-5.3-flash': 50 } },
  { date: '2026-10-24', parts: { '中转站 · claude-opus-5': 5 } },
];
const { seats, guests } = arrangeCanteen(series, daily);
assert.deepEqual(seats.map(s => s.family), ['deepseek', 'gpt', 'claude']);
assert.equal(seats[1].empty, true); // no shifting Claude under GPT art
assert.equal(seats[2].tokens, 30);
assert.equal(seats[2].cost, 3);
assert.equal(seats[2].days, 2); // unique days, not sum of variant days
assert.deepEqual(seats[2].variants.map(v => v.shortName), ['claude-opus-5-5', 'claude-opus-5']); // split, biggest first
assert.equal(seats[2].variants[0].unitPrice, 2 / 20 * 1e6);
assert.equal(seats[2].variants[1].days, 2);
assert.equal(seats[2].variants.reduce((s, v) => s + v.tokens, 0), seats[2].tokens);
assert.equal(seats[0].variants.length, 1); // 单型号家族也给一张小票，三席才齐
assert.equal(seats[0].variants[0].shortName, 'deepseek-flash');
assert.equal(seats[0].variants[0].variants.length, 0); // 小票不再往下展开，防无限递归
assert.equal(guests.length, 1);
assert.equal(guests[0].isGlm, true);
assert.equal(guests[0].days, 1);
assert.equal(seats.reduce((s, x) => s + x.tokens, 0) + guests.reduce((s, x) => s + x.tokens, 0), 180);
assert.equal(arrangeCanteen([{ label: 'new', tokens: 1 }]).guests[0].unitPrice, null);
assert.equal(arrangeCanteen([{ label: 'new', tokens: 1, cost: 0 }]).guests[0].cost, 0);
assert.equal(arrangeCanteen().guests.length, 0);

// 生图模型算「另一种用途」：哪怕名字里带 gpt，也不进 GPT 主桌
const withImage = arrangeCanteen([
  { label: '中转站 · gpt-6.1-sol', tokens: 100, cost: 1 },
  { label: '中转站 · gpt-image-2', tokens: 30, cost: 2 },
], []);
const gptSeat = withImage.seats.find(s => s.family === 'gpt');
assert.equal(gptSeat.tokens, 100); // 主桌只算对话模型
assert.deepEqual(withImage.guests.map(g => g.shortName), ['gpt-image-2']);
assert.equal(withImage.guests[0].isImage, true);
assert.equal(withImage.guests[0].variants.length, 0); // 加桌不再套小卡

// 主桌最多展开两个型号，其余计入合计并留一句说明
const crowded = arrangeCanteen([
  { label: '官方 · deepseek-flash', tokens: 300, cost: 1 },
  { label: '官方 · deepseek-v4-pro', tokens: 20, cost: 1 },
  { label: '官方 · deepseek-v3-mini', tokens: 10, cost: 1 },
], []);
const deepSeek = crowded.seats.find(s => s.family === 'deepseek');
assert.equal(deepSeek.variants.length, 2); // 只列前两个
assert.deepEqual(deepSeek.variants.map(v => v.shortName), ['deepseek-flash', 'deepseek-v4-pro']);
assert.equal(deepSeek.hiddenVariantCount, 1);
assert.equal(deepSeek.tokens, 330); // 合计仍然包含第三个
assert.equal(deepSeek.variants.reduce((s, v) => s + v.tokens, 0), 320); // 合计 ≠ 小卡之和

const current = JSON.parse(fs.readFileSync(new URL('../src/data/token-usage.json', import.meta.url)));
const live = arrangeCanteen(current.series, current.daily);
assert.equal(live.seats.reduce((s, x) => s + x.tokens, 0) + live.guests.reduce((s, x) => s + x.tokens, 0), current.series.reduce((s, x) => s + x.tokens, 0));
console.log('Canteen seats passed: fixed art slots, family grouping, GLM guest, unique days, missing prices, totals conserved.');

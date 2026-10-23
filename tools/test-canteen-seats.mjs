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
assert.equal(guests.length, 1);
assert.equal(guests[0].isGlm, true);
assert.equal(guests[0].days, 1);
assert.equal(seats.reduce((s, x) => s + x.tokens, 0) + guests.reduce((s, x) => s + x.tokens, 0), 180);
assert.equal(arrangeCanteen([{ label: 'new', tokens: 1 }]).guests[0].unitPrice, null);
assert.equal(arrangeCanteen([{ label: 'new', tokens: 1, cost: 0 }]).guests[0].cost, 0);
assert.equal(arrangeCanteen().guests.length, 0);
const current = JSON.parse(fs.readFileSync(new URL('../src/data/token-usage.json', import.meta.url)));
const live = arrangeCanteen(current.series, current.daily);
assert.equal(live.seats.reduce((s, x) => s + x.tokens, 0) + live.guests.reduce((s, x) => s + x.tokens, 0), current.series.reduce((s, x) => s + x.tokens, 0));
console.log('Canteen seats passed: fixed art slots, family grouping, GLM guest, unique days, missing prices, totals conserved.');

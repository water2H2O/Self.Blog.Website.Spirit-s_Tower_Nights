/**
 * 聊天区滚动策略的回归测试。
 *
 *   node tools/aichat-scroll-test.mjs
 *
 * 守两件事：切会话必须回到底部；正文开始输出后不许再把用户拽下去。
 */

import assert from 'node:assert/strict';

import { shouldStickToBottom } from '../src/components/aichat/scroll.ts';

// 切换会话：无论当前有没有在生成，都滚到底部
assert.equal(shouldStickToBottom({ switched: true, streaming: true, hasText: true }), true, '切换会话必须到底部');
assert.equal(shouldStickToBottom({ switched: true, streaming: false, hasText: true }), true);

// 同一会话：还没正文时跟随
assert.equal(shouldStickToBottom({ switched: false, streaming: true, hasText: false }), true, '开始生成时跟随');

// 同一会话：正文已开始 -> 停止跟随
assert.equal(shouldStickToBottom({ switched: false, streaming: true, hasText: true }), false, '正文输出时停止追随');

// 不在生成：正常跟随（发送消息、接收完成）
assert.equal(shouldStickToBottom({ switched: false, streaming: false, hasText: true }), true);
assert.equal(shouldStickToBottom({ switched: false, streaming: false, hasText: false }), true);

console.log('scroll.test: 全部通过');

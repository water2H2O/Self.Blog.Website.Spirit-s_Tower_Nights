/**
 * 官方导出导入器的回归测试。
 *
 *   node tools/aichat-import-test.mjs
 *
 * 用一份手写的分支会话覆盖：主链选取、分叉副本、片段映射、附件占位、去重。
 */

import assert from 'node:assert/strict';

import { collectSessions, parseSession } from '../src/components/aichat/importer.ts';

const session = {
	id: 's-1',
	title: '测试会话',
	inserted_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-02T00:00:00.000Z',
	current_message_id: 5,
	messages: [
		{
			id: 1,
			parent_id: null,
			role: 'USER',
			status: 'FINISHED',
			inserted_at: '2026-01-01T00:00:01.000Z',
			fragments: [
				{ type: 'REQUEST', content: '第一个问题' },
				{ type: 'FILE', files: [{ id: 'f1', file_name: 'a.png', is_image: true }] },
			],
		},
		{ id: 2, parent_id: 1, role: 'ASSISTANT', status: 'FINISHED', fragments: [{ type: 'THINK', content: '想一想' }, { type: 'RESPONSE', content: '回答一' }] },
		// 编辑过的提问：从 1 又分出一条，最终主链走的是 3 → 4 → 5
		{ id: 3, parent_id: 1, role: 'USER', status: 'FINISHED', fragments: [{ type: 'REQUEST', content: '第二个问题（改过）' }] },
		{ id: 4, parent_id: 3, role: 'ASSISTANT', status: 'TIMEOUT', fragments: [{ type: 'RESPONSE', content: '回答二' }] },
		{ id: 5, parent_id: 4, role: 'USER', status: 'FINISHED', fragments: [{ type: 'REQUEST', content: '第三个问题' }] },
		{ id: 6, parent_id: 5, role: 'ASSISTANT', status: 'FINISHED', fragments: [{ type: 'CONTENT_RISK', content: '' }] },
	],
};

// --- 主链 ---
const { session: main, archive, summary } = parseSession(session);
assert.ok(main, '应该解析出主会话');
assert.equal(main.id, 's-1');
assert.equal(main.title, '测试会话');
// current_message_id = 5，所以主链是 1 ← 3 ← 4 ← 5
assert.equal(main.messages.length, 4, '主链应包含 1/3/4/5 四条消息');
assert.equal(main.messages[0].role, 'user');
assert.deepEqual(main.messages[0].content, [{ type: 'text', text: '第一个问题' }]);
assert.equal(main.messages[0].attachments?.[0]?.name, 'a.png', '附件只记文件名');
assert.equal(main.messages[1].content[0].text, '第二个问题（改过）', '主链走的是被编辑后的分支');
assert.equal(main.messages[2].role, 'assistant');
assert.equal(main.messages[2].stopReason, 'max_tokens', 'TIMEOUT 映射成截断提示');
assert.equal(main.updatedAt, Date.parse('2026-01-02T00:00:00.000Z'));

// --- 分叉副本 ---
assert.ok(archive, '存在分叉时必须生成「全部分支」副本');
assert.equal(archive.id, 's-1#all');
assert.equal(archive.messages.length, 6, '副本里所有消息都要在');
assert.ok(archive.messages.some((m) => m.content.some((b) => b.text === '（这次回复被内容审核拦截）')), '审核片段保留在副本里');
assert.ok(archive.messages.some((m) => m.content.some((b) => b.type === 'thinking')), '思考片段保留在副本里');
assert.ok(summary.droppedBranches >= 1);

// --- 去重 ---
const twice = collectSessions(
	[
		{ name: 's-1.json', text: JSON.stringify(session) },
		{ name: 's-1.json', text: JSON.stringify(session) },
	],
	new Set(),
);
assert.equal(twice.summary.sessions, 1, '同一批里重复文件只算一次');
assert.equal(twice.summary.archives, 1);

const existing = collectSessions([{ name: 's-1.json', text: JSON.stringify(session) }], new Set(['s-1']));
assert.equal(existing.summary.sessions, 0);
assert.equal(existing.summary.skipped, 1);

// --- 非会话文件 ---
const ignored = collectSessions(
	[
		{ name: 'manifest.json', text: '{"export_format_version":3}' },
		{ name: 'user.json', text: '{"user_id":"x"}' },
		{ name: 'chat_session_index.json', text: '[]' },
		{ name: 'broken.json', text: 'not json' },
	],
	new Set(),
);
assert.equal(ignored.summary.sessions, 0);

console.log('import.test: 全部通过');

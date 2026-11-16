# 官方导出格式（`deepseek_data-*.zip`）

2026-11-16 那份导出的实测结构。以后写导入器时按这份对照，不要凭印象。

## 包内结构

```
manifest.json                    {"export_format_version":3}
user.json                        账号信息（邮箱/手机号已打码）
chat_session_index.json          会话索引数组
chat_sessions/<uuid>.json        每个会话一个文件（549 个）
chat_sessions/<uuid>_files/      该会话的附件原件
```

实测：982 个条目 = 552 JSON + 320 PNG + 66 JPG + 44 WebP。
JSON 合计 28.04 MB，最大单个会话 2.34 MB；图片合计 207.59 MB。

## user.json

```json
{
  "user_id": "Wechat-…",
  "email": "ss.******h2o@gmail.com",
  "mobile": { "mobile_number": "136******30", "area_code": "+86" },
  "oauth_profiles": [{ "provider": "GOOGLE", "profile_json": "…{JSON 字符串}…" }]
}
```

敏感字段在导出时已被掩码，导入时不要试图还原。

## chat_session_index.json

```json
[{ "id": "…", "title": "Week4课程任务", "pinned": true,
   "message_count": 30,
   "inserted_at": "2026-09-24T06:05:20.710Z",
   "updated_at": "2026-11-06T02:33:48.765Z" }]
```

## chat_sessions/&lt;uuid&gt;.json

```json
{
  "id": "…", "title": "…", "pinned": true,
  "current_message_id": 1,
  "inserted_at": "…", "updated_at": "…",
  "messages": [ … ]
}
```

### message

```json
{
  "id": 2,
  "parent_id": 1,
  "role": "USER" | "ASSISTANT",
  "status": "FINISHED" | "INCOMPLETE" | "TIMEOUT",
  "thinking_enabled": true,
  "search_enabled": true,
  "accumulated_token_usage": 10173,
  "inserted_at": "2026-09-24T06:05:50.322Z",
  "fragments": [ … ]
}
```

`id` 是会话内自增整数，`parent_id` 指向上一条；正常是线性链，
分支时会出现同父多子 —— 我们的数据模型没有分支，导入要**沿 `current_message_id`
回溯出一条主链**，其余分支丢弃（并在导入报告里提示丢了多少条）。

### fragment

| type | 字段 | 说明 |
| --- | --- | --- |
| `REQUEST` | `content` | 用户输入 |
| `THINK` | `content`, `elapsed_secs` | 思考过程 |
| `RESPONSE` | `content` | 正式回答（Markdown） |
| `TEMPLATE_RESPONSE` | `content` | 模板化回答（限流提示之类） |
| `CONTENT_RISK` | `content`, `style` | 内容审核拦截 |
| `FILE` | `files[]` | 附件 |

`FILE.files[]` 的每一项：

```json
{ "id": "a656f5…", "file_name": "HXBR….webp", "file_size": 56400,
  "token_usage": 962, "inserted_at": "…",
  "export_path": "chat_sessions/<uuid>_files/<file_id>_<file_name>",
  "is_image": true, "width": 2048, "height": 1282 }
```

## 与我们 `Session` 的映射

| 官方字段 | 我们的字段 | 备注 |
| --- | --- | --- |
| `id` | `Session.id` | 直接复用 UUID |
| `title` | `Session.title` | |
| `inserted_at` / `updated_at` | `createdAt` / `updatedAt` | ISO → 毫秒时间戳 |
| `messages[].role` | `ChatMessage.role` | `USER` → `user`，`ASSISTANT` → `assistant` |
| `REQUEST.content` | `TextBlock` | 塞进 user 的 `content` 数组 |
| `RESPONSE` / `TEMPLATE_RESPONSE` | `TextBlock` | Markdown 原样 |
| `THINK.content` | `ThinkingBlock` | 折叠展示 |
| `FILE.files[]` | `Attachment` | 只能拿到 `export_path`，没有 `file_id` |
| `accumulated_token_usage` | —— | 粒度是「到这条为止累计」，对我们的 `usage` 结构没用，留空 |
| `CONTENT_RISK` | —— | 导入时转成一条错误提示文本，别静默吞掉 |

## 两个坑

1. **引用不再存在**。导出里没有 `server_tool_use` / `web_search_tool_result` /
   `citations`，联网回答的引用在正文里就是普通 Markdown 链接。导入后这些消息
   不会显示来源列表 —— 这是官方导出的信息损失，不是我们没解析。
2. **附件只有路径，没有 DeepSeek 的 `file_id`**。想要这些文件在新会话里还能被模型读到，
   必须把原图重新上传到 Files API 换一个新的 `file_id`（一次导入 ~200 MB）。
   第一版导入器建议**只导入文字**，附件先保留 `export_path` 作为展示用元数据。

## 建议的导入顺序（下一轮）

1. 解压到临时目录，只读 `chat_session_index.json` + `chat_sessions/*.json`；
2. 每个会话沿 `current_message_id` 回溯主链，把 fragment 折成我们的 `ChatMessage`；
3. 以 `id` 为键 upsert 进 IndexedDB（重复导入不会产生副本）；
4. 生成一份导入报告：会话数、消息数、丢弃分支数、未导入附件数；
5. 附件单独做一轮「重新上传换 file_id」的可选流程。

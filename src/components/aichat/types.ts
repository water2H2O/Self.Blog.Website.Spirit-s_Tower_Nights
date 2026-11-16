/**
 * /aichat 的数据形状。
 *
 * 这里刻意贴着 Anthropic Messages 协议的原始结构走：assistant 的 content
 * 就是上游返回的 content 数组，原样存、原样回传。原因是「阅读链接」那一类
 * 块带 signature，网页正文不在块里、加密在签名里 —— 一旦你把它拆成
 * 普通的 {url, title} 再拼回去，下一轮这些网页就不在上下文里了。
 */

export type Citation = {
	type: 'web_search_result_location';
	url: string;
	title: string | null;
	cited_text?: string;
};

export type ThinkingBlock = { type: 'thinking'; thinking: string };

export type TextBlock = { type: 'text'; text: string; citations?: Citation[] };

export type ToolAction = 'search' | 'open_page' | 'find_in_page' | 'read_link' | string;

export type ServerToolUse = {
	type: 'server_tool_use';
	id: string;
	name: string;
	input: { action?: ToolAction; queries?: string[]; url?: string; pattern?: string };
	kind?: string;
};

export type SearchResultItem = {
	type: string;
	title?: string | null;
	url?: string;
	snippet?: string | null;
	site_name?: string | null;
	site_icon?: string | null;
	image_url?: string | null;
	page_age?: string | null;
	error_code?: string;
};

export type WebSearchResultBlock = {
	type: 'web_search_tool_result';
	tool_use_id: string;
	content: SearchResultItem[];
	kind?: string;
};

export type WebFetchContent =
	| {
			type: 'web_fetch_result';
			url: string;
			content: { type: 'document'; title?: string | null };
			published_at?: string | null;
	  }
	| { type: 'web_fetch_tool_result_error'; error_code: string };

export type WebFetchResultBlock = {
	type: 'web_fetch_tool_result';
	tool_use_id: string;
	content: WebFetchContent;
	kind?: string;
	signature?: string;
};

/** 用户消息里引用已上传文件的块：图片走 image，文档走 document */
export type FileBlock = {
	type: 'image' | 'document';
	source: { type: 'file'; file_id: string };
};

export type ContentBlock =
	| ThinkingBlock
	| TextBlock
	| ServerToolUse
	| WebSearchResultBlock
	| WebFetchResultBlock
	| FileBlock;

export type Usage = {
	input: number;
	output: number;
	cacheHit: number;
	thinkingTokens?: number;
	/** 计费口径：tool_search / tool_fetch / tool_image_search */
	searches: number;
	fetches: number;
	imageSearches: number;
};

export type Attachment = {
	fileId: string;
	name: string;
	/** 展示用：图片会尽力显示缩略图，文档只显示名字 */
	kind: 'image' | 'document';
	bytes?: number;
};

export type ChatMessage = {
	id: string;
	role: 'user' | 'assistant';
	/** 线上原样收发的块；user 消息里是 FileBlock + TextBlock */
	content: ContentBlock[];
	/** user 消息发送时固化的元信息标记，回传时必须原样带上 */
	reminder?: string;
	/** user 消息的附件展示信息（真正的引用在 content 的 FileBlock 里） */
	attachments?: Attachment[];
	usage?: Usage;
	error?: string;
	streaming?: boolean;
	stopReason?: string | null;
	createdAt: number;
};

export type Session = {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messages: ChatMessage[];
};

export type ChatOptions = {
	thinking: boolean;
	webSearch: boolean;
	readUrl: boolean;
	/** 文档是否用 rich_layout_recognition 解析（能看图，但更贵、更占 token） */
	richLayout?: boolean;
};

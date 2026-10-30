/**
 * 跨平台找浏览器 + 临时目录。
 *
 * 这几个截图 / 排版检查脚本以前各写一份 Windows 路径，迁到 Linux / macOS 会直接
 * 报「找不到 Chrome」。统一收到这里：
 *
 *   1. 环境变量 CHROME_PATH（或 CHROME_BIN）优先
 *   2. 按平台给候选路径
 *   3. 最后在 PATH 里找常见命令名
 *
 * 用法：
 *   import { findBrowser, tempDir } from './find-chrome.mjs';
 *   const chrome = findBrowser();          // 找不到返回 null
 *   const profile = tempDir('dsh-shot');   // 平台无关的临时目录，调用方负责清理
 */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 各平台的常见安装位置 */
const CANDIDATES = {
	win32: [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	],
	darwin: [
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/Applications/Chromium.app/Contents/MacOS/Chromium',
		'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
		'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
	],
	linux: [
		'/usr/bin/google-chrome',
		'/usr/bin/google-chrome-stable',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser',
		'/snap/bin/chromium',
		'/usr/bin/microsoft-edge',
		'/usr/bin/microsoft-edge-stable',
	],
};

/** PATH 里能直接找到的命令名（Linux 发行版差异很大，多试几个） */
const COMMANDS = {
	win32: [],
	darwin: [],
	linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'],
};

/** 从 PATH 里解析命令的绝对路径；找不到返回 null */
function fromPath(name) {
	try {
		const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		})
			.split(/\r?\n/)[0]
			.trim();
		return found && existsSync(found) ? found : null;
	} catch {
		return null;
	}
}

/**
 * 返回可执行的浏览器路径；找不到返回 null（由调用方给出提示）。
 * 命中后会顺手返回真实路径，避免 snap 之类的软链让 --user-data-dir 出问题。
 */
export function findBrowser() {
	const fromEnv = process.env.CHROME_PATH || process.env.CHROME_BIN;
	if (fromEnv && existsSync(fromEnv)) return fromEnv;

	for (const candidate of CANDIDATES[process.platform] ?? []) {
		if (existsSync(candidate)) {
			try {
				return realpathSync(candidate);
			} catch {
				return candidate;
			}
		}
	}

	for (const command of COMMANDS[process.platform] ?? []) {
		const found = fromPath(command);
		if (found) return found;
	}

	return null;
}

/** 平台无关的临时目录：`os.tmpdir()` 下按前缀建一个独立目录 */
export function tempDir(prefix) {
	return path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}`);
}

/** 找不到浏览器时的统一提示 */
export const BROWSER_HINT =
	'找不到 Chrome / Chromium / Edge。用 CHROME_PATH=/path/to/chrome 指定，或装上任意一个。';

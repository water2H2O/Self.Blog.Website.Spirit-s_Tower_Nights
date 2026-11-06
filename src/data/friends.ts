import { domainToUnicode } from 'node:url';
import type { ImageMetadata } from 'astro';
import iconTulpa from '../assets/friends/tulpa.webp';
import iconStsas from '../assets/friends/stsas.webp';
import iconBluefish from '../assets/friends/bluefish.webp';
import iconXiey from '../assets/friends/xiey.webp';
import iconShiori from '../assets/friends/shiori.webp';
import iconBlophy from '../assets/friends/blophy.webp';
import iconHarness from '../assets/friends/harness.webp';

/**
 * 友情链接名单。
 *
 * 完整名单统一展示在关于页 /about/#friends。
 * /about/friends/ 仅保留兼容跳转；新增或修改链接只维护这里。
 *
 * 每条：
 *   href  —— 完整网址
 *   who   —— 归属
 *   group —— friend 朋友 / community 友情站点 / project 我参与的项目 / tool 技术支持；关于页按 FRIEND_GROUPS 分区，区内保持这里的顺序
 *   note  —— 一句话说明，可省
 *   icon  —— 站点图标，放在 src/assets/friends/，96×96 WebP；可省，省了显示名字首字
 *
 * 图标来源：优先对方站点自己的 favicon / apple-touch-icon，下载到本地再转码，
 * 不热链（对方换图或挂掉都不影响这里）。对方没有 favicon 的，可以从对方站点
 * 自己公开的图里裁一块（浅水那张就是这样来的），不要自己画。
 *
 * 显示规则（关于页自动处理，不用手写）：
 *   - 中文域名显示成中文，不显示 xn-- 编码；路径不是「/」时一并显示
 *   - http:// 开头的链接自动加「仅 HTTP」标记，对方开了 https 后把 href 改掉即可
 */
export type FriendGroup = 'friend' | 'community' | 'project' | 'tool';

export interface FriendLink {
	href: string;
	who: string;
	group: FriendGroup;
	note?: string;
	icon?: ImageMetadata;
}

/** 关于页的分区：项目与技术支持各只有一条，合成一区，避免单卡孤零零占一整排。 */
export const FRIEND_GROUPS: { label: string; groups: FriendGroup[] }[] = [
	{ label: '朋友们的小站', groups: ['friend'] },
	{ label: '友情站点', groups: ['community'] },
	{ label: '我参与的项目与技术支持', groups: ['project', 'tool'] },
];

/** 卡片上显示的地址：中文域名解码、去掉末尾斜杠，保留有意义的路径。 */
export function friendAddress(href: string): string {
	const url = new URL(href);
	const host = domainToUnicode(url.hostname) || url.hostname;
	const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
	return host + path;
}

/** 只有 http、没有 https 的站点。 */
export function isInsecure(href: string): boolean {
	return new URL(href).protocol === 'http:';
}

export const FRIENDS: FriendLink[] = [
	{
		href: 'https://profile.aurelith.top/',
		who: 'Aurelith',
		group: 'friend',
	},
	{
		href: 'https://inkbai.fun/',
		who: 'Ink_Bai（墨白）',
		group: 'friend',
	},
	{
		href: 'https://tulpa.host/',
		who: 'Huawatered 的小窝',
		group: 'friend',
		icon: iconTulpa,
		note: '可以去这个上面视奸她',
	},
	{
		// 2026-10-15 来信：基于《星光圣域极端异常情况处理条例》《星光圣域对外沟通指南》申请互链。
		// 对方给了两个等价域名（www.stsas.top 与 starlightsacredsanctuary.top），这里选短的那个。
		href: 'https://www.stsas.top/',
		who: '星光圣域',
		group: 'friend',
		icon: iconStsas,
		note: '对方的另一域名 starlightsacredsanctuary.top 内容一致',
	},
	{
		// 2026-10-21 作者给的地址；本人站点，签筒里的「天涯」就是她
		href: 'https://tianya.martianya.cloud/',
		who: '天涯',
		group: 'friend',
	},
	{
		// 2026-10-24 作者给的地址；作者 lmy414，同一个人的两个站
		href: 'https://emaostudio.online/',
		who: '维度镜像（mirror@blog）',
		group: 'friend',
		note: '终端风格的机器可读博客，作者就是下面那条 AI 娘图库的站长',
	},
	{
		// 与上一条同一位作者（GitHub lmy414/bluedafeiyu）；中文域名，浏览器会显示成 蓝色大肥鱼.com
		href: 'https://蓝色大肥鱼.com/',
		who: '蓝色大肥鱼',
		group: 'community',
		icon: iconBluefish,
		note: '「大肥鱼」是 DeepSeek 娘的社区昵称：1244 件表情包、梗图与二创的开放档案',
	},
	{
		// 2026-10-24 作者给的地址；站里的座右铭是「纸上得来终觉浅，绝知此事要躬行」
		href: 'https://blog.xiey.work/',
		who: 'In Huntersxy',
		group: 'friend',
		icon: iconXiey,
		note: 'Huntersxy 的个人博客：技术折腾与折腾记录',
	},
	{
		// 2026-11-06 加；签筒里「檐下汐」的设主。站点暂时只有 http（https 握手失败），
		// 等对方开了 https 把这里改掉即可，页面上的「仅 HTTP」标记会自动消失。
		href: 'http://shiori.amquora.love/',
		who: '浅水 ShallowAqua',
		group: 'friend',
		icon: iconShiori,
		note: '檐下汐的小站：自我介绍、设定与图廊',
	},
	{
		href: 'https://blophy.cn/',
		who: '青柠工作室（Lime Studio）',
		group: 'project',
		icon: iconBlophy,
		note: '非商业音乐游戏《Blophy 方菱律动》，我在其中担任主催与外交',
	},
	{
		href: 'https://deepseek.com/harness/',
		who: 'DeepSeek Harness',
		group: 'tool',
		icon: iconHarness,
		note: '本站技术支持，就是吃的有点多',
	},
];

/**
 * 友情链接名单。
 *
 * 完整名单统一展示在关于页 /about/#friends。
 * /about/friends/ 仅保留兼容跳转；新增或修改链接只维护这里。
 *
 * 排序：先朋友，再我在参与的项目，最后是站点本身用到的技术支持。
 * 每条：
 *   href —— 完整网址（显示出来的也是它，方便直接复制）
 *   who  —— 归属
 *   note —— 一句话说明，可省
 */
export interface FriendLink {
	href: string;
	who: string;
	note?: string;
}

export const FRIENDS: FriendLink[] = [
	{
		href: 'https://profile.aurelith.top/',
		who: 'Aurelith',
	},
	{
		href: 'https://inkbai.fun/',
		who: 'Ink_Bai（墨白）',
	},
	{
		href: 'https://tulpa.host/',
		who: 'Huawatered 的小窝',
		note: '可以去这个上面视奸她',
	},
	{
		// 2026-10-15 来信：基于《星光圣域极端异常情况处理条例》《星光圣域对外沟通指南》申请互链。
		// 对方给了两个等价域名（www.stsas.top 与 starlightsacredsanctuary.top），这里选短的那个。
		href: 'https://www.stsas.top/',
		who: '星光圣域',
		note: '对方的另一域名 starlightsacredsanctuary.top 内容一致',
	},
	{
		// 2026-10-21 作者给的地址；本人站点，签筒里的「天涯」就是她
		href: 'https://tianya.martianya.cloud/',
		who: '天涯',
	},
	{
		// 2026-10-24 作者给的地址；作者 lmy414，AI 形象「蓝色大肥鱼」的制作者
		href: 'https://emaostudio.online/',
		who: '维度镜像（mirror@blog）',
		note: '终端风格的机器可读博客，作者也是 AI 形象「蓝色大肥鱼」的制作者',
	},
	{
		href: 'https://blophy.cn/',
		who: '青柠工作室（Lime Studio）',
		note: '非商业音乐游戏《Blophy 方菱律动》，我在其中担任主催与外交',
	},
	{
		href: 'https://deepseek.com/harness/',
		who: 'DeepSeek Harness',
		note: '本站技术支持，就是吃的有点多',
	},
];

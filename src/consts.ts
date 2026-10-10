// 站点全局信息：改这里会同时影响导航品牌、SEO 与 RSS 标题。

/** 站点主标题（页头品牌 + RSS） */
export const SITE_TITLE = "水塔夜谈";

/** 站点描述（SEO / RSS） */
export const SITE_DESCRIPTION =
	"水塔夜谈 —— 一个原创 OC 世界观：设定、种族、角色、故事、画作与音乐。";

/** 站点主人署名（页脚 + 个人首页；可以改成你的名字或 ID） */
export const SITE_AUTHOR = 'water2H2O';

/** 世界观企划的正式名与英文名 */
export const PROJECT_TITLE = '水塔夜谈';
export const PROJECT_SUBTITLE = "Spirit's Tower Nights";

/**
 * 世界观企划的路径前缀。
 * 全站与该企划相关的页面都挂在这个二级目录下；根目录留给个人内容。
 * 改动这里时，记得同步改 src/pages/worldview 下的页面内链接。
 */
export const WORLDVIEW_BASE = '/worldview';

/** 社交链接：只放真实存在的 */
export const GITHUB_URL = 'https://github.com/water2H2O';
export const GITHUB_NAME = 'water2H2O';

/** B 站（音乐 PV、表情包小剧场） */
export const BILIBILI_URL = 'https://space.bilibili.com/433383827';
export const BILIBILI_NAME = '淼渺_Water2H2O';

/** 联系邮箱（授权、转载、合作） */
export const EMAIL = 'ss.water2h2o@gmail.com';

/**
 * QQ 群。
 * 加群链接用 qm.qq.com 的 groupcode 形式 —— 这个不需要腾讯后台生成的 key，
 * 填群号即可跳转（已实测返回 200）。
 */
export const QQ_GROUP = '1074706241';
export const QQ_GROUP_URL = `https://qm.qq.com/cgi-bin/qm/qr?k=&groupcode=${QQ_GROUP}`;

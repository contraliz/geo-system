// Shared, non-secret navigation metadata for account authorization windows.
// The selectors are intentionally conservative: a platform may expose an
// account identity differently after a redesign, so the window still returns
// a session for manual verification instead of claiming a selector is proven.
export const platformAuthConfigs = {
  zhihu: {
    id: 'zhihu', name: 'Zhihu', nameZh: '知乎',
    loginUrl: 'https://www.zhihu.com/signin', adminUrl: 'https://www.zhihu.com/',
    cookieDomain: 'zhihu.com',
    nameSelectors: ['.AppHeader-profile .name', '[class*="UserInfo"] .name', '[class*="Avatar"] + *', '[class*="name"]'],
    avatarSelectors: ['.AppHeader-profile img', '[class*="Avatar"] img', 'img.Avatar'],
    loginMarkers: ['登录知乎', '登录', '注册', 'sign in', 'log in'],
    publishingSupported: true,
  },
  wechat: { id: 'wechat', name: 'WeChat Official Accounts', nameZh: '微信公众号', loginUrl: 'https://mp.weixin.qq.com/', adminUrl: 'https://mp.weixin.qq.com/', cookieDomain: 'qq.com', nameSelectors: ['.weui-desktop-account__name', '.account_name', '[class*="account"] [class*="name"]'], avatarSelectors: ['.weui-desktop-account__avatar img', 'img[class*="avatar"]'], loginMarkers: ['登录', '扫码登录', '请登录'], publishingSupported: false },
  weibo: { id: 'weibo', name: 'Weibo', nameZh: '微博', loginUrl: 'https://weibo.com/login.php', adminUrl: 'https://weibo.com/', cookieDomain: 'weibo.com', nameSelectors: ['.S_txt1', '[class*="name"]'], avatarSelectors: ['img[class*="avatar"]', '[class*="avatar"] img'], loginMarkers: ['登录', '注册'], publishingSupported: false },
  baijiahao: { id: 'baijiahao', name: 'Baijiahao', nameZh: '百度百家号', loginUrl: 'https://baijiahao.baidu.com/', adminUrl: 'https://baijiahao.baidu.com/', cookieDomain: 'baidu.com', nameSelectors: ['[class*="user"] [class*="name"]', '[class*="account"]'], avatarSelectors: ['img[class*="avatar"]'], loginMarkers: ['登录', '请登录'], publishingSupported: false },
  toutiao: { id: 'toutiao', name: 'Toutiao', nameZh: '今日头条', loginUrl: 'https://mp.toutiao.com/', adminUrl: 'https://mp.toutiao.com/', cookieDomain: 'toutiao.com', nameSelectors: ['[class*="user"] [class*="name"]', '[class*="account"]'], avatarSelectors: ['img[class*="avatar"]'], loginMarkers: ['登录', '请登录'], publishingSupported: false },
  douyin: { id: 'douyin', name: 'Douyin', nameZh: '抖音', loginUrl: 'https://creator.douyin.com/', adminUrl: 'https://creator.douyin.com/', cookieDomain: 'douyin.com', nameSelectors: ['[class*="user"] [class*="name"]', '[class*="account"]'], avatarSelectors: ['img[class*="avatar"]'], loginMarkers: ['登录', '扫码登录'], publishingSupported: false },
  sohu: { id: 'sohu', name: 'Sohu', nameZh: '搜狐号', loginUrl: 'https://mp.sohu.com/', adminUrl: 'https://mp.sohu.com/', cookieDomain: 'sohu.com', nameSelectors: ['[class*="user"] [class*="name"]'], avatarSelectors: ['img[class*="avatar"]'], loginMarkers: ['登录', '请登录'], publishingSupported: false },
  netease: { id: 'netease', name: 'NetEase', nameZh: '网易号', loginUrl: 'https://mp.163.com/', adminUrl: 'https://mp.163.com/', cookieDomain: '163.com', nameSelectors: ['[class*="user"] [class*="name"]'], avatarSelectors: ['img[class*="avatar"]'], loginMarkers: ['登录', '请登录'], publishingSupported: false },
  penguin: { id: 'penguin', name: 'Tencent Penguin', nameZh: '腾讯企鹅号', loginUrl: 'https://om.qq.com/', adminUrl: 'https://om.qq.com/', cookieDomain: 'qq.com', nameSelectors: ['[class*="user"] [class*="name"]'], avatarSelectors: ['img[class*="avatar"]'], loginMarkers: ['登录', '请登录'], publishingSupported: false },
  csdn: { id: 'csdn', name: 'CSDN', nameZh: 'CSDN', loginUrl: 'https://passport.csdn.net/login', adminUrl: 'https://mp.csdn.net/console', cookieDomain: 'csdn.net', nameSelectors: ['.user-name', '[class*="user"] [class*="name"]'], avatarSelectors: ['img[class*="avatar"]'], loginMarkers: ['登录', '注册'], publishingSupported: false },
  xiaohongshu: { id: 'xiaohongshu', name: 'Xiaohongshu', nameZh: '小红书', loginUrl: 'https://creator.xiaohongshu.com/', adminUrl: 'https://creator.xiaohongshu.com/', cookieDomain: 'xiaohongshu.com', nameSelectors: ['[class*="user"] [class*="name"]'], avatarSelectors: ['img[class*="avatar"]'], loginMarkers: ['登录', '扫码登录'], publishingSupported: false },
  bilibili: { id: 'bilibili', name: 'Bilibili', nameZh: '哔哩哔哩', loginUrl: 'https://member.bilibili.com/platform/home', adminUrl: 'https://member.bilibili.com/platform/home', cookieDomain: 'bilibili.com', nameSelectors: ['[class*="user"] [class*="name"]'], avatarSelectors: ['img[class*="avatar"]'], loginMarkers: ['登录', '注册'], publishingSupported: false },
}

export function getPlatformAuthConfig(platformId) {
  const config = platformAuthConfigs[String(platformId || '').trim()]
  return config ? { ...structuredClone(config), selectorsValidated: false } : null
}

// TikTok 相关常量配置

// TikTok授权URL
export const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize?client_key=7519030880531447825&scope=biz.brand.insights%2Ccomment.list%2Cuser.info.basic%2Cuser.info.username%2Cuser.info.stats%2Cuser.info.profile%2Cuser.account.type%2Cuser.insights%2Cvideo.list%2Cvideo.insights%2Ccomment.list.manage%2Cvideo.publish%2Cvideo.upload%2Cbiz.spark.auth%2Cdiscovery.search.words%2Cbiz.ads.recommend%2Cbiz.creator.info%2Cbiz.creator.insights%2Ctto.campaign.link&response_type=code&redirect_uri=https%3A%2F%2Fltexpress.huokechuangxin.cn%2FgetOpenTkToken';

// TikTok用户信息接口（通过本地API代理，避免CORS问题）
export const TIKTOK_USER_INFO_API = '/api/getTkUserInfo';

// TikTok视频列表接口（通过本地API代理，避免CORS问题）
export const TIKTOK_VIDEO_LIST_API = '/api/getTkVideoList';

// TikTok刷新Token接口（通过本地API代理）
export const TIKTOK_REFRESH_TOKEN_API = '/api/refreshTkToken';

// TikTok发布状态接口（通过本地API代理）
export const TIKTOK_PUBLISH_STATUS_API = '/api/getPublishStatus';

// Apimart Sora2 视频生成（通过本地API代理）
export const APIMART_VIDEO_GENERATE_API = '/api/generateApimart';
// Apimart 任务状态查询（通过本地API代理）
export const APIMART_TASK_STATUS_API = '/api/getApimartTaskStatus';

// TikHub - 根据分享链接获取视频数据（通过本地API代理）
export const TIKHUB_FETCH_ONE_VIDEO_API = '/api/fetchSocialVideo';


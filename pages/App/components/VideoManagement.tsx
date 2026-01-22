'use client'
import { bitable, ITableMeta, FieldType } from "@lark-base-open/js-sdk";
import { Button, Form, Toast, Typography, Space, Progress } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef, useCallback } from 'react';
import { BaseFormApi } from '@douyinfe/semi-foundation/lib/es/form/interface';
import { TIKTOK_VIDEO_LIST_API, TIKTOK_REFRESH_TOKEN_API } from '../constants';
import { 
  getFieldStringValue, 
  getFieldTypeByValue, 
  convertValueByFieldType,
  findOrCreateField 
} from '../utils/fieldUtils';

const { Title, Text } = Typography;

// 视频字段名映射：API返回的字段名 -> 表格中的中文字段名
const VIDEO_FIELD_MAPPING: Record<string, string> = {
  'caption': '标题',
  'comments': '评论数',
  'favorites': '收藏数',
  'likes': '点赞数',
  'total_time_watched': '观看总时长',
  'video_views': '视频浏览量',
  'shares': '视频分享数',
  'full_video_watched_rate': '完播率',
  'average_time_watched': '平均观看时长',
};

// 高光分析算法配置
const HIGHLIGHT_CONFIG = {
  // 权重配置
  retentionWeight: 0.6, // 观众留存率权重
  likeWeight: 0.4, // 互动点赞权重
  
  // 高光帧配置
  highlightFrame: {
    minLikePercentage: 0.05, // 最小点赞率阈值（5%）
    topN: 5 // 取前N个高光帧
  },
  
  // 高光片段配置
  highlightSegment: {
    minRetentionPercentage: 0.7, // 最小留存率阈值（70%）
    minSegmentDuration: 3, // 最小片段时长（秒）
    maxSegmentDuration: 15, // 最大片段时长（秒）
    mergeThreshold: 2 // 合并阈值：如果两个片段间隔小于此值（秒），则合并
  }
};

/**
 * 计算高光帧（基于互动点赞）
 * @param engagementLikes 互动点赞数据 [{ second: string, percentage: float }]
 * @returns 高光帧数组 [{ second: number, percentage: number, score: number }]
 */
function calculateHighlightFrames(engagementLikes: any[]): Array<{ second: number; percentage: number; score: number }> {
  if (!Array.isArray(engagementLikes) || engagementLikes.length === 0) {
    return [];
  }

  const frames = engagementLikes
    .map(item => ({
      second: parseInt(item.second || '0', 10),
      percentage: parseFloat(item.percentage || '0'),
      score: parseFloat(item.percentage || '0') * HIGHLIGHT_CONFIG.likeWeight
    }))
    .filter(frame => frame.percentage >= HIGHLIGHT_CONFIG.highlightFrame.minLikePercentage)
    .sort((a, b) => b.score - a.score)
    .slice(0, HIGHLIGHT_CONFIG.highlightFrame.topN);

  return frames;
}

/**
 * 计算高光片段（基于观众留存率和互动点赞的加权算法）
 * @param videoViewRetention 观众留存率数据 [{ second: string, percentage: float }]
 * @param engagementLikes 互动点赞数据 [{ second: string, percentage: float }]
 * @returns 高光片段数组 [{ start: number, end: number, score: number, avgRetention: number, avgLike: number }]
 */
function calculateHighlightSegments(
  videoViewRetention: any[],
  engagementLikes: any[]
): Array<{ start: number; end: number; score: number; avgRetention: number; avgLike: number }> {
  if (!Array.isArray(videoViewRetention) || videoViewRetention.length === 0) {
    return [];
  }

  // 构建时间点数据映射（包含留存率和点赞率）
  const timePointMap = new Map<number, { retention: number; like: number }>();
  
  // 填充留存率数据
  videoViewRetention.forEach(item => {
    const second = parseInt(item.second || '0', 10);
    const retention = parseFloat(item.percentage || '0');
    timePointMap.set(second, { retention, like: 0 });
  });
  
  // 填充点赞率数据
  if (Array.isArray(engagementLikes)) {
    engagementLikes.forEach(item => {
      const second = parseInt(item.second || '0', 10);
      const like = parseFloat(item.percentage || '0');
      if (timePointMap.has(second)) {
        timePointMap.get(second)!.like = like;
      } else {
        timePointMap.set(second, { retention: 0, like });
      }
    });
  }

  // 计算每个时间点的加权分数
  const timePoints = Array.from(timePointMap.entries())
    .map(([second, data]) => ({
      second,
      retention: data.retention,
      like: data.like,
      score: data.retention * HIGHLIGHT_CONFIG.retentionWeight + data.like * HIGHLIGHT_CONFIG.likeWeight
    }))
    .sort((a, b) => a.second - b.second);

  // 找到高光片段
  const segments: Array<{ start: number; end: number; score: number; avgRetention: number; avgLike: number }> = [];
  let currentSegment: { start: number; end: number; scores: number[]; retentions: number[]; likes: number[] } | null = null;

  for (const point of timePoints) {
    const isHighScore = point.score >= (
      HIGHLIGHT_CONFIG.highlightSegment.minRetentionPercentage * HIGHLIGHT_CONFIG.retentionWeight
    );

    if (isHighScore) {
      if (!currentSegment) {
        currentSegment = {
          start: point.second,
          end: point.second,
          scores: [point.score],
          retentions: [point.retention],
          likes: [point.like]
        };
      } else {
        currentSegment.end = point.second;
        currentSegment.scores.push(point.score);
        currentSegment.retentions.push(point.retention);
        currentSegment.likes.push(point.like);
      }
    } else {
      if (currentSegment) {
        const duration = currentSegment.end - currentSegment.start;
        if (duration >= HIGHLIGHT_CONFIG.highlightSegment.minSegmentDuration) {
          const avgScore = currentSegment.scores.reduce((a, b) => a + b, 0) / currentSegment.scores.length;
          const avgRetention = currentSegment.retentions.reduce((a, b) => a + b, 0) / currentSegment.retentions.length;
          const avgLike = currentSegment.likes.reduce((a, b) => a + b, 0) / currentSegment.likes.length;
          
          segments.push({
            start: currentSegment.start,
            end: currentSegment.end,
            score: avgScore,
            avgRetention,
            avgLike
          });
        }
        currentSegment = null;
      }
    }
  }

  // 处理最后一个片段
  if (currentSegment) {
    const duration = currentSegment.end - currentSegment.start;
    if (duration >= HIGHLIGHT_CONFIG.highlightSegment.minSegmentDuration) {
      const avgScore = currentSegment.scores.reduce((a, b) => a + b, 0) / currentSegment.scores.length;
      const avgRetention = currentSegment.retentions.reduce((a, b) => a + b, 0) / currentSegment.retentions.length;
      const avgLike = currentSegment.likes.reduce((a, b) => a + b, 0) / currentSegment.likes.length;
      
      segments.push({
        start: currentSegment.start,
        end: currentSegment.end,
        score: avgScore,
        avgRetention,
        avgLike
      });
    }
  }

  // 合并相邻的片段
  const mergedSegments: typeof segments = [];
  for (const segment of segments) {
    if (mergedSegments.length === 0) {
      mergedSegments.push(segment);
    } else {
      const lastSegment = mergedSegments[mergedSegments.length - 1];
      const gap = segment.start - lastSegment.end;
      
      if (gap <= HIGHLIGHT_CONFIG.highlightSegment.mergeThreshold) {
        // 合并片段
        lastSegment.end = segment.end;
        lastSegment.score = (lastSegment.score + segment.score) / 2;
        lastSegment.avgRetention = (lastSegment.avgRetention + segment.avgRetention) / 2;
        lastSegment.avgLike = (lastSegment.avgLike + segment.avgLike) / 2;
      } else {
        mergedSegments.push(segment);
      }
    }
  }

  // 过滤超过最大时长的片段
  return mergedSegments
    .filter(seg => (seg.end - seg.start) <= HIGHLIGHT_CONFIG.highlightSegment.maxSegmentDuration)
    .sort((a, b) => b.score - a.score); // 按分数降序排列
}

// 默认请求的字段列表
const DEFAULT_VIDEO_FIELDS = [
  'item_id',
  'create_time',
  'thumbnail_url',
  'share_url',
  'embed_url',
  'caption',
  'video_views',
  'likes',
  'comments',
  'shares',
  'favorites',
  'reach',
  'video_duration',
  'full_video_watched_rate',
  'total_time_watched',
  'average_time_watched',
  'impression_sources',
  'audience_countries',
  'media_type',
  // 以下字段用于视频高光分析
  'video_view_retention', // 观众留存率：说明在一段时间后仍在观看视频的观众数量，用于高光片段分析
  'engagement_likes' // 互动点赞：在视频的某个时间点点赞视频的观众的分布，用于高光帧分析
];

export default function VideoManagement() {
  const [accountTableMetaList, setAccountTableMetaList] = useState<ITableMeta[]>();
  const [videoTableMetaList, setVideoTableMetaList] = useState<ITableMeta[]>();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const formApi = useRef<BaseFormApi>();

  // 刷新Token
  const refreshToken = useCallback(async (refreshTokenValue: string): Promise<any> => {
    try {
      console.log(`正在刷新Token...`);
      const response = await fetch(TIKTOK_REFRESH_TOKEN_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: refreshTokenValue
        })
      });

      const result = await response.json();

      if (result.code === 0 && result.data) {
        console.log(`✅ Token刷新成功`);
        return result.data;
      } else {
        throw new Error(result.error || result.message || '刷新Token失败');
      }
    } catch (error: any) {
      console.error('刷新Token失败:', error);
      throw error;
    }
  }, []);

  // 查找视频记录（通过 item_id）
  const findVideoByItemId = useCallback(async (
    table: any,
    itemIdField: any,
    itemId: string
  ): Promise<string | null> => {
    try {
      const records = await table.getRecords({ pageSize: 5000 });
      
      for (const record of records.records) {
        const recordItemId = await getFieldStringValue(table, itemIdField, record.recordId);
        if (recordItemId && String(recordItemId).trim() === String(itemId).trim()) {
          return record.recordId;
        }
      }
      
      return null;
    } catch (e) {
      console.warn('查找视频记录失败:', e);
      return null;
    }
  }, []);

  // 获取视频列表
  const handleFetchVideoList = useCallback(async ({ 
    accountTable: accountTableId, 
    videoTable: videoTableId 
  }: { 
    accountTable: string; 
    videoTable: string;
  }) => {
    if (!accountTableId) {
      Toast.error('请先选择账号列表');
      return;
    }

    if (!videoTableId) {
      Toast.error('请先选择视频列表');
      return;
    }

    setLoading(true);
    setProgress(0);
    setStatus('开始获取视频列表...');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    let totalVideos = 0;

    try {
      // 获取账号列表和视频列表
      const accountTable = await bitable.base.getTableById(accountTableId);
      const videoTable = await bitable.base.getTableById(videoTableId);

      // 获取账号列表的字段
      let accountFieldList = await accountTable.getFieldList();
      console.log('账号列表字段:', accountFieldList.map((f: any) => ({ id: f.id, name: f.name })));
      
      let accessTokenField = accountFieldList.find((f: any) => f.name === 'access_token');
      let openIdField = accountFieldList.find((f: any) => f.name === 'open_id');
      let refreshTokenField: any = null;
      let tokenExpiresTimeField: any = null;

      // 查找refresh_token和token失效时间字段
      for (const field of accountFieldList) {
        try {
          const fieldName = await field.getName();
          if (fieldName === 'refresh_token' || fieldName === '刷新令牌') {
            refreshTokenField = field;
          } else if (fieldName === 'token失效时间' || fieldName === 'token_expires_time' || fieldName === 'expires_time') {
            tokenExpiresTimeField = field;
          }
        } catch (e) {
          console.warn('获取字段名称失败:', e);
        }
      }

      // 如果字段不存在，尝试通过名称获取
      if (!refreshTokenField) {
        try {
          refreshTokenField = await accountTable.getFieldByName('refresh_token');
        } catch (e) {
          console.warn('refresh_token字段不存在');
        }
      }

      if (!tokenExpiresTimeField) {
        try {
          tokenExpiresTimeField = await accountTable.getFieldByName('token失效时间');
        } catch (e) {
          console.warn('token失效时间字段不存在');
        }
      }

      if (!refreshTokenField) {
        console.warn('⚠️ 账号列表中未找到 refresh_token 字段，将无法自动刷新Token');
      } else {
        console.log('✅ 找到 refresh_token 字段');
      }

      if (!tokenExpiresTimeField) {
        console.warn('⚠️ 账号列表中未找到 token失效时间 字段，将无法判断Token是否失效（将在API调用失败时尝试刷新）');
      } else {
        console.log('✅ 找到 token失效时间 字段');
      }

      // 如果字段不存在，尝试通过名称获取（可能在其他地方已创建）
      if (!accessTokenField) {
        try {
          accessTokenField = await accountTable.getFieldByName('access_token');
          if (accessTokenField) {
            console.log('通过 getFieldByName 找到 access_token 字段');  
            const existingIndex = accountFieldList.findIndex((f: any) => f.id === accessTokenField!.id);
            if (existingIndex === -1) {
              accountFieldList.push(accessTokenField);
            }
          }
        } catch (e) {
          console.warn('access_token字段不存在:', e);
        }
      } else {
        console.log('找到 access_token 字段:', accessTokenField.id);
      }

      if (!openIdField) {
        try {
          openIdField = await accountTable.getFieldByName('open_id');
          if (openIdField) {
            console.log('通过 getFieldByName 找到 open_id 字段');       
            const existingIndex = accountFieldList.findIndex((f: any) => f.id === openIdField!.id);
            if (existingIndex === -1) {
              accountFieldList.push(openIdField);
            }
          }
        } catch (e) {
          console.warn('open_id字段不存在:', e);
        }
      } else {
        console.log('找到 open_id 字段:', openIdField.id);
      }

      // 必须同时存在 access_token 和 open_id 字段
      if (!accessTokenField) {
        const fieldNames = accountFieldList.map((f: any) => f.name).join(', ');
        Toast.error(`账号列表中未找到 access_token 字段。当前字段: ${fieldNames || '无'}`);
        console.error('账号列表字段列表:', fieldNames);
        setLoading(false);
        return;
      }

      if (!openIdField) {
        const fieldNames = accountFieldList.map((f: any) => f.name).join(', ');
        Toast.error(`账号列表中未找到 open_id 字段。当前字段: ${fieldNames || '无'}`);
        console.error('账号列表字段列表:', fieldNames);
        setLoading(false);
        return;
      }

      // 获取视频列表的字段
      let videoFieldList = await videoTable.getFieldList();

      // 确保视频列表中有 item_id 字段（用于判断视频是否已存在）
      let itemIdField = await findOrCreateField(videoTable, videoFieldList, 'item_id', FieldType.Text);
      if (!itemIdField) {
        Toast.error('无法创建或获取 item_id 字段');
        setLoading(false);
        return;
      }
      videoFieldList = await videoTable.getFieldList();

      // 确保有 open_id 字段（用于关联账号）
      let videoOpenIdField = await findOrCreateField(videoTable, videoFieldList, 'open_id', FieldType.Text);
      if (!videoOpenIdField) {
        Toast.error('无法创建或获取 open_id 字段');
        setLoading(false);
        return;
      }
      videoFieldList = await videoTable.getFieldList();

      // 获取所有账号记录
      const accountRecords = await accountTable.getRecords({ pageSize: 5000 });
      const totalAccounts = accountRecords.records.length;

      console.log(`开始处理 ${totalAccounts} 个账号的视频列表`);

      // 遍历每个账号
      for (let i = 0; i < totalAccounts; i++) {
        const accountRecord = accountRecords.records[i];
        const accountRecordId = accountRecord.recordId;

        setProgress(Math.round(((i + 1) / totalAccounts) * 100));
        setStatus(`正在处理账号 ${i + 1}/${totalAccounts}...`);

        try {
          // 获取账号的 access_token 和 open_id
          let accessToken = await getFieldStringValue(accountTable, accessTokenField, accountRecordId);
          const openId = await getFieldStringValue(accountTable, openIdField, accountRecordId);

          if (!accessToken || !openId) {
            console.log(`账号 ${i + 1} 缺少 access_token 或 open_id，跳过`);
            skipCount++;
            continue;
          }

          let accessTokenStr = String(accessToken).trim();

          // 刷新Token的通用函数
          const refreshTokenIfNeeded = async (): Promise<boolean> => {
            console.log(`开始尝试刷新Token...`);
            if (refreshTokenField) {
              const refreshTokenValue = await getFieldStringValue(accountTable, refreshTokenField, accountRecordId);
              if (refreshTokenValue) {
                try {
                  console.log(`找到refresh_token，开始刷新...`);
                  const newTokenData = await refreshToken(String(refreshTokenValue).trim());
                  
                  // 更新账号列表中的token信息
                  const now = Date.now();
                  const updateFields: Record<string, any> = {};
                  if (accessTokenField) {
                    updateFields[accessTokenField.id] = newTokenData.access_token;
                  }
                  
                  if (refreshTokenField && newTokenData.refresh_token) {
                    updateFields[refreshTokenField.id] = newTokenData.refresh_token;
                  }
                  
                  // 计算新的失效时间（expires_in是秒数）
                  if (tokenExpiresTimeField && newTokenData.expires_in) {
                    const newExpiresTime = new Date(now + newTokenData.expires_in * 1000);
                    updateFields[tokenExpiresTimeField.id] = newExpiresTime.toISOString();
                    console.log(`新的Token失效时间: ${newExpiresTime.toLocaleString()}`);
                  }
                  
                  // 更新记录
                  await accountTable.setRecord(accountRecordId, { fields: updateFields });
                  console.log(`✅ 已更新账号列表中的Token信息`);
                  
                  // 使用新的access_token
                  accessTokenStr = newTokenData.access_token;
                  Toast.success(`账号 ${i + 1} Token已自动刷新并更新到账号列表`);
                  return true;
                } catch (refreshError: any) {
                  console.error(`❌ Token刷新失败:`, refreshError);
                  Toast.warning(`账号 ${i + 1} Token刷新失败: ${refreshError.message || '未知错误'}，请手动更新Token`);
                  return false;
                }
              } else {
                console.warn(`⚠️ 未找到refresh_token值，无法刷新Token`);
                return false;
              }
            } else {
              console.warn(`⚠️ 账号列表中未找到refresh_token字段，无法自动刷新Token`);
              return false;
            }
          };

          // 检查Token失效时间并刷新（如果失效）
          if (tokenExpiresTimeField) {
            try {
              const expiresTimeValue = await getFieldStringValue(accountTable, tokenExpiresTimeField, accountRecordId);
              if (expiresTimeValue) {
                const expiresTime = new Date(expiresTimeValue).getTime();
                const now = Date.now();
                const timeUntilExpiry = expiresTime - now;
                
                console.log(`Token失效时间检查: ${new Date(expiresTime).toLocaleString()}, 剩余时间: ${Math.round(timeUntilExpiry / 1000 / 60)}分钟`);
                
                // 如果Token已失效或将在5分钟内失效，尝试刷新
                if (timeUntilExpiry < 5 * 60 * 1000) { // 5分钟缓冲时间
                  console.log(`⚠️ Token即将失效或已失效，尝试刷新...`);
                  await refreshTokenIfNeeded();
                }
              } else {
                console.log(`⚠️ Token失效时间字段为空，无法判断是否失效`);
              }
            } catch (e) {
              console.warn(`检查Token失效时间失败:`, e);
            }
          } else {
            console.log(`⚠️ 未找到token失效时间字段，跳过失效检查（将在API调用失败时尝试刷新）`);
          }

          console.log(`获取账号 ${i + 1} (open_id: ${openId}) 的视频列表...`);

          // 调用API获取视频列表
          let cursor: number | undefined = undefined;
          let hasMore = true;
          let pageCount = 0;

          while (hasMore) {
            try {
              // 构建请求URL（使用可能已刷新的accessTokenStr）
              let apiUrl = `${TIKTOK_VIDEO_LIST_API}?access_token=${encodeURIComponent(accessTokenStr)}&business_id=${encodeURIComponent(openId)}&fields=${encodeURIComponent(JSON.stringify(DEFAULT_VIDEO_FIELDS))}&max_count=20`;
              
              if (cursor !== undefined) {
                apiUrl += `&cursor=${cursor}`;
              }

              console.log(`请求视频列表，URL: ${apiUrl.replace(/access_token=[^&]+/, 'access_token=***')}`);

              const response = await fetch(apiUrl);
              
              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`请求失败: ${response.status} ${response.statusText} - ${errorText}`);
              }

              const result = await response.json();

              if (result.code !== 0) {
                const errorMessage = result.message || result.error || '获取视频列表失败';
                
                // 如果错误是token相关，尝试刷新token并重试
                if (errorMessage.includes('Access token') || errorMessage.includes('token') || errorMessage.includes('revoked')) {
                  console.log(`⚠️ 检测到Token错误: ${errorMessage}，尝试刷新Token并重试...`);
                  const refreshed = await refreshTokenIfNeeded();
                  
                  if (refreshed) {
                    // 使用新的token重新执行当前请求（continue会重新执行while循环）
                    console.log(`✅ Token已刷新，重新执行当前请求...`);
                    continue; // 重新执行while循环，使用新的accessTokenStr
                  } else {
                    throw new Error(`Token刷新失败: ${errorMessage}`);
                  }
                } else {
                  throw new Error(errorMessage);
                }
              }

              if (!result.data || !result.data.videos) {
                console.log(`账号 ${i + 1} 没有视频数据`);
                break;
              }

              const videos = result.data.videos;
              console.log(`账号 ${i + 1} 获取到 ${videos.length} 个视频`);

              // 处理每个视频
              for (const video of videos) {
                try {
                  // 检查视频是否已存在（通过 item_id）
                  const existingRecordId = await findVideoByItemId(videoTable, itemIdField, video.item_id);

                  // 准备要保存的字段数据
                  const fields: Record<string, any> = {};

                  // 保存 open_id（关联账号）
                  fields[videoOpenIdField.id] = openId;

                  // 计算高光帧和高光片段
                  let highlightFrames: any[] = [];
                  let highlightSegments: any[] = [];
                  
                  try {
                    const videoViewRetention = video.video_view_retention;
                    const engagementLikes = video.engagement_likes;
                    
                    // 计算高光帧
                    if (engagementLikes) {
                      highlightFrames = calculateHighlightFrames(engagementLikes);
                    }
                    
                    // 计算高光片段
                    if (videoViewRetention) {
                      highlightSegments = calculateHighlightSegments(videoViewRetention, engagementLikes || []);
                    }
                    
                    // 保存高光帧（格式：n秒, n秒）
                    if (highlightFrames.length > 0) {
                      const highlightFramesField = await findOrCreateField(
                        videoTable,
                        videoFieldList,
                        'highlight_frames',
                        FieldType.Text
                      );
                      if (highlightFramesField) {
                        // 格式化为 "n秒, n秒" 格式
                        const framesText = highlightFrames
                          .map(frame => `${frame.second}秒`)
                          .join(', ');
                        fields[highlightFramesField.id] = framesText;
                        console.log(`✅ 计算高光帧: ${highlightFrames.length} 个 - ${framesText}`);
                      }
                    }
                    
                    // 保存高光片段（格式：n~m秒, n~m秒）
                    if (highlightSegments.length > 0) {
                      const highlightSegmentsField = await findOrCreateField(
                        videoTable,
                        videoFieldList,
                        'highlight_segments',
                        FieldType.Text
                      );
                      if (highlightSegmentsField) {
                        // 格式化为 "n~m秒, n~m秒" 格式
                        const segmentsText = highlightSegments
                          .map(segment => `${segment.start}~${segment.end}秒`)
                          .join(', ');
                        fields[highlightSegmentsField.id] = segmentsText;
                        console.log(`✅ 计算高光片段: ${highlightSegments.length} 个 - ${segmentsText}`);
                      }
                    }
                  } catch (highlightError) {
                    console.warn(`计算高光帧/片段失败 (视频 ${video.item_id}):`, highlightError);
                  }

                  // 遍历视频数据中的每个字段
                  for (const [key, value] of Object.entries(video)) {
                    try {
                      // 跳过 item_id，因为已经用于查找记录
                      if (key === 'item_id') {
                        if (itemIdField) {
                          fields[itemIdField.id] = String(value);
                        }
                        continue;
                      }

                      // 使用字段名映射：如果API返回的字段名在映射表中，使用映射后的中文字段名
                      const fieldName = VIDEO_FIELD_MAPPING[key] || key;

                      // 处理复杂对象字段（如数组、对象）
                      let fieldValue: any = value;
                      if (value !== null && value !== undefined) {
                        if (Array.isArray(value) || (typeof value === 'object' && value.constructor === Object)) {
                          // 将复杂对象转换为JSON字符串
                          fieldValue = JSON.stringify(value);
                        }
                      }

                      // 查找或创建字段
                      let field = await findOrCreateField(
                        videoTable,
                        videoFieldList,
                        fieldName,
                        getFieldTypeByValue(fieldValue)
                      );

                      if (!field) {
                        console.warn(`字段 ${key} -> ${fieldName} 不存在且创建失败，跳过`);
                        continue;
                      }

                      // 转换值
                      const convertedValue = await convertValueByFieldType(field, fieldValue);
                      
                      if (convertedValue !== null && convertedValue !== undefined) {
                        fields[field.id] = convertedValue;
                        console.log(`字段 ${key} -> ${fieldName} (${field.id}) 保存值:`, convertedValue);
                      }
                    } catch (e) {
                      console.error(`处理视频字段 ${key} 时出错:`, e);
                    }
                  }

                  // 保存或更新记录
                  if (existingRecordId) {
                    await videoTable.setRecord(existingRecordId, { fields });
                    console.log(`✅ 更新视频 ${video.item_id}`);
                  } else {
                    await videoTable.addRecord({ fields });
                    console.log(`✅ 新增视频 ${video.item_id}`);
                    totalVideos++;
                  }
                } catch (e: any) {
                  console.error(`处理视频 ${video.item_id} 时出错:`, e);
                  errorCount++;
                }
              }

              // 检查是否还有更多数据
              hasMore = result.data.has_more === true;
              cursor = result.data.cursor;

              pageCount++;
              
              // 如果已经获取了很多页，可以限制一下（避免无限循环）
              if (pageCount >= 50) {
                console.log(`账号 ${i + 1} 已获取 ${pageCount} 页，停止获取`);
                break;
              }

              // 添加延迟，避免请求过快
              if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } catch (e: any) {
              console.error(`获取账号 ${i + 1} 的视频列表失败:`, e);
              errorCount++;
              break; // 跳出当前账号的循环
            }
          }

          successCount++;
        } catch (e: any) {
          console.error(`处理账号 ${i + 1} 失败:`, e);
          errorCount++;
        }
      }

      // 显示最终结果
      const message = `获取完成！成功: ${successCount}，跳过: ${skipCount}，失败: ${errorCount}，新增视频: ${totalVideos}`;
      if (errorCount === 0) {
        Toast.success(message);
      } else {
        Toast.warning(message);
      }
      setStatus(message);

    } catch (error: any) {
      console.error('获取视频列表失败:', error);
      Toast.error(`获取失败: ${error.message || '未知错误'}`);
      setStatus(`获取失败: ${error.message || '未知错误'}`);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  }, [findVideoByItemId, refreshToken]);

  useEffect(() => {
    Promise.all([
      bitable.base.getTableMetaList(),
      bitable.base.getSelection()
    ]).then(([metaList, selection]) => {
      setAccountTableMetaList(metaList);
      setVideoTableMetaList(metaList);
      
      // 根据表名查找并默认选中
      const accountTableId = metaList.find(table => table.name === '账号列表')?.id || selection.tableId;
      const videoTableId = metaList.find(table => table.name === '视频列表')?.id || selection.tableId;
      
      formApi.current?.setValues({ 
        accountTable: accountTableId,
        videoTable: videoTableId 
      });
    });
  }, []);

  return (
    <div>
      <Title heading={4} style={{ marginBottom: '1rem' }}>
        TikTok 视频数据分析
      </Title>
      <Text type="tertiary" style={{ marginBottom: '1rem', display: 'block' }}>
        批量获取 TikTok 账号的视频数据，包括播放量、点赞数、评论数、分享数等关键指标，并自动计算视频高光帧和高光片段，帮助您分析视频表现。
      </Text>
      
      <Form 
        labelPosition='top' 
        onSubmit={handleFetchVideoList} 
        getFormApi={(baseFormApi: BaseFormApi) => formApi.current = baseFormApi}
        style={{ marginTop: '1rem' }}
      >
        <Form.Slot label="使用说明">
          <div style={{ marginBottom: '1rem', fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
            <div><strong>功能说明：</strong> 从 TikTok API 获取账号的所有视频数据，包括播放量、点赞数、评论数、分享数、完播率等详细指标</div>
            <div style={{ marginTop: '0.5rem' }}>
              <strong>操作步骤：</strong>
              <div style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                <div>1. 选择账号列表（包含 access_token 和 open_id 字段的数据表）</div>
                <div>2. 选择视频列表（用于保存视频数据的数据表）</div>
                <div>3. 点击&ldquo;获取视频列表&rdquo;按钮开始同步</div>
                <div>4. 系统将自动遍历所有账号，获取每个账号的视频数据并保存</div>
              </div>
            </div>
            <div style={{ marginTop: '0.5rem', color: '#1890ff', fontWeight: '500' }}>
              💡 提示：系统会自动创建所需字段。如果视频已存在（通过 item_id 判断），将自动更新数据；不存在则新增记录。系统还会自动计算视频的高光帧和高光片段，帮助您快速定位视频亮点。
            </div>
            <div style={{ marginTop: '0.5rem', color: '#fa8c16', fontWeight: '500' }}>
              ⚠️ 注意：此操作会调用 TikTok API 获取所有账号的视频数据，可能需要较长时间，请耐心等待
            </div>
          </div>
        </Form.Slot>

        <Space vertical spacing="loose" style={{ width: '100%' }}>
          <Form.Select 
            field='accountTable' 
            label='选择账号列表' 
            placeholder="请选择账号列表" 
            style={{ width: '100%' }}
            rules={[{ required: true, message: '请选择账号列表' }]}
          >
            {
              Array.isArray(accountTableMetaList) && accountTableMetaList.map(({ name, id }) => {
                return (
                  <Form.Select.Option key={id} value={id}>
                    {name}
                  </Form.Select.Option>
                );
              })
            }
          </Form.Select>

          <Form.Select 
            field='videoTable' 
            label='选择视频列表' 
            placeholder="请选择视频列表" 
            style={{ width: '100%' }}
            rules={[{ required: true, message: '请选择视频列表' }]}
          >
            {
              Array.isArray(videoTableMetaList) && videoTableMetaList.map(({ name, id }) => {
                return (
                  <Form.Select.Option key={id} value={id}>
                    {name}
                  </Form.Select.Option>
                );
              })
            }
          </Form.Select>

          <Button 
            theme='solid' 
            type="primary"
            htmlType='submit' 
            loading={loading}
            style={{ width: '100%' }}
          >
            获取视频列表
          </Button>

          {loading && (
            <div style={{ marginTop: '1rem' }}>
              <Progress percent={progress} type="line" size="small" />
              <Text style={{ marginTop: '0.5rem', display: 'block' }}>{status}</Text>
            </div>
          )}
        </Space>
      </Form>
    </div>
  );
}


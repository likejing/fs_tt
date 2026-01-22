'use client'

import { bitable, ITableMeta, FieldType } from "@lark-base-open/js-sdk";
import { Button, Form, Toast, Typography, Space, Progress } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { BaseFormApi } from '@douyinfe/semi-foundation/lib/es/form/interface';
import { findOrCreateField, convertValueByFieldType } from '../utils/fieldUtils';
import { TIKHUB_FETCH_ONE_VIDEO_API } from '../constants';

const { Title, Text } = Typography;

// 预定义需要创建的字段（仅创建列，不写入数据）
// 后续接口返回的数据会按这些字段填充
const FIELD_DEFINITIONS: { name: string; type: FieldType; desc?: string }[] = [
  // 基本信息
  { name: '视频ID', type: FieldType.Text, desc: 'aweme_id' },
  { name: '分享链接', type: FieldType.Text, desc: 'share_url / params.share_url' },
  { name: '视频描述', type: FieldType.Text, desc: 'desc / content_desc' },
  { name: '语言', type: FieldType.Text, desc: 'desc_language' },
  { name: '国家/地区', type: FieldType.Text, desc: 'region' },
  { name: '发布时间戳', type: FieldType.Number, desc: 'create_time' },

  // 作者信息
  { name: '作者UID', type: FieldType.Text, desc: 'author.uid' },
  { name: '作者sec_uid', type: FieldType.Text, desc: 'author.sec_uid' },
  { name: '作者昵称', type: FieldType.Text, desc: 'author.nickname' },
  { name: '作者唯一ID', type: FieldType.Text, desc: 'author.unique_id' },
  { name: '作者简介', type: FieldType.Text, desc: 'author.signature' },
  { name: '作者地区', type: FieldType.Text, desc: 'author.region' },
  { name: '作者粉丝数', type: FieldType.Number, desc: 'author.follower_count' },
  { name: '作者获赞总数', type: FieldType.Number, desc: 'author.total_favorited' },

  // 音乐信息
  { name: '音乐标题', type: FieldType.Text, desc: 'music.title' },
  { name: '音乐作者', type: FieldType.Text, desc: 'music.author' },
  { name: '音乐原声', type: FieldType.Checkbox, desc: 'music.is_original_sound' },
  { name: '音乐商业版权', type: FieldType.Checkbox, desc: 'music.is_commerce_music' },

  // 视频表现 & 统计
  { name: '播放量', type: FieldType.Number, desc: 'statistics.play_count' },
  { name: '点赞数', type: FieldType.Number, desc: 'statistics.digg_count' },
  { name: '评论数', type: FieldType.Number, desc: 'statistics.comment_count' },
  { name: '分享数', type: FieldType.Number, desc: 'statistics.share_count' },
  { name: '收藏数', type: FieldType.Number, desc: 'statistics.collect_count' },
  { name: '下载数', type: FieldType.Number, desc: 'statistics.download_count' },

  // 视频维度
  { name: '视频时长毫秒', type: FieldType.Number, desc: 'video.duration' },
  { name: '视频宽度', type: FieldType.Number, desc: 'video.width' },
  { name: '视频高度', type: FieldType.Number, desc: 'video.height' },
  { name: '封面URL', type: FieldType.Text, desc: 'video.origin_cover.url_list[0]' },
  { name: '无水印视频URL', type: FieldType.Text, desc: 'video.download_no_watermark_addr.url_list[0]' },
  { name: '封面附件', type: FieldType.Attachment, desc: '封面图片附件' },
  { name: '无水印视频附件', type: FieldType.Attachment, desc: '无水印视频附件' },

  // AIGC 信息
  { name: '是否AI生成内容', type: FieldType.Checkbox, desc: 'aigc_info.created_by_ai' },

  // 元信息
  { name: '接口请求时间', type: FieldType.Text, desc: 'time' },
  { name: '接口请求ID', type: FieldType.Text, desc: 'request_id' },
  { name: '接口状态码', type: FieldType.Number, desc: 'code / data.status_code' },
  { name: '接口消息', type: FieldType.Text, desc: 'message_zh / status_msg' },
];

export default function SocialMediaFetch() {
  const [tableMetaList, setTableMetaList] = useState<ITableMeta[]>();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const formApi = useRef<BaseFormApi>();

  const handleInitFields = useCallback(async ({ table: tableId }: { table: string }) => {
    if (!tableId) {
      Toast.error('请先选择数据表');
      return;
    }

    setLoading(true);
    setStatus('正在创建/检查字段...');

    try {
      const table = await bitable.base.getTableById(tableId);
      let fieldList = await table.getFieldList();

      let createdCount = 0;
      let existedCount = 0;

      for (const def of FIELD_DEFINITIONS) {
        // 需要通过 getName() 获取字段名进行比较
        let existing: any = null;
        for (const f of fieldList) {
          try {
            const fieldName = await f.getName();
            if (fieldName === def.name) {
              existing = f;
              break;
            }
          } catch (e) {
            // 忽略获取字段名失败的情况
          }
        }
        if (existing) {
          existedCount++;
          continue;
        }

        const field = await findOrCreateField(table, fieldList, def.name, def.type);
        if (field) {
          createdCount++;
          // 更新最新字段列表
          fieldList = await table.getFieldList();
        }
      }

      const msg = `字段初始化完成，新建 ${createdCount} 个字段，已存在 ${existedCount} 个字段`;
      Toast.success(msg);
      setStatus(msg);
    } catch (error: any) {
      console.error('初始化字段失败:', error);
      Toast.error(`初始化字段失败: ${error.message || '未知错误'}`);
      setStatus(`初始化字段失败: ${error.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // 从文本中提取第一个 http/https 链接
  const extractFirstUrl = (text: string): string | null => {
    if (!text) return null;
    const match = text.match(/https?:\/\/[^\s]+/);
    if (!match) return null;
    // 去掉可能尾随的标点符号
    return match[0].replace(/[)\]\uFF09\u3001\u3002\uFF0C]+$/u, '');
  };

  // 根据分享链接获取单个作品数据并写入当前记录
  const handleFetchByShareUrl = useCallback(async ({ table: tableId }: { table: string }) => {
    if (!tableId) {
      Toast.error('请先选择数据表');
      return;
    }

    setLoading(true);
    setProgress(0);
    setStatus('开始根据分享链接获取社媒数据...');

    try {
      const table = await bitable.base.getTableById(tableId);
      const fieldList = await table.getFieldList();

      // 分享链接字段：优先使用中文列，其次英文
      let shareUrlField: any = null;
      for (const field of fieldList) {
        try {
          const fieldName = await field.getName();
          if (fieldName === '分享链接' || fieldName === 'share_url' || fieldName === '分享链接(短链)') {
            shareUrlField = field;
            break;
          }
        } catch (e) {
          // 忽略
        }
      }
      if (!shareUrlField) {
        try {
          shareUrlField = await table.getFieldByName('分享链接');
        } catch (e) {
          try {
            shareUrlField = await table.getFieldByName('share_url');
          } catch (e2) {
            // ignore
          }
        }
      }

      if (!shareUrlField) {
        Toast.error('数据表中未找到“分享链接”或 share_url 字段，无法获取数据');
        setLoading(false);
        return;
      }

      // 确保目标字段都已存在
      let currentFieldList = fieldList;
      for (const def of FIELD_DEFINITIONS) {
        // 需要通过 getName() 获取字段名进行比较
        let existing: any = null;
        for (const f of currentFieldList) {
          try {
            const fieldName = await f.getName();
            if (fieldName === def.name) {
              existing = f;
              break;
            }
          } catch (e) {
            // 忽略获取字段名失败的情况
          }
        }
        if (!existing) {
          await findOrCreateField(table, currentFieldList, def.name, def.type);
          currentFieldList = await table.getFieldList();
        }
      }
      
      // 打印所有字段名用于调试
      const fieldNames = await Promise.all(
        currentFieldList.map(async (f: any) => {
          try {
            return await f.getName();
          } catch (e) {
            return undefined;
          }
        })
      );
      console.log('当前表格所有字段名:', fieldNames);

      const records = await table.getRecords({ pageSize: 5000 });
      const total = records.records.length;

      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      // 查找视频ID字段和附件字段，用于判断是否已更新过、附件是否已上传
      let videoIdField: any = null;
      let coverAttachmentFieldForSkipCheck: any = null;
      let videoAttachmentFieldForSkipCheck: any = null;
      for (const field of currentFieldList) {
        try {
          const fieldName = await field.getName();
          if (fieldName === '视频ID' || fieldName === 'video_id' || fieldName === 'aweme_id') {
            videoIdField = field;
          } else if (fieldName === '封面附件') {
            coverAttachmentFieldForSkipCheck = field;
          } else if (fieldName === '无水印视频附件') {
            videoAttachmentFieldForSkipCheck = field;
          }
        } catch (e) {
          // 忽略
        }
      }

      for (let i = 0; i < total; i++) {
        const record = records.records[i];
        const recordId = record.recordId;

        setProgress(Math.round(((i + 1) / total) * 100));
        setStatus(`处理记录 ${i + 1}/${total}...`);

        try {
          // 如果视频ID字段已有值，说明可能已更新过，先检查附件是否已存在
          if (videoIdField) {
            try {
              const existingVideoId = await table.getCellString(videoIdField.id, recordId);
              if (existingVideoId && existingVideoId.trim()) {
                // 检查封面附件和无水印视频附件是否已经存在
                let hasCoverAttachment = false;
                let hasVideoAttachment = false;

                if (coverAttachmentFieldForSkipCheck) {
                  try {
                    const coverCellValue = await table.getCellValue(coverAttachmentFieldForSkipCheck.id, recordId);
                    hasCoverAttachment = Array.isArray(coverCellValue) && coverCellValue.length > 0;
                  } catch (e) {
                    // 忽略附件读取错误，认为附件不存在，后续会尝试重新上传
                  }
                }

                if (videoAttachmentFieldForSkipCheck) {
                  try {
                    const videoCellValue = await table.getCellValue(videoAttachmentFieldForSkipCheck.id, recordId);
                    hasVideoAttachment = Array.isArray(videoCellValue) && videoCellValue.length > 0;
                  } catch (e) {
                    // 忽略附件读取错误，认为附件不存在，后续会尝试重新上传
                  }
                }

                if (hasCoverAttachment && hasVideoAttachment) {
                  console.log(`记录 ${recordId} 视频ID已存在 (${existingVideoId}) 且附件已上传，跳过`);
                  skipCount++;
                  continue;
                } else {
                  console.log(
                    `记录 ${recordId} 视频ID已存在 (${existingVideoId})，但附件缺失（封面: ${hasCoverAttachment}, 视频: ${hasVideoAttachment}），继续处理以补充附件`
                  );
                  // 不跳过，继续后续流程（重新拉取接口并补齐字段和附件）
                }
              }
            } catch (e) {
              // 如果获取视频ID失败，继续处理
            }
          }

          const shareUrl = await table.getCellString(shareUrlField.id, recordId);
          const rawShareText = (shareUrl || '').trim();

          if (!rawShareText) {
            skipCount++;
            continue;
          }

          // 兼容「6.48 复制打开抖音... https://v.douyin.com/xxx/ ...」这种格式，先从整段文案中提取链接
          const extractedUrl = extractFirstUrl(rawShareText);
          if (!extractedUrl) {
            skipCount++;
            continue;
          }

          // 调用本地代理接口
          const resp = await fetch(TIKHUB_FETCH_ONE_VIDEO_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ share_url: extractedUrl }),
          });

          const result = await resp.json();
          console.log(`记录 ${recordId} API 响应:`, {
            status: resp.status,
            code: result.code,
            hasData: !!result.data,
            message: result.message || result.message_zh,
          });

          // 兼容不同的返回格式：API 路由返回 code: 0，但也要兼容直接返回 code: 200 的情况
          if (resp.status !== 200 || (result.code !== 0 && result.code !== 200) || !result.data) {
            errorCount++;
            console.warn(`记录 ${recordId} 获取数据失败:`, result);
            continue;
          }

          const apiData = result.data;
          console.log(`记录 ${recordId} API 返回数据:`, JSON.stringify(apiData).substring(0, 500));
          
          // TikHub 的 data 可能是字符串或对象，需要兼容 TikTok 和抖音两种格式
          let awemeDetail: any = null;
          try {
            if (apiData && typeof apiData.data === 'string') {
              // TikTok 格式：data.data 是字符串，需要解析
              const parsed = JSON.parse(apiData.data);
              awemeDetail = parsed?.aweme_detail || null;
            } else if (apiData && typeof apiData.data === 'object' && apiData.data) {
              // 抖音格式：data.data 是对象，直接取 aweme_detail
              awemeDetail = apiData.data.aweme_detail || null;
            } else if (apiData && (apiData as any).aweme_detail) {
              // 兜底：直接在 data 层级查找
              awemeDetail = (apiData as any).aweme_detail;
            }
          } catch (e) {
            console.error(`记录 ${recordId} 解析 data.aweme_detail 失败:`, e);
          }

          if (!awemeDetail) {
            console.warn(`记录 ${recordId} 未获取到 aweme_detail，跳过。apiData 结构:`, {
              hasData: !!apiData,
              dataType: typeof apiData?.data,
              hasAwemeDetail: !!(apiData as any)?.aweme_detail,
            });
            skipCount++;
            continue;
          }

          console.log(`记录 ${recordId} 成功解析 aweme_detail，视频ID: ${awemeDetail.aweme_id}`);

          // 从 aweme_detail 中提取字段
          const author = awemeDetail.author || {};
          const music = awemeDetail.music || {};
          const stats = awemeDetail.statistics || {};
          const video = awemeDetail.video || {};
          const aigc = awemeDetail.aigc_info || {};

          // 兼容抖音和 TikTok 的视频 URL 字段
          // 抖音优先：video.bit_rate[].play_addr.url_list[0] (无水印，从bit_rate数组提取)
          // TikTok: video.download_no_watermark_addr?.url_list?.[0]
          // 兜底：video.download_addr?.url_list?.[0] (有水印) 或 video.play_addr?.url_list?.[0] (播放地址)
          let videoUrl = null;
          
          // 优先从 bit_rate 数组中提取无水印视频URL（抖音格式）
          if (video.bit_rate && Array.isArray(video.bit_rate) && video.bit_rate.length > 0) {
            // 选择第一个（通常是最高质量）或找到 quality_type=3 (1080p) 的
            const bestBitRate = video.bit_rate.find((br: any) => br.quality_type === 3) || video.bit_rate[0];
            if (bestBitRate?.play_addr?.url_list && Array.isArray(bestBitRate.play_addr.url_list) && bestBitRate.play_addr.url_list.length > 0) {
              videoUrl = bestBitRate.play_addr.url_list[0];
            }
          }
          
          // 如果没有从 bit_rate 获取到，使用其他字段
          if (!videoUrl) {
            videoUrl = video.download_no_watermark_addr?.url_list?.[0] || 
                      video.download_addr?.url_list?.[0] || 
                      video.play_addr?.url_list?.[0] || 
                      null;
          }

          // 构造待写入的数据（不包含分享链接，保持原有值不变）
          const valueMap: Record<string, any> = {
            视频ID: awemeDetail.aweme_id || awemeDetail.aweme_id_str,
            // 注意：不更新分享链接字段，保持原有值
            视频描述: awemeDetail.desc || awemeDetail.content_desc || awemeDetail.caption,
            语言: awemeDetail.desc_language,
            '国家/地区': awemeDetail.region,
            发布时间戳: awemeDetail.create_time,

            作者UID: author.uid,
            作者sec_uid: author.sec_uid,
            作者昵称: author.nickname,
            作者唯一ID: author.unique_id,
            作者简介: author.signature,
            作者地区: author.region,
            作者粉丝数: author.follower_count,
            作者获赞总数: author.total_favorited,

            音乐标题: music.title,
            音乐作者: music.author || music.owner_nickname,
            音乐原声: music.is_original_sound,
            音乐商业版权: music.is_commerce_music,

            播放量: stats.play_count,
            点赞数: stats.digg_count,
            评论数: stats.comment_count,
            分享数: stats.share_count,
            收藏数: stats.collect_count,
            下载数: stats.download_count,

            视频时长毫秒: video.duration,
            视频宽度: video.width,
            视频高度: video.height,
            封面URL: video.origin_cover?.url_list?.[0] || video.cover?.url_list?.[0] || null,
            无水印视频URL: videoUrl,

            是否AI生成内容: aigc.created_by_ai || false,

            接口请求时间: apiData.time,
            接口请求ID: apiData.request_id,
            接口状态码: apiData.code,
            接口消息: apiData.message_zh || apiData.message,
          };

          // 将 valueMap 写入对应字段
          const updateMap: Record<string, any> = {};
          const missingFields: string[] = [];
          
          // 先构建字段名到字段对象的映射
          const fieldNameMap: Record<string, any> = {};
          for (const field of currentFieldList) {
            try {
              const fieldName = await field.getName();
              fieldNameMap[fieldName] = field;
            } catch (e) {
              // 忽略获取字段名失败的情况
            }
          }
          
          for (const [fieldName, rawValue] of Object.entries(valueMap)) {
            const field = fieldNameMap[fieldName];
            if (!field) {
              missingFields.push(fieldName);
              continue;
            }
            try {
              const converted = await convertValueByFieldType(field, rawValue);
              updateMap[field.id] = converted;
            } catch (e) {
              console.error(`记录 ${recordId} 字段 ${fieldName} 转换失败:`, e);
            }
          }

          if (missingFields.length > 0) {
            console.warn(`记录 ${recordId} 缺少字段:`, missingFields);
          }

          if (Object.keys(updateMap).length === 0) {
            console.error(`记录 ${recordId} 没有可更新的字段，updateMap 为空`);
            errorCount++;
            continue;
          }

          try {
            console.log(`记录 ${recordId} 准备保存数据，字段数: ${Object.keys(updateMap).length}`);
            await table.setRecord(recordId, { fields: updateMap });
            console.log(`记录 ${recordId} 数据保存成功`);
            
            // 下载并上传封面附件（使用原始URL，不从valueMap读取）
            const coverUrl = video.origin_cover?.url_list?.[0] || video.cover?.url_list?.[0] || null;
            const coverAttachmentField = fieldNameMap['封面附件'];
            if (coverUrl && coverAttachmentField && typeof coverUrl === 'string' && coverUrl.startsWith('http')) {
              try {
                setStatus(`正在下载封面图片 ${i + 1}/${total}...`);
                console.log(`记录 ${recordId} 开始下载封面: ${coverUrl}`);
                // 添加超时控制（30秒）
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                
                const coverResponse = await fetch(coverUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (coverResponse.ok) {
                  const coverBlob = await coverResponse.blob();
                  const coverFileName = `cover_${awemeDetail.aweme_id || Date.now()}.${coverBlob.type.includes('png') ? 'png' : 'jpg'}`;
                  const coverFile = new File([coverBlob], coverFileName, { type: coverBlob.type || 'image/jpeg' });
                  await coverAttachmentField.setValue(recordId, coverFile);
                  console.log(`✅ 记录 ${recordId} 封面附件上传成功: ${coverFileName} (${coverBlob.size} bytes)`);
                } else {
                  console.warn(`记录 ${recordId} 下载封面失败: ${coverResponse.status} ${coverResponse.statusText}`);
                }
              } catch (coverError: any) {
                if (coverError.name === 'AbortError') {
                  console.warn(`记录 ${recordId} 下载封面超时`);
                } else {
                  console.error(`记录 ${recordId} 上传封面附件失败:`, coverError);
                }
              }
            } else {
              if (!coverUrl) {
                console.log(`记录 ${recordId} 无封面URL，跳过封面附件上传`);
              } else if (!coverAttachmentField) {
                console.log(`记录 ${recordId} 无封面附件字段，跳过封面附件上传`);
              } else {
                console.log(`记录 ${recordId} 封面URL格式不正确: ${coverUrl}`);
              }
            }
            
            // 下载并上传无水印视频附件（通过后端代理，避免直接访问抖音 CDN 导致 403）
            const videoAttachmentField = fieldNameMap['无水印视频附件'];
            console.log(`记录 ${recordId} 检查视频附件上传条件:`, {
              hasVideoUrl: !!videoUrl,
              videoUrlType: typeof videoUrl,
              videoUrlValue: videoUrl,
              startsWithHttp: videoUrl && typeof videoUrl === 'string' ? videoUrl.startsWith('http') : false,
              hasVideoAttachmentField: !!videoAttachmentField
            });
            
            if (videoUrl && videoAttachmentField && typeof videoUrl === 'string' && videoUrl.startsWith('http')) {
              try {
                setStatus(`正在下载视频 ${i + 1}/${total}...`);
                console.log(`记录 ${recordId} 开始下载无水印视频: ${videoUrl}`);
                // 添加超时控制（120秒，视频文件较大）
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 120000);
                
                // 通过本地 API 代理下载，避免前端直接请求抖音 CDN 被 403 拒绝
                const proxyUrl = `/api/proxyDownload?url=${encodeURIComponent(videoUrl)}`;
                const videoResponse = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (videoResponse.ok) {
                  const videoBlob = await videoResponse.blob();
                  const videoFileName = `video_${awemeDetail.aweme_id || Date.now()}.mp4`;
                  const videoFile = new File([videoBlob], videoFileName, { type: 'video/mp4' });
                  await videoAttachmentField.setValue(recordId, videoFile);
                  console.log(`✅ 记录 ${recordId} 无水印视频附件上传成功: ${videoFileName} (${videoBlob.size} bytes)`);
                } else {
                  console.warn(`记录 ${recordId} 下载视频失败: ${videoResponse.status} ${videoResponse.statusText}`);
                }
              } catch (videoError: any) {
                if (videoError.name === 'AbortError') {
                  console.warn(`记录 ${recordId} 下载视频超时`);
                } else {
                  console.error(`记录 ${recordId} 上传视频附件失败:`, videoError);
                }
              }
            } else {
              if (!videoUrl) {
                console.log(`记录 ${recordId} 无水印视频URL，跳过视频附件上传`);
              } else if (!videoAttachmentField) {
                console.log(`记录 ${recordId} 无水印视频附件字段不存在，跳过视频附件上传`);
              } else if (typeof videoUrl !== 'string') {
                console.log(`记录 ${recordId} 无水印视频URL类型不正确: ${typeof videoUrl}, 值: ${videoUrl}`);
              } else if (!videoUrl.startsWith('http')) {
                console.log(`记录 ${recordId} 无水印视频URL不是http/https链接: ${videoUrl}`);
              }
            }
            
            successCount++;
          } catch (e) {
            console.error(`记录 ${recordId} 保存数据失败:`, e);
            errorCount++;
          }
        } catch (e) {
          errorCount++;
          console.error(`记录 ${recordId} 获取或写入社媒数据失败:`, e);
        }
      }

      const msg = `社媒数据获取完成：成功 ${successCount} 条，跳过 ${skipCount} 条，失败 ${errorCount} 条`;
      Toast.success(msg);
      setStatus(msg);
    } catch (error: any) {
      console.error('社媒数据获取流程失败:', error);
      Toast.error(`社媒数据获取失败: ${error.message || '未知错误'}`);
      setStatus(`社媒数据获取失败: ${error.message || '未知错误'}`);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      bitable.base.getTableMetaList(),
      bitable.base.getSelection()
    ]).then(([metaList, selection]) => {
      setTableMetaList(metaList);
      // 默认选择名为「社媒数据获取」的表；若不存在则回退到当前选中表
      const defaultTable = metaList.find(meta => meta.name === '社媒数据获取');
      const initialTableId = defaultTable?.id || selection.tableId;
      if (initialTableId) {
        formApi.current?.setValues({ table: initialTableId });
      }
    });
  }, []);

  return (
    <div>
      <Title heading={4} style={{ marginBottom: '1rem' }}>
        TikTok 社媒数据获取
      </Title>
      <Text type="tertiary" style={{ marginBottom: '1rem', display: 'block' }}>
        通过 TikTok 或抖音的分享链接，自动获取视频的详细数据，包括播放量、点赞数、评论数、作者信息等，并自动下载封面图和无水印视频，帮助您快速收集和分析热门内容。
      </Text>
      
      <Form
        getFormApi={(api) => formApi.current = api}
        style={{ width: '100%' }}
      >
        <Form.Slot label="使用说明">
          <div style={{ marginBottom: '1rem', fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
            <div><strong>功能说明：</strong> 根据分享链接自动获取 TikTok 或抖音视频的完整数据，包括视频信息、作者信息、统计数据等，并自动下载封面图和无水印视频作为附件</div>
            <div style={{ marginTop: '0.5rem' }}>
              <strong>操作步骤：</strong>
              <div style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                <div>1. 在数据表的&ldquo;分享链接&rdquo;字段中填写 TikTok 或抖音视频的分享链接</div>
                <div>2. 选择包含分享链接的数据表</div>
                <div>3. 点击&ldquo;根据分享链接获取数据&rdquo;按钮</div>
                <div>4. 系统会自动识别链接类型（TikTok/抖音），获取数据并保存到对应字段</div>
              </div>
            </div>
            <div style={{ marginTop: '0.5rem', color: '#1890ff', fontWeight: '500' }}>
              💡 提示：系统会自动识别 TikTok 和抖音链接类型，并调用相应的 API 获取数据。如果视频ID字段不为空，将跳过该记录。系统会自动下载封面图和无水印视频并保存为附件。
            </div>
            <div style={{ marginTop: '0.5rem', color: '#fa8c16', fontWeight: '500' }}>
              ⚠️ 注意：分享链接字段不会被修改，系统只会读取链接并获取数据。如果记录已有视频ID，将自动跳过。
            </div>
          </div>
        </Form.Slot>
        
        <Space vertical spacing="loose" style={{ width: '100%' }}>
          <Form.Select
            field='table'
            label='选择数据表'
            placeholder="请选择数据表"
            style={{ width: '100%' }}
            rules={[{ required: true, message: '请选择数据表' }]}
          >
            {
              Array.isArray(tableMetaList) && tableMetaList.map(({ name, id }) => {
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
            type="secondary"
            loading={loading}
            style={{ width: '100%' }}
            onClick={() => {
              const values = formApi.current?.getValues() || {};
              handleFetchByShareUrl({ table: values.table });
            }}
          >
            根据分享链接获取数据
          </Button>

          {loading && (
            <Progress percent={progress} showInfo />
          )}

          {status && (
            <Text type="tertiary">{status}</Text>
          )}
        </Space>
      </Form>
    </div>
  );
}



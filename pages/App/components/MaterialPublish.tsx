'use client'
import { bitable, ITableMeta, FieldType } from "@lark-base-open/js-sdk";
import { Button, Form, Toast, Typography, Space, Progress } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef, useCallback } from 'react';
import { BaseFormApi } from '@douyinfe/semi-foundation/lib/es/form/interface';
import { getFieldStringValue } from '../utils/fieldUtils';
import { TIKTOK_REFRESH_TOKEN_API, TIKTOK_PUBLISH_STATUS_API } from '../constants';

const { Title, Text } = Typography;

export default function MaterialPublish() {
  const [materialTableMetaList, setMaterialTableMetaList] = useState<ITableMeta[]>();
  const [accountTableMetaList, setAccountTableMetaList] = useState<ITableMeta[]>();
  const [loading, setLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const formApi = useRef<BaseFormApi>();

  // 获取附件临时下载链接
  const getAttachmentTempUrls = async (table: any, field: any, recordId: string): Promise<Array<{ url: string; name: string; size: number }>> => {
    try {
      const attachmentField = await table.getFieldById(field.id);
      const attachments = await attachmentField.getValue(recordId);
      
      if (Array.isArray(attachments) && attachments.length > 0) {
        // 获取临时下载链接
        const tempUrls = await attachmentField.getAttachmentUrls(recordId);
        
        return attachments.map((att: any, index: number) => ({
          url: tempUrls[index] || att.url || att.token || '',
          name: att.name || 'unknown',
          size: att.size || 0
        })).filter((item: any) => item.url);
      }
      return [];
    } catch (e) {
      console.error('获取附件临时下载链接失败:', e);
      return [];
    }
  };

  // 上传文件到阿里云OSS
  const uploadToOSS = async (fileUrl: string, fileName: string, folder?: string): Promise<string> => {
    try {
      const response = await fetch('/api/uploadToOSS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileUrl,
          fileName,
          folder: folder || 'tiktok-videos'
        })
      });

      const result = await response.json();

      if (result.code === 0 && result.data && result.data.url) {
        return result.data.url;
      } else {
        throw new Error(result.error || result.message || '上传到OSS失败');
      }
    } catch (error: any) {
      console.error('上传到OSS失败:', error);
      throw error;
    }
  };

  // 获取发布状态
  const getPublishStatus = async (accessToken: string, businessId: string, publishId: string): Promise<any> => {
    try {
      console.log(`正在获取发布状态 - publish_id: ${publishId}`);
      const response = await fetch(`${TIKTOK_PUBLISH_STATUS_API}?access_token=${encodeURIComponent(accessToken)}&business_id=${encodeURIComponent(businessId)}&publish_id=${encodeURIComponent(publishId)}`);

      const result = await response.json();

      if (result.code === 0 && result.data) {
        console.log(`✅ 获取发布状态成功: ${result.data.status}`);
        return result.data;
      } else {
        throw new Error(result.error || result.message || '获取发布状态失败');
      }
    } catch (error: any) {
      console.error('获取发布状态失败:', error);
      throw error;
    }
  };

  // 刷新Token
  const refreshToken = async (refreshTokenValue: string): Promise<any> => {
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
  };

  // 获取账号信息（包含Token刷新逻辑）
  const getAccountInfo = async (
    accountTable: any,
    accessTokenField: any,
    openIdField: any,
    openId: string,
    refreshTokenField?: any,
    tokenExpiresTimeField?: any
  ): Promise<any> => {
    try {
      console.log(`查找账号信息 - open_id: ${openId}`);
      
      // 获取所有账号记录
      const records = await accountTable.getRecords({ pageSize: 5000 });
      console.log(`账号列表中共有 ${records.records.length} 条记录`);
      
      // 查找匹配的open_id
      for (const record of records.records) {
        const recordOpenId = await getFieldStringValue(accountTable, openIdField, record.recordId);
        const recordOpenIdStr = recordOpenId ? String(recordOpenId).trim() : '';
        const targetOpenIdStr = String(openId).trim();
        
        console.log(`检查记录 ${record.recordId}: open_id = "${recordOpenIdStr}" (目标: "${targetOpenIdStr}")`);
        
        if (recordOpenIdStr === targetOpenIdStr) {
          // 找到匹配的账号，获取access_token
          let accessToken = await getFieldStringValue(accountTable, accessTokenField, record.recordId);
          let accessTokenStr = accessToken ? String(accessToken).trim() : '';
          
          console.log(`✅ 找到匹配账号 - recordId: ${record.recordId}, access_token: ${accessTokenStr ? accessTokenStr.substring(0, 30) + '...' : '(空)'}`);
          
          // 检查Token失效时间
          if (tokenExpiresTimeField) {
            try {
              const expiresTimeValue = await getFieldStringValue(accountTable, tokenExpiresTimeField, record.recordId);
              let shouldRefresh = false;
              const now = Date.now();

              if (expiresTimeValue) {
                const expiresTime = new Date(expiresTimeValue).getTime();
                const timeUntilExpiry = expiresTime - now;
                
                console.log(`Token失效时间检查: ${new Date(expiresTime).toLocaleString()}, 剩余时间: ${Math.round(timeUntilExpiry / 1000 / 60)}分钟`);
                
                // 如果Token已失效或将在5分钟内失效，尝试刷新
                if (timeUntilExpiry < 5 * 60 * 1000) { // 5分钟缓冲时间
                  shouldRefresh = true;
                  console.log(`⚠️ Token即将失效或已失效，准备刷新...`);
                }
              } else {
                // 没有记录失效时间，视为需要刷新一次，确保后续有正确的 token失效时间
                shouldRefresh = true;
                console.log('⚠️ 账号记录中没有 token失效时间，将尝试刷新Token并补全该字段');
              }

              if (shouldRefresh) {
                if (refreshTokenField) {
                  const refreshTokenValue = await getFieldStringValue(accountTable, refreshTokenField, record.recordId);
                  if (refreshTokenValue) {
                    try {
                      const newTokenData = await refreshToken(String(refreshTokenValue).trim());
                      
                      // 更新账号列表中的token信息
                      const updateFields: Record<string, any> = {};
                      updateFields[accessTokenField.id] = newTokenData.access_token;
                      
                      if (refreshTokenField && newTokenData.refresh_token) {
                        updateFields[refreshTokenField.id] = newTokenData.refresh_token;
                      }
                      
                      // 计算新的失效时间（expires_in是秒数），并根据字段类型写入合适的格式
                      if (tokenExpiresTimeField && newTokenData.expires_in) {
                        const newExpiresTimestamp = now + newTokenData.expires_in * 1000;
                        const newExpiresTime = new Date(newExpiresTimestamp);

                        try {
                          const expiresFieldType = await tokenExpiresTimeField.getType();
                          if (expiresFieldType === FieldType.Number) {
                            // 数字类型字段，直接存时间戳（毫秒）
                            updateFields[tokenExpiresTimeField.id] = newExpiresTimestamp;
                            console.log(`新的Token失效时间(时间戳): ${newExpiresTimestamp} (${newExpiresTime.toLocaleString()})`);
                          } else {
                            // 其他类型（如文本、日期时间），统一存 ISO 字符串
                            updateFields[tokenExpiresTimeField.id] = newExpiresTime.toISOString();
                            console.log(`新的Token失效时间(ISO): ${newExpiresTime.toISOString()} (${newExpiresTime.toLocaleString()})`);
                          }
                        } catch (typeErr) {
                          // 获取类型失败时，退化为字符串写入
                          console.warn('获取 token失效时间 字段类型失败，按字符串写入:', typeErr);
                          updateFields[tokenExpiresTimeField.id] = newExpiresTime.toISOString();
                          console.log(`新的Token失效时间(回退ISO): ${newExpiresTime.toISOString()} (${newExpiresTime.toLocaleString()})`);
                        }
                      }
                      
                      // 更新记录
                      await accountTable.setRecord(record.recordId, { fields: updateFields });
                      console.log(`✅ 已更新账号列表中的Token信息`);
                      
                      // 使用新的access_token
                      accessTokenStr = newTokenData.access_token;
                      Toast.success(`Token已自动刷新并更新到账号列表`);
                    } catch (refreshError: any) {
                      console.error(`❌ Token刷新失败:`, refreshError);
                      Toast.warning(`Token刷新失败: ${refreshError.message || '未知错误'}，请手动更新Token`);
                    }
                  } else {
                    console.warn(`⚠️ 未找到refresh_token，无法刷新Token`);
                  }
                } else {
                  console.warn(`⚠️ 账号列表中未找到refresh_token字段，无法自动刷新Token`);
                }
              }
            } catch (e) {
              console.warn(`检查Token失效时间失败:`, e);
            }
          }
          
          if (!accessTokenStr) {
            console.warn(`⚠️ 账号 ${record.recordId} 的 access_token 为空`);
          } else if (accessTokenStr.length < 10) {
            console.warn(`⚠️ 账号 ${record.recordId} 的 access_token 格式可能不正确 (长度: ${accessTokenStr.length})`);
          }
          
          return {
            recordId: record.recordId,
            openId: openId,
            accessToken: accessTokenStr
          };
        }
      }
      
      console.warn(`❌ 未找到匹配的账号 - open_id: ${openId}`);
      return null;
    } catch (e) {
      console.error('获取账号信息失败:', e);
      return null;
    }
  };

  // 自动发布
  const handleAutoPublish = useCallback(async ({ 
    materialTable: materialTableId,
    accountTable: accountTableId
  }: { 
    materialTable: string;
    accountTable: string;
  }) => {
    if (!materialTableId) {
      Toast.error('请先选择素材库表');
      return;
    }

    if (!accountTableId) {
      Toast.error('请先选择账号列表');
      return;
    }

    setLoading(true);
    setProgress(0);
    setStatus('开始查询待发布素材...');

    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;

    try {
      // 获取素材库表和账号列表表
      const materialTable = await bitable.base.getTableById(materialTableId);
      const accountTable = await bitable.base.getTableById(accountTableId);

      // 获取素材库字段
      let materialFieldList = await materialTable.getFieldList();
      
      // 查找必需字段（通过名称获取）
      let publishStatusField: any = null;
      let publishTimeField: any = null;
      let publishAccountField: any = null;
      let videoAttachmentField: any = null;

      // 遍历字段列表，通过 getName() 获取字段名称并匹配
      for (const field of materialFieldList) {
        try {
          const fieldName = await field.getName();
          if (fieldName === '发布状态') {
            publishStatusField = field;
          } else if (fieldName === '发布时间') {
            publishTimeField = field;
          } else if (fieldName === '发布账号') {
            publishAccountField = field;
          } else if (fieldName === '视频附件') {
            videoAttachmentField = field;
          }
        } catch (e) {
          console.warn('获取字段名称失败:', e);
        }
      }

      // 如果字段不存在，尝试通过名称获取
      if (!publishStatusField) {
        try {
          publishStatusField = await materialTable.getFieldByName('发布状态');
        } catch (e) {
          console.warn('发布状态字段不存在');
        }
      }

      if (!publishTimeField) {
        try {
          publishTimeField = await materialTable.getFieldByName('发布时间');
        } catch (e) {
          console.warn('发布时间字段不存在');
        }
      }

      if (!publishAccountField) {
        try {
          publishAccountField = await materialTable.getFieldByName('发布账号');
        } catch (e) {
          console.warn('发布账号字段不存在');
        }
      }

      if (!videoAttachmentField) {
        try {
          videoAttachmentField = await materialTable.getFieldByName('视频附件');
        } catch (e) {
          console.warn('视频附件字段不存在');
        }
      }

      // 验证必需字段
      if (!publishStatusField) {
        Toast.error('素材库表中未找到"发布状态"字段');
        setLoading(false);
        return;
      }

      if (!publishTimeField) {
        Toast.error('素材库表中未找到"发布时间"字段');
        setLoading(false);
        return;
      }

      if (!publishAccountField) {
        Toast.error('素材库表中未找到"发布账号"字段');
        setLoading(false);
        return;
      }

      if (!videoAttachmentField) {
        Toast.error('素材库表中未找到"视频附件"字段');
        setLoading(false);
        return;
      }

      // 获取账号列表字段
      let accountFieldList = await accountTable.getFieldList();
      let accessTokenField: any = null;
      let openIdField: any = null;
      let refreshTokenField: any = null;
      let tokenExpiresTimeField: any = null;

      // 遍历字段列表，通过 getName() 获取字段名称并匹配
      for (const field of accountFieldList) {
        try {
          const fieldName = await field.getName();
          if (fieldName === 'access_token') {
            accessTokenField = field;
          } else if (fieldName === 'open_id') {
            openIdField = field;
          } else if (fieldName === 'refresh_token' || fieldName === '刷新令牌') {
            refreshTokenField = field;
          } else if (fieldName === 'token失效时间' || fieldName === 'token_expires_time' || fieldName === 'expires_time') {
            tokenExpiresTimeField = field;
          }
        } catch (e) {
          console.warn('获取字段名称失败:', e);
        }
      }

      if (!accessTokenField) {
        try {
          accessTokenField = await accountTable.getFieldByName('access_token');
        } catch (e) {
          console.warn('access_token字段不存在');
        }
      }

      if (!openIdField) {
        try {
          openIdField = await accountTable.getFieldByName('open_id');
        } catch (e) {
          console.warn('open_id字段不存在');
        }
      }
      
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

      if (!accessTokenField || !openIdField) {
        Toast.error('账号列表中未找到 access_token 或 open_id 字段');
        setLoading(false);
        return;
      }
      
      if (!refreshTokenField) {
        console.warn('⚠️ 账号列表中未找到 refresh_token 字段，将无法自动刷新Token');
      }
      
      if (!tokenExpiresTimeField) {
        console.warn('⚠️ 账号列表中未找到 token失效时间 字段，将无法判断Token是否失效');
      }

      // 获取所有素材记录
      setStatus('查询待发布素材...');
      const allRecords = await materialTable.getRecords({ pageSize: 5000 });
      const now = new Date();

      // 筛选符合条件的记录
      const pendingRecords: any[] = [];

      for (const record of allRecords.records) {
        try {
          // 检查发布状态
          const statusValue = await getFieldStringValue(materialTable, publishStatusField, record.recordId);
          if (!statusValue || String(statusValue).trim() !== '等待发布') {
            continue;
          }

          // 检查发布时间
          try {
            const publishTimeValue = await materialTable.getCellValue(publishTimeField.id, record.recordId);
            if (publishTimeValue) {
              let publishTime: Date | null = null;
              
              // 处理日期时间格式
              if (typeof publishTimeValue === 'number') {
                // Unix时间戳（毫秒）
                publishTime = new Date(publishTimeValue);
              } else if (typeof publishTimeValue === 'string') {
                // 字符串格式，尝试解析
                publishTime = new Date(publishTimeValue);
              } else if (publishTimeValue && typeof publishTimeValue === 'object') {
                // 可能是日期对象
                const timeObj = publishTimeValue as any;
                if (timeObj.timestamp) {
                  publishTime = new Date(timeObj.timestamp);
                } else {
                  publishTime = new Date(timeObj);
                }
              }

              if (publishTime && publishTime > now) {
                // 发布时间还未到，跳过
                continue;
              }
            }
          } catch (e) {
            console.warn(`获取发布时间失败 (记录 ${record.recordId}):`, e);
            // 如果无法获取发布时间，跳过该记录
            continue;
          }

          pendingRecords.push(record);
        } catch (e) {
          console.error(`检查记录 ${record.recordId} 失败:`, e);
        }
      }

      console.log(`找到 ${pendingRecords.length} 条待发布素材`);

      if (pendingRecords.length === 0) {
        Toast.info('没有符合条件的待发布素材');
        setLoading(false);
        return;
      }

      setStatus(`找到 ${pendingRecords.length} 条待发布素材，开始处理...`);

      // 处理每条记录
      for (let i = 0; i < pendingRecords.length; i++) {
        const record = pendingRecords[i];
        setProgress(Math.round(((i + 1) / pendingRecords.length) * 100));
        setStatus(`正在处理素材 ${i + 1}/${pendingRecords.length}...`);

        try {
          // 获取发布账号（open_id）
          const publishAccountValue = await getFieldStringValue(materialTable, publishAccountField, record.recordId);
          
          if (!publishAccountValue) {
            console.log(`记录 ${record.recordId} 没有发布账号，跳过`);
            skipCount++;
            continue;
          }

          const openId = String(publishAccountValue).trim();

          // 获取账号信息（包含Token刷新逻辑）
          const accountInfo = await getAccountInfo(
            accountTable,
            accessTokenField,
            openIdField,
            openId,
            refreshTokenField,
            tokenExpiresTimeField
          );

          if (!accountInfo || !accountInfo.accessToken) {
            console.log(`记录 ${record.recordId} 无法获取账号信息 (open_id: ${openId})，跳过`);
            Toast.warning(`素材 ${record.recordId} 无法获取账号信息，请检查账号列表中是否存在 open_id: ${openId}`);
            skipCount++;
            continue;
          }

          // 验证 access_token 格式
          const accessToken = String(accountInfo.accessToken).trim();
          if (!accessToken || accessToken.length < 10) {
            console.error(`记录 ${record.recordId} 的 access_token 格式无效: ${accessToken.substring(0, 20)}...`);
            Toast.error(`素材 ${record.recordId} 的 access_token 格式无效，请更新账号信息`);
            errorCount++;
            continue;
          }

          console.log(`✅ 获取到账号信息 - open_id: ${openId}, access_token: ${accessToken.substring(0, 20)}...`);

          // 获取视频附件临时下载链接
          const videoAttachments = await getAttachmentTempUrls(materialTable, videoAttachmentField, record.recordId);
          
          if (videoAttachments.length === 0) {
            console.log(`记录 ${record.recordId} 没有视频附件，跳过`);
            skipCount++;
            continue;
          }

          // 获取其他字段信息
          let captionField: any = null;
          for (const field of materialFieldList) {
            try {
              const fieldName = await field.getName();
              if (fieldName === 'caption' || fieldName === '标题' || fieldName === 'title') {
                captionField = field;
                break;
              }
            } catch (e) {
              // 忽略
            }
          }
          
          if (!captionField) {
            // 先按新列名查找，再兼容旧列名
            try {
              captionField = await materialTable.getFieldByName('标题');
            } catch (e) {
              try {
                captionField = await materialTable.getFieldByName('caption');
              } catch (err) {
                // 忽略
              }
            }
          }

          let caption = '';
          if (captionField) {
            caption = await getFieldStringValue(materialTable, captionField, record.recordId) || '';
          }

          // 获取其他字段信息
          let videoUrlField: any = null;
          let customThumbnailUrlField: any = null;
          let isBrandOrganicField: any = null;
          let isBrandedContentField: any = null;
          let isAIGeneratedField: any = null;

          for (const field of materialFieldList) {
            try {
              const fieldName = await field.getName();
              if (fieldName === '视频链接' || fieldName === 'video_url') {
                videoUrlField = field;
              } else if (fieldName === '封面链接' || fieldName === 'custom_thumbnail_url') {
                customThumbnailUrlField = field;
              } else if (fieldName === 'is_brand_organic') {
                isBrandOrganicField = field;
              } else if (fieldName === 'is_branded_content') {
                isBrandedContentField = field;
              } else if (fieldName === '是否AI生成' || fieldName === 'AI生成' || fieldName === 'is_ai_generated') {
                isAIGeneratedField = field;
              }
            } catch (e) {
              // 忽略
            }
          }

          // 是否AI生成（布尔，默认 false）
          let isAIGenerated = false;
          if (isAIGeneratedField) {
            try {
              const aiValue = await getFieldStringValue(materialTable, isAIGeneratedField, record.recordId);
              if (aiValue) {
                const lower = String(aiValue).trim().toLowerCase();
                // 支持 是/yes/true/1
                isAIGenerated = lower === 'true' || lower === '是' || lower === 'yes' || lower === '1';
              }
            } catch (e) {
              console.warn(`获取是否AI生成字段失败:`, e);
            }
          }

          // 获取 视频链接/ video_url（如果已设置，优先使用；否则上传附件到OSS）
          let finalVideoUrl = '';
          if (videoUrlField) {
            const videoUrlValue = await getFieldStringValue(materialTable, videoUrlField, record.recordId);
            if (videoUrlValue) {
              finalVideoUrl = String(videoUrlValue).trim();
            }
          }
          
          // 如果没有设置 视频链接 / video_url，上传第一个附件到OSS
          if (!finalVideoUrl && videoAttachments.length > 0) {
            setStatus(`正在上传视频到OSS ${i + 1}/${pendingRecords.length}...`);
            try {
              const firstAttachment = videoAttachments[0];
              console.log(`开始上传视频到OSS: ${firstAttachment.name} (${firstAttachment.size} bytes)`);
              
              // 上传到OSS
              const ossUrl = await uploadToOSS(
                firstAttachment.url,
                firstAttachment.name,
                'tiktok-videos'
              );
              
              console.log(`✅ 视频上传到OSS成功: ${ossUrl}`);
              finalVideoUrl = ossUrl;
              
              // 更新视频链接字段
              if (videoUrlField) {
                try {
                  await materialTable.setCellValue(videoUrlField.id, record.recordId, ossUrl);
                  console.log(`✅ 已更新视频链接字段: ${ossUrl}`);
                } catch (updateError) {
                  console.warn(`更新视频链接字段失败:`, updateError);
                }
              } else {
                // 如果视频链接字段不存在，尝试创建
                try {
                  const newVideoUrlField = await materialTable.addField({
                    type: FieldType.Text,
                    name: '视频链接'
                  }) as any;
                  const fieldId = typeof newVideoUrlField === 'string' ? newVideoUrlField : newVideoUrlField.id;
                  await materialTable.setCellValue(fieldId, record.recordId, ossUrl);
                  console.log(`✅ 已创建并更新视频链接字段: ${ossUrl}`);
                  // 更新videoUrlField引用
                  if (typeof newVideoUrlField !== 'string') {
                    videoUrlField = newVideoUrlField;
                  }
                } catch (createError) {
                  console.warn(`创建视频链接字段失败:`, createError);
                }
              }
            } catch (uploadError: any) {
              console.error(`❌ 上传视频到OSS失败:`, uploadError);
              Toast.error(`上传视频到OSS失败: ${uploadError.message || '未知错误'}`);
              errorCount++;
              continue;
            }
          }

          if (!finalVideoUrl) {
            console.log(`记录 ${record.recordId} 没有有效的视频URL，跳过`);
            skipCount++;
            continue;
          }

          // 获取 封面链接 / custom_thumbnail_url
          let customThumbnailUrl = '';
          if (customThumbnailUrlField) {
            const thumbnailUrlValue = await getFieldStringValue(materialTable, customThumbnailUrlField, record.recordId);
            if (thumbnailUrlValue) {
              customThumbnailUrl = String(thumbnailUrlValue).trim();
            }
          }

          // 获取 is_brand_organic（单选字段）
          let isBrandOrganic = false;
          if (isBrandOrganicField) {
            try {
              const singleSelectField = await materialTable.getFieldById(isBrandOrganicField.id);
              const brandOrganicValue = await singleSelectField.getValue(record.recordId);
              if (brandOrganicValue) {
                // 单选字段返回 {id, text} 对象
                const textValue = typeof brandOrganicValue === 'object' ? brandOrganicValue.text : brandOrganicValue;
                isBrandOrganic = String(textValue).toLowerCase() === 'true';
              }
            } catch (e) {
              // 降级：使用字符串方式获取
              const brandOrganicValue = await getFieldStringValue(materialTable, isBrandOrganicField, record.recordId);
              if (brandOrganicValue) {
                isBrandOrganic = String(brandOrganicValue).toLowerCase() === 'true';
              }
            }
          }

          // 获取 is_branded_content（单选字段）
          let isBrandedContent = false;
          if (isBrandedContentField) {
            try {
              const singleSelectField = await materialTable.getFieldById(isBrandedContentField.id);
              const brandedContentValue = await singleSelectField.getValue(record.recordId);
              if (brandedContentValue) {
                // 单选字段返回 {id, text} 对象
                const textValue = typeof brandedContentValue === 'object' ? brandedContentValue.text : brandedContentValue;
                isBrandedContent = String(textValue).toLowerCase() === 'true';
              }
            } catch (e) {
              // 降级：使用字符串方式获取
              const brandedContentValue = await getFieldStringValue(materialTable, isBrandedContentField, record.recordId);
              if (brandedContentValue) {
                isBrandedContent = String(brandedContentValue).toLowerCase() === 'true';
              }
            }
          }

          // 准备发布数据
          const publishData = {
            access_token: accessToken, // 使用验证过的 accessToken
            business_id: openId,
            video_url: finalVideoUrl,
            custom_thumbnail_url: customThumbnailUrl || undefined,
            post_info: {
              caption: caption || '',
              is_brand_organic: isBrandOrganic,
              is_branded_content: isBrandedContent,
              is_ai_generated: isAIGenerated,
              disable_comment: false,
              disable_duet: false,
              disable_stitch: false
            }
          };

          console.log(`准备发布素材 ${record.recordId}:`, {
            ...publishData,
            access_token: '***'
          });
          
          // 详细日志（仅用于调试）
          console.log(`发布参数详情:`, {
            recordId: record.recordId,
            openId: openId,
            accessTokenLength: accessToken.length,
            accessTokenPrefix: accessToken.substring(0, 30) + '...',
            videoUrl: finalVideoUrl,
            caption: caption?.substring(0, 50) + '...'
          });

          // 调用发布API
          try {
            console.log(`正在调用发布API...`);
            const publishResponse = await fetch('/api/publishVideo', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(publishData)
            });

            console.log(`发布API响应状态: ${publishResponse.status} ${publishResponse.statusText}`);
            
            const publishResult = await publishResponse.json();
            console.log(`发布API返回结果:`, {
              code: publishResult.code,
              message: publishResult.message,
              error: publishResult.error,
              error_code: publishResult.error_code
            });

            if (publishResult.code === 0 && publishResult.data) {
              // 发布成功
              const shareId = publishResult.data.share_id;
              console.log(`✅ 素材 ${record.recordId} 发布成功，share_id: ${shareId}`);

              // 更新发布状态为"发布中"或"已发布"
              try {
                const statusField = publishStatusField;
                if (statusField) {
                  try {
                    // 获取单选字段对象
                    const singleSelectField = await materialTable.getFieldById(statusField.id);
                    // 尝试更新状态为"发布中"
                    try {
                      await singleSelectField.setValue(record.recordId, '发布中');
                    } catch (e) {
                      // 如果"发布中"选项不存在，尝试设置为"已发布"
                      try {
                        await singleSelectField.setValue(record.recordId, '已发布');
                      } catch (e2) {
                        console.warn(`更新发布状态失败:`, e2);
                      }
                    }
                  } catch (e) {
                    console.warn(`获取状态字段失败:`, e);
                  }
                }

                // 如果有 share_id 字段，保存 share_id
                let shareIdField: any = null;
                for (const field of materialFieldList) {
                  try {
                    const fieldName = await field.getName();
                    if (fieldName === 'share_id' || fieldName === 'publish_id') {
                      shareIdField = field;
                      break;
                    }
                  } catch (e) {
                    // 忽略
                  }
                }

                if (shareIdField) {
                  try {
                    await materialTable.setCellValue(shareIdField.id, record.recordId, shareId);
                    console.log(`✅ 已保存 share_id: ${shareId}`);
                  } catch (e) {
                    console.warn(`保存 share_id 失败:`, e);
                  }
                }

                // 获取发布状态并更新
                try {
                  setStatus(`正在获取素材 ${i + 1}/${pendingRecords.length} 的发布状态...`);
                  const publishStatusData = await getPublishStatus(accessToken, openId, shareId);
                  
                  if (publishStatusData && publishStatusData.status) {
                    const statusValue = publishStatusData.status;
                    console.log(`发布状态: ${statusValue}`);
                    
                    // 映射状态到中文
                    let statusText = '发布中';
                    if (statusValue === 'PUBLISH_COMPLETE') {
                      statusText = '已发布';
                    } else if (statusValue === 'FAILED') {
                      statusText = '发布失败';
                      const reason = publishStatusData.reason || '未知原因';
                      console.error(`发布失败原因: ${reason}`);
                      Toast.warning(`素材 ${record.recordId} 发布失败: ${reason}`);
                    } else if (statusValue === 'PROCESSING_DOWNLOAD' || statusValue === 'SEND_TO_USER_INBOX') {
                      statusText = '发布中';
                    }
                    
                    // 更新发布状态字段
                    if (publishStatusField) {
                      try {
                        const singleSelectField = await materialTable.getFieldById(publishStatusField.id);
                        await singleSelectField.setValue(record.recordId, statusText);
                        console.log(`✅ 已更新发布状态为: ${statusText}`);
                      } catch (e) {
                        console.warn(`更新发布状态失败:`, e);
                      }
                    }
                    
                    // 如果发布成功，保存post_ids（如果有）
                    if (statusValue === 'PUBLISH_COMPLETE' && publishStatusData.post_ids && Array.isArray(publishStatusData.post_ids) && publishStatusData.post_ids.length > 0) {
                      // 查找或创建post_ids字段
                      let postIdsField: any = null;
                      for (const field of materialFieldList) {
                        try {
                          const fieldName = await field.getName();
                          if (fieldName === 'post_ids' || fieldName === 'post_id') {
                            postIdsField = field;
                            break;
                          }
                        } catch (e) {
                          // 忽略
                        }
                      }
                      
                      if (postIdsField) {
                        try {
                          const postIdsValue = publishStatusData.post_ids.join(',');
                          await materialTable.setCellValue(postIdsField.id, record.recordId, postIdsValue);
                          console.log(`✅ 已保存 post_ids: ${postIdsValue}`);
                        } catch (e) {
                          console.warn(`保存 post_ids 失败:`, e);
                        }
                      }
                    }
                  }
                } catch (statusError: any) {
                  console.warn(`获取发布状态失败:`, statusError);
                  // 即使获取状态失败，也不影响发布成功的记录
                }
              } catch (e) {
                console.warn(`更新记录状态失败:`, e);
              }

              processedCount++;
              successCount++;
            } else {
              // 发布失败
              const errorMsg = publishResult.message || publishResult.error || '发布失败';
              const errorCode = publishResult.error_code || publishResult.code;
              
              console.error(`❌ 素材 ${record.recordId} 发布失败:`, errorMsg);
              
              // 检查是否是 token 相关错误
              const isTokenError = errorMsg.toLowerCase().includes('access token') || 
                                   errorMsg.toLowerCase().includes('token') ||
                                   errorMsg.toLowerCase().includes('revoked') ||
                                   errorMsg.toLowerCase().includes('expired') ||
                                   errorCode === 40101 || // TikTok API token 错误码
                                   errorCode === 40102;
              
              if (isTokenError) {
                console.error(`⚠️ Access Token 已过期或无效，请更新账号列表中的 access_token`);
                Toast.warning({
                  content: `素材 ${record.recordId} 发布失败：Access Token 已过期或无效，请前往"账号管理"页面更新该账号的 access_token`,
                  duration: 5000
                });
              } else {
                Toast.error(`素材 ${record.recordId} 发布失败: ${errorMsg}`);
              }
              
              // 更新发布状态为"发布失败"
              try {
                const statusField = publishStatusField;
                if (statusField) {
                  try {
                    const singleSelectField = await materialTable.getFieldById(statusField.id);
                    await singleSelectField.setValue(record.recordId, '发布失败');
                  } catch (e) {
                    console.warn(`更新发布状态失败:`, e);
                  }
                }
              } catch (e) {
                console.warn(`更新记录状态失败:`, e);
              }

              errorCount++;
            }
          } catch (error: any) {
            console.error(`发布素材 ${record.recordId} 时出错:`, error);
            errorCount++;
          }

        } catch (error: any) {
          console.error(`处理素材 ${record.recordId} 失败:`, error);
          errorCount++;
        }
      }

      // 显示最终结果
      const message = `处理完成！成功: ${successCount}，跳过: ${skipCount}，失败: ${errorCount}`;
      if (errorCount === 0) {
        Toast.success(message);
      } else {
        Toast.warning(message);
      }
      setStatus(message);

    } catch (error: any) {
      console.error('自动发布失败:', error);
      Toast.error(`发布失败: ${error.message || '未知错误'}`);
      setStatus(`发布失败: ${error.message || '未知错误'}`);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  }, []);

  // 批量更新发布状态
  const handleUpdatePublishStatus = useCallback(async () => {
    const formValues = formApi.current?.getValues();
    const materialTableId = formValues?.materialTable;
    const accountTableId = formValues?.accountTable;

    if (!materialTableId) {
      Toast.error('请先选择素材库表');
      return;
    }

    if (!accountTableId) {
      Toast.error('请先选择账号列表');
      return;
    }

    setUpdatingStatus(true);
    setProgress(0);
    setStatus('开始查询发布中的素材...');

    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;

    try {
      const materialTable = await bitable.base.getTableById(materialTableId);
      const accountTable = await bitable.base.getTableById(accountTableId);

      // 获取字段列表
      let materialFieldList = await materialTable.getFieldList();
      let accountFieldList = await accountTable.getFieldList();

      // 查找必需字段
      let publishStatusField: any = null;
      let publishAccountField: any = null;
      let shareIdField: any = null;
      let postIdsField: any = null;

      for (const field of materialFieldList) {
        try {
          const fieldName = await field.getName();
          if (fieldName === '发布状态') {
            publishStatusField = field;
          } else if (fieldName === '发布账号') {
            publishAccountField = field;
          } else if (fieldName === 'share_id' || fieldName === 'publish_id') {
            shareIdField = field;
          } else if (fieldName === 'post_ids' || fieldName === 'post_id') {
            postIdsField = field;
          }
        } catch (e) {
          // 忽略
        }
      }

      if (!publishStatusField) {
        Toast.error('素材库表中未找到"发布状态"字段');
        setUpdatingStatus(false);
        return;
      }

      if (!shareIdField) {
        Toast.error('素材库表中未找到"share_id"或"publish_id"字段');
        setUpdatingStatus(false);
        return;
      }

      // 查找账号列表字段
      let accessTokenField: any = null;
      let openIdField: any = null;

      for (const field of accountFieldList) {
        try {
          const fieldName = await field.getName();
          if (fieldName === 'access_token') {
            accessTokenField = field;
          } else if (fieldName === 'open_id') {
            openIdField = field;
          }
        } catch (e) {
          // 忽略
        }
      }

      if (!accessTokenField || !openIdField) {
        Toast.error('账号列表中未找到 access_token 或 open_id 字段');
        setUpdatingStatus(false);
        return;
      }

      // 查询所有"发布中"状态的记录
      setStatus('查询发布中的素材...');
      const allRecords = await materialTable.getRecords({ pageSize: 5000 });
      const publishingRecords = [];

      for (const record of allRecords.records) {
        const statusValue = await getFieldStringValue(materialTable, publishStatusField, record.recordId);
        if (statusValue === '发布中') {
          const shareId = await getFieldStringValue(materialTable, shareIdField, record.recordId);
          if (shareId) {
            publishingRecords.push({ record, shareId });
          } else {
            console.log(`记录 ${record.recordId} 没有 share_id，跳过`);
            skipCount++;
          }
        }
      }

      console.log(`找到 ${publishingRecords.length} 条发布中的素材`);

      if (publishingRecords.length === 0) {
        Toast.info('没有找到发布中的素材');
        setUpdatingStatus(false);
        return;
      }

      setStatus(`找到 ${publishingRecords.length} 条发布中的素材，开始更新状态...`);

      // 处理每条记录
      for (let i = 0; i < publishingRecords.length; i++) {
        const { record, shareId } = publishingRecords[i];
        setProgress(Math.round(((i + 1) / publishingRecords.length) * 100));
        setStatus(`正在更新素材 ${i + 1}/${publishingRecords.length} 的发布状态...`);

        try {
          // 获取发布账号（open_id）
          let openId: string | null = null;
          if (publishAccountField) {
            // 先尝试使用 getFieldStringValue（适用于文本字段或直接存储 open_id 的情况）
            const publishAccountValue = await getFieldStringValue(materialTable, publishAccountField, record.recordId);
            
            if (publishAccountValue) {
              // 如果获取到值，直接使用（可能是 open_id 字符串）
              openId = String(publishAccountValue).trim();
              console.log(`从发布账号字段获取到 open_id: ${openId}`);
            } else {
              // 如果 getFieldStringValue 返回空，尝试作为关联字段处理
              try {
                const publishAccountCellValue = await materialTable.getCellValue(publishAccountField.id, record.recordId);
                if (Array.isArray(publishAccountCellValue) && publishAccountCellValue.length > 0) {
                  // 关联字段：从关联记录中获取 open_id
                  const linkedRecord = publishAccountCellValue[0] as any;
                  const linkedRecordId = linkedRecord.recordIds?.[0];
                  if (linkedRecordId) {
                    openId = await getFieldStringValue(accountTable, openIdField, linkedRecordId);
                    console.log(`从关联记录获取到 open_id: ${openId}`);
                  }
                } else if (typeof publishAccountCellValue === 'string' && publishAccountCellValue.trim()) {
                  openId = publishAccountCellValue.trim();
                  console.log(`从关联字段值获取到 open_id: ${openId}`);
                }
              } catch (e) {
                console.warn(`获取发布账号字段值失败:`, e);
              }
            }
          }

          if (!openId) {
            console.log(`记录 ${record.recordId} 没有有效的发布账号 open_id，跳过`);
            skipCount++;
            continue;
          }

          // 获取账号信息（包含access_token）
          const accountInfo = await getAccountInfo(
            accountTable,
            accessTokenField,
            openIdField,
            openId,
            null, // refreshTokenField - 更新状态时不需要刷新token
            null  // tokenExpiresTimeField
          );

          if (!accountInfo || !accountInfo.accessToken) {
            console.log(`记录 ${record.recordId} 无法获取账号信息 (open_id: ${openId})，跳过`);
            skipCount++;
            continue;
          }

          // 获取发布状态
          const publishStatusData = await getPublishStatus(accountInfo.accessToken, openId, shareId);

          if (publishStatusData && publishStatusData.status) {
            const statusValue = publishStatusData.status;
            console.log(`素材 ${record.recordId} 发布状态: ${statusValue}`);

            // 映射状态到中文
            let statusText = '发布中';
            if (statusValue === 'PUBLISH_COMPLETE') {
              statusText = '已发布';
            } else if (statusValue === 'FAILED') {
              statusText = '发布失败';
              const reason = publishStatusData.reason || '未知原因';
              console.error(`发布失败原因: ${reason}`);
            } else if (statusValue === 'PROCESSING_DOWNLOAD' || statusValue === 'SEND_TO_USER_INBOX') {
              statusText = '发布中';
            }

            // 更新发布状态字段
            try {
              const singleSelectField = await materialTable.getFieldById(publishStatusField.id);
              await singleSelectField.setValue(record.recordId, statusText);
              console.log(`✅ 已更新发布状态为: ${statusText}`);
              processedCount++;
              successCount++;
            } catch (e) {
              console.warn(`更新发布状态失败:`, e);
              errorCount++;
            }

            // 如果发布成功，保存post_ids（如果有）
            if (statusValue === 'PUBLISH_COMPLETE' && publishStatusData.post_ids && Array.isArray(publishStatusData.post_ids) && publishStatusData.post_ids.length > 0) {
              if (postIdsField) {
                try {
                  const postIdsValue = publishStatusData.post_ids.join(',');
                  await materialTable.setCellValue(postIdsField.id, record.recordId, postIdsValue);
                  console.log(`✅ 已保存 post_ids: ${postIdsValue}`);
                } catch (e) {
                  console.warn(`保存 post_ids 失败:`, e);
                }
              }
            }
          } else {
            console.warn(`记录 ${record.recordId} 获取发布状态失败`);
            errorCount++;
          }
        } catch (error: any) {
          console.error(`更新素材 ${record.recordId} 发布状态失败:`, error);
          errorCount++;
        }
      }

      // 显示最终结果
      const message = `更新完成！成功: ${successCount}，跳过: ${skipCount}，失败: ${errorCount}`;
      if (errorCount === 0) {
        Toast.success(message);
      } else {
        Toast.warning(message);
      }
      setStatus(message);

    } catch (error: any) {
      console.error('更新发布状态失败:', error);
      Toast.error(`更新失败: ${error.message || '未知错误'}`);
      setStatus(`更新失败: ${error.message || '未知错误'}`);
    } finally {
      setUpdatingStatus(false);
      setProgress(0);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      bitable.base.getTableMetaList(),
      bitable.base.getSelection()
    ]).then(([metaList, selection]) => {
      setMaterialTableMetaList(metaList);
      setAccountTableMetaList(metaList);
      
      // 根据表名查找并默认选中
      const materialTableId = metaList.find(table => table.name === '素材库')?.id || selection.tableId;
      const accountTableId = metaList.find(table => table.name === '账号列表')?.id || selection.tableId;
      
      formApi.current?.setValues({ 
        materialTable: materialTableId,
        accountTable: accountTableId 
      });
    });
  }, []);

  return (
    <div>
      <Title heading={4} style={{ marginBottom: '1rem' }}>
        TikTok 素材发布管理
      </Title>
      <Text type="tertiary" style={{ marginBottom: '1rem', display: 'block' }}>
        自动化发布 TikTok 视频素材，支持定时发布、批量发布、自动 Token 刷新等功能，让您的视频内容管理更高效。
      </Text>
      
      <Form 
        labelPosition='top' 
        onSubmit={handleAutoPublish} 
        getFormApi={(baseFormApi: BaseFormApi) => formApi.current = baseFormApi}
        style={{ marginTop: '1rem' }}
      >
        <Form.Slot label="使用说明">
          <div style={{ marginBottom: '1rem', fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
            <div><strong>功能说明：</strong> 自动发布素材库中符合条件的视频到 TikTok，支持定时发布、自动上传视频到 OSS、自动刷新 Token 等</div>
            <div style={{ marginTop: '0.5rem' }}>
              <strong>操作步骤：</strong>
              <div style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                <div>1. 选择素材库表（包含发布状态、发布时间、发布账号、视频附件等字段）</div>
                <div>2. 选择账号列表（包含 access_token 和 open_id 字段）</div>
                <div>3. 点击&ldquo;自动发布&rdquo;按钮开始发布流程</div>
                <div>4. 系统会自动查询符合条件的素材并发布到 TikTok</div>
              </div>
            </div>
            <div style={{ marginTop: '0.5rem', color: '#1890ff', fontWeight: '500' }}>
              💡 发布条件：发布状态 = &ldquo;等待发布&rdquo; 且 发布时间 ≤ 当前时间。系统会自动检查 Token 是否过期，过期前会自动刷新。
            </div>
            <div style={{ marginTop: '0.5rem', color: '#fa8c16', fontWeight: '500' }}>
              ⚠️ 注意：发布操作会调用 TikTok API，请确保素材已准备好视频附件和标题等信息
            </div>
          </div>
        </Form.Slot>

        <Space vertical spacing="loose" style={{ width: '100%' }}>
          <Form.Select 
            field='materialTable' 
            label='选择素材库表' 
            placeholder="请选择素材库表" 
            style={{ width: '100%' }}
            rules={[{ required: true, message: '请选择素材库表' }]}
          >
            {
              Array.isArray(materialTableMetaList) && materialTableMetaList.map(({ name, id }) => {
                return (
                  <Form.Select.Option key={id} value={id}>
                    {name}
                  </Form.Select.Option>
                );
              })
            }
          </Form.Select>

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

          <Button 
            theme='solid' 
            type="primary"
            htmlType='submit' 
            loading={loading}
            style={{ width: '100%' }}
          >
            自动发布
          </Button>

          <Button 
            theme='borderless' 
            type="tertiary"
            onClick={handleUpdatePublishStatus}
            loading={updatingStatus}
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            更新发布状态
          </Button>

          {(loading || updatingStatus) && (
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


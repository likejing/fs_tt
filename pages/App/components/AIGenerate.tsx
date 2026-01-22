'use client'
import { bitable, ITableMeta, FieldType } from "@lark-base-open/js-sdk";
import { Button, Form, Toast, Typography, Space, Progress } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef, useCallback } from 'react';
import { BaseFormApi } from '@douyinfe/semi-foundation/lib/es/form/interface';
import { getFieldStringValue, findOrCreateField } from '../utils/fieldUtils';
import { APIMART_VIDEO_GENERATE_API, APIMART_TASK_STATUS_API } from '../constants';

const { Title, Text } = Typography;

export default function AIGenerate() {
  const [tableMetaList, setTableMetaList] = useState<ITableMeta[]>();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const formApi = useRef<BaseFormApi>();

  // 获取附件临时下载链接
  const getAttachmentTempUrls = async (table: any, field: any, recordId: string): Promise<Array<{ url: string; name: string }>> => {
    try {
      const attachmentField = await table.getFieldById(field.id);
      const attachments = await attachmentField.getValue(recordId);
      
      if (Array.isArray(attachments) && attachments.length > 0) {
        // 获取临时下载链接
        const tempUrls = await attachmentField.getAttachmentUrls(recordId);
        
        return attachments.map((att: any, index: number) => ({
          url: tempUrls[index] || att.url || att.token || '',
          name: att.name || 'unknown'
        })).filter((item: any) => item.url);
      }
      return [];
    } catch (e) {
      console.error('获取附件临时下载链接失败:', e);
      return [];
    }
  };

  // 上传文件到阿里云 OSS
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
          folder: folder || 'sora-images'
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

  // 压缩图片并转换为Base64
  const compressImage = (file: File, maxWidth: number = 1920, maxHeight: number = 1920, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 计算缩放比例
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法创建canvas上下文'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          
          // 转换为Base64
          const base64String = canvas.toDataURL('image/jpeg', quality);
          // 移除data:image/...;base64,前缀，只保留base64数据
          const base64Data = base64String.split(',')[1];
          resolve(base64Data);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 将图片URL转换为Base64（带压缩）
  const imageUrlToBase64 = async (imageUrl: string): Promise<string> => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // 创建File对象用于压缩
      const file = new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' });
      
      // 压缩图片（最大1920x1920，质量80%）
      const compressedBase64 = await compressImage(file, 1920, 1920, 0.8);
      
      console.log(`图片压缩完成，原始大小: ${blob.size} bytes，压缩后Base64长度: ${compressedBase64.length}`);
      
      return compressedBase64;
    } catch (error) {
      console.error('图片转Base64失败:', error);
      throw error;
    }
  };

  // 根据横竖屏和时长构建生成参数
  const getGenerationParams = (orientation: string | null, duration: string | null) => {
    const defaultOrientation = '横屏';
    const defaultDuration = '10s';

    const ori = orientation || defaultOrientation;
    const isPortrait = ori.includes('竖屏') || ori.toLowerCase().includes('portrait');
    const aspect_ratio = isPortrait ? '9:16' : '16:9';

    const dur = duration || defaultDuration;
    let durationSec = 10;
    if (dur.includes('25')) {
      durationSec = 25;
    } else if (dur.includes('15')) {
      durationSec = 15;
    } else {
      durationSec = 10;
    }

    const model = durationSec >= 25 ? 'sora-2-pro' : 'sora-2';

    console.log(
      `生成参数: 横竖屏=${ori}, 时长=${dur}, aspect_ratio=${aspect_ratio}, duration=${durationSec}, model=${model}`
    );

    return { aspect_ratio, duration: durationSec, model };
  };

  // 调用 Apimart 视频生成接口（返回异步任务）
  const createApimartTask = async (payload: any): Promise<{ status: string; task_id: string }> => {
    try {
      console.log('提交生成任务，payload:', JSON.stringify({ 
        ...payload, 
        image_urls: payload.image_urls?.length || 0,
        image_urls_preview: payload.image_urls?.slice(0, 2) || []
      }));
      
      const startTime = Date.now();
      
      // 设置 90 秒超时（前端超时，给后端更多时间）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const response = await fetch(APIMART_VIDEO_GENERATE_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const elapsedTime = Date.now() - startTime;
      console.log(`请求耗时: ${elapsedTime}ms, 状态码: ${response.status}`);

      // 检查响应状态
      if (!response.ok) {
        let errorText = '';
        let errorData: any = {};
        try {
          errorData = await response.json();
          errorText = errorData?.error || errorData?.message || `HTTP ${response.status}`;
        } catch {
          errorText = await response.text().catch(() => `HTTP ${response.status}`);
        }
        
        // 524 是网关超时错误
        if (response.status === 524) {
          throw new Error(`请求超时（${elapsedTime}ms）：网关超时。可能原因：1) 图片 URL 无法被 Apimart API 访问（需要公网可访问的 URL）；2) 服务器处理时间过长。请检查图片 URL 或稍后重试`);
        }
        
        console.error('API 错误响应:', response.status, errorText, errorData);
        throw new Error(`请求失败 (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      console.log('API 响应数据:', JSON.stringify(result));

      // 检查业务状态码（Apimart 返回 code: 200 表示成功）
      if (result.code !== 0 && result.code !== 200) {
        const errMsg = result?.error || result?.message || '未知错误';
        throw new Error(`业务错误 (code: ${result.code}): ${errMsg}`);
      }

      // 提取任务数据
      const taskData = result.data;
      if (!taskData) {
        throw new Error('未返回任务数据，响应: ' + JSON.stringify(result));
      }

      // 处理数组或对象格式
      const task = Array.isArray(taskData) ? taskData[0] : taskData;
      if (!task?.task_id) {
        throw new Error('未返回任务ID，响应数据: ' + JSON.stringify(taskData));
      }

      console.log(`✅ 任务创建成功: task_id=${task.task_id}, status=${task.status}`);
      return { status: task.status || 'submitted', task_id: task.task_id };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('请求超时：超过 90 秒未响应，请检查网络连接或图片 URL 是否可访问');
      }
      console.error('createApimartTask 错误:', error);
      throw error;
    }
  };

  // 根据任务ID获取任务状态和结果
  const fetchApimartTaskStatus = async (taskId: string) => {
    const url = `${APIMART_TASK_STATUS_API}?task_id=${encodeURIComponent(taskId)}&language=zh`;
    const response = await fetch(url);
    const result = await response.json();

    if (!response.ok || result.code !== 0) {
      const errMsg = result?.error || result?.message || `请求失败: ${response.status}`;
      throw new Error(errMsg);
    }

    return result.data;
  };

  // 生成Sora2视频
  const handleGenerateSora2 = useCallback(async ({ 
    table: tableId 
  }: { 
    table: string;
  }) => {
    if (!tableId) {
      Toast.error('请先选择数据表');
      return;
    }

    setLoading(true);
    setProgress(0);
    setStatus('开始提交AI视频生成任务...');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    try {
      const table = await bitable.base.getTableById(tableId);
      let fieldList = await table.getFieldList();

      // 查找必需字段
      let promptField: any = null;
      let referenceImageField: any = null;
      let sora2VideoField: any = null; // 已生成视频（存在则跳过）
      let shouldGenerateField: any = null;
      let orientationField: any = null; // 横竖屏字段
      let durationField: any = null; // 生成时长字段
      let taskIdField: any = null; // 任务ID
      let taskStatusField: any = null; // 生成状态

      // 遍历字段列表，通过 getName() 获取字段名称并匹配
      for (const field of fieldList) {
        try {
          const fieldName = await field.getName();
          if (fieldName === '文本提示词' || fieldName === 'prompt') {
            promptField = field;
          } else if (fieldName === '参考图' || fieldName === 'reference_image') {
            referenceImageField = field;
          } else if (fieldName === 'Sora2视频' || fieldName === 'sora2_video') {
            sora2VideoField = field;
          } else if (fieldName === '是否生成Sora' || fieldName === 'should_generate') {
            shouldGenerateField = field;
          } else if (fieldName === '横竖屏' || fieldName === 'orientation') {
            orientationField = field;
          } else if (fieldName === '生成时长' || fieldName === 'duration') {
            durationField = field;
          } else if (fieldName === '任务ID' || fieldName === 'task_id' || fieldName === 'Task ID') {
            taskIdField = field;
          } else if (fieldName === '生成状态' || fieldName === '状态' || (typeof fieldName === 'string' && fieldName.toLowerCase() === 'status')) {
            taskStatusField = field;
          }
        } catch (e) {
          console.warn('获取字段名称失败:', e);
        }
      }

      // 如果字段不存在，尝试通过名称获取
      if (!promptField) {
        try {
          promptField = await table.getFieldByName('文本提示词');
        } catch (e) {
          console.warn('文本提示词字段不存在');
        }
      }

      if (!referenceImageField) {
        try {
          referenceImageField = await table.getFieldByName('参考图');
        } catch (e) {
          console.warn('参考图字段不存在');
        }
      }

      if (!sora2VideoField) {
        try {
          sora2VideoField = await table.getFieldByName('Sora2视频');
        } catch (e) {
          // 创建Sora2视频字段（如果不存在）
          sora2VideoField = await findOrCreateField(table, fieldList, 'Sora2视频', FieldType.Attachment);
          if (!sora2VideoField) {
            Toast.error('无法创建或获取 Sora2视频 字段');
            setLoading(false);
            return;
          }
          fieldList = await table.getFieldList();
        }
      }

      if (!shouldGenerateField) {
        try {
          shouldGenerateField = await table.getFieldByName('是否生成Sora');
        } catch (e) {
          console.warn('是否生成Sora字段不存在');
        }
      }

      if (!orientationField) {
        try {
          orientationField = await table.getFieldByName('横竖屏');
        } catch (e) {
          console.warn('横竖屏字段不存在');
        }
      }

      if (!durationField) {
        try {
          durationField = await table.getFieldByName('生成时长');
        } catch (e) {
          console.warn('生成时长字段不存在');
        }
      }

      if (!taskIdField) {
        taskIdField = await findOrCreateField(table, fieldList, '任务ID', FieldType.Text);
        fieldList = await table.getFieldList();
      }

      if (!taskStatusField) {
        taskStatusField = await findOrCreateField(table, fieldList, '生成状态', FieldType.Text);
        fieldList = await table.getFieldList();
      }

      // 验证必需字段
      if (!promptField) {
        Toast.error('数据表中未找到"文本提示词"字段');
        setLoading(false);
        return;
      }

      // 参考图字段是可选的（支持文生视频）
      if (!referenceImageField) {
        console.warn('未找到"参考图"字段，将仅支持文生视频');
      }

      // 获取所有记录
      const records = await table.getRecords({ pageSize: 5000 });
      const totalRecords = records.records.length;

      console.log(`开始处理 ${totalRecords} 条记录`);

      // 遍历每条记录
      for (let i = 0; i < totalRecords; i++) {
        const record = records.records[i];
        const recordId = record.recordId;

        setProgress(Math.round(((i + 1) / totalRecords) * 100));
        setStatus(`正在处理记录 ${i + 1}/${totalRecords}...`);

        try {
          // 检查是否应该生成
          if (shouldGenerateField) {
            const shouldGenerate = await getFieldStringValue(table, shouldGenerateField, recordId);
            if (shouldGenerate !== '是' && shouldGenerate !== 'true' && shouldGenerate !== 'True') {
              console.log(`记录 ${recordId} 的"是否生成Sora"为否，跳过`);
              skipCount++;
              continue;
            }
          }

          // 检查是否已有视频
          if (sora2VideoField) {
            try {
              const attachmentField = await table.getFieldById(sora2VideoField.id);
              const existingAttachments = await attachmentField.getValue(recordId);
              if (Array.isArray(existingAttachments) && existingAttachments.length > 0) {
                console.log(`记录 ${recordId} 已有Sora2视频，跳过`);
                skipCount++;
                continue;
              }
            } catch (e) {
              console.warn(`检查已有视频失败:`, e);
            }
          }

          // 已有任务ID的记录不再重复提交
          if (taskIdField) {
            try {
              const existingTaskId = await getFieldStringValue(table, taskIdField, recordId);
              if (existingTaskId) {
                console.log(`记录 ${recordId} 已有任务ID(${existingTaskId})，跳过提交`);
                skipCount++;
                continue;
              }
            } catch (e) {
              console.warn(`检查任务ID失败:`, e);
            }
          }

          // 获取文本提示词
          const prompt = await getFieldStringValue(table, promptField, recordId);
          if (!prompt) {
            console.log(`记录 ${recordId} 缺少文本提示词，跳过`);
            skipCount++;
            continue;
          }

          // 获取横竖屏和生成时长 -> 构建生成参数
          const orientation = orientationField ? await getFieldStringValue(table, orientationField, recordId) : null;
          const duration = durationField ? await getFieldStringValue(table, durationField, recordId) : null;
          const { aspect_ratio, duration: durationSec, model } = getGenerationParams(orientation, duration);

          // 获取参考图URL（可选，多张取全部）
          const imageAttachments = referenceImageField ? await getAttachmentTempUrls(table, referenceImageField, recordId) : [];
          console.log(`处理记录 ${recordId}，提示词: ${prompt}，参考图数量: ${imageAttachments.length}`);
          
          // 先将图片上传到 OSS，获取公网可访问的 URL
          const imageUrls: string[] = [];
          if (imageAttachments.length > 0) {
            setStatus(`正在上传 ${imageAttachments.length} 张图片到 OSS...`);
            let uploadSuccessCount = 0;
            let uploadFailCount = 0;
            
            for (let i = 0; i < imageAttachments.length; i++) {
              const attachment = imageAttachments[i];
              try {
                console.log(`上传图片 ${i + 1}/${imageAttachments.length}: ${attachment.name}`);
                setStatus(`正在上传图片 ${i + 1}/${imageAttachments.length}...`);
                const ossUrl = await uploadToOSS(attachment.url, attachment.name, 'sora-images');
                imageUrls.push(ossUrl);
                uploadSuccessCount++;
                console.log(`✅ 图片上传成功: ${ossUrl}`);
              } catch (error: any) {
                uploadFailCount++;
                console.error(`上传图片 ${attachment.name} 失败:`, error);
                Toast.warning(`记录 ${recordId} 的图片 "${attachment.name}" 上传到 OSS 失败: ${error.message || '未知错误'}`);
                // 继续处理其他图片，不中断流程
              }
            }
            
            if (imageUrls.length === 0 && imageAttachments.length > 0) {
              console.warn(`⚠️ 所有图片上传失败，跳过该记录`);
              Toast.error(`记录 ${recordId} 的所有图片上传失败，跳过生成`);
              errorCount++;
              continue;
            }
            
            if (uploadFailCount > 0) {
              Toast.warning(`记录 ${recordId}: 成功上传 ${uploadSuccessCount} 张，失败 ${uploadFailCount} 张`);
            }
            
            console.log(`✅ 成功上传 ${imageUrls.length}/${imageAttachments.length} 张图片到 OSS`);
            console.log(`OSS URLs:`, imageUrls);
          }

          // 调用 Apimart 生成任务
          setStatus(`正在提交生成任务...`);
          const task = await createApimartTask({
            model,
            prompt,
            duration: durationSec,
            aspect_ratio,
            private: false,
            watermark: false,
            image_urls: imageUrls.length > 0 ? imageUrls : undefined,
          });

          // 写回任务ID与状态
          if (taskIdField) {
            await table.setCellValue(taskIdField.id, recordId, task.task_id);
          }
          if (taskStatusField) {
            await table.setCellValue(taskStatusField.id, recordId, task.status || 'submitted');
          }

          console.log(`✅ 记录 ${recordId} 任务创建成功，task_id=${task.task_id}, status=${task.status}`);
          successCount++;
        } catch (error: any) {
          console.error(`处理记录 ${recordId} 失败:`, error);
          errorCount++;
          Toast.error(`记录 ${recordId} 生成失败: ${error.message || '未知错误'}`);
        }
      }

      // 显示结果
      Toast.success(`生成完成！成功: ${successCount}，跳过: ${skipCount}，失败: ${errorCount}`);
      setStatus(`生成完成！成功: ${successCount}，跳过: ${skipCount}，失败: ${errorCount}`);
    } catch (error: any) {
      console.error('生成Sora2视频失败:', error);
      Toast.error(`生成失败: ${error.message || '未知错误'}`);
      setStatus(`生成失败: ${error.message || '未知错误'}`);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  }, []);

  // 更新任务状态并在完成后保存视频附件
  const handleUpdateTaskStatus = useCallback(async ({ 
    table: tableId 
  }: { 
    table: string;
  }) => {
    if (!tableId) {
      Toast.error('请先选择数据表');
      return;
    }

    setLoading(true);
    setProgress(0);
    setStatus('开始更新任务状态...');

    let updatedCount = 0;
    let completedCount = 0;
    let errorCount = 0;

    try {
      const table = await bitable.base.getTableById(tableId);
      const fieldList = await table.getFieldList();

      // 查找相关字段
      let taskIdField: any = null;
      let taskStatusField: any = null;
      let sora2VideoField: any = null;

      for (const field of fieldList) {
        try {
          const name = await field.getName();
          if (name === '任务ID' || name === 'task_id' || name === 'Task ID') {
            taskIdField = field;
          } else if (name === '生成状态' || name === '状态' || (typeof name === 'string' && name.toLowerCase() === 'status')) {
            taskStatusField = field;
          } else if (name === 'Sora2视频' || name === 'sora2_video') {
            sora2VideoField = field;
          }
        } catch (e) {
          console.warn('获取字段名称失败:', e);
        }
      }

      if (!taskIdField) {
        Toast.error('未找到“任务ID”字段，无法更新任务状态');
        setLoading(false);
        return;
      }

      const records = await table.getRecords({ pageSize: 5000 });
      const total = records.records.length;

      for (let i = 0; i < total; i++) {
        const record = records.records[i];
        const recordId = record.recordId;

        setProgress(Math.round(((i + 1) / total) * 100));
        setStatus(`正在更新任务状态 ${i + 1}/${total}...`);

        try {
          const taskId = await getFieldStringValue(table, taskIdField, recordId);
          if (!taskId) {
            continue;
          }

          const data = await fetchApimartTaskStatus(String(taskId).trim());
          const statusValue = data.status || '';
          updatedCount++;

          if (taskStatusField) {
            await table.setCellValue(taskStatusField.id, recordId, statusValue);
          }

          // 如果任务已完成且有视频结果，下载并保存到附件字段
          if (statusValue === 'completed' && sora2VideoField && data.result && Array.isArray(data.result.videos)) {
            const attachmentField = await table.getFieldById(sora2VideoField.id);

            // 如果已经有视频附件则跳过
            try {
              const existingAttachments = await attachmentField.getValue(recordId);
              if (Array.isArray(existingAttachments) && existingAttachments.length > 0) {
                console.log(`记录 ${recordId} 状态已完成且已有视频附件，跳过保存`);
                completedCount++;
                continue;
              }
            } catch (attachmentError) {
              console.warn(`检查记录 ${recordId} 现有附件失败:`, attachmentError);
            }

            const firstVideo = data.result.videos[0];
            const urlArray = firstVideo?.url;
            const videoUrl = Array.isArray(urlArray) ? urlArray[0] : null;

            if (videoUrl) {
              try {
                const videoResponse = await fetch(videoUrl);
                if (!videoResponse.ok) {
                  throw new Error(`下载视频失败: ${videoResponse.status} ${videoResponse.statusText}`);
                }
                const blob = await videoResponse.blob();
                const fileName = `sora2_video_${Date.now()}.mp4`;
                const file = new File([blob], fileName, { type: 'video/mp4' });

                await attachmentField.setValue(recordId, file);

                completedCount++;
                console.log(`✅ 记录 ${recordId} 状态完成并已保存视频附件`);
              } catch (e) {
                console.error(`记录 ${recordId} 保存视频失败:`, e);
              }
            }
          }
        } catch (e: any) {
          errorCount++;
          console.error(`更新记录 ${recordId} 任务状态失败:`, e);
        }
      }

      Toast.success(`任务状态更新完成！更新: ${updatedCount}，已完成并保存视频: ${completedCount}，失败: ${errorCount}`);
      setStatus(`任务状态更新完成！更新: ${updatedCount}，已完成并保存视频: ${completedCount}，失败: ${errorCount}`);
    } catch (error: any) {
      console.error('更新任务状态失败:', error);
      Toast.error(`更新任务状态失败: ${error.message || '未知错误'}`);
      setStatus(`更新任务状态失败: ${error.message || '未知错误'}`);
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
      const defaultTable = metaList.find(meta => meta.name === 'AI素材生成');
      const initialTableId = defaultTable?.id || selection.tableId;
      if (initialTableId) {
        formApi.current?.setValues({ table: initialTableId });
      }
    });
  }, []);

  return (
    <div>
      <Title heading={4} style={{ marginBottom: '1rem' }}>
        TikTok AI 视频生成
      </Title>
      <Text type="tertiary" style={{ marginBottom: '1rem', display: 'block' }}>
        使用 Sora2 AI 模型生成高质量视频内容，支持文本提示词、参考图片、自定义时长和横竖屏比例，为您的 TikTok 内容创作提供强大的 AI 支持。
      </Text>
      
      <Form
        getFormApi={(api) => formApi.current = api}
        style={{ width: '100%' }}
      >
        <Form.Slot label="使用说明">
          <div style={{ marginBottom: '1rem', fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
            <div><strong>功能说明：</strong> 基于 Sora2 AI 模型，根据文本提示词和参考图片自动生成视频内容，支持自定义视频时长和横竖屏比例</div>
            <div style={{ marginTop: '0.5rem' }}>
              <strong>操作步骤：</strong>
              <div style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                <div>1. 在数据表中填写&ldquo;文本提示词&rdquo;字段（必填）</div>
                <div>2. 可选：上传&ldquo;参考图&rdquo;附件，AI 将参考图片生成视频</div>
                <div>3. 可选：设置&ldquo;横竖屏&rdquo;和&ldquo;生成时长&rdquo;字段</div>
                <div>4. 点击&ldquo;生成Sora2视频&rdquo;按钮提交生成任务</div>
                <div>5. 使用&ldquo;更新任务状态&rdquo;按钮查询生成进度并下载完成的视频</div>
              </div>
            </div>
            <div style={{ marginTop: '0.5rem', color: '#1890ff', fontWeight: '500' }}>
              💡 提示：生成任务提交后会返回任务ID，视频生成需要一定时间。请定期点击&ldquo;更新任务状态&rdquo;查询进度，完成后会自动下载并保存到&ldquo;Sora2视频&rdquo;附件字段。
            </div>
            <div style={{ marginTop: '0.5rem', color: '#fa8c16', fontWeight: '500' }}>
              ⚠️ 注意：如果记录已有任务ID，将跳过生成；如果生成状态为&ldquo;已完成&rdquo;且已有视频附件，将跳过状态更新
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
            type="primary"
            onClick={() => {
              const values = formApi.current?.getValues() || {};
              handleGenerateSora2({ table: values.table });
            }}
            loading={loading}
            style={{ width: '100%' }}
          >
            生成Sora2视频
          </Button>

          <Button
            theme='solid'
            type="secondary"
            onClick={() => {
              const values = formApi.current?.getValues() || {};
              handleUpdateTaskStatus({ table: values.table });
            }}
            loading={loading}
            style={{ width: '100%' }}
          >
            更新任务状态
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


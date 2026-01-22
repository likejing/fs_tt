import type { NextApiRequest, NextApiResponse } from 'next';

// 增加 API 路由超时配置（Next.js 13+）
export const config = {
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '10mb',
    },
    // 注意：Next.js API routes 在 Vercel 上有 10 秒超时限制
    // 如果部署在其他平台，可能需要额外配置
  },
};

type ApiResponse = {
  code?: number;
  data?: any;
  error?: string;
  message?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.APIMART_API_KEY;
  if (!apiKey) {
    res.status(500).json({ code: -1, error: 'APIMART_API_KEY is not configured' });
    return;
  }

  const {
    model = 'sora-2',
    prompt,
    duration,
    aspect_ratio,
    image_urls,
    watermark = false,
    thumbnail,
    private: isPrivate = false,
    style,
    storyboard,
    character_url,
    character_timestamps,
  } = req.body || {};

  if (!prompt) {
    res.status(400).json({ code: -1, error: 'Missing required parameter: prompt' });
    return;
  }

  const payload: Record<string, any> = {
    model,
    prompt,
    private: isPrivate,
    watermark,
  };

  if (duration) payload.duration = duration;
  if (aspect_ratio) payload.aspect_ratio = aspect_ratio;
  if (thumbnail !== undefined) payload.thumbnail = thumbnail;
  if (Array.isArray(image_urls) && image_urls.length > 0) payload.image_urls = image_urls;
  if (style) payload.style = style;
  if (typeof storyboard === 'boolean') payload.storyboard = storyboard;
  if (character_url) payload.character_url = character_url;
  if (character_timestamps) payload.character_timestamps = character_timestamps;

  try {
    console.log('调用 Apimart API，payload:', JSON.stringify({ 
      ...payload, 
      image_urls: payload.image_urls?.length || 0,
      image_urls_preview: payload.image_urls?.slice(0, 2) || []
    }));

    const startTime = Date.now();
    
    // Apimart API 应该很快返回，设置 60 秒超时以防万一
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch('https://api.apimart.ai/v1/videos/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const elapsedTime = Date.now() - startTime;
      console.log(`Apimart API 响应时间: ${elapsedTime}ms, 状态码: ${response.status}`);

      const data = await response.json().catch((e) => {
        console.error('解析响应 JSON 失败:', e);
        return {};
      });

      console.log('Apimart API 原始响应:', JSON.stringify(data));

      // Apimart API 返回格式: {"code":200,"data":[...]} 或 {"code":非200,"error":"..."}
      if (data.code === 200 || response.ok) {
        // 成功：返回 data 字段
        const resultData = data.data || data;
        console.log('Apimart API 成功，返回数据:', JSON.stringify(resultData));
        res.status(200).json({ code: 0, data: resultData });
      } else {
        // 错误：返回错误信息
        const errorMessage = data?.error?.message || data?.error || data?.message || `Request failed: ${response.status}`;
        console.error('Apimart API 业务错误:', data.code, errorMessage, data);
        res.status(response.status || 400).json({ 
          code: data?.code || -1, 
          error: errorMessage, 
          data: data 
        });
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      const elapsedTime = Date.now() - startTime;
      
      if (fetchError.name === 'AbortError') {
        console.error(`请求超时（${elapsedTime}ms）`);
        res.status(504).json({
          code: -1,
          error: '请求超时',
          message: `Apimart API 请求超过 60 秒未响应（已等待 ${elapsedTime}ms），请检查图片 URL 是否可公网访问`,
        });
        return;
      }
      
      console.error('Fetch 错误:', fetchError);
      throw fetchError;
    }
  } catch (error: any) {
    console.error('API 路由错误:', error);
    res.status(500).json({
      code: -1,
      error: 'Internal server error',
      message: error?.message || 'Unknown error',
    });
  }
}


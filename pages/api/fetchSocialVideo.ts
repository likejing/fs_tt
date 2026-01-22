import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  code?: number
  message?: string
  data?: any
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  // 统一使用 POST，由前端传 share_url，服务端转发为 GET
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { share_url } = req.body || {}

  if (!share_url || typeof share_url !== 'string') {
    res.status(400).json({
      code: -1,
      error: 'Missing required parameter: share_url',
      message: '缺少必填参数 share_url',
    })
    return
  }

  const apiKey = process.env.TIKHUB_API_KEY
  if (!apiKey) {
    res.status(500).json({
      code: -1,
      error: 'TIKHUB_API_KEY is not configured',
      message: '服务端未配置 TIKHUB_API_KEY 环境变量',
    })
    return
  }

  // 根据分享链接类型选择对应的 API 端点
  // 检测 URL 是否包含 tiktok 或 douyin
  const shareUrlLower = share_url.toLowerCase()
  let apiPath: string
  
  if (shareUrlLower.includes('tiktok') || shareUrlLower.includes('tiktok.com')) {
    // TikTok 链接
    apiPath = '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url'
  } else if (shareUrlLower.includes('douyin') || shareUrlLower.includes('douyin.com')) {
    // 抖音链接
    apiPath = '/api/v1/douyin/app/v3/fetch_one_video_by_share_url'
  } else {
    // 默认使用 TikTok（向后兼容）
    apiPath = '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url'
  }

  const apiUrl = new URL(`https://api.tikhub.io${apiPath}`)
  apiUrl.searchParams.set('share_url', share_url)

  try {
    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    })

    const text = await response.text()
    let data: any

    try {
      data = text ? JSON.parse(text) : {}
    } catch (e) {
      data = { code: response.status, message: 'Failed to parse TikHub response' }
    }

    if (!response.ok || (typeof data.code === 'number' && data.code !== 200)) {
      const msg =
        data.message_zh ||
        data.message ||
        `Request failed: ${response.status} ${response.statusText}`
      res.status(response.ok ? 200 : response.status).json({
        code: data.code ?? -1,
        error: msg,
        message: msg,
        data,
      })
      return
    }

    res.status(200).json({
      code: 0,
      message: 'ok',
      data,
    })
  } catch (error: any) {
    console.error('TikHub fetch error:', error)
    res.status(500).json({
      code: -1,
      error: 'Internal server error',
      message: error.message || 'Unknown error',
    })
  }
}



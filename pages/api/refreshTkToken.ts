// Next.js API route to refresh TikTok access token
import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  code?: number
  message?: string
  data?: any
  error?: string
  error_code?: number
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // 获取请求体
  const { refresh_token } = req.body

  // 验证必需参数
  if (!refresh_token) {
    res.status(400).json({ 
      code: -1,
      error: 'Missing required parameter: refresh_token' 
    })
    return
  }

  try {
    // 从环境变量获取TikTok应用配置
    const clientId = process.env.TIKTOK_CLIENT_ID || '7519030880531447825'
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET || ''

    if (!clientSecret) {
      res.status(500).json({
        code: -1,
        error: 'TIKTOK_CLIENT_SECRET is not configured. Please set it in environment variables.'
      })
      return
    }

    // 构建请求体
    const requestBody = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    }

    console.log(`Refreshing TikTok token with client_id: ${clientId}`)

    // 调用TikTok刷新Token接口
    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/refresh_token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })

    // 解析响应数据
    let data: any
    try {
      const responseText = await response.text()
      data = responseText ? JSON.parse(responseText) : {}
    } catch (e) {
      data = { code: -1, message: 'Failed to parse response' }
    }

    // 检查响应状态和业务错误码
    if (!response.ok || data.code !== 0) {
      const errorMessage = data.message || data.error_description || data.error || `Request failed: ${response.status} ${response.statusText}`
      console.error(`Token refresh failed:`, errorMessage)
      res.status(response.ok ? 200 : response.status).json({
        code: data.code || -1,
        error: errorMessage,
        message: errorMessage,
        error_code: data.error_code || data.code
      })
      return
    }

    console.log(`✅ Token refreshed successfully for open_id: ${data.data?.open_id || 'unknown'}`)

    // 返回成功数据
    res.status(200).json(data)
  } catch (error: any) {
    console.error('Token refresh error:', error)
    res.status(500).json({
      code: -1,
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    })
  }
}



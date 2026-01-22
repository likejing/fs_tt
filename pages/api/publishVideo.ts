// Next.js API route to proxy TikTok video publish request
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
  const { access_token, business_id, video_url, custom_thumbnail_url, post_info } = req.body

  // 验证必需参数
  if (!access_token || !business_id || !video_url || !post_info) {
    res.status(400).json({ 
      code: -1,
      error: 'Missing required parameters: access_token, business_id, video_url, and post_info are all required' 
    })
    return
  }

  try {
    // 构建请求体
    const requestBody: any = {
      business_id: business_id,
      video_url: video_url,
      post_info: post_info
    }

    // 添加可选参数
    if (custom_thumbnail_url) {
      requestBody.custom_thumbnail_url = custom_thumbnail_url
    }

    // 在服务端发起请求
    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/business/video/publish/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': access_token,
      },
      body: JSON.stringify(requestBody)
    })

    // 解析响应数据（无论成功或失败都尝试解析JSON）
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
      res.status(response.ok ? 200 : response.status).json({
        code: data.code || -1,
        error: errorMessage,
        message: errorMessage,
        error_code: data.error_code || data.code
      })
      return
    }
    
    // 返回成功数据
    res.status(200).json(data)
  } catch (error: any) {
    console.error('Proxy request error:', error)
    res.status(500).json({
      code: -1,
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    })
  }
}




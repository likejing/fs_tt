// Next.js API route to get TikTok publish status
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
  // 只允许 GET 请求
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // 获取查询参数
  const { access_token, business_id, publish_id } = req.query

  // 验证必需参数
  if (!access_token || !business_id || !publish_id) {
    res.status(400).json({ 
      code: -1,
      error: 'Missing required parameters: access_token, business_id, and publish_id are all required' 
    })
    return
  }

  try {
    // 构建请求URL
    const apiUrl = `https://business-api.tiktok.com/open_api/v1.3/business/publish/status/?business_id=${encodeURIComponent(business_id as string)}&publish_id=${encodeURIComponent(publish_id as string)}`
    
    console.log(`Getting publish status for publish_id: ${publish_id}`)

    // 在服务端发起请求
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Access-Token': access_token as string,
      },
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
      console.error(`Get publish status failed:`, errorMessage)
      res.status(response.ok ? 200 : response.status).json({
        code: data.code || -1,
        error: errorMessage,
        message: errorMessage,
        error_code: data.error_code || data.code
      })
      return
    }

    console.log(`✅ Publish status retrieved: ${data.data?.status || 'unknown'}`)

    // 返回成功数据
    res.status(200).json(data)
  } catch (error: any) {
    console.error('Get publish status error:', error)
    res.status(500).json({
      code: -1,
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    })
  }
}



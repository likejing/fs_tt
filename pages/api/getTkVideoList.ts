// Next.js API route to proxy TikTok video list request
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
  // 只允许 GET 请求
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // 获取查询参数
  const { access_token, business_id, fields, cursor, max_count } = req.query

  // 验证必需参数
  if (!access_token || !business_id) {
    res.status(400).json({ 
      code: -1,
      error: 'Missing required parameters: access_token and business_id are both required' 
    })
    return
  }

  try {
    // 构建请求URL
    let apiUrl = `https://business-api.tiktok.com/open_api/v1.3/business/video/list/?business_id=${encodeURIComponent(business_id as string)}`
    
    // 添加可选参数
    if (fields) {
      // fields 参数应该是一个 JSON 数组字符串，直接传递
      apiUrl += `&fields=${encodeURIComponent(fields as string)}`
    }
    if (cursor) {
      apiUrl += `&cursor=${encodeURIComponent(cursor as string)}`
    }
    if (max_count) {
      apiUrl += `&max_count=${encodeURIComponent(max_count as string)}`
    }
    
    console.log(`Requesting TikTok video list for business_id: ${business_id}`)

    // 在服务端发起请求
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Access-Token': access_token as string,
      },
    })

    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`TikTok API error: ${response.status} ${response.statusText}`, errorText)
      res.status(response.status).json({
        code: -1,
        error: `Request failed: ${response.status} ${response.statusText}`,
        message: errorText
      })
      return
    }

    // 解析响应数据
    const data = await response.json()
    
    // 检查业务错误码
    if (data.code !== 0) {
      const errorMessage = data.message || data.error_description || data.error || 'Unknown error'
      console.error(`TikTok API business error:`, errorMessage)
      res.status(200).json({
        code: data.code || -1,
        error: errorMessage,
        message: errorMessage
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



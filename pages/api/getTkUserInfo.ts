// Next.js API route to proxy TikTok user info request
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
  const { access_token, open_id } = req.query

  // 验证必需参数
  if (!access_token || !open_id) {
    res.status(400).json({ 
      code: -1,
      error: 'Missing required parameters: access_token and open_id are both required' 
    })
    return
  }

  try {
    // 构建请求URL
    const apiUrl = `https://ltexpress.huokechuangxin.cn/getTkUserInfo?access_token=${encodeURIComponent(access_token as string)}&open_id=${encodeURIComponent(open_id as string)}`
    
    // 在服务端发起请求
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text()
      res.status(response.status).json({
        code: -1,
        error: `Request failed: ${response.status} ${response.statusText}`,
        message: errorText
      })
      return
    }

    // 解析响应数据
    const data = await response.json()
    
    // 返回数据
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





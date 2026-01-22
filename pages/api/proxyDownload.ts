import type { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: {
    responseLimit: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { url } = req.query

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url parameter' })
    return
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000)

    const upstream = await fetch(url, {
      method: 'GET',
      // 模拟常见浏览器 UA，有些 CDN 会检查
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!upstream.ok) {
      res
        .status(upstream.status)
        .json({ error: `Upstream request failed: ${upstream.status} ${upstream.statusText}` })
      return
    }

    // 透传部分头信息
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const contentLength = upstream.headers.get('content-length')

    res.setHeader('Content-Type', contentType)
    if (contentLength) {
      res.setHeader('Content-Length', contentLength)
    }

    // 读取响应体并转发
    const arrayBuffer = await upstream.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    res.send(buffer)
  } catch (error: any) {
    if (error.name === 'AbortError') {
      res.status(504).json({ error: 'Upstream request timeout' })
    } else {
      console.error('proxyDownload error:', error)
      res.status(500).json({ error: error.message || 'Internal server error' })
    }
  }
}











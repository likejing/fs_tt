// Next.js API route to proxy Sora2 video generation requests
import type { NextApiRequest, NextApiResponse } from 'next'

// Disable body parser to allow large payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increase body size limit to 10MB
    },
  },
}

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
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // Get request body
  const { model, messages, stream } = req.body

  // Validate required parameters
  if (!model || !messages) {
    res.status(400).json({
      code: -1,
      error: 'Missing required parameters: model and messages are both required'
    })
    return
  }

  try {
    // Get API key from environment or use default
    const apiKey = process.env.SORA2_API_KEY || 'han1234'
    const apiBaseUrl = process.env.SORA2_API_BASE_URL || 'http://47.253.8.212:8000'
    const apiUrl = `${apiBaseUrl}/v1/chat/completions`

    console.log('Proxying Sora2 API request to:', apiUrl)

    // Make request to Sora2 API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: stream !== undefined ? stream : true
      })
    })

    // Check response status
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Sora2 API error:', response.status, errorText)
      res.status(response.status).json({
        code: -1,
        error: `Request failed: ${response.status} ${response.statusText}`,
        message: errorText
      })
      return
    }

    // If stream is requested, pipe the stream
    if (stream !== false && response.body) {
      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      // Pipe the response stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            break
          }

          // Decode and forward the chunk
          const chunk = decoder.decode(value, { stream: true })
          res.write(chunk)
        }
      } finally {
        reader.releaseLock()
        res.end()
      }
    } else {
      // Non-streaming response
      const data = await response.json()
      res.status(200).json(data)
    }
  } catch (error: any) {
    console.error('Proxy request error:', error)
    res.status(500).json({
      code: -1,
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    })
  }
}


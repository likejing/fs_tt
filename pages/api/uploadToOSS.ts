// Next.js API route to upload file to Aliyun OSS
import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'

type Data = {
  code?: number
  message?: string
  data?: {
    url: string
    key: string
  }
  error?: string
}

// 生成OSS签名（适用于PUT请求）
function generateOSSSignature(
  method: string,
  contentType: string,
  date: string,
  bucket: string,
  objectKey: string,
  accessKeySecret: string
): string {
  // OSS签名字符串格式：Method\nContent-MD5\nContent-Type\nDate\nCanonicalizedOSSHeaders\nCanonicalizedResource
  // 对于PUT请求，简化为：PUT\n\nContent-Type\nDate\n/Bucket/ObjectKey
  const stringToSign = `${method}\n\n${contentType}\n${date}\n/${bucket}/${objectKey}`
  const signature = crypto
    .createHmac('sha1', accessKeySecret)
    .update(stringToSign)
    .digest('base64')
  return signature
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
  const { fileUrl, fileName, folder } = req.body

  // 验证必需参数
  if (!fileUrl) {
    res.status(400).json({ 
      code: -1,
      error: 'Missing required parameter: fileUrl' 
    })
    return
  }

  try {
    // 从环境变量获取OSS配置
    const ossConfig = {
      region: process.env.OSS_REGION || '',
      accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
      bucket: process.env.OSS_BUCKET_NAME || process.env.OSS_BUCKET || '', // 支持两种命名方式
      endpoint: process.env.OSS_ENDPOINT || '',
      customDomain: process.env.OSS_CUSTOM_DOMAIN || '', // 自定义域名（可选）
    }

    // 验证配置
    if (!ossConfig.region || !ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.bucket) {
      res.status(500).json({
        code: -1,
        error: 'OSS configuration is missing. Please set OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, and OSS_BUCKET_NAME (or OSS_BUCKET) environment variables'
      })
      return
    }

    // 1. 从临时下载链接下载文件
    console.log(`Downloading file from: ${fileUrl}`)
    const fileResponse = await fetch(fileUrl)
    if (!fileResponse.ok) {
      res.status(400).json({
        code: -1,
        error: `Failed to download file from ${fileUrl}: ${fileResponse.status} ${fileResponse.statusText}`
      })
      return
    }

    const fileBuffer = await fileResponse.arrayBuffer()
    const buffer = Buffer.from(fileBuffer)
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream'

    console.log(`File downloaded: ${buffer.length} bytes, type: ${contentType}`)

    // 2. 生成OSS对象键（文件路径）
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 15)
    const fileExtension = fileName ? fileName.split('.').pop() : 'mp4'
    const objectKey = folder 
      ? `${folder}/${timestamp}_${randomStr}.${fileExtension}`
      : `tiktok-videos/${timestamp}_${randomStr}.${fileExtension}`

    // 3. 构建OSS上传URL
    // 如果提供了endpoint，直接使用；否则根据region构建
    let ossHost: string
    if (ossConfig.endpoint) {
      // endpoint格式可能是：oss-cn-qingdao.aliyuncs.com 或 oss-cn-qingdao
      if (ossConfig.endpoint.startsWith('oss-')) {
        ossHost = `${ossConfig.bucket}.${ossConfig.endpoint}`
      } else {
        ossHost = `${ossConfig.bucket}.${ossConfig.endpoint}`
      }
    } else {
      // 根据region构建，region格式可能是：cn-qingdao 或 oss-cn-qingdao
      const regionPart = ossConfig.region.startsWith('oss-') 
        ? ossConfig.region 
        : `oss-${ossConfig.region}`
      ossHost = `${ossConfig.bucket}.${regionPart}.aliyuncs.com`
    }
    const ossUrl = `https://${ossHost}/${objectKey}`

    // 4. 生成签名并上传
    const date = new Date().toUTCString()
    const signature = generateOSSSignature('PUT', contentType, date, ossConfig.bucket, objectKey, ossConfig.accessKeySecret)
    const authorization = `OSS ${ossConfig.accessKeyId}:${signature}`

    console.log(`Uploading to OSS: ${ossUrl}`)

    const uploadResponse = await fetch(ossUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Date': date,
        'Authorization': authorization,
      },
      body: buffer
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error(`OSS upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`, errorText)
      res.status(500).json({
        code: -1,
        error: `Failed to upload to OSS: ${uploadResponse.status} ${uploadResponse.statusText}`,
        message: errorText
      })
      return
    }

    console.log(`✅ File uploaded successfully to OSS: ${ossUrl}`)

    // 如果配置了自定义域名，替换URL
    let finalUrl = ossUrl
    if (ossConfig.customDomain) {
      const ossBaseUrl = `https://${ossHost}/`
      const customDomain = ossConfig.customDomain.startsWith('http') 
        ? ossConfig.customDomain 
        : `https://${ossConfig.customDomain}`
      finalUrl = ossUrl.replace(ossBaseUrl, `${customDomain}/`)
      console.log(`✅ URL已替换为自定义域名: ${finalUrl}`)
    }

    // 返回OSS文件URL
    res.status(200).json({
      code: 0,
      message: 'Upload successful',
      data: {
        url: finalUrl,
        key: objectKey,
        ...(ossConfig.customDomain && { originalUrl: ossUrl }) // 如果使用了自定义域名，保留原始URL用于调试
      }
    })
  } catch (error: any) {
    console.error('OSS upload error:', error)
    res.status(500).json({
      code: -1,
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    })
  }
}


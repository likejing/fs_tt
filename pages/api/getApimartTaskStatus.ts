import type { NextApiRequest, NextApiResponse } from 'next';

type ApiResponse = {
  code?: number;
  data?: any;
  error?: string;
  message?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.APIMART_API_KEY;
  if (!apiKey) {
    res.status(500).json({ code: -1, error: 'APIMART_API_KEY is not configured' });
    return;
  }

  const { task_id, language = 'zh' } = req.query;

  if (!task_id || typeof task_id !== 'string') {
    res.status(400).json({ code: -1, error: 'Missing or invalid task_id' });
    return;
  }

  const url = `https://api.apimart.ai/v1/tasks/${encodeURIComponent(task_id)}?language=${encodeURIComponent(
    String(language || 'zh')
  )}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage =
        data?.error?.message ||
        data?.message ||
        `Request failed: ${response.status} ${response.statusText}`;
      res.status(response.status).json({ code: data?.code || response.status, error: errorMessage, data });
      return;
    }

    res.status(200).json({ code: 0, data: data?.data || data });
  } catch (error: any) {
    res.status(500).json({
      code: -1,
      error: 'Internal server error',
      message: error?.message || 'Unknown error',
    });
  }
}














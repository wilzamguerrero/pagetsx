import type { VercelRequest, VercelResponse } from '@vercel/node';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const NOTION_KEY = process.env.NOTION_PORTFOLIO_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Manejar preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, method = 'GET' } = req.query;
  
  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Missing endpoint parameter' });
  }

  try {
    const notionUrl = `${NOTION_API_BASE}${endpoint}`;
    
    const fetchOptions: RequestInit = {
      method: method as string,
      headers: {
        'Authorization': `Bearer ${NOTION_KEY}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
    };

    // Para POST/PATCH, pasar el body
    if ((method === 'POST' || method === 'PATCH') && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(notionUrl, fetchOptions);
    const data = await response.json();

    // No cachear - siempre datos frescos
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    
    return res.status(response.status).json(data);
  } catch (error: any) {
    console.error('[Notion API Error]', error);
    return res.status(500).json({ error: error.message });
  }
}
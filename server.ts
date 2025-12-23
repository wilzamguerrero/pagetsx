// Servidor proxy local para desarrollo - ejecutar con: bun run server.ts
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const NOTION_KEY = Bun.env.NOTION_PORTFOLIO_KEY || '';

const server = Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    };

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // Solo manejar /api/notion
    if (!url.pathname.startsWith('/api/notion')) {
      return new Response('Not Found', { status: 404 });
    }

    const endpoint = url.searchParams.get('endpoint');
    const method = url.searchParams.get('method') || 'GET';

    if (!endpoint) {
      return Response.json({ error: 'Missing endpoint' }, { status: 400, headers: corsHeaders });
    }

    try {
      const notionUrl = `${NOTION_API_BASE}${endpoint}`;
      console.log(`[Proxy] ${method} ${endpoint}`);

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${NOTION_KEY}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
      };

      // Para POST/PATCH, leer el body
      if ((method === 'POST' || method === 'PATCH') && req.body) {
        const body = await req.json();
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(notionUrl, fetchOptions);
      const data = await response.json();

      if (!response.ok) {
        console.error(`[Proxy Error] ${response.status}:`, data);
      } else {
        console.log(`[Proxy] ✓ Success`);
      }

      return Response.json(data, { 
        status: response.status, 
        headers: corsHeaders 
      });
    } catch (error: any) {
      console.error('[Proxy Error]', error.message);
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
  },
});

console.log(`🚀 Notion Proxy running at http://localhost:${server.port}`);

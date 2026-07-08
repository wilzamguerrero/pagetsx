import { getSecret, type Env } from "../_shared/notion";

const NOTION_API_BASE = "https://api.notion.com/v1";
// Kept at the stable version used by the content-reading logic (blocks/databases).
const PROXY_NOTION_VERSION = "2022-06-28";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 200, headers: CORS });
};

/**
 * Notion JSON proxy. Mirrors the previous Vercel handler:
 *   /api/notion?endpoint=/blocks/<id>/children&method=GET
 * The Notion integration secret stays server-side.
 */
const handler: PagesFunction<Env> = async (context) => {
  const notionKey = getSecret(context.env);
  const url = new URL(context.request.url);
  const endpoint = url.searchParams.get("endpoint");
  const method = (url.searchParams.get("method") || "GET").toUpperCase();

  if (!endpoint) {
    return new Response(JSON.stringify({ error: "Missing endpoint parameter" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${notionKey}`,
        "Notion-Version": PROXY_NOTION_VERSION,
        "Content-Type": "application/json",
      },
    };

    if ((method === "POST" || method === "PATCH") && context.request.body) {
      const bodyText = await context.request.text();
      if (bodyText) fetchOptions.body = bodyText;
    }

    const response = await fetch(`${NOTION_API_BASE}${endpoint}`, fetchOptions);
    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
};

export const onRequestGet = handler;
export const onRequestPost = handler;
export const onRequestPatch = handler;

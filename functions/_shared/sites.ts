// ─────────────────────────────────────────────────────────────────────────
//  RESOLUCIÓN DE PÁGINAS DESDE VARIABLES DE ENTORNO (solo servidor)
// ─────────────────────────────────────────────────────────────────────────
// Cada "página"/portfolio se define con dos variables de entorno:
//
//   Página 1 (por defecto):
//     ROOT_PAGE_ID1          = <id de la página raíz de Notion>
//     NOTION_SECRET1         = <secreto de la integración de Notion>
//     (respaldo compatible: ROOT_PAGE_ID / NOTION_PORTFOLIO_KEY sin sufijo)
//
//   Página 2:
//     ROOT_PAGE_ID2          = ...
//     NOTION_SECRET2         = ...
//
//   Página 3:
//     ROOT_PAGE_ID3          = ...
//     NOTION_SECRET3         = ...
//
//   ... y así sucesivamente.
//
// Para AÑADIR OTRA PÁGINA solo agregas otro par ROOT_PAGE_IDn / NOTION_SECRETn.
//
// La página activa se elige con el parámetro `?site=N` de la petición
// (por defecto N = 1). Los secretos NUNCA se envían al frontend.

import type { Env } from "./notion";

export interface ResolvedSite {
  index: number;
  secret: string;
  rootPageId: string;
}

// Nº máximo de páginas que se buscan en las variables de entorno.
const MAX_SITES = 20;

/** Normaliza un ID de Notion a 32 hex sin guiones. */
function cleanId(id: string): string {
  const m = (id || "").replace(/-/g, "").match(/[a-f0-9]{32}/i);
  return m ? m[0] : id || "";
}

function pick(env: Env, ...keys: string[]): string {
  const e = env as Record<string, unknown>;
  for (const k of keys) {
    const v = e[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Lee el par (rootPageId, secret) para una página concreta (1-based). */
function readSite(env: Env, index: number): { secret: string; rootPageId: string } {
  if (index <= 1) {
    // Nombres homogéneos con sufijo "1" y, como respaldo, los antiguos sin sufijo.
    return {
      secret: pick(
        env,
        "NOTION_SECRET1",
        "NOTION_PORTFOLIO_KEY1",
        "NOTION_PORTFOLIO_KEY",
        "NOTION_SECRET"
      ),
      rootPageId: cleanId(
        pick(env, "ROOT_PAGE_ID1", "VITE_ROOT_PAGE_ID1", "ROOT_PAGE_ID", "VITE_ROOT_PAGE_ID")
      ),
    };
  }
  return {
    secret: pick(env, `NOTION_SECRET${index}`, `NOTION_PORTFOLIO_KEY${index}`),
    rootPageId: cleanId(pick(env, `ROOT_PAGE_ID${index}`, `VITE_ROOT_PAGE_ID${index}`)),
  };
}

/** Devuelve todas las páginas configuradas (con su rootPageId). Sin secretos. */
export function listConfiguredSites(env: Env): Array<{ index: number; rootPageId: string }> {
  const sites: Array<{ index: number; rootPageId: string }> = [];
  for (let i = 1; i <= MAX_SITES; i++) {
    const { rootPageId } = readSite(env, i);
    if (rootPageId) sites.push({ index: i, rootPageId });
  }
  return sites;
}

/** Lee el índice de página del parámetro `?site=N` de la URL (por defecto 1). */
export function readSiteIndex(request: Request): number {
  try {
    const n = parseInt(new URL(request.url).searchParams.get("site") || "1", 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  } catch {
    return 1;
  }
}

/**
 * Resuelve la página activa a partir del parámetro `?site=N`.
 * Si esa página no tiene secreto configurado, cae de respaldo a la página 1.
 */
export function resolveSite(request: Request, env: Env): ResolvedSite {
  const index = readSiteIndex(request);
  const site = readSite(env, index);
  if (site.secret || site.rootPageId) {
    return { index, secret: site.secret, rootPageId: site.rootPageId };
  }
  const fallback = readSite(env, 1);
  return { index: 1, secret: fallback.secret, rootPageId: fallback.rootPageId };
}

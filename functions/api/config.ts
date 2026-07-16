import { type Env } from "../_shared/notion";
import { resolveSite, listConfiguredSites } from "../_shared/sites";

/**
 * GET /api/config?site=N
 * Devuelve al cliente la configuración pública necesaria: el ID de la página
 * raíz de la página activa (según `?site=N`, por defecto 1) y la lista de
 * páginas configuradas. El secreto de Notion NUNCA se envía al frontend.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const site = resolveSite(context.request, context.env);

  return new Response(
    JSON.stringify({
      site: site.index,
      rootPageId: site.rootPageId,
      hasKey: !!site.secret,
      sites: listConfiguredSites(context.env),
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
};

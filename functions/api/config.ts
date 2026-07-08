import { getSecret, type Env } from "../_shared/notion";

/**
 * GET /api/config
 * Devuelve al cliente la configuración pública necesaria (el ID de la página
 * raíz), tomada de las variables de entorno de runtime. Así no hace falta
 * incrustar nada en el bundle en tiempo de build.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env as Record<string, string | undefined>;
  const rootPageId = env.ROOT_PAGE_ID || env.VITE_ROOT_PAGE_ID || "";

  return new Response(
    JSON.stringify({
      rootPageId,
      hasKey: !!getSecret(context.env),
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
};

import { json, getSecret, type Env, NOTION_VERSION, NOTION_BASE } from "../_shared/notion";

/**
 * POST /api/upload-complete
 * Completes a multi-part file upload on Notion.
 * Body: { uploadId: string }
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const notionSecret = getSecret(context.env);
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  let body: { uploadId?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido." }, 400);
  }

  const { uploadId } = body || {};
  if (!uploadId) {
    return json({ error: "Se requiere uploadId." }, 400);
  }

  const completeUrl = `${NOTION_BASE}/file_uploads/${uploadId}/complete`;

  try {
    const completeRes = await fetch(completeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
    });

    if (!completeRes.ok) {
      const errText = await completeRes.text();
      throw new Error(`Notion rechazó el complete: ${completeRes.status} - ${errText}`);
    }

    const result = (await completeRes.json()) as any;
    return json({
      success: true,
      id: uploadId,
      status: result.status,
      finalName: result.filename,
    });
  } catch (err: any) {
    return json(
      { error: `Error al completar upload: ${err.message || "Error desconocido"}` },
      500
    );
  }
};

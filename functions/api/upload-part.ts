import { json, getSecret, type Env, NOTION_VERSION, NOTION_BASE } from "../_shared/notion";

/**
 * POST /api/upload-part?upload_id=<id>
 * Streams a single multipart/form-data chunk straight through to Notion's
 * file_uploads "send" endpoint. The raw request body is piped unchanged (only the
 * auth headers are added), so this stays cheap regardless of chunk size.
 * The browser sends a body Notion understands directly (file + part_number).
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const notionSecret = getSecret(context.env);
  if (!notionSecret) {
    return json({ error: "Notion no está configurado." }, 400);
  }

  const url = new URL(context.request.url);
  const uploadId = url.searchParams.get("upload_id");
  if (!uploadId) {
    return json({ error: "Se requiere upload_id." }, 400);
  }

  const contentType = context.request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json({ error: "Content-Type debe ser multipart/form-data." }, 400);
  }

  const sendUrl = `${NOTION_BASE}/file_uploads/${uploadId}/send`;

  try {
    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionSecret}`,
        "Notion-Version": NOTION_VERSION,
        // Preserve the original multipart boundary so Notion can parse the parts.
        "Content-Type": contentType,
      },
      body: context.request.body,
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      // Surface transient Notion errors as 503 so the browser retries that part.
      const transient = [429, 500, 502, 503, 504, 529].includes(sendRes.status);
      return json(
        { error: `Notion rechazó el chunk: ${sendRes.status} - ${errText}` },
        transient ? 503 : 502
      );
    }

    const result = (await sendRes.json()) as any;
    return json({ success: true, status: result.status });
  } catch (err: any) {
    return json(
      { error: `Error al enviar chunk: ${err.message || "Error desconocido"}` },
      503
    );
  }
};

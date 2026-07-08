# pagetsx

Galería de portfolio conectada a Notion, con subida de archivos a Notion integrada
(incluso archivos pesados, hasta 5 GB) mediante Cloudflare Pages Functions.

## Requisitos

- Node.js 18+ y npm
- Una integración de Notion (secret) con acceso a la página raíz del portfolio

## Variables de entorno

| Variable | Dónde | Descripción |
| --- | --- | --- |
| `VITE_ROOT_PAGE_ID` | Build (cliente) | ID de la página raíz de Notion |
| `NOTION_PORTFOLIO_KEY` | Runtime (funciones) | Secret de la integración de Notion (server-side) |

> El secret de Notion **solo** se usa en el servidor (las Pages Functions). No hace
> falta exponerlo al cliente.

Para desarrollo local, copia `.dev.vars.example` a `.dev.vars` y coloca ahí
`NOTION_PORTFOLIO_KEY`.

## Desarrollo local

Se usan dos procesos: Vite para el frontend y `wrangler pages dev` para las
funciones `/api/*`. Vite reenvía las llamadas `/api` a wrangler (puerto 8788).

```bash
npm install
npm run build          # genera dist/ (necesario la primera vez para wrangler)
npm run functions      # terminal 1 -> Cloudflare Pages Functions en :8788
npm run dev            # terminal 2 -> Vite (frontend) con proxy /api -> :8788
```

## Despliegue en Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Variables de entorno: `VITE_ROOT_PAGE_ID` (build) y `NOTION_PORTFOLIO_KEY` (runtime/secret)

O bien desde la CLI:

```bash
npm run deploy
```

## Subir archivos a Notion

En el panel lateral, el botón **Subir** (atajo `C`) activa el "modo subida":

- Cada lista (toggle) muestra un botón `+` para crear sub-listas y un botón de
  subida para adjuntar archivos dentro de ella.
- El botón `+` junto a "Tableros" crea listas nuevas en la raíz.
- Los archivos se suben a Notion (single-part ≤ 20 MB, multi-part por trozos para
  archivos grandes) y se adjuntan como bloques dentro de la lista elegida.

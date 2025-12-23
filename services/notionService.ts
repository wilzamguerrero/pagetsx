import { NotionBlock, Board, MediaItem, NotionToggleBlock, NotionPageBlock, NotionDatabaseBlock, NotionProperty } from '../types';

// Detectar entorno
const IS_BROWSER = typeof window !== 'undefined';
const IS_LOCALHOST = IS_BROWSER && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// En localhost usar nuestro proxy local, en producción usar la API de Vercel
const API_BASE = IS_LOCALHOST ? 'http://localhost:3001/api/notion' : '/api/notion';
const NOTION_VERSION = '2022-06-28';

// Variables de entorno (VITE_ prefix para el frontend)
export const ROOT_PAGE_ID = import.meta.env.VITE_ROOT_PAGE_ID || '';
export const NOTION_PORTFOLIO_KEY = import.meta.env.VITE_NOTION_PORTFOLIO_KEY || '';

// Controla si se muestran logs en consola
export const SHOW_LOGS = false;

export class NotionService {
  private apiKey: string;
  private cache: Map<string, { data: any, timestamp: number }> = new Map();
  private CACHE_TTL = 5000; // 5 segundos - muy corto para actualizaciones rápidas

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  clearCache(): void {
    this.cache.clear();
    if (SHOW_LOGS) console.log('[NotionService] Cache cleared');
  }

  invalidateBlock(blockId: string): void {
    const cleanId = NotionService.formatUUID(blockId);
    this.cache.delete(cleanId);
    this.cache.delete(`db_${cleanId}`);
    for (const key of this.cache.keys()) {
      if (key.includes(cleanId)) {
        this.cache.delete(key);
      }
    }
    if (SHOW_LOGS) console.log(`[NotionService] Invalidated ${cleanId}`);
  }

  static formatUUID(idOrUrl: string): string {
    if (!idOrUrl) return '';
    const clean = idOrUrl.replace(/-/g, '');
    const match = clean.match(/[a-fA-F0-9]{32}/);
    return match ? match[0] : idOrUrl;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };
  }

  // Método unificado para hacer requests - SIEMPRE usa nuestro proxy
  private async notionFetch(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const timestamp = Date.now();
    
    // Construir URL con parámetros
    const url = `${API_BASE}?endpoint=${encodeURIComponent(endpoint)}&method=${method}&_t=${timestamp}`;
    
    if (SHOW_LOGS) console.log(`[NotionService] Fetching: ${method} ${endpoint}`);
    
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
    
    if (!response.ok) {
      throw new Error(`Notion API error (${response.status})`);
    }
    
    return response.json();
  }

  async getBlockChildren(blockId: string, forceRefresh: boolean = false): Promise<NotionBlock[]> {
    const cleanId = NotionService.formatUUID(blockId);
    
    if (!forceRefresh) {
      const cached = this.cache.get(cleanId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        if (SHOW_LOGS) console.log(`[NotionService] Cache HIT for ${cleanId}`);
        return cached.data;
      }
    } else {
      this.cache.delete(cleanId);
    }

    if (SHOW_LOGS) console.log(`[NotionService] Fetching blocks for ${cleanId}`);

    let allResults: NotionBlock[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore) {
      let endpoint = `/blocks/${cleanId}/children?page_size=100`;
      if (startCursor) endpoint += `&start_cursor=${startCursor}`;
      
      const data = await this.notionFetch(endpoint, 'GET');
      
      if (SHOW_LOGS) console.log(`[NotionService] Got ${data.results?.length || 0} blocks`);
      allResults = [...allResults, ...data.results];
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }

    this.cache.set(cleanId, { data: allResults, timestamp: Date.now() });
    return allResults;
  }

  async queryDatabase(databaseId: string, forceRefresh: boolean = false): Promise<Board[]> {
    const cleanId = NotionService.formatUUID(databaseId);
    const cacheKey = `db_${cleanId}`;
    
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        if (SHOW_LOGS) console.log(`[NotionService] Cache HIT for database ${cleanId}`);
        return cached.data;
      }
    } else {
      this.cache.delete(cacheKey);
    }

    if (SHOW_LOGS) console.log(`[NotionService] Querying database ${cleanId}`);
    
    const data = await this.notionFetch(`/databases/${cleanId}/query`, 'POST', { page_size: 100 });

    const results = data.results.map((page: any) => {
      let title = 'Sin título';
      const titleProp = Object.values(page.properties).find((p: any) => p.type === 'title') as any;
      if (titleProp && titleProp.title.length > 0) {
        title = titleProp.title.map((t: any) => t.plain_text).join('');
      }

      // Extraer icono de la página
      let icon: string | undefined = undefined;
      if (page.icon) {
        if (page.icon.type === 'emoji') {
          icon = page.icon.emoji;
        } else if (page.icon.type === 'external') {
          icon = page.icon.external?.url;
        } else if (page.icon.type === 'file') {
          icon = page.icon.file?.url;
        }
      }

      // Extraer número para ordenar (buscar propiedad tipo number)
      let orderNumber: number | null = null;
      const numberProp = Object.values(page.properties).find((p: any) => p.type === 'number') as any;
      if (numberProp && numberProp.number !== null) {
        orderNumber = numberProp.number;
      }

      // Extraer propiedades (excluyendo el título)
      const properties: NotionProperty[] = [];
      
      // Agregar created_time y last_edited_time del sistema
      if (page.created_time) {
        properties.push({ name: 'Creado', type: 'created_time', value: page.created_time });
      }
      if (page.last_edited_time) {
        properties.push({ name: 'Editado', type: 'last_edited_time', value: page.last_edited_time });
      }
      
      for (const [name, prop] of Object.entries(page.properties) as [string, any][]) {
        if (prop.type === 'title') continue; // Saltar el título
        
        const parsedProp = this.parseProperty(name, prop);
        if (parsedProp) {
          properties.push(parsedProp);
        }
      }

      return {
        id: page.id,
        title: title,
        parentId: databaseId,
        type: 'page' as const,
        hasChildren: true,
        isLoaded: false,
        properties: properties.length > 0 ? properties : undefined,
        icon: icon,
        _orderNumber: orderNumber // Para ordenar
      };
    });

    // Ordenar por número de mayor a menor (descendente)
    results.sort((a: any, b: any) => {
      const numA = a._orderNumber ?? -Infinity;
      const numB = b._orderNumber ?? -Infinity;
      return numB - numA; // Descendente: del mayor al menor
    });

    this.cache.set(cacheKey, { data: results, timestamp: Date.now() });
    return results;
  }

  // Parsear propiedades de Notion
  private parseProperty(name: string, prop: any): NotionProperty | null {
    const type = prop.type;
    let value: any = null;
    let color: string | undefined;

    switch (type) {
      case 'date':
        if (prop.date) {
          value = prop.date.start;
          if (prop.date.end) value += ` → ${prop.date.end}`;
        }
        break;
      case 'multi_select':
        if (prop.multi_select?.length > 0) {
          value = prop.multi_select.map((s: any) => ({ name: s.name, color: s.color }));
        }
        break;
      case 'select':
        if (prop.select) {
          value = prop.select.name;
          color = prop.select.color;
        }
        break;
      case 'number':
        value = prop.number;
        break;
      case 'checkbox':
        value = prop.checkbox;
        break;
      case 'status':
        if (prop.status) {
          value = prop.status.name;
          color = prop.status.color;
        }
        break;
      case 'url':
        value = prop.url;
        break;
      case 'email':
        value = prop.email;
        break;
      case 'phone_number':
        value = prop.phone_number;
        break;
      case 'rich_text':
        if (prop.rich_text?.length > 0) {
          value = prop.rich_text.map((t: any) => t.plain_text).join('');
        }
        break;
      case 'people':
        if (prop.people?.length > 0) {
          value = prop.people.map((p: any) => p.name || p.id).join(', ');
        }
        break;
      default:
        return null;
    }

    if (value === null || value === undefined || value === '') return null;

    return { name, type, value, color };
  }

  async getDeepBlockChildren(blocks: NotionBlock[], forceRefresh: boolean = false): Promise<NotionBlock[]> {
    const expandedBlocks = [...blocks];
    const columnLists = blocks.filter(b => b.type === 'column_list');
    
    if (columnLists.length > 0) {
      const columns = await Promise.all(columnLists.map(cl => this.getBlockChildren(cl.id, forceRefresh)));
      const flatColumns = columns.flat();
      const columnContent = await Promise.all(flatColumns.map(col => this.getBlockChildren(col.id, forceRefresh)));
      expandedBlocks.push(...flatColumns, ...columnContent.flat());
    }
    return expandedBlocks;
  }

  extractBoards(blocks: NotionBlock[], parentId?: string): Board[] {
    return blocks
      .filter((block): block is NotionToggleBlock | NotionPageBlock | NotionDatabaseBlock => 
        block.type === 'toggle' || block.type === 'child_page' || block.type === 'child_database'
      )
      .map(block => {
        let title = 'Sin título';
        let type: 'toggle' | 'page' | 'database' = 'toggle';

        if (block.type === 'toggle') {
          title = block.toggle?.rich_text?.map((t: any) => t.plain_text).join('') || 'Sin título';
          type = 'toggle';
        } else if (block.type === 'child_page') {
          title = block.child_page?.title || 'Sin título';
          type = 'page';
        } else if (block.type === 'child_database') {
          title = block.child_database?.title || 'Sin título';
          type = 'database';
        }
        
        return {
          id: block.id,
          title: title,
          parentId: parentId,
          type: type,
          hasChildren: block.has_children || type === 'database',
          isLoaded: false,
          icon: undefined as string | undefined // Se cargará después
        };
      });
  }

  // Obtener información de una página (incluyendo icono)
  async getPageInfo(pageId: string): Promise<{ icon?: string }> {
    const cleanId = NotionService.formatUUID(pageId);
    try {
      const data = await this.notionFetch(`/pages/${cleanId}`, 'GET');
      let icon: string | undefined = undefined;
      if (data.icon) {
        if (data.icon.type === 'emoji') {
          icon = data.icon.emoji;
        } else if (data.icon.type === 'external') {
          icon = data.icon.external?.url;
        } else if (data.icon.type === 'file') {
          icon = data.icon.file?.url;
        }
      }
      return { icon };
    } catch (e) {
      return {};
    }
  }

  // Enriquecer boards con iconos
  async enrichBoardsWithIcons(boards: Board[]): Promise<Board[]> {
    const pagesAndDatabases = boards.filter(b => b.type === 'page' || b.type === 'database');
    
    // Obtener iconos en paralelo (máximo 5 a la vez para no sobrecargar)
    const batchSize = 5;
    for (let i = 0; i < pagesAndDatabases.length; i += batchSize) {
      const batch = pagesAndDatabases.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(b => this.getPageInfo(b.id)));
      batch.forEach((board, idx) => {
        if (results[idx].icon) {
          board.icon = results[idx].icon;
        }
      });
    }
    
    return boards;
  }

  extractMedia(blocks: NotionBlock[], parentId: string): MediaItem[] {
    const seenIds = new Set<string>();
    if (SHOW_LOGS) console.log(`[NotionService] Extracting media from ${blocks.length} blocks`);
    
    const media = blocks.map((block): MediaItem | null => {
      if (seenIds.has(block.id)) return null;
      
      let type: MediaItem['type'] | null = null;
      let url = '';
      let caption = '';
      let content = '';
      let metadata: any = {};

      if (block.type === 'image') {
        type = 'image';
        url = block.image?.file?.url || block.image?.external?.url || '';
        caption = block.image?.caption?.map((t: any) => t.plain_text).join('') || '';
      } else if (block.type === 'video') {
        const videoUrl = block.video?.file?.url || block.video?.external?.url || '';
        // Detectar si es un video de YouTube
        if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
          type = 'youtube';
          url = videoUrl;
          caption = block.video?.caption?.map((t: any) => t.plain_text).join('') || '';
          // Extraer el ID del video de YouTube
          let videoId = '';
          if (videoUrl.includes('youtu.be/')) {
            videoId = videoUrl.split('youtu.be/')[1]?.split('?')[0] || '';
          } else if (videoUrl.includes('youtube.com/watch')) {
            const urlParams = new URLSearchParams(videoUrl.split('?')[1]);
            videoId = urlParams.get('v') || '';
          } else if (videoUrl.includes('youtube.com/embed/')) {
            videoId = videoUrl.split('youtube.com/embed/')[1]?.split('?')[0] || '';
          }
          metadata = { videoId };
        } else if (videoUrl.includes('loom.com')) {
          // Detectar si es un video de Loom
          type = 'loom';
          url = videoUrl;
          caption = block.video?.caption?.map((t: any) => t.plain_text).join('') || '';
          let videoId = '';
          if (videoUrl.includes('/share/')) {
            videoId = videoUrl.split('/share/')[1]?.split('?')[0] || '';
          } else if (videoUrl.includes('/embed/')) {
            videoId = videoUrl.split('/embed/')[1]?.split('?')[0] || '';
          }
          metadata = { videoId };
        } else {
          type = 'video';
          url = videoUrl;
          caption = block.video?.caption?.map((t: any) => t.plain_text).join('') || '';
        }
      } else if (block.type === 'file') {
        type = 'file';
        url = block.file?.file?.url || block.file?.external?.url || '';
        const rawCaption = block.file?.caption?.map((t: any) => t.plain_text).join('') || '';
        const fileNameFromUrl = url.split('/').pop()?.split('?')[0] || 'Archivo';
        metadata = { fileName: rawCaption || fileNameFromUrl };
      } else if (block.type === 'paragraph') {
        content = block.paragraph?.rich_text?.map((t: any) => t.plain_text).join('') || '';
        // Incluir párrafos vacíos como separadores (doble espacio en Notion)
        type = 'text';
      } else if (block.type.startsWith('heading_')) {
        const level = parseInt(block.type.split('_')[1]);
        content = block[block.type]?.rich_text?.map((t: any) => t.plain_text).join('') || '';
        if (content.trim()) {
          type = 'heading';
          metadata = { level };
        }
      } else if (block.type === 'code') {
        content = block.code?.rich_text?.map((t: any) => t.plain_text).join('') || '';
        if (content.trim()) {
          type = 'code';
          metadata = { language: block.code?.language };
        }
      } else if (block.type === 'bookmark') {
        type = 'link';
        url = block.bookmark?.url || '';
        caption = block.bookmark?.caption?.map((t: any) => t.plain_text).join('') || '';
        content = url;
      } else if (block.type === 'embed') {
        const embedUrl = block.embed?.url || '';
        // Detectar si es un embed de YouTube
        if (embedUrl.includes('youtube.com') || embedUrl.includes('youtu.be')) {
          type = 'youtube';
          url = embedUrl;
          caption = block.embed?.caption?.map((t: any) => t.plain_text).join('') || '';
          // Extraer el ID del video de YouTube
          let videoId = '';
          if (embedUrl.includes('youtu.be/')) {
            videoId = embedUrl.split('youtu.be/')[1]?.split('?')[0] || '';
          } else if (embedUrl.includes('youtube.com/watch')) {
            const urlParams = new URLSearchParams(embedUrl.split('?')[1]);
            videoId = urlParams.get('v') || '';
          } else if (embedUrl.includes('youtube.com/embed/')) {
            videoId = embedUrl.split('youtube.com/embed/')[1]?.split('?')[0] || '';
          }
          metadata = { videoId };
        } else if (embedUrl.includes('loom.com')) {
          // Detectar si es un embed de Loom
          type = 'loom';
          url = embedUrl;
          caption = block.embed?.caption?.map((t: any) => t.plain_text).join('') || '';
          // Extraer el ID del video de Loom (formato: loom.com/share/VIDEO_ID)
          let videoId = '';
          if (embedUrl.includes('/share/')) {
            videoId = embedUrl.split('/share/')[1]?.split('?')[0] || '';
          } else if (embedUrl.includes('/embed/')) {
            videoId = embedUrl.split('/embed/')[1]?.split('?')[0] || '';
          }
          metadata = { videoId };
        } else if (embedUrl.includes('canva.com')) {
          // Detectar si es un embed de Canva
          type = 'canva';
          url = embedUrl;
          caption = block.embed?.caption?.map((t: any) => t.plain_text).join('') || '';
          // Extraer el ID del diseño de Canva (formato: canva.com/design/DESIGN_ID/...)
          let designId = '';
          if (embedUrl.includes('/design/')) {
            designId = embedUrl.split('/design/')[1]?.split('/')[0] || '';
          }
          metadata = { designId, embedUrl };
        }
      } else if (block.type === 'bulleted_list_item') {
        content = block.bulleted_list_item?.rich_text?.map((t: any) => t.plain_text).join('') || '';
        if (content.trim()) type = 'bulleted_list';
      } else if (block.type === 'numbered_list_item') {
        content = block.numbered_list_item?.rich_text?.map((t: any) => t.plain_text).join('') || '';
        if (content.trim()) type = 'numbered_list';
      } else if (block.type === 'to_do') {
        content = block.to_do?.rich_text?.map((t: any) => t.plain_text).join('') || '';
        if (content.trim()) {
          type = 'todo';
          metadata = { checked: block.to_do?.checked || false };
        }
      } else if (block.type === 'quote') {
        content = block.quote?.rich_text?.map((t: any) => t.plain_text).join('') || '';
        if (content.trim()) type = 'quote';
      } else if (block.type === 'callout') {
        content = block.callout?.rich_text?.map((t: any) => t.plain_text).join('') || '';
        if (content.trim()) {
          type = 'callout';
          let icon = '';
          if (block.callout?.icon?.type === 'emoji') {
            icon = block.callout.icon.emoji;
          } else if (block.callout?.icon?.type === 'external') {
            icon = block.callout.icon.external?.url || '';
          }
          metadata = { icon, color: block.callout?.color || 'default' };
        }
      }

      if (type && (url || content || type === 'text')) {
        seenIds.add(block.id);
        return { id: block.id, type, url, caption, content, metadata, parentId };
      }
      return null;
    }).filter((item): item is MediaItem => item !== null);

    if (SHOW_LOGS) console.log(`[NotionService] Extracted ${media.length} media items`);
    return media;
  }

  async createBoard(parentId: string, title: string): Promise<Board> {
    const cleanId = NotionService.formatUUID(parentId);
    const body = {
      children: [{ object: 'block', type: 'toggle', toggle: { rich_text: [{ text: { content: title } }] } }]
    };
    
    const data = await this.notionFetch(`/blocks/${cleanId}/children`, 'PATCH', body);
    
    this.invalidateBlock(parentId);
    return { id: data.results[0].id, title, parentId, type: 'toggle', hasChildren: false, isLoaded: true };
  }
}


export interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: any;
}

// Added missing NotionToggleBlock interface to satisfy services/notionService.ts imports
export interface NotionToggleBlock extends NotionBlock {
  type: 'toggle';
  toggle: {
    rich_text: { plain_text: string }[];
  };
}

// Added missing NotionPageBlock interface to satisfy services/notionService.ts imports
export interface NotionPageBlock extends NotionBlock {
  type: 'child_page';
  child_page: {
    title: string;
  };
}

// Added missing NotionDatabaseBlock interface to satisfy services/notionService.ts imports
export interface NotionDatabaseBlock extends NotionBlock {
  type: 'child_database';
  child_database: {
    title: string;
  };
}

export interface NotionImageBlock extends NotionBlock {
  type: 'image';
  image: {
    type: 'file' | 'external';
    file?: { url: string; expiry_time: string };
    external?: { url: string };
    caption: { plain_text: string }[];
  };
}

export interface Board {
  id: string;
  title: string;
  parentId?: string;
  markerColor?: string;
  type: 'toggle' | 'page' | 'database';
  hasChildren: boolean;
  isLoaded?: boolean;
  properties?: NotionProperty[]; // Propiedades de páginas de DB
  icon?: string; // Emoji o URL del icono de Notion
}

export type MediaItemType = 'image' | 'video' | 'youtube' | 'loom' | 'canva' | 'text' | 'heading' | 'code' | 'link' | 'title' | 'file' | 'properties' | 'bulleted_list' | 'numbered_list' | 'todo' | 'quote' | 'callout';

export interface NotionProperty {
  name: string;
  type: string;
  value: any;
  color?: string;
}

export interface MediaItem {
  id: string;
  url?: string;
  type: MediaItemType;
  caption?: string;
  content?: string;
  metadata?: {
    language?: string;
    level?: number;
    url?: string;
    fileName?: string;
    fileSize?: string;
    // Fix: Added parentTitle to metadata to support hierarchical context in title cards
    parentTitle?: string;
    // Propiedades de Notion para páginas de DB
    properties?: NotionProperty[];
    // YouTube video ID for embedded videos
    videoId?: string;
    // For to-do items
    checked?: boolean;
    // For callouts
    icon?: string;
    color?: string;
    // For numbered lists
    number?: number;
  };
  parentId: string;
}

export type Language = 'es' | 'en';

export interface AppState {
  isAuthenticated: boolean;
  apiKey: string;
  rootPageId: string;
  boards: Board[];
  activeBoardId: string | null;
  media: MediaItem[];
  isLoading: boolean;
  error: string | null;
  isDemoMode: boolean;
  language: Language;
}
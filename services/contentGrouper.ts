import { MediaItem } from '../types';

/**
 * Tipos de contenido que siempre se muestran como card individual
 * (no se agrupan con otros aunque estén juntos)
 */
const STANDALONE_TYPES: MediaItem['type'][] = [
  'image',
  'video',
  'youtube',
  'loom',
  'canva',
  'code',
  'link',
  'file',
  'properties',
  'title'
];

export interface GroupedMediaItem extends MediaItem {
  isGroup?: boolean;
  groupItems?: MediaItem[];
  headings?: MediaItem[];
}

/**
 * Agrupa los items de contenido basándose en espacios vacíos.
 * 
 * Estrategia SIMPLE:
 * - Todo lo que está junto (sin párrafos vacíos) va en el MISMO grupo
 * - Un párrafo vacío (espacio) separa grupos
 * - Imágenes, videos, código, links siempre van solos
 */
export function groupContentForReading(items: MediaItem[]): GroupedMediaItem[] {
  if (items.length === 0) return [];
  
  const result: GroupedMediaItem[] = [];
  let currentGroup: MediaItem[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Detectar separadores vacíos (espacio en Notion)
    if (item.type === 'text' && (!item.content || item.content.trim() === '')) {
      // Párrafo vacío = separador
      if (currentGroup.length > 0) {
        result.push(createGroup(currentGroup));
        currentGroup = [];
      }
      continue;
    }
    
    // Tipos standalone siempre van solos
    if (STANDALONE_TYPES.includes(item.type)) {
      // Finalizar grupo actual primero
      if (currentGroup.length > 0) {
        result.push(createGroup(currentGroup));
        currentGroup = [];
      }
      // Añadir el item standalone
      result.push({ ...item, isGroup: false });
      continue;
    }
    
    // Todo lo demás se agrupa
    currentGroup.push(item);
  }
  
  // Finalizar último grupo
  if (currentGroup.length > 0) {
    result.push(createGroup(currentGroup));
  }
  
  return result;
}

function createGroup(items: MediaItem[]): GroupedMediaItem {
  // Si solo hay un item, devolver como item simple
  if (items.length === 1) {
    return { ...items[0], isGroup: false };
  }
  
  // Crear grupo combinado
  const groupId = items.map(i => i.id).join('-');
  const headings = items.filter(i => i.type === 'heading');
  
  return {
    id: groupId,
    type: 'text',
    content: items[0]?.content || '',
    parentId: items[0]?.parentId || '',
    isGroup: true,
    groupItems: items,
    headings: headings.length > 0 ? headings : undefined,
    metadata: {
      level: headings[0]?.metadata?.level
    }
  };
}

/**
 * Numerar items de listas numeradas dentro de grupos
 */
export function numberListItems(items: MediaItem[]): MediaItem[] {
  let currentNumber = 0;
  let prevWasNumberedList = false;
  
  return items.map(item => {
    const isNumberedList = item.type === 'numbered_list';
    
    if (isNumberedList) {
      currentNumber++;
      prevWasNumberedList = true;
      return {
        ...item,
        metadata: { ...item.metadata, number: currentNumber }
      };
    }
    
    // Resetear contador si encontramos algo que no es lista numerada
    if (prevWasNumberedList) {
      currentNumber = 0;
      prevWasNumberedList = false;
    }
    
    return item;
  });
}

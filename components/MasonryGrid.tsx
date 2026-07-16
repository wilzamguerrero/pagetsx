
import React, { useEffect, useRef, useMemo, useState, useLayoutEffect } from 'react';
import Muuri from 'muuri';
import { MediaItem, Language } from '../types';
import { MediaCard, GroupedCard } from './MediaCard';
import { t } from '../services/i18nService';
import { groupContentForReading, GroupedMediaItem, numberListItems } from '../services/contentGrouper';
import { Menu, Columns3, Maximize, UserRound, Home, Plus, Minus } from 'lucide-react';
import { Mirage } from 'ldrs/react';
import 'ldrs/react/Mirage.css';

// @ts-ignore
import lightGallery from 'lightgallery';
// @ts-ignore
import lgZoom from 'lightgallery/plugins/zoom';
// @ts-ignore
import lgVideo from 'lightgallery/plugins/video';
// @ts-ignore
import lgThumbnail from 'lightgallery/plugins/thumbnail';
// @ts-ignore
import lgAutoplay from 'lightgallery/plugins/autoplay';
// @ts-ignore
import lgFullscreen from 'lightgallery/plugins/fullscreen';
// @ts-ignore
import lgRotate from 'lightgallery/plugins/rotate';

interface MasonryGridProps {
  items: MediaItem[];
  isLoading: boolean;
  columnCount: number;
  scaleResetVersion?: number;
  language: Language;
  onReorder?: (items: MediaItem[]) => void;
  isSidebarOpen?: boolean;
  effectsEnabled?: boolean;
}

export const MasonryGrid: React.FC<MasonryGridProps> = ({ items, isLoading, columnCount, scaleResetVersion = 0, language, onReorder, isSidebarOpen = false, effectsEnabled = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const galleryInstanceRef = useRef<any>(null);
  
  const strings = t(language);
  const [currentPhrase, setCurrentPhrase] = useState(strings.phrases[0]);
  const [isTextVisible, setIsTextVisible] = useState(true);
  const [isPulsing, setIsPulsing] = useState(false);
  
  // Chaotic shuffle state for glitch effect
  const [shuffledOrder, setShuffledOrder] = useState<string[]>([]);
  const [isShuffling, setIsShuffling] = useState(false);
  const shuffleTimeoutRef = useRef<number>();
  const shuffleIntervalRef = useRef<number>();
  
  // Guardar el orden original de Notion (solo se establece una vez por página)
  const originalOrderRef = useRef<Map<string, number>>(new Map());
  const lastParentIdRef = useRef<string | null>(null);

  // Agrupar items para mejor orden de lectura y numerar listas
  const groupedItems = useMemo(() => {
    const numbered = numberListItems(items);
    return groupContentForReading(numbered);
  }, [items]);
  
  // Detectar si es una nueva página (basado en parentId del primer item)
  const currentParentId = items.length > 0 ? items[0].parentId : null;
  
  // Establecer el orden original solo cuando cambia la página (no cuando se reordenan items)
  useEffect(() => {
    if (currentParentId && currentParentId !== lastParentIdRef.current) {
      // Nueva página - guardar el orden original
      const map = new Map<string, number>();
      groupedItems.forEach((groupedItem, idx) => {
        map.set(groupedItem.id, idx + 1);
      });
      originalOrderRef.current = map;
      lastParentIdRef.current = currentParentId;
    }
  }, [currentParentId, groupedItems]);

  // Reset shuffle order when items change (navigating to another page)
  useEffect(() => {
    setShuffledOrder([]);
    setIsShuffling(false);
  }, [items]);

  // Chaotic shuffle effect when sidebar is open AND effects are enabled
  useEffect(() => {
    if (isSidebarOpen && effectsEnabled && items.length > 1) {
      // Start shuffling after 10 seconds
      shuffleTimeoutRef.current = window.setTimeout(() => {
        setIsShuffling(true);
        
        // Shuffle every 2-4 seconds randomly
        const doShuffle = () => {
          // Use current shuffledOrder if exists, otherwise use groupedItems order
          const currentIds = shuffledOrder.length > 0 
            ? [...shuffledOrder] 
            : groupedItems.map(item => item.id);
          
          // Fisher-Yates shuffle
          for (let i = currentIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [currentIds[i], currentIds[j]] = [currentIds[j], currentIds[i]];
          }
          setShuffledOrder(currentIds);
          
          // Schedule next shuffle with random delay
          const nextDelay = 8000 + Math.random() * 2000;
          shuffleIntervalRef.current = window.setTimeout(doShuffle, nextDelay);
        };
        
        doShuffle();
      }, 8000);
    } else {
      // Stop shuffling when sidebar closes or effects disabled, but KEEP the current order
      setIsShuffling(false);
      // Don't reset shuffledOrder - keep the cards where they are!
      if (shuffleTimeoutRef.current) {
        clearTimeout(shuffleTimeoutRef.current);
      }
      if (shuffleIntervalRef.current) {
        clearTimeout(shuffleIntervalRef.current);
      }
    }
    
    return () => {
      if (shuffleTimeoutRef.current) clearTimeout(shuffleTimeoutRef.current);
      if (shuffleIntervalRef.current) clearTimeout(shuffleIntervalRef.current);
    };
  }, [isSidebarOpen, effectsEnabled, items.length]);

  // Get items in shuffled order if we have a shuffle order
  const displayItems = useMemo(() => {
    if (shuffledOrder.length === 0) {
      return groupedItems;
    }
    
    const itemMap = new Map(groupedItems.map(item => [item.id, item]));
    const ordered = shuffledOrder
      .map(id => itemMap.get(id))
      .filter((item): item is GroupedMediaItem => item !== undefined);
    
    // If items changed (new items added), append them at the end
    if (ordered.length < groupedItems.length) {
      const orderedIds = new Set(shuffledOrder);
      const newItems = groupedItems.filter(item => !orderedIds.has(item.id));
      return [...ordered, ...newItems];
    }
    
    return ordered;
  }, [groupedItems, shuffledOrder]);

  useEffect(() => {
    setCurrentPhrase(strings.phrases[Math.floor(Math.random() * strings.phrases.length)]);
  }, [language]);

  useEffect(() => {
    if (items.length === 0 && !isLoading) {
      let timeoutId: number;
      const runCycle = () => {
        setIsTextVisible(true);
        setIsPulsing(false);
        timeoutId = window.setTimeout(() => {
          setIsTextVisible(false);
          timeoutId = window.setTimeout(() => {
            setIsPulsing(true);
            timeoutId = window.setTimeout(() => {
              const randomIndex = Math.floor(Math.random() * strings.phrases.length);
              setCurrentPhrase(strings.phrases[randomIndex]);
              runCycle();
            }, 3000);
          }, 7000);
        }, 5000);
      };
      runCycle();
      return () => clearTimeout(timeoutId);
    }
  }, [items.length, isLoading, language]);

  // Usar el orden original guardado en el ref (no cambia con reordenamientos)
  const orderIndexMap = originalOrderRef.current;

  // ===== Tamaño (span de columnas) por tarjeta, persistente =====
  // Permite hacer una tarjeta (p.ej. un video) más grande; las demás se
  // reacomodan dinámicamente gracias al empaquetado "dense" de CSS grid.
  // Resolución de la cuadrícula: cada columna se divide en 2 "unidades", así una
  // tarjeta puede medir media columna (más pequeña que lo normal), una columna
  // (tamaño por defecto) o varias.
  const UNITS_PER_COL = 2;
  const DEFAULT_SPAN = UNITS_PER_COL;            // tamaño normal = 1 columna
  const totalTracks = columnCount * UNITS_PER_COL;

  const [cardSpans, setCardSpans] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const saved = localStorage.getItem('notio_card_spans_v2');
      if (saved) setCardSpans(JSON.parse(saved));
    } catch { /* noop */ }
  }, []);

  // El botón de reset del sidebar incrementa esta señal. Se borran tanto el
  // estado actual como la persistencia para devolver todas las tarjetas al
  // tamaño normal de una columna, sin recargar la página.
  useEffect(() => {
    if (scaleResetVersion <= 0) return;
    try { localStorage.removeItem('notio_card_spans_v2'); } catch { /* noop */ }
    setCardSpans({});
  }, [scaleResetVersion]);

  const setSpan = (id: string, span: number) => {
    setCardSpans(prev => {
      const next = { ...prev };
      const maxUnits = columnCount * UNITS_PER_COL;
      const clamped = Math.max(1, Math.min(span, maxUnits));
      if (clamped === DEFAULT_SPAN) delete next[id]; else next[id] = clamped;
      try { localStorage.setItem('notio_card_spans_v2', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  // ===== Layout profesional con Muuri =====================================
  // Muuri mide el DOM real y empaqueta las tarjetas sin solapes. `fillGaps`
  // permite aprovechar cualquier hueco disponible cuando conviven tarjetas de
  // distintos tamaños; el movimiento queda animado y nunca altera los datos.
  const GRID_GAP = 20;
  const muuriRef = useRef<Muuri | null>(null);
  const layoutFrameRef = useRef<number>();
  const layoutKey = displayItems.map(item => item.id).join('|');

  const requestLayout = (instant = false) => {
    if (layoutFrameRef.current) cancelAnimationFrame(layoutFrameRef.current);
    layoutFrameRef.current = requestAnimationFrame(() => {
      const grid = muuriRef.current;
      if (!grid) return;
      grid.refreshItems().layout(instant);
    });
  };

  // Crear de nuevo la instancia solo cuando cambia la lista/orden de tarjetas.
  // El nodo exterior lo posiciona Muuri; el contenido interior conserva su drag.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || displayItems.length === 0) return;

    const grid = new Muuri(element, {
      items: '.muuri-grid-item',
      layout: {
        fillGaps: true,
        horizontal: false,
        alignRight: false,
        alignBottom: false,
        rounding: true,
      },
      layoutOnResize: 100,
      layoutDuration: 320,
      layoutEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      dragEnabled: false,
    });
    muuriRef.current = grid;

    // Primera colocación instantánea: evita un salto desde (0,0).
    grid.refreshItems().layout(true);

    return () => {
      if (layoutFrameRef.current) cancelAnimationFrame(layoutFrameRef.current);
      if (muuriRef.current === grid) muuriRef.current = null;
      grid.destroy(false);
    };
  }, [layoutKey]);

  // Cuando cambia un span o el número de columnas, React actualiza primero los
  // anchos y Muuri recalcula después las posiciones con una animación estable.
  useLayoutEffect(() => {
    requestLayout(false);
    const secondPass = requestAnimationFrame(() => requestLayout(false));
    return () => cancelAnimationFrame(secondPass);
  }, [cardSpans, columnCount, layoutKey]);

  // Imágenes, videos, iframes y texto pueden cambiar de alto tras renderizar.
  // ResizeObserver refresca el motor en ese momento; Muuri vuelve a empaquetar
  // desde las medidas reales, sin estimaciones ni filas artificiales.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => requestLayout(false));
    container.querySelectorAll<HTMLElement>('.muuri-item-content').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [layoutKey]);

  const handleDragEnd = (draggedId: string, info: any) => {
    if (!onReorder || !containerRef.current) return;

    const point = info.point;
    const cards = containerRef.current.querySelectorAll('[data-card-id]');
    
    // Validar que tenemos un punto válido
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
      return;
    }
    
    let closestId: string | null = null;
    let minDistance = Infinity;
    let directHit = false;

    cards.forEach((cardEl: any) => {
      const id = cardEl.getAttribute('data-card-id');
      if (id === draggedId) return;

      const rect = cardEl.getBoundingClientRect();

      // Prioridad 1: si soltamos con el cursor SOBRE una tarjeta, esa es el destino.
      const inside =
        point.x >= rect.left && point.x <= rect.right &&
        point.y >= rect.top && point.y <= rect.bottom;
      if (inside) {
        closestId = id;
        directHit = true;
        return;
      }
      if (directHit) return; // ya hay un destino directo

      // Prioridad 2: la tarjeta cuyo centro esté más cerca del cursor (sin umbral,
      // para que el reordenamiento no se sienta "pegado").
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const distance = Math.hypot(point.x - cx, point.y - cy);
      if (distance < minDistance) {
        minDistance = distance;
        closestId = id;
      }
    });

    // Solo reordenar si encontramos una tarjeta cercana válida
    if (closestId) {
      // Encontrar los índices en groupedItems
      const oldGroupIndex = groupedItems.findIndex(item => item.id === draggedId);
      const targetGroupIndex = groupedItems.findIndex(item => item.id === closestId);
      
      if (oldGroupIndex !== -1 && targetGroupIndex !== -1 && oldGroupIndex !== targetGroupIndex) {
        // Reordenar los groupedItems
        const newGroupedItems = [...groupedItems];
        const [movedItem] = newGroupedItems.splice(oldGroupIndex, 1);
        newGroupedItems.splice(targetGroupIndex, 0, movedItem);
        
        // Expandir los grupos a items originales para pasar a onReorder
        // IMPORTANTE: Insertar separadores vacíos entre grupos para evitar que se mezclen
        const newItems: MediaItem[] = [];
        for (let i = 0; i < newGroupedItems.length; i++) {
          const groupedItem = newGroupedItems[i];
          
          // Insertar separador vacío antes de cada grupo (excepto el primero)
          // para asegurar que los grupos no se mezclen al reagrupar
          if (i > 0) {
            const prevItem = newGroupedItems[i - 1];
            const currentIsStandalone = !groupedItem.isGroup;
            const prevIsStandalone = !prevItem.isGroup;
            
            // Solo insertar separador si al menos uno NO es standalone
            // (los standalone ya van solos por definición)
            if (!currentIsStandalone || !prevIsStandalone) {
              newItems.push({
                id: `separator-${i}-${Date.now()}`,
                type: 'text',
                content: '',
                parentId: groupedItem.parentId
              });
            }
          }
          
          if (groupedItem.isGroup && groupedItem.groupItems) {
            // Es un grupo - añadir todos sus items
            newItems.push(...groupedItem.groupItems);
          } else {
            // Es un item individual
            newItems.push(groupedItem as MediaItem);
          }
        }
        
        onReorder(newItems);
      }
    }
    // Si no hay closestId, dragSnapToOrigin se encargará de devolver la tarjeta a su posición original
  };

  useEffect(() => {
    if (!containerRef.current) return;

    if (!galleryInstanceRef.current && items.length > 0) {
      // Silenciar console.log globalmente para evitar warnings de librerías
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;
      console.log = () => {};
      console.warn = () => {};
      console.error = () => {};
      
      galleryInstanceRef.current = lightGallery(containerRef.current, {
          selector: '.gallery-item', 
          mode: 'lg-fade',
          plugins: [lgZoom, lgVideo, lgThumbnail, lgAutoplay, lgFullscreen, lgRotate], 
          speed: 300,
          download: false,
          zoomFromOrigin: true,
          mobileSettings: { controls: false, showCloseIcon: true, download: false }
      });
      
      // Restaurar console
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    } else if (galleryInstanceRef.current) {
      galleryInstanceRef.current.refresh();
    }
  }, [items]);

  useEffect(() => {
    return () => {
      if (galleryInstanceRef.current) {
        galleryInstanceRef.current.destroy();
        galleryInstanceRef.current = null;
      }
    };
  }, []);

  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100vh] w-full p-4">
        <Mirage size="70" speed="2.5" color="#ff3000" />
      </div>
    );
  }

  if (items.length === 0) {
    // Home vacío: sin logo, sin animación y sin frases.
    return <div className="min-h-screen w-full" />;
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${isShuffling ? 'shuffling-active' : ''}`}
      style={{ minHeight: 1 }}
    >
      {displayItems.map((item) => {
        const span = Math.max(1, Math.min(cardSpans[item.id] || DEFAULT_SPAN, totalTracks));
        // El ancho exterior incluye márgenes laterales de 10px. Así Muuri mide
        // exactamente una fracción del grid y el espacio visible siempre es 20px.
        const widthPercent = (span / totalTracks) * 100;
        return (
          <div
            key={item.id}
            className="muuri-grid-item absolute"
            style={{
              width: `calc(${widthPercent}% - ${GRID_GAP}px)`,
              margin: `0 ${GRID_GAP / 2}px ${GRID_GAP}px`,
              willChange: 'transform',
              zIndex: 1,
            }}
          >
            <div
              data-card-id={item.id}
              className="muuri-item-content relative group/size w-full"
            >
              {/* Controles de tamaño: agrandar/achicar la tarjeta. */}
              <div
                className="absolute top-2 right-2 z-[60] flex items-center gap-1 opacity-0 group-hover/size:opacity-100 transition-opacity"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setSpan(item.id, span - 1); }}
                  disabled={span <= 1}
                  title="Más pequeño"
                  className="w-6 h-6 flex items-center justify-center rounded-md bg-black/70 text-white backdrop-blur border border-white/10 hover:bg-black/90 transition-all disabled:opacity-30"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setSpan(item.id, span + 1); }}
                  disabled={span >= totalTracks}
                  title="Más grande"
                  className="w-6 h-6 flex items-center justify-center rounded-md bg-black/70 text-white backdrop-blur border border-white/10 hover:bg-black/90 transition-all disabled:opacity-30"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {item.isGroup && item.groupItems ? (
                <GroupedCard
                  items={item.groupItems}
                  language={language}
                  groupId={item.id}
                  orderIndex={orderIndexMap.get(item.id)}
                  onDragEnd={handleDragEnd}
                />
              ) : (
                <MediaCard item={item} onDragEnd={handleDragEnd} orderIndex={orderIndexMap.get(item.id)} language={language} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

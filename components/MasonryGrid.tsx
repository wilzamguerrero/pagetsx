
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { MediaItem, Language } from '../types';
import { MediaCard, GroupedCard } from './MediaCard';
import { motion, AnimatePresence } from 'framer-motion';
import { t } from '../services/i18nService';
import { groupContentForReading, GroupedMediaItem, numberListItems } from '../services/contentGrouper';
import { Menu, Columns3, Maximize, UserRound, Home } from 'lucide-react';

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
  language: Language;
  onReorder?: (items: MediaItem[]) => void;
  isSidebarOpen?: boolean;
  effectsEnabled?: boolean;
}

export const MasonryGrid: React.FC<MasonryGridProps> = ({ items, isLoading, columnCount, language, onReorder, isSidebarOpen = false, effectsEnabled = true }) => {
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

  const columns = useMemo(() => {
    const cols: GroupedMediaItem[][] = Array.from({ length: columnCount }, () => []);
    displayItems.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [displayItems, columnCount]);

  // Usar el orden original guardado en el ref (no cambia con reordenamientos)
  const orderIndexMap = originalOrderRef.current;

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

    cards.forEach((cardEl: any) => {
      const id = cardEl.getAttribute('data-card-id');
      if (id === draggedId) return;

      const rect = cardEl.getBoundingClientRect();
      
      // Verificar que el punto está dentro o cerca del área de la tarjeta
      const isWithinBounds = 
        point.x >= rect.left - 50 && 
        point.x <= rect.right + 50 && 
        point.y >= rect.top - 50 && 
        point.y <= rect.bottom + 50;
      
      if (!isWithinBounds) return;
      
      const cardCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      const dx = point.x - cardCenter.x;
      const dy = point.y - cardCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Umbral basado en el tamaño de la tarjeta para mejor precisión
      const threshold = Math.min(rect.width, rect.height) * 0.8;
      if (distance < minDistance && distance < threshold) {
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
    return <div className="flex flex-col items-center justify-center min-h-[100vh] w-full p-4"><div className="loader"></div></div>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-start min-h-screen w-full pt-[30vh] md:pt-[35vh] p-4">
        <div className="flex flex-col items-center text-center w-full" style={{ maxWidth: '200px' }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-52 h-52 md:w-60 md:h-60 bg-[#191919] border border-[#191919] rounded-[32px] flex items-center justify-center overflow-hidden z-10 mb-8">
              <AnimatePresence>
                {isPulsing && (
                  <motion.svg initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <motion.rect x="0.5" y="0.5" width="99" height="99" rx="14" fill="none" stroke="#00ffcc" strokeWidth="1" strokeDasharray="4 2" animate={{ strokeDashoffset: [0, -6] }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
                  </motion.svg>
                )}
              </AnimatePresence>
              <img src="https://iili.io/fc6Elv2.gif" alt="Logo" className="w-42 h-42 md:w-52 md:h-52 object-contain pointer-events-none select-none z-10" />
          </motion.div>
          <div className="h-28 flex flex-col items-center justify-start mx-auto relative">
            <AnimatePresence mode="wait">
              {isTextVisible ? (
                <motion.p key={currentPhrase} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 1 }} className="text-gray-400 text-[10px] md:text-xs font-medium opacity-80">{currentPhrase}</motion.p>
              ) : isPulsing ? (
                <motion.div key="dots" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-3 pt-6 items-center justify-center">
                   {[0, 0.2, 0.4].map(d => <div key={d} className="w-1 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${d}s` }}></div>)}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex gap-3 lg:gap-5 w-full justify-center items-start ${isShuffling ? 'shuffling-active' : ''}`}>
      {columns.map((colItems, colIndex) => (
        <div key={colIndex} className="flex flex-col gap-3 lg:gap-5 flex-1 min-w-0">
          <AnimatePresence mode="popLayout">
            {colItems.map((item) => (
              <motion.div 
                key={item.id} 
                data-card-id={item.id} 
                className="w-full"
                layout
                initial={isShuffling ? { opacity: 0.5, scale: 0.95 } : false}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  transition: { 
                    type: "spring", 
                    stiffness: 300, 
                    damping: 25,
                    duration: 0.5 
                  }
                }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
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
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
};

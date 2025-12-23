import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NotionService, ROOT_PAGE_ID, NOTION_PORTFOLIO_KEY, SHOW_LOGS } from './services/notionService';
import { AppState, Board, MediaItem, NotionProperty } from './types';
import { Sidebar } from './components/Sidebar';
import { MasonryGrid } from './components/MasonryGrid';
import { GlitchOverlay } from './components/GlitchOverlay';
import { t } from './services/i18nService';

const SHOW_DATABASE_NAMES = false; 

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    isAuthenticated: true, 
    apiKey: NOTION_PORTFOLIO_KEY,
    rootPageId: ROOT_PAGE_ID,
    boards: [], 
    activeBoardId: null, // Siempre empezar en home al hacer refresh
    media: [],
    isLoading: true,
    error: null,
    isDemoMode: false,
    language: 'es',
  });
  
  // Flag para evitar pushState cuando navegamos con popstate
  const isNavigatingRef = useRef(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Detectar si es móvil para columnas por defecto
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [columnCount, setColumnCount] = useState(isMobile ? 1 : 4);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const notionServiceRef = useRef<NotionService | null>(null);
  
  const strings = t(state.language);

  // Actualizar URL sin recargar la página
  const updateUrl = useCallback((boardId: string | null) => {
    if (isNavigatingRef.current) return;
    
    const url = new URL(window.location.href);
    if (boardId) {
      url.searchParams.set('board', boardId);
    } else {
      url.searchParams.delete('board');
    }
    
    const selectedBoard = state.boards.find(b => b.id === boardId);
    const title = selectedBoard?.title || 'Portfolio';
    
    window.history.pushState({ boardId }, title, url.toString());
  }, [state.boards]);

  const autoLoadDatabases = async (service: NotionService, currentBoards: Board[], forceRefresh = false) => {
    if (SHOW_DATABASE_NAMES) return currentBoards;
    // Solo auto-cargar DBs que NO empiezan con * (las starred se muestran en sidebar)
    const dbsToLoad = currentBoards.filter(b => 
      b.type === 'database' && !b.isLoaded && !b.title.startsWith('*')
    );
    if (dbsToLoad.length === 0) return currentBoards;
    try {
      const results = await Promise.all(dbsToLoad.map(db => service.queryDatabase(db.id, forceRefresh)));
      const newSubBoards = results.flat();
      const updatedExisting = currentBoards.map(b => 
        (b.type === 'database' && !b.title.startsWith('*')) ? { ...b, isLoaded: true } : b
      );
      const allBoards = [...updatedExisting, ...newSubBoards];
      // Continuar recursivamente solo con DBs no-starred
      if (newSubBoards.some(b => b.type === 'database' && !b.title.startsWith('*'))) {
        return autoLoadDatabases(service, allBoards, forceRefresh);
      }
      return allBoards;
    } catch (e) {
      return currentBoards;
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignorar si estamos en un input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) return;
      
      // Toggle sidebar con 'Z'
      if (e.key.toLowerCase() === 'z') {
        setIsSidebarOpen(prev => !prev);
        return;
      }
      
      // Toggle effects con 'F'
      if (e.key.toLowerCase() === 'f') {
        setEffectsEnabled(prev => !prev);
        return;
      }
      
      // Cambiar columnas con teclas 1-6 (tanto numpad como números normales)
      const key = e.key;
      if (['1', '2', '3', '4', '5', '6'].includes(key)) {
        e.preventDefault();
        setColumnCount(parseInt(key));
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const createTitleCard = (title: string, id: string, parentTitle?: string): MediaItem => ({
    id: `title-${id}`,
    type: 'title',
    content: title,
    parentId: id,
    metadata: { parentTitle }
  });

  // Card de propiedades para páginas de base de datos
  const createPropertiesCard = (id: string, properties: NotionProperty[]): MediaItem => ({
    id: `props-${id}`,
    type: 'properties',
    parentId: id,
    metadata: { properties }
  });

  const loadRootContent = async (service: NotionService, forceRefresh = false) => {
    if (SHOW_LOGS) console.log(`[App] Loading root content, forceRefresh: ${forceRefresh}`);
    const blocks = await service.getBlockChildren(ROOT_PAGE_ID, forceRefresh);
    const expanded = await service.getDeepBlockChildren(blocks, forceRefresh);
    const extractedBoards = service.extractBoards(expanded);
    
    // Enriquecer boards con iconos de Notion
    const boardsWithIcons = await service.enrichBoardsWithIcons(extractedBoards);
    
    const finalBoards = await autoLoadDatabases(service, boardsWithIcons, forceRefresh);
    const media = service.extractMedia(expanded, ROOT_PAGE_ID);
    
    if (SHOW_LOGS) console.log(`[App] Loaded ${finalBoards.length} boards, ${media.length} media items`);
    
    const finalMedia = media.length > 0 
      ? [createTitleCard("Galería", ROOT_PAGE_ID), ...media]
      : [];

    return {
      boards: finalBoards,
      media: finalMedia
    };
  };

  useEffect(() => {
    const initApp = async () => {
      if (!NOTION_PORTFOLIO_KEY) {
        setState(prev => ({ ...prev, isLoading: false, error: 'API Key missing.' }));
        return;
      }
      try {
        const service = new NotionService(NOTION_PORTFOLIO_KEY);
        notionServiceRef.current = service;
        const { boards } = await loadRootContent(service, true);
        
        // Home siempre empieza con media vacío para mostrar logo y frases
        setState(prev => ({ ...prev, boards, media: [], isLoading: false, error: null }));
        
        // Limpiar la URL y establecer el estado inicial del historial en home
        const url = new URL(window.location.href);
        url.searchParams.delete('board');
        window.history.replaceState({ boardId: null }, 'Portfolio', url.toString());
        
      } catch (err: any) {
        setState(prev => ({ ...prev, isLoading: false, error: `Error: ${err.message}` }));
      }
    };
    initApp();
  }, []);

  // Escuchar navegación con flechas del navegador (back/forward)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const boardId = event.state?.boardId ?? null;
      isNavigatingRef.current = true;
      
      if (boardId === null) {
        // Ir a home
        handleGoHome();
        isNavigatingRef.current = false;
      } else {
        // Ir al board específico
        handleSelectBoard(boardId, false).finally(() => {
          isNavigatingRef.current = false;
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [state.boards]);

  const handleSelectBoard = async (boardId: string | null, forceRefresh = true) => {
    const targetId = boardId || state.rootPageId;
    const selectedBoard = state.boards.find(b => b.id === boardId);
    const boardTitle = selectedBoard?.title || "Galería";
    
    // Función para encontrar el padre visible (saltando databases si SHOW_DATABASE_NAMES = false, excepto las que empiezan con *)
    const findVisibleParent = (board: Board | undefined): string | undefined => {
      if (!board || !board.parentId || board.parentId === state.rootPageId) {
        return undefined;
      }
      const parentBoard = state.boards.find(b => b.id === board.parentId);
      if (!parentBoard) return undefined;
      
      // Las DBs que empiezan con * siempre son visibles
      const isStarredDatabase = parentBoard.type === 'database' && parentBoard.title.startsWith('*');
      
      // Si no mostramos nombres de DB y el padre es una database (y no es starred), buscar el abuelo
      if (!SHOW_DATABASE_NAMES && parentBoard.type === 'database' && !isStarredDatabase) {
        return findVisibleParent(parentBoard);
      }
      
      // Quitar el asterisco del título si es una starred database
      return isStarredDatabase ? parentBoard.title.slice(1) : parentBoard.title;
    };
    
    const parentTitle = findVisibleParent(selectedBoard);

    setState(prev => ({ ...prev, activeBoardId: boardId, isLoading: true, error: null }));
    if (!notionServiceRef.current) return;
    
    try {
      const service = notionServiceRef.current;
      
      if (forceRefresh) {
        service.invalidateBlock(targetId);
      }
      
      let newMedia: MediaItem[] = [];
      let newSubBoards: Board[] = [];

      if (selectedBoard?.type === 'database') {
        newSubBoards = await service.queryDatabase(targetId, forceRefresh);
        newMedia = [];
      } else {
        const blocks = await service.getBlockChildren(targetId, forceRefresh);
        if (SHOW_LOGS) console.log(`[App] Got ${blocks.length} blocks for board ${boardTitle}`);
        const allBlocks = await service.getDeepBlockChildren(blocks, forceRefresh);
        newMedia = service.extractMedia(allBlocks, targetId);
        newSubBoards = service.extractBoards(allBlocks, targetId);
        if (SHOW_LOGS) console.log(`[App] Extracted ${newMedia.length} media items`);
      }
      
      const processedSubBoards = await autoLoadDatabases(service, newSubBoards, forceRefresh);
      
      // Construir media final con título y propiedades si es página de DB
      const mediaItems: MediaItem[] = [];
      
      // Solo mostrar título y contenido si hay media real (imágenes, videos, texto CON contenido, etc.)
      // Filtrar elementos vacíos (párrafos vacíos de Notion)
      const realMedia = newMedia.filter(m => {
        // Si es texto, debe tener contenido no vacío
        if (m.type === 'text') return m.content && m.content.trim().length > 0;
        // Otros tipos (imagen, video, etc.) siempre cuentan
        return true;
      });
      
      const hasRealContent = realMedia.length > 0;
      
      if (hasRealContent) {
        mediaItems.push(createTitleCard(boardTitle, targetId, parentTitle));
        // Agregar card de propiedades si la página tiene propiedades (viene de DB)
        if (selectedBoard?.properties && selectedBoard.properties.length > 0) {
          mediaItems.push(createPropertiesCard(targetId, selectedBoard.properties));
        }
        mediaItems.push(...newMedia);
      }
      // Si no hay media real, mediaItems queda vacío y MasonryGrid mostrará el home
      
      const finalMedia = mediaItems;

      setState(prev => {
          const existingIds = new Set(prev.boards.map(b => b.id));
          const filteredNewBoards = processedSubBoards.filter(b => !existingIds.has(b.id));
          const updatedBoards = prev.boards.map(b => 
            b.id === targetId ? { ...b, isLoaded: true } : b
          );

          return {
              ...prev,
              boards: [...updatedBoards, ...filteredNewBoards],
              media: finalMedia,
              isLoading: false
          };
      });
      
      // Actualizar URL para navegación con historial
      updateUrl(boardId);
    } catch (err: any) {
      setState(prev => ({ ...prev, isLoading: false, error: 'Failed to load content.' }));
    }
  };

  const handleGoHome = async () => {
    // Home muestra el logo y frases, sin media
    setState(prev => ({ ...prev, activeBoardId: null, media: [], isLoading: false }));
    
    // Actualizar URL para navegación con historial
    updateUrl(null);
  };

  const handleReorder = (newMedia: MediaItem[]) => {
    setState(prev => ({ ...prev, media: newMedia }));
  };

  return (
    <div className="min-h-screen bg-background text-white flex overflow-x-hidden">
      {/* Glitch overlay with chromatic aberration - only when effects enabled */}
      <GlitchOverlay isActive={isSidebarOpen && effectsEnabled} />
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-30 transition-opacity" onClick={() => setIsSidebarOpen(false)} />
      )}
      <Sidebar
        boards={state.boards}
        activeBoardId={state.activeBoardId}
        onSelectBoard={handleSelectBoard}
        onGoHome={handleGoHome}
        onCreateBoard={async (p, title) => {
          const b = await notionServiceRef.current!.createBoard(p === 'root' ? state.rootPageId : p, title);
          setState(prev => ({ ...prev, boards: [...prev.boards, b] }));
          return b;
        }}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        columnCount={columnCount}
        onColumnChange={setColumnCount}
        language={state.language}
        onToggleLanguage={() => setState(prev => ({ ...prev, language: prev.language === 'es' ? 'en' : 'es' }))}
        showDatabaseNames={SHOW_DATABASE_NAMES}
        effectsEnabled={effectsEnabled}
        onToggleEffects={() => setEffectsEnabled(prev => !prev)}
      />
      <main className={`flex-1 transition-all duration-500 flex flex-col min-w-0 ${isSidebarOpen ? `lg:blur-none blur-sm ${effectsEnabled ? 'glitch-active' : ''}` : ''}`}>
        {state.error && (
            <div className="mx-auto mt-10 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 max-w-2xl text-center">
                <p className="font-bold">{strings.errorTitle}</p>
                <p className="text-sm">{state.error}</p>
                <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-bold">{strings.retry}</button>
            </div>
        )}
        <div className="w-full p-2 lg:p-4">
          <MasonryGrid 
            items={state.media} 
            isLoading={state.isLoading} 
            columnCount={columnCount} 
            language={state.language} 
            onReorder={handleReorder}
            isSidebarOpen={isSidebarOpen}
            effectsEnabled={effectsEnabled}
          />
        </div>
      </main>
    </div>
  );
};

export default App;
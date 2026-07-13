import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NotionService, ROOT_PAGE_ID, NOTION_PORTFOLIO_KEY, SHOW_LOGS } from './services/notionService';
import { AppState, Board, MediaItem, NotionProperty } from './types';
import { Sidebar } from './components/Sidebar';
import { MasonryGrid } from './components/MasonryGrid';
import { GlitchOverlay } from './components/GlitchOverlay';
import { t } from './services/i18nService';

const SHOW_DATABASE_NAMES = false; 

// Reconstruye un UUID con guiones (8-4-4-4-12) a partir de 32 hex sin guiones.
const toDashedId = (hex: string): string => {
  const c = hex.replace(/-/g, '');
  if (c.length !== 32) return hex;
  return `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`;
};

// Lee el ID de tablero desde el path actual (/<32hex>), o null si no hay.
const readBoardIdFromPath = (): string | null => {
  const raw = window.location.pathname.replace(/^\/+/, '').split(/[/?#]/)[0];
  const clean = raw.replace(/-/g, '');
  return /^[a-f0-9]{32}$/i.test(clean) ? toDashedId(clean) : null;
};

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
  // ID de tablero pendiente de abrir por deep-link (una vez cargados los tableros)
  const pendingDeepLinkRef = useRef<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Detectar si es móvil para columnas por defecto
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [columnCount, setColumnCount] = useState(isMobile ? 1 : 4);
  const [effectsEnabled, setEffectsEnabled] = useState(false);
  const notionServiceRef = useRef<NotionService | null>(null);
  const allLoadedRef = useRef(false);
  const indexingRef = useRef(false);
  const [isIndexing, setIsIndexing] = useState(false);
  
  const strings = t(state.language);

  // Carga TODO el árbol de tableros (recursivamente) para poder buscar entre
  // todas las listas, incluidas las que nunca se han desplegado. Se ejecuta una
  // sola vez, bajo demanda (al abrir el buscador), para no ralentizar el arranque.
  const loadAllBoards = useCallback(async () => {
    if (allLoadedRef.current || indexingRef.current || !notionServiceRef.current) return;
    indexingRef.current = true;
    setIsIndexing(true);
    const service = notionServiceRef.current;
    try {
      const known = new Map<string, Board>();
      state.boards.forEach(b => known.set(b.id, { ...b }));
      let queue = Array.from(known.values()).filter(b => b.hasChildren && !b.isLoaded);
      const CONCURRENCY = 5;

      while (queue.length) {
        const batch = queue.splice(0, CONCURRENCY);
        const results = await Promise.all(batch.map(async (b) => {
          try {
            let subs: Board[];
            if (b.type === 'database') {
              subs = await service.queryDatabase(b.id, false);
            } else {
              const blocks = await service.getBlockChildren(b.id, false);
              const deep = await service.getDeepBlockChildren(blocks, false);
              subs = service.extractBoards(deep, b.id);
            }
            return { id: b.id, subs };
          } catch {
            return { id: b.id, subs: [] as Board[] };
          }
        }));

        for (const r of results) {
          const bb = known.get(r.id);
          if (bb) bb.isLoaded = true;
          for (const sub of r.subs) {
            if (!known.has(sub.id)) {
              known.set(sub.id, sub);
              if (sub.hasChildren) queue.push(sub);
            }
          }
        }
      }

      setState(prev => {
        const map = new Map(prev.boards.map(b => [b.id, b]));
        known.forEach((b, id) => {
          if (map.has(id)) map.set(id, { ...map.get(id)!, isLoaded: true });
          else map.set(id, b);
        });
        return { ...prev, boards: Array.from(map.values()) };
      });
      allLoadedRef.current = true;
    } finally {
      indexingRef.current = false;
      setIsIndexing(false);
    }
  }, [state.boards]);

  // Actualizar URL sin recargar la página
  const updateUrl = useCallback((boardId: string | null) => {
    if (isNavigatingRef.current) return;

    // Ruta limpia: /<id-sin-guiones> para un tablero, o / para el home.
    const path = boardId ? `/${NotionService.formatUUID(boardId)}` : '/';
    const selectedBoard = state.boards.find(b => b.id === boardId);
    const title = selectedBoard?.title || 'Portfolio';

    window.history.pushState({ boardId }, title, path);
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

  const loadRootContent = async (service: NotionService, rootId: string, forceRefresh = false) => {
    if (SHOW_LOGS) console.log(`[App] Loading root content, forceRefresh: ${forceRefresh}`);
    const blocks = await service.getBlockChildren(rootId, forceRefresh);
    const expanded = await service.getDeepBlockChildren(blocks, forceRefresh);
    const extractedBoards = service.extractBoards(expanded);
    
    // Enriquecer boards con iconos de Notion
    const boardsWithIcons = await service.enrichBoardsWithIcons(extractedBoards);
    
    const finalBoards = await autoLoadDatabases(service, boardsWithIcons, forceRefresh);
    const media = service.extractMedia(expanded, rootId);
    
    if (SHOW_LOGS) console.log(`[App] Loaded ${finalBoards.length} boards, ${media.length} media items`);
    
    const finalMedia = media.length > 0 
      ? [createTitleCard("Galería", rootId), ...media]
      : [];

    return {
      boards: finalBoards,
      media: finalMedia
    };
  };

  useEffect(() => {
    const initApp = async () => {
      try {
        // El token de Notion y el ID de la página raíz viven en el servidor
        // (Cloudflare Functions). Pedimos el ID de raíz en runtime; si el
        // build incluyó VITE_ROOT_PAGE_ID, se usa como respaldo.
        let rootId = ROOT_PAGE_ID;
        try {
          const cfgRes = await fetch('/api/config');
          if (cfgRes.ok) {
            const cfg = await cfgRes.json();
            if (cfg.rootPageId) rootId = cfg.rootPageId;
          }
        } catch (e) { /* usar respaldo de build */ }

        if (!rootId) {
          setState(prev => ({ ...prev, isLoading: false, error: 'Falta ROOT_PAGE_ID en el servidor.' }));
          return;
        }

        const service = new NotionService(NOTION_PORTFOLIO_KEY);
        notionServiceRef.current = service;
        const { boards } = await loadRootContent(service, rootId, true);
        
        // Home siempre empieza con media vacío para mostrar logo y frases
        setState(prev => ({ ...prev, rootPageId: rootId, boards, media: [], isLoading: false, error: null }));

        // Deep link: si la URL trae un ID de tablero en el path (/<id>), abrirlo.
        // Se difiere a un efecto para que los tableros ya estén en el estado y
        // el título/padre se resuelvan correctamente.
        const deepLinkId = readBoardIdFromPath();
        if (deepLinkId) {
          const clean = NotionService.formatUUID(deepLinkId);
          window.history.replaceState({ boardId: deepLinkId }, '', `/${clean}`);
          pendingDeepLinkRef.current = deepLinkId;
        } else {
          window.history.replaceState({ boardId: null }, 'Portfolio', '/');
        }
        
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

  // Ejecuta el deep-link pendiente una vez que los tableros están cargados.
  useEffect(() => {
    if (pendingDeepLinkRef.current && state.boards.length > 0) {
      const id = pendingDeepLinkRef.current;
      pendingDeepLinkRef.current = null;
      isNavigatingRef.current = true; // no volver a hacer pushState
      handleSelectBoard(id, true).finally(() => { isNavigatingRef.current = false; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Elimina (archiva) un tablero y lo quita del árbol junto a sus descendientes.
  const handleDeleteBoard = async (board: Board) => {
    if (!notionServiceRef.current) return;
    await notionServiceRef.current.deleteBoard(board);
    setState(prev => {
      const toRemove = new Set<string>();
      const collect = (id: string) => {
        toRemove.add(id);
        prev.boards.filter(b => b.parentId === id).forEach(c => collect(c.id));
      };
      collect(board.id);
      const boards = prev.boards.filter(b => !toRemove.has(b.id));
      const wasActive = !!prev.activeBoardId && toRemove.has(prev.activeBoardId);
      return {
        ...prev,
        boards,
        activeBoardId: wasActive ? null : prev.activeBoardId,
        media: wasActive ? [] : prev.media,
      };
    });
  };

  // Renombra un tablero y actualiza su título en el árbol.
  const handleRenameBoard = async (board: Board, newTitle: string) => {
    if (!notionServiceRef.current) return;
    await notionServiceRef.current.renameBoard(board, newTitle);
    setState(prev => ({
      ...prev,
      boards: prev.boards.map(b => (b.id === board.id ? { ...b, title: newTitle } : b)),
    }));
  };

  return (
    <div className="min-h-screen bg-background text-white flex overflow-x-hidden">
      {/* Glitch overlay with chromatic aberration - only when effects enabled */}
      <GlitchOverlay isActive={isSidebarOpen && effectsEnabled} />
      <div
        className={`fixed inset-0 bg-background/95 z-30 transition-opacity duration-500 ease-in-out ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />
      <Sidebar
        boards={state.boards}
        activeBoardId={state.activeBoardId}
        onSelectBoard={handleSelectBoard}
        onGoHome={handleGoHome}
        onCreateBoard={async (p, title) => {
          const parent = p === 'root' ? state.rootPageId : p;
          const b = await notionServiceRef.current!.createBoard(parent, title);
          // Los tableros de nivel raíz se muestran sin parentId en el árbol,
          // igual que los que se extraen al cargar el contenido raíz.
          const normalized = parent === state.rootPageId ? { ...b, parentId: undefined } : b;
          setState(prev => ({ ...prev, boards: [...prev.boards, normalized] }));
          return normalized;
        }}
        onDeleteBoard={handleDeleteBoard}
        onRenameBoard={handleRenameBoard}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        columnCount={columnCount}
        onColumnChange={setColumnCount}
        language={state.language}
        onToggleLanguage={() => setState(prev => ({ ...prev, language: prev.language === 'es' ? 'en' : 'es' }))}
        showDatabaseNames={SHOW_DATABASE_NAMES}
        effectsEnabled={effectsEnabled}
        onToggleEffects={() => setEffectsEnabled(prev => !prev)}
        rootPageId={state.rootPageId}
        onEnsureAllLoaded={loadAllBoards}
        isIndexing={isIndexing}
        onContentUploaded={(boardId) => {
          // Si estamos viendo ese tablero, refrescar para mostrar los archivos nuevos
          if (state.activeBoardId === boardId) {
            handleSelectBoard(boardId, true);
          }
        }}
      />
      <main className={`flex-1 transition-all duration-500 flex flex-col min-w-0 ${isSidebarOpen && effectsEnabled ? 'glitch-active' : ''}`}>
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
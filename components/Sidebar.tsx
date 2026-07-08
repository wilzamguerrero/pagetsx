
import React, { useState, useEffect } from 'react';
import { Board, Language } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Folder, FileText, Database, ChevronRight, ChevronDown, ChevronLeft, 
    Maximize, Minimize, Circle, Home, Sparkles, Upload, Plus, Check, X, Search
} from 'lucide-react';
import { t } from '../services/i18nService';
import { UploadPanel } from './UploadPanel';

interface SidebarProps {
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (id: string | null) => void;
  onGoHome: () => void;
  onCreateBoard: (parentId: string, title: string) => Promise<Board>;
  isOpen: boolean;
  onToggle: () => void;
  columnCount: number;
  onColumnChange: (cols: number) => void;
  language: Language;
  onToggleLanguage: () => void;
  showDatabaseNames: boolean;
  effectsEnabled: boolean;
  onToggleEffects: () => void;
  rootPageId: string;
  onContentUploaded: (boardId: string) => void;
  onEnsureAllLoaded: () => void;
  isIndexing: boolean;
}

const MARKER_COLORS = [
    { name: 'None', class: 'bg-white/20 border-white/40', value: '' },
    { name: 'Red', class: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]', value: '#ef4444' },
    { name: 'Green', class: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]', value: '#10b981' },
    { name: 'Blue', class: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]', value: '#3b82f6' },
    { name: 'Amber', class: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]', value: '#fbbf24' },
    { name: 'Purple', class: 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]', value: '#a855f7' },
];

const BoardTreeItem: React.FC<{ 
    board: Board, 
    allBoards: Board[], 
    activeBoardId: string | null,
    onSelect: (id: string) => void, 
    depth: number,
    boardMarkers: Record<string, string>,
    onSetMarker: (id: string, color: string) => void,
    strings: any,
    showDatabaseNames: boolean,
    uploadMode: boolean,
    onUpload: (board: Board) => void,
    onCreateBoard: (parentId: string, title: string) => Promise<Board>
}> = ({ board, allBoards, activeBoardId, onSelect, depth, boardMarkers, onSetMarker, strings, showDatabaseNames, uploadMode, onUpload, onCreateBoard }) => {
    const children = allBoards.filter(b => b.parentId === board.id);
    const hasKnownChildren = children.length > 0;
    const isActive = activeBoardId === board.id;
    const [isExpanded, setIsExpanded] = useState(false);
    const [isPickingColor, setIsPickingColor] = useState(false);
    const [isAddingChild, setIsAddingChild] = useState(false);
    const [newChildTitle, setNewChildTitle] = useState('');
    const [isCreatingChild, setIsCreatingChild] = useState(false);

    // Solo se pueden crear sub-toggles y subir archivos dentro de toggles/páginas (no en bases de datos)
    const canManage = board.type === 'toggle' || board.type === 'page';

    const submitNewChild = async () => {
        const title = newChildTitle.trim();
        if (!title || isCreatingChild) return;
        setIsCreatingChild(true);
        try {
            await onCreateBoard(board.id, title);
            setNewChildTitle('');
            setIsAddingChild(false);
            setIsExpanded(true);
        } finally {
            setIsCreatingChild(false);
        }
    };
    
    // Las bases de datos que empiezan con * siempre se muestran (excepción a showDatabaseNames)
    const isStarredDatabase = board.type === 'database' && board.title.startsWith('*');
    
    if (!showDatabaseNames && board.type === 'database' && !isStarredDatabase) {
        return (
            <>
                {children.map(child => (
                    <BoardTreeItem 
                        key={child.id} 
                        board={child} 
                        allBoards={allBoards} 
                        activeBoardId={activeBoardId} 
                        onSelect={onSelect} 
                        depth={depth} 
                        boardMarkers={boardMarkers} 
                        onSetMarker={onSetMarker}
                        strings={strings}
                        showDatabaseNames={showDatabaseNames}
                        uploadMode={uploadMode}
                        onUpload={onUpload}
                        onCreateBoard={onCreateBoard}
                    />
                ))}
            </>
        );
    }

    // Solo mostrar chevron si YA tiene hijos cargados (no si potencialmente tiene)
    const showChevron = hasKnownChildren;
    const currentColor = boardMarkers[board.id] || '';
    const activeMarker = MARKER_COLORS.find(c => c.value === currentColor) || MARKER_COLORS[0];

    useEffect(() => {
        if (isActive && hasKnownChildren) {
            setIsExpanded(true);
        }
    }, [isActive, hasKnownChildren]);

    const handleRowClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(board.id);
        if (hasKnownChildren) setIsExpanded(!isExpanded);
    };

    const toggleExpandOnly = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasKnownChildren) setIsExpanded(!isExpanded);
    };

    const getIcon = () => {
      // Si tiene icono de Notion, mostrarlo con los colores de la app
      if (board.icon) {
        // Filtros para teñir los iconos
        const activeFilter = 'grayscale(1) brightness(1.2) sepia(1) hue-rotate(100deg) saturate(3)'; // Verde primary
        const inactiveFilter = 'grayscale(1) brightness(1.1) contrast(0.8)'; // Gris/Blanco
        
        // Si es emoji (string corto sin http)
        if (!board.icon.startsWith('http')) {
          return (
            <span 
              className={`text-sm w-4 h-4 flex items-center justify-center shrink-0 transition-all`}
              style={{ filter: isActive ? activeFilter : inactiveFilter }}
            >
              {board.icon}
            </span>
          );
        }
        // Si es URL de imagen
        return (
          <img 
            src={board.icon} 
            alt="" 
            className={`w-4 h-4 rounded shrink-0 object-cover transition-all`}
            style={{ filter: isActive ? activeFilter : inactiveFilter }}
          />
        );
      }
      // Iconos por defecto según tipo
      if (board.type === 'page') return <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'fill-current' : ''}`} />;
      if (board.type === 'database') return <Database className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'fill-current text-primary' : ''}`} />;
      return <Folder className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'fill-current' : ''}`} />;
    };

    return (
        <div className="select-none relative">
            {depth > 0 && (
                <div 
                    className="absolute left-0 top-0 bottom-0 w-[1px] bg-white/5" 
                    style={{ left: `${(depth - 1) * 12 + 18}px` }}
                />
            )}
            
            <div className={`group flex items-center justify-between p-1.5 my-0.5 rounded-lg cursor-pointer transition-all ${isActive ? 'bg-primary/20 text-primary' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleRowClick}>
                <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                    {/* Mostrar loader cuando está cargando, chevron si tiene hijos, o espacio vacío */}
                    {isActive && board.hasChildren && !board.isLoaded ? (
                        <div className="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
                            <div className="loader scale-[0.25] origin-center"></div>
                        </div>
                    ) : showChevron ? (
                        <button onClick={toggleExpandOnly} className="opacity-70 shrink-0 w-[18px] h-[18px] flex items-center justify-center rounded transition-opacity hover:bg-white/10">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                    ) : (
                        <div className="w-[18px] h-[18px] shrink-0" />
                    )}
                    {getIcon()}
                    <span className="text-[13px] font-medium truncate leading-none">
                        {isStarredDatabase ? board.title.slice(1) : board.title}
                    </span>
                </div>
                
                <div className="flex items-center gap-1 relative ml-1">
                    {uploadMode && canManage && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsAddingChild(v => !v); }}
                                title="Nueva lista dentro"
                                className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-primary hover:bg-white/10 transition-all"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onUpload(board); }}
                                title="Subir archivos aquí"
                                className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-primary hover:bg-white/10 transition-all"
                            >
                                <Upload className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsPickingColor(!isPickingColor); }} 
                        className={`w-3.5 h-3.5 flex items-center justify-center transition-all ${uploadMode ? 'hidden' : ''} ${isPickingColor ? 'opacity-100 scale-110' : (currentColor ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}`}
                    >
                        {currentColor ? <div className={`w-1.5 h-1.5 rounded-full ${activeMarker.class}`} /> : <Circle className="w-2.5 h-2.5 text-gray-600" />}
                    </button>
                    
                    <AnimatePresence>
                        {isPickingColor && (
                            <motion.div 
                                initial={{ opacity: 0, x: 5, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 5, scale: 0.9 }}
                                className="absolute right-full mr-2 z-50 bg-black/95 backdrop-blur-md border border-white/10 p-1 rounded-full flex gap-1 shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {MARKER_COLORS.map((c) => (
                                    <button key={c.name} onClick={() => { onSetMarker(board.id, c.value); setIsPickingColor(false); }}
                                        className={`w-3.5 h-3.5 rounded-full transition-transform hover:scale-125 ${c.class} ${currentColor === c.value ? 'ring-1 ring-white' : ''}`}
                                    />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
            
            {isAddingChild && (
                <div className="flex items-center gap-1.5 my-1" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                    <input
                        autoFocus
                        value={newChildTitle}
                        onChange={(e) => setNewChildTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submitNewChild();
                            if (e.key === 'Escape') { setIsAddingChild(false); setNewChildTitle(''); }
                        }}
                        placeholder="Nueva lista..."
                        className="flex-1 min-w-0 bg-black/40 border border-white/10 focus:border-primary/40 rounded-md px-2 py-1 text-[12px] text-white placeholder-gray-600 outline-none"
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); submitNewChild(); }}
                        disabled={!newChildTitle.trim() || isCreatingChild}
                        className="w-6 h-6 flex items-center justify-center rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-all disabled:opacity-30"
                    >
                        {isCreatingChild ? <div className="loader scale-[0.18] origin-center" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsAddingChild(false); setNewChildTitle(''); }}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {isExpanded && (
                <div className="relative">
                    {children.map(child => (
                        <BoardTreeItem 
                            key={child.id} 
                            board={child} 
                            allBoards={allBoards} 
                            activeBoardId={activeBoardId} 
                            onSelect={onSelect} 
                            depth={depth + 1} 
                            boardMarkers={boardMarkers} 
                            onSetMarker={onSetMarker}
                            strings={strings}
                            showDatabaseNames={showDatabaseNames}
                            uploadMode={uploadMode}
                            onUpload={onUpload}
                            onCreateBoard={onCreateBoard}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const Sidebar: React.FC<SidebarProps> = ({ 
    boards, activeBoardId, onSelectBoard, onGoHome, onCreateBoard, isOpen, onToggle, 
    columnCount, onColumnChange, language, onToggleLanguage, showDatabaseNames,
    effectsEnabled, onToggleEffects, rootPageId, onContentUploaded,
    onEnsureAllLoaded, isIndexing
}) => {
  const strings = t(language);
  const [boardMarkers, setBoardMarkers] = useState<Record<string, string>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uploadMode, setUploadMode] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<Board | null>(null);
  const [isAddingRoot, setIsAddingRoot] = useState(false);
  const [newRootTitle, setNewRootTitle] = useState('');
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Búsqueda de tableros (sin distinguir mayúsculas ni acentos)
  const normalizeText = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const query = searchQuery.trim();
  const nq = normalizeText(query);
  const searchResults = query
    ? boards.filter(b => {
        if (!showDatabaseNames && b.type === 'database' && !b.title.startsWith('*')) return false;
        const title = b.title.startsWith('*') ? b.title.slice(1) : b.title;
        return normalizeText(title).includes(nq);
      })
    : [];

  const getSimpleIcon = (b: Board) => {
    if (b.type === 'database') return <Database className="w-3.5 h-3.5 shrink-0" />;
    if (b.type === 'page') return <FileText className="w-3.5 h-3.5 shrink-0" />;
    return <Folder className="w-3.5 h-3.5 shrink-0" />;
  };

  const submitNewRoot = async () => {
    const title = newRootTitle.trim();
    if (!title || isCreatingRoot) return;
    setIsCreatingRoot(true);
    try {
      await onCreateBoard(rootPageId, title);
      setNewRootTitle('');
      setIsAddingRoot(false);
    } finally {
      setIsCreatingRoot(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  };

  useEffect(() => {
    const savedMarkers = localStorage.getItem('notio_markers');
    if (savedMarkers) try { setBoardMarkers(JSON.parse(savedMarkers)); } catch (e) {}

    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    // Atajos de teclado para X (fullscreen), C (CV), V (home)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) return;
      
      const key = e.key.toLowerCase();
      if (key === 'x') {
        e.preventDefault();
        toggleFullscreen();
      } else if (key === 'c') {
        e.preventDefault();
        setUploadMode(prev => !prev);
      } else if (key === 'v') {
        e.preventDefault();
        onGoHome();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onGoHome]);

  const handleSetMarker = (id: string, color: string) => {
    const newMarkers = { ...boardMarkers, [id]: color };
    setBoardMarkers(newMarkers);
    localStorage.setItem('notio_markers', JSON.stringify(newMarkers));
  };

  const getActionBtnClass = (isActive: boolean) => `
    w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-white/5 rounded-xl flex items-center justify-center 
    transition-all border border-white/5 
    ${isActive 
      ? 'text-primary border-primary/20 bg-primary/10' 
      : 'text-gray-400 hover:text-primary hover:border-primary/10 hover:bg-white/10'
    }
  `;

  return (
    <>
      {/* Botón para abrir el panel (visible cuando está cerrado) */}
      <div className={`fixed top-10 left-0 z-50 group/sidebar-toggle transition-all ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <button onClick={onToggle} className="w-6 h-12 bg-surface border-y border-r border-white/5 rounded-r-xl shadow-lg transition-all text-primary flex items-center justify-center">
          <div className="w-1 h-4 bg-primary rounded-full" />
        </button>
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-surface border border-white/10 rounded-lg opacity-0 group-hover/sidebar-toggle:opacity-100 transition-opacity pointer-events-none whitespace-nowrap flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">Menu</span>
          <span className="text-[9px] text-primary font-bold bg-white/10 px-1.5 py-0.5 rounded">Z</span>
        </div>
      </div>

      {/* Panel a pantalla completa con fondo translúcido */}
      <div className={`fixed inset-2 sm:inset-4 z-40 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface/50 backdrop-blur-md shadow-2xl transition-all duration-300 ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98] pointer-events-none'}`}>
        {/* Cabecera con acciones */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-3 border-b border-white/5">
          <div className="flex items-center gap-2.5 min-w-0 shrink">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Folder className="w-4 h-4 text-primary" />
            </div>
            <h2 className="hidden sm:block text-base font-bold text-white truncate">{strings.boards}</h2>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={onToggleLanguage} title={strings.language} className={getActionBtnClass(false)}>
              <span className="text-[10px] sm:text-[11px] font-black text-primary tracking-wider">{language.toUpperCase()}</span>
            </button>
            <button onClick={onToggleEffects} title={effectsEnabled ? 'FX On (F)' : 'FX Off (F)'} className={getActionBtnClass(effectsEnabled)}>
              <Sparkles className="w-4 h-4" />
            </button>
            <button onClick={toggleFullscreen} title="Pantalla completa (X)" className={getActionBtnClass(isFullscreen)}>
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
            <button onClick={() => setUploadMode(prev => !prev)} title={uploadMode ? 'Modo subir: On (C)' : 'Modo subir: Off (C)'} className={getActionBtnClass(uploadMode)}>
              <Upload className="w-4 h-4" />
            </button>
            <button onClick={onGoHome} title="Inicio (V)" className={getActionBtnClass(activeBoardId === null)}>
              <Home className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-white/10 mx-0.5 sm:mx-1 shrink-0" />
            <button onClick={onToggle} title="Cerrar (Z)" className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 border border-white/5 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de herramientas: columnas + buscador */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{strings.columns}</span>
            <div className="flex gap-1.5">
              {[1,2,3,4,5,6].map(n => (
                <button key={n} onClick={() => onColumnChange(n)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-[11px] font-bold transition-all ${columnCount === n ? 'bg-primary text-black shadow-lg scale-105' : 'bg-white/5 text-gray-500 hover:text-white'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="relative flex-1 md:max-w-sm md:ml-auto">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={searchQuery}
              onFocus={onEnsureAllLoaded}
              onChange={(e) => { setSearchQuery(e.target.value); onEnsureAllLoaded(); }}
              placeholder="Buscar tablero..."
              className="w-full bg-black/40 border border-white/10 focus:border-primary/40 rounded-xl pl-9 pr-8 py-2 text-[13px] text-white placeholder-gray-600 outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest flex items-center gap-1.5">
              {query ? `Resultados (${searchResults.length})` : strings.boards}
              {isIndexing && <span className="loader scale-[0.16] origin-center -my-2" />}
            </span>
            {uploadMode && !query && (
              <button
                onClick={() => setIsAddingRoot(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Nueva lista
              </button>
            )}
          </div>

          {isAddingRoot && (
            <div className="flex items-center gap-1.5 mb-2 px-2">
              <input
                autoFocus
                value={newRootTitle}
                onChange={(e) => setNewRootTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNewRoot();
                  if (e.key === 'Escape') { setIsAddingRoot(false); setNewRootTitle(''); }
                }}
                placeholder="Nueva lista..."
                className="flex-1 min-w-0 bg-black/40 border border-white/10 focus:border-primary/40 rounded-md px-2 py-1 text-[12px] text-white placeholder-gray-600 outline-none"
              />
              <button
                onClick={submitNewRoot}
                disabled={!newRootTitle.trim() || isCreatingRoot}
                className="w-6 h-6 flex items-center justify-center rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-all disabled:opacity-30"
              >
                {isCreatingRoot ? <div className="loader scale-[0.18] origin-center" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => { setIsAddingRoot(false); setNewRootTitle(''); }}
                className="w-6 h-6 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {query ? (
            searchResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
                {searchResults.map(b => {
                  const parent = b.parentId ? boards.find(x => x.id === b.parentId) : undefined;
                  const parentTitle = parent ? (parent.title.startsWith('*') ? parent.title.slice(1) : parent.title) : '';
                  const title = b.title.startsWith('*') ? b.title.slice(1) : b.title;
                  const canManage = b.type === 'toggle' || b.type === 'page';
                  const isActive = activeBoardId === b.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => onSelectBoard(b.id)}
                      className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-all ${isActive ? 'bg-primary/20 text-primary border-primary/20' : 'text-gray-400 border-white/5 bg-white/[0.02] hover:bg-white/5 hover:text-white'}`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        {getSimpleIcon(b)}
                        <div className="min-w-0 flex flex-col leading-none">
                          <span className="text-[13px] font-medium truncate">{title}</span>
                          {parentTitle && (
                            <span className="text-[10px] text-gray-600 truncate mt-1">{parentTitle}</span>
                          )}
                        </div>
                      </div>
                      {uploadMode && canManage && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setUploadTarget(b); }}
                          title="Subir archivos aquí"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-primary hover:bg-white/10 transition-all shrink-0"
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-[11px] text-gray-600 py-10">
                {isIndexing ? 'Indexando todas las listas...' : `Sin resultados para "${query}"`}
              </p>
            )
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 2xl:columns-4 gap-x-6 [column-fill:balance]">
              {boards.filter(b => !b.parentId).map(b => (
                <div key={b.id} className="break-inside-avoid mb-1">
                  <BoardTreeItem 
                      board={b} 
                      allBoards={boards} 
                      activeBoardId={activeBoardId} 
                      onSelect={onSelectBoard} 
                      depth={0} 
                      boardMarkers={boardMarkers} 
                      onSetMarker={handleSetMarker} 
                      strings={strings}
                      showDatabaseNames={showDatabaseNames}
                      uploadMode={uploadMode}
                      onUpload={setUploadTarget}
                      onCreateBoard={onCreateBoard}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Panel de subida de archivos a Notion */}
      {uploadTarget && (
        <UploadPanel
          boardId={uploadTarget.id}
          boardTitle={uploadTarget.title.startsWith('*') ? uploadTarget.title.slice(1) : uploadTarget.title}
          onClose={() => setUploadTarget(null)}
          onUploaded={(boardId) => onContentUploaded(boardId)}
        />
      )}
    </>
  );
};




import React, { useRef, useState, useMemo } from 'react';
import { MediaItem, NotionProperty, Language } from '../types';
import { motion } from 'framer-motion';
import { Play, ExternalLink, Code, FileDown, Download, Calendar, Hash, CheckSquare, Tag, Link, Mail, Phone, User, Type, Clock, PenLine, Youtube, List, ListOrdered, Square, CheckSquare2, Quote, MessageSquare } from 'lucide-react';
import { TRANSLATIONS } from '../services/i18nService';

// Tipos para items agrupados
interface GroupedMediaItem extends MediaItem {
  isGroup?: boolean;
  groupItems?: MediaItem[];
  headings?: MediaItem[]; // Múltiples headings apilados
}

// Mapeo de colores de Notion a clases de Tailwind
const notionColorMap: Record<string, string> = {
  default: 'bg-gray-500/20 text-gray-300',
  gray: 'bg-gray-500/20 text-gray-300',
  brown: 'bg-amber-900/30 text-amber-300',
  orange: 'bg-orange-500/20 text-orange-300',
  yellow: 'bg-yellow-500/20 text-yellow-300',
  green: 'bg-emerald-500/20 text-emerald-300',
  blue: 'bg-blue-500/20 text-blue-300',
  purple: 'bg-purple-500/20 text-purple-300',
  pink: 'bg-pink-500/20 text-pink-300',
  red: 'bg-red-500/20 text-red-300',
};

const getPropertyIcon = (type: string) => {
  switch (type) {
    case 'date': return <Calendar className="w-3.5 h-3.5" />;
    case 'created_time': return <Calendar className="w-3.5 h-3.5" />;
    case 'last_edited_time': return <PenLine className="w-3.5 h-3.5" />;
    case 'number': return <Hash className="w-3.5 h-3.5" />;
    case 'checkbox': return <CheckSquare className="w-3.5 h-3.5" />;
    case 'select':
    case 'multi_select': return <Tag className="w-3.5 h-3.5" />;
    case 'status': return <div className="w-2 h-2 rounded-full bg-current" />;
    case 'url': return <Link className="w-3.5 h-3.5" />;
    case 'email': return <Mail className="w-3.5 h-3.5" />;
    case 'phone_number': return <Phone className="w-3.5 h-3.5" />;
    case 'people': return <User className="w-3.5 h-3.5" />;
    case 'rich_text': return <Type className="w-3.5 h-3.5" />;
    default: return <Tag className="w-3.5 h-3.5" />;
  }
};

// Traducir nombre de propiedad según tipo
const getPropertyLabel = (prop: NotionProperty, lang: Language): string => {
  const t = TRANSLATIONS[lang];
  // Para created_time y last_edited_time usamos traducciones específicas
  if (prop.type === 'created_time') return t.propCreated;
  if (prop.type === 'last_edited_time') return t.propEdited;
  // Para otras propiedades, usamos el nombre original de Notion
  return prop.name;
};

const formatDate = (dateStr: string, lang: Language) => {
  try {
    const date = new Date(dateStr);
    const locale = lang === 'es' ? 'es-ES' : 'en-US';
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatDateTime = (dateStr: string, lang: Language) => {
  try {
    const date = new Date(dateStr);
    const locale = lang === 'es' ? 'es-ES' : 'en-US';
    return date.toLocaleDateString(locale, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
};

const PropertiesCard: React.FC<{ properties: NotionProperty[], language: Language }> = ({ properties, language }) => {
  if (!properties || properties.length === 0) return null;
  const t = TRANSLATIONS[language];
  
  return (
    <div className="p-6 bg-gradient-to-br from-surface to-black/40 border-l-4 border-l-primary space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em] opacity-80">{t.propDetails}</span>
      </div>
      {properties.map((prop, idx) => (
        <div key={idx} className="flex items-start gap-3">
          <div className="flex items-center gap-2 min-w-[100px] shrink-0">
            <span className="text-primary/70">{getPropertyIcon(prop.type)}</span>
            <span className="text-[11px] text-gray-400 font-medium truncate">{getPropertyLabel(prop, language)}</span>
          </div>
          <div className="flex-1 flex flex-wrap gap-1.5">
            {prop.type === 'multi_select' && Array.isArray(prop.value) ? (
              prop.value.map((tag: { name: string; color: string }, i: number) => (
                <span 
                  key={i} 
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${notionColorMap[tag.color] || notionColorMap.default}`}
                >
                  {tag.name}
                </span>
              ))
            ) : prop.type === 'select' || prop.type === 'status' ? (
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${notionColorMap[prop.color || 'default']}`}>
                {prop.value}
              </span>
            ) : prop.type === 'date' ? (
              <span className="text-[13px] text-white font-medium">{formatDate(prop.value, language)}</span>
            ) : prop.type === 'created_time' || prop.type === 'last_edited_time' ? (
              <span className="text-[12px] text-gray-300 font-medium">{formatDateTime(prop.value, language)}</span>
            ) : prop.type === 'checkbox' ? (
              <span className={`text-[13px] font-medium ${prop.value ? 'text-emerald-400' : 'text-gray-500'}`}>
                {prop.value ? '✓' : '✗'}
              </span>
            ) : prop.type === 'url' ? (
              <a href={prop.value} target="_blank" rel="noopener noreferrer" className="text-[13px] text-primary hover:underline truncate max-w-[200px]">
                {prop.value}
              </a>
            ) : (
              <span className="text-[13px] text-white font-medium">{String(prop.value)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

interface MediaCardProps {
  item: MediaItem;
  onDragEnd?: (id: string, info: any) => void;
  index?: number;
  orderIndex?: number; // Número de orden basado en Notion
  language?: Language;
}

// Componente para el badge de orden
const OrderBadge: React.FC<{ index: number }> = ({ index }) => (
  <div className="absolute top-0 left-2 z-50 opacity-20 group-hover:opacity-100 transition-opacity duration-300">
    <span className="text-[10px] font-mono font-bold text-emerald-400/60 group-hover:text-emerald-400 bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm transition-all">
      {index}
    </span>
  </div>
);

export const MediaCard: React.FC<MediaCardProps> = ({ item, onDragEnd, orderIndex, language = 'es' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleMouseEnter = () => {
    if (!isInteracting && videoRef.current && item.type === 'video') {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    if (!isInteracting && videoRef.current && item.type === 'video') {
      videoRef.current.pause();
      videoRef.current.currentTime = 0; 
    }
  };

  const handleVideoClick = (e: React.MouseEvent) => {
      if (isDragging) return;
      e.stopPropagation();
      e.preventDefault();
      if (videoRef.current) {
          setIsInteracting(true);
          videoRef.current.controls = true;
          videoRef.current.muted = true; 
          videoRef.current.play().catch(() => {});
      }
  };

  // Detectar si es móvil/touch para deshabilitar drag
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  
  const cardWrapperClasses = `group relative w-full rounded-2xl overflow-hidden bg-surface shadow-md border border-black ${isTouchDevice ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} select-none ${isTouchDevice ? '' : 'touch-none'} transition-colors duration-300 hover:border-white/10`;

  const dragConfig = useMemo(() => ({
    drag: isTouchDevice ? false : true as const,
    dragSnapToOrigin: true,
    dragElastic: 0.1, 
    dragMomentum: false,
    dragListener: !isTouchDevice,
    onDragStart: () => setIsDragging(true),
    onDragEnd: (_event: any, info: any) => {
      // Resetear inmediatamente para liberar el cursor
      setIsDragging(false);
      if (onDragEnd) onDragEnd(item.id, info);
    },
    whileDrag: { 
      scale: 1.02,
      zIndex: 100,
      boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.8)",
      opacity: 0.98,
      cursor: 'grabbing'
    },
    dragTransition: { bounceStiffness: 600, bounceDamping: 25 },
    transition: { type: "spring" as const, stiffness: 600, damping: 30, mass: 0.4 }
  }), [item.id, onDragEnd]);

  const preventNativeDrag = (e: React.DragEvent | React.MouseEvent) => {
    e.preventDefault();
  };

  const renderContent = () => {
    switch (item.type) {
      case 'title':
        return (
          <div className="p-8 bg-gradient-to-br from-surface to-black/40 border-l-4 border-l-primary flex flex-col justify-end min-h-[160px]">
            {item.metadata?.parentTitle && (
              <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em] mb-2 opacity-80 truncate">
                {item.metadata.parentTitle}
              </span>
            )}
            <h1 className="text-3xl md:text-4xl font-black text-white leading-tight tracking-tighter">
              {item.content}
            </h1>
          </div>
        );
      case 'video':
        return (
          <div className="relative w-full bg-black overflow-hidden flex items-center justify-center min-h-[100px]">
            <div 
                className={`w-full h-auto ${isDragging ? 'pointer-events-none' : ''}`}
                onClick={handleVideoClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {!isLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse z-10" />}
                <video 
                    ref={videoRef}
                    src={item.url} 
                    className={`w-full h-auto object-contain transition-opacity duration-500 block ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoadedData={() => setIsLoaded(true)}
                    muted={true}
                    loop={true}
                    playsInline
                    controls={isInteracting}
                    draggable="false"
                />
                {!isInteracting && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <div className={`bg-black/50 p-3 rounded-full backdrop-blur-sm border border-white/10 transition-all duration-300 ${isLoaded ? 'opacity-100 group-hover:scale-110' : 'opacity-0'}`}>
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                        </div>
                    </div>
                )}
            </div>
            {/* Barra de arrastre - solo esta zona permite arrastrar (barra + 4px arriba) */}
            <div className="absolute bottom-0 left-0 w-full h-[10px] cursor-grab active:cursor-grabbing z-30 bg-transparent" />
            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-primary transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left z-20 pointer-events-none" />
            {item.caption && (
                <div className="absolute bottom-0 left-0 w-full p-4 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-gradient-to-t from-black/80 to-transparent pointer-events-none pb-6">
                    <p className="text-white text-xs font-medium line-clamp-2">{item.caption}</p>
                </div>
            )}
          </div>
        );
      case 'youtube':
        const videoId = item.metadata?.videoId || '';
        return (
          <div className="relative w-full bg-black overflow-hidden">
            <div className="relative w-full aspect-video">
              {!isLoaded && (
                <div className="absolute inset-0 bg-zinc-900 animate-pulse flex items-center justify-center">
                  <Youtube className="w-12 h-12 text-red-600/50" />
                </div>
              )}
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?rel=0`}
                title={item.caption || 'YouTube video'}
                className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'} ${isDragging ? 'pointer-events-none' : ''}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={() => setIsLoaded(true)}
              />
              {/* Capa completa durante el arrastre para evitar que el iframe capture eventos */}
              {isDragging && (
                <div className="absolute inset-0 z-40 cursor-grabbing" />
              )}
            </div>
            {/* Barra de arrastre - solo esta zona permite arrastrar (barra + 4px arriba) */}
            <div className="absolute bottom-0 left-0 w-full h-[10px] cursor-grab active:cursor-grabbing z-30 bg-transparent" />
            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-red-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left z-20 pointer-events-none" />
          </div>
        );
      case 'loom':
        const loomVideoId = item.metadata?.videoId || '';
        return (
          <div className="relative w-full bg-black overflow-hidden">
            <div className="relative w-full aspect-video">
              {!isLoaded && (
                <div className="absolute inset-0 bg-zinc-900 animate-pulse flex items-center justify-center">
                  <Play className="w-12 h-12 text-purple-500/50" />
                </div>
              )}
              <iframe
                src={`https://www.loom.com/embed/${loomVideoId}`}
                title={item.caption || 'Loom video'}
                className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'} ${isDragging ? 'pointer-events-none' : ''}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={() => setIsLoaded(true)}
              />
              {/* Capa completa durante el arrastre para evitar que el iframe capture eventos */}
              {isDragging && (
                <div className="absolute inset-0 z-40 cursor-grabbing" />
              )}
            </div>
            {/* Barra de arrastre - solo esta zona permite arrastrar (barra + 4px arriba) */}
            <div className="absolute bottom-0 left-0 w-full h-[10px] cursor-grab active:cursor-grabbing z-30 bg-transparent" />
            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-purple-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left z-20 pointer-events-none" />
          </div>
        );
      case 'canva':
        // Convertir URL de Canva a formato embed
        const canvaOriginalUrl = item.url || item.metadata?.embedUrl || '';
        let canvaEmbedSrc = canvaOriginalUrl;
        
        // Si la URL contiene /design/, convertir a formato embed
        // Formato: https://www.canva.com/design/DESIGN_ID/SHARE_KEY/view
        if (canvaOriginalUrl.includes('/design/')) {
          // Extraer el ID del diseño Y la clave de compartir (ambos son necesarios)
          const designMatch = canvaOriginalUrl.match(/\/design\/([^\/]+)\/([^\/]+)/);
          if (designMatch && designMatch[1] && designMatch[2]) {
            const designId = designMatch[1];
            const shareKey = designMatch[2];
            // Formato embed de Canva: https://www.canva.com/design/DESIGN_ID/SHARE_KEY/view?embed
            canvaEmbedSrc = `https://www.canva.com/design/${designId}/${shareKey}/view?embed`;
          }
        }
        
        return (
          <div className="relative w-full bg-black overflow-hidden">
            <div className="relative w-full aspect-square">
              {!isLoaded && (
                <div className="absolute inset-0 bg-zinc-900 animate-pulse flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 flex items-center justify-center opacity-50">
                    <span className="text-white font-bold text-lg">C</span>
                  </div>
                </div>
              )}
              <iframe
                src={canvaEmbedSrc}
                title={item.caption || 'Canva design'}
                className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                allow="fullscreen"
                allowFullScreen
                onLoad={() => setIsLoaded(true)}
              />
            </div>
            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left z-20" />
          </div>
        );
      case 'image':
        return (
          <div 
            className={`gallery-item block relative bg-black min-h-[150px] w-full cursor-zoom-in overflow-hidden ${isDragging ? 'pointer-events-none' : ''}`}
            data-src={item.url}
            data-sub-html={item.caption ? `<h4>${item.caption}</h4>` : ''}
            onDragStart={preventNativeDrag}
          >
            {!isLoaded && <div className="absolute inset-0 bg-zinc-900 animate-pulse z-0" />}
            <img
                src={item.url}
                alt={item.caption || ''} 
                onLoad={() => setIsLoaded(true)}
                draggable="false" 
                onDragStart={preventNativeDrag}
                className={`w-full h-auto object-cover transition-all duration-500 ease-in-out select-none ${
                  isLoaded ? 'opacity-100 blur-0' : 'opacity-0 blur-sm scale-105'
                }`}
            />
            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-primary transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left z-20" />
            <div className="absolute bottom-0 left-0 w-full p-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 pointer-events-none z-10 mb-1">
                {item.caption && (
                  <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-md inline-block">
                    <p className="text-white text-[10px] font-bold uppercase tracking-wider">{item.caption}</p>
                  </div>
                )}
            </div>
          </div>
        );
      case 'text':
        return <p className="text-gray-200 text-[15px] leading-relaxed whitespace-pre-wrap font-medium p-6">{item.content}</p>;
      case 'file':
        return (
          <div className="p-5 flex items-center gap-4 hover:bg-white/5" onClick={() => !isDragging && window.open(item.url, '_blank')}>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileDown className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate uppercase tracking-tight">{item.metadata?.fileName || 'Archivo'}</p>
              <p className="text-[10px] text-gray-500 font-medium">Click para descargar</p>
            </div>
            <Download className="w-4 h-4 text-gray-500 group-hover:text-primary transition-colors" />
          </div>
        );
      case 'heading':
        const isMain = item.metadata?.level === 1;
        return (
          <div className="p-6 border-l-4 border-l-primary/40">
            <h2 className={`font-bold text-white tracking-tight ${isMain ? 'text-2xl' : 'text-xl'}`}>{item.content}</h2>
          </div>
        );
      case 'code':
        return (
          <>
            <div className="bg-white/5 px-4 py-2 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Code className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">{item.metadata?.language || 'code'}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); if(!isDragging) navigator.clipboard.writeText(item.content || ''); }} className="text-[10px] text-gray-500 hover:text-primary transition-colors uppercase font-bold relative z-10">Copy</button>
            </div>
            <div className="p-4 bg-black/40 overflow-hidden">
                <pre className="text-[13px] font-mono text-emerald-400/90 whitespace-pre-wrap break-words"><code>{item.content}</code></pre>
            </div>
          </>
        );
      case 'link':
        return (
          <div className="p-5 flex flex-col gap-2" onClick={() => !isDragging && window.open(item.url, '_blank')}>
              <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-primary group-hover/link:scale-110 transition-transform" />
                  <span className="text-[11px] text-primary/70 font-bold uppercase tracking-widest truncate">Enlace</span>
              </div>
              <p className="text-white font-medium text-[15px] line-clamp-2 leading-snug group-hover/link:text-primary transition-colors">{item.caption || item.url}</p>
              <div className="h-1 w-0 bg-primary group-hover:w-full transition-all duration-500 mt-2" />
          </div>
        );
      case 'properties':
        return <PropertiesCard properties={item.metadata?.properties || []} language={language} />;
      case 'bulleted_list':
        return (
          <div className="p-5 flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
            <p className="text-gray-200 text-[15px] leading-relaxed">{item.content}</p>
          </div>
        );
      case 'numbered_list':
        return (
          <div className="p-5 flex items-start gap-3">
            <span className="text-primary font-bold text-[15px] min-w-[20px]">{item.metadata?.number || '•'}</span>
            <p className="text-gray-200 text-[15px] leading-relaxed">{item.content}</p>
          </div>
        );
      case 'todo':
        const isChecked = item.metadata?.checked;
        return (
          <div className="p-5 flex items-start gap-3">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
              isChecked ? 'bg-primary border-primary' : 'border-gray-500'
            }`}>
              {isChecked && <CheckSquare2 className="w-3 h-3 text-black" />}
            </div>
            <p className={`text-[15px] leading-relaxed transition-colors ${
              isChecked ? 'text-gray-500 line-through' : 'text-gray-200'
            }`}>{item.content}</p>
          </div>
        );
      case 'quote':
        return (
          <div className="p-6 border-l-4 border-l-gray-500 bg-gradient-to-r from-white/5 to-transparent">
            <div className="flex items-start gap-3">
              <Quote className="w-5 h-5 text-gray-500 shrink-0 mt-1" />
              <p className="text-gray-300 text-[15px] leading-relaxed italic">{item.content}</p>
            </div>
          </div>
        );
      case 'callout':
        const calloutIcon = item.metadata?.icon;
        const calloutColor = item.metadata?.color || 'default';
        const calloutBgMap: Record<string, string> = {
          default: 'bg-gray-500/10 border-gray-500/30',
          gray: 'bg-gray-500/10 border-gray-500/30',
          brown: 'bg-amber-900/20 border-amber-700/30',
          orange: 'bg-orange-500/10 border-orange-500/30',
          yellow: 'bg-yellow-500/10 border-yellow-500/30',
          green: 'bg-emerald-500/10 border-emerald-500/30',
          blue: 'bg-blue-500/10 border-blue-500/30',
          purple: 'bg-purple-500/10 border-purple-500/30',
          pink: 'bg-pink-500/10 border-pink-500/30',
          red: 'bg-red-500/10 border-red-500/30',
          gray_background: 'bg-gray-500/20 border-gray-500/30',
          brown_background: 'bg-amber-900/30 border-amber-700/30',
          orange_background: 'bg-orange-500/20 border-orange-500/30',
          yellow_background: 'bg-yellow-500/20 border-yellow-500/30',
          green_background: 'bg-emerald-500/20 border-emerald-500/30',
          blue_background: 'bg-blue-500/20 border-blue-500/30',
          purple_background: 'bg-purple-500/20 border-purple-500/30',
          pink_background: 'bg-pink-500/20 border-pink-500/30',
          red_background: 'bg-red-500/20 border-red-500/30',
        };
        return (
          <div className={`p-5 border-l-4 ${calloutBgMap[calloutColor] || calloutBgMap.default}`}>
            <div className="flex items-start gap-3">
              {calloutIcon ? (
                calloutIcon.startsWith('http') ? (
                  <img src={calloutIcon} alt="" className="w-6 h-6 shrink-0" />
                ) : (
                  <span className="text-xl shrink-0">{calloutIcon}</span>
                )
              ) : (
                <MessageSquare className="w-5 h-5 text-gray-400 shrink-0" />
              )}
              <p className="text-gray-200 text-[15px] leading-relaxed">{item.content}</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      layout
      {...dragConfig}
      className={cardWrapperClasses}
    >
      {orderIndex !== undefined && <OrderBadge index={orderIndex} />}
      {renderContent()}
    </motion.div>
  );
};

/**
 * Componente para renderizar un grupo de items relacionados en una sola card
 * Preserva el orden de lectura al mostrar heading + contenido relacionado juntos
 */
interface GroupedCardProps {
  items: MediaItem[];
  language?: Language;
  groupId: string;
  orderIndex?: number; // Número de orden basado en Notion
  onDragEnd?: (id: string, info: any) => void;
}

export const GroupedCard: React.FC<GroupedCardProps> = ({ items, language = 'es', groupId, orderIndex, onDragEnd }) => {
  const [isDragging, setIsDragging] = useState(false);
  
  // Detectar si es móvil/touch para deshabilitar drag
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  
  const cardWrapperClasses = `group relative w-full rounded-2xl overflow-hidden bg-gradient-to-br from-surface to-black/40 shadow-md border border-black ${isTouchDevice ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} select-none ${isTouchDevice ? '' : 'touch-none'} transition-colors duration-300 hover:border-white/10`;

  const dragConfig = useMemo(() => ({
    drag: isTouchDevice ? false : true as const,
    dragSnapToOrigin: true,
    dragElastic: 0.1, 
    dragMomentum: false,
    dragListener: !isTouchDevice,
    onDragStart: () => setIsDragging(true),
    onDragEnd: (_event: any, info: any) => {
      // Resetear inmediatamente para liberar el cursor
      setIsDragging(false);
      if (onDragEnd) onDragEnd(groupId, info);
    },
    whileDrag: { 
      scale: 1.02,
      zIndex: 100,
      boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.8)",
      opacity: 0.98,
      cursor: 'grabbing'
    },
    dragTransition: { bounceStiffness: 600, bounceDamping: 25 },
    transition: { type: "spring" as const, stiffness: 600, damping: 30, mass: 0.4 }
  }), [groupId, onDragEnd]);

  const renderGroupItem = (item: MediaItem, index: number, allItems: MediaItem[]) => {
    switch (item.type) {
      case 'heading':
        const level = item.metadata?.level || 2;
        const isFirst = index === 0;
        // Verificar si el siguiente item también es heading (headings apilados)
        const nextItem = allItems[index + 1];
        const isLastHeading = !nextItem || nextItem.type !== 'heading';
        
        // Tamaños según nivel: h1 más grande, h2 mediano, h3 más pequeño
        const sizeClasses = {
          1: 'text-2xl md:text-3xl',
          2: 'text-xl md:text-2xl', 
          3: 'text-lg md:text-xl'
        };
        const textSize = sizeClasses[level as 1 | 2 | 3] || sizeClasses[3];
        
        // Padding ajustado para headings apilados
        const paddingClasses = isFirst 
          ? (isLastHeading ? 'pt-6 pb-3' : 'pt-6 pb-1') 
          : (isLastHeading ? 'pt-1 pb-3' : 'pt-1 pb-1');
        
        return (
          <div key={item.id} className={`px-6 ${paddingClasses} border-l-4 border-l-primary/40`}>
            <h2 className={`font-bold text-white tracking-tight ${textSize}`}>{item.content}</h2>
          </div>
        );
      case 'text':
        return (
          <div key={item.id} className="px-6 py-2">
            <p className="text-gray-200 text-[15px] leading-relaxed whitespace-pre-wrap font-medium">{item.content}</p>
          </div>
        );
      case 'bulleted_list':
        return (
          <div key={item.id} className="px-6 py-1.5 flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
            <p className="text-gray-200 text-[15px] leading-relaxed">{item.content}</p>
          </div>
        );
      case 'numbered_list':
        return (
          <div key={item.id} className="px-6 py-1.5 flex items-start gap-3">
            <span className="text-primary font-bold text-[15px] min-w-[20px]">{item.metadata?.number || '•'}</span>
            <p className="text-gray-200 text-[15px] leading-relaxed">{item.content}</p>
          </div>
        );
      case 'todo':
        const isChecked = item.metadata?.checked;
        return (
          <div key={item.id} className="px-6 py-1.5 flex items-start gap-3">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
              isChecked ? 'bg-primary border-primary' : 'border-gray-500'
            }`}>
              {isChecked && <CheckSquare2 className="w-3 h-3 text-black" />}
            </div>
            <p className={`text-[15px] leading-relaxed transition-colors ${
              isChecked ? 'text-gray-500 line-through' : 'text-gray-200'
            }`}>{item.content}</p>
          </div>
        );
      case 'quote':
        return (
          <div key={item.id} className="mx-6 my-2 p-4 border-l-4 border-l-gray-500 bg-gradient-to-r from-white/5 to-transparent rounded-r-lg">
            <div className="flex items-start gap-3">
              <Quote className="w-4 h-4 text-gray-500 shrink-0 mt-1" />
              <p className="text-gray-300 text-[14px] leading-relaxed italic">{item.content}</p>
            </div>
          </div>
        );
      case 'callout':
        const calloutIcon = item.metadata?.icon;
        const calloutColor = item.metadata?.color || 'default';
        const calloutBgMap: Record<string, string> = {
          default: 'bg-gray-500/10 border-gray-500/30',
          gray: 'bg-gray-500/10 border-gray-500/30',
          brown: 'bg-amber-900/20 border-amber-700/30',
          orange: 'bg-orange-500/10 border-orange-500/30',
          yellow: 'bg-yellow-500/10 border-yellow-500/30',
          green: 'bg-emerald-500/10 border-emerald-500/30',
          blue: 'bg-blue-500/10 border-blue-500/30',
          purple: 'bg-purple-500/10 border-purple-500/30',
          pink: 'bg-pink-500/10 border-pink-500/30',
          red: 'bg-red-500/10 border-red-500/30',
          gray_background: 'bg-gray-500/20 border-gray-500/30',
          brown_background: 'bg-amber-900/30 border-amber-700/30',
          orange_background: 'bg-orange-500/20 border-orange-500/30',
          yellow_background: 'bg-yellow-500/20 border-yellow-500/30',
          green_background: 'bg-emerald-500/20 border-emerald-500/30',
          blue_background: 'bg-blue-500/20 border-blue-500/30',
          purple_background: 'bg-purple-500/20 border-purple-500/30',
          pink_background: 'bg-pink-500/20 border-pink-500/30',
          red_background: 'bg-red-500/20 border-red-500/30',
        };
        return (
          <div key={item.id} className={`mx-6 my-2 p-4 border-l-4 rounded-r-lg ${calloutBgMap[calloutColor] || calloutBgMap.default}`}>
            <div className="flex items-start gap-3">
              {calloutIcon ? (
                calloutIcon.startsWith('http') ? (
                  <img src={calloutIcon} alt="" className="w-5 h-5 shrink-0" />
                ) : (
                  <span className="text-lg shrink-0">{calloutIcon}</span>
                )
              ) : (
                <MessageSquare className="w-4 h-4 text-gray-400 shrink-0" />
              )}
              <p className="text-gray-200 text-[14px] leading-relaxed">{item.content}</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      layout
      {...dragConfig}
      className={cardWrapperClasses}
    >
      {orderIndex !== undefined && <OrderBadge index={orderIndex} />}
      <div className="pb-4">
        {items.map((item, index) => renderGroupItem(item, index, items))}
      </div>
    </motion.div>
  );
};

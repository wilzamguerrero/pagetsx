import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, X, File as FileIcon, FileText, Image as ImageIcon,
  Film, Music, CheckCircle2, Loader2, AlertCircle, Check
} from 'lucide-react';
import { uploadFilesToBoard, FileStatus } from '../services/uploadService';

interface UploadPanelProps {
  boardId: string;
  boardTitle: string;
  onClose: () => void;
  onUploaded: (boardId: string) => void;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp': case 'svg':
      return <ImageIcon className="w-5 h-5 text-primary" />;
    case 'mp4': case 'mov': case 'avi': case 'mkv': case 'webm':
      return <Film className="w-5 h-5 text-accent" />;
    case 'mp3': case 'wav': case 'ogg': case 'flac':
      return <Music className="w-5 h-5 text-pink-400" />;
    case 'pdf': case 'doc': case 'docx': case 'xls': case 'xlsx': case 'ppt': case 'pptx': case 'txt': case 'csv':
      return <FileText className="w-5 h-5 text-amber-400" />;
    default:
      return <FileIcon className="w-5 h-5 text-gray-400" />;
  }
};

export const UploadPanel: React.FC<UploadPanelProps> = ({ boardId, boardTitle, onClose, onUploaded }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statuses, setStatuses] = useState<Record<number, FileStatus>>({});
  const [step, setStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFiles(prev => [...prev, ...Array.from(list)]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragActive(true);
    else if (e.type === 'dragleave') setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleUpload = useCallback(async () => {
    if (files.length === 0 || isUploading) return;
    setIsUploading(true);
    setError(null);
    setStatuses({});
    try {
      await uploadFilesToBoard(
        boardId,
        files,
        (index, status) => setStatuses(prev => ({ ...prev, [index]: status })),
        (s) => setStep(s)
      );
      setDone(true);
      onUploaded(boardId);
      setTimeout(() => onClose(), 900);
    } catch (err: any) {
      setError(err.message || 'Error al subir los archivos.');
    } finally {
      setIsUploading(false);
    }
  }, [files, isUploading, boardId, onUploaded, onClose]);

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const doneCount = Object.values(statuses).filter(s => s === 'done').length;
  const uploadedBytes = files.reduce((acc, f, i) => acc + (statuses[i] === 'done' ? f.size : 0), 0);
  const bytePercent = totalSize ? Math.round((uploadedBytes / totalSize) * 100) : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
        onClick={() => !isUploading && onClose()}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 10 }}
          className="relative w-full max-w-lg bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest leading-none">Subir a</p>
                <p className="text-sm text-white font-semibold truncate leading-tight mt-0.5">{boardTitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Tamaño total a subir */}
              {files.length > 0 && (
                <div className="text-right leading-none">
                  <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Tamaño</p>
                  <p className="text-xs text-white font-mono mt-1">{formatSize(totalSize)}</p>
                </div>
              )}
              {/* Porcentaje ya subido */}
              {(isUploading || done) && (
                <div className="text-right leading-none border-l border-white/10 pl-3">
                  <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Subido</p>
                  <p className="text-xs text-primary font-mono font-bold mt-1">{done ? 100 : bytePercent}%</p>
                </div>
              )}
              <button
                onClick={() => !isUploading && onClose()}
                disabled={isUploading}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-5">
            {/* Dropzone */}
            {!isUploading && !done && (
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all flex flex-col items-center gap-3 ${
                  isDragActive
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : 'border-white/10 hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <div className="p-3 bg-white/5 rounded-xl text-primary">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Arrastra archivos o haz clic</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">Cualquier tipo · hasta 5 GB por archivo</p>
                </div>
              </div>
            )}

            {/* Progress global durante la subida */}
            {isUploading && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                    <p className="text-xs text-gray-300 truncate">{step || 'Subiendo...'}</p>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono shrink-0 ml-2">{doneCount}/{files.length}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    animate={{ width: `${bytePercent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* Lista de archivos (con fade + check al terminar) */}
            {files.length > 0 && !done && (
              <div className={isUploading ? '' : 'mt-4'}>
                {!isUploading && (
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      En cola ({files.length})
                    </span>
                    <span className="text-[10px] text-gray-600 font-mono">{formatSize(totalSize)}</span>
                  </div>
                )}
                <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar pr-0.5">
                  {files.map((file, idx) => {
                    const status = statuses[idx];
                    const isDone = status === 'done';
                    const isBusy = status === 'uploading';
                    return (
                      <motion.div
                        key={`${file.name}-${idx}`}
                        animate={{ opacity: isDone ? 0.4 : 1 }}
                        transition={{ duration: 0.5 }}
                        className={`flex items-center justify-between border p-2.5 rounded-lg group transition-colors ${
                          isDone
                            ? 'bg-primary/5 border-primary/20'
                            : isBusy
                              ? 'bg-white/[0.04] border-primary/20'
                              : 'bg-black/30 border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="p-1.5 bg-white/5 rounded-md shrink-0">{getFileIcon(file.name)}</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-200 truncate">{file.name}</p>
                            <p className="text-[10px] text-gray-500 font-mono">{formatSize(file.size)}</p>
                          </div>
                        </div>

                        {/* Estado a la derecha */}
                        {isDone ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0"
                          >
                            <Check className="w-3.5 h-3.5 text-primary" />
                          </motion.div>
                        ) : isBusy ? (
                          <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                        ) : !isUploading ? (
                          <button
                            onClick={() => removeFile(idx)}
                            className="p-1 rounded-md text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-colors shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <div className="w-4 h-4 shrink-0" />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Done */}
            {done && (
              <div className="flex flex-col items-center gap-2 py-6">
                <CheckCircle2 className="w-10 h-10 text-primary" />
                <p className="text-sm text-white font-semibold">
                  {files.length} archivo{files.length !== 1 ? 's' : ''} subido{files.length !== 1 ? 's' : ''} a Notion
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            {!done && (
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => !isUploading && onClose()}
                  disabled={isUploading}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-gray-400 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-30"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpload}
                  disabled={files.length === 0 || isUploading}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide bg-primary text-black transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 flex items-center justify-center gap-1.5"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isUploading ? 'Subiendo...' : `Subir ${files.length || ''}`}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

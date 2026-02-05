'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, X, Upload, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PDFUploaderProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
  onStatusUpdate: (status: string) => void;
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

export function PDFUploader({
  userId,
  isOpen,
  onClose,
  onUploadComplete,
  onStatusUpdate,
}: PDFUploaderProps) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateStatus = useCallback((newStatus: UploadStatus, message?: string) => {
    setStatus(newStatus);
    if (message) {
      onStatusUpdate(message);
    }
  }, [onStatusUpdate]);

  const handleFileSelect = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('El archivo no puede superar 50MB');
      return;
    }

    setFileName(file.name);
    setError(null);

    try {
      // Step 1: Upload to Storage
      updateStatus('uploading', 'Subiendo documento...');
      setProgress(20);

      const filePath = `${userId}/document.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('user-documents')
        .upload(filePath, file, {
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) {
        throw new Error(`Error al subir: ${uploadError.message}`);
      }

      setProgress(40);

      // Step 2: Register in documents table
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .upsert({
          user_id: userId,
          file_path: filePath,
          processed: false,
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single();

      if (docError) {
        throw new Error(`Error al registrar: ${docError.message}`);
      }

      setProgress(50);

      // Step 3: Trigger processing
      updateStatus('processing', 'Analizando contenido técnico...');
      setProgress(60);

      const { data: processData, error: processError } = await supabase.functions.invoke('process-pdf', {
        body: {
          document_id: docData.id,
          user_id: userId,
        },
      });

      if (processError) {
        throw new Error(`Error al procesar: ${processError.message}`);
      }

      if (!processData?.success) {
        throw new Error(processData?.error || 'Error desconocido al procesar');
      }

      setProgress(100);
      updateStatus('complete', 'Base de conocimiento lista');

      // Wait a moment before closing
      setTimeout(() => {
        onUploadComplete();
        onClose();
        // Reset state
        setStatus('idle');
        setProgress(0);
        setFileName(null);
      }, 1500);

    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      updateStatus('error', 'Error al procesar documento');
      setProgress(0);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && status === 'idle' && onClose()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl w-full max-w-[320px] overflow-hidden shadow-xl"
        >
          {/* Header */}
          <div className="bg-[#075E54] text-white px-4 py-3 flex items-center justify-between">
            <h3 className="font-semibold text-[16px]">Cargar documento</h3>
            {status === 'idle' && (
              <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
                <X size={20} />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="p-4">
            {status === 'idle' && (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-[#00A884] rounded-xl p-6 text-center cursor-pointer hover:bg-[#00A884]/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />
                <Upload className="w-12 h-12 text-[#00A884] mx-auto mb-3" />
                <p className="text-[14px] text-[#3B4A54] font-medium mb-1">
                  Arrastra tu PDF aquí
                </p>
                <p className="text-[12px] text-[#667781]">
                  o haz clic para seleccionar
                </p>
                <p className="text-[11px] text-[#667781] mt-2">
                  Máximo 50MB
                </p>
              </div>
            )}

            {(status === 'uploading' || status === 'processing') && (
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto mb-4 relative">
                  <Loader2 className="w-16 h-16 text-[#00A884] animate-spin" />
                  <FileText className="w-6 h-6 text-[#00A884] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[14px] text-[#3B4A54] font-medium mb-2">
                  {status === 'uploading' ? 'Subiendo...' : 'Analizando documento...'}
                </p>
                {fileName && (
                  <p className="text-[12px] text-[#667781] mb-3 truncate px-4">
                    {fileName}
                  </p>
                )}
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#00A884]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-[11px] text-[#667781] mt-2">
                  {progress}%
                </p>
              </div>
            )}

            {status === 'complete' && (
              <div className="text-center py-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-16 h-16 mx-auto mb-4 bg-[#00A884] rounded-full flex items-center justify-center"
                >
                  <CheckCircle className="w-10 h-10 text-white" />
                </motion.div>
                <p className="text-[14px] text-[#3B4A54] font-medium">
                  Documento procesado
                </p>
                <p className="text-[12px] text-[#667781] mt-1">
                  Base de conocimiento lista
                </p>
              </div>
            )}

            {error && (
              <div className="mt-3 p-3 bg-red-50 rounded-lg">
                <p className="text-[13px] text-red-600">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setStatus('idle');
                  }}
                  className="text-[12px] text-red-700 underline mt-1"
                >
                  Intentar de nuevo
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

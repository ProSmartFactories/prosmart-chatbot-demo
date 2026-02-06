'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, X, Upload, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

interface PDFUploaderProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
  onStatusUpdate: (status: string) => void;
}

type UploadStatus = 'idle' | 'uploading' | 'extracting' | 'processing' | 'complete' | 'error';

interface ExtractedImage {
  page_number: number;
  data: string;
  width: number;
  height: number;
}

export function PDFUploader({
  userId,
  isOpen,
  onClose,
  onUploadComplete,
  onStatusUpdate,
}: PDFUploaderProps) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateStatus = useCallback((newStatus: UploadStatus, message?: string) => {
    setStatus(newStatus);
    if (message) {
      setProgressText(message);
      onStatusUpdate(message);
    }
  }, [onStatusUpdate]);

  // Convert PDF page to image
  const pageToImage = async (page: pdfjsLib.PDFPageProxy, scale: number = 1.5): Promise<string> => {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    // Convert to base64 with quality optimization
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // Extract page images from PDF
  const extractPageImages = async (arrayBuffer: ArrayBuffer): Promise<string[]> => {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageImages: string[] = [];
    const totalPages = pdf.numPages;

    console.log(`Extracting ${totalPages} pages...`);

    for (let i = 1; i <= totalPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const imageData = await pageToImage(page);
        pageImages.push(imageData);

        // Update progress
        const extractProgress = Math.round((i / totalPages) * 30) + 20; // 20-50%
        setProgress(extractProgress);
        setProgressText(`Extrayendo página ${i}/${totalPages}...`);
      } catch (err) {
        console.error(`Error extracting page ${i}:`, err);
      }
    }

    return pageImages;
  };

  // Extract embedded images from PDF (optional, for diagrams)
  const extractEmbeddedImages = async (arrayBuffer: ArrayBuffer): Promise<ExtractedImage[]> => {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const embeddedImages: ExtractedImage[] = [];

    // For now, we'll rely on page images for diagrams
    // Embedded image extraction is complex and may not work in all browsers
    // The Vision API will analyze the page images which include all diagrams

    return embeddedImages;
  };

  const handleFileSelect = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF');
      return;
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 50) {
      setError('El archivo no puede superar 50MB');
      return;
    }

    setFileName(file.name);
    setError(null);

    try {
      // Step 1: Upload to Storage
      updateStatus('uploading', 'Subiendo documento...');
      setProgress(10);

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

      setProgress(20);

      // Step 2: Register in documents table
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .upsert({
          user_id: userId,
          file_path: filePath,
          original_filename: file.name,
          processed: false,
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single();

      if (docError) {
        throw new Error(`Error al registrar: ${docError.message}`);
      }

      // Step 3: Extract page images (client-side)
      updateStatus('extracting', 'Analizando documento...');

      const arrayBuffer = await file.arrayBuffer();
      let pageImages: string[] = [];

      // Only extract page images for reasonable file sizes (< 15MB)
      // Larger files will use the fallback Assistants API
      if (fileSizeMB < 15) {
        try {
          pageImages = await extractPageImages(arrayBuffer);
          console.log(`Extracted ${pageImages.length} page images`);
        } catch (err) {
          console.warn('Could not extract page images, using fallback:', err);
          pageImages = [];
        }
      }

      setProgress(50);

      // Step 4: Trigger processing
      updateStatus('processing', 'Procesando con IA...');
      setProgress(60);

      const requestBody: {
        document_id: string;
        user_id: string;
        page_images?: string[];
      } = {
        document_id: docData.id,
        user_id: userId,
      };

      // Only send page images if we have them (enables Vision processing)
      if (pageImages.length > 0) {
        requestBody.page_images = pageImages;
        setProgressText(`Analizando ${pageImages.length} páginas con IA...`);
      } else {
        setProgressText('Extrayendo texto del documento...');
      }

      const { data: processData, error: processError } = await supabase.functions.invoke('process-pdf', {
        body: requestBody,
      });

      if (processError) {
        throw new Error(`Error al procesar: ${processError.message}`);
      }

      if (!processData?.success) {
        throw new Error(processData?.error || 'Error desconocido al procesar');
      }

      setProgress(100);
      updateStatus('complete', 'Base de conocimiento lista');

      console.log('Processing result:', processData);

      // Wait a moment before closing
      setTimeout(() => {
        onUploadComplete();
        onClose();
        // Reset state
        setStatus('idle');
        setProgress(0);
        setProgressText('');
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
                  Máximo 50MB - Se analizarán texto y diagramas
                </p>
              </div>
            )}

            {(status === 'uploading' || status === 'extracting' || status === 'processing') && (
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto mb-4 relative">
                  <Loader2 className="w-16 h-16 text-[#00A884] animate-spin" />
                  <FileText className="w-6 h-6 text-[#00A884] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[14px] text-[#3B4A54] font-medium mb-2">
                  {status === 'uploading' && 'Subiendo...'}
                  {status === 'extracting' && 'Extrayendo páginas...'}
                  {status === 'processing' && 'Analizando con IA...'}
                </p>
                {progressText && (
                  <p className="text-[12px] text-[#667781] mb-3">
                    {progressText}
                  </p>
                )}
                {fileName && (
                  <p className="text-[11px] text-[#667781] mb-3 truncate px-4">
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
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] text-red-600">{error}</p>
                    <button
                      onClick={() => {
                        setError(null);
                        setStatus('idle');
                        setProgress(0);
                        setProgressText('');
                      }}
                      className="text-[12px] text-red-700 underline mt-1"
                    >
                      Intentar de nuevo
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

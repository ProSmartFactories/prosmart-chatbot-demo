'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, X, Upload, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// pdfjs-dist is loaded dynamically to avoid SSR issues
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;
  }
  return pdfjsLib;
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
  const pageToImage = async (page: any, scale: number = 1.5): Promise<string> => {
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
    const pdfjs = await getPdfJs();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
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
    const pdfjs = await getPdfJs();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
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
    if (fileSizeMB > 10) {
      setError('El archivo no puede superar 10MB');
      return;
    }

    setFileName(file.name);
    setError(null);

    try {
      // Step 1: Upload to Storage
      updateStatus('uploading', 'Subiendo documento...');
      setProgress(5);

      const filePath = `${userId}/document.pdf`;

      // Simulate progress during upload so user sees movement
      let uploadProgress = 5;
      const progressInterval = setInterval(() => {
        uploadProgress = Math.min(uploadProgress + 1, 18);
        setProgress(uploadProgress);
        setProgressText('Subiendo documento...');
      }, 800);

      const { error: uploadError } = await supabase.storage
        .from('user-documents')
        .upload(filePath, file, {
          upsert: true,
          cacheControl: '3600',
        });

      clearInterval(progressInterval);

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

      // Step 3: Extract page images for Vision-based processing
      updateStatus('extracting', 'Convirtiendo páginas a imágenes...');
      setProgress(25);

      let pageImages: string[] = [];
      try {
        setProgressText('Leyendo documento...');
        const arrayBuffer = await file.arrayBuffer();

        setProgressText('Preparando motor de lectura...');
        const pdfjs = await getPdfJs();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const totalPages = Math.min(pdf.numPages, 50); // Limit to 50 pages

        // Reuse a single canvas for all pages (avoids GC pressure)
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;

        for (let i = 1; i <= totalPages; i++) {
          const page = await pdf.getPage(i);
          // Scale 2.0 + JPEG 92% = high resolution for readable figures in chat
          const viewport = page.getViewport({ scale: 2.0 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: context, viewport }).promise;
          const imageData = canvas.toDataURL('image/jpeg', 0.92);
          pageImages.push(imageData);

          const extractProgress = 25 + Math.round((i / totalPages) * 25);
          setProgress(extractProgress);
          setProgressText(`Convirtiendo página ${i}/${totalPages}...`);
        }
        console.log(`Extracted ${pageImages.length} page images`);
      } catch (imgErr) {
        console.warn('Could not extract page images:', imgErr);
        throw new Error('No se pudo leer el PDF. Intenta con otro archivo o desde un navegador de escritorio.');
      }

      if (pageImages.length === 0) {
        throw new Error('No se pudieron extraer páginas del PDF. Verifica que el archivo no esté dañado.');
      }

      // Step 4: Process pages - 4 pages per request, 6 requests in parallel
      updateStatus('processing', 'Procesando con IA...');
      setProgress(55);

      const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-pdf`;
      const PAGES_PER_BATCH = 4;
      const CONCURRENCY = 6;
      let totalChunks = 0;
      let completedPages = 0;

      // Build batches of pages
      const batches: { startIndex: number; count: number }[] = [];
      for (let i = 0; i < pageImages.length; i += PAGES_PER_BATCH) {
        batches.push({
          startIndex: i,
          count: Math.min(PAGES_PER_BATCH, pageImages.length - i),
        });
      }

      const processBatch = async (batch: { startIndex: number; count: number }, isFirst: boolean): Promise<number> => {
        const batchImages = pageImages.slice(batch.startIndex, batch.startIndex + batch.count);
        const maxRetries = 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const response = await fetch(functionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                document_id: docData.id,
                user_id: userId,
                page_images: batchImages,
                batch_index: Math.floor(batch.startIndex / PAGES_PER_BATCH),
                total_batches: batches.length,
                page_offset: batch.startIndex,
                is_first_batch: isFirst,
              }),
            });

            if (!response.ok) {
              console.error(`Batch ${batch.startIndex + 1}-${batch.startIndex + batch.count} error: ${response.status}`);
              if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 2000)); continue; }
              return 0;
            }

            const result = await response.json();
            if (!result?.success) {
              console.error(`Batch failed:`, result?.error);
              if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 2000)); continue; }
              return 0;
            }
            return result.chunks_count || 0;
          } catch (fetchErr) {
            console.error(`Batch fetch error (attempt ${attempt + 1}):`, fetchErr);
            if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 3000)); continue; }
            return 0;
          }
        }
        return 0;
      };

      // First batch alone (clears old data)
      const firstBatch = batches[0];
      setProgressText(`Analizando páginas 1-${firstBatch.count} de ${pageImages.length}...`);
      totalChunks += await processBatch(firstBatch, true);
      completedPages = firstBatch.count;
      setProgress(55 + Math.round((completedPages / pageImages.length) * 40));

      // Remaining batches in parallel groups of CONCURRENCY
      for (let i = 1; i < batches.length; i += CONCURRENCY) {
        const group = batches.slice(i, i + CONCURRENCY);
        const startPage = group[0].startIndex + 1;
        const endPage = group[group.length - 1].startIndex + group[group.length - 1].count;

        setProgressText(`Analizando páginas ${startPage}-${endPage} de ${pageImages.length}...`);

        const results = await Promise.all(group.map(b => processBatch(b, false)));
        for (const chunks of results) {
          totalChunks += chunks;
        }

        completedPages += group.reduce((sum, b) => sum + b.count, 0);
        setProgress(55 + Math.round((completedPages / pageImages.length) * 40));
      }

      console.log(`All ${pageImages.length} pages complete. Total chunks: ${totalChunks}`);

      setProgress(100);
      updateStatus('complete', 'Base de conocimiento lista');

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
                  Máximo 10MB - Se analizarán texto y diagramas
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

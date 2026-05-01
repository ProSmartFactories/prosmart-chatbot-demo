'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCheck, FileText, Download, X, ZoomIn } from 'lucide-react';
import { useState } from 'react';

interface MessageImage {
  url: string;
  caption: string;
  page_number?: number;
}

interface ChatMessageProps {
  type: 'user' | 'bot';
  content: string;
  timestamp: string;
  images?: MessageImage[];
  steps?: string[];
  isTyping?: boolean;
  downloadUrl?: string;
}

// Extract page numbers mentioned in a text string
function extractPageNumbers(text: string): number[] {
  const regex = /p[aá]gina\s+(\d+)/gi;
  const numbers: number[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    numbers.push(parseInt(match[1], 10));
  }
  return numbers;
}

function ImageLightbox({ url, caption, onClose }: { url: string; caption: string; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <motion.img
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          src={url}
          alt={caption}
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
        {caption && (
          <p className="absolute bottom-6 left-0 right-0 text-center text-white/70 text-sm italic px-4">
            {caption}
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function ImageBlock({ img }: { img: MessageImage }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (img.url.startsWith('placeholder')) {
    return (
      <div className="rounded-lg overflow-hidden my-2">
        <div className="relative w-full aspect-video bg-gray-100">
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#128C7E]/10 to-[#25D366]/10">
            <div className="text-center p-4">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-[#128C7E]/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#128C7E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-xs text-[#128C7E] font-medium">
                {img.page_number ? `Página ${img.page_number}` : 'Imagen del documento'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="rounded-lg overflow-hidden my-2 cursor-zoom-in relative group"
        onClick={() => setLightboxOpen(true)}
      >
        <div className="relative bg-white border border-gray-200 rounded-lg">
          <img
            src={img.url}
            alt={img.caption}
            className="max-w-full w-auto mx-auto block object-contain rounded-lg"
            style={{ maxHeight: '260px' }}
            loading="lazy"
          />
          {/* Zoom hint overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
              <ZoomIn className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        {img.caption && (
          <p className="text-[11px] text-[#128C7E] mt-1 italic px-1">
            {img.caption}
          </p>
        )}
      </div>

      {lightboxOpen && (
        <ImageLightbox
          url={img.url}
          caption={img.caption}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

function DocumentCard({ url }: { url: string }) {
  return (
    <a
      href={url}
      download
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg overflow-hidden my-2 border border-[#E0E0E0] hover:border-[#00A884] transition-colors cursor-pointer"
    >
      <div className="bg-gradient-to-r from-[#00A884]/10 to-[#128C7E]/10 p-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-[#E84C3D] flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] text-[#303030] font-medium truncate">
              Manual Técnico MX-340G
            </p>
            <p className="text-[12px] text-[#667781]">
              43 páginas · PDF
            </p>
          </div>
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#00A884] flex items-center justify-center">
            <Download className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>
    </a>
  );
}

export function ChatMessage({ type, content, timestamp, images, steps, isTyping, downloadUrl }: ChatMessageProps) {
  const isUser = type === 'user';
  const hasStepsWithImages = !isUser && steps && steps.length >= 1 && images && images.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-1 px-3`}
    >
      <div
        className={`
          relative max-w-[85%] rounded-lg px-3 py-2 shadow-sm
          ${isUser
            ? 'bg-[#DCF8C6] rounded-tr-none'
            : 'bg-white rounded-tl-none'
          }
        `}
      >
        {/* Message tail */}
        <div
          className={`
            absolute top-0 w-0 h-0
            ${isUser
              ? 'right-[-8px] border-l-[8px] border-l-[#DCF8C6] border-t-[8px] border-t-transparent'
              : 'left-[-8px] border-r-[8px] border-r-white border-t-[8px] border-t-transparent'
            }
          `}
        />

        {/* Message content */}
        {isTyping ? (
          <TypingAnimation />
        ) : (
          <ContentWithInlineImages content={content} />
        )}

        {/* Download card */}
        {downloadUrl && !isTyping && (
          <DocumentCard url={downloadUrl} />
        )}

        {/* Timestamp and read status */}
        {!isTyping && (
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[11px] text-[#667781]">{timestamp}</span>
            {isUser && (
              <CheckCheck size={16} className="text-[#53bdeb]" />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ContentWithInlineImages({ content }: { content: string }) {
  // Parse content for inline image markers: [IMG:url|caption]
  const imgMarkerRegex = /\[IMG:(.*?)\|(.*?)\]/g;
  const hasInlineImages = imgMarkerRegex.test(content);

  if (!hasInlineImages) {
    // No inline images - render plain text
    return (
      <div className="text-[14.5px] text-[#303030] whitespace-pre-wrap break-words leading-[19px]" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
        {content}
      </div>
    );
  }

  // Split content by image markers and render text + images inline
  const parts: Array<{ type: 'text'; value: string } | { type: 'image'; url: string; caption: string }> = [];
  let lastIndex = 0;
  imgMarkerRegex.lastIndex = 0; // Reset regex

  let match;
  while ((match = imgMarkerRegex.exec(content)) !== null) {
    // Add text before this marker
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index).trim();
      if (textBefore) {
        parts.push({ type: 'text', value: textBefore });
      }
    }
    // Add image
    parts.push({ type: 'image', url: match[1], caption: match[2] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last marker
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) {
      parts.push({ type: 'text', value: remaining });
    }
  }

  return (
    <div className="text-[14.5px] text-[#303030] leading-[19px]" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <div key={i} className="whitespace-pre-wrap break-words">
              {part.value}
            </div>
          );
        }
        return (
          <ImageBlock key={i} img={{ url: part.url, caption: part.caption }} />
        );
      })}
    </div>
  );
}

function TypingAnimation() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-[#667781] rounded-full"
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';
import { Check, CheckCheck } from 'lucide-react';
import Image from 'next/image';

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
  isTyping?: boolean;
}

export function ChatMessage({ type, content, timestamp, images, isTyping }: ChatMessageProps) {
  const isUser = type === 'user';

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
          <>
            <div className="text-[14.5px] text-[#303030] whitespace-pre-wrap break-words leading-[19px]" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              {content}
            </div>

            {/* Images */}
            {images && images.length > 0 && (
              <div className="mt-2 space-y-2">
                {images.map((img, index) => (
                  <div key={index} className="rounded-lg overflow-hidden">
                    <div className="relative w-full aspect-video bg-gray-100">
                      {img.url.startsWith('placeholder') ? (
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
                      ) : (
                        <Image
                          src={img.url}
                          alt={img.caption}
                          fill
                          className="object-cover"
                        />
                      )}
                    </div>
                    {img.caption && (
                      <p className="text-[12px] text-gray-600 mt-1 italic px-1">
                        {img.caption}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
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

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { IPhoneFrame } from '@/components/iphone/IPhoneFrame';
import { ChatHeader } from '@/components/whatsapp/ChatHeader';
import { ChatMessage } from '@/components/whatsapp/ChatMessage';
import { ChatInput } from '@/components/whatsapp/ChatInput';
import { SuggestedChips } from '@/components/whatsapp/SuggestedChips';
import { PDFUploader } from '@/components/pdf/PDFUploader';
import { supabase, ChatMessage as ChatMessageType } from '@/lib/supabase';

// Demo user ID (in production, this would come from authentication)
const DEMO_USER_ID = 'demo-user-' + Math.random().toString(36).substring(7);

const INITIAL_MESSAGE: ChatMessageType = {
  id: '1',
  type: 'bot',
  content: 'Hola, soy tu Asistente Técnico de ProSmart Factories.\n\nPara comenzar, sube un documento PDF técnico usando el botón de adjuntar (clip). Una vez procesado, podré responder tus preguntas basándome únicamente en el contenido del documento.',
  timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
};

const SUGGESTIONS = [
  'Explícame este parámetro',
  '¿Qué norma aplica?',
  'Muéstrame un diagrama',
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessageType[]>([INITIAL_MESSAGE]);
  const [isTyping, setIsTyping] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [hasDocument, setHasDocument] = useState(false);
  const [userId] = useState(DEMO_USER_ID);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Check if user has a document
  useEffect(() => {
    const checkDocument = async () => {
      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', userId)
        .eq('processed', true)
        .single();

      if (data) {
        setHasDocument(true);
      }
    };

    checkDocument();
  }, [userId]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Add user message
    const userMessage: ChatMessageType = {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      // Call chat Edge Function
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          message: text,
          user_id: userId,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      // Add bot response
      const botMessage: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: data.raw_response || data.steps?.join('\n\n') || 'No se pudo procesar la respuesta.',
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        images: data.images,
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      console.error('Chat error:', err);

      const errorMessage: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: hasDocument
          ? 'Lo siento, ha ocurrido un error al procesar tu consulta. Por favor, intenta de nuevo.'
          : 'Para poder ayudarte, primero necesitas subir un documento PDF. Usa el botón de adjuntar (clip) para cargar tu manual técnico.',
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  }, [userId, hasDocument]);

  const handleUploadComplete = useCallback(() => {
    setHasDocument(true);

    // Add confirmation message
    const confirmMessage: ChatMessageType = {
      id: Date.now().toString(),
      type: 'bot',
      content: 'Documento procesado correctamente.\n\nBase de conocimiento lista. Ahora puedes hacerme preguntas sobre el contenido del documento y te responderé paso a paso con información precisa.',
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, confirmMessage]);
  }, []);

  const handleStatusUpdate = useCallback((status: string) => {
    // Could update UI with processing status
    console.log('Upload status:', status);
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 md:p-8">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      {/* Logo and title */}
      <div className="absolute top-8 left-8 z-10">
        <h1 className="text-white text-2xl font-bold tracking-tight">
          ProSmart<span className="text-emerald-400">.</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">Technical Assistant Demo</p>
      </div>

      {/* iPhone with WhatsApp */}
      <IPhoneFrame>
        <div className="h-full flex flex-col bg-[#E5DDD5] relative">
          {/* Chat background pattern */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />

          {/* Header */}
          <ChatHeader />

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto py-2 relative z-10">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                type={message.type}
                content={message.content}
                timestamp={message.timestamp}
                images={message.images}
              />
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <ChatMessage
                type="bot"
                content=""
                timestamp=""
                isTyping={true}
              />
            )}

            {/* Suggested chips */}
            {!isTyping && hasDocument && messages.length <= 3 && (
              <SuggestedChips
                suggestions={SUGGESTIONS}
                onSelect={handleSendMessage}
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <ChatInput
            onSend={handleSendMessage}
            onAttach={() => setShowUploader(true)}
            disabled={isTyping}
          />

          {/* PDF Uploader Modal */}
          <PDFUploader
            userId={userId}
            isOpen={showUploader}
            onClose={() => setShowUploader(false)}
            onUploadComplete={handleUploadComplete}
            onStatusUpdate={handleStatusUpdate}
          />
        </div>
      </IPhoneFrame>

      {/* Instructions panel */}
      <div className="hidden lg:block absolute right-8 top-1/2 -translate-y-1/2 max-w-xs">
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <h2 className="text-white font-semibold text-lg mb-4">Cómo usar</h2>
          <ol className="space-y-3 text-slate-300 text-sm">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
              <span>Sube un documento PDF técnico usando el botón de clip</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
              <span>Espera a que se procese el documento</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
              <span>Haz preguntas sobre el contenido y recibe respuestas precisas</span>
            </li>
          </ol>
          <div className="mt-6 pt-4 border-t border-white/10">
            <p className="text-slate-400 text-xs">
              El asistente solo responde con información del documento. No inventa ni asume.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

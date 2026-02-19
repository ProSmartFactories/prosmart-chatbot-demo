'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { IPhoneFrame } from '@/components/iphone/IPhoneFrame';
import { ChatHeader } from '@/components/whatsapp/ChatHeader';
import { ChatMessage } from '@/components/whatsapp/ChatMessage';
import { ChatInput } from '@/components/whatsapp/ChatInput';
import { SuggestedChips } from '@/components/whatsapp/SuggestedChips';
import { PDFUploader } from '@/components/pdf/PDFUploader';
import { supabase, ChatMessage as ChatMessageType } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { LogOut, Shield } from 'lucide-react';

const DEFAULT_SUGGESTIONS = [
  '¿Cada cuánto se hace mantenimiento?',
  '¿Qué aceite usa el sistema hidráulico?',
  '¿Qué normas de seguridad tiene la máquina?',
];

// WhatsApp Chat Container - used in both mobile and desktop
// Each instance manages its own scroll ref so mobile and desktop don't conflict
function WhatsAppChat({
  messages,
  isTyping,
  hasDocument,
  suggestions,
  loadingSuggestions,
  onSendMessage,
  onAttach,
  showUploader,
  onCloseUploader,
  onUploadComplete,
  onStatusUpdate,
  userId,
  onLogout,
  userName,
}: {
  messages: ChatMessageType[];
  isTyping: boolean;
  hasDocument: boolean;
  suggestions: string[];
  loadingSuggestions: boolean;
  onSendMessage: (text: string) => void;
  onAttach: () => void;
  showUploader: boolean;
  onCloseUploader: () => void;
  onUploadComplete: () => void;
  onStatusUpdate: (status: string) => void;
  userId: string;
  onLogout?: () => void;
  userName?: string;
}) {
  // Each WhatsAppChat instance has its own ref - this fixes the mobile/desktop conflict
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    // Immediate
    container.scrollTop = container.scrollHeight;
    // After next paint
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      // After layout recalculation
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    });
    // Delayed for long content / images
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 300);
  }, []);

  // Scroll on new messages and typing changes
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  return (
    <div className="h-full flex flex-col bg-[#E5DDD5] relative overflow-hidden">
      {/* Chat background pattern */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Header - never shrinks */}
      <div className="flex-shrink-0 relative z-10">
        <ChatHeader onLogout={onLogout} userName={userName} />
      </div>

      {/* Messages area - scrollable, takes remaining space */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto py-2 relative z-10">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            type={message.type}
            content={message.content}
            timestamp={message.timestamp}
            images={message.images}
            steps={message.steps}
            downloadUrl={message.downloadUrl}
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
        {!isTyping && !loadingSuggestions && hasDocument && messages.length <= 5 && (
          <SuggestedChips
            suggestions={suggestions}
            onSelect={onSendMessage}
          />
        )}
      </div>

      {/* Input area - never shrinks, always visible */}
      <div className="flex-shrink-0 relative z-10">
        <ChatInput
          onSend={onSendMessage}
          onAttach={onAttach}
          disabled={isTyping}
        />
      </div>

      {/* PDF Uploader Modal */}
      <PDFUploader
        userId={userId}
        isOpen={showUploader}
        onClose={onCloseUploader}
        onUploadComplete={onUploadComplete}
        onStatusUpdate={onStatusUpdate}
      />
    </div>
  );
}

export default function Home() {
  const { user, profile, loading, signOut, passwordRecovery } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [hasDocument, setHasDocument] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Redirect: password recovery takes priority, then auth check
  useEffect(() => {
    if (!loading && passwordRecovery) {
      router.replace('/reset-password');
    } else if (!loading && (!user || !profile)) {
      router.replace('/login');
    }
  }, [user, profile, loading, router, passwordRecovery]);

  // Set initial messages when user is loaded
  useEffect(() => {
    if (user && profile) {
      const now = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

      setMessages([
        {
          id: '1',
          type: 'bot',
          content: `¡Hola ${profile.name.split(' ')[0]}! Soy tu Encargado Digital de Pro Smart Factories.\n\nHe analizado el Manual Técnico de la punzonadora MX-340G y estoy listo para ayudarte con mantenimiento, operación y especificaciones técnicas.`,
          timestamp: now,
        },
        {
          id: '2',
          type: 'bot',
          content: 'Aquí tienes el manual para que lo tengas como referencia. Pregúntame lo que necesites sobre su contenido.',
          timestamp: now,
          downloadUrl: '/manual-tecnico.pdf',
        },
      ]);
    }
  }, [user, profile]);

  // Document is pre-loaded for demo - no need to check

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !user) return;

    // Add user message
    const userMessage: ChatMessageType = {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    // Create timeout to prevent infinite typing
    const timeoutId = setTimeout(() => {
      setIsTyping(false);
      const timeoutMessage: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: 'La solicitud está tardando demasiado. Por favor, intenta de nuevo.',
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, timeoutMessage]);
    }, 60000); // 60 second timeout

    try {
      // Call chat Edge Function directly via fetch
      const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          message: text,
          user_id: user.id,
        }),
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        console.error('Chat function error:', data);
        throw new Error(data?.error || `Error ${response.status}`);
      }

      if (!data) {
        throw new Error('No response data received');
      }

      // Add bot response with steps for inline image matching
      const botMessage: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: data.raw_response || data.steps?.join('\n\n') || 'No se pudo procesar la respuesta.',
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        images: data.images,
        steps: data.steps,
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      clearTimeout(timeoutId);
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
  }, [user, hasDocument]);

  const handleUploadComplete = useCallback(async () => {
    setHasDocument(true);

    const confirmMessage: ChatMessageType = {
      id: Date.now().toString(),
      type: 'bot',
      content: 'Documento procesado correctamente.\n\nBase de conocimiento actualizada. Puedes hacerme preguntas sobre el nuevo contenido.',
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, confirmMessage]);
  }, []);

  const handleStatusUpdate = useCallback((status: string) => {
    console.log('Upload status:', status);
  }, []);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  // Show loading while checking auth, or redirect spinner while navigating to login
  if (loading || !user || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Chat props shared between mobile and desktop
  const chatProps = {
    messages,
    isTyping,
    hasDocument,
    suggestions,
    loadingSuggestions,
    onSendMessage: handleSendMessage,
    onAttach: () => setShowUploader(true),
    showUploader,
    onCloseUploader: () => setShowUploader(false),
    onUploadComplete: handleUploadComplete,
    onStatusUpdate: handleStatusUpdate,
    userId: user.id,
    onLogout: handleLogout,
    userName: profile?.name,
  };

  return (
    <>
      {/* MOBILE VIEW - Fullscreen WhatsApp (no mockup) */}
      <div className="lg:hidden fixed inset-0 flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
        {/* Mobile status bar area - matches device status bar */}
        <div className="flex-shrink-0 bg-[#075E54] h-[env(safe-area-inset-top,0px)]" />

        {/* WhatsApp fullscreen */}
        <div className="flex-1 min-h-0 flex flex-col">
          <WhatsAppChat {...chatProps} />
        </div>

        {/* Mobile bottom safe area */}
        <div className="flex-shrink-0 bg-[#F0F2F5] h-[env(safe-area-inset-bottom,0px)]" />
      </div>

      {/* DESKTOP VIEW - iPhone mockup with WhatsApp inside */}
      <main className="hidden lg:flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 items-center justify-center p-8">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl" />
        </div>

        {/* Header with logo and branding */}
        <div className="absolute top-8 left-8 z-10 flex items-center gap-3">
          <img src="/logo-psf.png" alt="Pro Smart Factories" className="w-12 h-12 object-contain" />
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tight">
              Pro Smart Factories
            </h1>
            <p className="text-orange-400 text-sm mt-1 font-medium">Encargado Digital</p>
          </div>
        </div>

        {/* User info and logout */}
        <div className="absolute top-8 right-8 z-10 flex items-center gap-4">
          <div className="text-right">
            <p className="text-white font-medium">{profile?.name}</p>
            <p className="text-slate-400 text-sm">{profile?.company}</p>
          </div>
          {isAdminEmail(user?.email) && (
            <button
              onClick={() => router.push('/admin')}
              className="p-2 rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 transition-colors border border-orange-500/20"
              title="Panel de Administración"
            >
              <Shield className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={handleLogout}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* iPhone with WhatsApp - no logout/userName (handled by outer UI) */}
        <IPhoneFrame>
          <WhatsAppChat {...chatProps} onLogout={undefined} userName={undefined} />
        </IPhoneFrame>

        {/* Instructions panel */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 max-w-xs">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h2 className="text-white font-semibold text-lg mb-4">Cómo usar</h2>
            <ol className="space-y-3 text-slate-300 text-sm">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <span>Descarga el manual técnico de la punzonadora</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <span>Revisa el contenido del documento</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <span>Pregunta al asistente lo que necesites</span>
              </li>
            </ol>
            <div className="mt-6 pt-4 border-t border-white/10">
              <p className="text-slate-400 text-xs">
                El asistente responde únicamente con información del manual técnico. No inventa ni asume datos.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

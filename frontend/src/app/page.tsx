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
import { LogOut } from 'lucide-react';

const DEFAULT_SUGGESTIONS = [
  'Explica el contenido principal',
  'Resume los puntos clave',
  'Describe el procedimiento',
];

// WhatsApp Chat Container - used in both mobile and desktop
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
  messagesEndRef,
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
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onLogout?: () => void;
  userName?: string;
}) {
  return (
    <div className="h-full flex flex-col bg-[#E5DDD5] relative">
      {/* Chat background pattern */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Header */}
      <ChatHeader onLogout={onLogout} userName={userName} />

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
        {!isTyping && !loadingSuggestions && hasDocument && messages.length <= 3 && (
          <SuggestedChips
            suggestions={suggestions}
            onSelect={onSendMessage}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatInput
        onSend={onSendMessage}
        onAttach={onAttach}
        disabled={isTyping}
      />

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
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [hasDocument, setHasDocument] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Set initial message when user is loaded
  useEffect(() => {
    if (user && profile) {
      const greeting = `Hola ${profile.name.split(' ')[0]}, soy tu Encargado Digital de Pro Smart Factories.\n\nPara comenzar, sube un documento PDF técnico usando el botón de adjuntar (clip). Una vez procesado, podré responder tus preguntas basándome únicamente en el contenido del documento.`;

      setMessages([{
        id: '1',
        type: 'bot',
        content: greeting,
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      }]);
    }
  }, [user, profile]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Check if user has a document
  useEffect(() => {
    if (!user) return;

    const checkDocument = async () => {
      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .eq('processed', true)
        .single();

      if (data) {
        setHasDocument(true);
        // Also fetch suggestions if document exists
        fetchSuggestions();
      }
    };

    const fetchSuggestions = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('generate-suggestions', {
          body: { user_id: user.id },
        });
        if (!error && data?.success && data?.suggestions) {
          setSuggestions(data.suggestions);
        }
      } catch (err) {
        console.error('Error fetching suggestions:', err);
      }
    };

    checkDocument();
  }, [user]);

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
      // Call chat Edge Function
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          message: text,
          user_id: user.id,
        },
      });

      clearTimeout(timeoutId);

      if (error) {
        throw new Error(typeof error === 'object' ? JSON.stringify(error) : String(error));
      }

      if (!data) {
        throw new Error('No response data received');
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

    // Add confirmation message
    const confirmMessage: ChatMessageType = {
      id: Date.now().toString(),
      type: 'bot',
      content: 'Documento procesado correctamente.\n\nBase de conocimiento lista. Ahora puedes hacerme preguntas sobre el contenido del documento y te responderé paso a paso con información precisa.',
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, confirmMessage]);

    // Generate dynamic suggestions from the PDF
    if (user) {
      setLoadingSuggestions(true);
      try {
        const { data, error } = await supabase.functions.invoke('generate-suggestions', {
          body: { user_id: user.id },
        });

        if (!error && data?.success && data?.suggestions) {
          setSuggestions(data.suggestions);
        }
      } catch (err) {
        console.error('Error fetching suggestions:', err);
      } finally {
        setLoadingSuggestions(false);
      }
    }
  }, [user]);

  const handleStatusUpdate = useCallback((status: string) => {
    console.log('Upload status:', status);
  }, []);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  // Show loading while checking auth
  if (loading || !user) {
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
    messagesEndRef: messagesEndRef as React.RefObject<HTMLDivElement>,
    onLogout: handleLogout,
    userName: profile?.name,
  };

  return (
    <>
      {/* MOBILE VIEW - Fullscreen WhatsApp (no mockup) */}
      <div className="lg:hidden fixed inset-0 flex flex-col">
        {/* Mobile status bar area - matches device status bar */}
        <div className="bg-[#075E54] h-[env(safe-area-inset-top,0px)]" />

        {/* WhatsApp fullscreen */}
        <div className="flex-1 flex flex-col">
          <WhatsAppChat {...chatProps} />
        </div>

        {/* Mobile bottom safe area */}
        <div className="bg-[#F0F0F0] h-[env(safe-area-inset-bottom,0px)]" />
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
          <button
            onClick={handleLogout}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* iPhone with WhatsApp */}
        <IPhoneFrame>
          <WhatsAppChat {...chatProps} />
        </IPhoneFrame>

        {/* Instructions panel */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 max-w-xs">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h2 className="text-white font-semibold text-lg mb-4">Cómo usar</h2>
            <ol className="space-y-3 text-slate-300 text-sm">
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <span>Sube un documento PDF técnico usando el botón de clip</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <span>Espera a que se procese el documento</span>
              </li>
              <li className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
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
    </>
  );
}

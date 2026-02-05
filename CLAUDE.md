# CLAUDE.md - ProSmart Chatbot Demo

## Objetivo del proyecto
Construir una **aplicación demo completa y funcional en producción** de un chatbot técnico RAG que demuestre el valor de ProSmart Factories. La aplicación debe:

- **Backend serverless** con Supabase (Auth OTP, PostgreSQL + pgvector, Storage, Edge Functions)
- **Frontend hiperrealista** que simula un iPhone 17 Pro Max en 3D ejecutando WhatsApp móvil
- **Chatbot RAG avanzado** que responde preguntas técnicas usando PDFs cargados por el usuario, mostrando texto paso a paso + imágenes extraídas del documento
- **Calidad producción**: código limpio, escalable, seguro y optimizado

## Herramientas disponibles

**Para desarrollo fullstack:**
- Skills fullstack: https://github.com/Jeffallan/claude-skills  
  _(Usar cuando sea conveniente para componentes específicos, patrones de diseño, etc.)_

**Para orquestación del desarrollo:**
- Agentes multi-fullstack: https://github.com/wshobson/agents  
  _(Usar para coordinar tareas complejas, planificación de arquitectura, y desarrollo de features end-to-end)_

## Lo que espero de ti

Desarrollarás esta aplicación siguiendo este orden estricto:

### **FASE 1: Backend Supabase** ✅
1. Diseñar y crear todas las tablas PostgreSQL con RLS
2. Configurar Storage buckets (PDFs e imágenes)
3. Implementar Edge Functions (procesamiento PDF, chat RAG)
4. Configurar autenticación (Email + Password + OTP)
5. Probar todo el backend de forma aislada

### **FASE 2: Frontend Next.js** 🎨
1. Crear componente iPhone 17 Pro Max 3D hiperrealista
2. Implementar UI WhatsApp móvil pixel-perfect
3. Construir sistema de autenticación (login, OTP, onboarding)
4. Desarrollar interfaz de chat interactiva (burbujas, imágenes, animaciones)
5. Implementar upload de PDF con simulación nativa iOS

### **FASE 3: Integración completa** 🔗
1. Conectar frontend con Edge Functions
2. Implementar flujo completo end-to-end
3. Optimizar rendimiento y UX
4. Testing exhaustivo
5. Preparar para deployment

## Especificaciones técnicas completas

### STACK OBLIGATORIO

| Componente | Tecnología |
|------------|-----------|
| Backend | Supabase (serverless) |
| Autenticación | Supabase Auth (Email + OTP) |
| Base de datos | PostgreSQL + pgvector |
| Storage | Supabase Storage |
| Edge Functions | Deno (Supabase) |
| IA | OpenAI API (embeddings + chat) |
| Frontend | Next.js 14/15 (App Router) |
| UI Framework | React 18+ + TypeScript |
| Styling | Tailwind CSS |
| 3D Graphics | Three.js + React Three Fiber |
| Animaciones | Framer Motion |

---

## FASE 1: BACKEND SUPABASE

### 1. AUTENTICACIÓN

#### 1.1 Configuración Supabase Auth
- Proveedor: **Email** (habilitado)
- OTP: **Email de 6 dígitos**
- SMTP: **Hostinger corporativo** (configuración ya lista)

#### 1.2 Flujo de autenticación

**Paso 1: Registro/Login inicial**
```
Usuario → introduce email + password
↓
Supabase Auth → crea usuario
↓
Envía email verificación vía SMTP Hostinger
```

**Paso 2: Verificación OTP**
```
Usuario → solicita OTP
↓
Supabase → genera código 6 dígitos
↓
Envía email HTML personalizado vía SMTP
↓
Usuario → introduce código
↓
Sesión validada ✓
```

**Paso 3: Onboarding**
```
Usuario nuevo → solicita Nombre + Empresa
↓
Guarda en tabla `profiles`
```

---

### 2. ESQUEMA DE BASE DE DATOS

#### 2.1 Tabla `profiles`
```sql
create table profiles (
  id uuid references auth.users on delete cascade,
  name text not null,
  company text not null,
  created_at timestamp default now(),
  primary key (id)
);

-- RLS: Solo el usuario puede ver/editar su perfil
alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);
```

---

#### 2.2 Tabla `documents`
**Restricción crítica**: UN SOLO PDF por usuario

```sql
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  file_path text not null,
  processed boolean default false,
  created_at timestamp default now(),
  
  -- Constraint: solo 1 documento activo por usuario
  unique(user_id)
);

-- RLS
alter table documents enable row level security;

create policy "Users can manage own documents"
  on documents for all
  using (auth.uid() = user_id);
```

---

#### 2.3 Tabla `document_chunks` (Base vectorial)
```sql
-- Habilitar extensión pgvector
create extension if not exists vector;

create table document_chunks (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade,
  document_id uuid references documents on delete cascade,
  content text not null,
  embedding vector(1536),
  created_at timestamp default now()
);

-- Índice para búsqueda vectorial
create index on document_chunks 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- RLS
alter table document_chunks enable row level security;

create policy "Users can view own chunks"
  on document_chunks for select
  using (auth.uid() = user_id);
```

---

#### 2.4 Tabla `document_images`
```sql
create table document_images (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade,
  document_id uuid references documents on delete cascade,
  page_number int not null,
  image_url text not null,
  context text, -- Texto cercano a la imagen
  embedding vector(1536), -- Embedding del contexto
  created_at timestamp default now()
);

-- Índice vectorial para búsqueda de imágenes por contexto
create index on document_images 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- RLS
alter table document_images enable row level security;

create policy "Users can view own images"
  on document_images for select
  using (auth.uid() = user_id);
```

---

### 3. STORAGE BUCKETS

#### 3.1 Bucket `user-documents` (PDFs)
```sql
-- Crear bucket privado
insert into storage.buckets (id, name, public)
values ('user-documents', 'user-documents', false);

-- Política de acceso
create policy "Users can upload own PDFs"
on storage.objects for insert
with check (
  bucket_id = 'user-documents' 
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can view own PDFs"
on storage.objects for select
using (
  bucket_id = 'user-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can delete own PDFs"
on storage.objects for delete
using (
  bucket_id = 'user-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);
```

**Estructura de archivos**:
```
user-documents/
  {user_id}/
    document.pdf  ← Solo 1 PDF por usuario
```

---

#### 3.2 Bucket `document-images` (Imágenes extraídas)
```sql
-- Crear bucket privado
insert into storage.buckets (id, name, public)
values ('document-images', 'document-images', false);

-- Políticas similares al bucket de documentos
```

**Estructura de archivos**:
```
document-images/
  {user_id}/
    {document_id}/
      page_1_image_1.png
      page_1_image_2.png
      page_2_image_1.png
      ...
```

---

### 4. EDGE FUNCTIONS

#### 4.1 Edge Function: `process-pdf`

**Trigger**: Se ejecuta cuando el usuario sube un PDF nuevo

**Pasos del procesamiento**:

1. **Descargar PDF** desde Supabase Storage
2. **Extraer texto completo** (usando `pdf-parse` o similar)
3. **Extraer imágenes embebidas** (usando `pdf-lib` o `pdfjs`)
4. **Asociar imágenes a contexto textual**:
   - Identificar texto cercano a cada imagen
   - Guardar contexto en `document_images.context`
5. **Dividir texto en chunks semánticos**:
   - Tamaño: ~500-1000 tokens
   - Overlap: ~100 tokens
   - Preservar párrafos y secciones técnicas completas
6. **Generar embeddings**:
   - Texto chunks → OpenAI `text-embedding-3-small`
   - Contextos de imágenes → embeddings también
7. **Eliminar datos previos** del usuario:
   - `DELETE FROM document_chunks WHERE user_id = ...`
   - `DELETE FROM document_images WHERE user_id = ...`
   - Eliminar imágenes del Storage
8. **Insertar nuevos datos**:
   - Chunks con embeddings → `document_chunks`
   - Imágenes con URLs y embeddings → `document_images`
9. **Marcar documento como procesado**:
   - `UPDATE documents SET processed = true WHERE id = ...`

**Estructura de respuesta**:
```typescript
{
  success: boolean;
  message: string;
  chunks_count: number;
  images_count: number;
}
```

---

#### 4.2 Edge Function: `chat`

**Input**:
```typescript
{
  message: string;
  user_id: string;
}
```

**Pasos del flujo RAG**:

1. **Generar embedding** de la pregunta del usuario
   ```typescript
   const questionEmbedding = await openai.embeddings.create({
     model: "text-embedding-3-small",
     input: message
   });
   ```

2. **Buscar chunks relevantes** (búsqueda vectorial)
   ```sql
   SELECT content
   FROM document_chunks
   WHERE user_id = :user_id
   ORDER BY embedding <-> :question_embedding
   LIMIT 5;
   ```

3. **Buscar imágenes relevantes** (búsqueda vectorial por contexto)
   ```sql
   SELECT image_url, context, page_number
   FROM document_images
   WHERE user_id = :user_id
   ORDER BY embedding <-> :question_embedding
   LIMIT 3;
   ```

4. **Construir contexto técnico**
   ```typescript
   const context = `
   INFORMACIÓN DEL DOCUMENTO:
   ${chunks.map(c => c.content).join('\n\n')}
   
   IMÁGENES DISPONIBLES:
   ${images.map(img => `[Página ${img.page_number}] ${img.context}`).join('\n')}
   `;
   ```

5. **Consultar OpenAI Chat Completion**
   ```typescript
   const completion = await openai.chat.completions.create({
     model: "gpt-4-turbo",
     messages: [
       { role: "system", content: SYSTEM_PROMPT },
       { role: "user", content: `CONTEXTO:\n${context}\n\nPREGUNTA:\n${message}` }
     ]
   });
   ```

6. **Construir respuesta estructurada**

**Output**:
```typescript
{
  steps: string[];           // Pasos de la explicación
  images: Array<{
    url: string;
    caption: string;
    page_number: number;
  }>;
  raw_response: string;      // Respuesta completa de GPT
}
```

---

#### 4.3 PROMPT DEL SISTEMA (CRÍTICO)

```typescript
const SYSTEM_PROMPT = `Eres un ASISTENTE TÉCNICO SENIOR especializado en documentación técnica.

REGLAS ABSOLUTAS:
- Responde ÚNICAMENTE usando la información contenida en el documento del usuario.
- NO inventes, NO completes con suposiciones, NO extrapoles.
- Si la información no está en el documento, indícalo explícitamente.
- Nunca alucines ni aportes conocimiento externo.

FORMA DE RESPUESTA OBLIGATORIA:
- Explica SIEMPRE paso a paso.
- Cada paso debe ser claro, técnico y preciso.
- Cuando exista una imagen, diagrama o figura relevante en el documento:
  - Menciónala y referénciala claramente.
  - La imagen se mostrará automáticamente después del paso correspondiente.

ESTILO:
- Tono profesional y técnico.
- Claridad absoluta.
- Lenguaje de ingeniero senior.
- Nada genérico.

Si el usuario pide algo fuera del alcance del documento:
- Responde: "La información solicitada no está presente en el documento proporcionado."

FORMATO DE SALIDA:
Estructura tu respuesta en pasos numerados claros. Cuando menciones una imagen, usa el formato:
"[VER IMAGEN: descripción breve]"
`;
```

---

### 5. SEGURIDAD

✅ **Row Level Security (RLS)** habilitado en todas las tablas  
✅ Cada usuario solo accede a sus propios datos  
✅ OpenAI API Key **solo en Edge Functions** (variable de entorno)  
✅ Storage buckets **privados** con políticas estrictas  
✅ Validación de tipos y sanitización de inputs  

---

## FASE 2: FRONTEND NEXT.JS

### 1. ARQUITECTURA DEL PROYECTO

```
prosmart-chatbot-demo/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   ├── verify-otp/
│   │   └── onboarding/
│   ├── demo/
│   │   └── page.tsx          # Página principal de la demo
│   ├── layout.tsx
│   └── page.tsx               # Landing/redirect
├── components/
│   ├── iphone/
│   │   ├── IPhoneFrame.tsx   # Mockup 3D del iPhone
│   │   └── Screen.tsx         # Contenedor de la pantalla
│   ├── whatsapp/
│   │   ├── ChatHeader.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInput.tsx
│   │   ├── ImageMessage.tsx
│   │   └── TypingIndicator.tsx
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── OTPInput.tsx
│   │   └── OnboardingForm.tsx
│   └── pdf/
│       └── PDFUploader.tsx
├── lib/
│   ├── supabase.ts           # Cliente Supabase
│   ├── openai.ts             # Helpers OpenAI
│   └── utils.ts
└── public/
    └── assets/
```

---

### 2. COMPONENTE IPHONE 17 PRO MAX 3D

#### 2.1 Requisitos visuales

**Características obligatorias**:
- ✅ Render 3D hiperrealista del dispositivo (frame, bordes, cámara, notch)
- ✅ Sombra realista proyectada
- ✅ Efecto parallax sutil al mover el mouse
- ✅ Escala responsive (mantiene proporciones en todos los tamaños)
- ✅ Reflejo y brillo en los bordes metálicos

**Opciones técnicas**:
1. **Three.js + React Three Fiber** (para máximo realismo 3D)
2. **SVG + CSS avanzado** (más ligero, suficiente para efecto premium)

**Decisión recomendada**: SVG + CSS (optimizado para web, carga rápida)

---

#### 2.2 Estructura del componente

```tsx
// components/iphone/IPhoneFrame.tsx
'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function IPhoneFrame({ children }: { children: React.ReactNode }) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Parallax tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <motion.div
      className="relative"
      style={{
        rotateY: mousePosition.x,
        rotateX: -mousePosition.y,
      }}
      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
    >
      {/* Frame del iPhone */}
      <div className="relative w-[400px] h-[820px] bg-gradient-to-br from-gray-800 to-gray-900 rounded-[60px] p-4 shadow-2xl">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[30px] bg-black rounded-b-3xl z-20" />
        
        {/* Pantalla */}
        <div className="relative w-full h-full bg-white rounded-[50px] overflow-hidden">
          {children}
        </div>
        
        {/* Botones laterales */}
        <div className="absolute left-[-3px] top-[120px] w-[3px] h-[60px] bg-gray-700 rounded-l" />
        <div className="absolute right-[-3px] top-[180px] w-[3px] h-[80px] bg-gray-700 rounded-r" />
      </div>
      
      {/* Sombra */}
      <div className="absolute inset-0 -z-10 blur-3xl opacity-30 bg-gradient-to-b from-transparent to-black transform translate-y-8" />
    </motion.div>
  );
}
```

---

### 3. UI WHATSAPP MÓVIL

#### 3.1 Principios de diseño

**❌ NO hacer**:
- WhatsApp Web
- Mockup plano genérico
- Interfaz desktop

**✅ SÍ hacer**:
- UI **idéntica** a WhatsApp iOS nativo
- Píxel-perfect con la app móvil real
- Animaciones suaves y realistas
- Sensación de "esto ya está en producción"

---

#### 3.2 Componentes clave

**ChatHeader.tsx** (Header superior)
```tsx
export function ChatHeader() {
  return (
    <div className="bg-[#128C7E] text-white px-4 py-3 flex items-center gap-3">
      <button className="p-1">
        <ChevronLeft size={24} />
      </button>
      <div className="w-10 h-10 rounded-full bg-gray-300 overflow-hidden">
        <img src="/bot-avatar.png" alt="Bot" />
      </div>
      <div className="flex-1">
        <div className="font-semibold">Asistente Técnico</div>
        <div className="text-xs opacity-80">en línea</div>
      </div>
      <button className="p-1">
        <MoreVertical size={20} />
      </button>
    </div>
  );
}
```

---

**ChatMessage.tsx** (Burbujas de mensaje)
```tsx
type MessageType = 'user' | 'bot';

interface Message {
  type: MessageType;
  content: string;
  timestamp: string;
  images?: Array<{
    url: string;
    caption: string;
  }>;
}

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.type === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 px-4`}>
      <div className={`max-w-[75%] ${isUser ? 'bg-[#DCF8C6]' : 'bg-white'} rounded-lg p-3 shadow-sm`}>
        {/* Contenido del mensaje */}
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        
        {/* Imágenes si existen */}
        {message.images?.map((img, i) => (
          <div key={i} className="mt-2">
            <img 
              src={img.url} 
              alt={img.caption}
              className="rounded-lg w-full cursor-pointer hover:opacity-90"
            />
            <p className="text-xs text-gray-600 mt-1 italic">{img.caption}</p>
          </div>
        ))}
        
        {/* Timestamp + check */}
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[10px] text-gray-500">{message.timestamp}</span>
          {isUser && <Check size={14} className="text-blue-500" />}
        </div>
      </div>
    </div>
  );
}
```

---

**ChatInput.tsx** (Barra inferior)
```tsx
export function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');

  return (
    <div className="bg-[#F0F0F0] px-4 py-2 flex items-center gap-2">
      <button className="p-2">
        <Smile size={24} className="text-gray-600" />
      </button>
      
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribe un mensaje"
        className="flex-1 bg-white rounded-full px-4 py-2 text-sm focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            onSend(text);
            setText('');
          }
        }}
      />
      
      {text.trim() ? (
        <button 
          onClick={() => {
            onSend(text);
            setText('');
          }}
          className="p-2"
        >
          <Send size={24} className="text-[#128C7E]" />
        </button>
      ) : (
        <button className="p-2">
          <Mic size={24} className="text-gray-600" />
        </button>
      )}
    </div>
  );
}
```

---

**TypingIndicator.tsx** (Indicador de escritura)
```tsx
export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3 px-4">
      <div className="bg-white rounded-lg p-3 shadow-sm flex gap-1">
        <motion.div
          className="w-2 h-2 bg-gray-400 rounded-full"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ repeat: Infinity, duration: 1, delay: 0 }}
        />
        <motion.div
          className="w-2 h-2 bg-gray-400 rounded-full"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
        />
        <motion.div
          className="w-2 h-2 bg-gray-400 rounded-full"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
        />
      </div>
    </div>
  );
}
```

---

### 4. FLUJO DE UPLOAD DE PDF

**Simular experiencia nativa de WhatsApp iOS**:

1. Usuario hace tap en icono 📎 (clip)
2. Modal iOS aparece:
   - "Archivos"
   - "Seleccionar PDF"
3. Usuario selecciona PDF
4. Upload al backend
5. Mensaje automático del bot:
   > "Documento recibido. Analizando contenido técnico..."
6. Barra de progreso visual
7. Mensaje de confirmación:
   > "Base de conocimiento lista ✓ Puedes empezar a preguntar."

**Componente PDFUploader.tsx**:
```tsx
export function PDFUploader({ onUploadComplete }: { onUploadComplete: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Solo se permiten archivos PDF');
      return;
    }

    setUploading(true);
    
    // 1. Upload a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('user-documents')
      .upload(`${userId}/document.pdf`, file, {
        upsert: true // Reemplaza si ya existe
      });

    if (uploadError) {
      console.error(uploadError);
      setUploading(false);
      return;
    }

    // 2. Registrar en DB
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .upsert({
        user_id: userId,
        file_path: uploadData.path,
        processed: false
      })
      .select()
      .single();

    // 3. Trigger procesamiento (Edge Function)
    const { data: processData } = await supabase.functions.invoke('process-pdf', {
      body: { document_id: docData.id }
    });

    setUploading(false);
    onUploadComplete();
  };

  return (
    <div className="relative">
      <input
        type="file"
        accept=".pdf"
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        className="hidden"
        id="pdf-upload"
      />
      <label htmlFor="pdf-upload" className="cursor-pointer">
        <Paperclip size={24} className="text-gray-600" />
      </label>
      
      {uploading && (
        <div className="absolute bottom-12 left-0 bg-white p-4 rounded-lg shadow-lg">
          <p className="text-sm mb-2">Procesando documento...</p>
          <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#128C7E]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### 5. ANIMACIONES CLAVE

**Escritura realista del bot**:
```tsx
function useTypingEffect(text: string, speed: number = 30) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayedText((prev) => prev + text.charAt(i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return displayedText;
}
```

**Scroll automático al último mensaje**:
```tsx
const messagesEndRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);
```

---

### 6. PÁGINA PRINCIPAL DE LA DEMO

```tsx
// app/demo/page.tsx
'use client';

import { IPhoneFrame } from '@/components/iphone/IPhoneFrame';
import { ChatHeader } from '@/components/whatsapp/ChatHeader';
import { ChatMessage } from '@/components/whatsapp/ChatMessage';
import { ChatInput } from '@/components/whatsapp/ChatInput';
import { TypingIndicator } from '@/components/whatsapp/TypingIndicator';
import { useState } from 'react';

export default function DemoPage() {
  const [messages, setMessages] = useState([
    {
      type: 'bot',
      content: 'Hola 👋 He analizado tu documento técnico y estoy listo para ayudarte.\n\nPuedes preguntarme sobre parámetros, normas, procedimientos o diagramas, y te responderé paso a paso usando exactamente la información de tu manual.',
      timestamp: '10:30',
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = async (text: string) => {
    // Agregar mensaje del usuario
    setMessages((prev) => [...prev, {
      type: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    }]);

    setIsTyping(true);

    // Llamar Edge Function de chat
    const { data } = await supabase.functions.invoke('chat', {
      body: { message: text }
    });

    setIsTyping(false);

    // Agregar respuesta del bot
    setMessages((prev) => [...prev, {
      type: 'bot',
      content: data.steps.join('\n\n'),
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      images: data.images
    }]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-8">
      <IPhoneFrame>
        <div className="h-full flex flex-col bg-[#E5DDD5]">
          <ChatHeader />
          
          <div className="flex-1 overflow-y-auto py-4">
            {messages.map((msg, i) => (
              <ChatMessage key={i} message={msg} />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
          
          <ChatInput onSend={handleSendMessage} />
        </div>
      </IPhoneFrame>
    </div>
  );
}
```

---

## FASE 3: INTEGRACIÓN Y OPTIMIZACIÓN

### 1. CONEXIÓN FRONTEND ↔ BACKEND

**Cliente Supabase** (`lib/supabase.ts`):
```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

**Hooks personalizados**:
```typescript
// lib/hooks/useAuth.ts
export function useAuth() {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user };
}
```

---

### 2. OPTIMIZACIONES DE RENDIMIENTO

**Lazy loading de componentes pesados**:
```tsx
const IPhoneFrame = dynamic(() => import('@/components/iphone/IPhoneFrame'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-800 w-[400px] h-[820px] rounded-[60px]" />
});
```

**Optimización de imágenes**:
```tsx
import Image from 'next/image';

<Image
  src={imageUrl}
  alt={caption}
  width={300}
  height={200}
  className="rounded-lg"
  loading="lazy"
/>
```

**Caching de embeddings** (opcional):
```typescript
// Guardar embeddings en localStorage temporalmente
const cachedEmbedding = localStorage.getItem(`embedding_${userId}`);
```

---

### 3. TESTING

**Tests críticos**:
1. ✅ Autenticación OTP funciona correctamente
2. ✅ Upload de PDF → procesamiento → chunks + embeddings creados
3. ✅ Búsqueda vectorial devuelve resultados relevantes
4. ✅ Chatbot responde SOLO con información del PDF
5. ✅ Imágenes se muestran correctamente en el chat
6. ✅ UI responsive en diferentes tamaños de pantalla
7. ✅ Animaciones fluidas sin lags

---

### 4. DEPLOYMENT

**Recomendaciones**:
- **Frontend**: Vercel (integración nativa con Next.js)
- **Backend**: Ya está en Supabase (serverless)
- **Variables de entorno**:
  ```env
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=  # Solo Edge Functions
  OPENAI_API_KEY=              # Solo Edge Functions
  ```

---

## GUIÓN DE LA DEMO (COMERCIAL)

### Mensaje inicial del bot (automático):
> "Hola 👋 He analizado tu documento técnico y estoy listo para ayudarte.
>
> Puedes preguntarme sobre parámetros, normas, procedimientos o diagramas, y te responderé paso a paso usando exactamente la información de tu manual."
>
> _Indicadores visuales_: Documento cargado ✓ · Base de conocimiento lista ✓

### Chips sugeridos (botones de respuesta rápida):
- "Explícame este parámetro"
- "¿Qué norma regula esto?"
- "Muéstrame un diagrama"

### Ejemplo de conversación:

**Usuario**: "Explícame este parámetro"

**Bot**:
> Paso 1: Define el parámetro X según el capítulo 3 del manual.
>
> Paso 2: Ajusta el rango permitido entre Y y Z voltios.
>
> [MUESTRA IMAGEN: Diagrama del circuito con el parámetro X resaltado]
>
> Paso 3: Verifica el resultado según la norma IEC 60950 indicada en la sección 4.2.

---

## SIGUIENTES PASOS

### 1. Instalación de herramientas
Necesito que me ayudes a instalar y configurar:
- ✅ claude-skills (Jeffallan): https://github.com/Jeffallan/claude-skills
- ✅ agents (wshobson): https://github.com/wshobson/agents

### 2. Credenciales necesarias
Para comenzar el desarrollo, proporciónameç:
- Supabase Project URL
- Supabase Anon Key
- Supabase Service Role Key (para Edge Functions)
- OpenAI API Key
- SMTP Hostinger (servidor, puerto, usuario, contraseña)

### 3. Orden de ejecución
Una vez listo, comenzaremos en este orden:
1. **Backend** → Crear todas las tablas, Storage, RLS
2. **Edge Functions** → Implementar procesamiento PDF y chat RAG
3. **Frontend** → iPhone 3D + WhatsApp UI + Auth
4. **Integración** → Conectar todo y optimizar
5. **Testing** → Pruebas exhaustivas
6. **Deploy** → Vercel + Supabase

---

**Nombre del proyecto**: `prosmart-chatbot-demo`

**Repositorio**: (pendiente de crear)

**Status**: 🚀 Listo para comenzar desarrollo

# Estructura del Proyecto - ProSmart Factories Demo

## Descripcion General

Aplicacion demo de chatbot tecnico RAG (Retrieval-Augmented Generation) que permite a usuarios hacer preguntas sobre manuales tecnicos industriales. El bot responde con texto paso a paso e imagenes extraidas del documento original.

**URL produccion:** https://demo-psf.vercel.app
**Version:** v1.0

---

## Stack Tecnologico

| Componente | Tecnologia | Version |
|---|---|---|
| Frontend | Next.js (App Router) | 16.1.6 |
| UI Framework | React + TypeScript | 19.2.3 |
| Styling | Tailwind CSS | 4.x |
| Animaciones | Framer Motion | 12.31.x |
| Iconos | Lucide React | 0.563.x |
| Graficos Admin | Recharts | 3.7.x |
| Backend | Supabase (serverless) | - |
| Base de datos | PostgreSQL + pgvector | - |
| Edge Functions | Deno (Supabase) | - |
| Autenticacion | Supabase Auth (Email + Password + OTP) | - |
| Storage | Supabase Storage (buckets privados) | - |
| IA - Chat | OpenAI GPT-4o | - |
| IA - Embeddings | OpenAI text-embedding-3-small | 1536 dims |
| Deploy Frontend | Vercel | - |

---

## Arquitectura

```
Usuario (navegador)
    |
    v
[Vercel - Next.js Frontend]
    |
    |-- Auth --> [Supabase Auth API] (native fetch, NO SDK auth)
    |-- Chat --> [Edge Function: chat]
    |                |
    |                |-- Embeddings --> [OpenAI API]
    |                |-- Vector Search --> [PostgreSQL + pgvector]
    |                |-- Chat Completion --> [OpenAI GPT-4o]
    |                |-- Analytics --> [tabla chat_interactions]
    |
    |-- Admin --> [Edge Function: admin-stats]
    |                |
    |                |-- KPIs, users, logs --> [PostgreSQL]
    |
    |-- PDF Upload --> [Edge Function: process-pdf]
                         |
                         |-- Storage --> [Supabase Storage]
                         |-- Text/Images --> [OpenAI Vision + Embeddings]
                         |-- Chunks --> [tabla document_chunks]
                         |-- Images --> [tabla document_images]
```

---

## Estructura de Directorios

```
Demo_Claude_PSF/
|
|-- frontend/                          # Aplicacion Next.js
|   |-- src/
|   |   |-- app/
|   |   |   |-- page.tsx               # Pagina principal (chat WhatsApp)
|   |   |   |-- login/page.tsx         # Login / Registro / OTP / Forgot Password
|   |   |   |-- admin/page.tsx         # Dashboard administrador
|   |   |   |-- reset-password/page.tsx # Reset de contraseña
|   |   |   |-- error.tsx              # Error boundary
|   |   |   |-- layout.tsx             # Layout raiz con AuthProvider
|   |   |   |-- providers.tsx          # Context providers
|   |   |
|   |   |-- components/
|   |   |   |-- admin/                 # Componentes del dashboard admin
|   |   |   |   |-- AdminGuard.tsx     # Proteccion de ruta admin
|   |   |   |   |-- KPICards.tsx       # 8 tarjetas de KPIs con animaciones
|   |   |   |   |-- ActivityChart.tsx  # Grafico actividad 30 dias (Recharts)
|   |   |   |   |-- CompanyBreakdown.tsx # Desglose por empresa
|   |   |   |   |-- FunnelChart.tsx    # Embudo de conversion (3 etapas)
|   |   |   |   |-- EngagementDonut.tsx # Donut de engagement
|   |   |   |   |-- UserTable.tsx      # Tabla usuarios con busqueda/paginacion/CSV
|   |   |   |   |-- RecentActivity.tsx # Actividad reciente en tiempo real
|   |   |   |   |-- ChatLogViewer.tsx  # Visor de conversaciones del bot
|   |   |   |   |-- TopQuestions.tsx   # Top 10 preguntas mas frecuentes
|   |   |   |   |-- UsageHeatmap.tsx   # Mapa de calor hora x dia
|   |   |   |   |-- AIPerformanceCard.tsx # Metricas rendimiento IA
|   |   |   |   |-- DashboardHeader.tsx # Header con refresh
|   |   |   |
|   |   |   |-- auth/                  # Componentes de autenticacion
|   |   |   |   |-- LoginForm.tsx      # Formulario email+password (login/registro)
|   |   |   |   |-- OTPInput.tsx       # Verificacion OTP 6 digitos
|   |   |   |   |-- OnboardingForm.tsx # Nombre + Empresa (primer login)
|   |   |   |
|   |   |   |-- whatsapp/             # UI WhatsApp movil
|   |   |   |   |-- ChatHeader.tsx     # Header con dropdown (Portal)
|   |   |   |   |-- ChatMessage.tsx    # Burbujas de mensaje con imagenes inline
|   |   |   |   |-- ChatInput.tsx      # Barra de entrada con clip para PDFs
|   |   |   |   |-- SuggestedChips.tsx # Chips de preguntas sugeridas
|   |   |   |
|   |   |   |-- iphone/               # Mockup iPhone 3D
|   |   |   |   |-- IPhoneFrame.tsx    # Frame con parallax y sombras
|   |   |   |
|   |   |   |-- pdf/                   # Upload de PDFs
|   |   |       |-- PDFUploader.tsx    # Modal upload con progreso
|   |   |
|   |   |-- lib/
|   |       |-- supabase.ts           # Cliente Supabase + tipos ChatMessage
|   |       |-- auth.tsx              # AuthProvider con native fetch (NO SDK auth)
|   |       |-- admin.ts             # Tipos admin, hooks, helpers, CSV export
|   |
|   |-- public/
|   |   |-- logo-psf.png             # Logo Pro Smart Factories
|   |   |-- manual-tecnico.pdf       # Manual descargable para el usuario
|   |
|   |-- .env.local                    # Variables de entorno frontend
|   |-- next.config.ts                # Config Next.js
|   |-- package.json
|   |-- tsconfig.json
|
|-- supabase/                          # Backend Supabase
|   |-- functions/
|   |   |-- chat/index.ts            # Edge Function: RAG chat con OpenAI
|   |   |-- process-pdf/index.ts     # Edge Function: procesar PDF + embeddings
|   |   |-- admin-stats/index.ts     # Edge Function: datos dashboard admin
|   |   |-- generate-suggestions/index.ts  # Edge Function: sugerencias de chat
|   |   |-- reprocess-images/index.ts      # Edge Function: reprocesar imagenes
|   |   |-- upload-page-image/index.ts     # Edge Function: subir imagen de pagina
|   |
|   |-- migrations/
|   |   |-- 002_enhanced_rag_with_images.sql  # Tablas base RAG
|   |   |-- 003_fix_schema.sql                # Correcciones de esquema
|   |   |-- 004_admin_dashboard.sql           # Tablas admin + chat_interactions
|   |   |-- 20240101000000_create_match_functions.sql # match_documents/match_images RPC
|   |
|   |-- config.toml                   # Configuracion Supabase local
|   |-- .env                          # Variables de entorno Supabase
|
|-- CLAUDE.md                         # Instrucciones completas del proyecto
|-- ESTRUCTURA_PROYECTO.md            # Este documento
```

---

## Base de Datos (PostgreSQL)

### Tablas Principales

| Tabla | Descripcion |
|---|---|
| `profiles` | Nombre, empresa del usuario. FK a auth.users |
| `documents` | PDF del usuario (1 por usuario, UNIQUE constraint) |
| `document_chunks` | Fragmentos de texto con embeddings vector(1536) |
| `document_images` | Imagenes extraidas del PDF con contexto y embeddings |
| `chat_interactions` | Log de cada pregunta/respuesta para analytics |

### Funciones RPC (pgvector)

- `match_documents(query_embedding, match_threshold, match_count, p_user_id)` - Busqueda vectorial de chunks
- `match_images(query_embedding, match_threshold, match_count, p_user_id)` - Busqueda vectorial de imagenes

### Row Level Security (RLS)
Todas las tablas tienen RLS habilitado. Cada usuario solo accede a sus propios datos.

---

## Flujos de Datos

### 1. Autenticacion

```
LoginForm (email+password)
    |
    |-- Usuario normal --> signIn() via native fetch a /auth/v1/token
    |       |-- OK --> useEffect detecta user+profile --> redirect a /
    |       |-- Nuevo --> signUp() --> OTP por email --> verificar --> onboarding
    |
    |-- Admin (email match) --> signIn() directo --> redirect a /admin
```

**IMPORTANTE:** Todas las llamadas de auth usan `fetch()` nativo, NO `supabase.auth.*()`. La razon es que Supabase JS v2.94 tiene un bug que hace que los metodos de auth se cuelguen indefinidamente.

### 2. Chat RAG

```
Usuario escribe pregunta
    |
    v
Frontend: POST /functions/v1/chat {message, user_id}
    |
    v
Edge Function chat/index.ts:
    1. Generar embedding de la pregunta (text-embedding-3-small)
    2. Buscar chunks relevantes (match_documents RPC, threshold 0.12, top 15)
    3. Si no hay chunks del usuario --> fallback a demo document owner
    4. Buscar imagenes relevantes (match_images RPC, threshold 0.15, top 8)
    5. Construir contexto con fragmentos entre marcadores << >>
    6. Llamar GPT-4o con system prompt + contexto + pregunta
    7. Post-procesar: strip markdown, fix markers
    8. Insertar imagenes inline donde el texto dice (Figura X)
       - Strategy 1: Match por filename URL (mas confiable)
       - Strategy 2: Match por texto de contexto
       - Strategy 3: Match por pagina (con verificacion de figura)
       - Strategy 4: Match por pagina de GPT (con verificacion)
    9. Log en chat_interactions para analytics
    10. Devolver {steps[], images[], raw_response}
    |
    v
Frontend: Renderizar burbujas con ChatMessage (texto + imagenes inline)
```

### 3. Dashboard Admin

```
AdminGuard verifica email === ADMIN_EMAIL
    |
    v
useAdminData(accessToken) --> GET /functions/v1/admin-stats
    |                           |-- x-user-token header para auth
    |                           |-- Agrega: KPIs, userStats, chatLogs,
    |                           |   topQuestions, heatmap, aiPerformance, trends
    v
Renderizar: KPICards, ActivityChart, UsageHeatmap, TopQuestions,
            FunnelChart, CompanyBreakdown, EngagementDonut,
            ChatLogViewer, UserTable, RecentActivity
```

---

## Variables de Entorno

### Frontend (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Supabase Edge Functions (secrets)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...
```

---

## Comandos de Despliegue

### Frontend (Vercel)
```bash
cd frontend
npx vercel --prod
```

### Edge Functions (Supabase)
```bash
cd supabase
npx supabase functions deploy chat
npx supabase functions deploy process-pdf
npx supabase functions deploy admin-stats
npx supabase functions deploy generate-suggestions
```

### Secrets de Edge Functions
```bash
npx supabase secrets set OPENAI_API_KEY=sk-...
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Decisiones Tecnicas Clave

### 1. Native fetch() para Auth (NO Supabase JS SDK)
**Por que:** Supabase JS v2.94 tiene un bug donde `supabase.auth.signInWithPassword()`, `signOut()`, etc. se cuelgan indefinidamente. La solucion fue usar `fetch()` directo a los endpoints `/auth/v1/*`.

**Donde:** `frontend/src/lib/auth.tsx` - Todos los metodos (signIn, signUp, signOut, verifyOtp, resetPassword).

### 2. React Portal para Dropdowns
**Por que:** Los contenedores padres con `overflow-hidden` y stacking contexts (z-index + transforms) impiden que los menus `position: fixed` se muestren correctamente.

**Donde:** `frontend/src/components/whatsapp/ChatHeader.tsx` - El menu dropdown se renderiza via `createPortal(menu, document.body)`.

### 3. Demo Fallback para Chunks
**Por que:** Los usuarios demo no suben sus propios PDFs. El documento esta precargado y asociado a un usuario "demo owner". Si un usuario no tiene chunks propios, el chat busca los del demo owner.

**Donde:** `supabase/functions/chat/index.ts` lineas 124-149.

### 4. Figure Matching con Verificacion
**Por que:** Multiples figuras pueden compartir la misma pagina del PDF. Sin verificacion del numero de figura, Strategy 3 y 4 devolvian la primera imagen de la pagina, no la correcta.

**Donde:** `supabase/functions/chat/index.ts` funcion `insertInlineImages()` - Strategies 3 y 4 verifican que el URL o contexto de la imagen contenga el numero de figura solicitado.

### 5. Mobile vs Desktop: Misma app, diferente presentacion
**Por que:** En movil, el chat ocupa pantalla completa (como WhatsApp real). En desktop, el chat se muestra dentro de un mockup de iPhone 3D con parallax.

**Donde:** `frontend/src/app/page.tsx` - Vista movil (`lg:hidden`) vs desktop (`hidden lg:flex`). El desktop no pasa `onLogout`/`userName` al chat (tiene su propio UI externo para eso).

### 6. JWT HS256 vs ES256
**Por que:** Las Edge Functions de Supabase solo aceptan JWT firmados con HS256 (la anon key). Para admin-stats, se usa un header custom `x-user-token` con el access token del usuario, y la Edge Function lo verifica internamente.

**Donde:** `frontend/src/lib/admin.ts` funcion `fetchAdminData()` y `supabase/functions/admin-stats/index.ts`.

---

## Patrones Reutilizables

### Patron: Auth Provider con Native Fetch
Util cuando el SDK de Supabase tiene problemas de compatibilidad. Ver `auth.tsx` para la implementacion completa con session persistence via localStorage.

### Patron: RAG con Post-procesamiento de Imagenes
El chat no envia metadatos de imagenes a GPT. En su lugar, GPT genera texto con referencias "(Figura X)" y `insertInlineImages()` empareja esas referencias con las imagenes reales usando 4 estrategias en cascada.

### Patron: Portal para UI escapando overflow
Cualquier UI que necesite salir de un contenedor con `overflow-hidden` (tooltips, dropdowns, modales) debe usar `createPortal()` hacia `document.body`.

### Patron: Edge Function con doble auth
Para funciones que necesitan verificar identidad de usuario, usar header custom (`x-user-token`) con el access token, y la Edge Function lo verifica via Supabase Admin API.

---

## Como Reproducir Este Proyecto desde Cero

1. **Crear proyecto Supabase** en supabase.com
2. **Configurar Auth:** Habilitar Email provider, configurar SMTP
3. **Ejecutar migraciones SQL** en el editor SQL de Supabase (en orden numerico)
4. **Crear buckets Storage:** `user-documents` (privado), `document-images` (privado)
5. **Crear proyecto Next.js:** `npx create-next-app@latest --typescript --tailwind`
6. **Instalar dependencias:** framer-motion, lucide-react, @supabase/supabase-js, recharts
7. **Configurar variables de entorno** (.env.local + Supabase secrets)
8. **Implementar Edge Functions** y desplegar con `supabase functions deploy`
9. **Implementar frontend** siguiendo la estructura de componentes documentada
10. **Desplegar frontend** en Vercel con `npx vercel --prod`

---

*Documento generado para Pro Smart Factories - v1.0*

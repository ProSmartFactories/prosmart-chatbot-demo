# INSTRUCCIONES DE DESPLIEGUE - Sistema RAG con Imágenes

## RESUMEN DE CAMBIOS

### Backend (Edge Functions)

1. **process-pdf/index.ts** - Completamente reescrito
   - Soporte para procesamiento con Vision (análisis de páginas como imágenes)
   - Fallback a Assistants API si no hay imágenes
   - Extracción de diagramas y tablas
   - Chunking semántico mejorado

2. **chat/index.ts** - Mejorado
   - Búsqueda de chunks con información de diagramas
   - Matching de imágenes por relevancia
   - Respuestas estructuradas con referencias a imágenes

### Frontend

1. **PDFUploader.tsx** - Actualizado
   - Usa pdf.js para convertir páginas a imágenes
   - Envía imágenes de páginas al backend para Vision
   - Progreso detallado durante procesamiento

2. **package.json** - Nueva dependencia
   - `pdfjs-dist`: Para renderizar PDF en el navegador

### Base de Datos

1. **Nuevas columnas en `documents`**:
   - `original_filename`
   - `total_pages`
   - `processing_method`

2. **Nuevas columnas en `document_chunks`**:
   - `chunk_index`
   - `has_diagram`
   - `diagram_description`

3. **Nuevas columnas en `document_images`**:
   - `ai_caption`
   - `image_type`
   - `width`
   - `height`

4. **Funciones RPC actualizadas**:
   - `match_documents` - incluye info de diagramas
   - `match_images` - incluye caption y tipo

---

## PASOS DE DESPLIEGUE

### 1. Ejecutar Migración SQL

Ve a **Supabase Dashboard** → **SQL Editor** y ejecuta:

```sql
-- Copiar contenido de: supabase/migrations/002_enhanced_rag_with_images.sql
```

### 2. Desplegar Edge Functions

En tu terminal:

```bash
cd c:\Users\victo\OneDrive\Desktop\Demo_Claude_PSF\supabase

# Login (si sesión expiró)
npx supabase login

# Desplegar funciones
npx supabase functions deploy process-pdf --no-verify-jwt
npx supabase functions deploy chat --no-verify-jwt
```

### 3. Instalar Dependencias Frontend

```bash
cd c:\Users\victo\OneDrive\Desktop\Demo_Claude_PSF\frontend
npm install
```

### 4. Desplegar Frontend

```bash
git add .
git commit -m "feat: Enhanced RAG with Vision-based PDF processing and image support"
git push
```

Vercel desplegará automáticamente.

---

## FLUJO DEL SISTEMA

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USUARIO SUBE PDF                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. FRONTEND (PDFUploader)                                       │
│    - Sube PDF a Supabase Storage                                │
│    - Convierte cada página a imagen con pdf.js                 │
│    - Envía page_images[] al backend                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. EDGE FUNCTION (process-pdf)                                  │
│    Si hay page_images:                                          │
│      → GPT-4o Vision analiza cada página                        │
│      → Extrae texto + describe diagramas + tablas               │
│    Si no hay page_images:                                       │
│      → OpenAI Assistants API extrae texto                       │
│    → Crea chunks semánticos                                     │
│    → Genera embeddings                                          │
│    → Guarda en document_chunks y document_images                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. USUARIO HACE PREGUNTA                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. EDGE FUNCTION (chat)                                         │
│    → Genera embedding de la pregunta                            │
│    → Busca chunks relevantes (match_documents)                  │
│    → Busca imágenes relevantes (match_images)                   │
│    → Construye contexto con texto + diagramas + imágenes        │
│    → GPT-4o genera respuesta estructurada                       │
│    → Incluye referencias [IMAGEN: ...]                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. FRONTEND MUESTRA RESPUESTA                                   │
│    → Pasos numerados                                            │
│    → Imágenes relevantes después de cada sección                │
└─────────────────────────────────────────────────────────────────┘
```

---

## COSTOS ESTIMADOS

| Operación | Costo Aproximado |
|-----------|-----------------|
| Procesar PDF 20 páginas | ~$0.25-0.35 |
| - Análisis Vision (20 páginas) | $0.20 |
| - Embeddings (40 chunks) | $0.02 |
| - Caption imágenes (10) | $0.05 |
| Respuesta chat | $0.01-0.02 |

---

## VERIFICACIÓN

1. **Subir el manual de ejemplo** (manual-instrucciones-mx340g.pdf)
2. **Verificar en Supabase**:
   - `documents`: debe tener `processed = true`
   - `document_chunks`: debe tener múltiples chunks con `page_number`
3. **Probar chat**:
   - "¿Cuáles son las especificaciones técnicas?"
   - "Muéstrame un diagrama de conexiones"
   - "¿Cómo configuro el dispositivo?"

---

## TROUBLESHOOTING

### Error: "pdfjs-dist not found"
```bash
npm install pdfjs-dist
```

### Error: "Function timeout"
- PDFs muy grandes (>15MB) usan fallback sin Vision
- Reducir escala de imágenes en pageToImage()

### Error: "No chunks created"
- Verificar que el PDF no esté protegido
- Revisar logs de Edge Function en Supabase Dashboard

### Imágenes no aparecen en respuestas
- Verificar que `document_images` tenga registros
- Verificar que `embedding` no sea NULL
- Bajar `match_threshold` en chat function

---

## ARCHIVOS MODIFICADOS

```
supabase/
├── functions/
│   ├── process-pdf/index.ts  ← REESCRITO
│   └── chat/index.ts         ← MEJORADO
└── migrations/
    └── 002_enhanced_rag_with_images.sql  ← NUEVO

frontend/
├── package.json              ← DEPENDENCIA AÑADIDA
└── src/components/pdf/
    └── PDFUploader.tsx       ← REESCRITO
```

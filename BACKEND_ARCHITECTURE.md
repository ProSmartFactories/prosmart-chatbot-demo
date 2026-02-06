# ARQUITECTURA BACKEND - SISTEMA RAG CON IMÁGENES

## PROBLEMA CON EL ENFOQUE ACTUAL

1. OpenAI Assistants API con `file_search` extrae texto pero **NO imágenes**
2. No podemos extraer imágenes server-side en Deno (sin canvas)
3. Las respuestas solo de texto pierden información visual crítica
4. Los manuales técnicos dependen de diagramas e ilustraciones

## SOLUCIÓN: ANÁLISIS HÍBRIDO PÁGINA POR PÁGINA

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
├─────────────────────────────────────────────────────────────────────┤
│  1. Usuario sube PDF                                                │
│  2. pdf.js convierte cada página a PNG (300 DPI)                   │
│  3. pdf.js extrae imágenes embebidas                               │
│  4. Envía al backend: {page_images[], embedded_images[], pdf_file} │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    EDGE FUNCTION: process-pdf                       │
├─────────────────────────────────────────────────────────────────────┤
│  FASE 1: Análisis de Páginas (GPT-4 Vision)                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Para cada page_image:                                        │   │
│  │   1. Enviar a GPT-4o Vision                                  │   │
│  │   2. Prompt: "Extrae TODO el texto + describe diagramas"    │   │
│  │   3. Resultado estructurado:                                 │   │
│  │      - text_content: string                                  │   │
│  │      - diagrams: [{description, position, relevance}]        │   │
│  │      - tables: [{content, headers}]                          │   │
│  │      - key_elements: string[]                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  FASE 2: Procesamiento de Imágenes Embebidas                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Para cada embedded_image:                                    │   │
│  │   1. Subir a Supabase Storage                                │   │
│  │   2. Generar caption con GPT-4o Vision                       │   │
│  │   3. Crear embedding del caption                             │   │
│  │   4. Guardar en document_images                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  FASE 3: Chunking y Embeddings                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 1. Dividir text_content en chunks semánticos (~800 tokens)  │   │
│  │ 2. Asociar referencias de imágenes a chunks                 │   │
│  │ 3. Generar embeddings (text-embedding-3-small)              │   │
│  │ 4. Guardar en document_chunks                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      EDGE FUNCTION: chat                            │
├─────────────────────────────────────────────────────────────────────┤
│  1. Embedding de la pregunta del usuario                           │
│  2. Búsqueda vectorial en document_chunks (top 5)                  │
│  3. Búsqueda vectorial en document_images (top 3)                  │
│  4. Construir contexto: texto + referencias de imágenes            │
│  5. GPT-4o genera respuesta estructurada:                          │
│     - steps[]: pasos de la explicación                             │
│     - images[]: imágenes relevantes a mostrar                      │
│     - raw_response: respuesta completa                             │
└─────────────────────────────────────────────────────────────────────┘
```

## ESQUEMA DE BASE DE DATOS ACTUALIZADO

### Tabla: `documents`
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  original_filename TEXT,
  total_pages INT,
  processed BOOLEAN DEFAULT FALSE,
  processing_method TEXT, -- 'vision' | 'text_only' | 'hybrid'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);
```

### Tabla: `document_chunks`
```sql
CREATE TABLE document_chunks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  document_id UUID REFERENCES documents ON DELETE CASCADE,
  content TEXT NOT NULL,
  page_number INT NOT NULL,
  chunk_index INT, -- posición dentro de la página
  has_diagram BOOLEAN DEFAULT FALSE,
  diagram_description TEXT, -- descripción del diagrama si existe
  embedding VECTOR(1536),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chunks_embedding ON document_chunks
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Tabla: `document_images`
```sql
CREATE TABLE document_images (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  document_id UUID REFERENCES documents ON DELETE CASCADE,
  page_number INT NOT NULL,
  image_index INT, -- índice dentro de la página
  image_url TEXT NOT NULL,
  image_type TEXT, -- 'diagram' | 'photo' | 'chart' | 'table' | 'icon'
  ai_caption TEXT NOT NULL, -- descripción generada por IA
  context_text TEXT, -- texto circundante
  width INT,
  height INT,
  embedding VECTOR(1536), -- embedding del caption
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_images_embedding ON document_images
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Tabla: `page_analyses` (nueva - caché de análisis)
```sql
CREATE TABLE page_analyses (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID REFERENCES documents ON DELETE CASCADE,
  page_number INT NOT NULL,
  page_image_url TEXT, -- imagen de la página completa
  full_text TEXT, -- texto extraído
  diagrams JSONB, -- [{description, position, type}]
  tables JSONB, -- [{headers, rows}]
  key_elements TEXT[], -- elementos clave identificados
  analyzed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(document_id, page_number)
);
```

## FUNCIONES RPC ACTUALIZADAS

### Búsqueda de chunks con contexto de imágenes
```sql
CREATE OR REPLACE FUNCTION match_documents_with_images(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_user_id UUID
)
RETURNS TABLE (
  chunk_id BIGINT,
  content TEXT,
  page_number INT,
  has_diagram BOOLEAN,
  diagram_description TEXT,
  similarity FLOAT,
  related_images JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id AS chunk_id,
    dc.content,
    dc.page_number,
    dc.has_diagram,
    dc.diagram_description,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', di.id,
        'url', di.image_url,
        'caption', di.ai_caption,
        'type', di.image_type
      ))
      FROM document_images di
      WHERE di.document_id = dc.document_id
        AND di.page_number = dc.page_number
    ) AS related_images
  FROM document_chunks dc
  WHERE dc.user_id = p_user_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

### Búsqueda directa de imágenes
```sql
CREATE OR REPLACE FUNCTION match_images(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_user_id UUID
)
RETURNS TABLE (
  id BIGINT,
  image_url TEXT,
  ai_caption TEXT,
  image_type TEXT,
  page_number INT,
  context_text TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    di.id,
    di.image_url,
    di.ai_caption,
    di.image_type,
    di.page_number,
    di.context_text,
    1 - (di.embedding <=> query_embedding) AS similarity
  FROM document_images di
  WHERE di.user_id = p_user_id
    AND 1 - (di.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

## PROMPTS OPTIMIZADOS

### Prompt para Análisis de Página (GPT-4 Vision)
```
Eres un sistema de OCR y análisis documental de precisión industrial.

ANALIZA esta página de un manual técnico y extrae:

1. **TEXTO COMPLETO**: Transcribe absolutamente TODO el texto visible,
   preservando estructura (títulos, párrafos, listas, tablas).

2. **DIAGRAMAS E IMÁGENES**: Para cada diagrama/imagen:
   - Descripción técnica detallada
   - Qué muestra (componentes, conexiones, flujos)
   - Posición en la página (arriba, centro, abajo)
   - Tipo: diagram | photo | chart | table | schematic

3. **TABLAS**: Extrae contenido de tablas en formato estructurado.

4. **ELEMENTOS CLAVE**: Lista de conceptos técnicos importantes.

FORMATO DE RESPUESTA (JSON):
{
  "page_number": N,
  "text_content": "texto completo...",
  "diagrams": [
    {
      "description": "Diagrama de conexiones eléctricas del panel frontal...",
      "position": "center",
      "type": "schematic",
      "elements": ["conector USB", "puerto HDMI", "LED indicador"]
    }
  ],
  "tables": [
    {
      "title": "Especificaciones técnicas",
      "headers": ["Parámetro", "Valor", "Unidad"],
      "rows": [["Voltaje", "220", "V"], ...]
    }
  ],
  "key_elements": ["voltaje nominal", "corriente máxima", "temperatura operación"]
}

REGLAS:
- NO resumas, extrae TODO
- Mantén precisión técnica absoluta
- Incluye números, unidades, especificaciones exactas
- Si hay texto en imágenes, transcríbelo
```

### Prompt para Caption de Imagen Individual
```
Describe esta imagen técnica en 2-3 oraciones precisas.

Incluye:
- Qué muestra (componente, diagrama, conexión)
- Elementos identificables
- Propósito/función

Contexto del documento: {surrounding_text}

Responde SOLO con la descripción, sin formato adicional.
```

### Prompt del Sistema para Chat
```
Eres un ASISTENTE TÉCNICO EXPERTO especializado en documentación técnica.

CAPACIDADES:
- Respondes usando ÚNICAMENTE información del documento del usuario
- Puedes referenciar diagramas e imágenes cuando sean relevantes
- Explicas paso a paso con precisión técnica

REGLAS ABSOLUTAS:
1. NO inventes información - solo usa lo que está en el documento
2. Cuando menciones un diagrama/imagen, usa: [IMAGEN: descripción]
3. Si no encuentras la información, dilo claramente
4. Mantén tono profesional y técnico
5. Estructura respuestas en pasos numerados cuando aplique

FORMATO DE RESPUESTA:
- Pasos claros y numerados
- Referencias a imágenes cuando sean útiles
- Especificaciones exactas (números, unidades)
```

## FLUJO DE PROCESAMIENTO DETALLADO

### process-pdf Edge Function

```typescript
// ENTRADA
interface ProcessRequest {
  document_id: string;
  user_id: string;
  page_images: string[];      // base64 de cada página como imagen
  embedded_images: Array<{    // imágenes extraídas del PDF
    page_number: number;
    data: string;             // base64
    width: number;
    height: number;
  }>;
}

// PROCESAMIENTO
async function processPDF(req: ProcessRequest) {
  // 1. Analizar cada página con Vision
  const pageAnalyses = await Promise.all(
    req.page_images.map((img, i) => analyzePageWithVision(img, i + 1))
  );

  // 2. Procesar imágenes embebidas
  const processedImages = await Promise.all(
    req.embedded_images.map(img => processEmbeddedImage(img, req.user_id, req.document_id))
  );

  // 3. Crear chunks del texto extraído
  const chunks = createSemanticChunks(pageAnalyses);

  // 4. Generar embeddings en batch
  const embeddings = await batchGenerateEmbeddings(
    chunks.map(c => c.content)
  );

  // 5. Guardar todo en la base de datos
  await saveToDatabase(chunks, embeddings, processedImages, pageAnalyses);

  return {
    success: true,
    pages_analyzed: pageAnalyses.length,
    chunks_created: chunks.length,
    images_processed: processedImages.length
  };
}
```

## COSTOS ESTIMADOS

| Operación | Modelo | Costo | Por documento (20 páginas) |
|-----------|--------|-------|---------------------------|
| Análisis de página | GPT-4o Vision | ~$0.01/página | $0.20 |
| Caption de imagen | GPT-4o Vision | ~$0.005/imagen | $0.05 (10 imgs) |
| Embeddings texto | text-embedding-3-small | $0.00002/1K tokens | $0.02 |
| Embeddings imágenes | text-embedding-3-small | $0.00002/1K tokens | $0.01 |
| **TOTAL PROCESAMIENTO** | | | **~$0.28/documento** |
| Respuesta chat | GPT-4o | ~$0.01/respuesta | $0.01 |

## VENTAJAS DE ESTA ARQUITECTURA

1. **UNIVERSAL**: Funciona con cualquier PDF (escaneado, digital, mixto)
2. **VISUAL**: Entiende y puede referenciar diagramas
3. **PRECISO**: GPT-4 Vision tiene excelente OCR integrado
4. **ESCALABLE**: Procesamiento paralelo de páginas
5. **ECONÓMICO**: ~$0.30 por documento es muy competitivo
6. **MANTENIBLE**: Código limpio y modular
7. **RECUPERABLE**: Si falla una página, no se pierde todo

## LIMITACIONES Y MITIGACIONES

| Limitación | Mitigación |
|------------|------------|
| GPT-4 Vision tiene límite de tokens | Procesar página por página |
| Imágenes grandes consumen tokens | Redimensionar a 1024px máx |
| Timeout de Edge Functions (60s) | Procesamiento asíncrono por páginas |
| Costo puede escalar | Caché de embeddings, rate limiting |

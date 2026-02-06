import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// TYPES
// ============================================================================

interface ProcessPdfRequest {
  document_id: string;
  user_id: string;
  page_images?: string[];  // Base64 de cada página convertida a imagen
  embedded_images?: Array<{
    page_number: number;
    data: string;  // Base64
    width: number;
    height: number;
  }>;
}

interface PageAnalysis {
  page_number: number;
  text_content: string;
  diagrams: Array<{
    description: string;
    position: string;
    type: string;
    elements: string[];
  }>;
  tables: Array<{
    title: string;
    content: string;
  }>;
  key_elements: string[];
}

interface ProcessedImage {
  page_number: number;
  image_url: string;
  ai_caption: string;
  image_type: string;
  width: number;
  height: number;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { document_id, user_id, page_images, embedded_images }: ProcessPdfRequest = await req.json();

    if (!document_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "document_id and user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing PDF: ${document_id} for user: ${user_id}`);
    console.log(`Page images: ${page_images?.length || 0}, Embedded images: ${embedded_images?.length || 0}`);

    // Get document info
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docError || !doc) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    // Determine processing method based on input
    const hasPageImages = page_images && page_images.length > 0;

    let pageAnalyses: PageAnalysis[] = [];
    let processedImages: ProcessedImage[] = [];
    let totalChunks = 0;

    if (hasPageImages) {
      // ========================================================================
      // METHOD 1: VISION-BASED PROCESSING (Best quality)
      // ========================================================================
      console.log("Using Vision-based processing...");

      // Process pages in parallel (max 3 at a time to avoid rate limits)
      const batchSize = 3;
      for (let i = 0; i < page_images.length; i += batchSize) {
        const batch = page_images.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((img, idx) => analyzePageWithVision(img, i + idx + 1, openaiApiKey))
        );
        pageAnalyses.push(...batchResults);
        console.log(`Analyzed pages ${i + 1} to ${Math.min(i + batchSize, page_images.length)}`);
      }

      // Process embedded images
      if (embedded_images && embedded_images.length > 0) {
        processedImages = await processEmbeddedImages(
          embedded_images,
          user_id,
          document_id,
          supabase,
          openaiApiKey
        );
      }

    } else {
      // ========================================================================
      // METHOD 2: FALLBACK - OpenAI Assistants API (text only)
      // ========================================================================
      console.log("No page images provided, using Assistants API fallback...");

      // Download PDF from storage
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from("user-documents")
        .download(doc.file_path);

      if (downloadError || !pdfData) {
        throw new Error(`Download failed: ${downloadError?.message}`);
      }

      const arrayBuffer = await pdfData.arrayBuffer();
      const pdfSizeKB = Math.round(arrayBuffer.byteLength / 1024);
      console.log(`PDF size: ${pdfSizeKB} KB`);

      if (pdfSizeKB > 20480) { // 20MB limit
        throw new Error("El PDF es demasiado grande. El tamaño máximo es 20MB.");
      }

      // Use Assistants API for text extraction
      pageAnalyses = await extractWithAssistantsAPI(arrayBuffer, openaiApiKey);
    }

    // ========================================================================
    // COMMON: Create chunks and embeddings
    // ========================================================================

    // Clear previous data
    await supabase.from("document_chunks").delete().eq("user_id", user_id);
    await supabase.from("document_images").delete().eq("user_id", user_id);

    // Create semantic chunks from page analyses
    const chunks = createSemanticChunks(pageAnalyses);
    console.log(`Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      throw new Error("No se pudo extraer contenido del documento");
    }

    // Generate embeddings in batches
    const embeddings = await batchGenerateEmbeddings(
      chunks.map(c => c.content),
      openaiApiKey
    );

    // Insert chunks with embeddings
    const chunksToInsert = chunks.map((chunk, i) => ({
      user_id,
      document_id,
      content: chunk.content,
      page_number: chunk.page_number,
      chunk_index: chunk.chunk_index,
      has_diagram: chunk.has_diagram,
      diagram_description: chunk.diagram_description,
      embedding: embeddings[i],
    }));

    const { error: insertChunksError } = await supabase
      .from("document_chunks")
      .insert(chunksToInsert);

    if (insertChunksError) {
      throw new Error(`Failed to insert chunks: ${insertChunksError.message}`);
    }

    totalChunks = chunks.length;

    // Insert processed images
    if (processedImages.length > 0) {
      const imageEmbeddings = await batchGenerateEmbeddings(
        processedImages.map(img => img.ai_caption),
        openaiApiKey
      );

      const imagesToInsert = processedImages.map((img, i) => ({
        user_id,
        document_id,
        page_number: img.page_number,
        image_url: img.image_url,
        image_type: img.image_type,
        ai_caption: img.ai_caption,
        width: img.width,
        height: img.height,
        embedding: imageEmbeddings[i],
      }));

      const { error: insertImagesError } = await supabase
        .from("document_images")
        .insert(imagesToInsert);

      if (insertImagesError) {
        console.error("Failed to insert images:", insertImagesError);
      }
    }

    // Mark document as processed
    await supabase
      .from("documents")
      .update({
        processed: true,
        total_pages: pageAnalyses.length,
        processing_method: hasPageImages ? 'vision' : 'assistants'
      })
      .eq("id", document_id);

    console.log("Processing complete!");

    return new Response(
      JSON.stringify({
        success: true,
        message: "PDF procesado correctamente",
        chunks_count: totalChunks,
        images_count: processedImages.length,
        total_pages: pageAnalyses.length,
        processing_method: hasPageImages ? 'vision' : 'assistants',
        summary: `Documento analizado: ${totalChunks} fragmentos, ${processedImages.length} imágenes de ${pageAnalyses.length} páginas`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// VISION-BASED PAGE ANALYSIS
// ============================================================================

async function analyzePageWithVision(
  pageImageBase64: string,
  pageNumber: number,
  apiKey: string
): Promise<PageAnalysis> {
  const prompt = `Analiza esta página de un manual técnico y extrae la información en formato JSON.

INSTRUCCIONES:
1. Transcribe TODO el texto visible, preservando estructura
2. Describe cada diagrama/imagen técnica que veas
3. Extrae tablas en formato legible
4. Identifica elementos técnicos clave

RESPONDE ÚNICAMENTE con JSON válido (sin markdown, sin \`\`\`):
{
  "text_content": "todo el texto de la página...",
  "diagrams": [
    {
      "description": "descripción técnica detallada del diagrama",
      "position": "top|center|bottom",
      "type": "diagram|schematic|photo|chart|table|icon",
      "elements": ["elemento1", "elemento2"]
    }
  ],
  "tables": [
    {
      "title": "título de la tabla",
      "content": "contenido formateado de la tabla"
    }
  ],
  "key_elements": ["concepto técnico 1", "concepto técnico 2"]
}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: pageImageBase64.startsWith("data:")
                    ? pageImageBase64
                    : `data:image/png;base64,${pageImageBase64}`,
                  detail: "high"
                }
              },
              {
                type: "text",
                text: prompt
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Vision API error for page ${pageNumber}:`, errorText);
      // Return empty analysis on error
      return {
        page_number: pageNumber,
        text_content: "",
        diagrams: [],
        tables: [],
        key_elements: []
      };
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "{}";

    // Parse JSON response
    let parsed;
    try {
      // Clean up response if it has markdown code blocks
      const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleanContent);
    } catch {
      console.error(`Failed to parse JSON for page ${pageNumber}, using raw text`);
      parsed = {
        text_content: content,
        diagrams: [],
        tables: [],
        key_elements: []
      };
    }

    return {
      page_number: pageNumber,
      text_content: parsed.text_content || "",
      diagrams: parsed.diagrams || [],
      tables: parsed.tables || [],
      key_elements: parsed.key_elements || []
    };

  } catch (error) {
    console.error(`Error analyzing page ${pageNumber}:`, error);
    return {
      page_number: pageNumber,
      text_content: "",
      diagrams: [],
      tables: [],
      key_elements: []
    };
  }
}

// ============================================================================
// ASSISTANTS API FALLBACK
// ============================================================================

async function extractWithAssistantsAPI(
  pdfArrayBuffer: ArrayBuffer,
  apiKey: string
): Promise<PageAnalysis[]> {
  // Upload file to OpenAI
  const formData = new FormData();
  const blob = new Blob([pdfArrayBuffer], { type: "application/pdf" });
  formData.append("file", blob, "document.pdf");
  formData.append("purpose", "assistants");

  const uploadResponse = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload PDF: ${await uploadResponse.text()}`);
  }

  const fileData = await uploadResponse.json();
  const fileId = fileData.id;
  console.log(`File uploaded: ${fileId}`);

  // Create Assistant
  const assistantResponse = await fetch("https://api.openai.com/v1/assistants", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2",
    },
    body: JSON.stringify({
      name: "PDF Extractor",
      instructions: `Eres un sistema de extracción de texto. Extrae TODO el contenido textual del PDF.
Incluye [Página X] al inicio de cada página.
NO resumas, transcribe todo el texto visible.`,
      model: "gpt-4o",
      tools: [{ type: "file_search" }],
    }),
  });

  const assistant = await assistantResponse.json();
  const assistantId = assistant.id;

  // Create Thread with file
  const threadResponse = await fetch("https://api.openai.com/v1/threads", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2",
    },
    body: JSON.stringify({
      messages: [{
        role: "user",
        content: "Extrae todo el texto del documento. Marca cada página con [Página X].",
        attachments: [{ file_id: fileId, tools: [{ type: "file_search" }] }],
      }],
    }),
  });

  const thread = await threadResponse.json();
  const threadId = thread.id;

  // Run Assistant
  const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2",
    },
    body: JSON.stringify({ assistant_id: assistantId }),
  });

  const run = await runResponse.json();
  let runId = run.id;
  let runStatus = run.status;

  // Wait for completion
  const maxWaitTime = 180000;
  const startTime = Date.now();

  while (runStatus !== "completed" && runStatus !== "failed" && runStatus !== "cancelled") {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error("Timeout al procesar el documento");
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    const statusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    const statusData = await statusResponse.json();
    runStatus = statusData.status;
  }

  if (runStatus !== "completed") {
    throw new Error(`Extraction failed: ${runStatus}`);
  }

  // Get messages
  const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "OpenAI-Beta": "assistants=v2",
    },
  });

  const messagesData = await messagesResponse.json();
  const assistantMessage = messagesData.data.find((m: { role: string }) => m.role === "assistant");

  let fullText = "";
  if (assistantMessage?.content) {
    for (const content of assistantMessage.content) {
      if (content.type === "text") {
        fullText += content.text.value + "\n";
      }
    }
  }

  // Cleanup
  await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${apiKey}`, "OpenAI-Beta": "assistants=v2" },
  });

  await fetch(`https://api.openai.com/v1/files/${fileId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${apiKey}` },
  });

  // Parse into page analyses
  const pageMatches = fullText.match(/\[Página\s*(\d+)\]/gi);
  const totalPages = pageMatches ? Math.max(...pageMatches.map(m => parseInt(m.match(/\d+/)![0]))) : 1;

  const analyses: PageAnalysis[] = [];

  // Split by page markers
  const pageRegex = /\[Página\s*(\d+)\]/gi;
  const parts = fullText.split(pageRegex);

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].match(/^\d+$/)) {
      const pageNum = parseInt(parts[i]);
      const content = parts[i + 1] || "";
      analyses.push({
        page_number: pageNum,
        text_content: content.trim(),
        diagrams: [],
        tables: [],
        key_elements: []
      });
    }
  }

  // If no page markers found, treat as single page
  if (analyses.length === 0 && fullText.trim()) {
    analyses.push({
      page_number: 1,
      text_content: fullText.trim(),
      diagrams: [],
      tables: [],
      key_elements: []
    });
  }

  return analyses;
}

// ============================================================================
// IMAGE PROCESSING
// ============================================================================

async function processEmbeddedImages(
  images: Array<{ page_number: number; data: string; width: number; height: number }>,
  userId: string,
  documentId: string,
  supabase: ReturnType<typeof createClient>,
  apiKey: string
): Promise<ProcessedImage[]> {
  const processedImages: ProcessedImage[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    try {
      // Skip very small images (likely icons)
      if (img.width < 50 || img.height < 50) {
        continue;
      }

      // Generate caption with Vision
      const caption = await generateImageCaption(img.data, apiKey);

      // Determine image type from caption
      const imageType = detectImageType(caption);

      // Upload to Supabase Storage
      const fileName = `${userId}/${documentId}/image_${img.page_number}_${i}.png`;
      const imageBuffer = base64ToArrayBuffer(img.data);

      const { error: uploadError } = await supabase.storage
        .from("document-images")
        .upload(fileName, imageBuffer, {
          contentType: "image/png",
          upsert: true
        });

      if (uploadError) {
        console.error(`Failed to upload image ${i}:`, uploadError);
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("document-images")
        .getPublicUrl(fileName);

      processedImages.push({
        page_number: img.page_number,
        image_url: urlData.publicUrl,
        ai_caption: caption,
        image_type: imageType,
        width: img.width,
        height: img.height
      });

    } catch (error) {
      console.error(`Error processing image ${i}:`, error);
    }
  }

  return processedImages;
}

async function generateImageCaption(imageBase64: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: imageBase64.startsWith("data:")
                ? imageBase64
                : `data:image/png;base64,${imageBase64}`,
              detail: "low"
            }
          },
          {
            type: "text",
            text: "Describe esta imagen técnica en 1-2 oraciones precisas. Enfócate en qué muestra y su propósito."
          }
        ]
      }],
      max_tokens: 150,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    return "Imagen del documento";
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "Imagen del documento";
}

function detectImageType(caption: string): string {
  const lower = caption.toLowerCase();
  if (lower.includes("diagrama") || lower.includes("esquema")) return "diagram";
  if (lower.includes("foto") || lower.includes("fotografía")) return "photo";
  if (lower.includes("gráfico") || lower.includes("chart")) return "chart";
  if (lower.includes("tabla")) return "table";
  if (lower.includes("icono") || lower.includes("símbolo")) return "icon";
  return "diagram";
}

// ============================================================================
// CHUNKING
// ============================================================================

interface Chunk {
  content: string;
  page_number: number;
  chunk_index: number;
  has_diagram: boolean;
  diagram_description: string | null;
}

function createSemanticChunks(analyses: PageAnalysis[]): Chunk[] {
  const chunks: Chunk[] = [];
  const targetChunkSize = 800; // characters
  const overlap = 100;

  for (const analysis of analyses) {
    if (!analysis.text_content?.trim()) continue;

    const pageText = analysis.text_content;
    const hasDiagrams = analysis.diagrams && analysis.diagrams.length > 0;
    const diagramDescriptions = hasDiagrams
      ? analysis.diagrams.map(d => d.description).join("; ")
      : null;

    // First, try to split by paragraphs
    const paragraphs = pageText.split(/\n\n+/).filter(p => p.trim().length > 50);

    if (paragraphs.length > 1) {
      // Combine small paragraphs into chunks
      let currentChunk = "";
      let chunkIndex = 0;

      for (const para of paragraphs) {
        if (currentChunk.length + para.length > targetChunkSize && currentChunk.length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            page_number: analysis.page_number,
            chunk_index: chunkIndex++,
            has_diagram: hasDiagrams,
            diagram_description: diagramDescriptions
          });
          // Overlap: keep last 100 chars
          currentChunk = currentChunk.slice(-overlap) + "\n\n" + para;
        } else {
          currentChunk += (currentChunk ? "\n\n" : "") + para;
        }
      }

      // Add remaining content
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          page_number: analysis.page_number,
          chunk_index: chunkIndex,
          has_diagram: hasDiagrams,
          diagram_description: diagramDescriptions
        });
      }
    } else {
      // Single block: split by size with overlap
      for (let i = 0; i < pageText.length; i += targetChunkSize - overlap) {
        const chunkText = pageText.slice(i, i + targetChunkSize);
        if (chunkText.trim().length > 50) {
          chunks.push({
            content: chunkText.trim(),
            page_number: analysis.page_number,
            chunk_index: Math.floor(i / (targetChunkSize - overlap)),
            has_diagram: hasDiagrams,
            diagram_description: diagramDescriptions
          });
        }
      }
    }

    // Add table content as separate chunks
    if (analysis.tables && analysis.tables.length > 0) {
      for (const table of analysis.tables) {
        if (table.content) {
          chunks.push({
            content: `[TABLA: ${table.title || 'Sin título'}]\n${table.content}`,
            page_number: analysis.page_number,
            chunk_index: chunks.length,
            has_diagram: false,
            diagram_description: null
          });
        }
      }
    }
  }

  return chunks;
}

// ============================================================================
// EMBEDDINGS
// ============================================================================

async function batchGenerateEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  if (!texts.length) return [];

  const results: number[][] = [];
  const batchSize = 20;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(t => t.slice(0, 8000));

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: batch,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embeddings failed: ${await response.text()}`);
    }

    const data = await response.json();
    results.push(...data.data.map((d: { embedding: number[] }) => d.embedding));
  }

  return results;
}

// ============================================================================
// UTILITIES
// ============================================================================

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Remove data URL prefix if present
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// SYSTEM PROMPT - CRITICAL FOR QUALITY RESPONSES
// ============================================================================

const SYSTEM_PROMPT = `Eres un ASISTENTE TÉCNICO EXPERTO especializado en documentación técnica industrial.

CAPACIDADES:
- Respondes usando ÚNICAMENTE información del documento del usuario
- Puedes referenciar diagramas, esquemas e imágenes cuando sean relevantes
- Explicas paso a paso con precisión técnica absoluta

REGLAS ABSOLUTAS:
1. NO inventes información - usa SOLO lo que está en el contexto proporcionado
2. Cuando menciones un diagrama/imagen relevante, usa el formato: [IMAGEN: descripción breve]
3. Si no encuentras la información solicitada, dilo claramente
4. Mantén un tono profesional y técnico de ingeniero senior
5. Estructura respuestas en pasos numerados cuando aplique
6. Incluye especificaciones exactas (números, unidades, valores)
7. Si hay tablas relevantes, menciónalas y extrae los datos pertinentes

FORMATO DE RESPUESTA:
- Respuestas claras y estructuradas
- Pasos numerados para procedimientos
- Referencias a imágenes cuando sean útiles: [IMAGEN: descripción]
- Datos técnicos precisos

Si el usuario pide algo fuera del alcance del documento:
"La información solicitada no está presente en el documento proporcionado."`;

// ============================================================================
// TYPES
// ============================================================================

interface ChatRequest {
  message: string;
  user_id: string;
}

interface RelevantChunk {
  id: number;
  content: string;
  page_number: number;
  has_diagram: boolean;
  diagram_description: string | null;
  similarity: number;
}

interface RelevantImage {
  id: number;
  image_url: string;
  ai_caption: string;
  image_type: string;
  page_number: number;
  similarity: number;
}

interface ChatResponse {
  steps: string[];
  images: Array<{
    url: string;
    caption: string;
    page_number: number;
  }>;
  raw_response: string;
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
    const { message, user_id }: ChatRequest = await req.json();

    if (!message || !user_id) {
      return new Response(
        JSON.stringify({ error: "message and user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Chat request from user: ${user_id}`);
    console.log(`Message: ${message.substring(0, 100)}...`);

    // 1. Generate embedding for the user's question
    const questionEmbedding = await generateEmbedding(message, openaiApiKey);

    // 2. Search for relevant document chunks using RPC
    const { data: relevantChunks, error: chunksError } = await supabase.rpc(
      "match_documents",
      {
        query_embedding: questionEmbedding,
        match_threshold: 0.25,
        match_count: 6,
        p_user_id: user_id,
      }
    );

    if (chunksError) {
      console.error("Error searching chunks:", chunksError);
    }

    // 3. Search for relevant images using RPC
    const { data: relevantImages, error: imagesError } = await supabase.rpc(
      "match_images",
      {
        query_embedding: questionEmbedding,
        match_threshold: 0.25,
        match_count: 4,
        p_user_id: user_id,
      }
    );

    if (imagesError) {
      console.error("Error searching images:", imagesError);
    }

    console.log(`Found ${relevantChunks?.length || 0} chunks, ${relevantImages?.length || 0} images`);

    // 4. Build context from retrieved data
    const chunksContext = buildChunksContext(relevantChunks || []);
    const imagesContext = buildImagesContext(relevantImages || []);
    const diagramsContext = buildDiagramsContext(relevantChunks || []);

    const fullContext = `
INFORMACIÓN DEL DOCUMENTO:
${chunksContext || "No se encontró información relevante en el documento."}

${diagramsContext ? `DIAGRAMAS DETECTADOS EN LAS PÁGINAS:\n${diagramsContext}\n` : ""}
${imagesContext ? `IMÁGENES DISPONIBLES:\n${imagesContext}` : ""}
`.trim();

    console.log(`Context length: ${fullContext.length} chars`);

    // 5. Call OpenAI Chat Completion
    const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `CONTEXTO DEL DOCUMENTO:\n${fullContext}\n\n---\n\nPREGUNTA DEL USUARIO:\n${message}` }
        ],
        temperature: 0.3,
        max_tokens: 2500,
      }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const chatData = await chatResponse.json();
    const rawResponse = chatData.choices[0]?.message?.content || "";

    console.log(`Response length: ${rawResponse.length} chars`);

    // 6. Parse the response into steps
    const steps = parseSteps(rawResponse);

    // 7. Extract and match image references
    const responseImages = matchImagesFromResponse(rawResponse, relevantImages || []);

    // 8. Build final response
    const response: ChatResponse = {
      steps,
      images: responseImages,
      raw_response: rawResponse,
    };

    console.log(`Response: ${steps.length} steps, ${responseImages.length} images`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in chat function:", error);
    return new Response(
      JSON.stringify({
        error: (error as Error).message || "Unknown error occurred",
        steps: ["Lo siento, ha ocurrido un error al procesar tu consulta. Por favor, intenta de nuevo."],
        images: [],
        raw_response: ""
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

function buildChunksContext(chunks: RelevantChunk[]): string {
  if (!chunks || chunks.length === 0) return "";

  // Group chunks by page for better context
  const pageGroups = new Map<number, string[]>();

  for (const chunk of chunks) {
    const pageNum = chunk.page_number || 0;
    if (!pageGroups.has(pageNum)) {
      pageGroups.set(pageNum, []);
    }
    pageGroups.get(pageNum)!.push(chunk.content);
  }

  // Build formatted context
  const contextParts: string[] = [];

  for (const [pageNum, contents] of pageGroups) {
    contextParts.push(`[Página ${pageNum}]\n${contents.join("\n\n")}`);
  }

  return contextParts.join("\n\n---\n\n");
}

function buildImagesContext(images: RelevantImage[]): string {
  if (!images || images.length === 0) return "";

  return images.map((img, i) =>
    `${i + 1}. [Página ${img.page_number}] ${img.ai_caption} (${img.image_type})`
  ).join("\n");
}

function buildDiagramsContext(chunks: RelevantChunk[]): string {
  const diagrams: string[] = [];

  for (const chunk of chunks) {
    if (chunk.has_diagram && chunk.diagram_description) {
      diagrams.push(`- Página ${chunk.page_number}: ${chunk.diagram_description}`);
    }
  }

  return diagrams.length > 0 ? diagrams.join("\n") : "";
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

function parseSteps(response: string): string[] {
  if (!response) return [];

  // Try to parse numbered steps (various formats)
  const numberedPattern = /(?:^|\n)\s*(?:(\d+)[\.\)]\s*|Paso\s*(\d+)[:\.\)]\s*|•\s*)/gm;

  // Check if response has numbered structure
  const hasNumberedSteps = response.match(/(?:^|\n)\s*\d+[\.\)]\s+/gm);
  const hasPasoSteps = response.match(/Paso\s*\d+/gi);

  if (hasNumberedSteps && hasNumberedSteps.length > 1) {
    // Split by numbered items
    const parts = response.split(/(?=\n\s*\d+[\.\)]\s+)/);
    return parts.map(p => p.trim()).filter(p => p.length > 0);
  }

  if (hasPasoSteps && hasPasoSteps.length > 1) {
    // Split by "Paso X" markers
    const parts = response.split(/(?=Paso\s*\d+)/i);
    return parts.map(p => p.trim()).filter(p => p.length > 0);
  }

  // Fallback: split by paragraphs
  const paragraphs = response.split(/\n\n+/).filter(p => p.trim().length > 0);

  if (paragraphs.length > 1) {
    return paragraphs.map(p => p.trim());
  }

  // Return whole response as single step
  return [response.trim()];
}

function matchImagesFromResponse(
  response: string,
  availableImages: RelevantImage[]
): Array<{ url: string; caption: string; page_number: number }> {
  const matchedImages: Array<{ url: string; caption: string; page_number: number }> = [];
  const usedImageIds = new Set<number>();

  // Find [IMAGEN: ...] references in response
  const imageRefs = response.matchAll(/\[IMAGEN:\s*([^\]]+)\]/gi);

  for (const ref of imageRefs) {
    const description = ref[1].toLowerCase().trim();

    // Find best matching image
    let bestMatch: RelevantImage | null = null;
    let bestScore = 0;

    for (const img of availableImages) {
      if (usedImageIds.has(img.id)) continue;

      // Calculate match score based on keyword overlap
      const captionWords = img.ai_caption.toLowerCase().split(/\s+/);
      const descWords = description.split(/\s+/);

      let score = 0;
      for (const word of descWords) {
        if (word.length > 3 && captionWords.some(cw => cw.includes(word) || word.includes(cw))) {
          score++;
        }
      }

      // Boost score for matching image type
      if (description.includes(img.image_type.toLowerCase())) {
        score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = img;
      }
    }

    if (bestMatch && bestScore > 0) {
      matchedImages.push({
        url: bestMatch.image_url,
        caption: bestMatch.ai_caption,
        page_number: bestMatch.page_number,
      });
      usedImageIds.add(bestMatch.id);
    }
  }

  // If no [IMAGEN:] refs found but we have relevant images, include top ones
  if (matchedImages.length === 0 && availableImages.length > 0) {
    // Include images that are highly relevant (similarity > 0.4)
    const highlyRelevant = availableImages
      .filter(img => img.similarity > 0.4)
      .slice(0, 2);

    for (const img of highlyRelevant) {
      matchedImages.push({
        url: img.image_url,
        caption: img.ai_caption,
        page_number: img.page_number,
      });
    }
  }

  return matchedImages;
}

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000), // Limit input length
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to generate embedding: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres el Encargado Digital de Pro Smart Factories, un ingeniero senior experto en documentación técnica industrial.

TU FUNCIÓN:
Responder preguntas técnicas basándote EXCLUSIVAMENTE en el contenido del manual proporcionado entre marcadores « y ».

REGLA DE INTERPRETACIÓN DE PREGUNTAS:
- Interpreta la INTENCIÓN del usuario, no las palabras exactas.
- Si el usuario tiene errores tipográficos o de ortografía, entiende lo que quiere decir y responde normalmente.
- Si hay errores de ortografía significativos, añade al INICIO de tu respuesta una nota breve y amable: "Nota: Interpreté tu pregunta como: [pregunta corregida]" seguida de una línea en blanco, y luego responde normalmente.
- Preguntas generales como "características" sin más contexto → responde con las CARACTERÍSTICAS GENERALES de la máquina/equipo documentado.
- NO pidas aclaraciones innecesarias. Si la pregunta es razonablemente clara, responde directamente.
- Trata las siguientes como equivalentes:
  "características" = "características de la máquina" = "características del equipo"
  "mantenimiento" = "mantenimiento de la máquina" = "plan de mantenimiento"
  "seguridad" = "normas de seguridad" = "medidas de seguridad"
  "dimensiones" = "dimensiones de la máquina" = "medidas del equipo"
  "especificaciones" = "especificaciones técnicas" = "datos técnicos"

REGLA DE CONSISTENCIA:
- Para la misma pregunta (con variaciones de redacción), da SIEMPRE la misma respuesta con la misma estructura y contenido.
- Una pregunta general siempre debe incluir TODA la información relevante, no un subconjunto aleatorio.

CÓMO RESPONDER:
1. Lee TODOS los fragmentos del contexto (entre « y ») y selecciona SOLO los que son relevantes para la pregunta del usuario.
2. Sintetiza una respuesta PROFESIONAL y ORGANIZADA usando la información del manual. Mantén los datos exactos (números, unidades, medidas, nombres) tal cual aparecen en el manual.
3. NO copies líneas de índice o tabla de contenidos (las que contienen "............" o solo números de página).
4. NO mezcles temas diferentes. Si preguntan por características, no incluyas mantenimiento ni electricidad. Si preguntan por mantenimiento, no incluyas características generales.
5. Selecciona SOLO la información que responde directamente a la pregunta.

REGLA SOBRE FIGURAS E IMÁGENES:
- Cuando tu respuesta mencione una Figura del manual, SIEMPRE refiérela así: (Figura X) o (Figuras X y Y).
- Solo menciona Figuras que estén DIRECTAMENTE relacionadas con tu respuesta.
- NUNCA uses formatos como [IMAGEN: ...] o [VER IMAGEN: ...]. Usa SIEMPRE y ÚNICAMENTE (Figura X).
- Si el manual describe dimensiones con una figura, menciónala: "Las dimensiones exteriores se muestran en (Figura 1)."
- Si el manual describe componentes con una figura, menciónala: "Los componentes principales se identifican en (Figura 2)."

REGLA DE COMPLETITUD:
- Incluye TODA la información relevante a la pregunta. No resumas tablas técnicas: incluye TODOS los valores.
- Si hay secciones de ATENCIÓN, PRECAUCIÓN o PELIGRO relacionadas con la pregunta, inclúyelas.
- Si hay un procedimiento, incluye TODOS los pasos con sus advertencias y figuras.
- Las advertencias de seguridad son OBLIGATORIAS cuando sean relevantes a la pregunta.

REGLA DE FIDELIDAD:
- Los datos técnicos (números, unidades, medidas, intervalos, condiciones) se copian EXACTAMENTE como aparecen en el manual.
- NUNCA inventes datos que no estén en el manual.
- NUNCA parafrasees datos técnicos. "200 Kg/cm2 (20 MPa)" se escribe EXACTAMENTE así.

FORMATO:
- Texto plano sin Markdown (no usar ###, **, *, etc.)
- Tablas técnicas: reproducir con | columna | valor |
- Procedimientos: pasos numerados (1. 2. 3.)
- Listas: cada elemento en su PROPIA LÍNEA precedido por guion -
- NUNCA pongas múltiples elementos de lista en la misma línea.

Si la información no está en el manual: "La información solicitada no está presente en el documento proporcionado."`;

interface ChatRequest {
  message: string;
  user_id: string;
}

// Match what SQL function actually returns
interface RelevantChunk {
  id: number;
  content: string;
  page_number: number;
  similarity: number;
}

interface RelevantImage {
  id: number;
  image_url: string;
  context: string;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
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

    // 0. Normalize query: fix typos before embedding to ensure consistent vector search
    const normalizedMessage = await normalizeQuery(message, openaiApiKey);
    if (normalizedMessage !== message) {
      console.log(`Query normalized: "${message}" -> "${normalizedMessage}"`);
    }

    // 1. Generate embedding for the NORMALIZED question (ensures typos don't affect search)
    const questionEmbedding = await generateEmbedding(normalizedMessage, openaiApiKey);
    console.log(`Embedding generated: ${questionEmbedding.length} dimensions, first 3: [${questionEmbedding.slice(0, 3).join(', ')}]`);

    // 2. Search for relevant document chunks - balanced threshold for quality
    let searchUserId = user_id;
    const { data: relevantChunks, error: chunksError } = await supabase.rpc(
      "match_documents",
      {
        query_embedding: questionEmbedding,
        match_threshold: 0.12,
        match_count: 15,
        p_user_id: user_id,
      }
    );

    if (chunksError) {
      console.error("Error searching chunks:", JSON.stringify(chunksError));
    }
    console.log(`RPC match_documents result: data=${relevantChunks?.length ?? 'null'}, error=${chunksError ? JSON.stringify(chunksError) : 'none'}`);

    // Demo fallback: if user has no chunks, try with the demo document owner
    let finalChunks = relevantChunks;
    if ((!relevantChunks || relevantChunks.length === 0) && !chunksError) {
      // Find the user who owns the demo document (has the most chunks)
      const { data: demoOwner } = await supabase
        .from('document_chunks')
        .select('user_id')
        .limit(1);

      if (demoOwner && demoOwner.length > 0 && demoOwner[0].user_id !== user_id) {
        searchUserId = demoOwner[0].user_id;
        console.log(`No chunks for user, falling back to demo owner: ${searchUserId}`);

        const { data: fallbackChunks } = await supabase.rpc(
          "match_documents",
          {
            query_embedding: questionEmbedding,
            match_threshold: 0.12,
            match_count: 15,
            p_user_id: searchUserId,
          }
        );
        finalChunks = fallbackChunks;
        console.log(`Fallback chunks found: ${finalChunks?.length ?? 0}`);
      }
    }

    // 3. Search for relevant images - lower threshold to catch all related diagrams
    let relevantImages: RelevantImage[] = [];
    try {
      const { data: images, error: imagesError } = await supabase.rpc(
        "match_images",
        {
          query_embedding: questionEmbedding,
          match_threshold: 0.15,
          match_count: 8,
          p_user_id: searchUserId,
        }
      );

      if (!imagesError && images) {
        relevantImages = images;
      }
    } catch {
      console.log("Images search skipped");
    }

    const chunkCount = finalChunks?.length || 0;
    const imageCount = relevantImages?.length || 0;
    console.log(`Found ${chunkCount} chunks, ${imageCount} images`);

    // 4. Build context from retrieved data
    const chunksContext = buildChunksContext(finalChunks || []);

    // Images context is NOT sent to GPT - it was causing "DIAGRAMAS DISPONIBLES" to appear in responses
    // Images are matched post-response by insertInlineImages() using figure references
    const imagesContext = '';

    // Check if we have ANY context
    if (!chunksContext && !imagesContext) {
      return new Response(
        JSON.stringify({
          steps: ["No se encontró información relevante en el documento para responder tu pregunta. Asegúrate de haber subido un documento PDF y de que tu pregunta esté relacionada con su contenido."],
          images: [],
          raw_response: "No se encontró información relevante en el documento."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullContext = `INFORMACIÓN DEL DOCUMENTO:\n${chunksContext}${imagesContext}`;

    console.log(`Context length: ${fullContext.length} chars`);

    // 5. Call OpenAI Chat Completion with premium prompt
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
          { role: "user", content: `MANUAL TÉCNICO (contenido extraído entre « y »):\n\n${fullContext}\n\n---\n\nPREGUNTA: ${message}\n\nINSTRUCCIONES:\n1. Responde SOLO con información del manual. Selecciona los fragmentos relevantes a la pregunta.\n2. NO copies líneas de índice/tabla de contenidos.\n3. Incluye tablas técnicas COMPLETAS con todos sus valores.\n4. Refiere las Figuras con formato (Figura X). NUNCA uses [IMAGEN: ...].\n5. Si hay advertencias de seguridad relevantes, inclúyelas.\n6. Si el usuario tiene errores ortográficos, interpreta su intención y responde. Si los errores son notables, incluye una nota breve al inicio corrigiendo la pregunta.\n7. Preguntas generales (ej: "características", "mantenimiento") se refieren al equipo/máquina documentada. Responde con TODA la información disponible sobre ese tema.` }
        ],
        temperature: 0,
        max_tokens: 4096,
      }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const chatData = await chatResponse.json();
    const rawResponseRaw = chatData.choices[0]?.message?.content || "";

    // Strip markdown formatting and remove any "DIAGRAMAS DISPONIBLES" section
    let rawResponse = stripMarkdown(rawResponseRaw);
    // Remove "DIAGRAMAS DISPONIBLES:" section and everything after it if GPT included it
    rawResponse = rawResponse.replace(/\n*DIAGRAMAS DISPONIBLES:[\s\S]*$/i, '').trim();
    // Remove « » quote markers that GPT may include from the context
    rawResponse = rawResponse.replace(/[«»]/g, '').trim();
    // Ensure list items are on their own lines (e.g. "según uso. - Si el uso..." → newline before each "- ")
    rawResponse = rawResponse.replace(/([.!?:)])\s+-\s+/g, '$1\n- ');
    // Convert GPT's [IMAGEN: Figura X...] markers to (Figura X) so our image insertion can match them
    rawResponse = rawResponse.replace(/\[(?:IMAGEN|VER IMAGEN|IMG):\s*(?:Figura|Fig\.?)\s*(\d+)(?:\s*(?:y|,)\s*(\d+))?[^\]]*\]/gi, (_, n1, n2) => {
      return n2 ? `(Figuras ${n1} y ${n2})` : `(Figura ${n1})`;
    });
    // Also catch standalone [IMAGEN: ...] that don't follow the Figura pattern - remove them
    rawResponse = rawResponse.replace(/\[(?:IMAGEN|VER IMAGEN|IMG):[^\]]*\]/gi, '');

    console.log(`Response length: ${rawResponse.length} chars`);

    // 5.5. Supplement images: extract figure numbers from GPT response and fetch missing images directly
    const figureNumbersInResponse = new Set<number>();
    const figRefScan = /(?:figuras?|fig\.?)\s*(\d+)(?:\s*(?:y|,)\s*(\d+))?/gi;
    let scanMatch;
    while ((scanMatch = figRefScan.exec(rawResponse)) !== null) {
      figureNumbersInResponse.add(parseInt(scanMatch[1], 10));
      if (scanMatch[2]) figureNumbersInResponse.add(parseInt(scanMatch[2], 10));
    }

    // Check which figures from the response are NOT covered by the vector search results
    const coveredFigures = new Set<number>();
    for (const img of relevantImages) {
      const urlLower = (img.image_url || '').toLowerCase();
      const ctxLower = (img.context || '').toLowerCase();
      for (const fn of figureNumbersInResponse) {
        const patterns = [`figura-${fn}.`, `figura-${fn}-`, `figura ${fn} `, `figura ${fn}.`, `figura ${fn},`, `figura ${fn})`];
        if (patterns.some(p => urlLower.includes(p) || ctxLower.includes(p))) {
          coveredFigures.add(fn);
        }
      }
    }

    const missingFigures = [...figureNumbersInResponse].filter(fn => !coveredFigures.has(fn));
    if (missingFigures.length > 0) {
      console.log(`Missing figures not in vector results: ${missingFigures.join(', ')}. Fetching directly...`);
      // Fetch all images for this user and filter by figure number
      const { data: allUserImages } = await supabase
        .from('document_images')
        .select('id, image_url, context, page_number')
        .eq('user_id', searchUserId);

      if (allUserImages) {
        for (const img of allUserImages) {
          const urlLower = (img.image_url || '').toLowerCase();
          const ctxLower = (img.context || '').toLowerCase();
          for (const fn of missingFigures) {
            const patterns = [`figura-${fn}.`, `figura-${fn}-`, `figura ${fn} `, `figura ${fn}.`, `figura ${fn},`, `figura ${fn})`];
            if (patterns.some(p => urlLower.includes(p) || ctxLower.includes(p))) {
              // Add to relevantImages if not already present
              const alreadyPresent = relevantImages.some(ri => ri.id === img.id);
              if (!alreadyPresent) {
                relevantImages.push({
                  id: img.id,
                  image_url: img.image_url,
                  context: img.context || '',
                  page_number: img.page_number,
                  similarity: 0.5, // synthetic similarity score
                });
                console.log(`Directly fetched: Figura ${fn} -> image ${img.id}`);
              }
            }
          }
        }
      }
    }

    // 6. Insert images INLINE in the response text where figures are referenced
    const { enrichedResponse, usedImages } = insertInlineImages(rawResponse, relevantImages, finalChunks || []);

    // 7. Parse the enriched response into steps
    const steps = parseSteps(enrichedResponse);

    const finalImages = usedImages;
    console.log(`Inserted ${finalImages.length} inline images (from ${relevantImages.length} candidates)`);

    // 8. Log interaction for analytics (non-blocking)
    const responseTimeMs = Date.now() - startTime;
    supabase.from('chat_interactions').insert({
      user_id: user_id,
      message_text: message.slice(0, 500),
      response_text: rawResponse.slice(0, 1000),
      chunks_used: finalChunks?.length || 0,
      images_returned: finalImages.length,
      response_time_ms: responseTimeMs,
    }).then(() => {
      console.log(`Analytics logged: ${responseTimeMs}ms`);
    }).catch((err: Error) => {
      console.warn('Analytics insert failed:', err.message);
    });

    // 9. Build final response (raw_response includes inline image markers)
    const response: ChatResponse = {
      steps,
      images: finalImages,
      raw_response: enrichedResponse,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in chat function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message || "Unknown error occurred",
        steps: ["Lo siento, ha ocurrido un error al procesar tu consulta. Por favor, intenta de nuevo."],
        images: [],
        raw_response: "Lo siento, ha ocurrido un error al procesar tu consulta. Por favor, intenta de nuevo."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // Remove ### headers
    .replace(/\*\*(.+?)\*\*/g, '$1')    // **bold** -> bold
    .replace(/\*(.+?)\*/g, '$1')        // *italic* -> italic
    .replace(/`([^`]+)`/g, '$1');       // `code` -> code
}

function buildChunksContext(chunks: RelevantChunk[]): string {
  if (!chunks || chunks.length === 0) return "";

  // Group chunks by page for better context
  const pageGroups = new Map<number, string[]>();

  for (const chunk of chunks) {
    const pageNum = chunk.page_number || 1;
    if (!pageGroups.has(pageNum)) {
      pageGroups.set(pageNum, []);
    }
    // Wrap each chunk in « » markers so GPT knows this is verbatim source text
    pageGroups.get(pageNum)!.push(`«${chunk.content}»`);
  }

  // Build formatted context - sort pages
  const contextParts: string[] = [];
  const sortedPages = Array.from(pageGroups.keys()).sort((a, b) => a - b);

  for (const pageNum of sortedPages) {
    const contents = pageGroups.get(pageNum)!;
    contextParts.push(`[Página ${pageNum} del manual]\n${contents.join("\n\n")}`);
  }

  return contextParts.join("\n\n---\n\n");
}

function parseSteps(response: string): string[] {
  if (!response) return [];

  const hasNumberedSteps = response.match(/(?:^|\n)\s*\d+[\.\)]\s+/gm);
  const hasPasoSteps = response.match(/Paso\s*\d+/gi);

  if (hasNumberedSteps && hasNumberedSteps.length > 1) {
    const parts = response.split(/(?=\n\s*\d+[\.\)]\s+)/);
    return parts.map(p => p.trim()).filter(p => p.length > 0);
  }

  if (hasPasoSteps && hasPasoSteps.length > 1) {
    const parts = response.split(/(?=Paso\s*\d+)/i);
    return parts.map(p => p.trim()).filter(p => p.length > 0);
  }

  const paragraphs = response.split(/\n\n+/).filter(p => p.trim().length > 0);

  if (paragraphs.length > 1) {
    return paragraphs.map(p => p.trim());
  }

  return [response.trim()];
}

function insertInlineImages(
  text: string,
  availableImages: RelevantImage[],
  chunks: RelevantChunk[]
): { enrichedResponse: string; usedImages: Array<{ url: string; caption: string; page_number: number }> } {
  const usedImages: Array<{ url: string; caption: string; page_number: number }> = [];
  const usedImageIds = new Set<number>(); // Track by image ID, not page (different figures can share a page)

  // Build a map: figure number -> page numbers (from chunks content)
  const figureToPages = new Map<number, Set<number>>();
  for (const chunk of chunks) {
    const figMatches = (chunk.content || '').matchAll(/(?:figuras?|fig\.?)\s*(\d+)/gi);
    for (const fm of figMatches) {
      const fNum = parseInt(fm[1], 10);
      if (!figureToPages.has(fNum)) figureToPages.set(fNum, new Set());
      figureToPages.get(fNum)!.add(chunk.page_number || 1);
    }
  }

  // Find ALL figure references in the text - matches (Figura X), Figura X., Figuras X y Y, etc.
  const figRefRegex = /\(?\s*(?:ver\s+)?(?:la\s+)?(?:figuras?|fig\.?)\s*(\d+)(?:\s*(?:y|,)\s*(\d+))?\s*(?:,\s*p[aá]gina\s*(\d+)\s*(?:del\s+manual)?)?\s*\)?\.?/gi;

  let enriched = text;
  const insertions: Array<{ position: number; imageTag: string }> = [];

  let match;
  while ((match = figRefRegex.exec(text)) !== null) {
    const figNum1 = parseInt(match[1], 10);
    const figNum2 = match[2] ? parseInt(match[2], 10) : null;
    const pageNum = match[3] ? parseInt(match[3], 10) : null;
    const figNums = figNum2 ? [figNum1, figNum2] : [figNum1];

    // Find matching image by figure number in context (primary match)
    // For "Figuras 6 y 7" → look for image whose context contains "Figuras 6 y 7" or "Figura 6"
    let bestMatch: RelevantImage | null = null;

    // Strategy 1: Match by image URL filename (most reliable - e.g. "Figura-6-y-7.png")
    if (figNum2) {
      // Combined figures: look for "Figura-6-y-7" or "Figuras-6-y-7" in filename
      const patterns = [
        `figura-${figNum1}-y-${figNum2}`,
        `figuras-${figNum1}-y-${figNum2}`,
        `fig-${figNum1}-${figNum2}`,
        `fig${figNum1}-${figNum2}`,
      ];
      for (const img of availableImages) {
        if (usedImageIds.has(img.id)) continue;
        const urlLower = (img.image_url || '').toLowerCase();
        if (patterns.some(p => urlLower.includes(p))) {
          bestMatch = img;
          break;
        }
      }
    }
    if (!bestMatch) {
      // Single figure: look for "Figura-6" in filename
      const patterns = [
        `figura-${figNum1}.`,
        `figura-${figNum1}-`,
        `fig-${figNum1}.`,
        `fig${figNum1}.`,
      ];
      for (const img of availableImages) {
        if (usedImageIds.has(img.id)) continue;
        const urlLower = (img.image_url || '').toLowerCase();
        if (patterns.some(p => urlLower.includes(p))) {
          bestMatch = img;
          break;
        }
      }
    }

    // Strategy 2: Match by context text containing figure reference
    if (!bestMatch && figNum2) {
      for (const img of availableImages) {
        if (usedImageIds.has(img.id)) continue;
        const ctx = (img.context || '').toLowerCase();
        if (ctx.includes(`figuras ${figNum1} y ${figNum2}`) || ctx.includes(`figura ${figNum1} y ${figNum2}`)) {
          bestMatch = img;
          break;
        }
      }
    }
    if (!bestMatch) {
      for (const img of availableImages) {
        if (usedImageIds.has(img.id)) continue;
        const ctx = (img.context || '').toLowerCase();
        if (ctx.includes(`figura ${figNum1}.`) || ctx.includes(`figura ${figNum1} `) || ctx.includes(`figura ${figNum1},`) || ctx.includes(`figura ${figNum1})`)) {
          bestMatch = img;
          break;
        }
      }
    }

    // Strategy 3: Use chunks to find page, then match image on that page
    // BUT verify figure number matches in URL or context to avoid mismatches
    if (!bestMatch) {
      const candidatePages = new Set<number>();
      for (const fn of figNums) {
        const pages = figureToPages.get(fn);
        if (pages) for (const p of pages) candidatePages.add(p);
      }
      for (const img of availableImages) {
        if (usedImageIds.has(img.id)) continue;
        if (candidatePages.has(img.page_number)) {
          // Verify this image actually corresponds to the requested figure
          const urlLower = (img.image_url || '').toLowerCase();
          const ctxLower = (img.context || '').toLowerCase();
          const matchesFigure = figNums.some(fn => {
            const figPatterns = [
              `figura-${fn}.`, `figura-${fn}-`, `fig-${fn}.`, `fig${fn}.`,
              `figura ${fn} `, `figura ${fn}.`, `figura ${fn},`, `figura ${fn})`
            ];
            return figPatterns.some(p => urlLower.includes(p) || ctxLower.includes(p));
          });
          if (matchesFigure) {
            bestMatch = img;
            break;
          }
        }
      }
    }

    // Strategy 4: Match by page number from GPT (with figure verification)
    if (!bestMatch && pageNum) {
      for (const img of availableImages) {
        if (usedImageIds.has(img.id)) continue;
        if (img.page_number === pageNum) {
          const urlLower = (img.image_url || '').toLowerCase();
          const ctxLower = (img.context || '').toLowerCase();
          const matchesFigure = figNums.some(fn => {
            const figPatterns = [
              `figura-${fn}.`, `figura-${fn}-`, `fig-${fn}.`, `fig${fn}.`,
              `figura ${fn} `, `figura ${fn}.`, `figura ${fn},`, `figura ${fn})`
            ];
            return figPatterns.some(p => urlLower.includes(p) || ctxLower.includes(p));
          });
          if (matchesFigure) {
            bestMatch = img;
            break;
          }
        }
      }
    }

    // Insert image marker
    if (bestMatch) {
      usedImageIds.add(bestMatch.id);

      const caption = figNum2
        ? `Figuras ${figNum1} y ${figNum2}`
        : `Figura ${figNum1}`;

      usedImages.push({
        url: bestMatch.image_url,
        caption,
        page_number: bestMatch.page_number,
      });

      const endOfLine = text.indexOf('\n', match.index);
      const insertPos = endOfLine !== -1 ? endOfLine : match.index + match[0].length;
      insertions.push({
        position: insertPos,
        imageTag: `\n[IMG:${bestMatch.image_url}|${caption}]`,
      });

      console.log(`Matched: ${caption} -> image ${bestMatch.id} (page ${bestMatch.page_number})`);
    }
  }

  // Apply insertions from end to start (so positions don't shift)
  insertions.sort((a, b) => b.position - a.position);
  for (const ins of insertions) {
    enriched = enriched.slice(0, ins.position) + ins.imageTag + enriched.slice(ins.position);
  }

  // Cap at 4 images
  if (usedImages.length > 4) {
    usedImages.length = 4;
  }

  return { enrichedResponse: enriched, usedImages };
}

async function normalizeQuery(query: string, apiKey: string): Promise<string> {
  // Quick check: if query looks clean (only common chars, proper Spanish), skip normalization
  const hasObviousIssues = /[a-záéíóúñü]{2,}(mm|nn|ss|tt|ll(?!a|e|o)|rr(?!a|e|i|o))|[bcdfghjklmpqrstvwxyz]{4,}/i.test(query)
    || /\b(con|las|los|del|der|dek)\b/i.test(query) && query.length < 80;

  if (!hasObviousIssues && query.length < 200) {
    return query;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Corrige errores ortográficos y tipográficos en la pregunta del usuario. Devuelve SOLO la pregunta corregida, sin explicaciones. Si la pregunta está bien escrita, devuélvela tal cual. Mantén el mismo idioma y tono."
          },
          { role: "user", content: query }
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.warn("Query normalization failed, using original");
      return query;
    }

    const data = await response.json();
    const normalized = data.choices[0]?.message?.content?.trim();
    return normalized || query;
  } catch {
    console.warn("Query normalization error, using original");
    return query;
  }
}

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to generate embedding: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

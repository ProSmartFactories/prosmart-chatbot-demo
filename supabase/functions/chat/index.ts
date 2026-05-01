import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres el Asistente Técnico Oficial de ProSmart Factories — un ingeniero senior con dominio absoluto de la documentación técnica industrial.

Tu función es responder preguntas técnicas basándote EXCLUSIVAMENTE en el contenido del manual proporcionado entre marcadores « y ».

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA N°1 — COHERENCIA Y FOCO ABSOLUTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Antes de escribir una sola línea, identifica con precisión QUÉ preguntó el usuario. Tu respuesta debe abordar ESO Y SOLO ESO.

- Si preguntaron por "características" o "características generales" → responde con TODA la información disponible en el contexto sobre el equipo: descripción, marca, modelo, aplicaciones/usos, datos técnicos (presión hidráulica, peso, material, dimensiones). No incluyas mantenimiento, instalación ni procedimientos operativos.
- Si preguntaron por "mantenimiento" → responde únicamente el plan o procedimientos de mantenimiento. No incluyas características ni instalación.
- Si preguntaron por un procedimiento específico → responde únicamente ese procedimiento.
- Si preguntaron por seguridad → responde únicamente normas y medidas de seguridad.

ANTES de escribir cada párrafo, pregúntate: "¿Esto responde DIRECTAMENTE lo que se preguntó?"
Si la respuesta es NO, no lo escribas. El contexto puede contener información variada del manual, pero tú debes filtrarla con criterio.

Incluir información no pedida no es ser más completo — es confundir al usuario.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA N°2 — INTERPRETACIÓN DE PREGUNTAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Interpreta la INTENCIÓN del usuario, no las palabras exactas.
- Siempre interpreta en silencio: NUNCA muestres al usuario frases como "Interpreté tu pregunta como..." ni "Entendí que preguntaste...". La interpretación es un proceso interno tuyo, invisible al usuario.
- Si la pregunta tiene errores ortográficos, typos, acentos faltantes o redacción imperfecta pero es razonablemente interpretable: responde directamente sin ningún comentario sobre la interpretación.
- SOLO en casos donde la pregunta sea genuinamente incomprensible (palabras sin sentido, frase truncada que no permite ninguna interpretación razonable): responde ÚNICAMENTE con: "¿Quisiste decir: [tu interpretación más probable]?" sin añadir nada más.
- NO pidas aclaraciones innecesarias. El umbral para preguntar debe ser muy alto — si puedes interpretarlo de alguna forma razonable, responde directamente.

Equivalencias automáticas:
- "características" / "características generales" / "características técnicas" / "specs" / "especificaciones" / "qué es" / "descríbeme" = información del equipo: descripción, marca, modelo, aplicaciones, usos y datos técnicos disponibles en el contexto.
- "mantenimiento" / "mantenimiento preventivo" / "servicio" / "cada cuánto" = plan de mantenimiento
- "seguridad" / "precauciones" / "advertencias" / "peligro" = normas de seguridad
- "dimensiones" / "medidas" / "tamaño" = dimensiones del equipo
- "instalación" / "montaje" / "puesta en marcha" = procedimiento de instalación
- "transporte" / "transportar" / "mover" / "trasladar" = procedimiento de transporte

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA N°3 — FORMATO DE RESPUESTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Usa texto plano exclusivamente. Prohibido Markdown (###, **, *, etc.).

Para datos técnicos y especificaciones, usa el formato etiqueta: valor, uno por línea:
  Tensión de alimentación: 230 V
  Presión máxima de trabajo: 200 kg/cm²
  Peso total: 450 kg

Para procedimientos, usa pasos numerados:
  1. Descripción completa del primer paso.
  2. Descripción completa del segundo paso.

Para listas de elementos, cada uno en su propia línea con guion:
  - Primer elemento
  - Segundo elemento

PROHIBIDO usar el formato | columna | valor | (tablas Markdown). Siempre usa etiqueta: valor en líneas separadas.
NUNCA pongas múltiples elementos en la misma línea separados por comas cuando deberían ser una lista.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA N°4 — FIGURAS E IMÁGENES (OBLIGATORIO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Las figuras son parte INTEGRAL de la respuesta técnica. Si el contenido del manual que usas para responder menciona o hace referencia a una figura, DEBES citarla — no es opcional.

OBLIGATORIO: Si al leer los fragmentos del contexto encuentras referencias a figuras (Figura X, Fig. X, ver figura X, etc.) relacionadas con la pregunta, inclúyelas en tu respuesta citándolas en el lugar pertinente.

Formato de cita: (Figura X) o (Figuras X y Y) — siempre con paréntesis y número exacto del manual.
Cita la figura DENTRO de la oración donde es pertinente:
  Correcto: "El procedimiento de izaje se ilustra en (Figura 8)."
  Incorrecto: omitir la figura porque "no la preguntaron explícitamente".

NUNCA uses [IMAGEN: ...], [VER IMAGEN: ...] ni ningún otro formato. Solo (Figura X).

Al final del contexto encontrarás una sección "FIGURAS DISPONIBLES" — lista de figuras relevantes ya identificadas con su número exacto. DEBES citar todas las que sean pertinentes a tu respuesta usando (Figura X) en la oración donde correspondan. Si una figura del catálogo es relevante a lo que explicas, cítala. No cites figuras que no sean pertinentes a la pregunta.

CRÍTICO — NUNCA adivines ni inventes un número de figura:
- Solo cita (Figura X) si el número aparece EXPLÍCITAMENTE en el texto del fragmento O en la sección "FIGURAS DISPONIBLES" del contexto.
- PROHIBIDO escribir expresiones como "Figura en la página X", "el diagrama de la página X", "ver imagen en pág. X". Si no tienes el número, omite la cita completamente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA N°5 — FIDELIDAD TÉCNICA Y CUÁNDO RESPONDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Copia los datos técnicos EXACTAMENTE como aparecen en el manual. "200 Kg/cm2 (20 MPa)" se escribe exactamente así.
- NUNCA inventes datos, valores o procedimientos que no estén en el manual.
- Incluye advertencias de ATENCIÓN, PRECAUCIÓN o PELIGRO cuando sean directamente relevantes a la pregunta.

CUÁNDO DECIR "NO ESTÁ EN EL DOCUMENTO" — LEE ESTO CON ATENCIÓN:
Solo dices "La información solicitada no está presente en este documento." si NINGUNO de los fragmentos del contexto contiene absolutamente nada relacionado con la pregunta.
Si CUALQUIER fragmento tiene información parcial o relacionada con lo preguntado, DEBES responder con esa información.
Está PROHIBIDO decir "no está presente" si el contexto contiene datos relevantes. Cuando tengas duda, responde con lo que encuentres — una respuesta parcial es SIEMPRE mejor que negarse a responder.

CASO ESPECIAL CRÍTICO — "características generales": Si el usuario pregunta por "características generales" o "características del equipo" y el contexto contiene CUALQUIER dato del equipo (marca, modelo, tipo, dimensiones, pesos, presiones, aplicaciones), DEBES responderlos todos. Las "características generales" son exactamente eso — toda la información disponible sobre el equipo. NUNCA digas "no está presente" cuando el contexto tiene datos técnicos del equipo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA N°6 — ESTILO Y TONO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Tono profesional, cálido y elocuente. Como un ingeniero senior explicando a un cliente importante.
- Puedes comenzar con UNA frase introductoria breve y natural que identifique el equipo o el tema (máximo 15 palabras). Por ejemplo: "A continuación encontrarás las especificaciones técnicas de la punzonadora MX-340G:" o "El procedimiento de transporte de esta máquina se describe en los siguientes pasos:". Solo una frase — luego entra directamente al contenido.
- Usa frases completas y naturales. La respuesta debe fluir como una explicación técnica de calidad, no como una lista de datos copiada.
- PROHIBIDO usar frases genéricas como "Con mucho gusto", "Claro que sí", "Espero que esto te ayude" o cualquier fórmula de cortesía vacía.
- Sé conciso: incluye todo lo necesario, nada de lo innecesario.`;


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

    // 2. Search for relevant document chunks - fetch more to cover multi-section topics
    let searchUserId = user_id;
    const { data: relevantChunks, error: chunksError } = await supabase.rpc(
      "match_documents",
      {
        query_embedding: questionEmbedding,
        match_threshold: 0.18,
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
            match_threshold: 0.18,
            match_count: 15,
            p_user_id: searchUserId,
          }
        );
        finalChunks = fallbackChunks;
        console.log(`Fallback chunks found: ${finalChunks?.length ?? 0}`);
      }
    }

    // Filter out table-of-contents chunks (lines with "..." or page number references)
    // and chunks with very low similarity to reduce noise for GPT
    if (finalChunks && finalChunks.length > 0) {
      const topSimilarity = finalChunks[0].similarity;
      const minSimilarity = Math.max(topSimilarity * 0.50, 0.20);
      finalChunks = finalChunks.filter((c: RelevantChunk) => {
        // Remove chunks that are mostly table of contents
        const dotLines = (c.content || '').split('\n').filter((l: string) => l.includes('..........'));
        const totalLines = (c.content || '').split('\n').filter((l: string) => l.trim().length > 0);
        const isTOC = dotLines.length > totalLines.length * 0.5;
        if (isTOC) {
          console.log(`Filtered TOC chunk (page ${c.page_number}, sim ${c.similarity})`);
          return false;
        }
        // Remove chunks too far from the best match
        if (c.similarity < minSimilarity) {
          console.log(`Filtered low-sim chunk (page ${c.page_number}, sim ${c.similarity} < ${minSimilarity})`);
          return false;
        }
        return true;
      });
      console.log(`After filtering: ${finalChunks.length} chunks (min sim: ${minSimilarity.toFixed(3)})`);
    }

    // 2b. Supplementary search: for "características" queries, always fetch chunks for
    // "características generales especificaciones técnicas" to guarantee section 1.4 is included.
    // This fixes the split-section problem where section 1 and section 1.4 have different embeddings.
    const isCaracteristicasQuery = /caracter[ií]stic/i.test(normalizedMessage);
    if (isCaracteristicasQuery && searchUserId) {
      try {
        const suppEmbedding = await generateEmbedding(
          'características generales especificaciones técnicas potencia tensión presión peso',
          openaiApiKey
        );
        const { data: suppChunks } = await supabase.rpc('match_documents', {
          query_embedding: suppEmbedding,
          match_threshold: 0.18,
          match_count: 8,
          p_user_id: searchUserId,
        });
        if (suppChunks && suppChunks.length > 0) {
          const existingIds = new Set((finalChunks || []).map((c: RelevantChunk) => c.id));
          const newChunks = suppChunks.filter((c: RelevantChunk) => !existingIds.has(c.id));
          if (newChunks.length > 0) {
            finalChunks = [...(finalChunks || []), ...newChunks];
            console.log(`Supplementary características search added ${newChunks.length} chunks`);
          }
        }
      } catch {
        console.log('Supplementary search skipped');
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
    console.log(`searchUserId=${searchUserId}, original user_id=${user_id}, normalizedMessage=${normalizedMessage}`);

    // DEBUG: Log first chunk content to verify we got the right data
    if (finalChunks && finalChunks.length > 0) {
      console.log(`First chunk (page ${finalChunks[0].page_number}, sim ${finalChunks[0].similarity}): ${finalChunks[0].content?.substring(0, 100)}`);
    }

    // 4. Build context from retrieved data
    const chunksContext = buildChunksContext(finalChunks || []);

    // Build a figure catalog from vector-retrieved images so GPT knows exactly which figures
    // are available and can cite them by number — enabling inline image insertion for ALL topics.
    let figureCatalog = '';
    if (relevantImages.length > 0) {
      const catalogEntries: string[] = [];
      const seenFigNums = new Set<string>();

      for (const img of relevantImages.filter(i => i.similarity >= 0.35).slice(0, 6)) {
        const combined = (img.image_url || '') + ' ' + (img.context || '');

        // Extract figure number(s) — support "Figura 6 y 7", "Figura-4", etc.
        const figNumMatch = combined.match(/figura[- ]?(\d+)(?:\s*y\s*(\d+))?/i);
        if (!figNumMatch) continue;

        const figKey = figNumMatch[2]
          ? `${figNumMatch[1]}-${figNumMatch[2]}`
          : figNumMatch[1];
        if (seenFigNums.has(figKey)) continue;
        seenFigNums.add(figKey);

        // Extract a brief description from context
        let desc = '';
        const afterFigMatch = (img.context || '').match(/figura[- ]?\d+(?:\s*y\s*\d+)?[.\s:]+(.+?)(?:\n|$)/i);
        if (afterFigMatch && afterFigMatch[1] && afterFigMatch[1].trim().length > 4) {
          desc = afterFigMatch[1].slice(0, 90).trim();
        } else {
          const firstMeaningfulLine = (img.context || '')
            .split('\n')
            .find(l => l.trim().length > 8 && !/^figura/i.test(l.trim()));
          if (firstMeaningfulLine) desc = firstMeaningfulLine.slice(0, 90).trim();
        }
        if (!desc) desc = `página ${img.page_number}`;

        const figLabel = figNumMatch[2]
          ? `Figuras ${figNumMatch[1]} y ${figNumMatch[2]}`
          : `Figura ${figNumMatch[1]}`;

        catalogEntries.push(`  - (${figLabel}): ${desc}`);
      }

      if (catalogEntries.length > 0) {
        figureCatalog = `\n\nFIGURAS DISPONIBLES:\n${catalogEntries.join('\n')}\nCita las pertinentes con (Figura X) en la oración exacta donde correspondan.`;
        console.log(`Figure catalog built: ${catalogEntries.length} entries`);
        console.log(figureCatalog);
      }
    }

    // Check if we have ANY context
    if (!chunksContext) {
      return new Response(
        JSON.stringify({
          steps: ["No se encontró información relevante en el documento para responder tu pregunta. Asegúrate de haber subido un documento PDF y de que tu pregunta esté relacionada con su contenido."],
          images: [],
          raw_response: "No se encontró información relevante en el documento."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullContext = `INFORMACIÓN DEL DOCUMENTO:\n${chunksContext}${figureCatalog}`;

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
          { role: "user", content: `MANUAL TÉCNICO (contenido extraído entre « y »):\n\n${fullContext}\n\n---\n\nPREGUNTA DEL USUARIO: ${message}\n\nINSTRUCCIONES PARA ESTA RESPUESTA:\n1. Identifica con precisión qué está preguntando el usuario.\n2. LEE TODOS los fragmentos del contexto. De cada fragmento, extrae SOLO las partes que responden directamente la pregunta. No descartes fragmentos enteros — pueden contener mezcla de temas y debes quedarte solo con lo relevante.\n3. Si la pregunta es sobre "características" o "especificaciones": incluye en tu respuesta solo datos técnicos del equipo (potencia, dimensiones, capacidades, materiales, pesos, presiones, etc.). Omite de tu respuesta cualquier información sobre tipos de piezas, mantenimiento o instalación, aunque aparezca en los fragmentos.\n4. NO copies líneas de índice ni tabla de contenidos (líneas con "......." o solo números).\n5. OBLIGATORIO: si los fragmentos del contexto mencionan figuras relacionadas con la pregunta, cítalas con (Figura X) en la oración donde correspondan. Las figuras son parte de la respuesta técnica, no un extra opcional.\n6. Usa el formato etiqueta: valor para datos técnicos. NUNCA uses | col | val | (tablas Markdown).\n7. Incluye advertencias de seguridad solo si son directamente relevantes a lo preguntado.\n8. Interpreta errores ortográficos del usuario y responde directamente, sin mencionar la interpretación. Solo pregunta "¿Quisiste decir...?" si la pregunta es genuinamente incomprensible.\n9. Si encuentras CUALQUIER información relevante en los fragmentos, RESPÓNDELA. Solo di "no está presente" si absolutamente ningún fragmento tiene relación con la pregunta.` }
        ],
        temperature: 0.1,
        max_tokens: 4096,
        seed: 42,
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
    const { enrichedResponse, usedImages } = insertInlineImages(rawResponse, relevantImages, finalChunks || [], normalizedMessage);

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
  chunks: RelevantChunk[],
  userQuestion: string = ''
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

      // Insert the image IMMEDIATELY after the figure reference text
      // (not at the end of the full line, which could be far away)
      // Find end of current sentence (period, newline, or end of figure marker)
      const afterRef = match.index + match[0].length;
      // Look for end of sentence near the reference: period, exclamation, newline — within 120 chars
      const textAfterRef = text.slice(afterRef, afterRef + 120);
      const sentenceEnd = textAfterRef.search(/[.\n!]/);
      const insertPos = sentenceEnd !== -1
        ? afterRef + sentenceEnd + 1  // right after the sentence-ending punctuation
        : afterRef;                    // fallback: right after the figure reference

      insertions.push({
        position: insertPos,
        imageTag: `\n[IMG:${bestMatch.image_url}|${caption}]\n`,
      });

      console.log(`Matched: ${caption} -> image ${bestMatch.id} (page ${bestMatch.page_number})`);
    }
  }

  // Apply insertions from end to start (so positions don't shift)
  insertions.sort((a, b) => b.position - a.position);
  for (const ins of insertions) {
    enriched = enriched.slice(0, ins.position) + ins.imageTag + enriched.slice(ins.position);
  }


  // CLEAN FALLBACK: When GPT cited zero figures, inject figures from pages of high-confidence answer chunks.
  // This handles figures whose PDF caption has no inline text reference (Figura 4 transporte, Figura 1 dimensiones).
  // Page-proximity from high-confidence chunks is cleaner than stem matching:
  // we know exactly which pages contain the answer text, so figures on those pages are relevant.
  if (usedImages.length === 0 && chunks.length > 0) {
    // Collect pages from high-confidence answer chunks (up to top 5)
    const answerPages = new Set(
      chunks.filter(c => c.similarity >= 0.38).slice(0, 5).map(c => c.page_number)
    );

    if (answerPages.size > 0) {
      // Among images on those pages, pick the most vector-similar ones (max 2)
      const candidates = availableImages
        .filter(img => !usedImageIds.has(img.id) && answerPages.has(img.page_number))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 2);

      for (const img of candidates) {
        const figNumMatch = (img.image_url + ' ' + (img.context || '')).match(/figura[- ]?(\d+)/i);
        if (!figNumMatch) continue; // Only inject named figures

        const caption = `Figura ${figNumMatch[1]}`;
        usedImageIds.add(img.id);
        usedImages.push({ url: img.image_url, caption, page_number: img.page_number });
        enriched += `\n[IMG:${img.image_url}|${caption}]\n`;
        console.log(`Page-based fallback: ${caption} (page ${img.page_number}, sim: ${img.similarity.toFixed(3)})`);
      }
    }
  }

  // Cap at 4 images total
  if (usedImages.length > 4) {
    usedImages.length = 4;
  }

  return { enrichedResponse: enriched, usedImages };
}

async function normalizeQuery(query: string, apiKey: string): Promise<string> {
  // Always normalize: typos like "caracteristifas" look clean to regex but break embeddings.
  // gpt-4o-mini cost is negligible vs wrong search results.
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

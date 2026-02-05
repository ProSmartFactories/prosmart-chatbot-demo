import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
Estructura tu respuesta en pasos numerados claros. Cuando menciones una imagen relevante, usa el formato:
"[VER IMAGEN: descripción breve]"`;

interface ChatRequest {
  message: string;
  user_id: string;
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
  // Handle CORS preflight
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

    console.log(`Chat request from user: ${user_id}, message: ${message.substring(0, 50)}...`);

    // 1. Generate embedding for the user's question
    const questionEmbedding = await generateEmbedding(message, openaiApiKey);

    // 2. Search for relevant document chunks
    const { data: relevantChunks, error: chunksError } = await supabase.rpc(
      "match_documents",
      {
        query_embedding: questionEmbedding,
        match_threshold: 0.3,
        match_count: 5,
        p_user_id: user_id,
      }
    );

    if (chunksError) {
      console.error("Error searching chunks:", chunksError);
    }

    // 3. Search for relevant images
    const { data: relevantImages, error: imagesError } = await supabase.rpc(
      "match_images",
      {
        query_embedding: questionEmbedding,
        match_threshold: 0.3,
        match_count: 3,
        p_user_id: user_id,
      }
    );

    if (imagesError) {
      console.error("Error searching images:", imagesError);
    }

    // 4. Build context from retrieved data
    const chunksContext = relevantChunks && relevantChunks.length > 0
      ? relevantChunks.map((c: { content: string; page_number: number }) =>
          `[Página ${c.page_number || 'N/A'}]\n${c.content}`
        ).join("\n\n---\n\n")
      : "No se encontró información relevante en el documento.";

    const imagesContext = relevantImages && relevantImages.length > 0
      ? relevantImages.map((img: { page_number: number; context: string }) =>
          `[Imagen en Página ${img.page_number}]: ${img.context}`
        ).join("\n")
      : "";

    const fullContext = `
INFORMACIÓN DEL DOCUMENTO:
${chunksContext}

${imagesContext ? `IMÁGENES DISPONIBLES:\n${imagesContext}` : ""}
`;

    console.log(`Context built with ${relevantChunks?.length || 0} chunks and ${relevantImages?.length || 0} images`);

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
          { role: "user", content: `CONTEXTO:\n${fullContext}\n\nPREGUNTA:\n${message}` }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const chatData = await chatResponse.json();
    const rawResponse = chatData.choices[0]?.message?.content || "";

    // 6. Parse the response into steps
    const steps = parseSteps(rawResponse);

    // 7. Extract and match image references
    const responseImages: ChatResponse["images"] = [];
    const imageRefs = rawResponse.matchAll(/\[VER IMAGEN: ([^\]]+)\]/gi);

    for (const ref of imageRefs) {
      const description = ref[1];
      // Find matching image from relevant images
      const matchedImage = relevantImages?.find((img: { context: string }) =>
        img.context.toLowerCase().includes(description.toLowerCase().substring(0, 20))
      );

      if (matchedImage) {
        responseImages.push({
          url: matchedImage.image_url,
          caption: matchedImage.context,
          page_number: matchedImage.page_number,
        });
      }
    }

    // 8. Build final response
    const response: ChatResponse = {
      steps,
      images: responseImages,
      raw_response: rawResponse,
    };

    console.log(`Response generated with ${steps.length} steps and ${responseImages.length} images`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in chat function:", error);
    return new Response(
      JSON.stringify({
        error: (error as Error).message || "Unknown error occurred",
        steps: ["Lo siento, ha ocurrido un error al procesar tu consulta."],
        images: [],
        raw_response: ""
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: Generate single embedding
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to generate embedding: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Helper: Parse response into steps
function parseSteps(response: string): string[] {
  // Try to parse numbered steps
  const numberedSteps = response.match(/(?:^|\n)\s*(?:\d+[\.\)]\s*|Paso\s*\d+[:\.\)]\s*)(.+?)(?=\n\s*(?:\d+[\.\)]|Paso\s*\d+)|$)/gs);

  if (numberedSteps && numberedSteps.length > 1) {
    return numberedSteps.map(step => step.trim());
  }

  // If no clear steps, split by paragraphs
  const paragraphs = response.split(/\n\n+/).filter(p => p.trim().length > 0);

  if (paragraphs.length > 1) {
    return paragraphs;
  }

  // Return whole response as single step
  return [response];
}

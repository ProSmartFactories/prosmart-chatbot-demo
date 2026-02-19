import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateSuggestionsRequest {
  user_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { user_id }: GenerateSuggestionsRequest = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating suggestions for user: ${user_id}`);

    // Fetch document chunks for this user (get first few for context)
    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("content, page_number")
      .eq("user_id", user_id)
      .order("page_number", { ascending: true })
      .limit(10);

    if (chunksError || !chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          suggestions: [
            "Explica el contenido principal",
            "Resume los puntos clave",
            "Describe el procedimiento"
          ],
          error: "No document found"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Combine chunks for context
    const documentContext = chunks
      .map(c => `[Pag ${c.page_number}] ${c.content}`)
      .join("\n\n")
      .slice(0, 6000);

    // Call OpenAI to generate questions
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Eres un asistente que genera preguntas relevantes sobre documentos técnicos.
Basándote en el contenido del documento, genera EXACTAMENTE 3 preguntas cortas y específicas que un usuario podría hacer.

REGLAS:
- Las preguntas deben ser cortas (máximo 6 palabras cada una)
- Deben ser específicas al contenido del documento
- Deben empezar con verbos de acción: "Explica", "Describe", "Muestra", "Detalla"
- NO uses signos de interrogación
- Responde SOLO con un JSON array de 3 strings

Ejemplo de formato de respuesta:
["Explica el proceso de calibración", "Describe los componentes principales", "Muestra el diagrama eléctrico"]`
          },
          {
            role: "user",
            content: `Documento:\n${documentContext}`
          }
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${await response.text()}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "";

    // Parse the JSON array from the response
    let suggestions: string[];
    try {
      // Extract JSON array from response (in case there's extra text)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON array found");
      }
    } catch {
      // Fallback suggestions if parsing fails
      suggestions = [
        "Explica el contenido principal",
        "Describe el procedimiento",
        "Detalla las especificaciones"
      ];
    }

    // Ensure we have exactly 3 suggestions
    suggestions = suggestions.slice(0, 3);
    while (suggestions.length < 3) {
      suggestions.push("Muestra más detalles");
    }

    console.log(`Generated suggestions: ${JSON.stringify(suggestions)}`);

    return new Response(
      JSON.stringify({
        success: true,
        suggestions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating suggestions:", error);
    return new Response(
      JSON.stringify({
        success: false,
        suggestions: [
          "Explica el contenido principal",
          "Resume los puntos clave",
          "Describe el procedimiento"
        ],
        error: (error as Error).message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

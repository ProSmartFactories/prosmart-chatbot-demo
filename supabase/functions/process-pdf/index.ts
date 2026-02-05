import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProcessPdfRequest {
  document_id: string;
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
    const { document_id, user_id }: ProcessPdfRequest = await req.json();

    if (!document_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "document_id and user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing PDF: ${document_id}`);

    // 1. Get document
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docError || !doc) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    // 2. Download PDF
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("user-documents")
      .download(doc.file_path);

    if (downloadError || !pdfData) {
      throw new Error(`Download failed: ${downloadError?.message}`);
    }

    const arrayBuffer = await pdfData.arrayBuffer();
    const pdfSizeKB = Math.round(arrayBuffer.byteLength / 1024);
    const pdfSizeMB = (pdfSizeKB / 1024).toFixed(2);
    console.log(`PDF: ${pdfSizeMB} MB (${pdfSizeKB} KB)`);

    // Check file size limit (10MB max)
    if (pdfSizeKB > 10240) {
      throw new Error("El PDF es demasiado grande. El tamaño máximo es 10MB.");
    }

    // 3. Upload PDF to OpenAI Files API
    console.log("Uploading PDF to OpenAI...");

    const formData = new FormData();
    const blob = new Blob([arrayBuffer], { type: "application/pdf" });
    formData.append("file", blob, "document.pdf");
    formData.append("purpose", "assistants");

    const uploadResponse = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Upload error:", errorText);
      throw new Error(`Failed to upload PDF to OpenAI: ${errorText}`);
    }

    const fileData = await uploadResponse.json();
    const fileId = fileData.id;
    console.log(`File uploaded: ${fileId}`);

    // 4. Create an Assistant with file_search
    console.log("Creating assistant...");

    const assistantResponse = await fetch("https://api.openai.com/v1/assistants", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        name: "PDF Extractor",
        instructions: `Eres un sistema de OCR y extracción de texto profesional. Tu ÚNICA tarea es extraer y transcribir TODO el contenido textual del documento PDF adjunto de manera completa, precisa y estructurada.

INSTRUCCIONES OBLIGATORIAS:
1. Lee TODAS las páginas del documento
2. Extrae absolutamente TODO el texto visible
3. Mantén la estructura: títulos, subtítulos, párrafos, listas, tablas
4. Incluye [Página X] al inicio de cada página
5. Para tablas, usa formato estructurado de texto
6. NO resumas, NO interpretes, solo TRANSCRIBE
7. Incluye todos los detalles técnicos, números, especificaciones
8. Si hay encabezados o pies de página, inclúyelos

Responde SOLO con el texto extraído, sin comentarios adicionales.`,
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
      }),
    });

    if (!assistantResponse.ok) {
      const errorText = await assistantResponse.text();
      throw new Error(`Failed to create assistant: ${errorText}`);
    }

    const assistant = await assistantResponse.json();
    const assistantId = assistant.id;
    console.log(`Assistant created: ${assistantId}`);

    // 5. Create a thread with the file
    console.log("Creating thread with file...");

    const threadResponse = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "Por favor extrae y transcribe TODO el contenido textual de este documento PDF de manera completa. Incluye todas las páginas, secciones, tablas, y cualquier texto visible. Marca el inicio de cada página con [Página X].",
            attachments: [
              {
                file_id: fileId,
                tools: [{ type: "file_search" }],
              },
            ],
          },
        ],
      }),
    });

    if (!threadResponse.ok) {
      const errorText = await threadResponse.text();
      throw new Error(`Failed to create thread: ${errorText}`);
    }

    const thread = await threadResponse.json();
    const threadId = thread.id;
    console.log(`Thread created: ${threadId}`);

    // 6. Run the assistant
    console.log("Running assistant...");

    const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        assistant_id: assistantId,
      }),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      throw new Error(`Failed to run assistant: ${errorText}`);
    }

    const run = await runResponse.json();
    let runId = run.id;
    console.log(`Run started: ${runId}`);

    // 7. Wait for completion (with timeout)
    console.log("Waiting for extraction...");
    let runStatus = run.status;
    const maxWaitTime = 180000; // 3 minutes
    const startTime = Date.now();

    while (runStatus !== "completed" && runStatus !== "failed" && runStatus !== "cancelled") {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error("Extraction timeout - el documento es demasiado grande o complejo");
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });

      const statusData = await statusResponse.json();
      runStatus = statusData.status;
      console.log(`Status: ${runStatus}`);
    }

    if (runStatus !== "completed") {
      throw new Error(`Extraction failed with status: ${runStatus}`);
    }

    // 8. Get the messages
    console.log("Getting extracted text...");

    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    const messagesData = await messagesResponse.json();

    // Get the assistant's response (first message from assistant)
    const assistantMessage = messagesData.data.find((m: { role: string }) => m.role === "assistant");

    let textContent = "";
    if (assistantMessage?.content) {
      for (const content of assistantMessage.content) {
        if (content.type === "text") {
          textContent += content.text.value + "\n";
        }
      }
    }

    // 9. Cleanup - delete assistant and file
    console.log("Cleaning up...");

    await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    await fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
      },
    });

    // 10. Validate extracted content
    if (!textContent || textContent.length < 100) {
      throw new Error("No se pudo extraer suficiente texto del documento. El PDF puede estar dañado, protegido o ser solo imágenes sin OCR.");
    }

    console.log(`Extracted: ${textContent.length} chars`);

    // Estimate pages
    const pageMatches = textContent.match(/\[Página\s*\d+\]/gi);
    const totalPages = pageMatches ? pageMatches.length : Math.ceil(textContent.length / 2500);

    // 11. Clear previous data
    await supabase.from("document_chunks").delete().eq("user_id", user_id);
    await supabase.from("document_images").delete().eq("user_id", user_id);

    // 12. Create chunks
    const chunks = createChunks(textContent, 800);
    console.log(`Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      throw new Error("No se pudieron crear fragmentos del documento");
    }

    // 13. Generate embeddings
    const embeddings = await getEmbeddings(chunks.map(c => c.text), openaiApiKey);

    // 14. Insert chunks
    const chunksData = chunks.map((c, i) => ({
      user_id,
      document_id,
      content: c.text,
      embedding: embeddings[i],
      page_number: c.page,
    }));

    const { error: insertError } = await supabase
      .from("document_chunks")
      .insert(chunksData);

    if (insertError) {
      throw new Error(`Insert chunks failed: ${insertError.message}`);
    }

    // 15. Mark processed
    await supabase
      .from("documents")
      .update({ processed: true })
      .eq("id", document_id);

    console.log("Done!");

    return new Response(
      JSON.stringify({
        success: true,
        message: "PDF procesado correctamente",
        chunks_count: chunks.length,
        images_count: 0,
        total_pages: totalPages,
        summary: `Documento analizado: ${chunks.length} fragmentos de ~${totalPages} páginas`,
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

function createChunks(text: string, size: number): { text: string; page: number }[] {
  if (!text?.trim()) return [];

  const chunks: { text: string; page: number }[] = [];
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

  let current = "";
  let page = 1;

  for (const para of paragraphs) {
    // Detect page markers
    const pageMatch = para.match(/\[?p[áa]gina\s*(\d+)\]?|page\s*(\d+)|\[(\d+)\]/i);
    if (pageMatch) {
      page = parseInt(pageMatch[1] || pageMatch[2] || pageMatch[3], 10);
    }

    if (current.length + para.length > size && current) {
      chunks.push({ text: current.trim(), page });
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }

  if (current.trim()) {
    chunks.push({ text: current.trim(), page });
  }

  return chunks;
}

async function getEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  if (!texts.length) return [];

  const results: number[][] = [];
  const batchSize = 10;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(t => t.slice(0, 8000));

    const res = await fetch("https://api.openai.com/v1/embeddings", {
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

    if (!res.ok) {
      throw new Error(`Embeddings failed: ${await res.text()}`);
    }

    const data = await res.json();
    results.push(...data.data.map((d: { embedding: number[] }) => d.embedding));
  }

  return results;
}

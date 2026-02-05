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

interface ExtractedImage {
  description: string;
  context: string;
  pageNumber: number;
  type: string;
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

    console.log(`Processing PDF for document: ${document_id}, user: ${user_id}`);

    // 1. Get document info
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    // 2. Download PDF from Storage
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("user-documents")
      .download(document.file_path);

    if (downloadError || !pdfData) {
      throw new Error(`Failed to download PDF: ${downloadError?.message}`);
    }

    const arrayBuffer = await pdfData.arrayBuffer();
    console.log(`PDF size: ${Math.round(arrayBuffer.byteLength / 1024)} KB`);

    // 3. Upload file to OpenAI for processing
    console.log("Uploading PDF to OpenAI...");

    const formData = new FormData();
    formData.append("file", new Blob([arrayBuffer], { type: "application/pdf" }), "document.pdf");
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
      console.error("File upload error:", errorText);
      throw new Error(`Failed to upload file: ${errorText}`);
    }

    const uploadedFile = await uploadResponse.json();
    console.log(`File uploaded: ${uploadedFile.id}`);

    // 4. Create an assistant for PDF analysis
    const assistantResponse = await fetch("https://api.openai.com/v1/assistants", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        name: "PDF Analyzer",
        instructions: `Eres un experto en análisis de documentos técnicos. Extrae TODO el contenido del documento.

RESPONDE ÚNICAMENTE con JSON válido (sin markdown, sin texto extra):
{
  "text_content": "Todo el texto extraído...",
  "images": [{"description": "...", "context": "...", "page_number": 1, "type": "diagram"}],
  "total_pages": 10,
  "document_summary": "Resumen breve"
}`,
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
      }),
    });

    if (!assistantResponse.ok) {
      const errorText = await assistantResponse.text();
      throw new Error(`Failed to create assistant: ${errorText}`);
    }

    const assistant = await assistantResponse.json();
    console.log(`Assistant created: ${assistant.id}`);

    // 5. Create a thread with the file
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
            content: "Analiza este documento PDF. Extrae todo el texto y describe cada imagen/diagrama/figura. Responde SOLO con JSON válido.",
            attachments: [
              {
                file_id: uploadedFile.id,
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
    console.log(`Thread created: ${thread.id}`);

    // 6. Run the assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        assistant_id: assistant.id,
      }),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      throw new Error(`Failed to run assistant: ${errorText}`);
    }

    const run = await runResponse.json();
    console.log(`Run started: ${run.id}`);

    // 7. Poll for completion (max 5 minutes)
    let runStatus = run.status;
    let attempts = 0;
    const maxAttempts = 60;

    while (runStatus !== "completed" && runStatus !== "failed" && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      });

      const statusData = await statusResponse.json();
      runStatus = statusData.status;
      attempts++;
      console.log(`Run status: ${runStatus} (attempt ${attempts})`);
    }

    if (runStatus !== "completed") {
      throw new Error(`Assistant run failed or timed out. Status: ${runStatus}`);
    }

    // 8. Get the messages
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    const messagesData = await messagesResponse.json();
    const assistantMessage = messagesData.data.find((m: { role: string }) => m.role === "assistant");

    if (!assistantMessage) {
      throw new Error("No response from assistant");
    }

    let responseText = "";
    for (const content of assistantMessage.content) {
      if (content.type === "text") {
        responseText += content.text.value;
      }
    }

    console.log("Response received, parsing JSON...");

    // 9. Parse the JSON response
    let analysis;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      console.log("JSON parse failed, using raw text");
      analysis = {
        text_content: responseText,
        images: [],
        total_pages: 1,
        document_summary: "Documento procesado"
      };
    }

    const extractedText = analysis.text_content || responseText || "";
    const extractedImages: ExtractedImage[] = analysis.images || [];

    console.log(`Extracted ${extractedText.length} chars, ${extractedImages.length} images`);

    // 10. Cleanup OpenAI resources
    await fetch(`https://api.openai.com/v1/assistants/${assistant.id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${openaiApiKey}`, "OpenAI-Beta": "assistants=v2" },
    }).catch(() => {});

    await fetch(`https://api.openai.com/v1/files/${uploadedFile.id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${openaiApiKey}` },
    }).catch(() => {});

    // 11. Delete existing data for this user
    console.log("Deleting previous data...");
    await supabase.from("document_chunks").delete().eq("user_id", user_id);
    await supabase.from("document_images").delete().eq("user_id", user_id);

    // 12. Split text into chunks
    const chunks = splitIntoChunks(extractedText, 800, 100);
    console.log(`Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      throw new Error("No text content extracted from PDF");
    }

    // 13. Generate embeddings
    console.log("Generating embeddings...");
    const chunkEmbeddings = await generateEmbeddingsBatched(
      chunks.map(c => c.content),
      openaiApiKey
    );

    // 14. Insert chunks
    const chunksToInsert = chunks.map((chunk, index) => ({
      user_id,
      document_id,
      content: chunk.content,
      embedding: chunkEmbeddings[index],
      page_number: chunk.pageNumber,
    }));

    const { error: chunksError } = await supabase
      .from("document_chunks")
      .insert(chunksToInsert);

    if (chunksError) {
      throw new Error(`Failed to insert chunks: ${chunksError.message}`);
    }

    // 15. Process images
    let imagesInserted = 0;

    if (extractedImages.length > 0) {
      console.log(`Processing ${extractedImages.length} images...`);

      const imageContexts = extractedImages.map(img =>
        `${img.type || 'imagen'}: ${img.description || ''}. ${img.context || ''}`
      );

      const imageEmbeddings = await generateEmbeddingsBatched(imageContexts, openaiApiKey);

      const imagesToInsert = extractedImages.map((img, index) => ({
        user_id,
        document_id,
        page_number: img.pageNumber || 1,
        image_url: `doc_image_p${img.pageNumber || 1}_${index + 1}`,
        context: `[${(img.type || 'IMAGEN').toUpperCase()}] ${img.description || ''}${img.context ? `\n\nContexto: ${img.context}` : ''}`,
        embedding: imageEmbeddings[index],
      }));

      const { error: imagesError } = await supabase
        .from("document_images")
        .insert(imagesToInsert);

      if (!imagesError) {
        imagesInserted = imagesToInsert.length;
      }
    }

    // 16. Mark document as processed
    await supabase
      .from("documents")
      .update({ processed: true })
      .eq("id", document_id);

    console.log("PDF processing completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message: "PDF processed successfully",
        chunks_count: chunks.length,
        images_count: imagesInserted,
        total_pages: analysis.total_pages || 1,
        summary: analysis.document_summary || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing PDF:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message || "Unknown error occurred"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function splitIntoChunks(text: string, chunkSize: number, overlap: number): { content: string; pageNumber: number }[] {
  if (!text?.trim()) return [];

  const chunks: { content: string; pageNumber: number }[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = "";
  let currentPage = 1;

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;

    if (paragraph.match(/página|page\s*\d+/i)) {
      const pageMatch = paragraph.match(/\d+/);
      if (pageMatch) currentPage = parseInt(pageMatch[0], 10);
    }

    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push({ content: currentChunk.trim(), pageNumber: currentPage });
      const words = currentChunk.split(" ");
      currentChunk = words.slice(-Math.floor(overlap / 5)).join(" ") + " " + paragraph;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({ content: currentChunk.trim(), pageNumber: currentPage });
  }

  return chunks;
}

async function generateEmbeddingsBatched(texts: string[], apiKey: string, batchSize = 20): Promise<number[][]> {
  if (!texts.length) return [];

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(t => t.substring(0, 8000));

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
      throw new Error(`Failed to generate embeddings: ${await response.text()}`);
    }

    const data = await response.json();
    allEmbeddings.push(...data.data.map((item: { embedding: number[] }) => item.embedding));
  }

  return allEmbeddings;
}

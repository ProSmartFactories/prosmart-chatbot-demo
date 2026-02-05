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
  type: string; // diagram, photo, chart, table, etc.
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

    // 3. Convert PDF to base64
    const arrayBuffer = await pdfData.arrayBuffer();
    const base64Pdf = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    // 4. Extract text and analyze images with GPT-4o
    console.log("Analyzing PDF with GPT-4o...");

    const analysisResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Eres un experto en análisis de documentos técnicos. Tu tarea es:

1. Extraer TODO el texto del documento, preservando la estructura (títulos, secciones, listas, tablas).
2. Identificar TODAS las imágenes, diagramas, gráficos y figuras.
3. Para cada imagen, proporcionar:
   - Descripción detallada de lo que muestra
   - Contexto técnico relacionado
   - Número de página aproximado
   - Tipo (diagrama, esquema, foto, gráfico, tabla, etc.)

FORMATO DE RESPUESTA (JSON):
{
  "text_content": "Todo el texto extraído del documento...",
  "images": [
    {
      "description": "Descripción detallada de la imagen",
      "context": "Texto del documento relacionado con esta imagen",
      "page_number": 1,
      "type": "diagram"
    }
  ],
  "total_pages": 10,
  "document_summary": "Resumen breve del documento"
}`
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: `data:application/pdf;base64,${base64Pdf}`
                }
              },
              {
                type: "text",
                text: "Analiza este documento PDF técnico. Extrae todo el texto y describe detalladamente cada imagen, diagrama o figura que encuentres. Responde en formato JSON."
              }
            ]
          }
        ],
        max_tokens: 16000,
        response_format: { type: "json_object" }
      }),
    });

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error("OpenAI analysis error:", errorText);
      throw new Error(`Failed to analyze PDF: ${errorText}`);
    }

    const analysisData = await analysisResponse.json();
    let analysis;

    try {
      analysis = JSON.parse(analysisData.choices[0]?.message?.content || "{}");
    } catch {
      // If JSON parsing fails, use a fallback structure
      analysis = {
        text_content: analysisData.choices[0]?.message?.content || "",
        images: [],
        total_pages: 1,
        document_summary: ""
      };
    }

    const extractedText = analysis.text_content || "";
    const extractedImages: ExtractedImage[] = analysis.images || [];

    console.log(`Extracted ${extractedText.length} characters and ${extractedImages.length} images`);

    // 5. Delete existing data for this user
    console.log("Deleting previous data...");
    await supabase.from("document_chunks").delete().eq("user_id", user_id);
    await supabase.from("document_images").delete().eq("user_id", user_id);

    // Delete previous images from storage
    const { data: existingImages } = await supabase.storage
      .from("document-images")
      .list(user_id);

    if (existingImages && existingImages.length > 0) {
      const filesToDelete = existingImages.map(f => `${user_id}/${f.name}`);
      await supabase.storage.from("document-images").remove(filesToDelete);
    }

    // 6. Split text into semantic chunks
    const chunks = splitIntoChunks(extractedText, 800, 100);
    console.log(`Created ${chunks.length} text chunks`);

    // 7. Generate embeddings for chunks in batches
    console.log("Generating embeddings for chunks...");
    const chunkEmbeddings = await generateEmbeddingsBatched(
      chunks.map(c => c.content),
      openaiApiKey
    );

    // 8. Insert chunks with embeddings
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

    // 9. Process images with detailed context
    let imagesInserted = 0;

    if (extractedImages.length > 0) {
      console.log(`Processing ${extractedImages.length} images...`);

      // Create rich context for each image (description + surrounding text)
      const imageContexts = extractedImages.map(img =>
        `${img.type}: ${img.description}. Contexto: ${img.context}`
      );

      const imageEmbeddings = await generateEmbeddingsBatched(imageContexts, openaiApiKey);

      const imagesToInsert = extractedImages.map((img, index) => ({
        user_id,
        document_id,
        page_number: img.pageNumber || 1,
        image_url: `doc_image_p${img.pageNumber}_${index + 1}`,
        context: `[${img.type?.toUpperCase() || 'IMAGEN'}] ${img.description}${img.context ? `\n\nContexto relacionado: ${img.context}` : ''}`,
        embedding: imageEmbeddings[index],
      }));

      const { error: imagesError } = await supabase
        .from("document_images")
        .insert(imagesToInsert);

      if (imagesError) {
        console.error("Failed to insert images:", imagesError);
      } else {
        imagesInserted = imagesToInsert.length;
      }
    }

    // 10. Mark document as processed
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

// Helper: Split text into semantic chunks with page tracking
function splitIntoChunks(
  text: string,
  chunkSize: number,
  overlap: number
): { content: string; pageNumber: number }[] {
  const chunks: { content: string; pageNumber: number }[] = [];
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = "";
  let currentPage = 1;

  for (const paragraph of paragraphs) {
    // Detect page breaks (common patterns)
    if (
      paragraph.toLowerCase().includes("página") ||
      paragraph.match(/^-{3,}$/) ||
      paragraph.match(/^page\s+\d+/i) ||
      paragraph.match(/^\d+\s*$/)
    ) {
      const pageMatch = paragraph.match(/\d+/);
      if (pageMatch) {
        currentPage = parseInt(pageMatch[0], 10);
      } else {
        currentPage++;
      }
    }

    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push({ content: currentChunk.trim(), pageNumber: currentPage });

      // Keep overlap for context continuity
      const words = currentChunk.split(" ");
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = overlapWords.join(" ") + " " + paragraph;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({ content: currentChunk.trim(), pageNumber: currentPage });
  }

  return chunks;
}

// Helper: Generate embeddings in batches to avoid API limits
async function generateEmbeddingsBatched(
  texts: string[],
  apiKey: string,
  batchSize: number = 20
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

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
      const error = await response.text();
      throw new Error(`Failed to generate embeddings: ${error}`);
    }

    const data = await response.json();
    const embeddings = data.data.map((item: { embedding: number[] }) => item.embedding);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

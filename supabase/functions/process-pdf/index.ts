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
  // Handle CORS preflight
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

    // 3. Convert PDF to base64 for GPT-4 Vision processing
    const arrayBuffer = await pdfData.arrayBuffer();
    const base64Pdf = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    // 4. Use GPT-4 to extract text content from PDF
    console.log("Extracting text from PDF using GPT-4...");

    const extractionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
            content: `Eres un experto en extracción de texto de documentos técnicos.
Tu tarea es extraer TODO el texto del documento PDF proporcionado, preservando la estructura y organización.
Responde SOLO con el texto extraído, sin comentarios adicionales.
Mantén los títulos, subtítulos, listas y párrafos claramente separados.
Si hay tablas, representa su contenido de forma legible.
Indica entre corchetes [IMAGEN: descripción] cuando encuentres imágenes o diagramas relevantes.`
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
                text: "Extrae todo el texto de este documento PDF técnico, preservando la estructura. Indica las imágenes con [IMAGEN: descripción]."
              }
            ]
          }
        ],
        max_tokens: 16000,
      }),
    });

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      console.error("OpenAI extraction error:", errorText);
      throw new Error(`Failed to extract text from PDF: ${errorText}`);
    }

    const extractionData = await extractionResponse.json();
    const extractedText = extractionData.choices[0]?.message?.content || "";

    console.log(`Extracted ${extractedText.length} characters from PDF`);

    // 5. Split text into semantic chunks
    const chunks = splitIntoChunks(extractedText, 800, 100);
    console.log(`Created ${chunks.length} text chunks`);

    // 6. Extract image references from the text
    const imageMatches = extractedText.matchAll(/\[IMAGEN: ([^\]]+)\]/g);
    const imageDescriptions: { description: string; pageNumber: number }[] = [];
    let pageNumber = 1;

    for (const match of imageMatches) {
      imageDescriptions.push({
        description: match[1],
        pageNumber: pageNumber++,
      });
    }

    // 7. Delete existing chunks and images for this user
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

    // 8. Generate embeddings for chunks
    console.log("Generating embeddings for chunks...");

    const chunkEmbeddings = await generateEmbeddings(
      chunks.map(c => c.content),
      openaiApiKey
    );

    // 9. Insert chunks with embeddings
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

    // 10. Process and insert image references
    let imagesInserted = 0;

    if (imageDescriptions.length > 0) {
      console.log(`Processing ${imageDescriptions.length} image references...`);

      const imageContexts = imageDescriptions.map(img => img.description);
      const imageEmbeddings = await generateEmbeddings(imageContexts, openaiApiKey);

      const imagesToInsert = imageDescriptions.map((img, index) => ({
        user_id,
        document_id,
        page_number: img.pageNumber,
        image_url: `placeholder_${index + 1}`, // Placeholder URL
        context: img.description,
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

    // 11. Mark document as processed
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
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing PDF:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error occurred"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: Split text into chunks with overlap
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
    // Detect page breaks
    if (paragraph.toLowerCase().includes("página") || paragraph.match(/^-{3,}$/)) {
      currentPage++;
    }

    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push({ content: currentChunk.trim(), pageNumber: currentPage });

      // Keep overlap
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

// Helper: Generate embeddings using OpenAI
async function generateEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to generate embeddings: ${error}`);
  }

  const data = await response.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}

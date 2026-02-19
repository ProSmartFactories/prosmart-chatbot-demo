import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import jpeg from "https://esm.sh/jpeg-js@0.4.4";

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
  batch_index?: number;      // Which batch (0-based)
  total_batches?: number;    // Total number of batches
  page_offset?: number;      // Page number offset for this batch
  is_first_batch?: boolean;  // Whether to clear old data
  skip_image_delete?: boolean; // If true, don't delete document_images (for re-OCR only)
}

interface PageAnalysis {
  page_number: number;
  text_content: string;
  has_visual: boolean;
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
    // Validate environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      throw new Error("Server configuration error: Missing Supabase credentials");
    }

    if (!openaiApiKey) {
      console.error("Missing OPENAI_API_KEY");
      throw new Error("Server configuration error: Missing OpenAI API key");
    }

    console.log("Environment variables validated OK");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let requestBody: ProcessPdfRequest;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { document_id, user_id, page_images, embedded_images, batch_index, page_offset, is_first_batch, skip_image_delete } = requestBody;
    const pageNumberOffset = page_offset || 0;
    const isFirstBatch = is_first_batch !== false && (batch_index === undefined || batch_index === 0);

    if (!document_id || !user_id) {
      console.error("Missing required fields:", { document_id, user_id });
      return new Response(
        JSON.stringify({ error: "document_id and user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(document_id) || !uuidRegex.test(user_id)) {
      console.error("Invalid UUID format:", { document_id, user_id });
      return new Response(
        JSON.stringify({ error: "Invalid UUID format for document_id or user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing PDF: ${document_id} for user: ${user_id}`);
    console.log(`Page images: ${page_images?.length || 0}, Embedded images: ${embedded_images?.length || 0}`);

    // Get document info
    console.log("Fetching document from database...");
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docError) {
      console.error("Database error fetching document:", docError);
      throw new Error(`Database error: ${docError.message}`);
    }

    if (!doc) {
      console.error("Document not found in database:", document_id);
      throw new Error(`Document not found with id: ${document_id}`);
    }

    console.log("Document found:", { id: doc.id, file_path: doc.file_path, processed: doc.processed });

    // Determine processing method based on input
    const hasPageImages = page_images && page_images.length > 0;

    let pageAnalyses: PageAnalysis[] = [];
    let processedImages: ProcessedImage[] = [];
    let totalChunks = 0;

    if (hasPageImages) {
      // ========================================================================
      // METHOD 1: VISION-BASED PROCESSING (Best quality)
      // ========================================================================
      console.log(`Using Vision-based processing for ${page_images.length} pages...`);

      // Process ALL pages in this batch in PARALLEL for maximum speed
      let successCount = 0;
      let errorCount = 0;

      try {
        const visionPromises = page_images.map((img, idx) =>
          analyzePageWithVision(img, pageNumberOffset + idx + 1, openaiApiKey)
        );

        const results = await Promise.all(visionPromises);
        for (const result of results) {
          if (result.text_content?.trim()) {
            successCount++;
          } else {
            errorCount++;
          }
        }
        pageAnalyses.push(...results);
        console.log(`Analyzed ${page_images.length} pages in parallel (success: ${successCount}, errors: ${errorCount})`);
      } catch (batchError) {
        console.error(`Error processing pages in parallel:`, batchError);
        errorCount += page_images.length;
      }

      console.log(`Vision processing complete: ${successCount} successful, ${errorCount} failed`);

      // If all pages failed, fall back to Assistants API
      if (successCount === 0 && errorCount > 0) {
        console.log("All Vision processing failed, falling back to Assistants API...");
        pageAnalyses = [];
      }

      // Process embedded images
      if (embedded_images && embedded_images.length > 0) {
        try {
          processedImages = await processEmbeddedImages(
            embedded_images,
            user_id,
            document_id,
            supabase,
            openaiApiKey
          );
        } catch (imgError) {
          console.error("Error processing embedded images:", imgError);
        }
      }

    }

    // If no content extracted, return success with 0 chunks (don't throw 500)
    if (pageAnalyses.length === 0 || pageAnalyses.every(p => !p.text_content?.trim())) {
      console.log("No content extracted from this batch. Returning success with 0 chunks.");
      await supabase.from("documents").update({ processed: true }).eq("id", document_id);
      return new Response(
        JSON.stringify({ success: true, message: "Página sin contenido extraíble", chunks_count: 0, images_count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // COMMON: Create chunks and embeddings
    // ========================================================================

    console.log(`Analyzed ${pageAnalyses.length} pages, preparing chunks...`);

    // Clear previous data only on first batch
    if (isFirstBatch) {
      console.log("First batch: clearing previous chunks for user...");
      const { error: deleteChunksError } = await supabase.from("document_chunks").delete().eq("user_id", user_id);
      if (deleteChunksError) {
        console.warn("Warning: Could not delete old chunks:", deleteChunksError.message);
      }

      // Only delete images if not explicitly skipped (skip when re-OCR'ing text only)
      if (!skip_image_delete) {
        const { error: deleteImagesError } = await supabase.from("document_images").delete().eq("user_id", user_id);
        if (deleteImagesError) {
          console.warn("Warning: Could not delete old images:", deleteImagesError.message);
        }
      } else {
        console.log("Skipping document_images deletion (skip_image_delete=true)");
      }
    } else {
      console.log(`Batch ${batch_index}: appending to existing chunks...`);
    }

    // Create semantic chunks from page analyses
    const chunks = createSemanticChunks(pageAnalyses);
    console.log(`Created ${chunks.length} chunks from ${pageAnalyses.length} pages`);

    if (chunks.length === 0) {
      console.log("No chunks created from this batch. Returning success with 0 chunks.");
      await supabase.from("documents").update({ processed: true }).eq("id", document_id);
      return new Response(
        JSON.stringify({ success: true, message: "Página sin contenido suficiente", chunks_count: 0, images_count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate embeddings in batches
    console.log("Generating embeddings...");
    const embeddings = await batchGenerateEmbeddings(
      chunks.map(c => c.content),
      openaiApiKey
    );
    console.log(`Generated ${embeddings.length} embeddings`);

    // Insert chunks with embeddings (only fields that exist in table)
    const chunksToInsert = chunks.map((chunk, i) => ({
      user_id,
      document_id,
      content: chunk.content,
      page_number: chunk.page_number,
      embedding: embeddings[i],
    }));

    // Run chunk insert AND image storage in PARALLEL for speed
    console.log(`Inserting ${chunksToInsert.length} chunks + storing images in parallel...`);

    let storedImages = 0;
    const chunkInsertPromise = supabase.from("document_chunks").insert(chunksToInsert);

    const imageStoragePromise = (async () => {
      if (!hasPageImages || skip_image_delete) {
        if (skip_image_delete) console.log("Skipping image storage (re-OCR mode, images already exist)");
        return;
      }
      for (let i = 0; i < page_images.length; i++) {
        const pageNum = pageNumberOffset + i + 1;
        const pageAnalysis = pageAnalyses.find(p => p.page_number === pageNum);
        if (!pageAnalysis?.text_content?.trim()) continue;
        // Only store images for pages with actual visual content (diagrams, figures, illustrations)
        if (!pageAnalysis.has_visual) {
          console.log(`Page ${pageNum}: text-only, skipping image storage`);
          continue;
        }
        console.log(`Page ${pageNum}: has visual content, cropping figure...`);

        try {
          // Get crop coordinates from Vision API to extract clean figure
          const cropCoords = await getFigureCropCoordinates(page_images[i], openaiApiKey);

          let imgBuffer: ArrayBuffer;

          if (cropCoords) {
            console.log(`Page ${pageNum}: crop coordinates = ${JSON.stringify(cropCoords)}`);
            const croppedData = cropJpegImage(page_images[i], cropCoords);
            if (croppedData) {
              console.log(`Page ${pageNum}: cropped successfully (${croppedData.length} bytes)`);
              imgBuffer = croppedData.buffer;
            } else {
              console.log(`Page ${pageNum}: crop failed, using full page image`);
              imgBuffer = base64ToArrayBuffer(page_images[i]);
            }
          } else {
            console.log(`Page ${pageNum}: no crop coordinates found, using full page image`);
            imgBuffer = base64ToArrayBuffer(page_images[i]);
          }

          const imgPath = `${user_id}/${document_id}/page_${pageNum}.jpg`;

          await supabase.storage
            .from("document-images")
            .upload(imgPath, imgBuffer, { contentType: "image/jpeg", upsert: true });

          const { data: signedUrlData } = await supabase.storage
            .from("document-images")
            .createSignedUrl(imgPath, 365 * 24 * 60 * 60);

          if (signedUrlData?.signedUrl) {
            const imageContext = pageAnalysis.text_content.slice(0, 500);
            // REUSE chunk embedding instead of generating a new one (saves ~2-3s)
            const chunkIdx = chunksToInsert.findIndex(c => c.page_number === pageNum);
            const imgEmbedding = chunkIdx >= 0 ? embeddings[chunkIdx] : embeddings[0];

            await supabase.from("document_images").insert({
              user_id,
              document_id,
              page_number: pageNum,
              image_url: signedUrlData.signedUrl,
              context: imageContext,
              embedding: imgEmbedding,
            });
            storedImages++;
          }
        } catch (imgErr) {
          console.error(`Error storing page ${pageNum} image:`, imgErr);
        }
      }
    })();

    const [{ error: insertChunksError }] = await Promise.all([chunkInsertPromise, imageStoragePromise]);

    if (insertChunksError) {
      console.error("Insert chunks error:", insertChunksError);
      throw new Error(`Failed to insert chunks: ${insertChunksError.message}`);
    }

    console.log(`Done: ${chunksToInsert.length} chunks + ${storedImages} images`);
    totalChunks = chunks.length;

    // Mark document as processed
    await supabase
      .from("documents")
      .update({ processed: true })
      .eq("id", document_id);

    console.log("Processing complete!");

    return new Response(
      JSON.stringify({
        success: true,
        message: "PDF procesado correctamente",
        chunks_count: totalChunks,
        images_count: storedImages,
        total_pages: pageAnalyses.length,
        processing_method: hasPageImages ? 'vision' : 'assistants',
        summary: `Documento analizado: ${totalChunks} fragmentos, ${storedImages} imágenes de ${pageAnalyses.length} páginas`,
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
            role: "system",
            content: "Eres un sistema de OCR de alta precisión. Tu ÚNICA función es transcribir EXACTAMENTE, CARÁCTER POR CARÁCTER, el texto visible en la imagen. NO parafrasees. NO cambies palabras. NO resumas. NO interpretes. Cada palabra, número, signo de puntuación y espacio debe ser idéntico al original."
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: pageImageBase64.startsWith("data:")
                    ? pageImageBase64
                    : `data:image/jpeg;base64,${pageImageBase64}`,
                  detail: "high"
                }
              },
              {
                type: "text",
                text: `Transcribe TEXTUALMENTE todo el contenido visible de esta página del documento.

INSTRUCCIONES DE TRANSCRIPCIÓN EXACTA:
- COPIA CADA PALABRA EXACTAMENTE como aparece. Si dice "presión progresivamente", escribe "presión progresivamente", NO "permanencia".
- Si dice "Si el uso es diario y continuo, engrasar cada día", copia ESA FRASE EXACTA con el condicional "Si".
- NUNCA sustituyas una palabra por un sinónimo.
- NUNCA fusiones dos frases en una.
- NUNCA cambies tiempos verbales (si dice "efectuará" NO pongas "efectúe").
- Mantén la estructura: títulos, subtítulos, listas numeradas, tablas.
- Para tablas: transcribe cada celda con sus valores exactos usando | como separador.
- Si hay imagen/diagrama/figura: escribe [IMAGEN: descripción breve de lo que muestra].
- Si no puedes leer algo con certeza, escribe [ilegible].
- PROHIBIDO inventar texto que no esté visible en la imagen.

Primera línea obligatoria:
[HAS_VISUAL: SI] si hay imágenes, diagramas, figuras o esquemas visibles
[HAS_VISUAL: NO] si solo hay texto/tablas

[CONTENIDO]`
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Vision API error for page ${pageNumber}:`, errorText);
      return {
        page_number: pageNumber,
        text_content: "",
        diagrams: [],
        tables: [],
        key_elements: []
      };
    }

    const data = await response.json();
    const rawContent = data.choices[0]?.message?.content || "";

    // Parse HAS_VISUAL flag and content
    const hasVisualMatch = rawContent.match(/\[HAS_VISUAL:\s*(SI|NO)\]/i);
    let hasVisual = hasVisualMatch ? hasVisualMatch[1].toUpperCase() === "SI" : false;

    // Fallback: detect visual content by keywords in transcribed text
    if (!hasVisual) {
      const lowerContent = rawContent.toLowerCase();
      if (/\[figura[:\s]/i.test(rawContent) || /figura\s+\d/i.test(rawContent) ||
          /diagrama/i.test(rawContent) || /ilustraci[oó]n/i.test(rawContent) ||
          /\[imagen[:\s]/i.test(rawContent) || /esquema/i.test(rawContent)) {
        hasVisual = true;
        console.log(`Page ${pageNumber}: HAS_VISUAL forced to SI by keyword detection`);
      }
    }

    // Extract content after [CONTENIDO] tag, or use full text if tag not found
    const contentMatch = rawContent.match(/\[CONTENIDO\]\s*([\s\S]*)/i);
    const content = contentMatch ? contentMatch[1].trim() : rawContent.replace(/\[HAS_VISUAL:\s*(?:SI|NO)\]/i, "").trim();

    console.log(`Page ${pageNumber}: has_visual=${hasVisual}, content_length=${content.length}`);

    return {
      page_number: pageNumber,
      text_content: content,
      has_visual: hasVisual,
      diagrams: [],
      tables: [],
      key_elements: []
    };

  } catch (error) {
    console.error(`Error analyzing page ${pageNumber}:`, error);
    return {
      page_number: pageNumber,
      text_content: "",
      has_visual: false,
      diagrams: [],
      tables: [],
      key_elements: []
    };
  }
}


// ============================================================================
// FIGURE CROPPING - Extract clean diagrams without surrounding text
// ============================================================================

async function getFigureCropCoordinates(
  pageImageBase64: string,
  apiKey: string
): Promise<{ top: number; left: number; bottom: number; right: number } | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: pageImageBase64.startsWith("data:")
                  ? pageImageBase64
                  : `data:image/jpeg;base64,${pageImageBase64}`,
                detail: "low"
              }
            },
            {
              type: "text",
              text: `This page from a technical manual contains a figure, diagram, or illustration. I need to crop ONLY the visual element.

Return ONLY valid JSON with percentage coordinates: {"top": <0-100>, "left": <0-100>, "bottom": <0-100>, "right": <0-100>}

Rules:
- Include the figure/diagram/illustration and its labels, arrows, legends
- Include the figure title/caption if directly attached
- EXCLUDE all body text paragraphs above and below
- EXCLUDE page headers and footers
- Add 3% margin around the figure
- If multiple figures exist, include ALL in one bounding box
- If no clear figure exists, return {"top":0,"left":0,"bottom":0,"right":0}

Return ONLY the JSON, no explanation.`
            }
          ]
        }],
        max_tokens: 60,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.error("Crop coordinates API error:", await response.text());
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const coords = JSON.parse(jsonStr);

    // Validate coordinates
    if (!coords || typeof coords.top !== "number" || typeof coords.bottom !== "number" ||
        typeof coords.left !== "number" || typeof coords.right !== "number") {
      console.warn("Invalid crop coordinates format:", content);
      return null;
    }

    // Check if it's a "no figure" response
    if (coords.top === 0 && coords.bottom === 0) return null;

    // Validate range
    if (coords.top < 0 || coords.top > 100 || coords.bottom < 0 || coords.bottom > 100 ||
        coords.left < 0 || coords.left > 100 || coords.right < 0 || coords.right > 100) {
      console.warn("Crop coordinates out of range:", coords);
      return null;
    }

    // Ensure bottom > top and right > left
    if (coords.bottom <= coords.top || coords.right <= coords.left) {
      console.warn("Invalid crop box (bottom <= top or right <= left):", coords);
      return null;
    }

    // Ensure minimum size (at least 10% of page in each dimension)
    if (coords.bottom - coords.top < 10 || coords.right - coords.left < 10) {
      console.warn("Crop box too small:", coords);
      return null;
    }

    return coords;
  } catch (error) {
    console.error("Error getting crop coordinates:", error);
    return null;
  }
}

function cropJpegImage(
  imageBase64: string,
  coords: { top: number; left: number; bottom: number; right: number }
): Uint8Array | null {
  try {
    // Decode base64 to buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const binaryString = atob(base64Data);
    const inputBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      inputBytes[i] = binaryString.charCodeAt(i);
    }

    // Decode JPEG to raw pixels
    const decoded = jpeg.decode(inputBytes, { useTArray: true });
    const { width, height, data } = decoded;

    // Calculate pixel coordinates from percentages
    const x = Math.max(0, Math.floor((coords.left / 100) * width));
    const y = Math.max(0, Math.floor((coords.top / 100) * height));
    const x2 = Math.min(width, Math.ceil((coords.right / 100) * width));
    const y2 = Math.min(height, Math.ceil((coords.bottom / 100) * height));
    const cropW = x2 - x;
    const cropH = y2 - y;

    if (cropW <= 0 || cropH <= 0) return null;

    console.log(`Cropping: ${width}x${height} -> ${cropW}x${cropH} (x:${x}, y:${y})`);

    // Crop pixel data (RGBA format, 4 bytes per pixel)
    const croppedData = new Uint8Array(cropW * cropH * 4);
    for (let row = 0; row < cropH; row++) {
      const srcOffset = ((y + row) * width + x) * 4;
      const dstOffset = row * cropW * 4;
      croppedData.set(data.subarray(srcOffset, srcOffset + cropW * 4), dstOffset);
    }

    // Re-encode to JPEG
    const encoded = jpeg.encode({ data: croppedData, width: cropW, height: cropH }, 85);
    return encoded.data;
  } catch (error) {
    console.error("Error cropping JPEG image:", error);
    return null;
  }
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
      model: "gpt-4o-mini",
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
      temperature: 0,
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

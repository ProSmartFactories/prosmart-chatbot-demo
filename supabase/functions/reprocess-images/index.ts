import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import jpeg from "https://esm.sh/jpeg-js@0.4.4";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Optional: filter by user_id or limit
    const body = await req.json().catch(() => ({}));
    const filterUserId = body.user_id || null;
    const maxImages = body.limit || 50;

    // Get document_images
    let query = supabase
      .from("document_images")
      .select("id, user_id, document_id, page_number, image_url")
      .order("user_id")
      .order("page_number")
      .limit(maxImages);

    if (filterUserId) {
      query = query.eq("user_id", filterUserId);
    }

    const { data: images, error: imgErr } = await query;

    if (imgErr) throw new Error(`Failed to fetch images: ${imgErr.message}`);
    if (!images || images.length === 0) {
      return new Response(JSON.stringify({ message: "No images to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${images.length} images to re-crop`);
    let cropped = 0;
    let skipped = 0;
    let failed = 0;

    for (const img of images) {
      try {
        console.log(`[${img.id}] Page ${img.page_number} - downloading...`);

        // 1. Download the current full-page image from storage directly
        const storagePath = `${img.user_id}/${img.document_id}/page_${img.page_number}.jpg`;
        const { data: fileData, error: dlErr } = await supabase.storage
          .from("document-images")
          .download(storagePath);

        if (dlErr || !fileData) {
          console.warn(`[${img.id}] Download failed: ${dlErr?.message}`);
          failed++;
          continue;
        }

        const imgArrayBuffer = await fileData.arrayBuffer();
        const imgBytes = new Uint8Array(imgArrayBuffer);

        // Use Deno's base64 encode (memory-safe, no spread operator)
        const imgBase64 = base64Encode(imgBytes);

        console.log(`[${img.id}] Downloaded ${imgBytes.length} bytes, getting crop coords...`);

        // 2. Get crop coordinates from Vision API
        const cropCoords = await getFigureCropCoordinates(imgBase64, openaiApiKey);

        if (!cropCoords) {
          console.log(`[${img.id}] No figure found, skipping`);
          skipped++;
          continue;
        }

        console.log(`[${img.id}] Crop: ${JSON.stringify(cropCoords)}`);

        // 3. Crop the image
        const croppedData = cropJpegImage(imgBytes, cropCoords);
        if (!croppedData) {
          console.warn(`[${img.id}] Crop failed`);
          failed++;
          continue;
        }

        console.log(`[${img.id}] Cropped: ${croppedData.length} bytes`);

        // 4. Re-upload to same storage path
        const { error: uploadErr } = await supabase.storage
          .from("document-images")
          .upload(storagePath, croppedData.buffer, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (uploadErr) {
          console.warn(`[${img.id}] Upload failed: ${uploadErr.message}`);
          failed++;
          continue;
        }

        // 5. Generate new signed URL (1 year)
        const { data: signedUrlData } = await supabase.storage
          .from("document-images")
          .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

        if (signedUrlData?.signedUrl) {
          await supabase
            .from("document_images")
            .update({ image_url: signedUrlData.signedUrl })
            .eq("id", img.id);
        }

        cropped++;
        console.log(`[${img.id}] Done!`);
      } catch (err) {
        console.error(`[${img.id}] Error:`, err);
        failed++;
      }
    }

    const result = { total: images.length, cropped, skipped, failed };
    console.log("Complete:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// FIGURE CROPPING
// ============================================================================

async function getFigureCropCoordinates(
  imageBase64: string,
  apiKey: string
): Promise<{ top: number; left: number; bottom: number; right: number } | null> {
  try {
    const dataUrl = `data:image/jpeg;base64,${imageBase64}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
              {
                type: "text",
                text: `Look at this image from a technical manual. I need crop coordinates to extract ONLY the drawn mechanical illustration/diagram. The result must show ZERO lines of body text.

Return JSON: {"top": <0-100>, "left": <0-100>, "bottom": <0-100>, "right": <0-100|}

INCLUDE in crop:
- The drawn illustration/diagram/figure (lines, shapes, mechanical parts)
- Labels with arrows pointing to parts of the drawing
- The "Figura X" caption line directly below the drawing

EXCLUDE from crop (set boundaries to cut these out):
- ANY paragraph text (sentences describing procedures, maintenance, operation)
- ANY "ATENCION:" or "IMPORTANTE:" warning blocks
- ANY bullet points or numbered instruction lists
- ANY tables with data/specifications
- ANY page headers, footers, section titles not part of the drawing
- ANY text that forms complete sentences

BOUNDARY RULES:
- Set "top" BELOW any paragraph text that appears above the drawing
- Set "bottom" ABOVE any paragraph text or warning block below the drawing caption
- The crop must end right after the "Figura X" caption, NOT include any text below it
- Prefer cutting too tight (losing a small part of drawing edge) over including ANY body text

If this image has no mechanical drawing/diagram, return {"top":0,"left":0,"bottom":0,"right":0}

JSON only, no explanation.`,
              },
            ],
          },
        ],
        max_tokens: 60,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.error("Vision API error:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "";
    const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const coords = JSON.parse(jsonStr);

    if (!coords || typeof coords.top !== "number" || typeof coords.bottom !== "number") return null;
    if (coords.top === 0 && coords.bottom === 0) return null;
    if (coords.top < 0 || coords.bottom > 100 || coords.left < 0 || coords.right > 100) return null;
    if (coords.bottom <= coords.top || coords.right <= coords.left) return null;
    if (coords.bottom - coords.top < 10 || coords.right - coords.left < 10) return null;

    return coords;
  } catch (error) {
    console.error("Crop coords error:", error);
    return null;
  }
}

function cropJpegImage(
  imageBytes: Uint8Array,
  coords: { top: number; left: number; bottom: number; right: number }
): Uint8Array | null {
  try {
    // Decode JPEG directly from bytes (no base64 conversion needed)
    const decoded = jpeg.decode(imageBytes, { useTArray: true });
    const { width, height, data } = decoded;

    const x = Math.max(0, Math.floor((coords.left / 100) * width));
    const y = Math.max(0, Math.floor((coords.top / 100) * height));
    const x2 = Math.min(width, Math.ceil((coords.right / 100) * width));
    const y2 = Math.min(height, Math.ceil((coords.bottom / 100) * height));
    const cropW = x2 - x;
    const cropH = y2 - y;

    if (cropW <= 0 || cropH <= 0) return null;

    const croppedData = new Uint8Array(cropW * cropH * 4);
    for (let row = 0; row < cropH; row++) {
      const srcOffset = ((y + row) * width + x) * 4;
      const dstOffset = row * cropW * 4;
      croppedData.set(data.subarray(srcOffset, srcOffset + cropW * 4), dstOffset);
    }

    const encoded = jpeg.encode({ data: croppedData, width: cropW, height: cropH }, 95);
    return encoded.data;
  } catch (error) {
    console.error("Crop JPEG error:", error);
    return null;
  }
}

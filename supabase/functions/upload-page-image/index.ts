import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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

    const body = await req.json();

    // Support batch mode: { action: "batch", user_id, document_id, clear_existing, images: [...] }
    if (body.action === "batch") {
      const { user_id, document_id, clear_existing, images } = body;

      if (!user_id || !document_id || !images?.length) {
        return new Response(
          JSON.stringify({ error: "Missing: user_id, document_id, images" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Clear existing entries if requested
      if (clear_existing) {
        await supabase.from("document_images").delete().eq("user_id", user_id);
        console.log("Cleared existing document_images");
      }

      let success = 0;
      let failed = 0;

      for (const img of images) {
        try {
          const { figure_name, page_number, context, image_base64 } = img;

          // Decode base64
          const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Detect content type
          const isPng = image_base64.includes("data:image/png") ||
            (bytes[0] === 0x89 && bytes[1] === 0x50);
          const contentType = isPng ? "image/png" : "image/jpeg";
          const ext = isPng ? "png" : "jpg";

          // Upload with figure name in path
          const safeName = figure_name.replace(/[^a-zA-Z0-9_.-]/g, "_");
          const storagePath = `${user_id}/${document_id}/${safeName}.${ext}`;

          await supabase.storage
            .from("document-images")
            .upload(storagePath, bytes.buffer, { contentType, upsert: true });

          // Generate signed URL (1 year)
          const { data: signedUrlData } = await supabase.storage
            .from("document-images")
            .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

          if (!signedUrlData?.signedUrl) {
            throw new Error("Failed to generate signed URL");
          }

          // Generate embedding for context
          const embResponse = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openaiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "text-embedding-3-small",
              input: context.slice(0, 8000),
            }),
          });

          let embedding = null;
          if (embResponse.ok) {
            const embData = await embResponse.json();
            embedding = embData.data[0]?.embedding;
          }

          // Insert new document_images entry
          await supabase.from("document_images").insert({
            user_id,
            document_id,
            page_number,
            image_url: signedUrlData.signedUrl,
            context,
            embedding,
          });

          console.log(`OK: ${figure_name} (page ${page_number})`);
          success++;
        } catch (err) {
          console.error(`FAIL: ${img.figure_name}:`, (err as Error).message);
          failed++;
        }
      }

      return new Response(
        JSON.stringify({ success: true, uploaded: success, failed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single image mode (backwards compatible)
    const { user_id, document_id, page_number, image_base64 } = body;

    if (!user_id || !document_id || !page_number || !image_base64) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const storagePath = `${user_id}/${document_id}/page_${page_number}.jpg`;
    await supabase.storage
      .from("document-images")
      .upload(storagePath, bytes.buffer, { contentType: "image/jpeg", upsert: true });

    const { data: signedUrlData } = await supabase.storage
      .from("document-images")
      .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

    if (signedUrlData?.signedUrl) {
      await supabase
        .from("document_images")
        .update({ image_url: signedUrlData.signedUrl })
        .eq("user_id", user_id)
        .eq("page_number", page_number);
    }

    return new Response(
      JSON.stringify({ success: true, page_number, size: bytes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

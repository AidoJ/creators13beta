import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PHOTO_REQUIREMENTS: Record<string, string> = {
  face_front_closed:
    "A front-facing photo of the person's face with mouth closed and a neutral expression. The entire face must be visible including forehead, ears, and jawline. No glasses, hair tied back. Permanent cosmetic features like tattooed eyebrows, microbladed brows, eyelash extensions, and permanent eyeliner are acceptable and must not cause a rejection.",
  face_front_smiling:
    "A front-facing photo of the person's face smiling with teeth showing. The face should be mostly visible including forehead and jawline. No glasses, hair tied back. The photo can be in portrait or landscape orientation — do not fail based on orientation alone. Permanent cosmetic features like tattooed eyebrows, microbladed brows, eyelash extensions, and permanent eyeliner are acceptable and must not cause a rejection.",
  face_side:
    "A clear side profile of the person's face. The ear, jawline, and nose profile should be clearly visible. No glasses, hair tied back behind the ear.",
  body_front:
    "A full body photo from head to toe, person facing the camera, standing naturally. Must be wearing tight-fitting clothing (swimwear/yoga wear). No shoes or socks. The entire body from head to feet must be visible.",
  body_back:
    "A full body photo from head to toe, person's back facing the camera, standing naturally. The spine should be visible. Must be wearing tight-fitting clothing. No shoes or socks. The entire body from head to feet must be visible.",
  body_side:
    "A full body photo from head to toe, side profile of the person standing naturally. Must be wearing tight-fitting clothing. No shoes or socks. The entire body from head to feet must be visible.",
  feet:
    "A photo of BOTH bare feet (no shoes or socks) while STANDING upright on the ground. Both feet must be visible. Toes and arches should be clearly visible. The person must be standing, not sitting or lying down.",
  hands:
    "A photo of BOTH hands placed flat (palm-down) on a table or floor surface. The back of both hands must face the camera. Fingers should be spread slightly. BOTH hands must be visible in the photo.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { photo_type, image_base64 } = await req.json();

    if (!photo_type || !image_base64) {
      return new Response(
        JSON.stringify({ error: "photo_type and image_base64 are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requirement = PHOTO_REQUIREMENTS[photo_type];
    if (!requirement) {
      return new Response(
        JSON.stringify({ error: "Unknown photo_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a photo quality reviewer for a body profiling service called 13 Creators. 
Your job is to check if a submitted photo meets specific requirements.

HARD FAIL rules — these MUST cause a fail:
1. **Selfies**: If the person is visibly holding a phone or has an arm raised/extended to hold a camera, FAIL immediately. Body photos must be taken by another person or using a timer with the phone propped up. Look for: arm reaching toward camera, phone visible in hand, mirror selfie with phone visible.
2. **Cut-off body parts**: For full body photos (body_front, body_back, body_side), the ENTIRE body from the top of the head to the tips of the toes MUST be visible in the frame. If feet are cut off, even partially, FAIL. If the head is cut off, FAIL.
3. **Severely blurry**: If the subject is so blurry that facial features or body contours cannot be distinguished, FAIL.
4. **Only one hand**: For hand photos, BOTH hands must be visible. If only one hand is shown, FAIL. The hands must be placed flat (palm-down) on a table or floor surface.
5. **Only one foot**: For feet photos, BOTH feet must be visible. If only one foot is shown, FAIL. The person must be STANDING upright — if they are sitting or lying down with feet in the air, FAIL.
6. **Removable obstructions on face**: For face photos, FAIL if the face is obscured by REMOVABLE items such as glasses, sunglasses, loose hair hanging over the face, hats, scarves, or face masks. Hair should be tied back so the forehead, ears, and jawline are visible.

Things that are OK and must NOT cause a fail:
- **Permanent or semi-permanent cosmetic features**: Tattooed eyebrows, microbladed brows, eyelash extensions, permanent eyeliner, lip tattoos, or any other cosmetic tattoo. These are permanent features that cannot be removed and must NEVER be a reason to reject a photo.
- **Natural makeup that does not obscure facial structure**: Light foundation, lip colour, or similar minimal makeup is acceptable as long as facial features and bone structure remain clearly visible.
- Photo orientation (portrait vs landscape) — either is fine
- Slight variations in expression or posture
- Minor lighting issues if the subject is still clearly visible
- Background clutter

Focus your assessment on:
1. Does the photo match the expected type (face/body/feet/hands)?
2. Is this a selfie? (arm extended, phone in hand, mirror selfie)
3. Is the full body visible head-to-toe for body shots?
4. For face photos: are there REMOVABLE obstructions (glasses, loose hair, hats)? Permanent cosmetics like tattooed eyebrows or lash extensions are NOT obstructions.
5. Is the photo clear enough for a practitioner to assess?

When providing feedback for a fail, be specific about what needs to change (e.g. "This appears to be a selfie — please use a timer or ask someone to take the photo" or "Your feet are cut off — please step back or have the photographer angle down to include your full body").`;


    const userPrompt = `Review this photo. It should be: ${requirement}

Check if the photo meets these requirements and provide your assessment.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "photo_review",
              description: "Submit the photo review result",
              parameters: {
                type: "object",
                properties: {
                  pass: {
                    type: "boolean",
                    description: "true if the photo meets the requirements well enough for profiling, false if it needs to be retaken",
                  },
                  feedback: {
                    type: "string",
                    description: "Brief feedback (1-2 sentences) explaining the result. If pass=true, confirm what looks good. If pass=false, explain what needs to change.",
                  },
                },
                required: ["pass", "feedback"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "photo_review" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI review unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      // Fallback: auto-pass if AI didn't use the tool
      return new Response(
        JSON.stringify({ pass: true, feedback: "Photo accepted." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("review-photo error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

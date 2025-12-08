import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract image URLs from HTML
function extractImageUrls(html: string, baseUrl: string): string[] {
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const images: string[] = [];
  let match;
  
  while ((match = imgRegex.exec(html)) !== null) {
    let src = match[1];
    
    // Skip data URLs, icons, logos, and very small images
    if (src.startsWith('data:') || 
        src.includes('logo') || 
        src.includes('icon') ||
        src.includes('favicon') ||
        src.includes('avatar')) {
      continue;
    }
    
    // Convert relative URLs to absolute
    if (src.startsWith('/')) {
      const url = new URL(baseUrl);
      src = `${url.protocol}//${url.host}${src}`;
    } else if (!src.startsWith('http')) {
      src = new URL(src, baseUrl).href;
    }
    
    images.push(src);
  }
  
  // Return max 5 images to avoid token limits
  return images.slice(0, 5);
}

// Convert image URL to base64
async function imageToBase64(imageUrl: string): Promise<{ url: string; base64: string; mimeType: string } | null> {
  try {
    console.log(`Fetching image: ${imageUrl}`);
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      console.log(`Failed to fetch image: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      console.log(`Not an image: ${contentType}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Check minimum size (skip tiny images like 1x1 pixels)
    if (uint8Array.length < 1000) {
      console.log(`Image too small: ${uint8Array.length} bytes`);
      return null;
    }
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    
    return {
      url: imageUrl,
      base64,
      mimeType: contentType.split(';')[0],
    };
  } catch (error) {
    console.error(`Error fetching image ${imageUrl}:`, error);
    return null;
  }
}

// Analyze images using Lovable AI (Gemini vision)
async function analyzeImages(images: { url: string; base64: string; mimeType: string }[]): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey || images.length === 0) {
    return '';
  }
  
  console.log(`Analyzing ${images.length} images with AI vision...`);
  
  try {
    const imageContents = images.map((img, index) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    }));
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Jsi expert na analýzu dokumentace aplikací. Analyzuj screenshoty z dokumentace a vytvoř detailní popis toho, co ukazují.
Pro každý obrázek popiš:
1. Jaká část aplikace je zobrazena (menu, dialog, formulář, atd.)
2. Jaké akce jsou vyznačeny (šipky, červená označení, čísla kroků)
3. Konkrétní kroky, které uživatel má provést
4. Názvy tlačítek, polí a dalších UI prvků

Piš v češtině. Buď konkrétní a přesný.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyzuj tyto ${images.length} screenshoty z dokumentace aplikace. Popiš co každý ukazuje a jaké kroky dokumentuje:`,
              },
              ...imageContents,
            ],
          },
        ],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI vision error: ${response.status} - ${errorText}`);
      return '';
    }
    
    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || '';
    
    console.log(`Image analysis complete: ${analysis.length} characters`);
    return analysis;
  } catch (error) {
    console.error('Error analyzing images:', error);
    return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { url, analyzeImages: shouldAnalyzeImages = true } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Fetching documentation from: ${url}, analyzeImages: ${shouldAnalyzeImages}`);

    // Fetch the URL content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch URL: ${response.status}`);
      return new Response(JSON.stringify({ error: `Failed to fetch URL: ${response.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = response.headers.get('content-type') || '';
    let content = '';
    let imageAnalysis = '';
    let extractedImages: string[] = [];

    if (contentType.includes('text/html')) {
      const html = await response.text();
      
      // Extract image URLs before cleaning HTML
      if (shouldAnalyzeImages) {
        extractedImages = extractImageUrls(html, url);
        console.log(`Found ${extractedImages.length} images to analyze`);
        
        if (extractedImages.length > 0) {
          // Fetch and convert images to base64
          const imagePromises = extractedImages.map(imgUrl => imageToBase64(imgUrl));
          const imageResults = await Promise.all(imagePromises);
          const validImages = imageResults.filter((img): img is NonNullable<typeof img> => img !== null);
          
          console.log(`Successfully fetched ${validImages.length} images`);
          
          // Analyze images with AI vision
          if (validImages.length > 0) {
            imageAnalysis = await analyzeImages(validImages);
          }
        }
      }
      
      // Extract text content from HTML
      let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
      
      // Extract main content if available
      const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                        text.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                        text.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      
      if (mainMatch) {
        text = mainMatch[1];
      }

      // Convert common HTML elements to readable text
      text = text
        .replace(/<h[1-6][^>]*>/gi, '\n\n## ')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<p[^>]*>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li[^>]*>/gi, '\n- ')
        .replace(/<\/li>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      content = text;
    } else if (contentType.includes('text/plain') || contentType.includes('text/markdown')) {
      content = await response.text();
    } else {
      return new Response(JSON.stringify({ error: 'Unsupported content type. Use HTML, TXT, or MD URLs.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Combine text content with image analysis
    if (imageAnalysis) {
      content = `${content}\n\n---\n\n## Analýza obrázků z dokumentace\n\n${imageAnalysis}`;
    }

    // Limit content length
    if (content.length > 80000) {
      content = content.substring(0, 80000) + '\n\n... (text zkrácen)';
    }

    console.log(`Extracted ${content.length} characters from URL (including ${imageAnalysis ? 'image analysis' : 'no images'})`);

    return new Response(JSON.stringify({ 
      content,
      imagesAnalyzed: extractedImages.length,
      hasImageAnalysis: !!imageAnalysis,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching documentation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

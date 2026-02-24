import { Router, Request, Response } from 'express';
import { callAI } from '../utils/ai';

export const fetchDocumentationRouter = Router();

// Extract image URLs from content
function extractImageUrls(content: string, baseUrl: string): string[] {
  const images: string[] = [];
  let match;

  const patterns = [
    /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/gi,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi,
    /https?:\/\/[^\s<>"]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s<>"]*)?/gi,
  ];

  for (const regex of patterns) {
    while ((match = regex.exec(content)) !== null) {
      images.push(match[1] || match[0]);
    }
  }

  const seen = new Set<string>();
  const processed: string[] = [];

  for (let src of images) {
    if (src.startsWith('data:') || src.includes('logo') || src.includes('icon') || src.includes('favicon')) continue;
    if (src.startsWith('/')) {
      const url = new URL(baseUrl);
      src = `${url.protocol}//${url.host}${src}`;
    } else if (!src.startsWith('http')) {
      try { src = new URL(src, baseUrl).href; } catch { continue; }
    }
    if (seen.has(src)) continue;
    seen.add(src);
    processed.push(src);
  }

  return processed.slice(0, 8);
}

// Fetch page content
async function fetchRenderedPage(url: string): Promise<string> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl, { headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' } });
    if (response.ok) {
      const content = await response.text();
      if (content.length > 1000) return content;
    }
  } catch { /* fallback */ }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  return await response.text();
}

fetchDocumentationRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { url, analyzeImages: shouldAnalyzeImages = true } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const rawContent = await fetchRenderedPage(url);
    const isHtml = rawContent.startsWith('<!') || rawContent.startsWith('<html') || rawContent.includes('<');

    let content = '';
    let imageAnalysis = '';
    const extractedImages: string[] = [];

    if (isHtml) {
      if (shouldAnalyzeImages) {
        extractedImages.push(...extractImageUrls(rawContent, url));
      }

      // Clean HTML to text
      let text = rawContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

      const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
        text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
      if (mainMatch) text = mainMatch[1];

      text = text
        .replace(/<h[1-6][^>]*>/gi, '\n\n## ')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<p[^>]*>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li[^>]*>/gi, '\n- ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      content = text;
    } else {
      content = rawContent;
    }

    if (imageAnalysis) {
      content += `\n\n---\n\n## Analýza obrázků\n\n${imageAnalysis}`;
    }

    if (content.length > 80000) {
      content = content.substring(0, 80000) + '\n\n... (zkráceno)';
    }

    res.json({ content, imagesAnalyzed: extractedImages.length, hasImageAnalysis: !!imageAnalysis });
  } catch (error) {
    console.error('Error fetching documentation:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

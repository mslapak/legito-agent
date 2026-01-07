import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to normalize URLs from various response shapes
const normalizeUrls = (val: unknown): string[] => {
  if (!val) return [];
  if (typeof val === 'string') return [val];
  if (Array.isArray(val)) {
    return val
      .map((x) => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object') {
          const obj = x as Record<string, unknown>;
          const candidate =
            obj.url ??
            obj.downloadUrl ??
            obj.download_url ??
            obj.signedUrl ??
            obj.signed_url ??
            obj.recordingUrl ??
            obj.recording_url ??
            obj.videoUrl ??
            obj.video_url ??
            obj.screenshotUrl ??
            obj.screenshot_url ??
            obj.fileUrl ??
            obj.file_url ??
            obj.mediaUrl ??
            obj.media_url ??
            obj.src ??
            obj.href;
          return typeof candidate === 'string' ? candidate : null;
        }
        return null;
      })
      .filter((x): x is string => !!x);
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    return normalizeUrls(
      obj.screenshots ??
        obj.recordings ??
        obj.recording_url ??
        obj.recordingUrl ??
        obj.video_url ??
        obj.videoUrl ??
        obj.urls ??
        obj.data ??
        obj.items ??
        obj.files ??
        obj.media ??
        obj.outputFiles ??
        obj.output_files ??
        obj.artifacts
    );
  }
  return [];
};

// Helper to map Browser-Use v2 status to our internal status
const mapStatus = (browserStatus: string, hasOutput: boolean): string => {
  if (browserStatus === 'finished') return 'completed';
  if (browserStatus === 'failed') return 'failed';
  if (browserStatus === 'stopped') {
    return hasOutput ? 'completed' : 'cancelled';
  }
  if (['running', 'started', 'created'].includes(browserStatus)) {
    return 'running';
  }
  return 'pending';
};

// Helper function for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BROWSER_USE_API_KEY = Deno.env.get('BROWSER_USE_API_KEY');
    if (!BROWSER_USE_API_KEY) {
      throw new Error('BROWSER_USE_API_KEY is not configured');
    }

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

    const { action, taskId, prompt, title, projectId, keepBrowserOpen, followUpPrompt, taskType, fileName, fileBase64, contentType, includedFiles, dbTaskId } = await req.json();
    console.log(`Action: ${action}, User: ${user.id}, TaskId: ${taskId || 'N/A'}, TaskType: ${taskType || 'test'}`);

    // Browser-Use Cloud API base URL - v2 API
    const BROWSER_USE_API_URL = 'https://api.browser-use.com/api/v2';

    switch (action) {
      case 'diagnose': {
        // Test API connectivity and return info
        console.log('Running API diagnostics...');
        try {
          const testRes = await fetch(`${BROWSER_USE_API_URL}/tasks`, {
            method: 'GET',
            headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
          });
          const raw = await testRes.text();
          console.log('Diagnose tasks list:', testRes.status, raw);
          return new Response(JSON.stringify({ 
            status: testRes.status, 
            ok: testRes.ok,
            response: raw.substring(0, 500),
            apiUrl: BROWSER_USE_API_URL,
            timestamp: new Date().toISOString(),
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          console.error('Diagnose error:', e);
          return new Response(JSON.stringify({ 
            error: String(e),
            apiUrl: BROWSER_USE_API_URL,
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      case 'probe_live_url': {
        // Probe various live preview URL formats to find one that works
        console.log(`Probing live URL for task: ${taskId}`);
        
        const candidates: { url: string; source: string; status?: number; ok?: boolean }[] = [];
        
        // First get task details to check for live_url from API
        try {
          const detailsRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
            method: 'GET',
            headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
          });
          
          if (detailsRes.ok) {
            const details = await detailsRes.json();
            console.log('Task details for probe:', JSON.stringify(details, null, 2));
            
            // Add URLs from API response
            if (details.live_url) candidates.push({ url: details.live_url, source: 'api.live_url' });
            if (details.liveUrl) candidates.push({ url: details.liveUrl, source: 'api.liveUrl' });
            if (details.preview_url) candidates.push({ url: details.preview_url, source: 'api.preview_url' });
            if (details.previewUrl) candidates.push({ url: details.previewUrl, source: 'api.previewUrl' });
          }
        } catch (e) {
          console.error('Error fetching task details for probe:', e);
        }
        
        // Add constructed preview URLs
        candidates.push({ url: `https://previews.browser-use.com/${taskId}`, source: 'constructed_previews' });
        candidates.push({ url: `https://preview.browser-use.com/${taskId}`, source: 'constructed_preview' });
        
        // Probe each candidate
        let bestUrl: string | null = null;
        let bestSource: string | null = null;
        
        for (const candidate of candidates) {
          try {
            const probeRes = await fetch(candidate.url, { 
              method: 'HEAD',
              redirect: 'follow',
            });
            candidate.status = probeRes.status;
            candidate.ok = probeRes.ok;
            
            console.log(`Probe ${candidate.source}: ${candidate.url} -> ${probeRes.status}`);
            
            if (probeRes.ok && !bestUrl) {
              bestUrl = candidate.url;
              bestSource = candidate.source;
            }
          } catch (e) {
            console.log(`Probe ${candidate.source} failed:`, e);
            candidate.status = 0;
            candidate.ok = false;
          }
        }
        
        return new Response(JSON.stringify({
          candidates,
          bestUrl,
          bestSource,
          taskId,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'sync_media': {
        // Robustly fetch and normalize media from all sources
        console.log(`Syncing media for task: ${taskId}`);
        
        const [screenshotsRes, mediaRes, detailsRes] = await Promise.all([
          fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/screenshots`, {
            method: 'GET',
            headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
          }),
          fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/media`, {
            method: 'GET',
            headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
          }),
          fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
            method: 'GET',
            headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
          }),
        ]);
        
        let screenshots: string[] = [];
        let recordings: string[] = [];
        const rawShapeHints: Record<string, unknown> = {};
        
        // Parse screenshots
        if (screenshotsRes.ok) {
          const raw = await screenshotsRes.text();
          console.log(`Screenshots HTTP ${screenshotsRes.status}:`, raw);
          try {
            const json = JSON.parse(raw);
            rawShapeHints.screenshots = Object.keys(json);
            screenshots = normalizeUrls(json);
          } catch (e) {
            console.error('Failed to parse screenshots:', e);
          }
        }
        
        // Parse recordings
        if (mediaRes.ok) {
          const raw = await mediaRes.text();
          console.log(`Media HTTP ${mediaRes.status}:`, raw);
          try {
            const json = JSON.parse(raw);
            rawShapeHints.media = Object.keys(json);
            recordings = normalizeUrls(json);
          } catch (e) {
            console.error('Failed to parse media:', e);
          }
        }
        
        // Fallback: extract screenshots from steps
        let taskDetails: Record<string, unknown> | null = null;
        if (detailsRes.ok) {
          const raw = await detailsRes.text();
          console.log(`Task details HTTP ${detailsRes.status}:`, raw.substring(0, 500));
          try {
            taskDetails = JSON.parse(raw);
            rawShapeHints.taskDetails = Object.keys(taskDetails || {});
            
            if (screenshots.length === 0 && Array.isArray(taskDetails?.steps)) {
              const stepShots = (taskDetails.steps as Array<{ screenshotUrl?: string }>)
                .map(s => s?.screenshotUrl)
                .filter((x): x is string => typeof x === 'string');
              screenshots = Array.from(new Set(stepShots));
              console.log(`Fallback screenshots from steps:`, screenshots);
            }
            
            // Check outputFiles for recordings
            if (recordings.length === 0 && taskDetails?.outputFiles) {
              const outputRecordings = normalizeUrls(taskDetails.outputFiles);
              if (outputRecordings.length > 0) {
                recordings = outputRecordings;
                console.log(`Fallback recordings from outputFiles:`, recordings);
              }
            }
          } catch (e) {
            console.error('Failed to parse task details:', e);
          }
        }
        
        // Optionally persist to DB
        if (dbTaskId) {
          const updateData: Record<string, unknown> = {};
          if (screenshots.length > 0) updateData.screenshots = screenshots;
          if (recordings.length > 0) updateData.recordings = recordings;
          
          if (Object.keys(updateData).length > 0) {
            await supabase
              .from('tasks')
              .update(updateData)
              .eq('id', dbTaskId)
              .eq('user_id', user.id);
            console.log(`Updated DB task ${dbTaskId} with media`);
          }
        }
        
        return new Response(JSON.stringify({
          screenshots,
          recordings,
          rawShapeHints,
          taskDetails: taskDetails ? {
            status: taskDetails.status,
            hasOutput: !!taskDetails.output,
            stepsCount: Array.isArray(taskDetails.steps) ? taskDetails.steps.length : 0,
          } : null,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'upload_file': {
        // Upload file using presigned URL
        console.log(`Uploading file: ${fileName}, type: ${contentType}`);
        
        // 1. Get presigned URL
        const presignedRes = await fetch(`${BROWSER_USE_API_URL}/files/presigned-url`, {
          method: 'POST',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ file_name: fileName, content_type: contentType }),
        });

        if (!presignedRes.ok) {
          const errorText = await presignedRes.text();
          console.error('Presigned URL error:', errorText);
          throw new Error(`Failed to get presigned URL: ${presignedRes.status}`);
        }

        const presignedData = await presignedRes.json();
        console.log('Presigned URL response:', JSON.stringify(presignedData));
        const uploadUrl = presignedData.upload_url;

        if (!uploadUrl) {
          throw new Error('No upload_url in presigned response');
        }

        // 2. Upload file content
        const fileBuffer = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: fileBuffer,
          headers: { 'Content-Type': contentType },
        });

        if (!uploadRes.ok) {
          const errorText = await uploadRes.text();
          console.error('File upload error:', errorText);
          throw new Error(`Failed to upload file: ${uploadRes.status}`);
        }

        console.log(`File ${fileName} uploaded successfully`);
        return new Response(JSON.stringify({ success: true, fileName }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'create_task': {
        // Create task in Browser-Use Cloud
        const requestBody: Record<string, unknown> = {
          task: prompt,
          save_browser_data: true,
          record_video: true,
        };
        
        if (keepBrowserOpen) {
          requestBody.keep_browser_open = true;
        }

        if (includedFiles && includedFiles.length > 0) {
          requestBody.included_file_names = includedFiles;
          console.log('Including files in task:', includedFiles);
        }
        
        console.log('Creating task with body:', JSON.stringify(requestBody));
        
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks`, {
          method: 'POST',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!browserUseResponse.ok) {
          const errorText = await browserUseResponse.text();
          console.error('Browser-Use API error:', errorText);
          throw new Error(`Browser-Use API error: ${browserUseResponse.status}`);
        }

        const browserUseData = await browserUseResponse.json();
        console.log('Browser-Use FULL response:', JSON.stringify(browserUseData, null, 2));
        console.log('Available fields:', Object.keys(browserUseData));

        // V2 API: Try multiple URL formats for live preview
        const liveUrl = 
          browserUseData.live_url ||
          browserUseData.liveUrl ||
          browserUseData.preview_url ||
          browserUseData.previewUrl ||
          (browserUseData.id ? `https://previews.browser-use.com/${browserUseData.id}` : null);
        console.log('Constructed live_url:', liveUrl, 'from id:', browserUseData.id);

        // Save task to database with live_url
        const { data: task, error: insertError } = await supabase
          .from('tasks')
          .insert({
            user_id: user.id,
            project_id: projectId || null,
            title: title || prompt.substring(0, 50) + '...',
            prompt: prompt,
            status: 'running',
            browser_use_task_id: browserUseData.id,
            live_url: liveUrl,
            started_at: new Date().toISOString(),
            task_type: taskType || 'test',
          })
          .select()
          .single();

        if (insertError) {
          console.error('Database insert error:', insertError);
          throw insertError;
        }

        return new Response(JSON.stringify({ task, browserUseTaskId: browserUseData.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'continue_task': {
        // Continue a task with a follow-up prompt (human-in-the-loop)
        console.log(`Continuing task ${taskId} with prompt: ${followUpPrompt}`);
        
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/continue`, {
          method: 'POST',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            task: followUpPrompt,
            keep_browser_open: true,
          }),
        });

        if (!browserUseResponse.ok) {
          const errorText = await browserUseResponse.text();
          console.error('Browser-Use API error:', errorText);
          throw new Error(`Browser-Use API error: ${browserUseResponse.status}`);
        }

        const browserUseData = await browserUseResponse.json();
        console.log('Continue task response:', browserUseData);

        return new Response(JSON.stringify({ success: true, data: browserUseData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_task_status': {
        // Get task status from Browser-Use Cloud
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/status`, {
          method: 'GET',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
          },
        });

        // Handle 404 - task session no longer exists
        if (browserUseResponse.status === 404) {
          console.log(`Task ${taskId} not found in Browser-Use (session expired)`);
          return new Response(JSON.stringify({ status: 'not_found', expired: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!browserUseResponse.ok) {
          const errorText = await browserUseResponse.text();
          console.error('Browser-Use API error:', errorText);
          throw new Error(`Browser-Use API error: ${browserUseResponse.status}`);
        }

        const statusData = await browserUseResponse.json();
        return new Response(JSON.stringify(statusData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_task_details': {
        // Get full task details from Browser-Use Cloud
        console.log(`Fetching task details for: ${taskId}`);
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
          method: 'GET',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
          },
        });

        if (!browserUseResponse.ok) {
          const errorText = await browserUseResponse.text();
          console.error('Browser-Use API error:', errorText);
          throw new Error(`Browser-Use API error: ${browserUseResponse.status}`);
        }

        const taskData = await browserUseResponse.json();
        console.log('Task details FULL:', JSON.stringify(taskData, null, 2));
        console.log('Task fields:', Object.keys(taskData));
        
        // V2 API: Ensure live_url is present - try multiple formats
        if (!taskData.live_url && !taskData.liveUrl) {
          taskData.live_url = 
            taskData.preview_url ||
            taskData.previewUrl ||
            (taskData.id ? `https://previews.browser-use.com/${taskData.id}` : null);
        }
        
        // Add mapped status for convenience
        const hasOutput = !!(taskData.output || taskData.finished_at || taskData.finishedAt);
        taskData.mapped_status = mapStatus(taskData.status, hasOutput);
        
        return new Response(JSON.stringify(taskData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'stop_task': {
        // Stop a running task and sync media
        console.log(`Stopping task: ${taskId}`);
        
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/stop`, {
          method: 'PUT',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
          },
        });

        if (!browserUseResponse.ok) {
          const errorText = await browserUseResponse.text();
          console.error('Browser-Use API error:', errorText);
          throw new Error(`Browser-Use API error: ${browserUseResponse.status}`);
        }

        // Wait for browser session to close
        console.log('Waiting for session to close...');
        await delay(5000);
        
        // Try to fetch media with retries
        let screenshots: string[] = [];
        let recordings: string[] = [];
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`Media fetch attempt ${attempt}/${maxRetries}`);
          
          const [screenshotsRes, mediaRes, detailsRes] = await Promise.all([
            fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/screenshots`, {
              method: 'GET',
              headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
            }),
            fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/media`, {
              method: 'GET',
              headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
            }),
            fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
              method: 'GET',
              headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
            }),
          ]);
          
          // Parse screenshots
          if (screenshotsRes.ok) {
            try {
              const json = await screenshotsRes.json();
              const urls = normalizeUrls(json);
              if (urls.length > 0) screenshots = urls;
            } catch (e) {
              console.error('Failed to parse screenshots:', e);
            }
          }
          
          // Parse recordings
          if (mediaRes.ok) {
            try {
              const json = await mediaRes.json();
              const urls = normalizeUrls(json);
              if (urls.length > 0) recordings = urls;
            } catch (e) {
              console.error('Failed to parse media:', e);
            }
          }
          
          // Fallback from task details
          if (detailsRes.ok) {
            try {
              const details = await detailsRes.json();
              
              // Screenshots from steps
              if (screenshots.length === 0 && Array.isArray(details?.steps)) {
                const stepShots = details.steps
                  .map((s: { screenshotUrl?: string }) => s?.screenshotUrl)
                  .filter((x: unknown): x is string => typeof x === 'string');
                if (stepShots.length > 0) screenshots = Array.from(new Set(stepShots));
              }
              
              // Recordings from outputFiles
              if (recordings.length === 0 && details?.outputFiles) {
                const outputRecs = normalizeUrls(details.outputFiles);
                if (outputRecs.length > 0) recordings = outputRecs;
              }
            } catch (e) {
              console.error('Failed to parse details for fallback:', e);
            }
          }
          
          // If we have recordings, stop retrying
          if (recordings.length > 0) {
            console.log(`Got recordings on attempt ${attempt}`);
            break;
          }
          
          // Wait before retry
          if (attempt < maxRetries) {
            console.log('No recordings yet, waiting before retry...');
            await delay(3000);
          }
        }
        
        console.log(`Final media: ${screenshots.length} screenshots, ${recordings.length} recordings`);
        
        // Update task in database
        const updateData: Record<string, unknown> = {
          status: 'completed',
          completed_at: new Date().toISOString(),
        };
        
        if (screenshots.length > 0) updateData.screenshots = screenshots;
        if (recordings.length > 0) updateData.recordings = recordings;
        
        await supabase
          .from('tasks')
          .update(updateData)
          .eq('browser_use_task_id', taskId)
          .eq('user_id', user.id);

        return new Response(JSON.stringify({ 
          success: true,
          screenshots,
          recordings,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'pause_task': {
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/pause`, {
          method: 'PUT',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
          },
        });

        if (!browserUseResponse.ok) {
          throw new Error(`Browser-Use API error: ${browserUseResponse.status}`);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'resume_task': {
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/resume`, {
          method: 'PUT',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
          },
        });

        if (!browserUseResponse.ok) {
          throw new Error(`Browser-Use API error: ${browserUseResponse.status}`);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_media': {
        // Get recordings/videos
        console.log(`Fetching media for task: ${taskId}`);
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/media`, {
          method: 'GET',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
          },
        });

        if (!browserUseResponse.ok) {
          const errorText = await browserUseResponse.text();
          console.error(`Media fetch error: ${browserUseResponse.status}, ${errorText}`);
          return new Response(JSON.stringify({ recordings: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const mediaData = await browserUseResponse.json();
        console.log(`Media fetched:`, JSON.stringify(mediaData));
        return new Response(JSON.stringify(mediaData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_screenshots': {
        // Get screenshots - separate endpoint
        console.log(`Fetching screenshots for task: ${taskId}`);
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/screenshots`, {
          method: 'GET',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
          },
        });

        if (!browserUseResponse.ok) {
          const errorText = await browserUseResponse.text();
          console.error(`Screenshots fetch error: ${browserUseResponse.status}, ${errorText}`);
          return new Response(JSON.stringify({ screenshots: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const screenshotData = await browserUseResponse.json();
        console.log(`Screenshots fetched:`, JSON.stringify(screenshotData));
        return new Response(JSON.stringify(screenshotData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_all_media': {
        // Get both screenshots and recordings
        console.log(`Fetching all media for task: ${taskId}`);

        const [screenshotsRes, mediaRes] = await Promise.all([
          fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/screenshots`, {
            method: 'GET',
            headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
          }),
          fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/media`, {
            method: 'GET',
            headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
          }),
        ]);

        let screenshots: string[] = [];
        let recordings: string[] = [];

        // Screenshots
        {
          const raw = await screenshotsRes.text();
          console.log(`Screenshots HTTP ${screenshotsRes.status}:`, raw);
          if (screenshotsRes.ok) {
            try {
              const json = JSON.parse(raw);
              screenshots = normalizeUrls(json);
            } catch (e) {
              console.error('Failed to parse screenshots JSON:', e);
            }
          }
        }

        // Recordings
        {
          const raw = await mediaRes.text();
          console.log(`Media HTTP ${mediaRes.status}:`, raw);
          if (mediaRes.ok) {
            try {
              const json = JSON.parse(raw);
              recordings = normalizeUrls(json);
            } catch (e) {
              console.error('Failed to parse media JSON:', e);
            }
          }
        }

        // Fallback: v2 already provides screenshotUrl per step in task details
        if (screenshots.length === 0) {
          try {
            const detailsRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
              method: 'GET',
              headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
            });
            const detailsRaw = await detailsRes.text();
            console.log(`Task details (fallback) HTTP ${detailsRes.status}:`, detailsRaw.substring(0, 500));
            if (detailsRes.ok) {
              const detailsJson = JSON.parse(detailsRaw);
              const stepShots = Array.isArray(detailsJson?.steps)
                ? detailsJson.steps
                    .map((s: { screenshotUrl?: string }) => (typeof s?.screenshotUrl === 'string' ? s.screenshotUrl : null))
                    .filter((x: unknown): x is string => !!x)
                : [];
              screenshots = Array.from(new Set(stepShots));
            }
          } catch (e) {
            console.error('Fallback screenshots from task details failed:', e);
          }
        }

        return new Response(JSON.stringify({ screenshots, recordings }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Error in browser-use function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const { action, taskId, prompt, title, projectId, keepBrowserOpen, followUpPrompt, taskType, fileName, fileBase64, contentType, includedFiles } = await req.json();
    console.log(`Action: ${action}, User: ${user.id}, TaskId: ${taskId || 'N/A'}, TaskType: ${taskType || 'test'}`);

    // Browser-Use Cloud API base URL - v2 API
    const BROWSER_USE_API_URL = 'https://api.browser-use.com/api/v2';

    switch (action) {
      case 'upload_file': {
        // Upload file using presigned URL
        console.log(`Uploading file: ${fileName}, type: ${contentType}`);
        
        // 1. Get presigned URL
        const presignedRes = await fetch(`${BROWSER_USE_API_URL}/files/presigned-url`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
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
          // Enable video recording and data saving
          save_browser_data: true,
          record_video: true,
        };
        
        // Add keep_browser_open if specified
        if (keepBrowserOpen) {
          requestBody.keep_browser_open = true;
        }

        // Add uploaded files if specified
        if (includedFiles && includedFiles.length > 0) {
          requestBody.included_file_names = includedFiles;
          console.log('Including files in task:', includedFiles);
        }
        
        console.log('Creating task with body:', JSON.stringify(requestBody));
        
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
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
        console.log('Browser-Use response:', browserUseData);

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
            live_url: browserUseData.live_url || null,
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
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
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
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
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
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
          },
        });

        if (!browserUseResponse.ok) {
          const errorText = await browserUseResponse.text();
          console.error('Browser-Use API error:', errorText);
          throw new Error(`Browser-Use API error: ${browserUseResponse.status}`);
        }

        const taskData = await browserUseResponse.json();
        return new Response(JSON.stringify(taskData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'stop_task': {
        // Stop a running task
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/stop`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
          },
        });

        if (!browserUseResponse.ok) {
          const errorText = await browserUseResponse.text();
          console.error('Browser-Use API error:', errorText);
          throw new Error(`Browser-Use API error: ${browserUseResponse.status}`);
        }

        // Update task in database
        await supabase
          .from('tasks')
          .update({ status: 'cancelled' })
          .eq('browser_use_task_id', taskId)
          .eq('user_id', user.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'pause_task': {
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/pause`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
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
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
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
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
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
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
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
            headers: { 'Authorization': `Bearer ${BROWSER_USE_API_KEY}` },
          }),
          fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/media`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${BROWSER_USE_API_KEY}` },
          }),
        ]);

        let screenshots: string[] = [];
        let recordings: string[] = [];

        if (screenshotsRes.ok) {
          const screenshotData = await screenshotsRes.json();
          console.log('Screenshots response:', JSON.stringify(screenshotData));
          if (Array.isArray(screenshotData.screenshots)) {
            screenshots = screenshotData.screenshots;
          } else if (Array.isArray(screenshotData)) {
            screenshots = screenshotData;
          }
        }

        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          console.log('Media response:', JSON.stringify(mediaData));
          if (Array.isArray(mediaData.recordings)) {
            recordings = mediaData.recordings;
          } else if (mediaData.recording_url) {
            recordings = [mediaData.recording_url];
          } else if (Array.isArray(mediaData)) {
            recordings = mediaData;
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

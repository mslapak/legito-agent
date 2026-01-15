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

    const { action, taskId, prompt, title, projectId, keepBrowserOpen, followUpPrompt, taskType, fileName, fileBase64, contentType, includedFiles, dbTaskId, maxSteps, profileId, profileName } = await req.json();
    console.log(`Action: ${action}, User: ${user.id}, TaskId: ${taskId || 'N/A'}, TaskType: ${taskType || 'test'}, MaxSteps: ${maxSteps || 20}, ProfileId: ${profileId || 'N/A'}`);

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
        
        // Add constructed preview URLs - try multiple formats
        candidates.push({ url: `https://live.browser-use.com/${taskId}`, source: 'constructed_live' });
        candidates.push({ url: `https://live.browser-use.com/?taskId=${taskId}`, source: 'constructed_live_query' });
        candidates.push({ url: `https://cloud.browser-use.com/live/${taskId}`, source: 'constructed_cloud_live' });
        
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
        // Fetch media from task details only (v2 API doesn't have separate media endpoints)
        console.log(`Syncing media for task: ${taskId}`);
        
        const detailsRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
          method: 'GET',
          headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
        });
        
        let screenshots: string[] = [];
        let recordings: string[] = [];
        let taskDetails: Record<string, unknown> | null = null;
        
        if (detailsRes.ok) {
          const raw = await detailsRes.text();
          console.log(`Task details HTTP ${detailsRes.status}:`, raw.substring(0, 500));
          try {
            taskDetails = JSON.parse(raw);
            
            // Extract screenshots from steps
            if (Array.isArray(taskDetails?.steps)) {
              const stepShots = (taskDetails.steps as Array<{ screenshotUrl?: string }>)
                .map(s => s?.screenshotUrl)
                .filter((x): x is string => typeof x === 'string');
              screenshots = Array.from(new Set(stepShots));
              console.log(`Screenshots from steps:`, screenshots.length);
            }
            
            // Check outputFiles for recordings - v2 API returns {id, fileName} objects
            if (taskDetails?.outputFiles && Array.isArray(taskDetails.outputFiles)) {
              console.log(`OutputFiles raw:`, JSON.stringify(taskDetails.outputFiles));
              
              // Filter for video files
              const videoFiles = (taskDetails.outputFiles as Array<{id?: string; fileName?: string}>)
                .filter(f => {
                  const fileName = f?.fileName || '';
                  return fileName.endsWith('.webm') || fileName.endsWith('.mp4');
                });
              
              console.log(`Video files found:`, videoFiles.length);
              
              // Fetch download URLs for each video file
              for (const file of videoFiles) {
                if (!file.id) continue;
                try {
                  console.log(`Fetching download URL for file: ${file.id} (${file.fileName})`);
                  const downloadRes = await fetch(`${BROWSER_USE_API_URL}/files/${file.id}/download`, {
                    method: 'GET',
                    headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
                  });
                  
                  if (downloadRes.ok) {
                    const downloadData = await downloadRes.json();
                    console.log(`Download response for ${file.id}:`, JSON.stringify(downloadData));
                    const url = downloadData.url || downloadData.downloadUrl || downloadData.download_url || downloadData.signedUrl;
                    if (url) {
                      recordings.push(url);
                      console.log(`Got download URL: ${url.substring(0, 100)}...`);
                    }
                  } else {
                    console.log(`Download endpoint failed for ${file.id}: ${downloadRes.status}`);
                  }
                } catch (e) {
                  console.error(`Error fetching download URL for ${file.id}:`, e);
                }
              }
              
              console.log(`Recordings resolved:`, recordings.length);
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

      case 'create_profile': {
        // Create a new Browser-Use profile for persistent login state
        console.log(`Creating browser profile: ${profileName || 'Default'}`);
        
        const profileResponse = await fetch(`${BROWSER_USE_API_URL}/profiles`, {
          method: 'POST',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: profileName || `Project Profile ${new Date().toISOString()}`,
          }),
        });

        if (!profileResponse.ok) {
          const errorText = await profileResponse.text();
          console.error('Browser-Use create profile error:', errorText);
          throw new Error(`Failed to create profile: ${profileResponse.status}`);
        }

        const profileData = await profileResponse.json();
        console.log('Created profile:', JSON.stringify(profileData));

        return new Response(JSON.stringify({ 
          success: true, 
          profileId: profileData.id,
          profileName: profileData.name,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'delete_profile': {
        // Delete a Browser-Use profile
        console.log(`Deleting browser profile: ${profileId}`);
        
        if (!profileId) {
          throw new Error('profileId is required for delete_profile action');
        }

        const deleteResponse = await fetch(`${BROWSER_USE_API_URL}/profiles/${profileId}`, {
          method: 'DELETE',
          headers: {
            'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
          },
        });

        // 404 is acceptable - profile may already be deleted
        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          const errorText = await deleteResponse.text();
          console.error('Browser-Use delete profile error:', errorText);
          throw new Error(`Failed to delete profile: ${deleteResponse.status}`);
        }

        console.log('Profile deleted successfully');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'create_task': {
        // Create task in Browser-Use Cloud
        // Step 1: Determine effective profileId (from request or lookup from project)
        let effectiveProfileId = profileId || null;
        
        if (!effectiveProfileId && projectId) {
          console.log('No profileId provided, looking up from project:', projectId);
          const { data: projectData } = await supabase
            .from('projects')
            .select('browser_profile_id')
            .eq('id', projectId)
            .single();
          
          if (projectData?.browser_profile_id) {
            effectiveProfileId = projectData.browser_profile_id;
            console.log('Found browser_profile_id from project:', effectiveProfileId);
          }
        }
        
        console.log('Effective profile ID:', effectiveProfileId || 'none');
        
        // Step 2: If we have a profile, create a session first with the profile
        let sessionId: string | null = null;
        
        if (effectiveProfileId) {
          console.log('Creating session with profile:', effectiveProfileId);
          try {
            const sessionPayload = { 
              profileId: effectiveProfileId,
              profile_id: effectiveProfileId, // Try both formats
            };
            console.log('Session create payload:', JSON.stringify(sessionPayload));
            
            const sessionRes = await fetch(`${BROWSER_USE_API_URL}/sessions`, {
              method: 'POST',
              headers: {
                'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(sessionPayload),
            });
            
            const sessionRaw = await sessionRes.text();
            console.log('Session create response:', sessionRes.status, sessionRaw);
            
            if (sessionRes.ok) {
              const sessionData = JSON.parse(sessionRaw);
              sessionId = sessionData.id || sessionData.sessionId || sessionData.session_id;
              console.log('Created session with profile, sessionId:', sessionId);
            } else {
              console.error('Failed to create session with profile:', sessionRes.status, sessionRaw);
            }
          } catch (e) {
            console.error('Error creating session with profile:', e);
          }
        }
        
        // Step 3: Create the task
        const requestBody: Record<string, unknown> = {
          task: prompt,
          save_browser_data: true,
          record_video: true,
          max_steps: maxSteps || 20,
        };
        
        // If we created a session with profile, use that sessionId
        if (sessionId) {
          requestBody.sessionId = sessionId;
          requestBody.session_id = sessionId; // Try both formats
          console.log('Creating task with session:', sessionId);
        } else if (effectiveProfileId) {
          // Fallback: try passing profileId directly to task (might work in some API versions)
          requestBody.profile_id = effectiveProfileId;
          requestBody.profileId = effectiveProfileId;
          console.log('Creating task with direct profile (fallback):', effectiveProfileId);
        }
        
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

        // V2 API: Try to get liveUrl from browser session endpoint
        let liveUrl = browserUseData.live_url || browserUseData.liveUrl || browserUseData.preview_url || browserUseData.previewUrl;
        
        const taskSessionId = browserUseData.sessionId || sessionId;
        if (!liveUrl && taskSessionId) {
          try {
            console.log('Fetching session for liveUrl:', taskSessionId);
            const sessionRes = await fetch(`${BROWSER_USE_API_URL}/sessions/${taskSessionId}`, {
              method: 'GET',
              headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
            });
            console.log('Session endpoint response status:', sessionRes.status);
            if (sessionRes.ok) {
              const sessionData = await sessionRes.json();
              console.log('Session data:', JSON.stringify(sessionData, null, 2));
              liveUrl = sessionData.liveUrl || sessionData.live_url || sessionData.previewUrl || sessionData.preview_url;
              console.log('Extracted liveUrl from session:', liveUrl);
            } else {
              console.log('Browser session fetch failed:', sessionRes.status);
            }
          } catch (e) {
            console.error('Failed to fetch browser session:', e);
          }
        }
        
        // Fallback to constructed URL if no liveUrl from API
        if (!liveUrl) {
          liveUrl = taskSessionId 
            ? `https://live.browser-use.com/?sessionId=${taskSessionId}` 
            : `https://live.browser-use.com/${browserUseData.id}`;
        }
        
        console.log('Final live_url:', liveUrl);

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
        
        // V2 API: Try to get liveUrl from browser session if not in task data
        if (!taskData.live_url && !taskData.liveUrl) {
          if (taskData.sessionId) {
            try {
              console.log('Fetching session for liveUrl in get_task_details:', taskData.sessionId);
              const sessionRes = await fetch(`${BROWSER_USE_API_URL}/sessions/${taskData.sessionId}`, {
                method: 'GET',
                headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
              });
              console.log('Session endpoint response status:', sessionRes.status);
              if (sessionRes.ok) {
                const sessionData = await sessionRes.json();
                console.log('Session data for liveUrl:', JSON.stringify(sessionData, null, 2));
                taskData.live_url = sessionData.liveUrl || sessionData.live_url;
                console.log('Extracted liveUrl:', taskData.live_url);
              }
            } catch (e) {
              console.error('Failed to fetch session for liveUrl:', e);
            }
          }
          // Fallback
          if (!taskData.live_url) {
            taskData.live_url = taskData.sessionId 
              ? `https://live.browser-use.com/?sessionId=${taskData.sessionId}` 
              : `https://live.browser-use.com/${taskData.id}`;
          }
        }
        
        // Add mapped status for convenience
        const hasOutput = !!(taskData.output || taskData.finished_at || taskData.finishedAt);
        taskData.mapped_status = mapStatus(taskData.status, hasOutput);
        
        return new Response(JSON.stringify(taskData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'stop_task': {
        // Stop a running task and sync media - robust implementation with fallbacks
        console.log(`Stopping task: ${taskId}`);
        
        let sessionId: string | null = null;
        let taskAlreadyStopped = false;
        
        // Step 1: Get task details to find sessionId and current status
        try {
          console.log('GET task details before stop...');
          const taskRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
            method: 'GET',
            headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
          });
          console.log(`Task details response: ${taskRes.status}`);
          
          if (taskRes.ok) {
            const taskData = await taskRes.json();
            sessionId = taskData.sessionId || taskData.session_id || null;
            console.log(`SessionId: ${sessionId}, Status: ${taskData.status}`);
            
            // Check if task is already stopped/finished
            if (['finished', 'stopped', 'failed'].includes(taskData.status)) {
              console.log('Task already stopped/finished');
              taskAlreadyStopped = true;
            }
          } else if (taskRes.status === 404) {
            console.log('Task not found - treating as already stopped');
            taskAlreadyStopped = true;
          }
        } catch (e) {
          console.error('Error getting task details:', e);
        }
        
        // Step 2: Try to stop the task (with fallback methods)
        if (!taskAlreadyStopped) {
          let stopSuccess = false;
          
          // Try PUT /tasks/{id}/stop
          try {
            console.log('Trying PUT /tasks/{id}/stop...');
            const stopRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/stop`, {
              method: 'PUT',
              headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
            });
            console.log(`PUT stop response: ${stopRes.status}`);
            if (stopRes.ok) {
              stopSuccess = true;
            } else {
              const errorText = await stopRes.text();
              console.log(`PUT stop failed: ${stopRes.status} - ${errorText.substring(0, 200)}`);
            }
          } catch (e) {
            console.error('PUT stop error:', e);
          }
          
          // Fallback: Try POST /tasks/{id}/stop
          if (!stopSuccess) {
            try {
              console.log('Fallback: Trying POST /tasks/{id}/stop...');
              const stopRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/stop`, {
                method: 'POST',
                headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
              });
              console.log(`POST stop response: ${stopRes.status}`);
              if (stopRes.ok) stopSuccess = true;
            } catch (e) {
              console.error('POST stop error:', e);
            }
          }
          
          // Fallback: Try PATCH /tasks/{id} with action
          if (!stopSuccess) {
            try {
              console.log('Fallback: Trying PATCH /tasks/{id} with action:stop...');
              const stopRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
                method: 'PATCH',
                headers: { 
                  'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: 'stop' }),
              });
              console.log(`PATCH stop response: ${stopRes.status}`);
              if (stopRes.ok) stopSuccess = true;
            } catch (e) {
              console.error('PATCH stop error:', e);
            }
          }
          
          console.log(`Task stop result: ${stopSuccess ? 'success' : 'failed (may already be stopped)'}`);
        }
        
        // Step 3: Try to stop the session if we have sessionId (ensures video is generated)
        if (sessionId) {
          try {
            console.log(`Stopping session: ${sessionId}...`);
            const sessionStopRes = await fetch(`${BROWSER_USE_API_URL}/sessions/${sessionId}`, {
              method: 'PATCH',
              headers: { 
                'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'stop' }),
            });
            console.log(`Session stop response: ${sessionStopRes.status}`);
            
            if (!sessionStopRes.ok) {
              // Try PUT as fallback
              const sessionStopPut = await fetch(`${BROWSER_USE_API_URL}/sessions/${sessionId}/stop`, {
                method: 'PUT',
                headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
              });
              console.log(`Session stop PUT response: ${sessionStopPut.status}`);
            }
          } catch (e) {
            console.error('Session stop error (non-fatal):', e);
          }
        }
        
        // Step 4: Wait for video processing (increased initial delay)
        console.log('Waiting for media processing (8s initial delay)...');
        await delay(8000);
        
        // Step 5: Retry loop to get media (videos may take time to process)
        let screenshots: string[] = [];
        let recordings: string[] = [];
        const maxRetries = 6;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`Media fetch attempt ${attempt}/${maxRetries}...`);
          
          try {
            const detailsRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
              method: 'GET',
              headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
            });
            
            if (detailsRes.ok) {
              const details = await detailsRes.json();
              console.log(`Attempt ${attempt} - Status: ${details.status}, OutputFiles: ${JSON.stringify(details.outputFiles || []).substring(0, 300)}`);
              
              // Screenshots from steps
              if (Array.isArray(details?.steps)) {
                const stepShots = details.steps
                  .map((s: { screenshotUrl?: string }) => s?.screenshotUrl)
                  .filter((x: unknown): x is string => typeof x === 'string');
                screenshots = Array.from(new Set(stepShots));
              }
              
              // Recordings from outputFiles - v2 API returns {id, fileName} objects
              if (details?.outputFiles && Array.isArray(details.outputFiles)) {
                console.log(`Attempt ${attempt} - OutputFiles raw:`, JSON.stringify(details.outputFiles));
                
                // Filter for video files
                const videoFiles = details.outputFiles.filter((f: {id?: string; fileName?: string}) => {
                  const fileName = f?.fileName || '';
                  return fileName.endsWith('.webm') || fileName.endsWith('.mp4');
                });
                
                console.log(`Video files found:`, videoFiles.length);
                
                // Fetch download URLs for each video file
                for (const file of videoFiles) {
                  if (!file.id) continue;
                  try {
                    console.log(`Fetching download URL for file: ${file.id} (${file.fileName})`);
                    const downloadRes = await fetch(`${BROWSER_USE_API_URL}/files/${file.id}/download`, {
                      method: 'GET',
                      headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
                    });
                    
                    if (downloadRes.ok) {
                      const downloadData = await downloadRes.json();
                      console.log(`Download response for ${file.id}:`, JSON.stringify(downloadData));
                      const url = downloadData.url || downloadData.downloadUrl || downloadData.download_url || downloadData.signedUrl;
                      if (url) {
                        recordings.push(url);
                        console.log(`Got download URL: ${url.substring(0, 100)}...`);
                      }
                    } else {
                      console.log(`Download endpoint failed for ${file.id}: ${downloadRes.status}`);
                    }
                  } catch (e) {
                    console.error(`Error fetching download URL for ${file.id}:`, e);
                  }
                }
              }
              
              // If we got recordings, we're done
              if (recordings.length > 0) {
                console.log(`Got ${recordings.length} recordings on attempt ${attempt}`);
                break;
              }
            } else if (detailsRes.status === 404) {
              console.log('Task not found during media fetch (session expired)');
              break;
            }
          } catch (e) {
            console.error(`Media fetch attempt ${attempt} error:`, e);
          }
          
          // Wait before next retry (except on last attempt) - increased delay
          if (attempt < maxRetries) {
            await delay(5000);
          }
        }
        
        console.log(`Final media: ${screenshots.length} screenshots, ${recordings.length} recordings`);
        
        // Step 6: Update task in database
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
        console.log(`Pausing task: ${taskId}`);
        let success = false;
        
        // Try PUT first
        try {
          const res = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/pause`, {
            method: 'PUT',
            headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
          });
          console.log(`PUT pause response: ${res.status}`);
          if (res.ok) success = true;
        } catch (e) {
          console.error('PUT pause error:', e);
        }
        
        // Fallback: POST
        if (!success) {
          try {
            const res = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/pause`, {
              method: 'POST',
              headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
            });
            console.log(`POST pause response: ${res.status}`);
            if (res.ok) success = true;
          } catch (e) {
            console.error('POST pause error:', e);
          }
        }
        
        // Even if pause didn't work, don't throw - just log
        if (!success) {
          console.log('Pause may not be supported, returning success anyway');
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'resume_task': {
        console.log(`Resuming task: ${taskId}`);
        let success = false;
        
        // Try PUT first
        try {
          const res = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/resume`, {
            method: 'PUT',
            headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
          });
          console.log(`PUT resume response: ${res.status}`);
          if (res.ok) success = true;
        } catch (e) {
          console.error('PUT resume error:', e);
        }
        
        // Fallback: POST
        if (!success) {
          try {
            const res = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/resume`, {
              method: 'POST',
              headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
            });
            console.log(`POST resume response: ${res.status}`);
            if (res.ok) success = true;
          } catch (e) {
            console.error('POST resume error:', e);
          }
        }
        
        if (!success) {
          console.log('Resume may not be supported, returning success anyway');
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_media':
      case 'get_screenshots':
      case 'get_all_media': {
        // V2 API: Get media from task details with retry for finished tasks
        console.log(`Fetching all media for task: ${taskId}`);
        
        let screenshots: string[] = [];
        let recordings: string[] = [];
        let taskStatus: string | null = null;
        const maxRetries = 6;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const detailsRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, {
              method: 'GET',
              headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
            });

            if (detailsRes.ok) {
              const details = await detailsRes.json();
              taskStatus = details.status;
              console.log(`Attempt ${attempt} - Status: ${taskStatus}, OutputFiles: ${JSON.stringify(details.outputFiles || []).substring(0, 300)}`);
              
              // Screenshots from steps
              if (Array.isArray(details?.steps)) {
                const stepShots = details.steps
                  .map((s: { screenshotUrl?: string }) => s?.screenshotUrl)
                  .filter((x: unknown): x is string => typeof x === 'string');
                screenshots = Array.from(new Set(stepShots));
              }
              
              // Recordings from outputFiles - v2 API returns {id, fileName} objects
              if (details?.outputFiles && Array.isArray(details.outputFiles)) {
                console.log(`Attempt ${attempt} - OutputFiles raw:`, JSON.stringify(details.outputFiles));
                
                // Filter for video files
                const videoFiles = details.outputFiles.filter((f: {id?: string; fileName?: string}) => {
                  const fileName = f?.fileName || '';
                  return fileName.endsWith('.webm') || fileName.endsWith('.mp4');
                });
                
                console.log(`Video files found:`, videoFiles.length);
                
                // Fetch download URLs for each video file
                for (const file of videoFiles) {
                  if (!file.id) continue;
                  try {
                    console.log(`Fetching download URL for file: ${file.id} (${file.fileName})`);
                    const downloadRes = await fetch(`${BROWSER_USE_API_URL}/files/${file.id}/download`, {
                      method: 'GET',
                      headers: { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY },
                    });
                    
                    if (downloadRes.ok) {
                      const downloadData = await downloadRes.json();
                      console.log(`Download response for ${file.id}:`, JSON.stringify(downloadData));
                      const url = downloadData.url || downloadData.downloadUrl || downloadData.download_url || downloadData.signedUrl;
                      if (url) {
                        recordings.push(url);
                        console.log(`Got download URL: ${url.substring(0, 100)}...`);
                      }
                    } else {
                      console.log(`Download endpoint failed for ${file.id}: ${downloadRes.status}`);
                    }
                  } catch (e) {
                    console.error(`Error fetching download URL for ${file.id}:`, e);
                  }
                }
              }
              
              // If we got recordings, we're done
              if (recordings.length > 0) {
                console.log(`Got ${recordings.length} recordings on attempt ${attempt}`);
                break;
              }
              
              // If task is not finished yet, don't retry
              if (!['finished', 'stopped'].includes(taskStatus || '')) {
                break;
              }
            } else if (detailsRes.status === 404) {
              console.log('Task not found - session may have expired');
              break;
            }
          } catch (e) {
            console.error(`Attempt ${attempt} error:`, e);
          }
          
          // Wait before retry for finished tasks (video may still be processing)
          if (attempt < maxRetries) {
            console.log('Waiting 5s for video processing...');
            await delay(5000);
          }
        }
        
        console.log(`Final media: ${screenshots.length} screenshots, ${recordings.length} recordings`);

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

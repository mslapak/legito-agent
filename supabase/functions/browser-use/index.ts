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

    const { action, taskId, prompt, title, projectId } = await req.json();
    console.log(`Action: ${action}, User: ${user.id}, TaskId: ${taskId || 'N/A'}`);

    // Browser-Use Cloud API base URL
    const BROWSER_USE_API_URL = 'https://api.browser-use.com/api/v1';

    switch (action) {
      case 'create_task': {
        // Create task in Browser-Use Cloud
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/run-task`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            task: prompt,
          }),
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

      case 'get_task_status': {
        // Get task status from Browser-Use Cloud
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/task/${taskId}/status`, {
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

        const statusData = await browserUseResponse.json();
        return new Response(JSON.stringify(statusData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_task_details': {
        // Get full task details from Browser-Use Cloud
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/task/${taskId}`, {
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
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/stop-task`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ task_id: taskId }),
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
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/pause-task`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ task_id: taskId }),
        });

        if (!browserUseResponse.ok) {
          throw new Error(`Browser-Use API error: ${browserUseResponse.status}`);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'resume_task': {
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/resume-task`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ task_id: taskId }),
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
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/task/${taskId}/media`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${BROWSER_USE_API_KEY}`,
          },
        });

        if (!browserUseResponse.ok) {
          const errorText = await browserUseResponse.text();
          console.error(`Media fetch error: ${browserUseResponse.status}, ${errorText}`);
          return new Response(JSON.stringify({ screenshots: [], recordings: [] }), {
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
        const browserUseResponse = await fetch(`${BROWSER_USE_API_URL}/task/${taskId}/screenshots`, {
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

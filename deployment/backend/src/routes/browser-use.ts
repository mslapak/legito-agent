import { Router, Request, Response } from 'express';
import { query } from '../db';

export const browserUseRouter = Router();

const BROWSER_USE_API_URL = 'https://api.browser-use.com/api/v2';

// Helper: resilient fetch with retries
async function resilientFetch(url: string, options: RequestInit, maxRetries = 3): Promise<globalThis.Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const msg = lastError.message.toLowerCase();
      const isTransient = ['http2', 'connection', 'reset', 'timeout', 'network', 'econnreset', 'socket']
        .some(k => msg.includes(k));
      if (isTransient && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, attempt * 1500));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError || new Error('resilientFetch failed');
}

// Helper: normalize URLs from API responses
function normalizeUrls(val: unknown): string[] {
  if (!val) return [];
  if (typeof val === 'string') return [val];
  if (Array.isArray(val)) {
    return val.map(x => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object') {
        return x.url ?? x.downloadUrl ?? x.download_url ?? x.signedUrl ?? x.src ?? null;
      }
      return null;
    }).filter((x): x is string => !!x);
  }
  return [];
}

// Helper: map Browser-Use status
function mapStatus(browserStatus: string, hasOutput: boolean): string {
  if (browserStatus === 'finished') return 'completed';
  if (browserStatus === 'failed') return 'failed';
  if (browserStatus === 'stopped') return hasOutput ? 'completed' : 'cancelled';
  if (['running', 'started', 'created'].includes(browserStatus)) return 'running';
  return 'pending';
}

browserUseRouter.post('/', async (req: Request, res: Response) => {
  try {
    const BROWSER_USE_API_KEY = process.env.BROWSER_USE_API_KEY;
    if (!BROWSER_USE_API_KEY) throw new Error('BROWSER_USE_API_KEY not configured');

    const userId = req.userId!;
    const body = req.body;
    const action = body.action;
    const taskId = body.taskId ?? body.task_id;
    const prompt = body.prompt;
    const title = body.title;
    const projectId = body.projectId ?? body.project_id;
    const keepBrowserOpen = body.keepBrowserOpen ?? body.keep_browser_open;
    const followUpPrompt = body.followUpPrompt ?? body.follow_up_prompt;
    const taskType = body.taskType ?? body.task_type;
    const dbTaskId = body.dbTaskId ?? body.db_task_id;
    const maxSteps = body.maxSteps ?? body.max_steps;
    const profileId = body.profileId ?? body.profile_id;
    const profileName = body.profileName ?? body.profile_name;
    const fileName = body.fileName ?? body.file_name;
    const fileBase64 = body.fileBase64 ?? body.file_base64;
    const contentType = body.contentType ?? body.content_type;
    const includedFiles = body.includedFiles ?? body.included_files;

    const headers = { 'X-Browser-Use-API-Key': BROWSER_USE_API_KEY, 'Content-Type': 'application/json' };

    switch (action) {
      // ---- DIAGNOSE ----
      case 'diagnose': {
        const testRes = await fetch(`${BROWSER_USE_API_URL}/tasks`, { method: 'GET', headers });
        const raw = await testRes.text();
        return res.json({ status: testRes.status, ok: testRes.ok, response: raw.substring(0, 500) });
      }

      // ---- CREATE TASK ----
      case 'create_task': {
        let effectiveProfileId = profileId || null;
        let effectiveMaxSteps = maxSteps || 10;
        let effectiveRecordVideo = true;

        if (projectId) {
          const { rows } = await query(
            'SELECT browser_profile_id, max_steps, record_video FROM projects WHERE id = $1 AND user_id = $2',
            [projectId, userId]
          );
          if (rows[0]) {
            if (!effectiveProfileId && rows[0].browser_profile_id) effectiveProfileId = rows[0].browser_profile_id;
            if (!maxSteps && rows[0].max_steps) effectiveMaxSteps = rows[0].max_steps;
            if (rows[0].record_video !== undefined) effectiveRecordVideo = rows[0].record_video;
          }
        }

        // Create session with profile if needed
        let sessionId: string | null = null;
        if (effectiveProfileId) {
          try {
            const sessionRes = await fetch(`${BROWSER_USE_API_URL}/sessions`, {
              method: 'POST', headers,
              body: JSON.stringify({ profileId: effectiveProfileId, profile_id: effectiveProfileId }),
            });
            if (sessionRes.ok) {
              const data = await sessionRes.json();
              sessionId = data.id || data.sessionId || data.session_id;
            }
          } catch (e) { console.error('Session creation error:', e); }
        }

        // Create the task
        const requestBody: Record<string, unknown> = {
          task: prompt,
          save_browser_data: true,
          record_video: effectiveRecordVideo,
          max_steps: effectiveMaxSteps,
        };
        if (sessionId) { requestBody.sessionId = sessionId; requestBody.session_id = sessionId; }
        else if (effectiveProfileId) { requestBody.profile_id = effectiveProfileId; requestBody.profileId = effectiveProfileId; }
        if (keepBrowserOpen) requestBody.keep_browser_open = true;
        if (includedFiles?.length > 0) requestBody.included_file_names = includedFiles;

        const browserRes = await fetch(`${BROWSER_USE_API_URL}/tasks`, { method: 'POST', headers, body: JSON.stringify(requestBody) });
        if (!browserRes.ok) throw new Error(`Browser-Use API error: ${browserRes.status}`);

        const browserData = await browserRes.json();
        let liveUrl = browserData.live_url || browserData.liveUrl || '';
        const taskSessionId = browserData.sessionId || sessionId;

        if (!liveUrl && taskSessionId) {
          try {
            const sRes = await fetch(`${BROWSER_USE_API_URL}/sessions/${taskSessionId}`, { method: 'GET', headers });
            if (sRes.ok) {
              const sData = await sRes.json();
              liveUrl = sData.liveUrl || sData.live_url || '';
            }
          } catch { /* ignore */ }
        }
        if (!liveUrl) {
          liveUrl = taskSessionId ? `https://live.browser-use.com/?sessionId=${taskSessionId}` : `https://live.browser-use.com/${browserData.id}`;
        }

        // Save to database
        const { rows } = await query(
          `INSERT INTO tasks (user_id, project_id, title, prompt, status, browser_use_task_id, live_url, started_at, task_type)
           VALUES ($1, $2, $3, $4, 'running', $5, $6, NOW(), $7) RETURNING *`,
          [userId, projectId || null, title || (prompt?.substring(0, 50) + '...'), prompt, browserData.id, liveUrl, taskType || 'test']
        );

        return res.json({ task: rows[0], browserUseTaskId: browserData.id });
      }

      // ---- GET TASK STATUS ----
      case 'get_task_status': {
        const statusRes = await resilientFetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/status`, { method: 'GET', headers });
        if (statusRes.status === 404) return res.json({ status: 'not_found', expired: true });
        if (!statusRes.ok) throw new Error(`Browser-Use API error: ${statusRes.status}`);
        return res.json(await statusRes.json());
      }

      // ---- GET TASK DETAILS ----
      case 'get_task_details': {
        const detailsRes = await resilientFetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, { method: 'GET', headers });
        if (detailsRes.status === 404) return res.json({ status: 'expired', expired: true });
        if (!detailsRes.ok) throw new Error(`Browser-Use API error: ${detailsRes.status}`);
        const taskData = await detailsRes.json();
        const hasOutput = !!(taskData.output || taskData.finished_at);
        taskData.mapped_status = mapStatus(taskData.status, hasOutput);
        return res.json(taskData);
      }

      // ---- STOP TASK ----
      case 'stop_task': {
        // Try multiple stop methods
        for (const method of ['PUT', 'POST'] as const) {
          try {
            const r = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/stop`, { method, headers });
            if (r.ok) break;
          } catch { /* continue */ }
        }

        // Update DB
        await query(
          `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE browser_use_task_id = $1 AND user_id = $2`,
          [taskId, userId]
        );

        return res.json({ success: true });
      }

      // ---- CONTINUE TASK ----
      case 'continue_task': {
        const r = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/continue`, {
          method: 'POST', headers,
          body: JSON.stringify({ task: followUpPrompt, keep_browser_open: true }),
        });
        if (!r.ok) throw new Error(`Browser-Use API error: ${r.status}`);
        return res.json({ success: true, data: await r.json() });
      }

      // ---- SYNC MEDIA ----
      case 'sync_media': {
        const detailsRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, { method: 'GET', headers });
        let screenshots: string[] = [];
        let recordings: string[] = [];

        if (detailsRes.ok) {
          const details = await detailsRes.json();
          if (Array.isArray(details?.steps)) {
            screenshots = details.steps.map((s: any) => s?.screenshotUrl).filter(Boolean);
          }
          if (Array.isArray(details?.outputFiles)) {
            const videoFiles = details.outputFiles.filter((f: any) =>
              (f?.fileName || '').match(/\.(webm|mp4)$/));
            for (const file of videoFiles) {
              if (!file.id) continue;
              try {
                const r = await fetch(`${BROWSER_USE_API_URL}/files/${file.id}/download`, { method: 'GET', headers });
                if (r.ok) {
                  const d = await r.json();
                  if (d.url) recordings.push(d.url);
                }
              } catch { /* ignore */ }
            }
          }
        }

        if (dbTaskId) {
          const updates: string[] = [];
          const params: unknown[] = [];
          let idx = 1;
          if (screenshots.length) { updates.push(`screenshots = $${idx++}`); params.push(screenshots); }
          if (recordings.length) { updates.push(`recordings = $${idx++}`); params.push(recordings); }
          if (updates.length) {
            params.push(dbTaskId, userId);
            await query(`UPDATE tasks SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`, params);
          }
        }

        return res.json({ screenshots, recordings });
      }

      // ---- CREATE/DELETE PROFILE ----
      case 'create_profile': {
        const r = await fetch(`${BROWSER_USE_API_URL}/profiles`, {
          method: 'POST', headers,
          body: JSON.stringify({ name: profileName || `Profile ${new Date().toISOString()}` }),
        });
        if (!r.ok) throw new Error(`Failed to create profile: ${r.status}`);
        const data = await r.json();
        return res.json({ success: true, profileId: data.id, profileName: data.name });
      }

      case 'delete_profile': {
        const r = await fetch(`${BROWSER_USE_API_URL}/profiles/${profileId}`, { method: 'DELETE', headers });
        if (!r.ok && r.status !== 404) throw new Error(`Failed to delete profile: ${r.status}`);
        return res.json({ success: true });
      }

      // ---- UPLOAD FILE ----
      case 'upload_file': {
        const presignedRes = await fetch(`${BROWSER_USE_API_URL}/files/presigned-url`, {
          method: 'POST', headers,
          body: JSON.stringify({ file_name: fileName, content_type: contentType }),
        });
        if (!presignedRes.ok) throw new Error(`Failed to get presigned URL: ${presignedRes.status}`);
        const { upload_url } = await presignedRes.json();

        const fileBuffer = Buffer.from(fileBase64, 'base64');
        const uploadRes = await fetch(upload_url, {
          method: 'PUT', body: fileBuffer,
          headers: { 'Content-Type': contentType },
        });
        if (!uploadRes.ok) throw new Error(`Failed to upload file: ${uploadRes.status}`);
        return res.json({ success: true, fileName });
      }

      // ---- PAUSE/RESUME ----
      case 'pause_task': {
        for (const m of ['PUT', 'POST'] as const) {
          try { const r = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/pause`, { method: m, headers }); if (r.ok) break; } catch { /* */ }
        }
        return res.json({ success: true });
      }
      case 'resume_task': {
        for (const m of ['PUT', 'POST'] as const) {
          try { const r = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}/resume`, { method: m, headers }); if (r.ok) break; } catch { /* */ }
        }
        return res.json({ success: true });
      }

      // ---- GET MEDIA ----
      case 'get_media':
      case 'get_screenshots':
      case 'get_all_media': {
        const detailsRes = await fetch(`${BROWSER_USE_API_URL}/tasks/${taskId}`, { method: 'GET', headers });
        let screenshots: string[] = [];
        let recordings: string[] = [];
        if (detailsRes.ok) {
          const details = await detailsRes.json();
          if (Array.isArray(details?.steps)) {
            screenshots = details.steps.map((s: any) => s?.screenshotUrl).filter(Boolean);
          }
          if (Array.isArray(details?.outputFiles)) {
            for (const file of details.outputFiles.filter((f: any) => (f?.fileName || '').match(/\.(webm|mp4)$/))) {
              if (!file.id) continue;
              try {
                const r = await fetch(`${BROWSER_USE_API_URL}/files/${file.id}/download`, { method: 'GET', headers });
                if (r.ok) { const d = await r.json(); if (d.url) recordings.push(d.url); }
              } catch { /* */ }
            }
          }
        }
        return res.json({ screenshots, recordings });
      }

      // ---- PROBE LIVE URL ----
      case 'probe_live_url': {
        const candidates = [
          { url: `https://live.browser-use.com/${taskId}`, source: 'constructed' },
        ];
        let bestUrl: string | null = null;
        for (const c of candidates) {
          try {
            const r = await fetch(c.url, { method: 'HEAD', redirect: 'follow' });
            if (r.ok) { bestUrl = c.url; break; }
          } catch { /* */ }
        }
        return res.json({ bestUrl, taskId });
      }

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error in browser-use:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

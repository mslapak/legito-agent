import { Router, Request, Response } from 'express';
import { query } from '../db';

interface CrudOptions {
  table: string;
  /** columns allowed on INSERT (excluding id, user_id, created_at, updated_at) */
  insertCols: string[];
  /** columns allowed on UPDATE */
  updateCols: string[];
  /** If true, rows are scoped to req.userId */
  userScoped?: boolean;
  /** Optional parent FK filter, e.g. { param: 'projectId', column: 'project_id' } */
  parentFilter?: { param: string; column: string };
}

export function createCrudRouter(opts: CrudOptions): Router {
  const router = Router();
  const { table, insertCols, updateCols, userScoped = true } = opts;

  // LIST
  router.get('/', async (req: Request, res: Response) => {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (userScoped) {
        conditions.push(`user_id = $${idx++}`);
        params.push(req.userId);
      }

      // Support query filters
      if (opts.parentFilter && req.query[opts.parentFilter.param]) {
        conditions.push(`${opts.parentFilter.column} = $${idx++}`);
        params.push(req.query[opts.parentFilter.param]);
      }

      // Generic column filters from query string
      for (const col of [...insertCols, 'status', 'priority']) {
        if (req.query[col] && col !== opts.parentFilter?.param) {
          conditions.push(`${col} = $${idx++}`);
          params.push(req.query[col]);
        }
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const orderBy = req.query.order_by ? String(req.query.order_by) : 'created_at';
      const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
      const limit = Math.min(parseInt(String(req.query.limit || '100')), 1000);
      const offset = parseInt(String(req.query.offset || '0'));

      const result = await query(
        `SELECT * FROM ${table} ${where} ORDER BY ${orderBy} ${order} LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      );
      res.json(result.rows);
    } catch (err) {
      console.error(`GET /${table} error:`, err);
      res.status(500).json({ error: 'Failed to fetch records' });
    }
  });

  // GET by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const conditions = ['id = $1'];
      const params: unknown[] = [req.params.id];
      if (userScoped) {
        conditions.push('user_id = $2');
        params.push(req.userId);
      }
      const result = await query(
        `SELECT * FROM ${table} WHERE ${conditions.join(' AND ')}`,
        params
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error(`GET /${table}/:id error:`, err);
      res.status(500).json({ error: 'Failed to fetch record' });
    }
  });

  // CREATE
  router.post('/', async (req: Request, res: Response) => {
    try {
      const cols: string[] = [];
      const vals: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      if (userScoped) {
        cols.push('user_id');
        vals.push(req.userId);
        placeholders.push(`$${idx++}`);
      }

      for (const col of insertCols) {
        if (req.body[col] !== undefined) {
          cols.push(col);
          vals.push(req.body[col]);
          placeholders.push(`$${idx++}`);
        }
      }

      const result = await query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        vals
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(`POST /${table} error:`, err);
      res.status(500).json({ error: 'Failed to create record' });
    }
  });

  // UPDATE
  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      for (const col of updateCols) {
        if (req.body[col] !== undefined) {
          sets.push(`${col} = $${idx++}`);
          params.push(req.body[col]);
        }
      }

      if (sets.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      const conditions = [`id = $${idx++}`];
      params.push(req.params.id);

      if (userScoped) {
        conditions.push(`user_id = $${idx++}`);
        params.push(req.userId);
      }

      const result = await query(
        `UPDATE ${table} SET ${sets.join(', ')}, updated_at = now() WHERE ${conditions.join(' AND ')} RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error(`PATCH /${table}/:id error:`, err);
      res.status(500).json({ error: 'Failed to update record' });
    }
  });

  // DELETE
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const conditions = [`id = $1`];
      const params: unknown[] = [req.params.id];

      if (userScoped) {
        conditions.push(`user_id = $2`);
        params.push(req.userId);
      }

      const result = await query(
        `DELETE FROM ${table} WHERE ${conditions.join(' AND ')} RETURNING id`,
        params
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
      console.error(`DELETE /${table}/:id error:`, err);
      res.status(500).json({ error: 'Failed to delete record' });
    }
  });

  return router;
}

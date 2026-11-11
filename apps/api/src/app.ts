import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import { pool } from './db'

export function createApp(): Express {
  const app = express()
  app.use(cors())
  app.use(express.json())

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' })
  })

  app.post('/api/auth/sync', async (req: Request, res: Response): Promise<void> => {
    const { id, email, name, avatarUrl, avatar_url } = req.body ?? {}

    if (!id || typeof id !== 'string' || !id.trim()) {
      res.status(400).json({ error: 'Missing required field: id' })
      return
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'Missing required field: email' })
      return
    }

    const resolvedAvatarUrl = avatarUrl ?? avatar_url ?? null
    const resolvedName = name ?? null

    try {
      const query = `
        INSERT INTO users (id, email, name, avatar_url, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          avatar_url = EXCLUDED.avatar_url,
          updated_at = NOW()
        RETURNING id, email, name, avatar_url AS "avatarUrl", created_at AS "createdAt", updated_at AS "updatedAt";
      `
      const values = [id.trim(), email.trim(), resolvedName, resolvedAvatarUrl]
      const result = await pool.query(query, values)

      res.status(200).json({
        success: true,
        user: result.rows[0]
      })
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Database sync error'
      })
    }
  })

  return app
}

export const app = createApp()

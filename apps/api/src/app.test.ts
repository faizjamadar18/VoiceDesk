import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from './app'
import { pool, initDb } from './db'

describe('API routes', () => {
  beforeAll(async () => {
    await initDb()
  })

  afterAll(async () => {
    // Clean up test user records
    try {
      await pool.query("DELETE FROM users WHERE id IN ('test-user-1', 'test-user-2')")
    } catch {
      // Table might not exist yet during initial red run
    }
    await pool.end()
  })

  describe('GET /health', () => {
    it('returns status ok', async () => {
      const response = await request(app).get('/health')
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ status: 'ok' })
    })
  })

  describe('POST /api/auth/sync', () => {
    it('returns 400 Bad Request if id is missing', async () => {
      const response = await request(app)
        .post('/api/auth/sync')
        .send({ email: 'test@example.com', name: 'No ID' })
      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error')
    })

    it('returns 400 Bad Request if email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/sync')
        .send({ id: 'test-user-no-email', name: 'No Email' })
      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error')
    })

    it('inserts a new user on POST /api/auth/sync returning 200 and { success: true, user }', async () => {
      const payload = {
        id: 'test-user-1',
        email: 'user1@example.com',
        name: 'Initial Name',
        avatarUrl: 'https://example.com/avatar1.png'
      }

      const response = await request(app)
        .post('/api/auth/sync')
        .send(payload)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.user).toMatchObject({
        id: 'test-user-1',
        email: 'user1@example.com',
        name: 'Initial Name'
      })
    })

    it('upserts existing user on POST /api/auth/sync updating name and avatar without error', async () => {
      const updatedPayload = {
        id: 'test-user-1',
        email: 'user1@example.com',
        name: 'Updated Name',
        avatarUrl: 'https://example.com/avatar1-updated.png'
      }

      const response = await request(app)
        .post('/api/auth/sync')
        .send(updatedPayload)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.user).toMatchObject({
        id: 'test-user-1',
        email: 'user1@example.com',
        name: 'Updated Name'
      })
    })
  })
})

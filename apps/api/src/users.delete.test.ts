import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const { deleteUserMock } = vi.hoisted(() => ({
  deleteUserMock: vi.fn<(id: string) => Promise<boolean>>()
}))

vi.mock('./db', () => ({
  pool: { query: vi.fn() },
  initDb: vi.fn(),
  deleteUser: deleteUserMock
}))

import { app } from './app'

describe('DELETE /api/users/:id', () => {
  beforeEach(() => {
    deleteUserMock.mockReset()
  })

  it('returns 204 with an empty body and deletes the row', async () => {
    deleteUserMock.mockResolvedValue(true)

    const response = await request(app).delete('/api/users/user-to-delete')

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(deleteUserMock).toHaveBeenCalledWith('user-to-delete')
  })

  it('returns 404 when no row matched', async () => {
    deleteUserMock.mockResolvedValue(false)

    const response = await request(app).delete('/api/users/unknown-user')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'User not found' })
  })

  it('returns 400 for a blank id and never touches the database', async () => {
    const response = await request(app).delete('/api/users/%20')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Invalid user id' })
    expect(deleteUserMock).not.toHaveBeenCalled()
  })

  it('returns 400 for an id containing control characters', async () => {
    const response = await request(app).delete('/api/users/bad%00id')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Invalid user id' })
    expect(deleteUserMock).not.toHaveBeenCalled()
  })

  it('returns 500 when the database delete fails', async () => {
    deleteUserMock.mockRejectedValue(new Error('connection terminated'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await request(app).delete('/api/users/user-to-delete')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed to delete user' })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

import dotenv from 'dotenv'
import { app } from './app'
import { initDb } from './db'

dotenv.config()

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001

async function start(): Promise<void> {
  try {
    await initDb()
    console.log('Database initialized successfully.')
    app.listen(PORT, () => {
      console.log(`Backend service listening on port ${PORT}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

if (process.env.NODE_ENV !== 'test') {
  void start()
}

const mongoose = require('mongoose')

async function connectDB(mongoUri) {
  if (!mongoUri) {
    throw new Error('MONGO_URI is not set')
  }

  try {
    console.log('[db] Connecting to MongoDB...')
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    })
    console.log(`[db] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`)
    return conn
  } catch (error) {
    console.error('[db] MongoDB connection error:', error?.message || error)
    throw error
  }
}

module.exports = { connectDB }

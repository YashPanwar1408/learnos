const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const mongoose = require('mongoose')
const path = require('node:path')

const { connectDB } = require('./config/db')
const authRoutes = require('./routes/auth.routes')
const documentRoutes = require('./routes/document.routes')
const chatRoutes = require('./routes/chat.routes')
const quizRoutes = require('./routes/quiz.routes')
const flashcardRoutes = require('./routes/flashcard.routes')
const analyticsRoutes = require('./routes/analytics.routes')
const progressRoutes = require('./routes/progress.routes')
const aiRoutes = require('./routes/ai.routes')
const courseRoutes = require('./routes/course.routes')
const activityRoutes = require('./routes/activity.routes')
const paymentRoutes = require('./routes/payment.routes')
const learnerRoutes = require('./routes/learner.routes')
const learningRoutes = require('./routes/learning.routes')
const learnerTwinRoutes = require('./routes/learnerTwin.routes')
const teacherRoutes = require('./routes/teacher.routes')

dotenv.config({ path: path.join(__dirname, '.env'), quiet: true })

const PORT = Number(process.env.PORT) || 5000
const MONGO_URI = process.env.MONGO_URI

const app = express()

app.disable('x-powered-by')

const configuredOrigins = String(process.env.CORS_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)
app.use(cors({
	origin(origin, callback) {
		if (!origin || configuredOrigins.includes(origin) || (configuredOrigins.length === 0 && process.env.NODE_ENV !== 'production')) return callback(null, true)
		return callback(new Error('Origin is not allowed by CORS'))
	},
}))
app.use(express.json({ limit: '2mb' }))

// If a request charged/refunded tokens, expose the updated balance in responses.
// This is safe because we only append fields to JSON *object* responses.
app.use((req, res, next) => {
	const originalJson = res.json.bind(res)
	res.json = (body) => {
		const tokensRemaining = res.locals?.tokensRemaining
		if (Number.isFinite(tokensRemaining) && body && typeof body === 'object' && !Array.isArray(body)) {
			const plan = res.locals?.plan
			const totalTokensUsed = res.locals?.totalTokensUsed
			const extra = { tokensRemaining: Number(tokensRemaining) }
			if (typeof plan === 'string' && plan) extra.plan = plan
			if (Number.isFinite(totalTokensUsed)) extra.totalTokensUsed = Number(totalTokensUsed)
			return originalJson({ ...body, ...extra })
		}
		return originalJson(body)
	}
	return next()
})

app.get('/api/health', (req, res) => {
	res.status(200).json({ status: 'ok', uptime: process.uptime() })
})

app.use('/api/auth', authRoutes)
app.use('/api/payment', paymentRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/quiz', quizRoutes)
app.use('/api/flashcards', flashcardRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/progress', progressRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/activity', activityRoutes)
app.use('/api/learner', learnerRoutes)
app.use('/api/learning', learningRoutes)
app.use('/api/learner-twin', learnerTwinRoutes)
app.use('/api/teacher', teacherRoutes)

app.use((err, req, res, next) => {
	if (!err) return next()
	if (err?.type === 'entity.parse.failed' || err?.statusCode === 400) {
		return res.status(400).json({ message: 'Invalid JSON' })
	}
	const message = err?.message || 'Server error'
	if (message === 'Only PDF files are allowed') {
		return res.status(400).json({ message })
	}
	if (err?.code === 'LIMIT_FILE_SIZE') {
		return res.status(413).json({ message: 'File too large' })
	}
	console.error('[server] Error:', err)
	return res.status(500).json({ message: 'Server error' })
})

app.use((req, res) => {
	res.status(404).json({ message: 'Not Found' })
})

async function start() {
	try {
		await connectDB(MONGO_URI)

		const server = app.listen(PORT, () => {
			console.log(`[server] Listening on port ${PORT}`)
		})

		const shutdown = async (signal) => {
			console.log(`[server] Received ${signal}. Shutting down...`)
			server.close(async () => {
				try {
					await mongoose.connection.close(false)
				} catch (error) {
					console.error('[server] Error closing Mongo connection:', error?.message || error)
				} finally {
					process.exit(0)
				}
			})
		}

		process.on('SIGINT', () => shutdown('SIGINT'))
		process.on('SIGTERM', () => shutdown('SIGTERM'))
	} catch (error) {
		console.error('[server] Failed to start:', error?.message || error)
		process.exit(1)
	}
}

process.on('unhandledRejection', (reason) => {
	console.error('[process] Unhandled Rejection:', reason)
	process.exit(1)
})

process.on('uncaughtException', (error) => {
	console.error('[process] Uncaught Exception:', error)
	process.exit(1)
})

start()

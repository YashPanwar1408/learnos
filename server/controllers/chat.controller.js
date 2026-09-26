const { generateGrokResponse } = require('../services/ai.service')
const Chat = require('../models/chat.model')
const Document = require('../models/document.model')
const { getDocumentTextForUser } = require('../services/documentText.service')
const { buildStratifiedSample, buildTopicContext } = require('../services/textSampling.service')
const { debitTokens, creditTokens } = require('../services/tokenLedger.service')
const { setTokenLocals } = require('../utils/tokenLocals')
const { TOKEN_COSTS } = require('../utils/tokenCosts')

function getProviderMessage(error) {
	const raw = typeof error?.message === 'string' ? error.message : ''
	if (!raw) return ''
	try {
		const parsed = JSON.parse(raw)
		const msg = parsed?.error?.message
		return typeof msg === 'string' ? msg : raw
	} catch {
		return raw
	}
}

function stripUpgradeLink(message) {
	if (!message) return message
	const idx = message.indexOf('Need more tokens?')
	return idx >= 0 ? message.slice(0, idx).trim() : message
}

function extractRetryAfterSeconds(message) {
	if (typeof message !== 'string' || !message) return undefined
	const m = message.match(/try again in\s+(\d+(?:\.\d+)?)s\b/i)
	if (!m) return undefined
	const n = Number(m[1])
	if (!Number.isFinite(n) || n <= 0) return undefined
	return Math.max(1, Math.ceil(n))
}

function toObjectIdOrNull(value) {
	if (!value) return null
	try {
		// eslint-disable-next-line no-undef
		const mongoose = require('mongoose')
		return mongoose.Types.ObjectId.isValid(value) ? value : null
	} catch {
		return null
	}
}

async function getChatHistory(req, res) {
	try {
		const { documentId } = req.params
		if (!documentId) return res.status(400).json({ message: 'documentId is required' })

		const chat = await Chat.findOne({ userId: req.user._id, documentId }).select('messages updatedAt').lean()
		return res.status(200).json({ messages: chat?.messages ?? [] })
	} catch (error) {
		console.error('[chat] History error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function chat(req, res) {
	let chargedTokens = 0
	try {
		const { message, documentId } = req.body || {}
		if (!message || typeof message !== 'string' || message.trim().length === 0) {
			return res.status(400).json({ message: 'message is required' })
		}
		if (!documentId || typeof documentId !== 'string' || !toObjectIdOrNull(documentId)) {
			return res.status(400).json({ message: 'documentId is required' })
		}

		const doc = await Document.findOne({ _id: documentId, userId: req.user._id }).select('_id title').lean()
		if (!doc) {
			return res.status(404).json({ message: 'Document not found' })
		}

		const charged = await debitTokens({ userId: req.user._id, cost: TOKEN_COSTS.chat, action: 'chat' })
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const trimmedMessage = message.trim()
		await Chat.updateOne(
			{ userId: req.user._id, documentId },
			{ $push: { messages: { role: 'user', content: trimmedMessage, createdAt: new Date() } } },
			{ upsert: true }
		)

		const fullText = await getDocumentTextForUser({ userId: req.user._id, documentId, maxChars: 300000 })
		// Prefer keyword-focused excerpts for better relevance, fallback to stratified sample.
		const documentText = buildTopicContext(fullText, trimmedMessage, { budgetChars: 14000 })

		const response = await generateGrokResponse({
			message: trimmedMessage,
			documentText,
			maxTokens: 1600,
		})

		const assistantText = typeof response === 'string' && response.trim() ? response.trim() : 'No response returned.'
		await Chat.updateOne(
			{ userId: req.user._id, documentId },
			{ $push: { messages: { role: 'assistant', content: assistantText, createdAt: new Date() } } },
			{ upsert: true }
		)

		return res.status(200).json({ response: assistantText })
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (chat):', e)
			}
		}

		const status = Number(error?.status)
		if (status === 402 && error?.data) {
			return res.status(402).json(error.data)
		}

		const msg = error?.message || ''
		if (typeof error?.status === 'number' && error.status === 404) {
			return res.status(404).json({ message: msg || 'Not found' })
		}
		if (typeof msg === 'string' && msg.includes('GROQ_API_KEY')) {
			return res.status(500).json({ message: 'Server misconfigured: GROQ_API_KEY is missing' })
		}
		if (typeof msg === 'string' && msg.includes('fetch is not available')) {
			return res.status(500).json({ message: 'Server misconfigured' })
		}

		if (typeof error?.status === 'number') {
			if (error.status === 429) {
				const providerMsg = stripUpgradeLink(getProviderMessage(error))
				const retryAfterSeconds = extractRetryAfterSeconds(providerMsg)
				return res.status(429).json({
					message: providerMsg || 'Rate limit exceeded. Try again later.',
					...(retryAfterSeconds ? { retryAfterSeconds } : {}),
				})
			}
			if (error.status === 401 || error.status === 403) {
				return res.status(502).json({ message: 'Groq authentication failed. Verify GROQ_API_KEY.' })
			}
			if (error.status >= 400 && error.status < 500) {
				if (typeof msg === 'string' && msg.toLowerCase().includes('api key')) {
					return res.status(502).json({ message: 'Gemini rejected the request. Verify GEMINI_API_KEY.' })
				}
				const details = typeof msg === 'string' ? msg.slice(0, 600) : ''
				return res.status(502).json({ message: 'Groq rejected the request.', details })
			}
		}
		console.error('[chat] Error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = { chat, getChatHistory }

const Flashcard = require('../models/flashcard.model')
const { generateGrokResponse } = require('../services/ai.service')
const { scheduleNextReview } = require('../services/spacedRepetition')
const Document = require('../models/document.model')
const { getDocumentTextForUser } = require('../services/documentText.service')
const { buildStratifiedSample } = require('../services/textSampling.service')
const { logActivity } = require('../utils/activity')
const { debitTokens, creditTokens } = require('../services/tokenLedger.service')
const { setTokenLocals } = require('../utils/tokenLocals')
const { costForFlashcards } = require('../utils/tokenCosts')

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

function clampInt(value, { min, max, fallback }) {
	const n = Number(value)
	if (!Number.isFinite(n)) return fallback
	const int = Math.trunc(n)
	if (int < min) return min
	if (int > max) return max
	return int
}

function clamp(value, { min, max, fallback }) {
	const n = Number(value)
	if (!Number.isFinite(n)) return fallback
	return Math.min(max, Math.max(min, n))
}

function computeDifficulty(card) {
	const lastRating = card?.lastRating
	const ef = Number(card?.easeFactor)
	const reps = Number(card?.repetitions)
	if (lastRating === 'hard' || (Number.isFinite(ef) && ef <= 1.8) || (!Number.isNaN(reps) && reps <= 1)) return 'Hard'
	if (lastRating === 'medium' || (Number.isFinite(ef) && ef <= 2.25)) return 'Medium'
	return 'Easy'
}

function computePriority({ difficulty, nextReviewAt, lastReviewedAt, repetitions, easeFactor }) {
	const now = Date.now()
	const nextMs = nextReviewAt ? new Date(nextReviewAt).getTime() : now
	const lastMs = lastReviewedAt ? new Date(lastReviewedAt).getTime() : null
	const overdueHours = Math.max(0, Math.ceil((now - nextMs) / (1000 * 60 * 60)))

	let priority = difficulty === 'Hard' ? 8 : difficulty === 'Medium' ? 6 : 3

	// More overdue => higher priority.
	if (overdueHours > 0) {
		priority += overdueHours >= 48 ? 2 : 1
	}

	// Newly learned or low repetitions => increase priority.
	const reps = Number(repetitions)
	if (!Number.isFinite(reps) || reps <= 0) priority += 1
	else if (reps === 1) priority += 0.5

	// Lower ease factor => slightly higher priority.
	const ef = Number(easeFactor)
	if (Number.isFinite(ef) && ef < 2.0) priority += 0.5

	// Not reviewed yet => higher.
	if (!lastMs) priority += 0.5

	return Math.round(clamp(priority, { min: 1, max: 10, fallback: 5 }))
}

function computeNextReviewInHours(nextReviewAt) {
	const now = Date.now()
	const nextMs = nextReviewAt ? new Date(nextReviewAt).getTime() : now
	if (!Number.isFinite(nextMs)) return 0
	return Math.max(0, Math.ceil((nextMs - now) / (1000 * 60 * 60)))
}

function extractJson(text) {
	if (typeof text !== 'string') return null
	const trimmed = text.trim()
	if (!trimmed) return null

	const fenceStripped = trimmed
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim()

	try {
		return JSON.parse(fenceStripped)
	} catch {
		// continue
	}

	const firstObj = fenceStripped.indexOf('{')
	const firstArr = fenceStripped.indexOf('[')
	let start = -1
	if (firstObj === -1) start = firstArr
	else if (firstArr === -1) start = firstObj
	else start = Math.min(firstObj, firstArr)
	if (start === -1) return null

	const candidate = fenceStripped.slice(start)
	try {
		return JSON.parse(candidate)
	} catch {
		return null
	}
}

function normalizeCard(raw) {
	const question = typeof raw?.question === 'string' ? raw.question.trim() : ''
	const answer = typeof raw?.answer === 'string' ? raw.answer.trim() : ''
	return { question, answer }
}

function validateCardsPayload(payload, { numCards }) {
	const rawCards = Array.isArray(payload?.cards)
		? payload.cards
		: Array.isArray(payload)
			? payload
			: []

	const cards = rawCards
		.map(normalizeCard)
		.filter((c) => c.question && c.answer)
		.slice(0, numCards)

	if (!cards.length) return { ok: false, message: 'AI returned no flashcards' }

	for (const c of cards) {
		if (c.question.length < 3) return { ok: false, message: 'Invalid flashcard question returned by AI' }
		if (c.answer.length < 1) return { ok: false, message: 'Invalid flashcard answer returned by AI' }
	}

	return { ok: true, cards }
}

async function generateWithAi({ documentText, numCards, titleHint }) {
	const clippedText = String(documentText).slice(0, 12000)
	const maxTokens = Math.min(3200, Math.max(1400, 300 + Number(numCards || 12) * 60))
	const message = [
		'You are a flashcard generator.',
		`Generate ${numCards} flashcards from the provided document context.`,
		'Each flashcard must have a short question (front) and a clear answer (back).',
		'Rules:',
		'- Output MUST be valid JSON only. No markdown. No backticks.',
		'- Keep questions concise and specific.',
		'- Keep answers accurate and not overly long (1-4 sentences).',
		'',
		'Output shape (either is OK):',
		'{ "cards": [ { "question": "...", "answer": "..." } ] }',
		'or',
		'[ { "question": "...", "answer": "..." } ]',
		'',
		`TITLE_HINT: ${titleHint || ''}`,
	].join('\n')

	return generateGrokResponse({
		message,
		documentText: clippedText,
		maxTokens,
	})
}

async function generateFlashcards(req, res) {
	let chargedTokens = 0
	try {
		const { numCards, title, documentId } = req.body || {}
		let documentText = ''
		let sourceDocumentId = documentId || null
		let sourceDocumentTitle = typeof title === 'string' ? title.trim().slice(0, 120) : ''

		if (!sourceDocumentId || typeof sourceDocumentId !== 'string') {
			return res.status(400).json({ message: 'documentId is required' })
		}
		const doc = await Document.findOne({ _id: sourceDocumentId, userId: req.user._id }).select('_id title').lean()
		if (!doc) return res.status(404).json({ message: 'Document not found' })
		sourceDocumentTitle = sourceDocumentTitle || doc.title
		const fullText = await getDocumentTextForUser({ userId: req.user._id, documentId: sourceDocumentId, maxChars: 300000 })
		documentText = buildStratifiedSample(fullText, { budgetChars: 12000, segments: 6 })

		if (documentText.trim().length < 50) {
			return res.status(400).json({ message: 'Document text is too short to generate flashcards' })
		}

		const n = clampInt(numCards, { min: 1, max: 50, fallback: 12 })
		const titleHint = sourceDocumentTitle

		const charged = await debitTokens({
			userId: req.user._id,
			cost: costForFlashcards(n),
			action: 'generate_flashcards',
		})
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const modelText = await generateWithAi({
			documentText,
			numCards: n,
			titleHint,
		})

		const parsed = extractJson(modelText)
		if (!parsed) {
			if (chargedTokens > 0) {
				try {
					const refunded = await creditTokens({ userId: req.user._id, cost: chargedTokens })
					if (refunded) {
						req.user = refunded
						setTokenLocals(res, refunded)
					}
				} catch (e) {
					console.warn('[tokens] Refund failed (generate_flashcards invalid JSON):', e)
				}
			}
			return res.status(502).json({ message: 'AI returned an invalid format. Try again.' })
		}

		const validated = validateCardsPayload(parsed, { numCards: n })
		if (!validated.ok) {
			if (chargedTokens > 0) {
				try {
					const refunded = await creditTokens({ userId: req.user._id, cost: chargedTokens })
					if (refunded) {
						req.user = refunded
						setTokenLocals(res, refunded)
					}
				} catch (e) {
					console.warn('[tokens] Refund failed (generate_flashcards invalid payload):', e)
				}
			}
			return res.status(502).json({ message: validated.message || 'AI returned an invalid flashcard set.' })
		}

		const now = new Date()
		const docs = validated.cards.map((c) => ({
			userId: req.user._id,
			source: {
				documentId: sourceDocumentId || null,
				documentTitle: titleHint || null,
			},
			question: c.question,
			answer: c.answer,
			lastRating: null,
			repetitions: 0,
			intervalDays: 0,
			easeFactor: 2.5,
			lastReviewedAt: null,
			nextReviewAt: now,
		}))

		const created = await Flashcard.insertMany(docs)
		return res.status(201).json({ flashcards: created })
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (generate_flashcards):', e)
			}
		}

		const insufficientStatus = Number(error?.status)
		if (insufficientStatus === 402 && error?.data) {
			return res.status(402).json(error.data)
		}

		const msg = String(error?.message || '')
		if (msg.includes('GROQ_API_KEY')) {
			return res.status(500).json({ message: 'Server misconfigured: GROQ_API_KEY is missing' })
		}
		const status = Number(error?.status)
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			const providerMsg = stripUpgradeLink(getProviderMessage(error))
			const retryAfterSeconds = status === 429 ? extractRetryAfterSeconds(providerMsg) : undefined
			return res.status(status).json({
				message: providerMsg || 'Request failed',
				...(retryAfterSeconds ? { retryAfterSeconds } : {}),
			})
		}
		console.error('[flashcards] Generate error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function listFlashcardsByDocument(req, res) {
	try {
		const { documentId } = req.params
		if (!documentId) {
			return res.status(400).json({ message: 'documentId is required' })
		}
		const flashcards = await Flashcard.find({ userId: req.user._id, 'source.documentId': documentId })
			.sort({ nextReviewAt: 1, createdAt: -1 })
			.lean()
		return res.status(200).json({ flashcards })
	} catch (error) {
		console.error('[flashcards] ListByDocument error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function listFlashcards(req, res) {
	try {
		const flashcards = await Flashcard.find({ userId: req.user._id })
			.sort({ nextReviewAt: 1, createdAt: -1 })
			.lean()
		return res.status(200).json({ flashcards })
	} catch (error) {
		console.error('[flashcards] List error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function reviewFlashcard(req, res) {
	try {
		const { flashcardId, rating } = req.body || {}
		if (!flashcardId || typeof flashcardId !== 'string') {
			return res.status(400).json({ message: 'flashcardId is required' })
		}
		if (rating !== 'easy' && rating !== 'medium' && rating !== 'hard') {
			return res.status(400).json({ message: 'rating must be one of: easy, medium, hard' })
		}

		const card = await Flashcard.findOne({ _id: flashcardId, userId: req.user._id })
		if (!card) return res.status(404).json({ message: 'Flashcard not found' })

		const now = new Date()
		const next = scheduleNextReview({
			repetitions: card.repetitions,
			intervalDays: card.intervalDays,
			easeFactor: card.easeFactor,
			rating,
			now,
		})

		card.lastRating = rating
		card.repetitions = next.repetitions
		card.intervalDays = next.intervalDays
		card.easeFactor = next.easeFactor
		card.lastReviewedAt = now
		card.nextReviewAt = next.nextReviewAt
		await card.save()

		await logActivity(req.user._id, {
			type: 'flashcard_reviewed',
			label: `Reviewed flashcard (${rating})`,
			meta: { flashcardId: String(card._id), rating },
		})

		return res.status(200).json({ flashcard: card })
	} catch (error) {
		console.error('[flashcards] Review error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function getSchedule(req, res) {
	try {
		const { documentId } = req.query || {}
		const filter = { userId: req.user._id }
		if (typeof documentId === 'string' && documentId.trim()) {
			filter['source.documentId'] = documentId.trim()
		}

		const cards = await Flashcard.find(filter)
			.select('question lastRating repetitions intervalDays easeFactor lastReviewedAt nextReviewAt')
			.sort({ nextReviewAt: 1, createdAt: -1 })
			.lean()

		const scheduled = (cards || [])
			.map((c) => {
				const difficulty = computeDifficulty(c)
				const next_review_in_hours = computeNextReviewInHours(c?.nextReviewAt)
				const priority = computePriority({
					difficulty,
					nextReviewAt: c?.nextReviewAt,
					lastReviewedAt: c?.lastReviewedAt,
					repetitions: c?.repetitions,
					easeFactor: c?.easeFactor,
				})

				return {
					question: String(c?.question || ''),
					priority,
					next_review_in_hours,
					difficulty,
				}
			})
			.filter((x) => x.question.trim().length > 0)
			.sort((a, b) => {
				if (b.priority !== a.priority) return b.priority - a.priority
				return a.next_review_in_hours - b.next_review_in_hours
			})
			.slice(0, 200)

		return res.status(200).json({ cards: scheduled })
	} catch (error) {
		console.error('[flashcards] Schedule error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = {
	generateFlashcards,
	listFlashcards,
	listFlashcardsByDocument,
	reviewFlashcard,
	getSchedule,
}

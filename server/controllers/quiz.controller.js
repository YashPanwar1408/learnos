const Quiz = require('../models/quiz.model')
const QuizAttempt = require('../models/quizAttempt.model')
const { generateGrokResponse } = require('../services/ai.service')
const Document = require('../models/document.model')
const { getDocumentTextForUser } = require('../services/documentText.service')
const { buildStratifiedSample } = require('../services/textSampling.service')
const { logActivity } = require('../utils/activity')
const { debitTokens, creditTokens } = require('../services/tokenLedger.service')
const { setTokenLocals } = require('../utils/tokenLocals')
const { costForQuiz } = require('../utils/tokenCosts')
const {
	chooseDifficultyForTopic,
	updateTopicProgressFromAttempt,
} = require('../services/adaptiveLearning.service')

function clampInt(value, { min, max, fallback }) {
	const n = Number(value)
	if (!Number.isFinite(n)) return fallback
	const int = Math.trunc(n)
	if (int < min) return min
	if (int > max) return max
	return int
}

function extractJson(text) {
	if (typeof text !== 'string') return null
	const trimmed = text.trim()
	if (!trimmed) return null

	// Remove common code fences.
	const fenceStripped = trimmed
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim()

	// Try direct parse.
	try {
		return JSON.parse(fenceStripped)
	} catch {
		// continue
	}

	// Try to find the first JSON object/array.
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

function normalizeQuestion(raw) {
	const question = typeof raw?.question === 'string' ? raw.question.trim() : ''
	const difficultyRaw = typeof raw?.difficulty === 'string' ? raw.difficulty.trim().toLowerCase() : ''
	const difficulty = ['easy', 'medium', 'hard'].includes(difficultyRaw) ? difficultyRaw : undefined
	const options = Array.isArray(raw?.options) ? raw.options.map((o) => String(o ?? '').trim()).filter(Boolean) : []
	const explanation = typeof raw?.explanation === 'string' ? raw.explanation.trim() : ''

	let correctOptionIndex = raw?.correctOptionIndex
	if (typeof correctOptionIndex === 'string' && correctOptionIndex.trim()) {
		correctOptionIndex = Number(correctOptionIndex)
	}

	let correctAnswer = typeof raw?.correctAnswer === 'string' ? raw.correctAnswer.trim() : ''

	if (options.length === 4) {
		if (!Number.isInteger(correctOptionIndex)) {
			// If model returned correctAnswer string, map to index.
			if (correctAnswer) {
				const idx = options.findIndex((opt) => opt.toLowerCase() === correctAnswer.toLowerCase())
				if (idx >= 0) correctOptionIndex = idx
			}
		}

		if (Number.isInteger(correctOptionIndex) && correctOptionIndex >= 0 && correctOptionIndex <= 3) {
			if (!correctAnswer) correctAnswer = options[correctOptionIndex]
		}
	}

	return {
		question,
		difficulty,
		options,
		correctOptionIndex,
		correctAnswer,
		explanation,
	}
}

function validateQuizPayload(payload, { numQuestions, defaultDifficulty }) {
	const title = typeof payload?.title === 'string' ? payload.title.trim() : ''
	const questionsRaw = Array.isArray(payload?.questions) ? payload.questions : []
	const questions = questionsRaw
		.map(normalizeQuestion)
		.filter((q) => q.question && q.explanation)

	if (!questions.length) {
		return { ok: false, message: 'AI returned no questions' }
	}

	const normalized = []
	for (const q of questions.slice(0, numQuestions)) {
		if (typeof q.question !== 'string' || q.question.length < 5) {
			return { ok: false, message: 'Invalid question returned by AI' }
		}
		if (!Array.isArray(q.options) || q.options.length !== 4) {
			return { ok: false, message: 'Each question must have 4 options' }
		}
		if (!Number.isInteger(q.correctOptionIndex) || q.correctOptionIndex < 0 || q.correctOptionIndex > 3) {
			return { ok: false, message: 'Each question must include a correct answer' }
		}
		if (typeof q.explanation !== 'string' || q.explanation.length < 5) {
			return { ok: false, message: 'Each question must include an explanation' }
		}

		normalized.push({
			question: q.question,
			difficulty: q.difficulty || defaultDifficulty,
			options: q.options.map((o) => o.trim()),
			correctOptionIndex: q.correctOptionIndex,
			correctAnswer: q.correctAnswer || q.options[q.correctOptionIndex],
			explanation: q.explanation,
		})
	}

	return {
		ok: true,
		title: title || 'Generated Quiz',
		questions: normalized,
	}
}

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

async function generateWithAi({ documentText, numQuestions, titleHint, targetDifficulty }) {
	const clippedText = String(documentText).slice(0, 12000)
	const maxTokens = Math.min(2800, Math.max(900, 300 + Number(numQuestions || 5) * 120))
	const message = [
		'You are an exam question generator.',
		`Generate ${numQuestions} multiple-choice questions (MCQs) from the provided document context.`,
		`DIFFICULTY: ${targetDifficulty} (match this difficulty for every question).`,
		'Rules:',
		'- Output MUST be valid JSON only. No markdown. No backticks.',
		'- Each question must have: question, difficulty (easy|medium|hard), options (array of 4 strings), correctOptionIndex (0-3), explanation.',
		'- Options must be plausible and only one option should be correct.',
		'- Explanations must be short but clear (1-3 sentences).',
		'',
		'JSON shape:',
		'{',
		'  "title": "...",',
		'  "questions": [',
		'    { "question": "...", "difficulty": "easy", "options": ["A","B","C","D"], "correctOptionIndex": 0, "explanation": "..." }',
		'  ]',
		'}',
		'',
		`TITLE_HINT: ${titleHint || ''}`,
	].join('\n')

	return generateGrokResponse({
		message,
		documentText: clippedText,
		maxTokens: Math.max(1400, maxTokens),
	})
}

async function generateQuiz(req, res) {
	let chargedTokens = 0
	try {
		const { numQuestions, title, documentId } = req.body || {}
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
			return res.status(400).json({ message: 'Document text is too short to generate a quiz' })
		}

		const n = clampInt(numQuestions, { min: 1, max: 20, fallback: 5 })
		const titleHint = sourceDocumentTitle
		const topic = titleHint || 'General'

		const charged = await debitTokens({
			userId: req.user._id,
			cost: costForQuiz(n),
			action: 'generate_quiz',
		})
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const personalization = await chooseDifficultyForTopic({
			userId: req.user._id,
			topic,
		})

		const modelText = await generateWithAi({
			documentText,
			numQuestions: n,
			titleHint,
			targetDifficulty: personalization.targetDifficulty,
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
					console.warn('[tokens] Refund failed (generate_quiz invalid JSON):', e)
				}
			}
			return res.status(502).json({ message: 'AI returned an invalid format. Try again.' })
		}

		const validated = validateQuizPayload(parsed, {
			numQuestions: n,
			defaultDifficulty: personalization.targetDifficulty,
		})
		if (!validated.ok) {
			if (chargedTokens > 0) {
				try {
					const refunded = await creditTokens({ userId: req.user._id, cost: chargedTokens })
					if (refunded) {
						req.user = refunded
						setTokenLocals(res, refunded)
					}
				} catch (e) {
					console.warn('[tokens] Refund failed (generate_quiz invalid payload):', e)
				}
			}
			return res.status(502).json({ message: validated.message || 'AI returned an invalid quiz.' })
		}

		const quiz = await Quiz.create({
			userId: req.user._id,
			topic,
			title: validated.title,
			targetDifficulty: personalization.targetDifficulty,
			source: {
				documentId: sourceDocumentId || undefined,
				documentTitle: titleHint || null,
			},
			questions: validated.questions,
		})

		return res.status(201).json({
			quiz,
			personalization: {
				topic: personalization.topic,
				strength: personalization.strength,
				targetDifficulty: personalization.targetDifficulty,
			},
		})
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (generate_quiz):', e)
			}
		}

		const status = Number(error?.status)
		if (status === 402 && error?.data) {
			return res.status(402).json(error.data)
		}

		const msg = String(error?.message || '')
		if (msg.includes('GROQ_API_KEY')) {
			return res.status(500).json({ message: 'Server misconfigured: GROQ_API_KEY is missing' })
		}
		
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			const providerMsg = stripUpgradeLink(getProviderMessage(error))
			const retryAfterSeconds = status === 429 ? extractRetryAfterSeconds(providerMsg) : undefined
			return res.status(status).json({
				message: providerMsg || 'Request failed',
				...(retryAfterSeconds ? { retryAfterSeconds } : {}),
			})
		}
		console.error('[quiz] Generate error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function listQuizzesByDocument(req, res) {
	try {
		const { documentId } = req.params
		if (!documentId) return res.status(400).json({ message: 'documentId is required' })
		const quizzes = await Quiz.find({ userId: req.user._id, 'source.documentId': documentId })
			.sort({ createdAt: -1 })
			.select('title topic targetDifficulty createdAt updatedAt')
			.lean()
		return res.status(200).json({ quizzes })
	} catch (error) {
		console.error('[quiz] ListByDocument error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

function coerceAnswersPayload(answers) {
	// Accept either: { "<questionId>": 2, ... } OR [{ questionId, selectedOptionIndex }]
	if (Array.isArray(answers)) {
		return answers
			.map((a) => ({
				questionId: String(a?.questionId || ''),
				selectedOptionIndex: Number(a?.selectedOptionIndex),
			}))
			.filter((a) => a.questionId && Number.isFinite(a.selectedOptionIndex))
	}
	if (answers && typeof answers === 'object') {
		return Object.entries(answers)
			.map(([qid, idx]) => ({ questionId: String(qid), selectedOptionIndex: Number(idx) }))
			.filter((a) => a.questionId && Number.isFinite(a.selectedOptionIndex))
	}
	return []
}

async function submitQuiz(req, res) {
	try {
		const { quizId, answers } = req.body || {}
		if (!quizId || typeof quizId !== 'string') {
			return res.status(400).json({ message: 'quizId is required' })
		}

		const quiz = await Quiz.findOne({ _id: quizId, userId: req.user._id }).lean()
		if (!quiz) {
			return res.status(404).json({ message: 'Quiz not found' })
		}

		const submitted = coerceAnswersPayload(answers)
		if (!submitted.length) {
			return res.status(400).json({ message: 'answers are required' })
		}

		const answerMap = new Map(submitted.map((a) => [String(a.questionId), Number(a.selectedOptionIndex)]))

		let score = 0
		const results = quiz.questions.map((q) => {
			const qid = String(q._id)
			const selectedOptionIndex = clampInt(answerMap.get(qid), { min: 0, max: 3, fallback: -1 })
			const correctOptionIndex = Number(q.correctOptionIndex)
			const isCorrect = selectedOptionIndex === correctOptionIndex
			if (isCorrect) score += 1
			return {
				questionId: qid,
				question: q.question,
				options: q.options,
				selectedOptionIndex,
				correctOptionIndex,
				correctAnswer: q.correctAnswer,
				isCorrect,
				explanation: q.explanation,
			}
		})

		const total = quiz.questions.length
		const percentage = total > 0 ? Math.round((score / total) * 1000) / 10 : 0

		const attempt = await QuizAttempt.create({
			quizId: quiz._id,
			userId: req.user._id,
			answers: results
				.filter((r) => r.selectedOptionIndex >= 0)
				.map((r) => ({
					questionId: r.questionId,
					selectedOptionIndex: r.selectedOptionIndex,
					correctOptionIndex: r.correctOptionIndex,
					isCorrect: r.isCorrect,
				})),
			score,
			total,
			percentage,
			submittedAt: new Date(),
		})

		const quizTopic = String(quiz.topic || quiz.title || '').trim()
		await logActivity(req.user._id, {
			type: 'quiz_submitted',
			label: `Completed quiz${quizTopic ? `: ${quizTopic}` : ''} (${Math.round(percentage)}%)`,
			meta: { quizId: String(quiz._id), percentage },
		})

		let progress = null
		try {
			progress = await updateTopicProgressFromAttempt({
				userId: req.user._id,
				topic: quiz.topic || quiz.title,
				percentage,
			})
		} catch (e) {
			console.warn('[quiz] Progress update failed:', e)
		}

		return res.status(200).json({
			attemptId: attempt._id,
			score,
			total,
			percentage,
			results,
			progress,
		})
	} catch (error) {
		console.error('[quiz] Submit error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function getQuizById(req, res) {
	try {
		const { id } = req.params
		if (!id) return res.status(400).json({ message: 'Quiz id is required' })

		const quiz = await Quiz.findOne({ _id: id, userId: req.user._id }).lean()
		if (!quiz) return res.status(404).json({ message: 'Quiz not found' })

		return res.status(200).json({ quiz })
	} catch (error) {
		console.error('[quiz] Get error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = {
	generateQuiz,
	listQuizzesByDocument,
	submitQuiz,
	getQuizById,
}

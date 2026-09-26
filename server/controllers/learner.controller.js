const Activity = require('../models/activity.model')
const Analytics = require('../models/analytics.model')
const Document = require('../models/document.model')
const Flashcard = require('../models/flashcard.model')
const UserProgress = require('../models/userProgress.model')

function clamp(value) {
	return Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
}

async function getLearnerToday(req, res) {
	try {
		const userId = req.user._id
		const now = new Date()
		const [progress, analytics, dueReviews, activities, lastDocument] = await Promise.all([
			UserProgress.findOne({ userId }).lean(),
			Analytics.findOne({ userId }).lean(),
			Flashcard.find({ userId, nextReviewAt: { $lte: now } }).sort({ nextReviewAt: 1 }).limit(5).select('question source nextReviewAt').lean(),
			Activity.find({ userId }).sort({ createdAt: -1 }).limit(6).select('type label createdAt').lean(),
			Document.findOne({ userId }).sort({ updatedAt: -1 }).select('_id title updatedAt').lean(),
		])

		const topics = (progress?.topics || []).slice().sort((a, b) => a.strength - b.strength)
		const weakConcepts = topics.slice(0, 4).map((topic) => ({
			name: topic.topic,
			mastery: clamp(topic.strength),
			attempts: topic.attempts,
			reason: topic.lastPercentage < topic.strength ? 'Recent accuracy is below your baseline' : 'Needs another retrieval pass',
			action: 'Practice now',
		}))
		const strongConcepts = topics.slice().sort((a, b) => b.strength - a.strength).slice(0, 3).map((topic) => ({ name: topic.topic, mastery: clamp(topic.strength) }))
		const mastery = topics.length ? clamp(topics.reduce((sum, topic) => sum + topic.strength, 0) / topics.length) : clamp(analytics?.averagePercentage)
		const retention = dueReviews.length ? clamp(100 - (dueReviews.length * 8)) : 92
		const focus = weakConcepts[0]?.name || 'your next concept'

		return res.status(200).json({
			user: { name: req.user.name, plan: req.user.plan },
			mission: {
				title: lastDocument?.title || 'Build your first learning mission',
				subtitle: lastDocument ? 'Continue from your latest learning workspace' : 'Upload a document to start a guided learning loop',
				progress: lastDocument ? mastery : 0,
				remaining: lastDocument ? `${Math.max(1, Math.round((100 - mastery) / 10))} focused sessions` : '7 minutes to begin',
				documentId: lastDocument?._id || null,
			},
			recommendation: {
				title: weakConcepts.length ? `Practice ${focus}` : 'Create a learning mission',
				description: weakConcepts.length ? 'A short adaptive challenge will target the concept with the most room to grow.' : 'Turn a document into a structured diagnose-to-remember workflow.',
				to: weakConcepts.length ? '/practice-lab' : '/documents',
			},
			intelligence: { mastery, retention, confidence: topics.length ? clamp(mastery + 4) : 0, streak: 0 },
			weakConcepts,
			strongConcepts,
			recentActivity: activities,
			upcomingReviews: dueReviews.map((card) => ({ id: card._id, question: card.question, source: card.source?.documentTitle || 'Flashcard review' })),
			insight: weakConcepts.length ? `Your strongest signal is ${mastery}% mastery, but ${focus} needs another retrieval pass before it sticks.` : 'Complete a quiz or review a flashcard to unlock your first Learner Twin insight.',
		})
	} catch (error) {
		console.error('[learner] Today error:', error)
		return res.status(500).json({ message: 'Failed to load learner twin' })
	}
}

module.exports = { getLearnerToday }
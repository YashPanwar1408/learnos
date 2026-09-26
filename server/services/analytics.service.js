const mongoose = require('mongoose')

const Analytics = require('../models/analytics.model')
const QuizAttempt = require('../models/quizAttempt.model')

function round1(n) {
	return Math.round(n * 10) / 10
}

function clampPercent(n) {
	if (!Number.isFinite(n)) return 0
	return Math.min(100, Math.max(0, n))
}

function toDateKey(d) {
	// YYYY-MM-DD (local)
	const year = d.getFullYear()
	const month = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

async function calculateAnalyticsForUser(userId, { days = 30 } = {}) {
	const uid = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId
	const windowDays = Math.max(7, Math.min(365, Math.trunc(Number(days) || 30)))
	const since = new Date()
	since.setDate(since.getDate() - (windowDays - 1))
	since.setHours(0, 0, 0, 0)

	// Join attempts -> quizzes so we can treat quiz title as topic.
	const attempts = await QuizAttempt.aggregate([
		{ $match: { userId: uid } },
		{
			$lookup: {
				from: 'quizzes',
				localField: 'quizId',
				foreignField: '_id',
				as: 'quiz',
			},
		},
		{ $unwind: { path: '$quiz', preserveNullAndEmptyArrays: true } },
		{
			$project: {
				submittedAt: 1,
				percentage: 1,
				score: 1,
				total: 1,
				topic: { $ifNull: ['$quiz.title', 'Untitled'] },
			},
		},
		{ $sort: { submittedAt: -1 } },
	])

	const totalQuizzesAttempted = attempts.length
	const averagePercentage = totalQuizzesAttempted
		? round1(
			attempts.reduce((sum, a) => sum + clampPercent(Number(a.percentage)), 0) / totalQuizzesAttempted
		)
		: 0

	// Topic stats
	const topicMap = new Map()
	for (const a of attempts) {
		const topic = String(a.topic || 'Untitled').trim() || 'Untitled'
		const pct = clampPercent(Number(a.percentage))
		const cur = topicMap.get(topic) || { topic, attempts: 0, sumPct: 0 }
		cur.attempts += 1
		cur.sumPct += pct
		topicMap.set(topic, cur)
	}

	const topicStats = Array.from(topicMap.values())
		.map((t) => ({
			topic: t.topic,
			attempts: t.attempts,
			averagePercentage: round1(t.sumPct / Math.max(1, t.attempts)),
		}))
		.sort((a, b) => b.attempts - a.attempts)

	const MIN_ATTEMPTS_FOR_RANKING = 1
	const rankable = topicStats.filter((t) => t.attempts >= MIN_ATTEMPTS_FOR_RANKING)

	const strongTopics = [...rankable]
		.sort((a, b) => b.averagePercentage - a.averagePercentage)
		.slice(0, 5)

	const weakTopics = [...rankable]
		.sort((a, b) => a.averagePercentage - b.averagePercentage)
		.slice(0, 5)

	// Time series (last N days)
	const buckets = new Map()
	for (let i = 0; i < windowDays; i += 1) {
		const d = new Date(since)
		d.setDate(d.getDate() + i)
		buckets.set(toDateKey(d), { date: toDateKey(d), attempts: 0, sumPct: 0 })
	}

	for (const a of attempts) {
		const d = new Date(a.submittedAt)
		if (Number.isNaN(d.getTime())) continue
		if (d.getTime() < since.getTime()) continue
		const key = toDateKey(d)
		const bucket = buckets.get(key)
		if (!bucket) continue
		bucket.attempts += 1
		bucket.sumPct += clampPercent(Number(a.percentage))
	}

	const timeSeries = Array.from(buckets.values()).map((b) => ({
		date: b.date,
		attempts: b.attempts,
		averagePercentage: b.attempts ? round1(b.sumPct / b.attempts) : 0,
	}))

	return {
		totalQuizzesAttempted,
		averagePercentage,
		strongTopics,
		weakTopics,
		topicStats,
		timeSeries,
		computedAt: new Date(),
	}
}

async function getOrComputeAnalytics(userId) {
	const computed = await calculateAnalyticsForUser(userId, { days: 30 })

	const doc = await Analytics.findOneAndUpdate(
		{ userId },
		{
			$set: {
				...computed,
				userId,
			},
		},
		{ new: true, upsert: true }
	).lean()

	return doc
}

module.exports = {
	calculateAnalyticsForUser,
	getOrComputeAnalytics,
}

const UserProgress = require('../models/userProgress.model')

function clampPercent(n) {
	const num = Number(n)
	if (!Number.isFinite(num)) return 0
	return Math.min(100, Math.max(0, num))
}

function normalizeTopic(topic) {
	const t = String(topic || '').trim()
	return t || 'Untitled'
}

function pickDifficultyFromStrength(strength) {
	const s = clampPercent(strength)
	if (s >= 80) return 'hard'
	if (s >= 55) return 'medium'
	return 'easy'
}

async function getTopicProgress({ userId, topic }) {
	const normalizedTopic = normalizeTopic(topic)
	const doc = await UserProgress.findOne({ userId }).lean()
	const entry = doc?.topics?.find((t) => t.topic === normalizedTopic) || null
	return {
		topic: normalizedTopic,
		strength: typeof entry?.strength === 'number' ? entry.strength : 0,
		difficultyLevel: entry?.difficultyLevel || pickDifficultyFromStrength(entry?.strength ?? 0),
		attempts: typeof entry?.attempts === 'number' ? entry.attempts : 0,
		lastPercentage: typeof entry?.lastPercentage === 'number' ? entry.lastPercentage : 0,
	}
}

async function chooseDifficultyForTopic({ userId, topic }) {
	const p = await getTopicProgress({ userId, topic })
	return {
		...p,
		targetDifficulty: pickDifficultyFromStrength(p.strength),
	}
}

async function updateTopicProgressFromAttempt({ userId, topic, percentage }) {
	const normalizedTopic = normalizeTopic(topic)
	const pct = clampPercent(percentage)

	let doc = await UserProgress.findOne({ userId })
	if (!doc) {
		doc = await UserProgress.create({ userId, topics: [] })
	}

	const now = new Date()
	const idx = doc.topics.findIndex((t) => t.topic === normalizedTopic)
	if (idx === -1) {
		doc.topics.push({
			topic: normalizedTopic,
			strength: pct,
			difficultyLevel: pickDifficultyFromStrength(pct),
			attempts: 1,
			lastPercentage: pct,
			updatedAt: now,
		})
	} else {
		const cur = doc.topics[idx]
		const prevStrength = clampPercent(cur.strength)
		// Exponential moving average to keep it stable.
		const alpha = 0.3
		const nextStrength = (1 - alpha) * prevStrength + alpha * pct

		cur.attempts = Math.max(0, Math.trunc(Number(cur.attempts) || 0)) + 1
		cur.lastPercentage = pct
		cur.strength = clampPercent(nextStrength)
		cur.difficultyLevel = pickDifficultyFromStrength(cur.strength)
		cur.updatedAt = now
	}

	await doc.save()
	return getTopicProgress({ userId, topic: normalizedTopic })
}

module.exports = {
	pickDifficultyFromStrength,
	chooseDifficultyForTopic,
	updateTopicProgressFromAttempt,
	getTopicProgress,
}

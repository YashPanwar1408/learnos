const ConceptMastery = require('../models/conceptMastery.model')
const UserLearningProfile = require('../models/userLearningProfile.model')
const { clamp, confidenceGap, scoreAttempt } = require('./mastery.core')

function scoreReason(score) {
	if (score >= 80) return 'Strong correctness and reasoning signal'
	if (score >= 60) return 'Progressing, but consistency or calibration needs practice'
	return 'Recent evidence shows this concept needs a targeted intervention'
}

async function recordMastery({ userId, conceptId, attempt }) {
	const attemptScore = scoreAttempt(attempt)
	const existing = await ConceptMastery.findOne({ userId, conceptId })
	const previousScore = existing?.currentScore || 0
	const currentScore = Math.round((previousScore * 0.65) + (attemptScore * 0.35))
	const doc = await ConceptMastery.findOneAndUpdate(
		{ userId, conceptId },
		{ $set: {
			previousScore,
			currentScore,
			scoreDelta: currentScore - previousScore,
			confidenceScore: clamp(attempt.confidence),
			retentionScore: clamp(attempt.retrieval === false ? 45 : (attempt.isCorrect ? 85 : 35)),
			reasoningScore: clamp(attempt.reasoningQuality),
			lastReason: scoreReason(attemptScore),
			lastAttemptAt: new Date(),
		}, $inc: { attemptCount: 1 } },
		{ upsert: true, new: true, setDefaultsOnInsert: true }
	).lean()

	await UserLearningProfile.findOneAndUpdate(
		{ userId },
		{ $setOnInsert: { userId }, $inc: {
			questionsAttempted: 1,
			questionsCorrect: attempt.isCorrect ? 1 : 0,
			questionsIncorrect: attempt.isCorrect ? 0 : 1,
		}, $set: { conceptsRequiringReview: currentScore < 80 ? 1 : 0 } },
		{ upsert: true, setDefaultsOnInsert: true }
	)
	return { mastery: doc, attemptScore }
}

module.exports = { clamp, confidenceGap, scoreAttempt, recordMastery }
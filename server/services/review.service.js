function scheduleReview({ mastery = 0, confidence = 0, misconceptionDetected = false, now = new Date() }) {
	const score = Number(mastery) || 0
	let intervalDays = score < 40 ? 1 : score < 60 ? 2 : score < 80 ? 5 : 14
	if (misconceptionDetected) intervalDays = Math.min(intervalDays, 2)
	if (Math.abs((Number(confidence) || 0) - score) >= 25) intervalDays = Math.min(intervalDays, 3)
	const reviewAt = new Date(now)
	reviewAt.setDate(reviewAt.getDate() + intervalDays)
	return { intervalDays, reviewAt }
}

module.exports = { scheduleReview }
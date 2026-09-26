function clamp(value, { min, max }) {
	const n = Number(value)
	if (!Number.isFinite(n)) return min
	return Math.min(max, Math.max(min, n))
}

function addDays(date, days) {
	const d = new Date(date)
	d.setDate(d.getDate() + days)
	return d
}

/**
 * Basic spaced repetition scheduler.
 *
 * State:
 * - repetitions: number of successful reviews
 * - intervalDays: current interval in days
 * - easeFactor: controls growth rate (1.3..3.0)
 */
function scheduleNextReview({ repetitions, intervalDays, easeFactor, rating, now = new Date() }) {
	const rep = Math.max(0, Math.trunc(Number(repetitions) || 0))
	const interval = Math.max(0, Math.trunc(Number(intervalDays) || 0))
	let ef = clamp(easeFactor ?? 2.5, { min: 1.3, max: 3.0 })

	let nextRepetitions = rep
	let nextInterval = interval

	switch (rating) {
		case 'hard': {
			// Hard: small progress; slightly reduce ease.
			ef = clamp(ef - 0.2, { min: 1.3, max: 3.0 })
			if (rep === 0) nextInterval = 1
			else nextInterval = Math.max(1, Math.round(interval * 0.9))
			nextRepetitions = rep + 1
			break
		}
		case 'medium': {
			// Medium: normal progress.
			if (rep === 0) nextInterval = 1
			else if (rep === 1) nextInterval = 3
			else nextInterval = Math.max(1, Math.round(interval * ef))
			nextRepetitions = rep + 1
			break
		}
		case 'easy': {
			// Easy: faster growth; slightly increase ease.
			ef = clamp(ef + 0.15, { min: 1.3, max: 3.0 })
			if (rep === 0) nextInterval = 2
			else if (rep === 1) nextInterval = 5
			else nextInterval = Math.max(1, Math.round(interval * ef * 1.3))
			nextRepetitions = rep + 1
			break
		}
		default:
			throw new Error('Invalid rating')
	}

	const nextReviewAt = addDays(now, nextInterval)

	return {
		repetitions: nextRepetitions,
		intervalDays: nextInterval,
		easeFactor: ef,
		nextReviewAt,
	}
}

module.exports = { scheduleNextReview }

function clamp(value) {
	return Math.max(0, Math.min(100, Number(value) || 0))
}

function confidenceGap(confidence, understanding) {
	return Math.round(Math.abs(clamp(confidence) - clamp(understanding)))
}

function scoreAttempt(input = {}) {
	const correctness = input.isCorrect ? 100 : 0
	const reasoning = clamp(input.reasoningQuality)
	const retrieval = input.retrieval === false ? 40 : (input.isCorrect ? 100 : 0)
	const difficultyBonus = input.difficulty === 'hard' ? 8 : input.difficulty === 'easy' ? -4 : 0
	const hintPenalty = Math.min(25, Math.max(0, Number(input.hintsUsed) || 0) * 8)
	const retryPenalty = Math.min(15, Math.max(0, Number(input.retryCount) || 0) * 4)
	const calibration = 100 - confidenceGap(input.confidence, (correctness * 0.5) + (reasoning * 0.5))
	const raw = (correctness * 0.35) + (reasoning * 0.25) + (retrieval * 0.15) + (calibration * 0.15) + (Math.max(0, Math.min(100, 50 + difficultyBonus)) * 0.10)
	return Math.round(Math.max(0, Math.min(100, raw - hintPenalty - retryPenalty)))
}

module.exports = { clamp, confidenceGap, scoreAttempt }
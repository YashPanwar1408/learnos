function clampInt(value, { min, max, fallback }) {
	const n = Number(value)
	if (!Number.isFinite(n)) return fallback
	const i = Math.trunc(n)
	if (i < min) return min
	if (i > max) return max
	return i
}

const TOKEN_COSTS = {
	chat: 2,
	summary: 5,
	explain: 3,
	studyPlan: 5,
	knowledgeGraph: 8,
	practiceLab: 10,
	performanceAnalysis: 5,
	courseFromDocument: 20,
	customCourseBase: 3,
	customCoursePerModule: 2,
	quizBase: 3,
	flashcardsBase: 3,
}

function costForQuiz(numQuestions) {
	const n = clampInt(numQuestions, { min: 1, max: 20, fallback: 5 })
	const extra = Math.max(0, Math.ceil((n - 5) / 5))
	return TOKEN_COSTS.quizBase + extra
}

function costForFlashcards(numCards) {
	const n = clampInt(numCards, { min: 1, max: 50, fallback: 12 })
	const extra = Math.max(0, Math.ceil((n - 12) / 10))
	return TOKEN_COSTS.flashcardsBase + extra
}

function costForCustomCourse(moduleCount) {
	const m = clampInt(moduleCount, { min: 3, max: 12, fallback: 6 })
	return TOKEN_COSTS.customCourseBase + m * TOKEN_COSTS.customCoursePerModule
}

module.exports = {
	TOKEN_COSTS,
	costForQuiz,
	costForFlashcards,
	costForCustomCourse,
}

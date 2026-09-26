const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { confidenceGap, scoreAttempt } = require('../services/mastery.core')
const { extractJson, validateDiagnostic, fallbackDiagnostic } = require('../services/structuredAi.service')
const { nextMissionPhase, isMissionComplete } = require('../services/mission.service')
const { scheduleReview } = require('../services/review.service')
const { selectIntervention } = require('../services/pedagogy.service')

test('mastery scoring rewards correct, reasoned retrieval and penalizes hints', () => {
	const strong = scoreAttempt({ isCorrect: true, reasoningQuality: 90, confidence: 85, difficulty: 'hard', retrieval: true })
	const supported = scoreAttempt({ isCorrect: true, reasoningQuality: 90, confidence: 85, difficulty: 'hard', retrieval: true, hintsUsed: 2 })
	assert.ok(strong > supported)
	assert.ok(strong >= 70)
})

test('confidence gap identifies possible illusion of understanding evidence', () => {
	assert.equal(confidenceGap(95, 52), 43)
	const diagnostic = fallbackDiagnostic({ isCorrect: false, confidence: 95, studentExplanation: '' })
	assert.equal(diagnostic.isCorrect, false)
	assert.equal(diagnostic.misconceptionDetected, true)
})

test('structured diagnostic rejects malformed AI output', () => {
	assert.equal(validateDiagnostic({ isCorrect: true }), null)
	assert.equal(extractJson('not json'), null)
	assert.deepEqual(extractJson('```json\n{"isCorrect":true}\n```'), { isCorrect: true })
})

test('mission transitions are evidence-driven', () => {
	assert.equal(nextMissionPhase({ currentPhase: 'diagnose' }), 'learn')
	assert.equal(nextMissionPhase({ currentPhase: 'guided_practice', lastAttemptCorrect: false }), 'guided_practice')
	assert.equal(nextMissionPhase({ currentPhase: 'explain', explanationQuality: 80 }), 'verify')
	assert.equal(isMissionComplete({ currentPhase: 'review', mastery: 80 }), true)
})

test('review schedule moves weak or miscalibrated concepts sooner', () => {
	const weak = scheduleReview({ mastery: 35, confidence: 35, now: new Date('2026-01-01T00:00:00Z') })
	const strong = scheduleReview({ mastery: 90, confidence: 90, now: new Date('2026-01-01T00:00:00Z') })
	assert.equal(weak.intervalDays, 1)
	assert.equal(strong.intervalDays, 14)
	assert.ok(weak.reviewAt < strong.reviewAt)
})

test('pedagogy selects different interventions from learner context', () => {
	const misconception = selectIntervention({ mastery: 35, misconception: 'Network and host bits are swapped.' })
	const strong = selectIntervention({ mastery: 90 })
	assert.equal(misconception.interventionType, 'worked_example')
	assert.equal(strong.interventionType, 'challenge_problem')
})

test('learning routes require authentication and user-owned queries', () => {
	const route = fs.readFileSync(path.join(__dirname, '../routes/learning.routes.js'), 'utf8')
	const controller = fs.readFileSync(path.join(__dirname, '../controllers/learning.controller.js'), 'utf8')
	assert.match(route, /router\.use\(protect\)/)
	assert.match(controller, /userId: req\.user\._id/)
	const teacherRoute = fs.readFileSync(path.join(__dirname, '../routes/teacher.routes.js'), 'utf8')
	assert.match(teacherRoute, /requireTeacher/)
})
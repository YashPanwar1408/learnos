const mongoose = require('mongoose')
const Concept = require('../models/concept.model')
const ConceptMastery = require('../models/conceptMastery.model')
const ConfidenceRecord = require('../models/confidenceRecord.model')
const Intervention = require('../models/intervention.model')
const LearningAttempt = require('../models/learningAttempt.model')
const LearningEvent = require('../models/learningEvent.model')
const LearningMission = require('../models/learningMission.model')
const Misconception = require('../models/misconception.model')
const ReviewSchedule = require('../models/reviewSchedule.model')
const UserLearningProfile = require('../models/userLearningProfile.model')
const { diagnoseAttempt, validateDiagnostic } = require('../services/structuredAi.service')
const { confidenceGap, recordMastery } = require('../services/mastery.service')
const { selectIntervention } = require('../services/pedagogy.service')
const { isMissionComplete, nextMissionPhase } = require('../services/mission.service')
const { scheduleReview } = require('../services/review.service')

function text(value, max = 4000) {
	return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function number(value, fallback = 0) {
	const result = Number(value)
	return Number.isFinite(result) ? Math.max(0, Math.min(100, result)) : fallback
}

async function getOrCreateConcept({ conceptId, conceptName, conceptContext }) {
	if (conceptId && mongoose.isValidObjectId(conceptId)) {
		const existing = await Concept.findById(conceptId)
		if (existing) return existing
	}
	const name = text(conceptName || conceptContext, 160)
	if (!name) return null
	const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150) || `concept-${Date.now()}`
	return Concept.findOneAndUpdate({ key }, { $setOnInsert: { key, name, description: text(conceptContext, 2000), source: 'user' } }, { new: true, upsert: true, setDefaultsOnInsert: true })
}

async function diagnose(req, res) {
	try {
		const body = req.body || {}
		const concept = await getOrCreateConcept(body)
		if (!concept) return res.status(400).json({ message: 'conceptId or conceptName is required' })
		const isCorrect = typeof body.isCorrect === 'boolean' ? body.isCorrect : null
		if (isCorrect === null || !text(body.question) || !text(body.studentAnswer)) return res.status(400).json({ message: 'question, studentAnswer, and verified isCorrect are required' })
		const previousAttempts = await LearningAttempt.find({ userId: req.user._id, conceptId: concept._id }).sort({ createdAt: -1 }).limit(5).select('isCorrect reasoningQuality confidence').lean()
		const diagnostic = await diagnoseAttempt({ ...body, isCorrect, confidence: number(body.confidence), question: text(body.question), studentAnswer: text(body.studentAnswer), studentExplanation: text(body.studentExplanation, 8000), correctAnswer: text(body.correctAnswer), conceptContext: text(body.conceptContext || concept.name), previousAttempts })
		return res.status(200).json({ diagnostic, confidenceGap: confidenceGap(diagnostic.confidence, diagnostic.reasoningQuality) })
	} catch (error) {
		console.error('[learning] Diagnose error:', error)
		return res.status(500).json({ message: 'Unable to diagnose attempt' })
	}
}

async function recordAttempt(req, res) {
	try {
		const body = req.body || {}
		const concept = await getOrCreateConcept(body)
		if (!concept) return res.status(400).json({ message: 'conceptId or conceptName is required' })
		if (typeof body.isCorrect !== 'boolean' || !text(body.question) || !text(body.studentAnswer)) return res.status(400).json({ message: 'question, studentAnswer, and verified isCorrect are required' })
		const candidateDiagnostic = body.diagnostic && typeof body.diagnostic === 'object' ? validateDiagnostic(body.diagnostic) : null
		const suppliedDiagnostic = candidateDiagnostic && candidateDiagnostic.isCorrect === body.isCorrect ? candidateDiagnostic : null
		const diagnostic = suppliedDiagnostic || await diagnoseAttempt({ ...body, question: text(body.question), studentAnswer: text(body.studentAnswer), confidence: number(body.confidence), conceptContext: text(body.conceptContext || concept.name) })
		diagnostic.isCorrect = body.isCorrect
		const gap = confidenceGap(diagnostic.confidence, diagnostic.reasoningQuality)
		const ownedMission = mongoose.isValidObjectId(body.missionId) ? await LearningMission.findOne({ _id: body.missionId, userId: req.user._id }).select('_id').lean() : null
		const attempt = await LearningAttempt.create({ userId: req.user._id, conceptId: concept._id, missionId: ownedMission?._id || null, question: text(body.question), studentAnswer: text(body.studentAnswer, 8000), studentExplanation: text(body.studentExplanation, 8000), isCorrect: body.isCorrect, reasoningQuality: diagnostic.reasoningQuality, confidence: diagnostic.confidence, difficulty: ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : 'medium', hintsUsed: Math.max(0, Math.trunc(Number(body.hintsUsed) || 0)), retryCount: Math.max(0, Math.trunc(Number(body.retryCount) || 0)), responseTimeMs: Math.max(0, Math.trunc(Number(body.responseTimeMs) || 0)), retrieval: body.retrieval !== false, confidenceGap: gap, diagnostic })
		const result = await recordMastery({ userId: req.user._id, conceptId: concept._id, attempt: { ...body, isCorrect: body.isCorrect, reasoningQuality: diagnostic.reasoningQuality, confidence: diagnostic.confidence } })
		if (diagnostic.misconceptionDetected && diagnostic.misconception) await Misconception.create({ userId: req.user._id, conceptId: concept._id, attemptId: attempt._id, description: diagnostic.misconception, evidence: diagnostic.evidence || 'Diagnostic evidence recorded.', severity: diagnostic.severity })
		if (!diagnostic.misconceptionDetected && body.isCorrect && diagnostic.reasoningQuality >= 70) await Misconception.updateMany({ userId: req.user._id, conceptId: concept._id, resolvedAt: null }, { $set: { resolvedAt: new Date() } })
		await ConfidenceRecord.create({ userId: req.user._id, conceptId: concept._id, attemptId: attempt._id, confidence: diagnostic.confidence, understanding: diagnostic.reasoningQuality, gap, calibrationLabel: gap >= 25 && diagnostic.confidence > diagnostic.reasoningQuality ? 'possible_illusion_of_understanding' : diagnostic.confidence < diagnostic.reasoningQuality - 25 ? 'underconfident' : 'well_calibrated' })
		const scheduled = scheduleReview({ mastery: result.mastery.currentScore, confidence: diagnostic.confidence, misconceptionDetected: diagnostic.misconceptionDetected })
		await ReviewSchedule.findOneAndUpdate({ userId: req.user._id, conceptId: concept._id }, { $set: { lastAttemptId: attempt._id, previousMisconception: diagnostic.misconception || '', previousQuestion: text(body.question), intervalDays: scheduled.intervalDays, reviewAt: scheduled.reviewAt, confidencePrediction: diagnostic.confidence } }, { upsert: true, new: true, setDefaultsOnInsert: true })
		const interventionSelection = selectIntervention({ mastery: result.mastery.currentScore, misconception: diagnostic.misconception || undefined, currentAttempt: body })
		const intervention = await Intervention.create({ userId: req.user._id, conceptId: concept._id, missionId: attempt.missionId, type: interventionSelection.interventionType, reason: interventionSelection.reason, instruction: interventionSelection.instruction, difficulty: interventionSelection.difficulty, successCriteria: interventionSelection.successCriteria })
		let mission = null
		if (ownedMission) {
			mission = await LearningMission.findOne({ _id: ownedMission._id, userId: req.user._id })
			const nextPhase = nextMissionPhase({ currentPhase: mission.currentPhase, mastery: result.mastery.currentScore, lastAttemptCorrect: body.isCorrect, explanationQuality: diagnostic.reasoningQuality })
			if (nextPhase !== mission.currentPhase) mission.completedPhases = Array.from(new Set([...mission.completedPhases, mission.currentPhase]))
			mission.currentPhase = nextPhase
			if (isMissionComplete({ currentPhase: nextPhase, mastery: result.mastery.currentScore })) { mission.status = 'completed'; mission.completedAt = new Date() }
			await mission.save()
		}
		await LearningEvent.create({ userId: req.user._id, conceptId: concept._id, missionId: attempt.missionId, type: body.studentExplanation ? 'prove_understanding_submitted' : 'learning_attempt_recorded', data: { isCorrect: body.isCorrect, confidenceGap: gap } })
		return res.status(201).json({ attempt, mastery: result.mastery, diagnostic, confidenceGap: gap, calibration: gap >= 25 && diagnostic.confidence > diagnostic.reasoningQuality ? 'Possible illusion of understanding' : 'Confidence is reasonably calibrated', review: scheduled, intervention, mission })
	} catch (error) {
		console.error('[learning] Attempt error:', error)
		return res.status(500).json({ message: 'Unable to record learning attempt' })
	}
}

async function getMastery(req, res) {
	try {
		const mastery = await ConceptMastery.find({ userId: req.user._id }).populate('conceptId', 'name key').sort({ currentScore: 1 }).lean()
		return res.status(200).json({ mastery })
	} catch (error) { console.error('[learning] Mastery error:', error); return res.status(500).json({ message: 'Unable to load mastery' }) }
}

async function createIntervention(req, res) {
	try {
		const concept = await getOrCreateConcept(req.body || {})
		if (!concept) return res.status(400).json({ message: 'conceptId or conceptName is required' })
		const mastery = await ConceptMastery.findOne({ userId: req.user._id, conceptId: concept._id }).lean()
		const misconception = await Misconception.findOne({ userId: req.user._id, conceptId: concept._id, resolvedAt: null }).sort({ createdAt: -1 }).lean()
		const previous = await Intervention.find({ userId: req.user._id, conceptId: concept._id }).sort({ createdAt: -1 }).limit(5).lean()
		const selection = selectIntervention({ mastery: mastery?.currentScore || 0, misconception: misconception?.description, previousInterventions: previous, currentAttempt: req.body || {} })
		const ownedMission = mongoose.isValidObjectId(req.body?.missionId) ? await LearningMission.findOne({ _id: req.body.missionId, userId: req.user._id }).select('_id').lean() : null
		const intervention = await Intervention.create({ userId: req.user._id, conceptId: concept._id, missionId: ownedMission?._id || null, type: selection.interventionType, reason: selection.reason, instruction: selection.instruction, difficulty: selection.difficulty, successCriteria: selection.successCriteria })
		return res.status(201).json({ intervention })
	} catch (error) { console.error('[learning] Intervention error:', error); return res.status(500).json({ message: 'Unable to select intervention' }) }
}

async function createMission(req, res) {
	try {
		const concept = await getOrCreateConcept(req.body || {})
		if (!concept) return res.status(400).json({ message: 'conceptId or conceptName is required' })
		const mastery = await ConceptMastery.findOne({ userId: req.user._id, conceptId: concept._id }).lean()
		const mission = await LearningMission.create({ userId: req.user._id, conceptId: concept._id, title: text(req.body?.title || `Master ${concept.name}`, 200), startScore: mastery?.currentScore || 0, goalScore: number(req.body?.goalScore, 80) })
		return res.status(201).json({ mission })
	} catch (error) { console.error('[learning] Mission create error:', error); return res.status(500).json({ message: 'Unable to create mission' }) }
}

async function listMissions(req, res) {
	try { return res.status(200).json({ missions: await LearningMission.find({ userId: req.user._id }).populate('conceptId', 'name key').sort({ updatedAt: -1 }).lean() }) } catch (error) { return res.status(500).json({ message: 'Unable to load missions' }) }
}

async function advanceMission(req, res) {
	try {
		const mission = await LearningMission.findOne({ _id: req.params.id, userId: req.user._id })
		if (!mission) return res.status(404).json({ message: 'Mission not found' })
		const mastery = await ConceptMastery.findOne({ userId: req.user._id, conceptId: mission.conceptId }).lean()
		const next = nextMissionPhase({ currentPhase: mission.currentPhase, mastery: mastery?.currentScore || 0, lastAttemptCorrect: req.body?.lastAttemptCorrect === true, explanationQuality: number(req.body?.explanationQuality) })
		if (next !== mission.currentPhase) mission.completedPhases = Array.from(new Set([...mission.completedPhases, mission.currentPhase]))
		mission.currentPhase = next
		if (isMissionComplete({ currentPhase: next, mastery: mastery?.currentScore || 0 })) { mission.status = 'completed'; mission.completedAt = new Date() }
		await mission.save()
		return res.status(200).json({ mission })
	} catch (error) { return res.status(500).json({ message: 'Unable to advance mission' }) }
}

async function getReviews(req, res) {
	try { return res.status(200).json({ reviews: await ReviewSchedule.find({ userId: req.user._id, reviewAt: { $lte: new Date() } }).populate('conceptId', 'name key').sort({ reviewAt: 1 }).lean() }) } catch (error) { return res.status(500).json({ message: 'Unable to load reviews' }) }
}

async function getTwin(req, res) {
	try {
		const [profile, mastery, misconceptions, interventions] = await Promise.all([UserLearningProfile.findOne({ userId: req.user._id }).lean(), ConceptMastery.find({ userId: req.user._id }).populate('conceptId', 'name key').sort({ currentScore: 1 }).lean(), Misconception.find({ userId: req.user._id, resolvedAt: null }).populate('conceptId', 'name key').sort({ createdAt: -1 }).limit(20).lean(), Intervention.find({ userId: req.user._id }).populate('conceptId', 'name key').sort({ createdAt: -1 }).limit(20).lean()])
		return res.status(200).json({ profile: profile || { userId: req.user._id }, mastery, misconceptions, interventions })
	} catch (error) { return res.status(500).json({ message: 'Unable to load Learner Twin' }) }
}

async function getInsights(req, res) {
	try {
		const records = await ConfidenceRecord.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(20).lean()
		const averageGap = records.length ? Math.round(records.reduce((sum, item) => sum + item.gap, 0) / records.length) : 0
		return res.status(200).json({ averageConfidenceGap: averageGap, label: averageGap >= 25 ? 'Possible illusion of understanding' : 'Confidence is reasonably calibrated', records })
	} catch (error) { return res.status(500).json({ message: 'Unable to load Learner Twin insights' }) }
}

module.exports = { diagnose, recordAttempt, getMastery, createIntervention, createMission, listMissions, advanceMission, getReviews, getTwin, getInsights }
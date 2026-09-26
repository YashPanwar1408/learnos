const mongoose = require('mongoose')

const learningAttemptSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
	conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true, index: true },
	missionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningMission', default: null, index: true },
	question: { type: String, required: true, maxlength: 4000 },
	studentAnswer: { type: String, required: true, maxlength: 8000 },
	studentExplanation: { type: String, default: '', maxlength: 8000 },
	isCorrect: { type: Boolean, required: true },
	reasoningQuality: { type: Number, default: 0, min: 0, max: 100 },
	confidence: { type: Number, default: 0, min: 0, max: 100 },
	difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
	hintsUsed: { type: Number, default: 0, min: 0 },
	retryCount: { type: Number, default: 0, min: 0 },
	responseTimeMs: { type: Number, default: 0, min: 0 },
	retrieval: { type: Boolean, default: true },
	confidenceGap: { type: Number, default: 0, min: 0, max: 100 },
	diagnostic: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true })

learningAttemptSchema.index({ userId: 1, conceptId: 1, createdAt: -1 })
module.exports = mongoose.model('LearningAttempt', learningAttemptSchema)
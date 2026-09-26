const mongoose = require('mongoose')

const conceptMasterySchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
	conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true, index: true },
	currentScore: { type: Number, default: 0, min: 0, max: 100 },
	previousScore: { type: Number, default: 0, min: 0, max: 100 },
	scoreDelta: { type: Number, default: 0, min: -100, max: 100 },
	confidenceScore: { type: Number, default: 0, min: 0, max: 100 },
	retentionScore: { type: Number, default: 0, min: 0, max: 100 },
	reasoningScore: { type: Number, default: 0, min: 0, max: 100 },
	attemptCount: { type: Number, default: 0, min: 0 },
	lastReason: { type: String, default: '', maxlength: 500 },
	lastAttemptAt: { type: Date, default: null },
	lastReviewedAt: { type: Date, default: null },
}, { timestamps: true })

conceptMasterySchema.index({ userId: 1, conceptId: 1 }, { unique: true })
module.exports = mongoose.model('ConceptMastery', conceptMasterySchema)
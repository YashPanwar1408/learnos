const mongoose = require('mongoose')

const misconceptionSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
	conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true, index: true },
	attemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningAttempt', required: true },
	description: { type: String, required: true, maxlength: 2000 },
	evidence: { type: String, required: true, maxlength: 3000 },
	severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
	resolvedAt: { type: Date, default: null },
}, { timestamps: true })

misconceptionSchema.index({ userId: 1, conceptId: 1, createdAt: -1 })
module.exports = mongoose.model('Misconception', misconceptionSchema)
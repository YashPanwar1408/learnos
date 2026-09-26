const mongoose = require('mongoose')

const userLearningProfileSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
	preferredExplanationFormat: { type: String, enum: ['text', 'example', 'analogy', 'visual', 'socratic'], default: 'text' },
	preferredLanguage: { type: String, default: 'en', maxlength: 12 },
	questionsAttempted: { type: Number, default: 0, min: 0 },
	questionsCorrect: { type: Number, default: 0, min: 0 },
	questionsIncorrect: { type: Number, default: 0, min: 0 },
	explanationsGenerated: { type: Number, default: 0, min: 0 },
	explanationsUnderstood: { type: Number, default: 0, min: 0 },
	missionsCompleted: { type: Number, default: 0, min: 0 },
	conceptsMastered: { type: Number, default: 0, min: 0 },
	conceptsRequiringReview: { type: Number, default: 0, min: 0 },
	averageResponseTimeMs: { type: Number, default: 0, min: 0 },
	averageHintUsage: { type: Number, default: 0, min: 0 },
	averageRetryFrequency: { type: Number, default: 0, min: 0 },
}, { timestamps: true })

module.exports = mongoose.model('UserLearningProfile', userLearningProfileSchema)
const mongoose = require('mongoose')

const confidenceRecordSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
	conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true, index: true },
	attemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningAttempt', required: true },
	confidence: { type: Number, required: true, min: 0, max: 100 },
	understanding: { type: Number, required: true, min: 0, max: 100 },
	gap: { type: Number, required: true, min: 0, max: 100 },
	calibrationLabel: { type: String, enum: ['well_calibrated', 'possible_illusion_of_understanding', 'underconfident'], required: true },
}, { timestamps: true })

confidenceRecordSchema.index({ userId: 1, conceptId: 1, createdAt: -1 })
module.exports = mongoose.model('ConfidenceRecord', confidenceRecordSchema)
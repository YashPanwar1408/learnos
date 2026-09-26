const mongoose = require('mongoose')

const reviewScheduleSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
	conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true, index: true },
	missionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningMission', default: null, index: true },
	lastAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningAttempt', default: null },
	previousMisconception: { type: String, default: '', maxlength: 2000 },
	previousQuestion: { type: String, default: '', maxlength: 4000 },
	intervalDays: { type: Number, default: 1, min: 0 },
	reviewAt: { type: Date, required: true, index: true },
	confidencePrediction: { type: Number, default: 0, min: 0, max: 100 },
}, { timestamps: true })

reviewScheduleSchema.index({ userId: 1, reviewAt: 1 })
module.exports = mongoose.model('ReviewSchedule', reviewScheduleSchema)
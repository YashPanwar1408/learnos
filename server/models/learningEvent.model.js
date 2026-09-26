const mongoose = require('mongoose')

const learningEventSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
	conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null, index: true },
	missionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningMission', default: null, index: true },
	type: { type: String, required: true, maxlength: 80, index: true },
	data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true })

learningEventSchema.index({ userId: 1, createdAt: -1 })
module.exports = mongoose.model('LearningEvent', learningEventSchema)
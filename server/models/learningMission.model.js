const mongoose = require('mongoose')

const phases = ['diagnose', 'learn', 'guided_practice', 'independent_practice', 'transfer', 'explain', 'verify', 'review']
const learningMissionSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
	conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true, index: true },
	title: { type: String, required: true, maxlength: 200 },
	goalScore: { type: Number, default: 80, min: 0, max: 100 },
	startScore: { type: Number, default: 0, min: 0, max: 100 },
	currentPhase: { type: String, enum: phases, default: 'diagnose' },
	completedPhases: { type: [String], default: [] },
	status: { type: String, enum: ['active', 'completed', 'paused'], default: 'active', index: true },
	completedAt: { type: Date, default: null },
}, { timestamps: true })

learningMissionSchema.index({ userId: 1, conceptId: 1, status: 1 })
module.exports = mongoose.model('LearningMission', learningMissionSchema)
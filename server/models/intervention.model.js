const mongoose = require('mongoose')

const interventionSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
	conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true, index: true },
	missionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningMission', default: null, index: true },
	type: { type: String, enum: ['direct_explanation', 'socratic_question', 'analogy', 'worked_example', 'visual_explanation', 'counterexample', 'easier_prerequisite', 'targeted_practice', 'challenge_problem', 'retrieval_question', 'real_world_application'], required: true },
	reason: { type: String, required: true, maxlength: 1000 },
	instruction: { type: String, required: true, maxlength: 4000 },
	difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
	successCriteria: { type: String, required: true, maxlength: 1000 },
	completedAt: { type: Date, default: null },
}, { timestamps: true })

interventionSchema.index({ userId: 1, conceptId: 1, createdAt: -1 })
module.exports = mongoose.model('Intervention', interventionSchema)
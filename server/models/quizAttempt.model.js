const mongoose = require('mongoose')

const attemptAnswerSchema = new mongoose.Schema(
	{
		questionId: {
			type: mongoose.Schema.Types.ObjectId,
			required: true,
		},
		selectedOptionIndex: {
			type: Number,
			required: true,
			min: 0,
			max: 3,
		},
		correctOptionIndex: {
			type: Number,
			required: true,
			min: 0,
			max: 3,
		},
		isCorrect: {
			type: Boolean,
			required: true,
		},
	},
	{ _id: false }
)

const quizAttemptSchema = new mongoose.Schema(
	{
		quizId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Quiz',
			required: true,
			index: true,
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		answers: {
			type: [attemptAnswerSchema],
			required: true,
			default: [],
		},
		score: {
			type: Number,
			required: true,
			min: 0,
		},
		total: {
			type: Number,
			required: true,
			min: 0,
		},
		percentage: {
			type: Number,
			required: true,
			min: 0,
			max: 100,
		},
		submittedAt: {
			type: Date,
			required: true,
			default: Date.now,
		},
	},
	{ timestamps: true }
)

quizAttemptSchema.index({ quizId: 1, userId: 1, submittedAt: -1 })

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema)

const mongoose = require('mongoose')

const quizQuestionSchema = new mongoose.Schema(
	{
		question: {
			type: String,
			required: [true, 'Question is required'],
			trim: true,
			minlength: 1,
			maxlength: 1200,
		},
		difficulty: {
			type: String,
			enum: ['easy', 'medium', 'hard'],
			required: false,
			default: 'medium',
		},
		options: {
			type: [String],
			required: true,
			validate: {
				validator: (arr) => Array.isArray(arr) && arr.length === 4 && arr.every((s) => typeof s === 'string' && s.trim().length > 0),
				message: 'Options must be an array of 4 non-empty strings',
			},
		},
		correctOptionIndex: {
			type: Number,
			required: [true, 'Correct option index is required'],
			min: 0,
			max: 3,
		},
		correctAnswer: {
			type: String,
			required: [true, 'Correct answer is required'],
			trim: true,
			minlength: 1,
			maxlength: 600,
		},
		explanation: {
			type: String,
			required: [true, 'Explanation is required'],
			trim: true,
			minlength: 1,
			maxlength: 2400,
		},
	},
	{ _id: true }
)

const quizSchema = new mongoose.Schema(
	{
		topic: {
			type: String,
			required: false,
			trim: true,
			maxlength: 120,
			default: null,
		},
		title: {
			type: String,
			required: [true, 'Title is required'],
			trim: true,
			minlength: 1,
			maxlength: 120,
		},
		targetDifficulty: {
			type: String,
			enum: ['easy', 'medium', 'hard'],
			required: false,
			default: null,
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		source: {
			documentId: {
				type: mongoose.Schema.Types.ObjectId,
				required: false,
			},
			documentTitle: {
				type: String,
				trim: true,
				maxlength: 120,
				default: null,
			},
		},
		questions: {
			type: [quizQuestionSchema],
			required: true,
			validate: {
				validator: (arr) => Array.isArray(arr) && arr.length > 0 && arr.length <= 50,
				message: 'Quiz must have between 1 and 50 questions',
			},
		},
	},
	{ timestamps: true }
)

module.exports = mongoose.model('Quiz', quizSchema)

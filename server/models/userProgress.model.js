const mongoose = require('mongoose')

const topicProgressSchema = new mongoose.Schema(
	{
		topic: {
			type: String,
			required: true,
			trim: true,
			maxlength: 120,
		},
		strength: {
			type: Number,
			required: true,
			min: 0,
			max: 100,
			default: 0,
		},
		difficultyLevel: {
			type: String,
			enum: ['easy', 'medium', 'hard'],
			required: true,
			default: 'easy',
		},
		attempts: {
			type: Number,
			required: true,
			min: 0,
			default: 0,
		},
		lastPercentage: {
			type: Number,
			required: true,
			min: 0,
			max: 100,
			default: 0,
		},
		updatedAt: {
			type: Date,
			required: true,
			default: Date.now,
		},
	},
	{ _id: false }
)

const userProgressSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			unique: true,
		},
		topics: {
			type: [topicProgressSchema],
			required: true,
			default: [],
		},
	},
	{ timestamps: true }
)

module.exports = mongoose.model('UserProgress', userProgressSchema)

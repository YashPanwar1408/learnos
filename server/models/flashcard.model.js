const mongoose = require('mongoose')

const flashcardSchema = new mongoose.Schema(
	{
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
				default: null,
			},
			documentTitle: {
				type: String,
				trim: true,
				maxlength: 120,
				default: null,
			},
		},
		question: {
			type: String,
			required: [true, 'Question is required'],
			trim: true,
			minlength: 1,
			maxlength: 2000,
		},
		answer: {
			type: String,
			required: [true, 'Answer is required'],
			trim: true,
			minlength: 1,
			maxlength: 4000,
		},

		// Review metadata
		lastRating: {
			type: String,
			enum: ['easy', 'medium', 'hard', null],
			default: null,
		},
		repetitions: {
			type: Number,
			required: true,
			min: 0,
			default: 0,
		},
		intervalDays: {
			type: Number,
			required: true,
			min: 0,
			default: 0,
		},
		easeFactor: {
			type: Number,
			required: true,
			min: 1.3,
			max: 3.0,
			default: 2.5,
		},
		lastReviewedAt: {
			type: Date,
			required: false,
			default: null,
		},
		nextReviewAt: {
			type: Date,
			required: true,
			index: true,
		},
	},
	{ timestamps: true }
)

flashcardSchema.index({ userId: 1, nextReviewAt: 1 })

module.exports = mongoose.model('Flashcard', flashcardSchema)

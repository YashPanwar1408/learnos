const mongoose = require('mongoose')

const lessonSchema = new mongoose.Schema(
	{
		lesson_title: {
			type: String,
			required: true,
			trim: true,
			minlength: 1,
			maxlength: 160,
		},
		content: {
			type: String,
			required: true,
			trim: true,
			minlength: 1,
			maxlength: 20000,
		},
		key_points: {
			type: [String],
			required: true,
			default: [],
			validate: {
				validator: (arr) => Array.isArray(arr) && arr.length > 0,
				message: 'key_points is required',
			},
		},
		examples: {
			type: [String],
			required: false,
			default: [],
		},
		common_mistakes: {
			type: [String],
			required: false,
			default: [],
		},
	},
	{ _id: false }
)

const moduleSchema = new mongoose.Schema(
	{
		module_title: {
			type: String,
			required: true,
			trim: true,
			minlength: 1,
			maxlength: 160,
		},
		lessons: {
			type: [lessonSchema],
			required: true,
			default: [],
			validate: {
				validator: (arr) => Array.isArray(arr) && arr.length > 0,
				message: 'lessons is required',
			},
		},
	},
	{ _id: false }
)

const courseSchema = new mongoose.Schema(
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
			topic: {
				type: String,
				trim: true,
				maxlength: 200,
				default: null,
			},
		},
		description: {
			type: String,
			trim: true,
			maxlength: 4000,
			default: null,
		},
		course_title: {
			type: String,
			required: true,
			trim: true,
			minlength: 1,
			maxlength: 200,
		},
		modules: {
			type: [moduleSchema],
			required: true,
			default: [],
			validate: {
				validator: (arr) => Array.isArray(arr) && arr.length > 0,
				message: 'modules is required',
			},
		},
	},
	{ timestamps: true }
)

courseSchema.index({ userId: 1, createdAt: -1 })
courseSchema.index({ 'source.documentId': 1, userId: 1, createdAt: -1 })

module.exports = mongoose.model('Course', courseSchema)

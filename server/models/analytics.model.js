const mongoose = require('mongoose')

const topicStatSchema = new mongoose.Schema(
	{
		topic: { type: String, required: true, trim: true, maxlength: 120 },
		attempts: { type: Number, required: true, min: 0 },
		averagePercentage: { type: Number, required: true, min: 0, max: 100 },
	},
	{ _id: false }
)

const timePointSchema = new mongoose.Schema(
	{
		date: { type: String, required: true },
		attempts: { type: Number, required: true, min: 0 },
		averagePercentage: { type: Number, required: true, min: 0, max: 100 },
	},
	{ _id: false }
)

const analyticsSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
		totalQuizzesAttempted: { type: Number, required: true, min: 0, default: 0 },
		averagePercentage: { type: Number, required: true, min: 0, max: 100, default: 0 },
		strongTopics: { type: [topicStatSchema], required: true, default: [] },
		weakTopics: { type: [topicStatSchema], required: true, default: [] },
		topicStats: { type: [topicStatSchema], required: true, default: [] },
		timeSeries: { type: [timePointSchema], required: true, default: [] },
		computedAt: { type: Date, required: true, default: Date.now },
	},
	{ timestamps: true }
)

module.exports = mongoose.model('Analytics', analyticsSchema)

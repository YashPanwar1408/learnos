const mongoose = require('mongoose')

const activitySchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
		type: {
			type: String,
			required: true,
			trim: true,
			maxlength: 64,
			index: true,
		},
		label: {
			type: String,
			required: true,
			trim: true,
			maxlength: 240,
		},
		meta: { type: Object, default: {} },
	},
	{ timestamps: true }
)

activitySchema.index({ userId: 1, createdAt: -1 })

module.exports = mongoose.model('Activity', activitySchema)

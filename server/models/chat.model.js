const mongoose = require('mongoose')

const chatMessageSchema = new mongoose.Schema(
	{
		role: {
			type: String,
			enum: ['user', 'assistant'],
			required: true,
		},
		content: {
			type: String,
			required: true,
			trim: true,
			minlength: 1,
			maxlength: 20000,
		},
		createdAt: {
			type: Date,
			required: true,
			default: Date.now,
		},
	},
	{ _id: false }
)

const chatSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		documentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Document',
			required: true,
			index: true,
		},
		messages: {
			type: [chatMessageSchema],
			required: true,
			default: [],
		},
	},
	{ timestamps: true }
)

chatSchema.index({ userId: 1, documentId: 1 }, { unique: true })

module.exports = mongoose.model('Chat', chatSchema)

const mongoose = require('mongoose')

const documentSchema = new mongoose.Schema(
	{
		title: {
			type: String,
			required: [true, 'Title is required'],
			trim: true,
			minlength: 1,
			maxlength: 120,
		},
		fileUrl: {
			type: String,
			required: [true, 'File URL is required'],
			trim: true,
		},
		cloudinaryPublicId: {
			type: String,
			trim: true,
			default: null,
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
	},
	{ timestamps: true }
)

module.exports = mongoose.model('Document', documentSchema)

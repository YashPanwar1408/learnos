const mongoose = require('mongoose')

const paymentSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		amount: {
			// Stored in INR rupees (e.g., 99, 499, 999)
			type: Number,
			required: true,
			min: 1,
		},
		tokensAdded: {
			type: Number,
			required: true,
			min: 1,
		},
		razorpay_order_id: {
			type: String,
			required: true,
			trim: true,
			unique: true,
			index: true,
		},
		razorpay_payment_id: {
			type: String,
			required: false,
			trim: true,
			default: null,
		},
		status: {
			type: String,
			enum: ['created', 'success', 'failed'],
			required: true,
			default: 'created',
			index: true,
		},
		planType: {
			type: String,
			enum: ['starter', 'pro', 'premium'],
			required: true,
		},
	},
	{ timestamps: true }
)

module.exports = mongoose.model('Payment', paymentSchema)

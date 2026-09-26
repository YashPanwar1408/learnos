const Payment = require('../models/payment.model')
const User = require('../models/user.model')
const { getRazorpayClient, getTokenPack, verifyRazorpaySignature } = require('../services/razorpay.service')

function sanitizeUser(userDoc) {
	return {
		id: userDoc._id,
		name: userDoc.name,
		email: userDoc.email,
		tokens: Number.isFinite(userDoc.tokens) ? userDoc.tokens : 0,
		plan: typeof userDoc.plan === 'string' && userDoc.plan ? userDoc.plan : 'free',
		totalTokensUsed: Number.isFinite(userDoc.totalTokensUsed) ? userDoc.totalTokensUsed : 0,
	}
}

function makeReceipt({ userId, planType }) {
	// Razorpay constraint: receipt length must be <= 40 characters.
	const plan = String(planType || '').trim().toLowerCase()
	const abbr = plan === 'starter' ? 'st' : plan === 'pro' ? 'pro' : plan === 'premium' ? 'pm' : 'na'
	const uid = String(userId || '').trim().slice(-6) || 'user'
	const ts = Date.now().toString(36)
	const rand = Math.random().toString(36).slice(2, 6)
	const receipt = `alp_${abbr}_${uid}_${ts}_${rand}`
	return receipt.length <= 40 ? receipt : receipt.slice(0, 40)
}

async function createOrder(req, res) {
	try {
		const { planType } = req.body || {}
		const pack = getTokenPack(planType)
		if (!pack) {
			return res.status(400).json({ message: 'Invalid planType. Use starter, pro, or premium.' })
		}

		const razorpay = getRazorpayClient()
		const amountPaise = Math.trunc(pack.amountRupees * 100)
		const currency = 'INR'

		const order = await razorpay.orders.create({
			amount: amountPaise,
			currency,
			receipt: makeReceipt({ userId: req.user._id, planType: pack.planType }),
			notes: {
				userId: String(req.user._id),
				planType: pack.planType,
				tokens: String(pack.tokens),
			},
		})

		await Payment.create({
			userId: req.user._id,
			amount: pack.amountRupees,
			tokensAdded: pack.tokens,
			razorpay_order_id: order.id,
			status: 'created',
			planType: pack.planType,
		})

		return res.status(201).json({
			orderId: order.id,
			amount: order.amount,
			currency: order.currency,
			tokensAdded: pack.tokens,
			planType: pack.planType,
		})
	} catch (error) {
		const status = Number(error?.status) || Number(error?.statusCode)
		const description =
			typeof error?.error?.description === 'string'
				? error.error.description
				: typeof error?.description === 'string'
					? error.description
					: ''
		const message = description || error?.message || 'Request failed'
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			return res.status(status).json({ message })
		}
		console.error('[payment] Create order error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function verifyPayment(req, res) {
	try {
		const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {}

		if (
			!razorpay_order_id ||
			typeof razorpay_order_id !== 'string' ||
			!razorpay_payment_id ||
			typeof razorpay_payment_id !== 'string' ||
			!razorpay_signature ||
			typeof razorpay_signature !== 'string'
		) {
			return res.status(400).json({ message: 'Invalid payment verification payload' })
		}

		const payment = await Payment.findOne({
			razorpay_order_id,
			userId: req.user._id,
		})

		if (!payment) {
			return res.status(404).json({ message: 'Payment order not found' })
		}

		const isValid = verifyRazorpaySignature({
			orderId: razorpay_order_id,
			paymentId: razorpay_payment_id,
			signature: razorpay_signature,
		})

		if (!isValid) {
			await Payment.updateOne(
				{ _id: payment._id, status: { $ne: 'success' } },
				{ $set: { status: 'failed', razorpay_payment_id } }
			)
			return res.status(400).json({ message: 'Invalid payment signature' })
		}

		if (payment.status === 'success') {
			const freshUser = await User.findById(req.user._id)
			return res.status(200).json({
				message: 'Payment already verified',
				user: sanitizeUser(freshUser || req.user),
			})
		}

		// Mark order verified first to avoid double-crediting under retries.
		const verified = await Payment.findOneAndUpdate(
			{ _id: payment._id, status: 'created' },
			{ $set: { status: 'success', razorpay_payment_id } },
			{ new: true }
		)

		if (!verified) {
			const freshUser = await User.findById(req.user._id)
			return res.status(200).json({
				message: 'Payment already verified',
				user: sanitizeUser(freshUser || req.user),
			})
		}

		const planType = verified.planType
		const pack = getTokenPack(planType)
		const tokensToAdd = Number.isFinite(verified.tokensAdded) ? verified.tokensAdded : pack?.tokens || 0
		if (!tokensToAdd || tokensToAdd <= 0) {
			return res.status(500).json({ message: 'Server misconfigured: invalid token pack' })
		}

		// Credit tokens.
		await User.updateOne({ _id: req.user._id }, { $inc: { tokens: tokensToAdd } })

		// Upgrade plan if applicable (never downgrade).
		if (planType === 'premium') {
			await User.updateOne({ _id: req.user._id }, { $set: { plan: 'premium' } })
		} else if (planType === 'pro') {
			await User.updateOne({ _id: req.user._id, plan: { $ne: 'premium' } }, { $set: { plan: 'pro' } })
		}

		const updatedUser = await User.findById(req.user._id)
		return res.status(200).json({
			message: 'Payment verified',
			user: sanitizeUser(updatedUser || req.user),
			addedTokens: tokensToAdd,
		})
	} catch (error) {
		console.error('[payment] Verify error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = {
	createOrder,
	verifyPayment,
}

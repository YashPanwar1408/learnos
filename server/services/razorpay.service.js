const crypto = require('crypto')
const Razorpay = require('razorpay')

const TOKEN_PACKS = {
	starter: { amountRupees: 99, tokens: 100, plan: 'free' },
	pro: { amountRupees: 499, tokens: 700, plan: 'pro' },
	premium: { amountRupees: 999, tokens: 2000, plan: 'premium' },
}

let cachedClient = null

function getRazorpayClient() {
	const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim()
	const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim()
	if (!keyId || !keySecret) {
		const err = new Error('Razorpay is not configured (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET)')
		err.status = 500
		throw err
	}

	if (!cachedClient) {
		cachedClient = new Razorpay({
			key_id: keyId,
			key_secret: keySecret,
		})
	}

	return cachedClient
}

function getTokenPack(planType) {
	const plan = typeof planType === 'string' ? planType.trim().toLowerCase() : ''
	if (!plan || !(plan in TOKEN_PACKS)) return null
	return { planType: plan, ...TOKEN_PACKS[plan] }
}

function verifyRazorpaySignature({ orderId, paymentId, signature }) {
	const secret = String(process.env.RAZORPAY_KEY_SECRET || '').trim()
	if (!secret) return false
	if (!orderId || !paymentId || !signature) return false

	const body = `${orderId}|${paymentId}`
	const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')

	try {
		const a = Buffer.from(expected, 'utf8')
		const b = Buffer.from(String(signature), 'utf8')
		if (a.length !== b.length) return false
		return crypto.timingSafeEqual(a, b)
	} catch {
		return false
	}
}

module.exports = {
	getRazorpayClient,
	getTokenPack,
	verifyRazorpaySignature,
}

const { debitTokens } = require('../services/tokenLedger.service')

function toPositiveInt(value) {
	const n = Number(value)
	if (!Number.isFinite(n)) return null
	const i = Math.trunc(n)
	if (i <= 0) return null
	return i
}

/**
 * Deduct tokens before performing an AI action.
 *
 * Usage: router.post('/chat', consumeTokens(2, { action: 'chat' }), handler)
 */
function consumeTokens(cost, opts = {}) {
	const tokensCost = toPositiveInt(cost)
	const action = typeof opts?.action === 'string' ? opts.action : undefined

	return async function consumeTokensMiddleware(req, res, next) {
		try {
			if (!tokensCost) return next()
			if (!req.user?._id) return res.status(401).json({ message: 'Not authorized' })

			const { user: updatedUser } = await debitTokens({ userId: req.user._id, cost: tokensCost, action })
			if (updatedUser) {
				req.user = updatedUser
				res.locals.tokensRemaining = Number(updatedUser.tokens) || 0
				res.locals.plan = updatedUser.plan
				res.locals.totalTokensUsed = Number(updatedUser.totalTokensUsed) || 0
			}
			return next()
		} catch (error) {
			const status = Number(error?.status)
			if (status === 402 && error?.data) {
				return res.status(402).json(error.data)
			}
			console.error('[tokens] Middleware error:', error)
			return res.status(500).json({ message: 'Server error' })
		}
	}
}

module.exports = { consumeTokens }

const User = require('../models/user.model')

function toPositiveInt(value) {
	const n = Number(value)
	if (!Number.isFinite(n)) return null
	const i = Math.trunc(n)
	if (i <= 0) return null
	return i
}

function createHttpError(status, message, data) {
	const err = new Error(message)
	err.status = status
	if (data && typeof data === 'object') err.data = data
	return err
}

async function debitTokens({ userId, cost, action }) {
	const tokensCost = toPositiveInt(cost)
	if (!tokensCost) return { user: null, tokensCost: 0 }

	const updatedUser = await User.findOneAndUpdate(
		{ _id: userId, tokens: { $gte: tokensCost } },
		{ $inc: { tokens: -tokensCost, totalTokensUsed: tokensCost } },
		{ new: true }
	)

	if (!updatedUser) {
		const cur = await User.findById(userId).select('tokens').lean()
		const currentTokens = Number.isFinite(cur?.tokens) ? Number(cur.tokens) : 0
		throw createHttpError(402, 'Insufficient tokens', {
			message: 'Insufficient tokens',
			requiredTokens: tokensCost,
			currentTokens,
			...(typeof action === 'string' && action ? { action } : {}),
		})
	}

	return { user: updatedUser, tokensCost }
}

async function creditTokens({ userId, cost }) {
	const tokensCost = toPositiveInt(cost)
	if (!tokensCost) return null
	const updatedUser = await User.findByIdAndUpdate(
		userId,
		{ $inc: { tokens: tokensCost, totalTokensUsed: -tokensCost } },
		{ new: true }
	)
	return updatedUser
}

module.exports = {
	debitTokens,
	creditTokens,
}

function setTokenLocals(res, user) {
	if (!res || !user) return
	res.locals.tokensRemaining = Number(user.tokens) || 0
	res.locals.plan = user.plan
	res.locals.totalTokensUsed = Number(user.totalTokensUsed) || 0
}

module.exports = { setTokenLocals }

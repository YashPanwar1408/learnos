const jwt = require('jsonwebtoken')

const User = require('../models/user.model')

async function protect(req, res, next) {
	try {
		const authHeader = req.headers.authorization
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return res.status(401).json({ message: 'Not authorized' })
		}

		const token = authHeader.split(' ')[1]
		const secret = process.env.JWT_SECRET
		if (!secret) {
			return res.status(500).json({ message: 'Server misconfigured' })
		}

		const decoded = jwt.verify(token, secret)
		if (!decoded || typeof decoded !== 'object' || !decoded.id) {
			return res.status(401).json({ message: 'Not authorized' })
		}

		const user = await User.findById(decoded.id)
		if (!user) {
			return res.status(401).json({ message: 'Not authorized' })
		}

		// Backfill token fields for legacy users created before tokens were introduced.
		let shouldSave = false
		if (!Number.isFinite(user.tokens)) {
			user.tokens = 50
			shouldSave = true
		}
		if (typeof user.plan !== 'string' || !user.plan) {
			user.plan = 'free'
			shouldSave = true
		}
		if (!Number.isFinite(user.totalTokensUsed)) {
			user.totalTokensUsed = 0
			shouldSave = true
		}
		if (user.role !== 'teacher' && user.role !== 'student') {
			user.role = 'student'
			shouldSave = true
		}
		if (shouldSave) {
			await user.save()
		}

		req.user = user
		return next()
	} catch (error) {
		return res.status(401).json({ message: 'Not authorized' })
	}
}

function requireTeacher(req, res, next) {
	if (req.user?.role !== 'teacher') return res.status(403).json({ message: 'Teacher access required' })
	return next()
}

module.exports = { protect, requireTeacher }

const jwt = require('jsonwebtoken')

const User = require('../models/user.model')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function signToken(userId) {
	const secret = process.env.JWT_SECRET
	if (!secret) {
		throw new Error('JWT_SECRET is not set')
	}

	return jwt.sign({ id: userId }, secret, { expiresIn: '7d' })
}

function sanitizeUser(userDoc) {
	return {
		id: userDoc._id,
		name: userDoc.name,
		email: userDoc.email,
		tokens: Number.isFinite(userDoc.tokens) ? userDoc.tokens : 50,
		plan: typeof userDoc.plan === 'string' && userDoc.plan ? userDoc.plan : 'free',
		totalTokensUsed: Number.isFinite(userDoc.totalTokensUsed) ? userDoc.totalTokensUsed : 0,
		role: userDoc.role === 'teacher' ? 'teacher' : 'student',
	}
}

async function register(req, res) {
	try {
		const { name, email, password } = req.body || {}

		if (!name || typeof name !== 'string' || name.trim().length < 2) {
			return res.status(400).json({ message: 'Name is required' })
		}
		if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
			return res.status(400).json({ message: 'Valid email is required' })
		}
		if (!password || typeof password !== 'string' || password.length < 6) {
			return res.status(400).json({ message: 'Password must be at least 6 characters' })
		}

		const normalizedEmail = email.toLowerCase().trim()
		const existingUser = await User.findOne({ email: normalizedEmail })
		if (existingUser) {
			return res.status(409).json({ message: 'Email is already registered' })
		}

		const user = await User.create({
			name: name.trim(),
			email: normalizedEmail,
			password,
		})

		const token = signToken(user._id)
		return res.status(201).json({ token, user: sanitizeUser(user) })
	} catch (error) {
		if (error?.code === 11000) {
			return res.status(409).json({ message: 'Email is already registered' })
		}
		console.error('[auth] Register error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function login(req, res) {
	try {
		const { email, password } = req.body || {}

		if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
			return res.status(400).json({ message: 'Valid email is required' })
		}
		if (!password || typeof password !== 'string') {
			return res.status(400).json({ message: 'Password is required' })
		}

		const normalizedEmail = email.toLowerCase().trim()
		const user = await User.findOne({ email: normalizedEmail }).select('+password')
		if (!user) {
			return res.status(401).json({ message: 'Invalid credentials' })
		}

		const isMatch = await user.comparePassword(password)
		if (!isMatch) {
			return res.status(401).json({ message: 'Invalid credentials' })
		}

		const token = signToken(user._id)
		return res.status(200).json({ token, user: sanitizeUser(user) })
	} catch (error) {
		console.error('[auth] Login error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = {
	register,
	login,
}

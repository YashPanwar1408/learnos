const Activity = require('../models/activity.model')

async function getRecentActivity(req, res) {
	try {
		const limitRaw = Number(req.query?.limit)
		const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.trunc(limitRaw))) : 8

		const items = await Activity.find({ userId: req.user._id })
			.sort({ createdAt: -1 })
			.limit(limit)
			.select('type label meta createdAt')
			.lean()

		return res.status(200).json({ items })
	} catch (error) {
		console.error('[activity] Get recent error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = { getRecentActivity }

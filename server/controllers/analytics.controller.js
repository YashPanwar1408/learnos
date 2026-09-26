const { getOrComputeAnalytics } = require('../services/analytics.service')

async function getAnalytics(req, res) {
	try {
		const analytics = await getOrComputeAnalytics(req.user._id)
		return res.status(200).json({ analytics })
	} catch (error) {
		console.error('[analytics] Get error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = { getAnalytics }

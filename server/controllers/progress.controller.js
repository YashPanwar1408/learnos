const UserProgress = require('../models/userProgress.model')
const { getTopicProgress } = require('../services/adaptiveLearning.service')

async function getProgress(req, res) {
	try {
		const doc = await UserProgress.findOne({ userId: req.user._id }).lean()
		return res.status(200).json({
			progress: doc || {
				userId: req.user._id,
				topics: [],
			},
		})
	} catch (error) {
		console.error('[progress] Get error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function getProgressForTopic(req, res) {
	try {
		const topic = typeof req.query?.topic === 'string' ? req.query.topic : ''
		if (!topic.trim()) {
			return res.status(400).json({ message: 'topic is required' })
		}

		const p = await getTopicProgress({ userId: req.user._id, topic })
		return res.status(200).json({ progress: p })
	} catch (error) {
		console.error('[progress] Topic error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = {
	getProgress,
	getProgressForTopic,
}

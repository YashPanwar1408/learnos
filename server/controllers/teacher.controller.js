const ConceptMastery = require('../models/conceptMastery.model')
const Misconception = require('../models/misconception.model')
const User = require('../models/user.model')

async function getTeacherOverview(req, res) {
	try {
		const [students, mastery, misconceptions] = await Promise.all([
			User.countDocuments({ role: 'student' }),
			ConceptMastery.aggregate([
				{ $lookup: { from: 'concepts', localField: 'conceptId', foreignField: '_id', as: 'concept' } },
				{ $unwind: { path: '$concept', preserveNullAndEmptyArrays: true } },
				{ $group: { _id: '$conceptId', name: { $first: { $ifNull: ['$concept.name', 'Unknown concept'] } }, averageMastery: { $avg: '$currentScore' }, learners: { $sum: 1 } } },
				{ $sort: { averageMastery: 1 } },
				{ $limit: 20 },
			]),
			Misconception.aggregate([
				{ $match: { resolvedAt: null } },
				{ $group: { _id: '$description', affectedStudents: { $addToSet: '$userId' }, severity: { $max: '$severity' } } },
				{ $project: { _id: 0, description: '$_id', affectedStudents: { $size: '$affectedStudents' }, severity: 1 } },
				{ $sort: { affectedStudents: -1 } },
				{ $limit: 10 },
			]),
		])
		const learning = mastery.filter((item) => item.averageMastery < 80).reduce((sum, item) => sum + item.learners, 0)
		return res.status(200).json({ overview: { students, learning, struggling: mastery.filter((item) => item.averageMastery < 55).reduce((sum, item) => sum + item.learners, 0), onTrack: Math.max(0, students - learning), topics: mastery, misconceptions } })
	} catch (error) {
		console.error('[teacher] Overview error:', error)
		return res.status(500).json({ message: 'Unable to load teacher overview' })
	}
}

module.exports = { getTeacherOverview }
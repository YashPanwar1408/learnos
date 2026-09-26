const Course = require('../models/course.model')

async function listCourses(req, res) {
	try {
		const courses = await Course.find({ userId: req.user._id })
			.select('_id course_title description source createdAt updatedAt')
			.sort({ createdAt: -1 })
			.lean()
		return res.status(200).json({ courses })
	} catch (error) {
		console.error('[courses] List error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function getCourseById(req, res) {
	try {
		const id = req.params.id
		if (!id) return res.status(400).json({ message: 'id is required' })

		const course = await Course.findOne({ _id: id, userId: req.user._id })
			.select('_id course_title description modules source createdAt updatedAt')
			.lean()
		if (!course) return res.status(404).json({ message: 'Course not found' })
		return res.status(200).json({ course })
	} catch (error) {
		console.error('[courses] Get error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function deleteCourse(req, res) {
	try {
		const id = req.params.id
		if (!id) return res.status(400).json({ message: 'id is required' })

		const course = await Course.findOne({ _id: id, userId: req.user._id }).select('_id').lean()
		if (!course) return res.status(404).json({ message: 'Course not found' })

		await Course.deleteOne({ _id: id, userId: req.user._id })
		return res.status(200).json({ message: 'Deleted' })
	} catch (error) {
		console.error('[courses] Delete error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = { listCourses, getCourseById, deleteCourse }

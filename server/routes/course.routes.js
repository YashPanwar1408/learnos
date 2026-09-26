const express = require('express')

const { protect } = require('../middleware/auth.middleware')
const { getCourseById, listCourses, deleteCourse } = require('../controllers/course.controller')

const router = express.Router()

router.use(protect)

router.get('/', listCourses)
router.get('/:id', getCourseById)
router.delete('/:id', deleteCourse)

module.exports = router

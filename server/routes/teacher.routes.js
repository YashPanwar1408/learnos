const express = require('express')
const { protect, requireTeacher } = require('../middleware/auth.middleware')
const { getTeacherOverview } = require('../controllers/teacher.controller')

const router = express.Router()
router.use(protect, requireTeacher)
router.get('/overview', getTeacherOverview)

module.exports = router
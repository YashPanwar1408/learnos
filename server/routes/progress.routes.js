const express = require('express')

const { protect } = require('../middleware/auth.middleware')
const { getProgress, getProgressForTopic } = require('../controllers/progress.controller')

const router = express.Router()

router.use(protect)

router.get('/', getProgress)
router.get('/topic', getProgressForTopic)

module.exports = router

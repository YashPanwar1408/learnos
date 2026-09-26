const express = require('express')

const { protect } = require('../middleware/auth.middleware')
const { getLearnerToday } = require('../controllers/learner.controller')

const router = express.Router()

router.use(protect)
router.get('/today', getLearnerToday)

module.exports = router
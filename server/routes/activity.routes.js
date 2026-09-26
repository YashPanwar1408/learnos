const express = require('express')

const { protect } = require('../middleware/auth.middleware')
const { getRecentActivity } = require('../controllers/activity.controller')

const router = express.Router()

router.use(protect)
router.get('/recent', getRecentActivity)

module.exports = router

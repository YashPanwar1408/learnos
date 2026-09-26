const express = require('express')

const { protect } = require('../middleware/auth.middleware')
const { getAnalytics } = require('../controllers/analytics.controller')

const router = express.Router()

router.use(protect)
router.get('/', getAnalytics)

module.exports = router

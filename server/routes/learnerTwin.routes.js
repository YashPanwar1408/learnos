const express = require('express')
const { protect } = require('../middleware/auth.middleware')
const { getTwin, getInsights } = require('../controllers/learning.controller')

const router = express.Router()
router.use(protect)
router.get('/', getTwin)
router.get('/insights', getInsights)

module.exports = router
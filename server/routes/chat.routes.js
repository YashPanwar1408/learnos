const express = require('express')

const { protect } = require('../middleware/auth.middleware')
const { chat, getChatHistory } = require('../controllers/chat.controller')

const router = express.Router()

router.use(protect)

router.get('/:documentId', getChatHistory)
router.post('/', chat)

module.exports = router

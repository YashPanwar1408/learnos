const express = require('express')

const { protect } = require('../middleware/auth.middleware')
const { generateQuiz, listQuizzesByDocument, submitQuiz, getQuizById } = require('../controllers/quiz.controller')

const router = express.Router()

router.use(protect)

router.post('/generate', generateQuiz)
router.post('/submit', submitQuiz)
router.get('/id/:id', getQuizById)
router.get('/:documentId', listQuizzesByDocument)

module.exports = router

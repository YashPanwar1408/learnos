const express = require('express')

const { protect } = require('../middleware/auth.middleware')
const { generateFlashcards, listFlashcards, listFlashcardsByDocument, reviewFlashcard, getSchedule } = require('../controllers/flashcard.controller')

const router = express.Router()

router.use(protect)

router.post('/generate', generateFlashcards)
router.get('/schedule', getSchedule)
router.get('/:documentId', listFlashcardsByDocument)
router.get('/', listFlashcards)
router.put('/review', reviewFlashcard)

module.exports = router

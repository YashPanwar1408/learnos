const express = require('express')

const { protect } = require('../middleware/auth.middleware')
const {
	explainConcept,
	generateCourse,
	generateCustomCourse,
	generateKnowledgeGraph,
	generatePracticeLab,
	generateSummary,
	generateStudyPlan,
	performanceAnalysis,
} = require('../controllers/ai.controller')

const router = express.Router()

router.use(protect)

router.post('/summary', generateSummary)
router.post('/explain', explainConcept)
router.post('/study-plan', generateStudyPlan)
router.post('/course', generateCourse)
router.post('/custom-course', generateCustomCourse)
router.post('/practice-lab', generatePracticeLab)
router.post('/knowledge-graph', generateKnowledgeGraph)
router.post('/performance-analysis', performanceAnalysis)

module.exports = router

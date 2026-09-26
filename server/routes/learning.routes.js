const express = require('express')
const { protect } = require('../middleware/auth.middleware')
const controller = require('../controllers/learning.controller')

const router = express.Router()
router.use(protect)
router.post('/diagnose', controller.diagnose)
router.post('/intervention', controller.createIntervention)
router.post('/attempt', controller.recordAttempt)
router.get('/mastery', controller.getMastery)
router.post('/mission', controller.createMission)
router.get('/mission', controller.listMissions)
router.post('/mission/:id/advance', controller.advanceMission)
router.get('/review', controller.getReviews)
router.get('/learner-twin', controller.getTwin)
router.get('/learner-twin/insights', controller.getInsights)

module.exports = router
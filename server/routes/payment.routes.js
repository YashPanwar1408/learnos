const express = require('express')

const { protect } = require('../middleware/auth.middleware')
const { createOrder, verifyPayment } = require('../controllers/payment.controller')

const router = express.Router()

router.use(protect)

router.post('/create-order', createOrder)
router.post('/verify', verifyPayment)

module.exports = router

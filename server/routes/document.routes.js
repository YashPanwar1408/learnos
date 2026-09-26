const express = require('express')
const multer = require('multer')

const { protect } = require('../middleware/auth.middleware')
const { deleteDocument, getDocumentById, listDocuments, uploadDocument, viewDocumentInline } = require('../controllers/document.controller')

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_FILE_SIZE_BYTES },
	fileFilter: (req, file, cb) => {
		const isPdfMime = file.mimetype === 'application/pdf'
		const hasPdfExt = typeof file.originalname === 'string' && file.originalname.toLowerCase().endsWith('.pdf')

		if (!isPdfMime && !hasPdfExt) {
			return cb(new Error('Only PDF files are allowed'))
		}

		return cb(null, true)
	},
})

const router = express.Router()

// View PDF in browser tab (uses query token or Bearer token)
router.get('/:id/view', viewDocumentInline)

router.use(protect)

router.get('/', listDocuments)
router.get('/:id', getDocumentById)
router.post('/upload', upload.single('file'), uploadDocument)
router.delete('/:id', deleteDocument)

module.exports = router

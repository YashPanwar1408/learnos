const { Readable } = require('node:stream')
const jwt = require('jsonwebtoken')

const Document = require('../models/document.model')
const Flashcard = require('../models/flashcard.model')
const Quiz = require('../models/quiz.model')
const User = require('../models/user.model')
const { initCloudinary } = require('../config/cloudinary')
const { logActivity } = require('../utils/activity')

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

function uploadPdfBufferToCloudinary({ buffer, filename, userId }) {
	const cloudinary = initCloudinary()

	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{
				resource_type: 'raw',
				folder: 'documents',
				public_id: `${userId}-${Date.now()}-${filename.replace(/\.[^/.]+$/, '')}`,
				use_filename: false,
				unique_filename: true,
			},
			(error, result) => {
				if (error) return reject(error)
				return resolve(result)
			}
		)

		Readable.from(buffer).pipe(uploadStream)
	})
}

async function uploadDocument(req, res) {
	try {
		const { title } = req.body || {}
		if (!title || typeof title !== 'string' || title.trim().length === 0) {
			return res.status(400).json({ message: 'Title is required' })
		}

		if (!req.file) {
			return res.status(400).json({ message: 'PDF file is required' })
		}

		if (req.file.size > MAX_FILE_SIZE_BYTES) {
			return res.status(413).json({ message: 'File too large' })
		}

		const uploadResult = await uploadPdfBufferToCloudinary({
			buffer: req.file.buffer,
			filename: req.file.originalname || 'document.pdf',
			userId: String(req.user._id),
		})

		const fileUrl = uploadResult?.secure_url || uploadResult?.url
		const cloudinaryPublicId = uploadResult?.public_id || null
		if (!fileUrl) {
			return res.status(500).json({ message: 'Upload failed' })
		}

		const doc = await Document.create({
			title: title.trim(),
			fileUrl,
			cloudinaryPublicId,
			userId: req.user._id,
		})

		await logActivity(req.user._id, {
			type: 'document_uploaded',
			label: `Uploaded document: ${doc.title}`,
			meta: { documentId: String(doc._id) },
		})

		return res.status(201).json({ document: doc })
	} catch (error) {
		const message = error?.message || error
		if (typeof message === 'string' && message.toLowerCase().includes('cloudinary env vars')) {
			return res.status(500).json({ message: 'Server misconfigured' })
		}

		console.error('[documents] Upload error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function listDocuments(req, res) {
	try {
		const docs = await Document.find({ userId: req.user._id })
			.sort({ createdAt: -1 })
			.select('title fileUrl cloudinaryPublicId createdAt updatedAt')
			.lean()

		const docIds = docs.map((d) => d._id)
		const [flashcardCounts, quizCounts] = await Promise.all([
			Flashcard.aggregate([
				{ $match: { userId: req.user._id, 'source.documentId': { $in: docIds } } },
				{ $group: { _id: '$source.documentId', count: { $sum: 1 } } },
			]),
			Quiz.aggregate([
				{ $match: { userId: req.user._id, 'source.documentId': { $in: docIds } } },
				{ $group: { _id: '$source.documentId', count: { $sum: 1 } } },
			]),
		])

		const flashMap = new Map(flashcardCounts.map((r) => [String(r._id), r.count]))
		const quizMap = new Map(quizCounts.map((r) => [String(r._id), r.count]))

		const enriched = docs.map((d) => ({
			...d,
			flashcardCount: flashMap.get(String(d._id)) || 0,
			quizCount: quizMap.get(String(d._id)) || 0,
		}))

		return res.status(200).json({ documents: enriched })
	} catch (error) {
		console.error('[documents] List error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function getDocumentById(req, res) {
	try {
		const { id } = req.params
		if (!id) {
			return res.status(400).json({ message: 'Document id is required' })
		}

		const doc = await Document.findOne({ _id: id, userId: req.user._id })
			.select('title fileUrl cloudinaryPublicId createdAt updatedAt')
			.lean()
		if (!doc) {
			return res.status(404).json({ message: 'Document not found' })
		}

		const [flashcardCount, quizCount] = await Promise.all([
			Flashcard.countDocuments({ userId: req.user._id, 'source.documentId': doc._id }),
			Quiz.countDocuments({ userId: req.user._id, 'source.documentId': doc._id }),
		])

		return res.status(200).json({
			document: {
				...doc,
				flashcardCount,
				quizCount,
			},
		})
	} catch (error) {
		console.error('[documents] Get error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

async function deleteDocument(req, res) {
	try {
		const { id } = req.params
		if (!id) {
			return res.status(400).json({ message: 'Document id is required' })
		}

		const doc = await Document.findOne({ _id: id, userId: req.user._id })
		if (!doc) {
			return res.status(404).json({ message: 'Document not found' })
		}

		const publicId = doc.cloudinaryPublicId
		if (publicId) {
			try {
				const cloudinary = initCloudinary()
				await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' })
			} catch (error) {
				console.error('[documents] Cloudinary delete error:', error?.message || error)
			}
		}

		await doc.deleteOne()
		return res.status(200).json({ message: 'Deleted' })
	} catch (error) {
		console.error('[documents] Delete error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

function sanitizeFileName(name) {
	return String(name || '')
		.replace(/[\\/:*?"<>|]/g, '_')
		.replace(/[\u0000-\u001F]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
}

async function viewDocumentInline(req, res) {
	try {
		const { id } = req.params
		if (!id) {
			return res.status(400).json({ message: 'Document id is required' })
		}

	const authHeader = req.headers.authorization
	const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
	const token = bearer || String(req.query?.token || '')
	if (!token) {
		return res.status(401).json({ message: 'Not authorized' })
	}

	const secret = process.env.JWT_SECRET
	if (!secret) {
		return res.status(500).json({ message: 'Server misconfigured' })
	}

	let decoded
	try {
		decoded = jwt.verify(token, secret)
	} catch {
		return res.status(401).json({ message: 'Not authorized' })
	}
	if (!decoded || typeof decoded !== 'object' || !decoded.id) {
		return res.status(401).json({ message: 'Not authorized' })
	}

	const user = await User.findById(decoded.id).select('_id').lean()
	if (!user) {
		return res.status(401).json({ message: 'Not authorized' })
	}

	const doc = await Document.findOne({ _id: id, userId: user._id }).lean()
	if (!doc) {
		return res.status(404).json({ message: 'Document not found' })
	}

	if (typeof fetch !== 'function') {
		return res.status(500).json({ message: 'Server misconfigured' })
	}

	const upstream = await fetch(doc.fileUrl)
	if (!upstream.ok) {
		return res.status(502).json({ message: 'Failed to fetch PDF' })
	}

	const base = sanitizeFileName(doc.title || 'document') || 'document'
	const filename = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`

	res.setHeader('Content-Type', 'application/pdf')
	res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`)
	res.setHeader('X-Content-Type-Options', 'nosniff')

	const body = upstream.body
	if (!body) {
		return res.status(502).json({ message: 'Empty PDF response' })
	}

	// Node 18+ fetch returns a web stream.
	Readable.fromWeb(body).pipe(res)
	return
	} catch (error) {
		console.error('[documents] View error:', error)
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = { uploadDocument, listDocuments, getDocumentById, deleteDocument, viewDocumentInline }

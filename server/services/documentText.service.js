const pdfParseModule = require('pdf-parse')

const Document = require('../models/document.model')

const CACHE_TTL_MS = 15 * 60 * 1000

/** @type {Map<string, { text: string, expiresAt: number }>} */
const textCache = new Map()

async function fetchPdfBuffer(fileUrl) {
	const fetchFn =
		typeof fetch === 'function'
			? fetch
			: // eslint-disable-next-line no-undef
				require('node-fetch')

	const res = await fetchFn(fileUrl)
	if (!res.ok) {
		const err = new Error(`Failed to fetch PDF (${res.status})`)
		err.status = 502
		throw err
	}
	const arr = await res.arrayBuffer()
	return Buffer.from(arr)
}

function normalizeText(text) {
	return String(text || '')
		.replace(/\r\n/g, '\n')
		.replace(/[\u0000-\u001F\u007F]/g, (m) => (m === '\n' || m === '\t' ? m : ' '))
		.replace(/\s+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/[ \t]{2,}/g, ' ')
		.trim()
}

async function extractTextFromPdfBuffer(buffer) {
	// pdf-parse has multiple export shapes depending on version/bundling:
	// - Classic: module itself is a function
	// - ESM interop: module.default is a function
	// - Newer builds: module.PDFParse is a class with getText()
	if (typeof pdfParseModule === 'function') {
		const data = await pdfParseModule(buffer)
		return normalizeText(data?.text || '')
	}

	if (typeof pdfParseModule?.default === 'function') {
		const data = await pdfParseModule.default(buffer)
		return normalizeText(data?.text || '')
	}

	if (typeof pdfParseModule?.PDFParse === 'function') {
		const parser = new pdfParseModule.PDFParse({ data: buffer })
		try {
			const out = await parser.getText()
			const text = typeof out === 'string' ? out : out?.text
			return normalizeText(text || '')
		} finally {
			if (typeof parser.destroy === 'function') {
				try {
					await parser.destroy()
				} catch (_) {
					// ignore
				}
			}
		}
	}

	throw new Error('pdf-parse is not configured correctly (no callable export found)')
}

async function getDocumentTextForUser({ userId, documentId, maxChars = 24000 }) {
	const cacheKey = `${String(userId)}:${String(documentId)}`
	const cached = textCache.get(cacheKey)
	if (cached && cached.expiresAt > Date.now()) {
		return cached.text.slice(0, maxChars)
	}

	const doc = await Document.findOne({ _id: documentId, userId }).select('fileUrl').lean()
	if (!doc) {
		const err = new Error('Document not found')
		err.status = 404
		throw err
	}

	const buffer = await fetchPdfBuffer(doc.fileUrl)
	const text = await extractTextFromPdfBuffer(buffer)

	textCache.set(cacheKey, { text, expiresAt: Date.now() + CACHE_TTL_MS })
	return text.slice(0, maxChars)
}

module.exports = { getDocumentTextForUser }

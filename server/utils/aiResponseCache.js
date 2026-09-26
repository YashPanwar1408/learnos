const crypto = require('node:crypto')

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 400

/** @type {Map<string, { value: any, expiresAt: number, createdAt: number }> } */
const cache = new Map()

function now() {
	return Date.now()
}

function stableStringify(value) {
	if (value === null || value === undefined) return ''
	if (typeof value === 'string') return value
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

function hashKey(parts) {
	const h = crypto.createHash('sha256')
	for (const part of parts) {
		h.update(stableStringify(part))
		h.update('\n')
	}
	return h.digest('hex')
}

function makeKey({ userId, documentId, documentUpdatedAt, action, promptOrTopic, format }) {
	return hashKey([
		String(userId || ''),
		String(documentId || ''),
		String(documentUpdatedAt || ''),
		String(action || ''),
		String(format || ''),
		String(promptOrTopic || ''),
	])
}

function prune() {
	const t = now()
	for (const [k, v] of cache.entries()) {
		if (!v || v.expiresAt <= t) cache.delete(k)
	}
	if (cache.size <= MAX_ENTRIES) return

	// Remove oldest entries first.
	const entries = Array.from(cache.entries())
	entries.sort((a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0))
	const toRemove = cache.size - MAX_ENTRIES
	for (let i = 0; i < toRemove; i++) {
		cache.delete(entries[i][0])
	}
}

function getCachedAiResponse(cacheKey) {
	const item = cache.get(cacheKey)
	if (!item) return null
	if (item.expiresAt <= now()) {
		cache.delete(cacheKey)
		return null
	}
	return item.value
}

function setCachedAiResponse(cacheKey, value, ttlMs = DEFAULT_TTL_MS) {
	const t = now()
	cache.set(cacheKey, {
		value,
		expiresAt: t + Math.max(1000, Number(ttlMs) || DEFAULT_TTL_MS),
		createdAt: t,
	})
	prune()
}

module.exports = {
	makeKey,
	getCachedAiResponse,
	setCachedAiResponse,
}

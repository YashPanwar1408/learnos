function pickWindow(text, start, length) {
	const safeText = String(text || '')
	const total = safeText.length
	if (!total) return ''
	const winLen = Math.max(0, Math.trunc(length))
	const s = Math.max(0, Math.min(total - 1, Math.trunc(start)))
	const e = Math.min(total, s + winLen)
	return safeText.slice(s, e)
}

function buildStratifiedSample(text, { budgetChars = 12000, segments = 6 } = {}) {
	const safeText = String(text || '').trim()
	if (safeText.length <= budgetChars) return safeText

	const segs = Math.max(2, Math.min(12, Math.trunc(segments)))
	const windowLen = Math.max(800, Math.trunc(budgetChars / segs))
	const step = safeText.length / segs
	const parts = []
	for (let i = 0; i < segs; i += 1) {
		const start = Math.trunc(i * step)
		parts.push(pickWindow(safeText, start, windowLen))
	}
	return parts.filter(Boolean).join('\n\n---\n\n')
}

function buildTopicContext(text, topic, { budgetChars = 12000 } = {}) {
	const safeText = String(text || '')
	const q = String(topic || '').trim()
	if (!safeText.trim()) return ''
	if (!q) return buildStratifiedSample(safeText, { budgetChars })

	const lower = safeText.toLowerCase()
	const qLower = q.toLowerCase()
	const terms = Array.from(
		new Set(
			[qLower]
				.concat(qLower.split(/\s+/g).filter((t) => t.length >= 4))
				.map((t) => t.trim())
				.filter(Boolean)
		)
	)

	/** Collect multiple windows around multiple matches (better than a single indexOf). */
	const windows = []
	const seenStarts = new Set()
	const windowLen = Math.max(1200, Math.trunc(budgetChars / 3))
	const pad = Math.trunc(windowLen / 2)

	for (const term of terms) {
		let from = 0
		for (let hits = 0; hits < 6; hits += 1) {
			const idx = lower.indexOf(term, from)
			if (idx < 0) break
			const start = Math.max(0, idx - pad)
			from = idx + term.length
			const bucket = Math.trunc(start / 200) * 200
			if (seenStarts.has(bucket)) continue
			seenStarts.add(bucket)
			windows.push(pickWindow(safeText, start, windowLen))
			if (windows.join('\n').length >= budgetChars) break
		}
		if (windows.join('\n').length >= budgetChars) break
	}

	const combined = windows.filter(Boolean).join('\n\n---\n\n').trim()
	if (combined.length >= Math.max(600, Math.trunc(budgetChars * 0.4))) {
		return combined.slice(0, budgetChars)
	}

	// Fallback: stratified sample.
	return buildStratifiedSample(safeText, { budgetChars })
}

module.exports = { buildStratifiedSample, buildTopicContext }

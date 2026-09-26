const { generateGrokResponse } = require('./ai.service')

function extractJson(text) {
	if (typeof text !== 'string') return null
	const source = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
	try { return JSON.parse(source) } catch { /* continue */ }
	const start = source.indexOf('{')
	if (start < 0) return null
	let depth = 0
	let quoted = false
	let escaped = false
	for (let i = start; i < source.length; i += 1) {
		const char = source[i]
		if (quoted) {
			if (escaped) escaped = false
			else if (char === '\\') escaped = true
			else if (char === '"') quoted = false
			continue
		}
		if (char === '"') quoted = true
		else if (char === '{') depth += 1
		else if (char === '}' && --depth === 0) {
			try { return JSON.parse(source.slice(start, i + 1)) } catch { return null }
		}
	}
	return null
}

function validateDiagnostic(value) {
	if (!value || typeof value !== 'object') return null
	const severity = ['low', 'medium', 'high'].includes(value.severity) ? value.severity : 'medium'
	const number = (input) => Math.max(0, Math.min(100, Math.round(Number(input) || 0)))
	if (typeof value.isCorrect !== 'boolean') return null
	if (typeof value.misconceptionDetected !== 'boolean') return null
	if (typeof value.nextAction !== 'string' || !value.nextAction.trim()) return null
	return {
		isCorrect: value.isCorrect,
		reasoningQuality: number(value.reasoningQuality),
		confidence: number(value.confidence),
		misconceptionDetected: value.misconceptionDetected,
		misconception: typeof value.misconception === 'string' ? value.misconception.trim().slice(0, 2000) : '',
		evidence: typeof value.evidence === 'string' ? value.evidence.trim().slice(0, 3000) : '',
		severity,
		recommendedIntervention: typeof value.recommendedIntervention === 'string' ? value.recommendedIntervention.trim().slice(0, 1000) : 'Targeted practice',
		nextAction: value.nextAction.trim().slice(0, 1000),
	}
}

function fallbackDiagnostic({ isCorrect, confidence, studentExplanation }) {
	const explanationPresent = typeof studentExplanation === 'string' && studentExplanation.trim().length > 10
	return validateDiagnostic({
		isCorrect: Boolean(isCorrect),
		reasoningQuality: isCorrect ? (explanationPresent ? 70 : 50) : 25,
		confidence,
		misconceptionDetected: !isCorrect,
		misconception: isCorrect ? '' : 'The answer did not match the verified solution.',
		evidence: explanationPresent ? 'Student explanation was provided for review.' : 'No detailed explanation was provided.',
		recommendedIntervention: isCorrect ? 'Retrieval question' : 'Worked example',
		nextAction: isCorrect ? 'Explain the concept in your own words.' : 'Review the key idea, then retry a targeted question.',
	})
}

async function diagnoseAttempt(input) {
	const prompt = [
		'You are an educational diagnostic evaluator. Return JSON only.',
		'Never claim mastery. Evaluate only the evidence supplied.',
		'Required JSON keys: isCorrect boolean, reasoningQuality number 0-100, confidence number 0-100, misconceptionDetected boolean, misconception string, evidence string, severity low|medium|high, recommendedIntervention string, nextAction string.',
		`QUESTION: ${input.question}`,
		`CORRECT ANSWER: ${input.correctAnswer || 'Not supplied'}`,
		`STUDENT ANSWER: ${input.studentAnswer}`,
		`STUDENT EXPLANATION: ${input.studentExplanation || 'Not supplied'}`,
		`STUDENT CONFIDENCE: ${input.confidence}`,
		`CONCEPT: ${input.conceptContext || 'Unknown'}`,
		`PREVIOUS ATTEMPTS: ${JSON.stringify(input.previousAttempts || [])}`,
	].join('\n')
	for (let retry = 0; retry < 2; retry += 1) {
		try {
			const raw = await generateGrokResponse({ message: prompt, outputFormat: 'json', maxTokens: 900 })
			const parsed = validateDiagnostic(extractJson(raw))
			if (parsed) return parsed
		} catch (error) {
			if (retry === 1) console.warn('[learning] diagnostic unavailable:', error?.status || error?.message || 'provider error')
		}
	}
	return fallbackDiagnostic(input)
}

module.exports = { extractJson, validateDiagnostic, fallbackDiagnostic, diagnoseAttempt }
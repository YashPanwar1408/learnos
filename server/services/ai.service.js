function buildPrompt({ message, documentText, outputFormat = 'markdown' }) {
	const trimmedMessage = String(message || '').trim()
	const trimmedContext = typeof documentText === 'string' ? documentText.trim() : ''
	const fmt = outputFormat === 'json' ? 'json' : 'markdown'

	if (!trimmedContext) {
		return fmt === 'json'
			? [
				'You are a helpful assistant.',
				'Return STRICT JSON only. No markdown, no backticks, no code fences, no extra commentary.',
				'',
				'USER MESSAGE:',
				trimmedMessage,
			].join('\n')
			: `User message:\n${trimmedMessage}`
	}

	return [
		'You are a helpful assistant. Use ONLY the provided document context when answering questions about the document.',
		...(fmt === 'json'
			? ['Return STRICT JSON only. No markdown, no backticks, no code fences, no extra commentary.']
			: [
				'Output MUST be Markdown. Do not output HTML tags like <br> or <div>.',
				'If you include math, use LaTeX with $...$ for inline and $$...$$ for display.',
			]),
		'',
		'DOCUMENT CONTEXT (may be partial):',
		'```',
		trimmedContext,
		'```',
		'',
		'USER MESSAGE:',
		trimmedMessage,
		'',
		'INSTRUCTIONS:',
		'- Answer using the context when applicable.',
		...(fmt === 'json' ? [] : ['- If the context is insufficient, say so and ask a clarifying question.']),
	].join('\n')
}

function getFetch() {
	return typeof fetch === 'function'
		? fetch
		: // eslint-disable-next-line no-undef
			require('node-fetch')
}

function parsePositiveInt(value, fallback) {
	const num = Number(value)
	return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback
}

function isRetriableStatus(status) {
	return status === 408 || status === 409 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function toProviderError(provider, message, status, cause) {
	const err = new Error(message)
	err.status = status
	err.provider = provider
	if (cause) err.cause = cause
	return err
}

function shouldFallbackOnError(error) {
	const status = Number(error?.status)
	if (status === 401 || status === 403) return false
	if (isRetriableStatus(status)) return true
	const msg = String(error?.message || '').toLowerCase()
	return msg.includes('timed out') || msg.includes('timeout') || msg.includes('rate limit')
}

function logProvider(provider, meta) {
	const enabledRaw = String(process.env.AI_LOG_PROVIDER || 'true').trim().toLowerCase()
	const enabled = !(enabledRaw === '0' || enabledRaw === 'false' || enabledRaw === 'no')
	if (!enabled) return
	try {
		const details = meta && typeof meta === 'object' ? ` ${JSON.stringify(meta)}` : ''
		// eslint-disable-next-line no-console
		console.log(`[ai] provider=${provider}${details}`)
	} catch {
		// eslint-disable-next-line no-console
		console.log(`[ai] provider=${provider}`)
	}
}

function hasNvidiaKey() {
	return Boolean(String(process.env.NVIDIA_API_KEY || '').trim())
}

function hasGeminiKey() {
	return Boolean(String(process.env.GEMINI_API_KEY || '').trim())
}

async function callGemini({ prompt, maxOut, outputFormat }) {
	const apiKey = String(process.env.GEMINI_API_KEY || '').trim()
	if (!apiKey) {
		throw new Error('GEMINI_API_KEY is not set')
	}
	const fetchFn = getFetch()
	const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim()
	const timeoutMs = parsePositiveInt(process.env.GEMINI_TIMEOUT_MS, 45000)

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
	let res
	try {
		res = await fetchFn(
			`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					contents: [{ role: 'user', parts: [{ text: prompt }] }],
					generationConfig: {
						temperature: outputFormat === 'json' ? 0.1 : 0.35,
						topP: 0.95,
						maxOutputTokens: Math.min(8192, Math.max(1, Math.trunc(maxOut))),
					},
				}),
				signal: controller.signal,
			}
		)
	} catch (error) {
		if (String(error?.name || '').toLowerCase().includes('abort') || String(error?.message || '').toLowerCase().includes('timeout')) {
			throw toProviderError('gemini', `Gemini request timed out after ${timeoutMs}ms`, 504, error)
		}
		throw toProviderError('gemini', 'Failed to reach Gemini API', 502, error)
	} finally {
		clearTimeout(timer)
	}

	if (!res.ok) {
		let details = ''
		try {
			details = await res.text()
		} catch {
			// ignore
		}
		throw toProviderError('gemini', String(details || '') || `Gemini API error (${res.status})`, res.status)
	}

	const data = await res.json()
	const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join('')
	return typeof text === 'string' ? text : ''
}

// New entry point: route certain tasks to Gemini.
// task values used: summary | explain | studyPlan | other
async function generateAiResponse({ task, message, documentText, maxTokens, outputFormat }) {
	const prompt = buildPrompt({ message, documentText, outputFormat })
	const maxOut = Number.isFinite(maxTokens) ? Math.max(1, Math.trunc(maxTokens)) : 1800

	// Groq-only: always use the Groq pipeline.
	return callGroq({ prompt, maxOut, outputFormat })
}

async function callGroq({ prompt, maxOut, outputFormat }) {
	const apiKey = String(process.env.GROQ_API_KEY || '').trim()
	if (!apiKey) {
		throw new Error('GROQ_API_KEY is not set')
	}
	const fetchFn = getFetch()
	const baseUrl = String(process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '')
	const model = String(process.env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim()
	const timeoutMs = parsePositiveInt(process.env.GROQ_TIMEOUT_MS, 60000)

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
	let res
	try {
		res = await fetchFn(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model,
				messages: [{ role: 'user', content: prompt }],
				temperature: outputFormat === 'json' ? 0.1 : 0.35,
				top_p: 0.95,
				max_tokens: maxOut,
			}),
			signal: controller.signal,
		})
	} catch (error) {
		if (String(error?.name || '').toLowerCase().includes('abort') || String(error?.message || '').toLowerCase().includes('timeout')) {
			throw toProviderError('groq', `Groq request timed out after ${timeoutMs}ms`, 504, error)
		}
		throw toProviderError('groq', 'Failed to reach Groq API', 502, error)
	} finally {
		clearTimeout(timer)
	}

	if (!res.ok) {
		let details = ''
		try {
			details = await res.text()
		} catch {
			// ignore
		}
		throw toProviderError('groq', String(details || '') || `Groq API error (${res.status})`, res.status)
	}

	const data = await res.json()
	const text = data?.choices?.[0]?.message?.content
	return typeof text === 'string' ? text : ''
}

async function callNvidiaKimi({ prompt, maxOut, outputFormat }) {
	const apiKey = String(process.env.NVIDIA_API_KEY || '').trim()
	if (!apiKey) {
		throw new Error('NVIDIA_API_KEY is not set')
	}
	const fetchFn = getFetch()
	const baseUrl = String(process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '')
	const model = String(process.env.NVIDIA_MODEL || 'qwen/qwen3.5-122b-a10b').trim()
	const timeoutMs = parsePositiveInt(process.env.NVIDIA_TIMEOUT_MS, 60000)
	const thinkingRaw = String(process.env.NVIDIA_THINKING || 'false').trim().toLowerCase()
	const thinking = thinkingRaw === '1' || thinkingRaw === 'true' || thinkingRaw === 'yes'

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
	let res
	try {
		res = await fetchFn(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify({
				model,
				messages: [{ role: 'user', content: prompt }],
				temperature: outputFormat === 'json' ? 0.1 : 0.5,
				top_p: 0.95,
				max_tokens: maxOut,
				stream: false,
				chat_template_kwargs: thinking ? { enable_thinking: true } : undefined,
			}),
			signal: controller.signal,
		})
	} catch (error) {
		if (String(error?.name || '').toLowerCase().includes('abort') || String(error?.message || '').toLowerCase().includes('timeout')) {
			throw toProviderError('nvidia', `NVIDIA request timed out after ${timeoutMs}ms`, 504, error)
		}
		throw toProviderError('nvidia', 'Failed to reach NVIDIA API', 502, error)
	} finally {
		clearTimeout(timer)
	}

	if (!res.ok) {
		let details = ''
		try {
			details = await res.text()
		} catch {
			// ignore
		}
		throw toProviderError('nvidia', String(details || '') || `NVIDIA API error (${res.status})`, res.status)
	}

	const data = await res.json()
	const text = data?.choices?.[0]?.message?.content
	return typeof text === 'string' ? text : ''
}

async function generateGrokResponse({ message, documentText, maxTokens, outputFormat }) {
	const prompt = buildPrompt({ message, documentText, outputFormat })
	const maxOut = Number.isFinite(maxTokens) ? Math.max(1, Math.trunc(maxTokens)) : 1800
	const out = await callGroq({ prompt, maxOut, outputFormat })
	logProvider('groq', { model: String(process.env.GROQ_MODEL || '').trim() || undefined })
	return out
}

module.exports = {
	generateGrokResponse,
	generateAiResponse,
}

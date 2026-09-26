const { generateGrokResponse, generateAiResponse } = require('../services/ai.service')
const Document = require('../models/document.model')
const Flashcard = require('../models/flashcard.model')
const { logActivity } = require('../utils/activity')
const Course = require('../models/course.model')
const { getDocumentTextForUser } = require('../services/documentText.service')
const { makeKey, getCachedAiResponse, setCachedAiResponse } = require('../utils/aiResponseCache')
const { buildStratifiedSample, buildTopicContext } = require('../services/textSampling.service')
const { calculateAnalyticsForUser } = require('../services/analytics.service')
const { debitTokens, creditTokens } = require('../services/tokenLedger.service')
const { setTokenLocals } = require('../utils/tokenLocals')
const { TOKEN_COSTS, costForCustomCourse } = require('../utils/tokenCosts')

function getProviderMessage(error) {
	const raw = typeof error?.message === 'string' ? error.message : ''
	if (!raw) return ''
	try {
		const parsed = JSON.parse(raw)
		const msg = parsed?.error?.message
		return typeof msg === 'string' ? msg : raw
	} catch {
		return raw
	}
}

function deriveKeyPointsFromContent(content) {
	const text = typeof content === 'string' ? content.trim() : ''
	if (!text) return []

	const lines = text
		.split(/\r?\n+/g)
		.map((l) => l.replace(/^\s*[-*•]\s+/, '').trim())
		.filter((l) => l.length >= 8)
	if (lines.length) return lines.slice(0, 6)

	const sentences = text
		.replace(/\s+/g, ' ')
		.split(/[.!?]+\s+/g)
		.map((s) => s.trim())
		.filter((s) => s.length >= 12)
	return sentences.slice(0, 6)
}

function enforceBulletSummaryMarkdown(markdown) {
	const raw = typeof markdown === 'string' ? markdown : ''
	const trimmed = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
	if (!trimmed) return ''

	const lines = trimmed.split('\n')
	const out = []
	let paragraphLines = []

	function pushParagraphAsBullets() {
		if (!paragraphLines.length) return
		const paragraph = paragraphLines.join(' ').replace(/\s+/g, ' ').trim()
		paragraphLines = []
		if (!paragraph) return
		const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph]
		for (const s of sentences) {
			const bullet = String(s || '').trim()
			if (!bullet) continue
			out.push(`- ${bullet}`)
		}
	}

	for (const line of lines) {
		const t = String(line || '')
		if (!t.trim()) {
			pushParagraphAsBullets()
			out.push('')
			continue
		}

		if (/^#{1,6}\s+/.test(t.trim())) {
			pushParagraphAsBullets()
			out.push(t.trim())
			continue
		}

		const bulletMatch = t.match(/^(\s*)[-*\u2022]\s+(.*)$/)
		if (bulletMatch) {
			pushParagraphAsBullets()
			const indent = bulletMatch[1] || ''
			const body = String(bulletMatch[2] || '').trim()
			if (body) out.push(`${indent}- ${body}`)
			continue
		}

		const numberedMatch = t.match(/^(\s*)\d+\.\s+(.*)$/)
		if (numberedMatch) {
			pushParagraphAsBullets()
			const indent = numberedMatch[1] || ''
			const body = String(numberedMatch[2] || '').trim()
			if (body) out.push(`${indent}- ${body}`)
			continue
		}

		paragraphLines.push(t.trim())
	}
	pushParagraphAsBullets()

	const flattened = out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
	if (!flattened) return ''
	if (/^##\s+/m.test(flattened)) return flattened
	return `## Overview\n${flattened}`
}

function normalizeCourse(payload, opts = {}) {
	const maxModules = Number.isFinite(opts?.maxModules) ? Math.max(1, Math.trunc(opts.maxModules)) : 6
	const maxLessons = Number.isFinite(opts?.maxLessons) ? Math.max(1, Math.trunc(opts.maxLessons)) : 3
	const maxKeyPoints = Number.isFinite(opts?.maxKeyPoints) ? Math.max(1, Math.trunc(opts.maxKeyPoints)) : 12
	const maxListItems = Number.isFinite(opts?.maxListItems) ? Math.max(1, Math.trunc(opts.maxListItems)) : 10

	const container = payload?.course && typeof payload.course === 'object' ? payload.course : payload
	const course_title =
		typeof container?.course_title === 'string'
			? container.course_title.trim()
			: typeof container?.courseTitle === 'string'
				? container.courseTitle.trim()
				: typeof container?.title === 'string'
					? container.title.trim()
					: typeof payload?.course_title === 'string'
						? payload.course_title.trim()
						: typeof payload?.courseTitle === 'string'
							? payload.courseTitle.trim()
							: typeof payload?.title === 'string'
								? payload.title.trim()
								: ''
	const modulesRaw = Array.isArray(container?.modules)
		? container.modules
		: Array.isArray(container?.Modules)
			? container.Modules
			: Array.isArray(container?.sections)
				? container.sections
				: Array.isArray(container?.chapters)
					? container.chapters
					: []

	const description =
		typeof container?.description === 'string'
			? container.description.trim()
			: typeof payload?.description === 'string'
				? payload.description.trim()
				: ''

	const modules = []
	for (const m of modulesRaw) {
		const module_title =
			typeof m?.module_title === 'string'
				? m.module_title.trim()
				: typeof m?.moduleTitle === 'string'
					? m.moduleTitle.trim()
					: typeof m?.chapter_title === 'string'
						? m.chapter_title.trim()
						: typeof m?.chapterTitle === 'string'
							? m.chapterTitle.trim()
					: typeof m?.title === 'string'
						? m.title.trim()
						: ''

		const lessonsRaw = Array.isArray(m?.lessons)
			? m.lessons
			: Array.isArray(m?.Lessons)
				? m.Lessons
				: Array.isArray(m?.items)
					? m.items
					: Array.isArray(m?.topics)
						? m.topics
						: Array.isArray(m?.content)
							? m.content
						: []

		const lessons = []
		for (const l of lessonsRaw) {
			// Some models return lessons as strings; treat as content-only.
			const lessonObj = typeof l === 'string' ? { lesson_title: '', content: l, key_points: [], examples: [], common_mistakes: [] } : l
			const lesson_title =
				typeof lessonObj?.lesson_title === 'string'
					? lessonObj.lesson_title.trim()
					: typeof lessonObj?.lessonTitle === 'string'
						? lessonObj.lessonTitle.trim()
						: typeof lessonObj?.title === 'string'
							? lessonObj.title.trim()
							: ''
			const content =
				typeof lessonObj?.content === 'string'
					? lessonObj.content.trim()
					: typeof lessonObj?.text === 'string'
						? lessonObj.text.trim()
						: typeof lessonObj?.notes === 'string'
							? lessonObj.notes.trim()
							: ''
			const keyPointsRaw = Array.isArray(lessonObj?.key_points)
				? lessonObj.key_points
				: Array.isArray(lessonObj?.keyPoints)
					? lessonObj.keyPoints
					: Array.isArray(lessonObj?.key_takeaways)
						? lessonObj.key_takeaways
						: Array.isArray(lessonObj?.takeaways)
							? lessonObj.takeaways
							: typeof lessonObj?.key_points === 'string'
								? lessonObj.key_points
								: typeof lessonObj?.keyPoints === 'string'
									? lessonObj.keyPoints
									: ''
			let key_points = Array.isArray(keyPointsRaw)
				? keyPointsRaw.map((p) => String(p ?? '').trim()).filter(Boolean)
				: typeof keyPointsRaw === 'string'
					? keyPointsRaw
						.split(/\r?\n|,|;|\u2022|\u2023|\u25E6|\u2043|\u2219|\t+/g)
						.map((p) => p.trim())
						.filter(Boolean)
					: []
			key_points = key_points.slice(0, maxKeyPoints)

			const toStringList = (value) => {
				if (Array.isArray(value)) return value.map((x) => String(x ?? '').trim()).filter(Boolean)
				if (typeof value === 'string') {
					return value
						.split(/\r?\n|,|;|\u2022|\u2023|\u25E6|\u2043|\u2219|\t+/g)
						.map((x) => x.trim())
						.filter(Boolean)
				}
				return []
			}

			let examples = toStringList(lessonObj?.examples ?? lessonObj?.example ?? lessonObj?.real_world_examples).slice(0, maxListItems)
			let common_mistakes = toStringList(lessonObj?.common_mistakes ?? lessonObj?.commonMistakes ?? lessonObj?.mistakes).slice(0, maxListItems)

			if (!key_points.length) key_points = deriveKeyPointsFromContent(content).slice(0, Math.min(8, maxKeyPoints))

			const finalTitle = lesson_title || `Lesson ${lessons.length + 1}`
			if (!content) continue
			if (!key_points.length) key_points = deriveKeyPointsFromContent(content).slice(0, Math.min(8, maxKeyPoints))
			// Ensure arrays are always present for frontend rendering.
			if (!Array.isArray(examples)) examples = []
			if (!Array.isArray(common_mistakes)) common_mistakes = []
			lessons.push({ lesson_title: finalTitle, content, key_points, examples, common_mistakes })
			if (lessons.length >= maxLessons) break
		}

		if (!module_title || lessons.length === 0) continue
		modules.push({ module_title, lessons })
		if (modules.length >= maxModules) break
	}

	if (!course_title || modules.length === 0) return null
	return { course_title, description, modules }
}

function normalizePracticeLab(payload) {
	const container = (() => {
		if (Array.isArray(payload)) return { list: payload }
		if (!payload || typeof payload !== 'object') return { obj: null }
		const candidates = [payload, payload.practice_lab, payload.practiceLab, payload.lab, payload.data, payload.result, payload.output]
		for (const c of candidates) {
			if (c && typeof c === 'object') return { obj: c }
		}
		return { obj: payload }
	})()

	let raw = []
	if ('list' in container && Array.isArray(container.list)) {
		raw = container.list
	} else {
		const obj = container.obj
		if (Array.isArray(obj?.problems)) raw = obj.problems
		else if (Array.isArray(obj?.questions)) raw = obj.questions
		else if (Array.isArray(obj?.items)) raw = obj.items
		else if (Array.isArray(obj?.tasks)) raw = obj.tasks
		else if (obj?.problems && typeof obj.problems === 'object') {
			// Sometimes grouped by difficulty.
			const easy = Array.isArray(obj.problems.Easy) ? obj.problems.Easy : Array.isArray(obj.problems.easy) ? obj.problems.easy : []
			const medium = Array.isArray(obj.problems.Medium) ? obj.problems.Medium : Array.isArray(obj.problems.medium) ? obj.problems.medium : []
			const hard = Array.isArray(obj.problems.Hard) ? obj.problems.Hard : Array.isArray(obj.problems.hard) ? obj.problems.hard : []
			raw = [
				...easy.map((p) => ({ ...(p || {}), difficulty: 'Easy' })),
				...medium.map((p) => ({ ...(p || {}), difficulty: 'Medium' })),
				...hard.map((p) => ({ ...(p || {}), difficulty: 'Hard' })),
			]
		} else if (obj?.by_difficulty && typeof obj.by_difficulty === 'object') {
			const easy = Array.isArray(obj.by_difficulty.Easy) ? obj.by_difficulty.Easy : Array.isArray(obj.by_difficulty.easy) ? obj.by_difficulty.easy : []
			const medium = Array.isArray(obj.by_difficulty.Medium)
				? obj.by_difficulty.Medium
				: Array.isArray(obj.by_difficulty.medium)
					? obj.by_difficulty.medium
					: []
			const hard = Array.isArray(obj.by_difficulty.Hard) ? obj.by_difficulty.Hard : Array.isArray(obj.by_difficulty.hard) ? obj.by_difficulty.hard : []
			raw = [
				...easy.map((p) => ({ ...(p || {}), difficulty: 'Easy' })),
				...medium.map((p) => ({ ...(p || {}), difficulty: 'Medium' })),
				...hard.map((p) => ({ ...(p || {}), difficulty: 'Hard' })),
			]
		} else {
			// Sometimes top-level keys.
			const easy = Array.isArray(obj?.Easy) ? obj.Easy : Array.isArray(obj?.easy) ? obj.easy : []
			const medium = Array.isArray(obj?.Medium) ? obj.Medium : Array.isArray(obj?.medium) ? obj.medium : []
			const hard = Array.isArray(obj?.Hard) ? obj.Hard : Array.isArray(obj?.hard) ? obj.hard : []
			if (easy.length || medium.length || hard.length) {
				raw = [
					...easy.map((p) => ({ ...(p || {}), difficulty: 'Easy' })),
					...medium.map((p) => ({ ...(p || {}), difficulty: 'Medium' })),
					...hard.map((p) => ({ ...(p || {}), difficulty: 'Hard' })),
				]
			}
		}
	}
	const problems = []
	for (let i = 0; i < raw.length; i += 1) {
		const p = raw[i]
		if (!p || typeof p !== 'object') continue
		const difficulty = normalizeDifficulty(p?.difficulty) || normalizeDifficulty(p?.level) || (i < 3 ? 'Easy' : i < 6 ? 'Medium' : 'Hard')
		const question = typeof p?.question === 'string' ? p.question.trim() : ''
		const solution =
			typeof p?.solution === 'string'
				? p.solution.trim()
				: typeof p?.answer === 'string'
					? p.answer.trim()
					: typeof p?.final_answer === 'string'
						? p.final_answer.trim()
						: typeof p?.finalAnswer === 'string'
							? p.finalAnswer.trim()
						: ''
		let explanation = typeof p?.explanation === 'string' ? p.explanation.trim() : ''
		if (!explanation) explanation = typeof p?.reasoning === 'string' ? p.reasoning.trim() : ''
		if (!explanation) explanation = solution
		if (!difficulty || !question || !solution) continue
		problems.push({ difficulty, question, solution, explanation })
		if (problems.length >= 15) break
	}
	if (!problems.length) return null

	return { problems }
}

function parseChapters(value) {
	if (Array.isArray(value)) {
		return value.map((c) => String(c ?? '').trim()).filter(Boolean).slice(0, 20)
	}
	if (typeof value === 'string') {
		return value
			.split(/\r?\n|,|;|\u2022|\u2023|\u25E6|\u2043|\u2219|\t+/g)
			.map((c) => c.trim())
			.filter(Boolean)
			.slice(0, 20)
	}
	return []
}

function normalizeKnowledgeGraph(payload) {
	const container = (() => {
		if (!payload || typeof payload !== 'object') return null
		const candidates = [payload, payload.graph, payload.knowledgeGraph, payload.knowledge_graph, payload.data, payload.result, payload.output]
		for (const c of candidates) {
			if (c && typeof c === 'object') return c
		}
		return payload
	})()

	const nodesRaw =
		Array.isArray(container?.nodes)
			? container.nodes
			: Array.isArray(container?.Nodes)
				? container.Nodes
				: Array.isArray(container?.concepts)
					? container.concepts
					: Array.isArray(container?.topics)
						? container.topics
						: Array.isArray(container?.vertices)
							? container.vertices
							: []
	const edgesRaw =
		Array.isArray(container?.edges)
			? container.edges
			: Array.isArray(container?.Edges)
				? container.Edges
				: Array.isArray(container?.relationships)
					? container.relationships
					: Array.isArray(container?.links)
						? container.links
						: Array.isArray(container?.connections)
							? container.connections
							: []

	const toNodeId = (n) => {
		if (typeof n === 'string' || typeof n === 'number') return String(n).trim()
		if (n && typeof n === 'object') {
			const candidate = n.id ?? n.label ?? n.name ?? n.title
			return String(candidate ?? '').trim()
		}
		return ''
	}

	const nodesSeed = Array.isArray(nodesRaw) ? nodesRaw.slice() : []
	if (!nodesSeed.length && Array.isArray(edgesRaw) && edgesRaw.length) {
		for (const e of edgesRaw) {
			if (!e || typeof e !== 'object') continue
			const s = toNodeId(e?.source ?? e?.from ?? e?.a ?? e?.start ?? e?.u)
			const t = toNodeId(e?.target ?? e?.to ?? e?.b ?? e?.end ?? e?.v)
			if (s) nodesSeed.push({ id: s })
			if (t) nodesSeed.push({ id: t })
			if (nodesSeed.length >= 120) break
		}
	}

	// Dedupe nodes case-insensitively and keep names short/clear.
	const canonicalByLower = new Map()
	for (const n of nodesSeed) {
		const id = toNodeId(n)
		if (!id) continue
		const trimmed = id.replace(/\s+/g, ' ').trim().slice(0, 80)
		if (!trimmed) continue
		const key = trimmed.toLowerCase()
		if (!canonicalByLower.has(key)) canonicalByLower.set(key, trimmed)
		if (canonicalByLower.size >= 80) break
	}

	const nodes = Array.from(canonicalByLower.values()).map((id) => ({ id }))
	if (!nodes.length) return null

	const nodeIdByLower = new Map(Array.from(canonicalByLower.entries()))
	const edges = []
	for (const e of edgesRaw) {
		if (!e || typeof e !== 'object') continue
		const sourceRaw = toNodeId(e?.source ?? e?.from ?? e?.a ?? e?.start ?? e?.u)
		const targetRaw = toNodeId(e?.target ?? e?.to ?? e?.b ?? e?.end ?? e?.v)
		const labelRaw =
			typeof e?.label === 'string'
				? e.label.trim()
				: typeof e?.relation === 'string'
					? e.relation.trim()
					: typeof e?.type === 'string'
						? e.type.trim()
						: 'related'
		if (!sourceRaw || !targetRaw) continue
		const source = nodeIdByLower.get(sourceRaw.toLowerCase())
		const target = nodeIdByLower.get(targetRaw.toLowerCase())
		if (!source || !target) continue
		if (source === target) continue
		edges.push({ source, target, label: labelRaw.slice(0, 40) })
		if (edges.length >= 160) break
	}

	// If model forgot edges, still return nodes-only graph.
	return { nodes, edges }
}

function stripUpgradeLink(message) {
	if (!message) return message
	const idx = message.indexOf('Need more tokens?')
	return idx >= 0 ? message.slice(0, idx).trim() : message
}

function extractRetryAfterSeconds(message) {
	if (typeof message !== 'string' || !message) return undefined
	const m = message.match(/try again in\s+(\d+(?:\.\d+)?)s\b/i)
	if (!m) return undefined
	const n = Number(m[1])
	if (!Number.isFinite(n) || n <= 0) return undefined
	return Math.max(1, Math.ceil(n))
}

function isDailyTokenCapMessage(message) {
	if (typeof message !== 'string' || !message) return false
	return /\bTPD\b/i.test(message) || /tokens\s+per\s+day/i.test(message) || /daily\s+token/i.test(message)
}

function isPerMinuteTokenCapMessage(message) {
	if (typeof message !== 'string' || !message) return false
	return /\bTPM\b/i.test(message) || /tokens\s+per\s+minute/i.test(message) || /per-?minute\s+token/i.test(message)
}

function makeRateLimitMessage(originalMessage, retryAfterSeconds) {
	const msg = typeof originalMessage === 'string' ? originalMessage.trim() : ''
	const retry = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined
	if (isDailyTokenCapMessage(msg)) {
		return 'Daily AI quota reached (TPD). Please try again later.'
	}
	if (isPerMinuteTokenCapMessage(msg)) {
		return retry ? `Too many requests right now. Try again in ${retry}s.` : 'Too many requests right now. Please try again shortly.'
	}
	return retry ? `Rate limited. Try again in ${retry}s.` : 'Rate limited. Please try again shortly.'
}

function clampInt(value, { min, max, fallback }) {
	const n = Number(value)
	if (!Number.isFinite(n)) return fallback
	const int = Math.trunc(n)
	if (int < min) return min
	if (int > max) return max
	return int
}

function extractJson(text) {
	if (typeof text !== 'string') return null
	const trimmed = text.replace(/^\uFEFF/, '').trim()
	if (!trimmed) return null

	// If the model wrapped JSON in a fenced code block, prefer the first block.
	const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
	const fenceStripped = (fenceMatch ? fenceMatch[1] : trimmed).trim()

	function tryParseJson(raw) {
		try {
			return JSON.parse(raw)
		} catch {
			// continue
		}
		// Common model mistake: trailing commas
		try {
			const repaired = raw.replace(/,\s*([}\]])/g, '$1')
			return JSON.parse(repaired)
		} catch {
			return null
		}
	}

	function findFirstJsonSubstring(input) {
		if (typeof input !== 'string') return null
		const s = input
		const firstObj = s.indexOf('{')
		const firstArr = s.indexOf('[')
		let start = -1
		if (firstObj === -1) start = firstArr
		else if (firstArr === -1) start = firstObj
		else start = Math.min(firstObj, firstArr)
		if (start === -1) return null

		const stack = []
		let inString = false
		let escaped = false

		for (let i = start; i < s.length; i += 1) {
			const ch = s[i]
			if (inString) {
				if (escaped) {
					escaped = false
					continue
				}
				if (ch === '\\') {
					escaped = true
					continue
				}
				if (ch === '"') {
					inString = false
				}
				continue
			}

			if (ch === '"') {
				inString = true
				continue
			}
			if (ch === '{') {
				stack.push('}')
				continue
			}
			if (ch === '[') {
				stack.push(']')
				continue
			}
			if (ch === '}' || ch === ']') {
				if (stack.length && stack[stack.length - 1] === ch) {
					stack.pop()
					if (stack.length === 0) {
						return s.slice(start, i + 1)
					}
				}
			}
		}
		return null
	}

	const direct = tryParseJson(fenceStripped)
	if (direct) return direct

	const candidate = findFirstJsonSubstring(fenceStripped)
	if (!candidate) return null
	return tryParseJson(candidate)
}

async function repairJsonWithModel(raw, opts = {}) {
	const rawText = typeof raw === 'string' ? raw.trim() : ''
	if (!rawText) return null

	// Prevent runaway token usage if the model returned a huge blob.
	const clipped = rawText.length > 20000 ? rawText.slice(0, 20000) : rawText

	const schemaHint = typeof opts?.schemaHint === 'string' ? opts.schemaHint.trim() : ''
	const message = [
		'Fix the following JSON and make it valid.',
		'Return ONLY corrected JSON.',
		schemaHint ? '' : '',
		schemaHint ? 'Ensure the corrected JSON matches this schema exactly (keys + types):' : '',
		schemaHint ? schemaHint : '',
		'',
		'INPUT:',
		clipped,
	].filter(Boolean).join('\n')

	const repairedRaw = await generateGrokResponse({ message, documentText: '', maxTokens: 2000, outputFormat: 'json' })
	const repairedParsed = extractJson(repairedRaw)
	return repairedParsed
}

function normalizeDifficulty(value) {
	const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
	if (raw === 'easy') return 'Easy'
	if (raw === 'medium') return 'Medium'
	if (raw === 'hard') return 'Hard'
	return null
}

function normalizeStudyPlan(payload) {
	const nestedStudyPlan = payload?.study_plan && typeof payload.study_plan === 'object' ? payload.study_plan : null
	const nestedPlan = payload?.plan && typeof payload.plan === 'object' ? payload.plan : null
	const plan = Array.isArray(payload)
		? payload
		: Array.isArray(payload?.study_plan)
			? payload.study_plan
			: Array.isArray(payload?.studyPlan)
				? payload.studyPlan
				: Array.isArray(payload?.plan)
					? payload.plan
					: Array.isArray(payload?.stages)
						? payload.stages
						: Array.isArray(payload?.steps)
							? payload.steps
							: Array.isArray(nestedStudyPlan?.stages)
								? nestedStudyPlan.stages
								: Array.isArray(nestedStudyPlan?.steps)
									? nestedStudyPlan.steps
									: Array.isArray(nestedPlan?.stages)
										? nestedPlan.stages
										: Array.isArray(nestedPlan?.steps)
											? nestedPlan.steps
											: []
	const normalized = []
	const toTopics = (value) => {
		if (Array.isArray(value)) {
			return value
				.map((t) => {
					if (typeof t === 'string' || typeof t === 'number') return String(t).trim()
					if (t && typeof t === 'object') {
						const candidate = t.topic ?? t.title ?? t.name
						return String(candidate ?? '').trim()
					}
					return ''
				})
				.filter(Boolean)
				.slice(0, 20)
		}
		if (typeof value === 'string') {
			return value
				.split(/\r?\n|,|;|\u2022|\u2023|\u25E6|\u2043|\u2219|\t+/g)
				.map((t) => t.trim())
				.filter(Boolean)
				.slice(0, 20)
		}
		return []
	}
	const toMinutes = (value) => {
		if (typeof value === 'number') return value
		if (typeof value === 'string') {
			const m = value.match(/\d+(?:\.\d+)?/)
			return m ? Number(m[0]) : NaN
		}
		return NaN
	}
	for (const item of plan) {
		const stage = typeof item?.stage === 'string'
			? item.stage.trim()
			: typeof item?.phase === 'string'
				? item.phase.trim()
				: typeof item?.step === 'string'
					? item.step.trim()
					: typeof item?.module === 'string'
						? item.module.trim()
						: typeof item?.title === 'string'
							? item.title.trim()
							: typeof item?.name === 'string'
								? item.name.trim()
						: ''
		const topics = toTopics(item?.topics ?? item?.topic ?? item?.subtopics)
		const description = typeof item?.description === 'string'
			? item.description.trim()
			: typeof item?.details === 'string'
				? item.details.trim()
				: typeof item?.goal === 'string'
					? item.goal.trim()
					: typeof item?.focus === 'string'
						? item.focus.trim()
						: ''
		const rawMinutes = toMinutes(
			item?.estimated_time ??
				item?.estimatedTime ??
				item?.estimated_time_minutes ??
				item?.time_minutes ??
				item?.time
		)
		const estimated_time = clampInt(rawMinutes, { min: 5, max: 480, fallback: 30 })
		const difficulty =
			normalizeDifficulty(item?.difficulty) ||
			normalizeDifficulty(item?.level) ||
			normalizeDifficulty(item?.difficulty_level) ||
			'Medium'
		if (!stage || !topics.length || !description) continue
		normalized.push({ stage, topics, description, estimated_time, difficulty })
	}
	if (!normalized.length) return null

	const hasRevision = normalized.some((s) => {
		const st = String(s.stage || '').toLowerCase()
		if (st.includes('revision') || st.includes('review') || st.includes('practice')) return true
		return (s.topics || []).some((t) => {
			const tt = String(t || '').toLowerCase()
			return tt.includes('revision') || tt.includes('review') || tt.includes('practice')
		})
	})
	if (!hasRevision) {
		normalized.push({
			stage: 'Revision & practice',
			topics: ['Revision', 'Practice questions'],
			description: 'Review key notes and complete practice questions to reinforce recall and identify gaps.',
			estimated_time: 45,
			difficulty: 'Medium',
		})
	}

	return { study_plan: normalized }
}

function clampPercent(value) {
	const n = Number(value)
	if (!Number.isFinite(n)) return 0
	return Math.max(0, Math.min(100, Math.round(n)))
}

function normalizeTopicName(value) {
	const t = typeof value === 'string' ? value.trim() : ''
	return t || 'Untitled'
}

function normalizePerformanceAnalysis(payload) {
	const weakRaw = Array.isArray(payload?.weak_topics) ? payload.weak_topics : []
	const strongRaw = Array.isArray(payload?.strong_topics) ? payload.strong_topics : []
	const overall_advice = typeof payload?.overall_advice === 'string' ? payload.overall_advice.trim() : ''

	const weak_topics = weakRaw
		.map((w) => {
			const topic = normalizeTopicName(w?.topic)
			const accuracy = clampPercent(w?.accuracy)
			const reason = typeof w?.reason === 'string' ? w.reason.trim() : ''
			const suggestion = typeof w?.suggestion === 'string' ? w.suggestion.trim() : ''
			if (!topic || !reason || !suggestion) return null
			return { topic, accuracy, reason, suggestion }
		})
		.filter(Boolean)
		.slice(0, 10)

	const strong_topics = strongRaw
		.map((s) => {
			const topic = normalizeTopicName(s?.topic)
			const accuracy = clampPercent(s?.accuracy)
			if (!topic) return null
			return { topic, accuracy }
		})
		.filter(Boolean)
		.slice(0, 10)

	if (!weak_topics.length && !strong_topics.length) return null
	return {
		weak_topics,
		strong_topics,
		overall_advice: overall_advice || 'Focus on weak topics first, then reinforce strengths with spaced practice.',
	}
}

async function generateSummary(req, res) {
	let chargedTokens = 0
	try {
		const { documentId } = req.body || {}
		if (!documentId || typeof documentId !== 'string') {
			return res.status(400).json({ message: 'documentId is required' })
		}

		const doc = await Document.findOne({ _id: documentId, userId: req.user._id }).select('_id title updatedAt').lean()
		if (!doc) return res.status(404).json({ message: 'Document not found' })

		const cacheKey = makeKey({
			userId: req.user._id,
			documentId,
			documentUpdatedAt: doc.updatedAt,
			action: 'summary',
			promptOrTopic: 'default_v3_bullets_strict',
			format: 'markdown',
		})
		const cached = getCachedAiResponse(cacheKey)
		if (typeof cached === 'string' && cached.trim()) {
			return res.status(200).json({ summary: cached })
		}

		const charged = await debitTokens({ userId: req.user._id, cost: TOKEN_COSTS.summary, action: 'summary' })
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const fullText = await getDocumentTextForUser({ userId: req.user._id, documentId, maxChars: 220000 })
		const documentText = buildStratifiedSample(fullText, { budgetChars: 9000, segments: 6 })
		const message = [
			'You are a helpful study assistant.',
			'Write a detailed, structured study guide for the entire document.',
			'The provided context includes excerpts from across the document; cover all major sections/topics you can infer.',
			'Output MUST be Markdown only. Do not use HTML tags like <br>.',
			'Formatting rules (VERY IMPORTANT):',
			'- Use real Markdown headings (##, ###).',
			'- Under EVERY heading, write bullet points only (use -). No long paragraphs.',
			'- Each bullet should be 1–2 lines max. Prefer many short bullets over few long bullets.',
			'- When listing items, use nested bullets (two spaces + -).',
			'- Do NOT output a table of contents.',
			'If you include formulas, write them in LaTeX using $...$ or $$...$$.',
			'Use headings and bullet points where helpful.',
			'Include: key takeaways per section, important definitions, important lists, and any key formulas/steps.',
			'Keep it clear and actionable for learning.',
			'',
			`DOCUMENT_TITLE: ${doc.title}`,
			'',
			'Use this exact structure and headings:',
			'## Overview',
			'- (3–6 bullets)',
			'',
			'## Section-by-section notes',
			'- Use ### headings for each inferred section/topic.',
			'- Under each ### heading, add 4–10 bullets.',
			'',
			'## Key definitions',
			'- 8–15 bullets in the form **Term**: meaning',
			'',
			'## Key formulas / procedures',
			'- If none, write: - No major formulas found',
			'- Otherwise include formulas + step-by-step procedures as bullets',
			'',
			'## Common exam-style questions',
			'- 8–12 bullets phrased as questions',
		].join('\n')

		const summary = await generateAiResponse({ task: 'summary', message, documentText, maxTokens: 2000, outputFormat: 'markdown' })
		const rawOut = typeof summary === 'string' ? summary : ''
		const out = enforceBulletSummaryMarkdown(rawOut)
		if (out.trim()) setCachedAiResponse(cacheKey, out)
		return res.status(200).json({ summary: out })
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (summary):', e)
			}
		}

		console.error('[ai] Summary error:', error)
		const status = Number(error?.status)
		if (status === 402 && error?.data) {
			return res.status(402).json(error.data)
		}
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			const msg = stripUpgradeLink(getProviderMessage(error)) || 'Request failed'
			const retryAfterSeconds = status === 429 ? extractRetryAfterSeconds(msg) : undefined
			const finalMsg = status === 429 ? makeRateLimitMessage(msg, retryAfterSeconds) : msg
			return res.status(status).json({
				message: finalMsg,
				...(retryAfterSeconds ? { retryAfterSeconds } : {}),
			})
		}
		return res.status(500).json({ message: 'Server error' })
	}
}

async function explainConcept(req, res) {
	let chargedTokens = 0
	try {
		const { documentId, topic } = req.body || {}
		if (!documentId || typeof documentId !== 'string') {
			return res.status(400).json({ message: 'documentId is required' })
		}
		const topicText = typeof topic === 'string' ? topic.trim() : ''
		if (!topicText) {
			return res.status(400).json({ message: 'topic is required' })
		}

		const doc = await Document.findOne({ _id: documentId, userId: req.user._id }).select('_id title updatedAt').lean()
		if (!doc) return res.status(404).json({ message: 'Document not found' })

		const cacheKey = makeKey({
			userId: req.user._id,
			documentId,
			documentUpdatedAt: doc.updatedAt,
			action: 'explain',
			promptOrTopic: topicText,
			format: 'markdown',
		})
		const cached = getCachedAiResponse(cacheKey)
		if (typeof cached === 'string' && cached.trim()) {
			return res.status(200).json({ explanation: cached })
		}

		const charged = await debitTokens({ userId: req.user._id, cost: TOKEN_COSTS.explain, action: 'explain' })
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const fullText = await getDocumentTextForUser({ userId: req.user._id, documentId, maxChars: 220000 })
		const documentText = buildTopicContext(fullText, topicText, { budgetChars: 9000 })
		const message = [
			'You are a helpful tutor.',
			'Explain the concept using ONLY the provided document context.',
			'If the document does not cover the concept, say that it is not covered and stop (do not add outside knowledge).',
			'Output MUST be Markdown only. Do not use HTML tags like <br>.',
			'If you include formulas, write them in LaTeX using $...$ or $$...$$.',
			'Keep it clear and structured.',
			'',
			'You MUST include these sections in this exact order:',
			'1. ## Simple explanation (for beginners)',
			'2. ## Interview-ready explanation',
			'3. ## Real-world example',
			'4. ## Step-by-step breakdown',
			'',
			'Rules:',
			'- Be concise but complete.',
			'- Use bullet points where helpful.',
			'- Do not reference the sampling process.',
			'',
			`TOPIC: ${topicText}`,
			`DOCUMENT_TITLE: ${doc.title}`,
		].join('\n')

		const explanation = await generateAiResponse({ task: 'explain', message, documentText, maxTokens: 1600, outputFormat: 'markdown' })
		const out = typeof explanation === 'string' ? explanation : ''
		if (out.trim()) setCachedAiResponse(cacheKey, out)
		return res.status(200).json({ explanation: out })
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (explain):', e)
			}
		}

		console.error('[ai] Explain error:', error)
		const status = Number(error?.status)
		if (status === 402 && error?.data) {
			return res.status(402).json(error.data)
		}
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			const msg = stripUpgradeLink(getProviderMessage(error)) || 'Request failed'
			const retryAfterSeconds = status === 429 ? extractRetryAfterSeconds(msg) : undefined
			const finalMsg = status === 429 ? makeRateLimitMessage(msg, retryAfterSeconds) : msg
			return res.status(status).json({
				message: finalMsg,
				...(retryAfterSeconds ? { retryAfterSeconds } : {}),
			})
		}
		return res.status(500).json({ message: 'Server error' })
	}
}

async function generateStudyPlan(req, res) {
	let chargedTokens = 0
	try {
		const { documentId } = req.body || {}
		if (!documentId || typeof documentId !== 'string') {
			return res.status(400).json({ message: 'documentId is required' })
		}

		const doc = await Document.findOne({ _id: documentId, userId: req.user._id }).select('_id title updatedAt').lean()
		if (!doc) return res.status(404).json({ message: 'Document not found' })

		const cacheKey = makeKey({
			userId: req.user._id,
			documentId,
			documentUpdatedAt: doc.updatedAt,
			action: 'studyPlan',
			promptOrTopic: 'default',
			format: 'json',
		})
		const cached = getCachedAiResponse(cacheKey)
		if (cached && typeof cached === 'object') {
			return res.status(200).json(cached)
		}

		const charged = await debitTokens({ userId: req.user._id, cost: TOKEN_COSTS.studyPlan, action: 'studyPlan' })
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const fullText = await getDocumentTextForUser({ userId: req.user._id, documentId, maxChars: 220000 })
		const documentText = buildStratifiedSample(fullText, { budgetChars: 9000, segments: 6 })

		const message = [
			'You are an expert AI learning assistant.',
			'Analyze the provided document context and generate a structured, step-by-step study plan.',
			'',
			'Requirements:',
			'1. Break the content into logical learning stages.',
			'2. Each stage must include: stage, topics (array), description, estimated_time (minutes, number), difficulty (Easy|Medium|Hard).',
			'3. Maintain a logical progression from basic to advanced.',
			'4. Include a final revision and practice stage.',
			'5. Keep it concise but structured.',
			'',
			'Output format: STRICT JSON only (no markdown, no backticks, no extra keys):',
			'{',
			'  "study_plan": [',
			'    {',
			'      "stage": "Stage name",',
			'      "topics": ["topic1", "topic2"],',
			'      "description": "short explanation",',
			'      "estimated_time": 30,',
			'      "difficulty": "Easy"',
			'    }',
			'  ]',
			'}',
			'',
			`DOCUMENT_TITLE: ${doc.title}`,
		].join('\n')

		const raw = await generateAiResponse({ task: 'studyPlan', message, documentText, maxTokens: 1200, outputFormat: 'json' })
		let parsed = extractJson(raw)
		let normalized = normalizeStudyPlan(parsed)
		if (!normalized) {
			const repaired = await repairJsonWithModel(raw)
			parsed = repaired
			normalized = normalizeStudyPlan(parsed)
		}
		if (!normalized) {
			if (chargedTokens > 0) {
				try {
					const refunded = await creditTokens({ userId: req.user._id, cost: chargedTokens })
					if (refunded) {
						req.user = refunded
						setTokenLocals(res, refunded)
					}
				} catch (e) {
					console.warn('[tokens] Refund failed (studyPlan invalid format):', e)
				}
			}
			return res.status(502).json({ message: 'AI returned an invalid format. Try again.' })
		}
		setCachedAiResponse(cacheKey, normalized)
		return res.status(200).json(normalized)
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (studyPlan):', e)
			}
		}

		console.error('[ai] StudyPlan error:', error)
		const status = Number(error?.status)
		if (status === 402 && error?.data) {
			return res.status(402).json(error.data)
		}
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			const msg = stripUpgradeLink(getProviderMessage(error)) || 'Request failed'
			const retryAfterSeconds = status === 429 ? extractRetryAfterSeconds(msg) : undefined
			const finalMsg = status === 429 ? makeRateLimitMessage(msg, retryAfterSeconds) : msg
			return res.status(status).json({
				message: finalMsg,
				...(retryAfterSeconds ? { retryAfterSeconds } : {}),
			})
		}
		return res.status(500).json({ message: 'Server error' })
	}
}

async function generateCourse(req, res) {
	let chargedTokens = 0
	try {
		const { documentId } = req.body || {}
		if (!documentId || typeof documentId !== 'string') {
			return res.status(400).json({ message: 'documentId is required' })
		}

		const doc = await Document.findOne({ _id: documentId, userId: req.user._id }).select('_id title').lean()
		if (!doc) return res.status(404).json({ message: 'Document not found' })

		const charged = await debitTokens({ userId: req.user._id, cost: TOKEN_COSTS.courseFromDocument, action: 'course' })
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const fullText = await getDocumentTextForUser({ userId: req.user._id, documentId, maxChars: 220000 })
		const documentText = buildStratifiedSample(fullText, { budgetChars: 9000, segments: 6 })

		const toStringList = (value) => {
			if (Array.isArray(value)) return value.map((x) => String(x ?? '').trim()).filter(Boolean)
			if (typeof value === 'string') {
				return value
					.split(/\r?\n|,|;|\u2022|\u2023|\u25E6|\u2043|\u2219|\t+/g)
					.map((x) => x.trim())
					.filter(Boolean)
			}
			return []
		}

		const normalizeSkeleton = (payload) => {
			if (!payload || typeof payload !== 'object') return null
			const container = payload?.course && typeof payload.course === 'object' ? payload.course : payload
			const course_title =
				typeof container?.course_title === 'string'
					? container.course_title.trim()
					: typeof container?.courseTitle === 'string'
						? container.courseTitle.trim()
						: typeof container?.title === 'string'
							? container.title.trim()
							: ''
			const description = typeof container?.description === 'string' ? container.description.trim() : ''
			const modulesRaw = Array.isArray(container?.modules) ? container.modules : []
			const modules = []
			for (const m of modulesRaw) {
				const module_title = typeof m?.module_title === 'string' ? m.module_title.trim() : typeof m?.title === 'string' ? m.title.trim() : ''
				const lessonsRaw = Array.isArray(m?.lessons) ? m.lessons : []
				const lessons = []
				for (const l of lessonsRaw) {
					const lesson_title = typeof l === 'string' ? l.trim() : typeof l?.lesson_title === 'string' ? l.lesson_title.trim() : typeof l?.title === 'string' ? l.title.trim() : ''
					if (!lesson_title) continue
					lessons.push({ lesson_title })
					if (lessons.length >= 3) break
				}
				if (!module_title || lessons.length < 3) continue
				modules.push({ module_title, lessons })
				if (modules.length >= 5) break
			}
			if (!course_title || modules.length < 5) return null
			return { course_title, description, modules }
		}

		const normalizeLesson = (payload, { fallbackTitle, rawText }) => {
			const obj = payload && typeof payload === 'object' ? payload : {}
			const lesson_title =
				typeof obj.lesson_title === 'string'
					? obj.lesson_title.trim()
					: typeof obj.title === 'string'
						? obj.title.trim()
						: fallbackTitle
			let content = typeof obj.content === 'string' ? obj.content.trim() : ''
			if (!content && typeof rawText === 'string') content = rawText.trim()
			let key_points = toStringList(obj.key_points ?? obj.keyPoints).slice(0, 12)
			if (!key_points.length) key_points = deriveKeyPointsFromContent(content).slice(0, 12)
			const examples = toStringList(obj.examples ?? obj.example).slice(0, 8)
			const common_mistakes = toStringList(obj.common_mistakes ?? obj.commonMistakes ?? obj.mistakes).slice(0, 8)
			if (!lesson_title || !content || !key_points.length) return null
			return { lesson_title, content, key_points, examples, common_mistakes }
		}

		// 1) Generate a small, strict-JSON skeleton first (avoids truncation).
		const skeletonPrompt = [
			'You are a world-class educator and textbook author.',
			'Create a COMPLETE, DETAILED, BOOK-LEVEL COURSE OUTLINE from the given document context.',
			'Use ONLY the provided document context. Do not invent outside topics.',
			'',
			'Rules:',
			'- Output STRICT JSON only (no markdown, no backticks, no extra keys).',
			'- Create EXACTLY 5 modules.',
			'- Each module must have EXACTLY 3 lessons (lesson titles only in this step).',
			'- Maintain progression: Basics → Intermediate → Advanced → Applications.',
			'',
			'OUTPUT JSON:',
			'{',
			'  "course_title": "",',
			'  "description": "",',
			'  "modules": [',
			'    {',
			'      "module_title": "",',
			'      "lessons": [',
			'        { "lesson_title": "" }',
			'      ]',
			'    }',
			'  ]',
			'}',
			'',
			`DOCUMENT_TITLE: ${doc.title}`,
		].join('\n')

		const skeletonRaw = await generateGrokResponse({ message: skeletonPrompt, documentText, maxTokens: 1200, outputFormat: 'json' })
		let skeletonParsed = extractJson(skeletonRaw)
		let skeleton = normalizeSkeleton(skeletonParsed)
		if (!skeleton) {
			const repaired = await repairJsonWithModel(skeletonRaw)
			skeletonParsed = repaired
			skeleton = normalizeSkeleton(skeletonParsed)
		}
		if (!skeleton) {
			const baseTitle = doc.title || 'Course'
			skeleton = {
				course_title: baseTitle,
				description: null,
				modules: [
					{
						module_title: 'Foundations',
						lessons: [{ lesson_title: `What is ${baseTitle}?` }, { lesson_title: 'Key terms & definitions' }, { lesson_title: 'Core mental models' }],
					},
					{
						module_title: 'Core Concepts',
						lessons: [{ lesson_title: 'Concepts overview' }, { lesson_title: 'How it works' }, { lesson_title: 'Worked examples' }],
					},
					{
						module_title: 'Intermediate',
						lessons: [{ lesson_title: 'Common patterns' }, { lesson_title: 'Pitfalls & edge cases' }, { lesson_title: 'Practice problems' }],
					},
					{
						module_title: 'Advanced',
						lessons: [{ lesson_title: 'Advanced techniques' }, { lesson_title: 'Optimization & tradeoffs' }, { lesson_title: 'Real-world constraints' }],
					},
					{
						module_title: 'Applications',
						lessons: [{ lesson_title: 'Use cases' }, { lesson_title: 'Case study' }, { lesson_title: 'Review & next steps' }],
					},
				],
			}
		}

		// 2) Generate each lesson as strict JSON (keeps outputs valid and detailed).
		const builtModules = []
		for (const moduleItem of skeleton.modules) {
			const builtLessons = []
			for (const lessonItem of moduleItem.lessons) {
				const lessonPrompt = [
					'You are a world-class educator and textbook author.',
					'Convert the given document into a COMPLETE, DETAILED, BOOK-LEVEL COURSE lesson.',
					'',
					'STRICT REQUIREMENTS:',
					'1. The output MUST be extremely detailed.',
					'2. The lesson must include:',
					'   - Concept explanation (deep + intuitive)',
					'   - Real-world examples',
					'   - Step-by-step breakdown',
					'   - Use cases',
					'   - Common mistakes',
					'3. Do NOT summarize — EXPAND content.',
					'4. Lesson length: 200–500 words (in content).',
					'5. Use ONLY the provided document context. Do not invent outside topics.',
					'',
					'OUTPUT FORMAT (STRICT JSON ONLY — NO TEXT OUTSIDE JSON):',
					'{',
					'  "lesson_title": "",',
					'  "content": "",',
					'  "examples": [],',
					'  "key_points": [],',
					'  "common_mistakes": []',
					'}',
					'',
					`DOCUMENT_TITLE: ${doc.title}`,
					`COURSE_TITLE: ${skeleton.course_title}`,
					`MODULE_TITLE: ${moduleItem.module_title}`,
					`LESSON_TITLE: ${lessonItem.lesson_title}`,
				].join('\n')

				const lessonRaw = await generateGrokResponse({ message: lessonPrompt, documentText, maxTokens: 2200, outputFormat: 'json' })
				let lessonParsed = extractJson(lessonRaw)
				let lesson = normalizeLesson(lessonParsed, { fallbackTitle: lessonItem.lesson_title, rawText: lessonRaw })
				if (!lesson) {
					const repaired = await repairJsonWithModel(lessonRaw)
					lessonParsed = repaired
					lesson = normalizeLesson(lessonParsed, { fallbackTitle: lessonItem.lesson_title, rawText: lessonRaw })
				}
				if (!lesson) {
					const markdownPrompt = [
						'You are a world-class educator and textbook author.',
						'Write detailed lesson notes in Markdown (NOT JSON).',
						'Use ONLY the provided document context. Do not invent outside topics.',
						'Include: deep explanation, step-by-step breakdown, use cases, and common mistakes.',
						'Length: 300–700 words.',
						'',
						`DOCUMENT_TITLE: ${doc.title}`,
						`COURSE_TITLE: ${skeleton.course_title}`,
						`MODULE_TITLE: ${moduleItem.module_title}`,
						`LESSON_TITLE: ${lessonItem.lesson_title}`,
					].join('\n')
					const markdown = await generateGrokResponse({ message: markdownPrompt, documentText, maxTokens: 1800 })
					const content = typeof markdown === 'string' && markdown.trim() ? markdown.trim() : 'Lesson generation failed.'
					builtLessons.push({
						lesson_title: lessonItem.lesson_title,
						content,
						key_points: deriveKeyPointsFromContent(content).slice(0, 12),
						examples: [],
						common_mistakes: [],
					})
				} else {
					builtLessons.push(lesson)
				}
			}

			if (builtLessons.length) {
				builtModules.push({ module_title: moduleItem.module_title, lessons: builtLessons })
			}
		}

		const created = await Course.create({
			userId: req.user._id,
			source: { documentId: doc._id, documentTitle: doc.title },
			description: skeleton.description || null,
			course_title: skeleton.course_title,
			modules: builtModules,
		})

		await logActivity(req.user._id, {
			type: 'course_generated',
			label: `Generated course: ${skeleton.course_title}`,
			meta: { courseId: String(created._id), documentId: String(doc._id) },
		})

		return res.status(200).json({
			courseId: created._id,
			course_title: skeleton.course_title,
			description: skeleton.description || null,
			modules: builtModules,
		})
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (course):', e)
			}
		}

		console.error('[ai] Course error:', error)
		const status = Number(error?.status)
		if (status === 402 && error?.data) {
			return res.status(402).json(error.data)
		}
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			const msg = stripUpgradeLink(getProviderMessage(error)) || 'Request failed'
			const retryAfterSeconds = status === 429 ? extractRetryAfterSeconds(msg) : undefined
			return res.status(status).json({
				message: msg,
				...(retryAfterSeconds ? { retryAfterSeconds } : {}),
			})
		}
		return res.status(500).json({ message: 'Server error' })
	}
}

async function generateCustomCourse(req, res) {
	let chargedTokens = 0
	try {
		const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : ''
		const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
		const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
		const chapters = parseChapters(req.body?.chapters)

		if (!topic) return res.status(400).json({ message: 'topic is required' })
		if (!title) return res.status(400).json({ message: 'title is required' })
		if (!description) return res.status(400).json({ message: 'description is required' })
		if (chapters.length < 3) return res.status(400).json({ message: 'chapters must include at least 3 items' })

		const maxModules = Math.min(12, chapters.length)
		const moduleTitles = chapters.slice(0, maxModules)
		const lessonTitles = ['Overview', 'Deep dive', 'Examples & mistakes']

		const charged = await debitTokens({
			userId: req.user._id,
			cost: costForCustomCourse(moduleTitles.length),
			action: 'customCourse',
		})
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const toStringList = (value) => {
			if (Array.isArray(value)) return value.map((x) => String(x ?? '').trim()).filter(Boolean)
			if (typeof value === 'string') {
				return value
					.split(/\r?\n|,|;|\u2022|\u2023|\u25E6|\u2043|\u2219|\t+/g)
					.map((x) => x.trim())
					.filter(Boolean)
			}
			return []
		}

		const normalizeLesson = (payload, { fallbackTitle, rawText }) => {
			const obj = payload && typeof payload === 'object' ? payload : {}
			const lesson_title =
				typeof obj.lesson_title === 'string'
					? obj.lesson_title.trim()
					: typeof obj.title === 'string'
						? obj.title.trim()
						: fallbackTitle
			let content = typeof obj.content === 'string' ? obj.content.trim() : ''
			if (!content && typeof rawText === 'string') content = rawText.trim()
			let key_points = toStringList(obj.key_points ?? obj.keyPoints).slice(0, 12)
			if (!key_points.length) key_points = deriveKeyPointsFromContent(content).slice(0, 12)
			const examples = toStringList(obj.examples ?? obj.example).slice(0, 8)
			const common_mistakes = toStringList(obj.common_mistakes ?? obj.commonMistakes ?? obj.mistakes).slice(0, 8)
			if (!lesson_title || !content || !key_points.length) return null
			return { lesson_title, content, key_points, examples, common_mistakes }
		}

		async function buildLesson({ moduleTitle, lessonTitle }) {
			const lessonPrompt = [
				'You are a world-class educator and textbook author.',
				'Write ONE lesson worth of in-depth notes for the specified course lesson.',
				'You MAY use general knowledge (this is not tied to a PDF).',
				'',
				'Course settings:',
				`- TOPIC: ${topic}`,
				`- COURSE_TITLE: ${title}`,
				`- COURSE_DESCRIPTION: ${description}`,
				`- MODULE_TITLE: ${moduleTitle}`,
				`- LESSON_TITLE: ${lessonTitle}`,
				'',
				'Requirements:',
				'- content must be detailed notes (Markdown allowed inside the JSON string).',
				'- Include: deep explanation, step-by-step breakdown, use cases, and common mistakes.',
				'- Add 2–5 real-world examples ("examples" array).',
				'- Add 4–10 takeaways ("key_points" array).',
				'- Add 3–8 pitfalls ("common_mistakes" array).',
				'- When applicable, include formulas and use LaTeX like $O(n)$ or $$a^2+b^2=c^2$$.',
				'- Keep content about 300–550 words (to avoid truncation).',
				'',
				'OUTPUT FORMAT (STRICT JSON ONLY — NO TEXT OUTSIDE JSON):',
				'{',
				'  "lesson_title": "",',
				'  "content": "",',
				'  "examples": [],',
				'  "key_points": [],',
				'  "common_mistakes": []',
				'}',
			].join('\n')

			const lessonRaw = await generateGrokResponse({ message: lessonPrompt, documentText: '', maxTokens: 1700, outputFormat: 'json' })
			let lessonParsed = extractJson(lessonRaw)
			let lesson = normalizeLesson(lessonParsed, { fallbackTitle: lessonTitle, rawText: lessonRaw })
			if (!lesson) {
				const repaired = await repairJsonWithModel(lessonRaw, {
					schemaHint:
						'{"lesson_title":"string","content":"string","examples":["string"],"key_points":["string"],"common_mistakes":["string"]}',
				})
				lessonParsed = repaired
				lesson = normalizeLesson(lessonParsed, { fallbackTitle: lessonTitle, rawText: lessonRaw })
			}
			if (!lesson) {
				const markdownPrompt = [
					'You are a world-class educator and textbook author.',
					'Write detailed lesson notes in Markdown (NOT JSON).',
					'You MAY use general knowledge (this is not tied to a PDF).',
					'Include: deep explanation, step-by-step breakdown, use cases, and common mistakes.',
					'Length: 400–800 words.',
					'',
					`TOPIC: ${topic}`,
					`COURSE_TITLE: ${title}`,
					`COURSE_DESCRIPTION: ${description}`,
					`MODULE_TITLE: ${moduleTitle}`,
					`LESSON_TITLE: ${lessonTitle}`,
				].join('\n')
				const markdown = await generateGrokResponse({ message: markdownPrompt, documentText: '', maxTokens: 1300, outputFormat: 'markdown' })
				const content = typeof markdown === 'string' && markdown.trim() ? markdown.trim() : 'Lesson generation failed.'
				const key_points = deriveKeyPointsFromContent(content).slice(0, 12)
				return {
					lesson_title: lessonTitle,
					content,
					key_points: key_points.length ? key_points : ['Key takeaway'],
					examples: [],
					common_mistakes: [],
				}
			}
			return { ...lesson, lesson_title: lessonTitle }
		}

		async function buildModule(moduleTitle) {
			const modulePrompt = [
				'You are an expert course creator and textbook author.',
				'Create ONE course module as detailed notes for the given topic and settings.',
				'You MAY use general knowledge (this is not tied to a PDF).',
				'',
				'Course settings:',
				`- TOPIC: ${topic}`,
				`- COURSE_TITLE: ${title}`,
				`- COURSE_DESCRIPTION: ${description}`,
				`- MODULE_TITLE (MUST match exactly): ${moduleTitle}`,
				'',
				'Rules:',
				`- Create EXACTLY ${lessonTitles.length} lessons with these titles in this order: ${lessonTitles.join(' | ')}`,
				'- Each lesson must include: lesson_title, content, examples, key_points, common_mistakes.',
				'- content must be detailed notes (Markdown allowed inside the JSON string).',
				'- Keep each lesson content about 250–450 words to avoid truncation.',
				'- Use LaTeX for formulas where applicable ($...$ / $$...$$).',
				'',
				'OUTPUT FORMAT (STRICT JSON ONLY — NO TEXT OUTSIDE JSON):',
				'{',
				'  "module_title": "",',
				'  "lessons": [',
				'    { "lesson_title": "Overview", "content": "", "examples": [], "key_points": [], "common_mistakes": [] }',
				'  ]',
				'}',
			].join('\n')

			try {
				const raw = await generateGrokResponse({ message: modulePrompt, documentText: '', maxTokens: 2200, outputFormat: 'json' })
				let parsed = extractJson(raw)
				if (!parsed) {
					const repaired = await repairJsonWithModel(raw, {
						schemaHint:
							'{"module_title":"string","lessons":[{"lesson_title":"string","content":"string","examples":["string"],"key_points":["string"],"common_mistakes":["string"]}]}',
					})
					parsed = repaired
				}

				const moduleCandidate = (() => {
					if (!parsed || typeof parsed !== 'object') return null
					if (Array.isArray(parsed.modules) && parsed.modules[0] && typeof parsed.modules[0] === 'object') return parsed.modules[0]
					if (parsed.module && typeof parsed.module === 'object') return parsed.module
					if (Array.isArray(parsed.lessons)) return parsed
					return null
				})()

				if (moduleCandidate && typeof moduleCandidate === 'object') {
					const normalized = normalizeCourse(
						{ course_title: title || 'Course', description, modules: [{ ...moduleCandidate, module_title: moduleTitle }] },
						{ maxModules: 1, maxLessons: lessonTitles.length, maxKeyPoints: 12, maxListItems: 10 }
					)
					const m = normalized?.modules?.[0]
					if (m && Array.isArray(m.lessons) && m.lessons.length >= lessonTitles.length) {
						const patchedLessons = lessonTitles.map((lt, idx) => ({ ...m.lessons[idx], lesson_title: lt }))
						return { module_title: moduleTitle, lessons: patchedLessons }
					}
				}
			} catch {
				// Fall back to per-lesson generation.
			}

			const lessons = []
			for (const lt of lessonTitles) {
				lessons.push(await buildLesson({ moduleTitle, lessonTitle: lt }))
			}
			return { module_title: moduleTitle, lessons }
		}

		async function mapWithConcurrency(items, concurrency, mapper) {
			const results = new Array(items.length)
			let nextIdx = 0
			const workerCount = Math.max(1, Math.min(concurrency, items.length))
			const workers = Array.from({ length: workerCount }, async () => {
				while (nextIdx < items.length) {
					const current = nextIdx
					nextIdx += 1
					results[current] = await mapper(items[current], current)
				}
			})
			await Promise.all(workers)
			return results
		}

		const builtModules = (await mapWithConcurrency(moduleTitles, 2, async (m) => buildModule(m))).filter(Boolean)
		if (!builtModules.length) {
			if (chargedTokens > 0) {
				try {
					const refunded = await creditTokens({ userId: req.user._id, cost: chargedTokens })
					if (refunded) {
						req.user = refunded
						setTokenLocals(res, refunded)
					}
				} catch (e) {
					console.warn('[tokens] Refund failed (customCourse invalid format):', e)
				}
			}
			return res.status(502).json({ message: 'AI returned an invalid format. Try again.' })
		}

		const created = await Course.create({
			userId: req.user._id,
			source: { documentId: null, documentTitle: null, topic },
			description,
			course_title: title,
			modules: builtModules,
		})

		await logActivity(req.user._id, {
			type: 'course_generated',
			label: `Generated course: ${title}`,
			meta: { courseId: String(created._id), topic },
		})

		return res.status(201).json({
			courseId: created._id,
			course_title: title,
			description,
			modules: builtModules,
		})
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (customCourse):', e)
			}
		}

		console.error('[ai] CustomCourse error:', error)
		const status = Number(error?.status)
		if (status === 402 && error?.data) {
			return res.status(402).json(error.data)
		}
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			const msg = stripUpgradeLink(getProviderMessage(error)) || 'Request failed'
			const retryAfterSeconds = status === 429 ? extractRetryAfterSeconds(msg) : undefined
			return res.status(status).json({
				message: msg,
				...(retryAfterSeconds ? { retryAfterSeconds } : {}),
			})
		}
		return res.status(500).json({ message: 'Server error' })
	}
}

async function generatePracticeLab(req, res) {
	let chargedTokens = 0
	try {
		const { documentId } = req.body || {}
		if (!documentId || typeof documentId !== 'string') {
			return res.status(400).json({ message: 'documentId is required' })
		}

		const doc = await Document.findOne({ _id: documentId, userId: req.user._id }).select('_id title').lean()
		if (!doc) return res.status(404).json({ message: 'Document not found' })

		const charged = await debitTokens({ userId: req.user._id, cost: TOKEN_COSTS.practiceLab, action: 'practiceLab' })
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const fullText = await getDocumentTextForUser({ userId: req.user._id, documentId, maxChars: 300000 })
		const documentText = buildStratifiedSample(fullText, { budgetChars: 12000, segments: 6 })

		const message = [
			'You are an expert problem setter.',
			'Generate HIGH-QUALITY practice problems from the provided document context.',
			'Use ONLY the provided document context. Do not add outside knowledge or topics.',
			'',
			'STRICT RULES:',
			'1. Total 10–15 problems (generate EXACTLY 12: 4 Easy, 4 Medium, 4 Hard).',
			'2. Mix difficulty: Easy, Medium, Hard.',
			'3. Each problem must include:',
			'   - Question (clear)',
			'   - Solution (step-by-step)',
			'   - Explanation (deep reasoning; explain why each step works and common traps)',
			'4. Ensure problems are practical and conceptual (mix applied + conceptual).',
			'',
			'OUTPUT (VALID JSON ONLY):',
			'{',
			'  "problems": [',
			'    {',
			'      "difficulty": "Easy",',
			'      "question": "",',
			'      "solution": "",',
			'      "explanation": ""',
			'    }',
			'  ]',
			'}',
			'',
			'IMPORTANT:',
			'- Return ONLY JSON (no markdown, no backticks, no code fences).',
			'- No extra keys. No trailing commas. Ensure valid syntax.',
			'',
			`DOCUMENT_TITLE: ${doc.title}`,
		].join('\n')

		const raw = await generateGrokResponse({ message, documentText, maxTokens: 1500, outputFormat: 'json' })
		let parsed = extractJson(raw)
		let normalized = normalizePracticeLab(parsed)
		if (!normalized) {
			const repaired = await repairJsonWithModel(raw, {
				schemaHint: '{"problems":[{"difficulty":"Easy|Medium|Hard","question":"string","solution":"string","explanation":"string"}]}',
			})
			parsed = repaired
			normalized = normalizePracticeLab(parsed)
		}
		if (!normalized) {
			if (chargedTokens > 0) {
				try {
					const refunded = await creditTokens({ userId: req.user._id, cost: chargedTokens })
					if (refunded) {
						req.user = refunded
						setTokenLocals(res, refunded)
					}
				} catch (e) {
					console.warn('[tokens] Refund failed (practiceLab invalid format):', e)
				}
			}
			return res.status(502).json({ message: 'AI returned an invalid format. Try again.' })
		}

		await logActivity(req.user._id, {
			type: 'knowledge_graph_generated',
			label: `Created knowledge graph: ${doc.title}`,
			meta: { documentId: String(doc._id) },
		})

		return res.status(200).json(normalized)
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (practiceLab):', e)
			}
		}

		console.error('[ai] PracticeLab error:', error)
		const status = Number(error?.status)
		if (status === 402 && error?.data) {
			return res.status(402).json(error.data)
		}
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			const msg = stripUpgradeLink(getProviderMessage(error)) || 'Request failed'
			const retryAfterSeconds = status === 429 ? extractRetryAfterSeconds(msg) : undefined
			const finalMsg = status === 429 ? makeRateLimitMessage(msg, retryAfterSeconds) : msg
			return res.status(status).json({
				message: finalMsg,
				...(retryAfterSeconds ? { retryAfterSeconds } : {}),
			})
		}
		return res.status(500).json({ message: 'Server error' })
	}
}

async function generateKnowledgeGraph(req, res) {
	let chargedTokens = 0
	try {
		const { documentId } = req.body || {}
		if (!documentId || typeof documentId !== 'string') {
			return res.status(400).json({ message: 'documentId is required' })
		}

		const doc = await Document.findOne({ _id: documentId, userId: req.user._id }).select('_id title').lean()
		if (!doc) return res.status(404).json({ message: 'Document not found' })

		const charged = await debitTokens({ userId: req.user._id, cost: TOKEN_COSTS.knowledgeGraph, action: 'knowledgeGraph' })
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const fullText = await getDocumentTextForUser({ userId: req.user._id, documentId, maxChars: 220000 })
		const documentText = buildStratifiedSample(fullText, { budgetChars: 9000, segments: 6 })

		const message = [
			'Extract a COMPLETE knowledge graph from the provided document context.',
			'Use ONLY the provided document context. Do not invent outside concepts.',
			'',
			'RULES:',
			'1. Identify ALL key concepts (not just a few).',
			'2. Create meaningful relationships (avoid generic filler).',
			'3. Avoid duplicates (same concept phrased differently).',
			'4. Keep names short and clear.',
			'5. Edge labels must be short snake_case verbs like: depends_on, part_of, causes, leads_to, requires, example_of, contrasts_with.',
			'6. Every edge source/target must match a node id exactly.',
			'',
			'OUTPUT (STRICT JSON):',
			'{',
			'  "nodes": [',
			'    { "id": "Concept1" }',
			'  ],',
			'  "edges": [',
			'    { "source": "Concept1", "target": "Concept2", "label": "depends_on" }',
			'  ]',
			'}',
			'',
			'IMPORTANT:',
			'- Return ONLY JSON (no markdown, no backticks, no code fences).',
			'- No extra keys. No trailing commas. Ensure valid syntax.',
			'- Keep it readable: 20-60 nodes, 25-140 edges.',
			`DOCUMENT_TITLE: ${doc.title}`,
		].join('\n')

		const raw = await generateGrokResponse({ message, documentText, maxTokens: 1200, outputFormat: 'json' })
		let parsed = extractJson(raw)
		let normalized = normalizeKnowledgeGraph(parsed)
		if (!normalized) {
			const repaired = await repairJsonWithModel(raw, {
				schemaHint: '{"nodes":[{"id":"string"}],"edges":[{"source":"string","target":"string","label":"snake_case_verb"}]}',
			})
			parsed = repaired
			normalized = normalizeKnowledgeGraph(parsed)
		}
		if (!normalized) {
			if (chargedTokens > 0) {
				try {
					const refunded = await creditTokens({ userId: req.user._id, cost: chargedTokens })
					if (refunded) {
						req.user = refunded
						setTokenLocals(res, refunded)
					}
				} catch (e) {
					console.warn('[tokens] Refund failed (knowledgeGraph invalid format):', e)
				}
			}
			return res.status(502).json({ message: 'AI returned an invalid format. Try again.' })
		}
		return res.status(200).json(normalized)
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (knowledgeGraph):', e)
			}
		}

		console.error('[ai] KnowledgeGraph error:', error)
		const status = Number(error?.status)
		if (status === 402 && error?.data) {
			return res.status(402).json(error.data)
		}
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			const msg = stripUpgradeLink(getProviderMessage(error)) || 'Request failed'
			const retryAfterSeconds = status === 429 ? extractRetryAfterSeconds(msg) : undefined
			const finalMsg = status === 429 ? makeRateLimitMessage(msg, retryAfterSeconds) : msg
			return res.status(status).json({
				message: finalMsg,
				...(retryAfterSeconds ? { retryAfterSeconds } : {}),
			})
		}
		return res.status(500).json({ message: 'Server error' })
	}
}

async function performanceAnalysis(req, res) {
	let chargedTokens = 0
	try {
		const days = clampInt(req.body?.days, { min: 7, max: 365, fallback: 30 })

		const charged = await debitTokens({ userId: req.user._id, cost: TOKEN_COSTS.performanceAnalysis, action: 'performanceAnalysis' })
		chargedTokens = charged.tokensCost
		if (charged.user) {
			req.user = charged.user
			setTokenLocals(res, charged.user)
		}

		const analytics = await calculateAnalyticsForUser(req.user._id, { days })
		const topicStats = Array.isArray(analytics?.topicStats) ? analytics.topicStats : []

		// Flashcard performance heuristic:
		// - easy/medium => treated as correct recall
		// - hard => treated as incorrect recall
		// We group by source.documentTitle (or Untitled).
		const flashAgg = await Flashcard.aggregate([
			{ $match: { userId: req.user._id } },
			{
				$project: {
					topic: { $ifNull: ['$source.documentTitle', 'Untitled'] },
					lastRating: 1,
				},
			},
			{
				$group: {
					_id: '$topic',
					correct: {
						$sum: {
							$cond: [{ $in: ['$lastRating', ['easy', 'medium']] }, 1, 0],
						},
					},
					incorrect: {
						$sum: {
							$cond: [{ $eq: ['$lastRating', 'hard'] }, 1, 0],
						},
					},
					reviewed: {
						$sum: {
							$cond: [{ $ne: ['$lastRating', null] }, 1, 0],
						},
					},
				},
			},
		])

		const flashMap = new Map(
			flashAgg.map((r) => {
				const topic = normalizeTopicName(r?._id)
				const correct = Number(r?.correct) || 0
				const incorrect = Number(r?.incorrect) || 0
				const reviewed = Number(r?.reviewed) || 0
				const denom = correct + incorrect
				const accuracy = denom > 0 ? (correct / denom) * 100 : null
				return [topic, { topic, reviewed, correct, incorrect, accuracy }]
			})
		)

		// Combine quiz topic stats + flashcard stats into a single list.
		const combinedMap = new Map()
		for (const t of topicStats) {
			const topic = normalizeTopicName(t?.topic)
			combinedMap.set(topic, {
				topic,
				quizAttempts: Number(t?.attempts) || 0,
				quizAccuracy: Number(t?.averagePercentage) || 0,
				flashReviewed: 0,
				flashAccuracy: null,
			})
		}
		for (const [topic, f] of flashMap.entries()) {
			const cur = combinedMap.get(topic) || {
				topic,
				quizAttempts: 0,
				quizAccuracy: 0,
				flashReviewed: 0,
				flashAccuracy: null,
			}
			cur.flashReviewed = f.reviewed
			cur.flashAccuracy = typeof f.accuracy === 'number' ? f.accuracy : null
			combinedMap.set(topic, cur)
		}

		const combined = Array.from(combinedMap.values())
			.map((x) => {
				const quizW = Math.max(0, Math.trunc(x.quizAttempts))
				const flashW = Math.max(0, Math.trunc(x.flashReviewed))
				const denom = quizW + flashW
				const flashAcc = typeof x.flashAccuracy === 'number' ? x.flashAccuracy : null
				const combinedAccuracy = denom
					? (x.quizAccuracy * quizW + (flashAcc ?? x.quizAccuracy) * flashW) / denom
					: x.quizAccuracy || (flashAcc ?? 0)
				return {
					topic: x.topic,
					accuracy: clampPercent(combinedAccuracy),
					quiz: { attempts: quizW, accuracy: clampPercent(x.quizAccuracy) },
					flashcards: flashW ? { reviewed: flashW, accuracy: clampPercent(flashAcc ?? 0) } : { reviewed: 0 },
				}
			})
			.filter((x) => x.quiz.attempts > 0 || x.flashcards.reviewed > 0)
			.sort((a, b) => a.accuracy - b.accuracy)
			.slice(0, 30)

		const context = JSON.stringify(
			{
				windowDays: days,
				topics: combined,
				notes: {
					flashcardAccuracyHeuristic: 'easy/medium treated as correct; hard treated as incorrect',
				},
			},
			null,
			2
		)

		const message = [
			'You are an AI tutor analyzing student performance.',
			'',
			'Given:',
			'1. Quiz performance by topic (accuracy and attempts)',
			'2. Flashcard review performance by topic (accuracy and reviewed count)',
			'',
			'Tasks:',
			'1. Identify weak topics where accuracy is low.',
			'2. Identify strong topics.',
			'3. Provide improvement suggestions for weak areas.',
			'4. Suggest specific actions (revise, practice, re-read).',
			'',
			'Output format (STRICT JSON only; no markdown; no extra keys):',
			'{',
			'  "weak_topics": [',
			'    { "topic": "Topic name", "accuracy": 40, "reason": "why weak", "suggestion": "what to do" }',
			'  ],',
			'  "strong_topics": [',
			'    { "topic": "Topic name", "accuracy": 85 }',
			'  ],',
			'  "overall_advice": "short summary"',
			'}',
			'',
			'Guidelines:',
			'- Use the provided topic accuracies; do not invent topics.',
			'- Keep weak_topics and strong_topics concise (max 5 each).',
			'- Reason/suggestion should be concrete and actionable.',
		].join('\n')

		const raw = await generateGrokResponse({ message, documentText: context, maxTokens: 1100, outputFormat: 'json' })
		let parsed = extractJson(raw)
		let normalized = normalizePerformanceAnalysis(parsed)
		if (!normalized) {
			const repaired = await repairJsonWithModel(raw)
			parsed = repaired
			normalized = normalizePerformanceAnalysis(parsed)
		}
		if (!normalized) {
			if (chargedTokens > 0) {
				try {
					const refunded = await creditTokens({ userId: req.user._id, cost: chargedTokens })
					if (refunded) {
						req.user = refunded
						setTokenLocals(res, refunded)
					}
				} catch (e) {
					console.warn('[tokens] Refund failed (performanceAnalysis invalid format):', e)
				}
			}
			return res.status(502).json({ message: 'AI returned an invalid format. Try again.' })
		}
		return res.status(200).json(normalized)
	} catch (error) {
		if (chargedTokens > 0) {
			try {
				const refunded = await creditTokens({ userId: req.user?._id, cost: chargedTokens })
				if (refunded) {
					req.user = refunded
					setTokenLocals(res, refunded)
				}
			} catch (e) {
				console.warn('[tokens] Refund failed (performanceAnalysis):', e)
			}
		}

		console.error('[ai] PerformanceAnalysis error:', error)
		const status = Number(error?.status)
		if (status === 402 && error?.data) {
			return res.status(402).json(error.data)
		}
		if (Number.isInteger(status) && status >= 400 && status < 600) {
			const msg = stripUpgradeLink(getProviderMessage(error)) || 'Request failed'
			const retryAfterSeconds = status === 429 ? extractRetryAfterSeconds(msg) : undefined
			return res.status(status).json({
				message: msg,
				...(retryAfterSeconds ? { retryAfterSeconds } : {}),
			})
		}
		return res.status(500).json({ message: 'Server error' })
	}
}

module.exports = {
	generateSummary,
	explainConcept,
	generateStudyPlan,
	generateCourse,
	generatePracticeLab,
	generateKnowledgeGraph,
	generateCustomCourse,
	performanceAnalysis,
}

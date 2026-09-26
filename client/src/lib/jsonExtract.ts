export function extractJsonFromText(text: string): unknown | null {
	if (typeof text !== 'string') return null
	const trimmed = text.replace(/^\uFEFF/, '').trim()
	if (!trimmed) return null

	const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
	const fenceStripped = (fenceMatch ? fenceMatch[1] : trimmed).trim()

	function tryParseJson(raw: string): unknown | null {
		try {
			return JSON.parse(raw)
		} catch {
			// continue
		}
		try {
			const repaired = raw.replace(/,\s*([}\]])/g, '$1')
			return JSON.parse(repaired)
		} catch {
			return null
		}
	}

	function findFirstJsonSubstring(input: string): string | null {
		const firstObj = input.indexOf('{')
		const firstArr = input.indexOf('[')
		let start = -1
		if (firstObj === -1) start = firstArr
		else if (firstArr === -1) start = firstObj
		else start = Math.min(firstObj, firstArr)
		if (start === -1) return null

		const stack: string[] = []
		let inString = false
		let escaped = false

		for (let i = start; i < input.length; i += 1) {
			const ch = input[i]
			if (inString) {
				if (escaped) {
					escaped = false
					continue
				}
				if (ch === '\\') {
					escaped = true
					continue
				}
				if (ch === '"') inString = false
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
					if (stack.length === 0) return input.slice(start, i + 1)
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

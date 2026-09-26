export function normalizeLatexDelimiters(text: string): string {
	// Many LLMs output LaTeX using \( ... \) and \[ ... \] delimiters.
	// remark-math expects $...$ / $$...$$, so normalize to improve rendering.
	return String(text || '')
		.replace(/\\\[/g, '$$')
		.replace(/\\\]/g, '$$')
		.replace(/\\\(/g, '$')
		.replace(/\\\)/g, '$')
}

export function normalizeMarkdownForDisplay(text: string): string {
	// ReactMarkdown does not render raw HTML by default, so models sometimes
	// output literal <br> tokens. Convert them to newlines for readability.
	const withBreaks = String(text || '').replace(/<br\s*\/?>/gi, '\n')
	return normalizeLatexDelimiters(withBreaks)
}

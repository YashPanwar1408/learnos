export type LastOpenedDocument = {
	id: string
	title: string
	openedAt: number
}

const STORAGE_KEY = 'alp_last_opened_document'

export function loadLastOpenedDocument(): LastOpenedDocument | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw) as Partial<LastOpenedDocument>
		if (!parsed || typeof parsed !== 'object') return null
		if (typeof parsed.id !== 'string' || !parsed.id) return null
		if (typeof parsed.title !== 'string' || !parsed.title) return null
		if (typeof parsed.openedAt !== 'number' || !Number.isFinite(parsed.openedAt)) return null
		return { id: parsed.id, title: parsed.title, openedAt: parsed.openedAt }
	} catch {
		return null
	}
}

export function saveLastOpenedDocument(doc: { id: string; title: string }) {
	const payload: LastOpenedDocument = { id: doc.id, title: doc.title, openedAt: Date.now() }
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
	} catch {
		// ignore
	}
}

export function clearLastOpenedDocument() {
	try {
		localStorage.removeItem(STORAGE_KEY)
	} catch {
		// ignore
	}
}

export function clearLastOpenedDocumentIfMatches(id: string) {
	const current = loadLastOpenedDocument()
	if (!current) return
	if (current.id !== id) return
	clearLastOpenedDocument()
}

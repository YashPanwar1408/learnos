export type DocumentWorkspaceItem = {
	_id: string
	title: string
	fileUrl: string
	createdAt?: string
	updatedAt?: string
	flashcardCount?: number
	quizCount?: number
}

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
	role: ChatRole
	content: string
	createdAt?: string | number
}

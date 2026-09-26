export const demoTwin = {
	profile: { questionsAttempted: 18, questionsCorrect: 11, missionsCompleted: 2 },
	mastery: [
		{ _id: 'subnetting', currentScore: 41, scoreDelta: 4, confidenceScore: 95, reasoningScore: 52, conceptId: { name: 'Subnetting' } },
		{ _id: 'network-bits', currentScore: 36, scoreDelta: -3, confidenceScore: 92, reasoningScore: 44, conceptId: { name: 'Network vs host bits' } },
		{ _id: 'tcp-reliability', currentScore: 82, scoreDelta: 8, confidenceScore: 78, reasoningScore: 84, conceptId: { name: 'TCP reliability' } },
		{ _id: 'cidr', currentScore: 68, scoreDelta: 5, confidenceScore: 72, reasoningScore: 66, conceptId: { name: 'CIDR notation' } },
	],
	misconceptions: [{ _id: 'demo-misconception', description: 'You repeatedly confuse network bits with host bits when calculating the address range.', severity: 'high', conceptId: { name: 'Network vs host bits' } }],
	interventions: [{ _id: 'demo-intervention', type: 'visual_explanation', instruction: 'Use a 32-bit address strip to separate the prefix from the host space.', conceptId: { name: 'Subnetting' } }],
}

export const demoReviews = [
	{ _id: 'review-1', conceptId: { name: 'Network vs host bits' }, reviewAt: 'today', intervalDays: 1, previousMisconception: 'Confidence was high but reasoning was incomplete.', previousQuestion: 'How many host addresses are available in /26?' },
	{ _id: 'review-2', conceptId: { name: 'CIDR notation' }, reviewAt: 'today', intervalDays: 2, previousMisconception: 'The prefix length was applied after converting the mask.', previousQuestion: 'What does /28 tell you about a network?' },
]

export const demoMission = { _id: 'demo-mission', title: 'Master subnetting', startScore: 41, goalScore: 80, currentPhase: 'guided_practice', completedPhases: ['diagnose', 'learn'], reason: 'You repeatedly confuse network bits with host bits.', conceptId: { name: 'Subnetting' } }
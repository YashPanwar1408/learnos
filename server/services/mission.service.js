const phases = ['diagnose', 'learn', 'guided_practice', 'independent_practice', 'transfer', 'explain', 'verify', 'review']

function nextMissionPhase({ currentPhase, mastery = 0, lastAttemptCorrect = false, explanationQuality = 0 }) {
	const index = Math.max(0, phases.indexOf(currentPhase))
	if (currentPhase === 'diagnose') return 'learn'
	if (currentPhase === 'learn') return 'guided_practice'
	if (currentPhase === 'guided_practice' && lastAttemptCorrect) return 'independent_practice'
	if (currentPhase === 'independent_practice' && lastAttemptCorrect) return 'transfer'
	if (currentPhase === 'transfer' && lastAttemptCorrect) return 'explain'
	if (currentPhase === 'explain' && explanationQuality >= 70) return 'verify'
	if (currentPhase === 'verify' && mastery >= 80) return 'review'
	return phases[index] || 'diagnose'
}

function isMissionComplete({ currentPhase, mastery }) {
	return currentPhase === 'review' && Number(mastery) >= 80
}

module.exports = { phases, nextMissionPhase, isMissionComplete }
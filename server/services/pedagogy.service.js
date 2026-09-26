const interventionTypes = ['direct_explanation', 'socratic_question', 'analogy', 'worked_example', 'visual_explanation', 'counterexample', 'easier_prerequisite', 'targeted_practice', 'challenge_problem', 'retrieval_question', 'real_world_application']

function selectIntervention({ mastery = 0, misconception, previousInterventions = [], currentAttempt = {} }) {
	const previous = new Set(previousInterventions.map((item) => item.type))
	let interventionType = 'targeted_practice'
	if (misconception) interventionType = previous.has('worked_example') ? 'counterexample' : 'worked_example'
	else if (mastery < 40) interventionType = 'easier_prerequisite'
	else if (currentAttempt.isCorrect && currentAttempt.studentExplanation) interventionType = 'retrieval_question'
	else if (mastery >= 80) interventionType = 'challenge_problem'
	if (!interventionTypes.includes(interventionType)) interventionType = 'targeted_practice'
	const difficulty = mastery < 40 ? 'easy' : mastery >= 80 ? 'hard' : 'medium'
	const instruction = {
		easier_prerequisite: 'Rebuild the prerequisite idea with one simple example, then connect it to this concept.',
		worked_example: 'Work through a concrete example and name the rule used at each step.',
		counterexample: 'Compare the current rule with a case where it does not apply.',
		retrieval_question: 'Explain the concept from memory, including when the rule should and should not be used.',
		challenge_problem: 'Solve a novel problem and justify why your method works.',
		targeted_practice: 'Complete a short practice set focused on the evidence from this attempt.',
	}[interventionType]
	return { interventionType, reason: misconception ? 'A recurring misconception needs targeted correction.' : 'The next intervention is selected from current mastery and attempt evidence.', difficulty, instruction: instruction || 'Practice the concept and explain your reasoning.', successCriteria: 'The learner answers a new question correctly and explains the governing idea in their own words.' }
}

module.exports = { selectIntervention }
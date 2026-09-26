const mongoose = require('mongoose')

const conceptSchema = new mongoose.Schema({
	key: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 160 },
	name: { type: String, required: true, trim: true, maxlength: 160 },
	description: { type: String, default: '', maxlength: 2000 },
	parentConceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
	source: { type: String, enum: ['document', 'course', 'system', 'user'], default: 'system' },
}, { timestamps: true })

module.exports = mongoose.model('Concept', conceptSchema)
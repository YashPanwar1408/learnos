const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const userSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
			minlength: 2,
			maxlength: 50,
		},
		email: {
			type: String,
			required: [true, 'Email is required'],
			unique: true,
			lowercase: true,
			trim: true,
			match: [emailRegex, 'Please provide a valid email'],
		},
		password: {
			type: String,
			required: [true, 'Password is required'],
			minlength: 6,
			select: false,
		},
		tokens: {
			type: Number,
			default: 50,
			min: 0,
		},
		plan: {
			type: String,
			enum: ['free', 'pro', 'premium'],
			default: 'free',
		},
		totalTokensUsed: {
			type: Number,
			default: 0,
			min: 0,
		},
		role: {
			type: String,
			enum: ['student', 'teacher'],
			default: 'student',
			index: true,
			},
		},
	{ timestamps: true }
)

userSchema.pre('save', async function () {
	if (!this.isModified('password')) return

	const salt = await bcrypt.genSalt(10)
	this.password = await bcrypt.hash(this.password, salt)
})

userSchema.methods.comparePassword = async function (candidatePassword) {
	return bcrypt.compare(candidatePassword, this.password)
}

module.exports = mongoose.model('User', userSchema)

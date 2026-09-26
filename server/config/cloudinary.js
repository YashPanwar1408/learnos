const cloudinary = require('cloudinary').v2

function initCloudinary() {
	const cloudName = process.env.CLOUDINARY_CLOUD_NAME
	const apiKey = process.env.CLOUDINARY_API_KEY
	const apiSecret = process.env.CLOUDINARY_API_SECRET

	if (!cloudName || !apiKey || !apiSecret) {
		throw new Error('Cloudinary env vars are missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)')
	}

	cloudinary.config({
		cloud_name: cloudName,
		api_key: apiKey,
		api_secret: apiSecret,
	})

	return cloudinary
}

module.exports = { initCloudinary }

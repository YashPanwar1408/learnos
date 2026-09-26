const Activity = require('../models/activity.model')

async function logActivity(userId, { type, label, meta } = {}) {
	try {
		if (!userId) return
		const t = typeof type === 'string' ? type.trim() : ''
		const l = typeof label === 'string' ? label.trim() : ''
		if (!t || !l) return
		await Activity.create({ userId, type: t, label: l, meta: meta && typeof meta === 'object' ? meta : {} })
	} catch {
		// Never block product flows due to activity logging.
	}
}

module.exports = { logActivity }

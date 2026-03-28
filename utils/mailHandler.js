module.exports = {
	SendImportedUserPassword: async function (email, username, password) {
		// Gia lap logic gui email cho user moi.
		console.log(`[MAIL] To: ${email} | username: ${username} | password: ${password}`)
		return true
	}
}

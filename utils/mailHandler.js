const nodemailer = require('nodemailer')

const transport = nodemailer.createTransport({
	host: process.env.MAILTRAP_HOST || 'sandbox.smtp.mailtrap.io',
	port: Number(process.env.MAILTRAP_PORT || 2525),
	auth: {
		user: process.env.MAILTRAP_USER || 'f733b4028f1250',
		pass: process.env.MAILTRAP_PASS || '58516f310af565'
	}
})

module.exports = {
	SendImportedUserPassword: async function (email, username, password) {
		const fromEmail = process.env.MAILTRAP_SENDER_EMAIL || 'no-reply@nnptud.local'
		const fromName = process.env.MAILTRAP_SENDER_NAME || 'NNPTUD System'

		await transport.sendMail({
			from: `${fromName} <${fromEmail}>`,
			to: email,
			subject: 'Tai khoan cua ban da duoc tao',
			text: `Xin chao ${username},\nTai khoan cua ban da duoc tao thanh cong.\nUsername: ${username}\nPassword: ${password}\nVui long doi mat khau sau lan dang nhap dau tien.`,
			html: `<p>Xin chao <b>${username}</b>,</p><p>Tai khoan cua ban da duoc tao thanh cong.</p><p>Username: <b>${username}</b><br/>Password: <b>${password}</b></p><p>Vui long doi mat khau sau lan dang nhap dau tien.</p>`
		})

		return true
	}
}

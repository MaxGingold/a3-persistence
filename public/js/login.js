
const form     = document.querySelector('#loginForm')
const errorEl  = document.querySelector('#loginError')

form.onsubmit = async function (e) {
  e.preventDefault()

  const username = document.querySelector('#username').value.trim()
  const password = document.querySelector('#password').value

  errorEl.hidden = true

  const res  = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await res.json()

  if (!res.ok) {
    errorEl.textContent = data.error || 'Login failed'
    errorEl.hidden = false
    return
  }

  if (data.isNew) alert('New account created for "' + username + '"!')
  window.location.href = '/'
}

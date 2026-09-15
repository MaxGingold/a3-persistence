
const ROUND = 30   // length of one game in seconds

// the four screens + the circle, looked up once
const home       = document.querySelector('#home')
const game       = document.querySelector('#game')
const nameEntry  = document.querySelector('#nameEntry')
const scoreboard = document.querySelector('#scoreboard')
const play       = document.querySelector('#play')
const target     = document.querySelector('#target')

let hits  = 0      // hits so far in the current game
let time  = ROUND  // seconds left in the current game
let timer = null   // id of the countdown setInterval
let myId  = null   // the logged-in user's id, so we know which rows are ours

// Show who is logged in, remember our id (to know which scores are ours), and wire up the logout button.
fetch('/api/me')
  .then(function (r) { return r.json() })
  .then(function (me) {
    myId = me.id
    document.querySelector('#whoami').textContent = 'Logged in as ' + me.displayName
  })

document.querySelector('#logout').onclick = function () {
  fetch('/auth/logout', { method: 'POST' })
    .then(function () { window.location.href = '/login' })
}

// Show the current screen dont show the other 3.
function show(el) {
  for (const v of [home, game, nameEntry, scoreboard]) {
    v.hidden = v !== el
  }
}


// Give the circle a new random size and a new random position in the play area.
function move() {
  const size = 30 + Math.random() * 90                      // 30-120 px wide
  target.style.width  = size + 'px'
  target.style.height = size + 'px'
  target.style.left   = Math.random() * (play.clientWidth  - size) + 'px'
  target.style.top    = Math.random() * (play.clientHeight - size) + 'px'
}

// Start a new game: reset counters, show the arena, run the countdown.
function start() {
  hits = 0
  time = ROUND
  document.querySelector('#hits').textContent = '0'
  document.querySelector('#time').textContent = ROUND
  show(game)
  move()

  clearInterval(timer)
  timer = setInterval(function () {
    time--
    document.querySelector('#time').textContent = time
    if (time <= 0) end()
  }, 1000)
}

// End the game: stop the clock and ask for a name.
function end() {
  clearInterval(timer)
  document.querySelector('#finalHits').textContent = hits
  document.querySelector('#name').value = ''
  show(nameEntry)
}

// Rebuild the scoreboard table body from the rows the server sent.
function drawScores(rows) {
  const body = document.querySelector('#scoreRows')
  body.innerHTML = ''//Clear the table body, then fill it with new rows from the server

  rows.forEach(function (r, i) {
    const tr = document.createElement('tr')
    addCell(tr, i + 1)           // rank = position in the sorted list
    addCell(tr, r.name)
    addCell(tr, r.hits)
    addCell(tr, r.hitsPerSecond)   // derived field, computed on the server

    // last cell: Rename + Delete buttons, but only for rows we own
    const actions = document.createElement('td')
    actions.className = 'actions'

    if (r.ownerId === myId) {
      const rename = document.createElement('button')
      rename.textContent = 'Rename'
      rename.className = 'btn btn-sm btn-outline-success me-1'
      rename.onclick = function () {
        const name = prompt('New name', r.name)
        if (name) send('/api/scores/' + r.id, 'PATCH', { name: name })
      }

      const del = document.createElement('button')
      del.textContent = 'Delete'
      del.className = 'btn btn-sm btn-outline-danger'
      del.onclick = function () {
        send('/api/scores/' + r.id, 'DELETE')
      }

      actions.append(rename, del)
    }

    tr.append(actions)
    body.append(tr)
  })
}

// Add one <td> containing plain text to a row.
function addCell(tr, text) {
  const td = document.createElement('td')
  td.textContent = text
  tr.append(td)
}

// Send a PATCH/DELETE request, then redraw the scoreboard from the response.
function send(url, method, bodyObj) {
  const opts = { method: method }
  if (bodyObj) {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(bodyObj)
  }
  return fetch(url, opts).then(function (r) { return r.json() }).then(drawScores)
}

// game wiring: click the circle, start/end game, view scoreboard, submit name

// clicking the circle: count a hit and jump it to a new spot
target.onclick = function () {
  hits++
  document.querySelector('#hits').textContent = hits
  move()
}

document.querySelector('#start').onclick   = start                     // home: Start game
document.querySelector('#endGame').onclick = end                      // game: end the round early
document.querySelector('#back').onclick    = function () { show(home) } // scoreboard: Back to home
document.querySelector('#skip').onclick    = function () { show(home) } // name entry: leave without saving

// home: View scoreboard - fetch current data, then show the table
document.querySelector('#view').onclick = function () {
  fetch('/api/scores')
    .then(function (r) { return r.json() })
    .then(function (rows) {
      drawScores(rows)
      show(scoreboard)
    })
}

// name entry, send the finished game's score, then show the updated table
document.querySelector('#scoreForm').onsubmit = function (e) {
  e.preventDefault()                                    // don't reload the page
  const name = document.querySelector('#name').value.trim()
  if (!name) return

  fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, hits: hits, durationSeconds: ROUND })
  })
    .then(function (r) { return r.json() })
    .then(function (rows) {
      drawScores(rows)
      show(scoreboard)
    })
}

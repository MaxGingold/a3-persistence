require( 'dotenv' ).config()

const express       = require( 'express' ),
      mongoose      = require( 'mongoose' ),
      path          = require( 'path' ),
      bcrypt        = require( 'bcrypt' ),
      morgan        = require( 'morgan' ),
      helmet        = require( 'helmet' ),
      compression   = require( 'compression' ),
      session       = require( 'express-session' ),
      MongoStore    = require( 'connect-mongo' ).MongoStore,
      passport      = require( 'passport' ),
      LocalStrategy = require( 'passport-local' ).Strategy,
      GitHubStrategy = require( 'passport-github2' ).Strategy,
      Score         = require( './models/Score' ),
      User          = require( './models/User' ),
      dir           = 'public/',
      port          = 3000

mongoose.connect( process.env.MONGODB_URI )
  .then( () => console.log( 'Connected to MongoDB' ) )
  .catch( err => console.error( 'MongoDB connection error:', err.message ) )

const app = express()
app.use( helmet() )
app.use( morgan( 'dev' ) )
app.use( compression() )
app.use( express.json() )

app.use( session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}) )

app.use( passport.initialize() )
app.use( passport.session() )

// Local strategy: look up the username, auto-creating an account (with a
// hashed password) the first time it's seen, per the assignment's allowance.
passport.use( new LocalStrategy( async function( username, password, done ) {
  try {
    username = username.trim()

    if( username === '' || !password ) {
      return done( null, false, { message: 'Username and password required' })
    }

    let user  = await User.findOne({ username })
    let isNew = false

    if( user === null ) {
      const passwordHash = await bcrypt.hash( password, 10 )
      user = await User.create({ username, passwordHash, displayName: username })
      isNew = true
    }else if( !user.passwordHash ) {
      return done( null, false, { message: 'This account uses GitHub login instead' })
    }else{
      const match = await bcrypt.compare( password, user.passwordHash )
      if( !match ) return done( null, false, { message: 'Incorrect password' })
    }

    return done( null, user, { isNew })
  }catch( err ) {
    return done( err )
  }
}) )

// GitHub strategy: find-or-create a User by their GitHub id.
passport.use( new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: process.env.GITHUB_CALLBACK_URL
}, async function( accessToken, refreshToken, profile, done ) {
  try {
    let user = await User.findOne({ githubId: profile.id })

    if( user === null ) {
      user = await User.create({
        githubId: profile.id,
        displayName: profile.username || profile.displayName || ( 'github-' + profile.id )
      })
    }

    return done( null, user )
  }catch( err ) {
    return done( err )
  }
}) )

passport.serializeUser( function( user, done ) {
  done( null, user._id )
})

passport.deserializeUser( async function( id, done ) {
  try {
    const user = await User.findById( id )
    done( null, user )
  }catch( err ) {
    done( err )
  }
})

const requireAuthPage = function( request, response, next ) {
  if( request.isAuthenticated() ) return next()
  response.redirect( '/login' )
}

const requireAuthApi = function( request, response, next ) {
  if( request.isAuthenticated() ) return next()
  response.status( 401 ).json({ error: 'Not logged in' })
}

// Auth pages/routes (public)
app.get( '/login', function( request, response ) {
  if( request.isAuthenticated() ) return response.redirect( '/' )
  response.sendFile( path.join( __dirname, 'public', 'login.html' ) )
})

app.post( '/auth/login', function( request, response, next ) {
  passport.authenticate( 'local', function( err, user, info ) {
    if( err ) return next( err )
    if( !user ) return response.status( 401 ).json({ error: ( info && info.message ) || 'Login failed' })

    request.logIn( user, function( err ) {
      if( err ) return next( err )
      response.json({ ok: true, isNew: !!( info && info.isNew ), displayName: user.displayName })
    })
  })( request, response, next )
})

app.get( '/auth/github', passport.authenticate( 'github' ) )

app.get( '/auth/github/callback',
  passport.authenticate( 'github', { failureRedirect: '/login' }),
  function( request, response ) {
    response.redirect( '/' )
  }
)

app.post( '/auth/logout', function( request, response, next ) {
  request.logout( function( err ) {
    if( err ) return next( err )
    response.json({ ok: true })
  })
})

app.get( '/api/me', requireAuthApi, function( request, response ) {
  response.json({ id: request.user._id.toString(), displayName: request.user.displayName })
})

// Main app page (protected)
app.get( '/', requireAuthPage, function( request, response ) {
  response.sendFile( path.join( __dirname, 'public', 'index.html' ) )
})

// Static assets (css/js) - served regardless of auth so the login page can use them too
app.use( express.static( dir ) )

// Computes hits per second from hits + duration.
const hitsPerSecond = function( hits, durationSeconds ) {
  return durationSeconds > 0
    ? Math.round( ( hits / durationSeconds ) * 100 ) / 100
    : 0
}

// The scores sorted highest-hits-first, shaped the same way the front end
// always expected (an `id` field, rather than Mongo's `_id`), plus an
// `ownerId` so the front end can tell which rows the current user owns.
const ranked = async function() {
  const rows = await Score.find().sort({ hits: -1 })

  return rows.map( row => ({
    id: row._id.toString(),
    ownerId: row.userId ? row.userId.toString() : null,
    name: row.name,
    hits: row.hits,
    durationSeconds: row.durationSeconds,
    hitsPerSecond: row.hitsPerSecond
  }) )
}

app.get( '/api/scores', requireAuthApi, async function( request, response ) {
  response.json( await ranked() )
})

app.post( '/api/scores', requireAuthApi, async function( request, response ) {
  const data = request.body

  // check the incoming fields
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  const hits = Number( data.hits )

  if( name === '' || !Number.isInteger( hits ) || hits < 0 ) {
    return response.status( 400 ).json({ error: 'Bad data' })
  }

  const duration = Number( data.durationSeconds ) > 0 ? Number( data.durationSeconds ) : 30

  await Score.create({
    userId: request.user._id,
    name: name,
    hits: hits,
    durationSeconds: duration,
    hitsPerSecond: hitsPerSecond( hits, duration )
  })

  response.json( await ranked() )
})

app.patch( '/api/scores/:id', requireAuthApi, async function( request, response ) {
  const id   = request.params.id
  const name = typeof request.body.name === 'string' ? request.body.name.trim() : ''

  if( !mongoose.isValidObjectId( id ) ) {
    return response.status( 404 ).json({ error: 'Not found' })
  }

  if( name === '' ) {
    return response.status( 400 ).json({ error: 'Bad data' })
  }

  const existing = await Score.findById( id )

  if( existing === null ) {
    return response.status( 404 ).json({ error: 'Not found' })
  }

  if( !existing.userId || !existing.userId.equals( request.user._id ) ) {
    return response.status( 403 ).json({ error: 'You can only rename your own scores' })
  }

  existing.name = name
  await existing.save()

  response.json( await ranked() )
})

app.delete( '/api/scores/:id', requireAuthApi, async function( request, response ) {
  const id = request.params.id

  if( !mongoose.isValidObjectId( id ) ) {
    return response.status( 404 ).json({ error: 'Not found' })
  }

  const existing = await Score.findById( id )

  if( existing === null ) {
    return response.status( 404 ).json({ error: 'Not found' })
  }

  if( !existing.userId || !existing.userId.equals( request.user._id ) ) {
    return response.status( 403 ).json({ error: 'You can only delete your own scores' })
  }

  await existing.deleteOne()

  response.json( await ranked() )
})

app.listen( process.env.PORT || port )

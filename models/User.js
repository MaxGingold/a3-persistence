const mongoose = require( 'mongoose' )

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  passwordHash: { type: String },
  githubId: { type: String, unique: true, sparse: true },
  displayName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model( 'User', userSchema )

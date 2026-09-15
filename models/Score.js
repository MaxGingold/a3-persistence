const mongoose = require( 'mongoose' )

const scoreSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  hits: { type: Number, required: true },
  durationSeconds: { type: Number, required: true },
  hitsPerSecond: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model( 'Score', scoreSchema )

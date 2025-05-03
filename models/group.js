const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  avatar: { type: String },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members: [{ 
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date, default: Date.now },
    role: { type: String, enum: ['member', 'admin'], default: 'member' }
  }],
  settings: {
    joinByLink: { type: Boolean, default: false },
    inviteLink: { type: String },
    sendMessages: { type: Boolean, default: true },
    editGroupInfo: { type: String, enum: ['admins', 'all'], default: 'admins' }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Group', GroupSchema);

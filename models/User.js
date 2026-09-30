const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'port_manager', 'ship_manager', 'inspector', 'viewer'],
    default: 'viewer'
  },
  department: {
    type: String,
    default: 'Maritime Operations'
  },
  assignedPort: {
    type: String,
    default: 'Mumbai Port'
  },
  assignedShipId: {
    type: String,
    default: null
  },
  avatar: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  approvedBy: {
    type: String,
    default: null
  },
  approvalDate: {
    type: Date,
    default: null
  },
  resetPasswordCode: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lastFailedLogin: {
    type: Date,
    default: null
  },
  lastFailedIp: {
    type: String,
    default: null
  },
  createdBy: {
    type: String,
    default: 'Self-Registration'
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);

const mongoose = require('mongoose');

const changeRequestSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  projectName: {
    type: String,
    required: true
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  requestedByName: {
    type: String,
    required: true
  },
  requestedByEmail: {
    type: String,
    required: true
  },
  requestedByRole: {
    type: String,
    default: 'developer'
  },
  changeType: {
    type: String,
    enum: ['BUDGET_INCREASE', 'SCOPE_CHANGE', 'TIMELINE_EXTENSION', 'STATUS_OVERRIDE', 'SECURITY_EXCEPTION', 'GENERAL_REQUEST'],
    default: 'BUDGET_INCREASE',
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  fieldName: {
    type: String,
    default: 'budget'
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  currency: {
    type: String,
    default: '₹'
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedByName: {
    type: String,
    default: null
  },
  reviewedByEmail: {
    type: String,
    default: null
  },
  reviewComment: {
    type: String,
    default: ''
  },
  reviewedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

changeRequestSchema.index({ status: 1, createdAt: -1 });
changeRequestSchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('ChangeRequest', changeRequestSchema);

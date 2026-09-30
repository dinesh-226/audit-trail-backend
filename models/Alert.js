const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  alertId: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['critical', 'high', 'medium', 'info'],
    default: 'info'
  },
  category: {
    type: String,
    enum: ['anomaly', 'inspection_failed', 'delay', 'status_change', 'unauthorized_access', 'hash_mismatch', 'general'],
    default: 'general'
  },
  entityType: {
    type: String,
    enum: ['Container', 'Ship', 'AuditLog', 'Inspection', 'User', 'System'],
    default: 'Container'
  },
  entityId: {
    type: String,
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('Alert', AlertSchema);

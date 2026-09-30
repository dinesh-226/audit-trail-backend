const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  auditId: {
    type: String,
    required: true,
    unique: true
  },
  sequenceNumber: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true
  },
  entityType: {
    type: String,
    enum: ['Container', 'Ship', 'Inspection', 'Evidence', 'User', 'System', 'Analytics', 'ReeferTemperature', 'PortActivity', 'Voyage', 'Report', 'Anomaly', 'Alert'],
    required: true
  },
  entityId: {
    type: String,
    required: true
  },
  previousValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  shipId: {
    type: String,
    default: null
  },
  containerId: {
    type: String,
    default: null
  },
  location: {
    type: String,
    default: 'Global Maritime Network'
  },
  ipAddress: {
    type: String,
    default: '127.0.0.1'
  },
  evidenceId: {
    type: String,
    default: null
  },
  evidenceFileName: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  previousHash: {
    type: String,
    required: true
  },
  currentHash: {
    type: String,
    required: true
  },
  nonce: {
    type: Number,
    default: 0
  },
  isGenesis: {
    type: Boolean,
    default: false
  },
  isTampered: {
    type: Boolean,
    default: false
  },
  tamperDetails: {
    type: String,
    default: null
  }
}, { timestamps: true });

// Ensure fast index lookup by auditId, sequenceNumber, containerId, shipId, action, and timestamp
AuditLogSchema.index({ sequenceNumber: 1 });
AuditLogSchema.index({ containerId: 1, timestamp: -1 });
AuditLogSchema.index({ shipId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);

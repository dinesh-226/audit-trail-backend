const mongoose = require('mongoose');

const AnomalySchema = new mongoose.Schema({
  anomalyId: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: [
      'UNLOADED_WITHOUT_ARRIVAL',
      'DUAL_SHIP_ASSIGNMENT',
      'TELEPORTATION_LOCATION_JUMP',
      'BURST_OPERATION_TAMPERING',
      'OUT_OF_SEQUENCE_STATUS',
      'DELIVERY_BEFORE_INSPECTION',
      'SEAL_TAMPER_EXCURSION',
      'TEMPERATURE_ANOMALY',
      'HASH_CHAIN_MISMATCH'
    ],
    required: true
  },
  severity: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'High'
  },
  entityType: {
    type: String,
    enum: ['Container', 'Ship', 'User', 'System'],
    default: 'Container'
  },
  entityId: {
    type: String,
    required: true
  },
  containerId: {
    type: String,
    default: null
  },
  shipId: {
    type: String,
    default: null
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  rootCause: {
    type: String,
    required: true
  },
  recommendedAction: {
    type: String,
    required: true
  },
  relatedAuditId: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['Active', 'Investigating', 'Resolved', 'Dismissed'],
    default: 'Active'
  },
  detectedAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolvedBy: {
    type: String,
    default: null
  },
  resolutionNotes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('Anomaly', AnomalySchema);

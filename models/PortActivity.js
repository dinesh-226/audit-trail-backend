const mongoose = require('mongoose');

const PortActivitySchema = new mongoose.Schema({
  activityId: {
    type: String,
    required: true,
    unique: true
  },
  port: {
    type: String,
    required: true,
    default: 'Mumbai Port'
  },
  activityType: {
    type: String,
    enum: [
      'GATE_IN',
      'GATE_OUT',
      'YARD_STACKING',
      'BERTH_ALLOCATION',
      'BERTH_DEPARTURE',
      'LOADING_CONFIRMED',
      'UNLOADING_CONFIRMED',
      'OPERATIONAL_DELAY',
      'INSPECTION_COORDINATION',
      'CONTAINER_HOLD',
      'GENERAL_OPERATION'
    ],
    required: true
  },
  entityType: {
    type: String,
    enum: ['Container', 'Ship', 'Berth', 'Yard', 'Gate', 'General'],
    default: 'Container'
  },
  entityId: {
    type: String,
    required: true
  },
  performedBy: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    default: 'port_manager'
  },
  details: {
    gateNumber: { type: String, default: null },
    truckNumber: { type: String, default: null },
    driverName: { type: String, default: null },
    sealNumber: { type: String, default: null },
    yardSlot: { type: String, default: null }, // e.g. Block A - Bay 04 - Row 02 - Tier 3
    yardBlock: { type: String, default: null },
    yardBay: { type: String, default: null },
    yardRow: { type: String, default: null },
    yardTier: { type: String, default: null },
    berthId: { type: String, default: null },
    vesselName: { type: String, default: null },
    craneNumber: { type: String, default: null },
    delayReason: { type: String, default: null },
    estimatedDelayHours: { type: Number, default: 0 },
    notes: { type: String, default: '' }
  },
  status: {
    type: String,
    enum: ['Completed', 'In Progress', 'On Hold', 'Flagged'],
    default: 'Completed'
  },
  auditId: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('PortActivity', PortActivitySchema);

const mongoose = require('mongoose');

const MilestoneSchema = new mongoose.Schema({
  milestoneId: { type: String },
  stage: {
    type: String,
    enum: ['BOOKED', 'READY FOR LOADING', 'LOADED', 'DEPARTED', 'IN TRANSIT', 'ARRIVED AT PORT', 'UNLOADED', 'INSPECTED', 'UNDER INSPECTION', 'DELIVERED', 'FLAGGED', 'DELAYED'],
    required: true
  },
  status: { type: String, required: true },
  location: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  performedBy: { type: String, default: 'System Dispatch' },
  userRole: { type: String, default: 'Operator' },
  shipId: { type: String, default: null },
  shipName: { type: String, default: null },
  notes: { type: String, default: '' },
  auditId: { type: String, default: null },
  hash: { type: String, default: null },
  evidenceId: { type: String, default: null }
}, { _id: false });

const ContainerSchema = new mongoose.Schema({
  containerId: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['Dry 20ft', 'Dry 40ft', 'Reefer 40ft', 'Tank 20ft', 'ISO Tank 20ft', 'Open Top 40ft', 'Flat Rack 40ft'],
    default: 'Dry 40ft'
  },
  size: {
    type: String,
    enum: ['20ft', '40ft', '40ft High Cube', '45ft High Cube', '45ft'],
    default: '40ft'
  },
  weightKg: {
    type: Number,
    required: true
  },
  cargoDescription: {
    type: String,
    required: true
  },
  origin: {
    type: String,
    required: true
  },
  destination: {
    type: String,
    required: true
  },
  currentLocation: {
    type: String,
    required: true
  },
  assignedShipId: {
    type: String,
    default: null
  },
  assignedShipName: {
    type: String,
    default: null
  },
  ownerCompany: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Booked', 'Ready for Loading', 'Loaded', 'In Transit', 'Arrived', 'Unloading', 'Under Inspection', 'Delivered', 'Delayed', 'Flagged'],
    default: 'Booked'
  },
  sealNumber: {
    type: String,
    default: 'SL-UNASSIGNED'
  },
  hazardClass: {
    type: String,
    default: 'Non-Hazardous'
  },
  temperatureCelsius: {
    type: Number,
    default: null
  },
  riskLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Low'
  },
  riskScore: {
    type: Number,
    default: 10
  },
  riskReasons: [{
    type: String
  }],
  expectedDurationHours: {
    type: Number,
    default: 120
  },
  actualDurationHours: {
    type: Number,
    default: 0
  },
  isDelayed: {
    type: Boolean,
    default: false
  },
  delayReason: {
    type: String,
    default: ''
  },
  journeyMilestones: [MilestoneSchema],
  createdDate: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('Container', ContainerSchema);

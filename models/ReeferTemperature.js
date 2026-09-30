const mongoose = require('mongoose');

const ReadingSchema = new mongoose.Schema({
  readingId: { type: String, required: true },
  temperature: { type: Number, required: true }, // in Celsius
  humidity: { type: Number, default: 85 }, // percentage
  powerStatus: { type: String, default: 'Connected / Grid' },
  source: {
    type: String,
    enum: ['Manual Inspection', 'Simulated IoT Stream', 'Handheld Thermometer Probe', 'Correction Entry'],
    default: 'Manual/Simulated Monitoring'
  },
  status: {
    type: String,
    enum: ['Normal', 'Warning', 'Critical', 'Sensor Offline', 'No Data', 'On Hold'],
    default: 'Normal'
  },
  recordedAt: { type: Date, default: Date.now },
  recordedBy: { type: String, required: true },
  userRole: { type: String, required: true },
  isCorrection: { type: Boolean, default: false },
  correctionReason: { type: String, default: null },
  notes: { type: String, default: '' },
  auditId: { type: String, default: null }
}, { _id: false });

const IncidentSchema = new mongoose.Schema({
  incidentId: { type: String, required: true, unique: true },
  containerId: { type: String, required: true },
  severity: {
    type: String,
    enum: ['Warning', 'Critical'],
    default: 'Warning'
  },
  status: {
    type: String,
    enum: ['New', 'Acknowledged', 'Open', 'Resolved', 'Closed'],
    default: 'New'
  },
  excursionType: {
    type: String,
    enum: ['Temperature High Spike', 'Temperature Low Drop', 'Power Loss', 'Sensor Communication Loss', 'Defrost Cycle Anomaly', 'Gasket Seal Leak'],
    required: true
  },
  detectedAt: { type: Date, default: Date.now },
  recordedTemperature: { type: Number, required: true },
  permittedRange: { type: String, required: true },
  durationMinutes: { type: Number, default: 15 },
  reportedBy: { type: String, default: 'System Cold-Chain Monitor' },
  acknowledgedBy: { type: String, default: null },
  acknowledgedAt: { type: Date, default: null },
  correctiveAction: { type: String, default: '' },
  resolvedBy: { type: String, default: null },
  resolvedAt: { type: Date, default: null },
  reinspectionRequired: { type: Boolean, default: false },
  reinspectionStatus: {
    type: String,
    enum: ['Pending', 'Passed', 'Failed', 'Not Required'],
    default: 'Not Required'
  },
  notes: { type: String, default: '' },
  auditId: { type: String, default: null }
}, { _id: false });

const InspectionChecklistSchema = new mongoose.Schema({
  inspectionId: { type: String, required: true },
  inspectorName: { type: String, required: true },
  inspectorRole: { type: String, default: 'inspector' },
  conductedAt: { type: Date, default: Date.now },
  checklist: [{
    item: { type: String, required: true },
    status: { type: String, enum: ['Pass', 'Fail', 'N/A'], default: 'Pass' },
    notes: { type: String, default: '' }
  }],
  result: {
    type: String,
    enum: ['Pass', 'Fail', 'Requires Maintenance'],
    default: 'Pass'
  },
  evidencePhotos: [{
    photoId: { type: String },
    fileName: { type: String },
    fileUrl: { type: String },
    fileHashSha256: { type: String },
    caption: { type: String },
    capturedAt: { type: Date, default: Date.now }
  }],
  notes: { type: String, default: '' },
  auditId: { type: String, default: null }
}, { _id: false });

const ReeferTemperatureSchema = new mongoose.Schema({
  containerId: {
    type: String,
    required: true,
    unique: true
  },
  cargoType: {
    type: String,
    required: true,
    default: 'Frozen Seafood'
  },
  // Temperature setpoint and permitted excursion thresholds
  targetTemperature: {
    type: Number,
    required: true,
    default: -18.0
  },
  minTemperature: {
    type: Number,
    required: true,
    default: -22.0
  },
  maxTemperature: {
    type: Number,
    required: true,
    default: -16.0
  },
  currentTemperature: {
    type: Number,
    required: true,
    default: -18.2
  },
  humidityPercent: {
    type: Number,
    default: 85
  },
  ventilationCfm: {
    type: Number,
    default: 15
  },
  powerStatus: {
    type: String,
    enum: ['Connected / Grid', 'Genset Active', 'Battery Backup', 'Disconnected / Offline'],
    default: 'Connected / Grid'
  },
  sensorStatus: {
    type: String,
    enum: ['Normal', 'Warning', 'Critical', 'Sensor Offline', 'No Data', 'On Hold'],
    default: 'Normal'
  },
  monitoringMode: {
    type: String,
    enum: ['Manual/Simulated Monitoring', 'IoT Sensor Telemetry (Simulation)'],
    default: 'Manual/Simulated Monitoring'
  },
  // Optional future IoT sensor telemetry fields
  sensorId: {
    type: String,
    default: 'REEFER-IOT-9021'
  },
  sensorModel: {
    type: String,
    default: 'Carrier Transicold DataCOLD 600'
  },
  batteryLevelPercent: {
    type: Number,
    default: 96
  },
  firmwareVersion: {
    type: String,
    default: 'v4.2.1-ColdGuard'
  },
  location: {
    type: String,
    default: 'Mumbai Port - Yard Block B (Reefer Stack #04)'
  },
  port: {
    type: String,
    default: 'Mumbai Port'
  },
  assignedShipId: {
    type: String,
    default: null
  },
  assignedShipName: {
    type: String,
    default: null
  },
  isQuarantineHold: {
    type: Boolean,
    default: false
  },
  holdReason: {
    type: String,
    default: null
  },
  lastReadingAt: {
    type: Date,
    default: Date.now
  },
  readings: [ReadingSchema],
  incidents: [IncidentSchema],
  inspections: [InspectionChecklistSchema]
}, { timestamps: true });

module.exports = mongoose.model('ReeferTemperature', ReeferTemperatureSchema);

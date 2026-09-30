const mongoose = require('mongoose');

const ChecklistItemSchema = new mongoose.Schema({
  item: { type: String, required: true },
  status: { type: String, enum: ['Pass', 'Fail', 'N/A'], default: 'Pass' },
  passed: { type: Boolean, default: true },
  comments: { type: String, default: '' },
  defectType: { type: String, default: null }, // e.g. 'Crack', 'Corrosion', 'Dent', 'Leakage', 'Broken Seal', 'Deformation'
  severity: { type: String, enum: ['Minor', 'Moderate', 'Major', 'Critical', null], default: null }
}, { _id: false });

const InspectionSchema = new mongoose.Schema({
  inspectionId: {
    type: String,
    required: true,
    unique: true
  },
  containerId: {
    type: String,
    required: true
  },
  shipId: {
    type: String,
    default: null
  },
  inspectorId: {
    type: String,
    required: true
  },
  inspectorName: {
    type: String,
    required: true
  },
  port: {
    type: String,
    required: true
  },
  inspectionType: {
    type: String,
    enum: [
      'Safety & Structural',
      'Customs & Border Control',
      'Reefer Temp & Integrity',
      'Dangerous Goods Compliance',
      'Seal Verification',
      'Cold Chain & Phytosanitary',
      'Radiation & Security Screening',
      'Post-Voyage Inbound Inspection'
    ],
    default: 'Safety & Structural'
  },
  status: {
    type: String,
    enum: [
      'Assigned',
      'In Progress',
      'Submitted',
      'Passed',
      'Failed',
      'On Hold',
      'Repair Required',
      'Re-inspection Required'
    ],
    default: 'Passed'
  },
  result: {
    type: String,
    enum: [
      'Passed',
      'Failed',
      'Requires Re-inspection',
      'Flagged for Quarantine',
      'On Hold',
      'Repair Required',
      'In Progress',
      'Assigned',
      'Submitted'
    ],
    default: 'Passed'
  },
  expectedSealNumber: {
    type: String,
    default: null
  },
  physicalSealNumber: {
    type: String,
    default: null
  },
  sealMatch: {
    type: Boolean,
    default: true
  },
  sealIntact: {
    type: Boolean,
    default: true
  },
  temperatureRecorded: {
    type: Number,
    default: null
  },
  checklist: [ChecklistItemSchema],
  defectsDetected: [{
    category: String,
    defect: String,
    severity: String,
    actionRequired: String
  }],
  recommendation: {
    type: String,
    default: 'Approve for Sea Loading'
  },
  notes: {
    type: String,
    default: ''
  },
  evidenceIds: [{
    type: String
  }],
  photographs: [{
    photoId: String,
    fileName: String,
    fileUrl: String,
    fileHashSha256: String,
    capturedAt: { type: Date, default: Date.now },
    caption: String
  }],
  gpsLocation: {
    lat: { type: Number, default: 18.94 },
    lng: { type: Number, default: 72.83 }
  },
  deviceInfo: {
    type: String,
    default: 'Rugged Port Inspector Tablet Pro #04'
  },
  auditId: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Inspection', InspectionSchema);

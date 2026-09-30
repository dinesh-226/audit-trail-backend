const mongoose = require('mongoose');

const EvidenceSchema = new mongoose.Schema({
  evidenceId: {
    type: String,
    required: true,
    unique: true
  },
  containerId: {
    type: String,
    required: true
  },
  auditId: {
    type: String,
    default: null
  },
  inspectionId: {
    type: String,
    default: null
  },
  fileName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    default: 'image/jpeg'
  },
  fileSize: {
    type: Number,
    default: 102400
  },
  fileUrl: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    default: ''
  },
  uploadedBy: {
    type: String,
    required: true
  },
  uploadedByRole: {
    type: String,
    default: 'Inspector'
  },
  category: {
    type: String,
    enum: ['Inspection Photo', 'Bill of Lading', 'Customs Clearance', 'Report PDF', 'Damage Evidence', 'Seal Verification Photo', 'Weight Certificate'],
    default: 'Inspection Photo'
  },
  description: {
    type: String,
    default: ''
  },
  fileHashSha256: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('Evidence', EvidenceSchema);

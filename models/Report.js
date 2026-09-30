const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  reportId: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  reportType: {
    type: String,
    enum: ['Comprehensive Audit Trail', 'Anomaly & Risk Assessment', 'Ship Voyage Activity', 'Container Inspection & Compliance', 'Tamper Verification Certificate'],
    default: 'Comprehensive Audit Trail'
  },
  dateRange: {
    startDate: { type: Date },
    endDate: { type: Date }
  },
  generatedBy: {
    type: String,
    required: true
  },
  generatedByRole: {
    type: String,
    default: 'Admin'
  },
  format: {
    type: String,
    enum: ['PDF', 'CSV', 'JSON'],
    default: 'PDF'
  },
  metricsSummary: {
    totalAudits: { type: Number, default: 0 },
    totalContainers: { type: Number, default: 0 },
    totalShips: { type: Number, default: 0 },
    anomaliesFound: { type: Number, default: 0 },
    highRiskContainers: { type: Number, default: 0 },
    integrityVerified: { type: Boolean, default: true }
  },
  integrityStatus: {
    type: String,
    enum: ['VERIFIED', 'COMPROMISED', 'PENDING'],
    default: 'VERIFIED'
  },
  tamperCheckDetails: {
    type: String,
    default: 'All SHA-256 blocks chained and verified'
  },
  dataSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('Report', ReportSchema);

const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    trim: true,
    uppercase: true,
    default: function() {
      return 'PROJ-' + Math.floor(100 + Math.random() * 900);
    }
  },
  description: {
    type: String,
    default: ''
  },
  budget: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Active', 'In Planning', 'Under Review', 'Completed', 'On Hold', 'Archived'],
    default: 'Active',
    index: true
  },
  category: {
    type: String,
    default: 'Software Development'
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  archivedAt: {
    type: Date,
    default: null
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  archiveReason: {
    type: String,
    default: ''
  },
  documents: [{
    name: { type: String, required: true },
    url: { type: String, default: '' },
    size: { type: String, default: '1.2 MB' },
    category: { type: String, default: 'Specification' },
    uploadedBy: { type: String, default: 'Team Member' },
    uploadedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Project', projectSchema);

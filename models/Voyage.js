const mongoose = require('mongoose');

const WaypointSchema = new mongoose.Schema({
  name: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  passed: { type: Boolean, default: false },
  passedAt: { type: Date, default: null }
}, { _id: false });

const VoyageDelaySchema = new mongoose.Schema({
  reason: { type: String, required: true },
  delayHours: { type: Number, required: true },
  reportedAt: { type: Date, default: Date.now },
  mitigation: { type: String, default: '' },
  reportedBy: { type: String, default: 'Ship Master' }
}, { _id: false });

const VoyageSchema = new mongoose.Schema({
  voyageId: {
    type: String,
    required: true,
    unique: true
  },
  shipId: {
    type: String,
    required: true
  },
  shipName: {
    type: String,
    required: true
  },
  imoNumber: {
    type: String,
    required: true
  },
  departurePort: {
    type: String,
    required: true
  },
  arrivalPort: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Planned', 'In Transit', 'Delayed', 'Diverted', 'Arrived', 'Completed'],
    default: 'In Transit'
  },
  plannedDepartureDate: {
    type: Date,
    default: Date.now
  },
  actualDepartureDate: {
    type: Date,
    default: Date.now
  },
  estimatedArrivalTime: {
    type: Date,
    required: true
  },
  actualArrivalTime: {
    type: Date,
    default: null
  },
  speedKnots: {
    type: Number,
    default: 19.5
  },
  headingDegrees: {
    type: Number,
    default: 312
  },
  currentCoordinates: {
    lat: { type: Number, default: 14.82 },
    lng: { type: Number, default: 74.15 }
  },
  waypoints: [WaypointSchema],
  delays: [VoyageDelaySchema],
  cargoContainersCount: {
    type: Number,
    default: 0
  },
  totalCargoWeightKg: {
    type: Number,
    default: 0
  },
  seaConditions: {
    waveMeters: { type: Number, default: 1.8 },
    windKnots: { type: Number, default: 14 },
    condition: { type: String, default: 'Fair Moderate Seas' }
  },
  portCoordination: {
    requestedBerth: { type: String, default: 'Berth 01 (Quay North)' },
    berthingConfirmed: { type: Boolean, default: false },
    pilotBoardingTime: { type: Date, default: null },
    portNotes: { type: String, default: '' }
  },
  voyageNotes: {
    type: String,
    default: ''
  },
  auditId: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Voyage', VoyageSchema);

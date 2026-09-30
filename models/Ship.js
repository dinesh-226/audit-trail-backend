const mongoose = require('mongoose');

const ShipSchema = new mongoose.Schema({
  shipId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  imoNumber: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['Container Carrier', 'Ultra Large Container Vessel', 'Panamax Container Ship', 'Feeder Container Ship', 'LNG Dual-Fuel Megamax Carrier', 'Second-Generation Triple-E Carrier'],
    default: 'Container Carrier'
  },
  capacityTEU: {
    type: Number,
    required: true
  },
  currentLocation: {
    type: String,
    required: true
  },
  destination: {
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
    enum: ['Docked', 'Loading', 'Ready to Depart', 'In Transit', 'Arrived', 'Unloading', 'Under Inspection', 'Maintenance'],
    default: 'In Transit'
  },
  captain: {
    type: String,
    default: 'Capt. Jonathan Vance'
  },
  flag: {
    type: String,
    default: 'Panama'
  },
  containersOnboardCount: {
    type: Number,
    default: 0
  },
  coordinates: {
    lat: { type: Number, default: 18.94 },
    lng: { type: Number, default: 72.83 },
    heading: { type: Number, default: 90 },
    speedKnots: { type: Number, default: 16.5 }
  },
  eta: {
    type: Date
  },
  departureTime: {
    type: Date
  },
  arrivalTime: {
    type: Date
  },
  routeWaypoints: [{
    name: String,
    lat: Number,
    lng: Number,
    passed: { type: Boolean, default: false }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Ship', ShipSchema);

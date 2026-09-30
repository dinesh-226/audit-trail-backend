require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Route Modules
const authRoutes = require('./routes/auth');
const shipRoutes = require('./routes/ships');
const containerRoutes = require('./routes/containers');
const auditLogRoutes = require('./routes/auditLogs');
const inspectionRoutes = require('./routes/inspections');
const evidenceRoutes = require('./routes/evidence');
const anomalyRoutes = require('./routes/anomalies');
const alertRoutes = require('./routes/alerts');
const aiRoutes = require('./routes/ai');
const reportRoutes = require('./routes/reports');
const trackingRoutes = require('./routes/tracking');
const portActivityRoutes = require('./routes/portActivities');
const voyageRoutes = require('./routes/voyages');
const analyticsRoutes = require('./routes/analytics');
const temperatureRoutes = require('./routes/temperature');

const { seedDatabase } = require('./services/seedDataService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo-user', 'x-demo-role']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger debug helper
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production' && req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString().substring(11, 19)}] ${req.method} ${req.path}`);
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/ships', shipRoutes);
app.use('/api/containers', containerRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/anomalies', anomalyRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/port-activities', portActivityRoutes);
app.use('/api/voyages', voyageRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/temperature', temperatureRoutes);

// Health & System Diagnostics Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'AI-Powered Container Ship Audit Trail & Monitoring System',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    databaseName: mongoose.connection.name || 'Trail',
    databaseHost: mongoose.connection.host || 'Atlas Cluster'
  });
});

// Force Database Re-seed endpoint (Admin demo convenience)
app.post('/api/system/reseed', async (req, res) => {
  try {
    delete require.cache[require.resolve('./services/seedDataService')];
    const { seedDatabase } = require('./services/seedDataService');
    await seedDatabase(true);
    res.json({ message: 'Maritime database re-seeded successfully with fresh demo dataset' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to re-seed database', details: error.message });
  }
});

// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`🚀 ContainerShip Audit Trail Server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoints live at http://localhost:${PORT}/api/`);
});

// MongoDB Connection with Auto-Retry & Seed
async function connectMongoDB() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://dinesh:paurdinesh@ac-zlrzxsj-shard-00-00.qvm5csd.mongodb.net:27017,ac-zlrzxsj-shard-00-01.qvm5csd.mongodb.net:27017,ac-zlrzxsj-shard-00-02.qvm5csd.mongodb.net:27017/Trail?ssl=true&replicaSet=atlas-1197x8-shard-0&authSource=admin&retryWrites=true&w=majority';
  console.log(`📡 Connecting to MongoDB Atlas Database...`);
  
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      autoIndex: true
    });
    console.log(`✅ Successfully connected to MongoDB Atlas Database: "${mongoose.connection.name}"`);
    
    // Auto seed on startup if database is empty
    await seedDatabase(false);
  } catch (error) {
    console.error('❌ MongoDB Atlas Connection Error:', error.message);
    console.log('🔄 Retrying MongoDB connection in 5 seconds...');
    setTimeout(connectMongoDB, 5000);
  }
}

connectMongoDB();

module.exports = app;

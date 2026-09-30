require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Project = require('./models/Project');
const AuditLog = require('./models/AuditLog');
const seedDatabase = require('./utils/seedData');

async function testAtlas() {
  console.log('Testing connection to MongoDB Atlas Cluster...');
  const uri = process.env.MONGO_URI;
  console.log('URI:', uri.replace(/:([^:@]+)@/, ':****@'));

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ Connected to MongoDB Atlas successfully!');
    
    // Seed database if empty
    await seedDatabase();

    const userCount = await User.countDocuments();
    const projectCount = await Project.countDocuments();
    const logCount = await AuditLog.countDocuments();

    console.log(`📊 Atlas DB Status for database "Trail":`);
    console.log(`   - Users: ${userCount}`);
    console.log(`   - Projects: ${projectCount}`);
    console.log(`   - Audit Logs: ${logCount}`);

    await mongoose.disconnect();
    console.log('✅ Disconnected cleanly.');
  } catch (err) {
    console.error('❌ Connection error:', err.message);
  }
}

testAtlas();

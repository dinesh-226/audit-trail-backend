require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const mongoose = require('mongoose');

const User = require('./models/User');
const Project = require('./models/Project');
const Task = require('./models/Task');
const AuditLog = require('./models/AuditLog');
const ChangeRequest = require('./models/ChangeRequest');
const Report = require('./models/Report');

async function cleanDatabase() {
  console.log('🧹 Purging all data from MongoDB Atlas database "Trail"...');
  const uri = process.env.MONGO_URI || 'mongodb://dinesh:paurdinesh@ac-zlrzxsj-shard-00-00.qvm5csd.mongodb.net:27017,ac-zlrzxsj-shard-00-01.qvm5csd.mongodb.net:27017,ac-zlrzxsj-shard-00-02.qvm5csd.mongodb.net:27017/Trail?ssl=true&replicaSet=atlas-1197x8-shard-0&authSource=admin&retryWrites=true&w=majority';

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log('✅ Connected to MongoDB Atlas Database:', mongoose.connection.name);

    const [deletedLogs, deletedTasks, deletedProjects, deletedChangeRequests, deletedReports, deletedUsers] = await Promise.all([
      AuditLog.deleteMany({}),
      Task.deleteMany({}),
      Project.deleteMany({}),
      ChangeRequest.deleteMany({}),
      Report.deleteMany({}),
      User.deleteMany({})
    ]);

    console.log(`\n🗑️ Purge Summary:`);
    console.log(`   - Removed ${deletedLogs.deletedCount} Audit Logs`);
    console.log(`   - Removed ${deletedTasks.deletedCount} Tasks`);
    console.log(`   - Removed ${deletedProjects.deletedCount} Projects`);
    console.log(`   - Removed ${deletedChangeRequests.deletedCount} Change Requests`);
    console.log(`   - Removed ${deletedReports.deletedCount} Compliance Reports`);
    console.log(`   - Removed ${deletedUsers.deletedCount} Users`);

    console.log('\n✨ MongoDB Atlas database is now 100% clean and wiped empty.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to clean database:', err);
    process.exit(1);
  }
}

cleanDatabase();

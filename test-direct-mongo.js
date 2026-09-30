const mongoose = require('mongoose');

async function testDirect() {
  const directUri = 'mongodb://dinesh:paurdinesh@ac-zlrzxsj-shard-00-00.qvm5csd.mongodb.net:27017,ac-zlrzxsj-shard-00-01.qvm5csd.mongodb.net:27017,ac-zlrzxsj-shard-00-02.qvm5csd.mongodb.net:27017/Trail?ssl=true&replicaSet=atlas-1197x8-shard-0&authSource=admin&retryWrites=true&w=majority';
  console.log('Testing direct replicaSet connection...');
  try {
    await mongoose.connect(directUri, { serverSelectionTimeoutMS: 8000 });
    console.log('✅ Connected via direct replicaSet URI!');
    process.exit(0);
  } catch (e) {
    console.error('Direct connection result:', e.message);
    process.exit(1);
  }
}

testDirect();

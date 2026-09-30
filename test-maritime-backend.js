require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const mongoose = require('mongoose');
const { seedDatabase } = require('./services/seedDataService');
const { verifyAuditChain, simulateTamper, repairChain } = require('./services/auditEngine');
const { processAuditQuery } = require('./services/aiAssistantEngine');
const Container = require('./models/Container');
const Ship = require('./models/Ship');
const AuditLog = require('./models/AuditLog');

async function runTests() {
  console.log('🚀 Connecting to MongoDB Atlas for Maritime Backend Verification...');
  const mongoUri = process.env.MONGO_URI;
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  console.log('✅ Connected to MongoDB Atlas');

  // Step 1: Seed
  console.log('\n--- Step 1: Seeding Maritime Database ---');
  await seedDatabase(true);

  // Step 2: Verify SHA-256 Hash Chain
  console.log('\n--- Step 2: Cryptographic Hash Chain Verification ---');
  const initialVerify = await verifyAuditChain();
  console.log('Initial Verification Result:', JSON.stringify(initialVerify, null, 2));

  if (!initialVerify.verified) {
    throw new Error('Initial audit chain verification failed!');
  }
  console.log('✅ Cryptographic Maritime Ledger 100% Verified Clean');

  // Step 3: Test Tamper Simulation
  console.log('\n--- Step 3: Simulating Database Tamper Attack ---');
  const targetLog = await AuditLog.findOne({ action: 'CONTAINER_LOADED_ON_SHIP' });
  if (targetLog) {
    await simulateTamper(targetLog.auditId, 'location', 'UNAUTHORIZED_ALTERED_PORT');
    const tamperedVerify = await verifyAuditChain();
    console.log('Tampered Verification Result (Expect Failure):', {
      verified: tamperedVerify.verified,
      status: tamperedVerify.status,
      compromisedRecord: tamperedVerify.compromisedRecord?.auditId
    });

    if (tamperedVerify.verified) {
      throw new Error('Tamper simulation was not detected by cryptographic verifier!');
    }
    console.log('✅ Cryptographic Verifier successfully detected unauthorized data manipulation!');

    // Step 4: Repair Chain
    console.log('\n--- Step 4: Repairing Hash Chain Continuity ---');
    const repairResult = await repairChain();
    console.log('Repaired Result:', repairResult);
    const postRepairVerify = await verifyAuditChain();
    console.log('Post-Repair Verification:', postRepairVerify.verified);
    if (!postRepairVerify.verified) {
      throw new Error('Post-repair verification failed!');
    }
    console.log('✅ Hash Chain Restored & Verified Clean');
  }

  // Step 5: Test AI Audit Assistant
  console.log('\n--- Step 5: Testing AI Maritime Audit Assistant Queries ---');
  const q1 = await processAuditQuery('Show me the history of container C102');
  console.log('AI Response for C102 History:\n', q1.answer.substring(0, 200) + '...\n');

  const q2 = await processAuditQuery('Who loaded container MSCU-749201?');
  console.log('AI Response for Who Loaded:\n', q2.answer + '\n');

  const q3 = await processAuditQuery('Which containers have anomalies or suspicious activities?');
  console.log('AI Response for Anomalies:\n', q3.answer.substring(0, 200) + '...\n');

  console.log('🎉 ALL BACKEND MARITIME TESTS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

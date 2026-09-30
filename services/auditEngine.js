const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');

const GENESIS_PREVIOUS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Standardizes object payload to deterministic JSON string for hashing
 */
function normalizePayload(data) {
  if (data === null || data === undefined) return '';
  if (typeof data === 'object') {
    return JSON.stringify(data, Object.keys(data).sort());
  }
  return String(data);
}

/**
 * Generates cryptographic SHA-256 hash
 */
function computeRecordHash(params) {
  const {
    previousHash,
    sequenceNumber,
    timestamp,
    userId,
    action,
    entityType,
    entityId,
    previousValue,
    newValue,
    shipId,
    containerId,
    location,
    nonce
  } = params;

  const rawString = [
    previousHash || GENESIS_PREVIOUS_HASH,
    sequenceNumber,
    new Date(timestamp).toISOString(),
    userId || '',
    action || '',
    entityType || '',
    entityId || '',
    normalizePayload(previousValue),
    normalizePayload(newValue),
    shipId || '',
    containerId || '',
    location || '',
    nonce || 0
  ].join('|#|');

  return crypto.createHash('sha256').update(rawString).digest('hex');
}

/**
 * Creates and saves an immutable audit log into the chained ledger
 */
async function createAuditLog(entryData) {
  try {
    // Find the latest record to get the chain head
    const latestLog = await AuditLog.findOne().sort({ sequenceNumber: -1 });

    const sequenceNumber = latestLog ? latestLog.sequenceNumber + 1 : 1;
    const previousHash = latestLog ? latestLog.currentHash : GENESIS_PREVIOUS_HASH;
    const isGenesis = sequenceNumber === 1;
    const timestamp = entryData.timestamp ? new Date(entryData.timestamp) : new Date();

    const datePrefix = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
    const seqPadded = String(sequenceNumber).padStart(5, '0');
    const auditId = entryData.auditId || `AT-${datePrefix}-${seqPadded}`;

    const hashParams = {
      previousHash,
      sequenceNumber,
      timestamp,
      userId: entryData.userId || 'system-dispatch',
      action: entryData.action,
      entityType: entryData.entityType,
      entityId: entryData.entityId,
      previousValue: entryData.previousValue,
      newValue: entryData.newValue,
      shipId: entryData.shipId,
      containerId: entryData.containerId,
      location: entryData.location || 'Global Maritime Network',
      nonce: 0
    };

    const currentHash = computeRecordHash(hashParams);

    const auditLog = new AuditLog({
      auditId,
      sequenceNumber,
      timestamp,
      userId: entryData.userId || 'system-dispatch',
      username: entryData.username || 'System Engine',
      userRole: entryData.userRole || 'System',
      action: entryData.action,
      entityType: entryData.entityType,
      entityId: entryData.entityId,
      previousValue: entryData.previousValue,
      newValue: entryData.newValue,
      shipId: entryData.shipId || null,
      containerId: entryData.containerId || null,
      location: entryData.location || 'Global Maritime Network',
      ipAddress: entryData.ipAddress || '127.0.0.1',
      evidenceId: entryData.evidenceId || null,
      evidenceFileName: entryData.evidenceFileName || null,
      metadata: entryData.metadata || {},
      previousHash,
      currentHash,
      nonce: 0,
      isGenesis
    });

    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error('❌ Error creating audit log:', error);
    throw error;
  }
}

/**
 * Validates the full cryptographic SHA-256 chain from Genesis to Head
 */
async function verifyAuditChain() {
  const records = await AuditLog.find().sort({ sequenceNumber: 1 });

  if (records.length === 0) {
    return {
      verified: true,
      totalRecords: 0,
      verifiedCount: 0,
      compromisedRecord: null,
      status: 'VERIFIED_EMPTY',
      message: 'No audit logs found. Audit trail ledger is clean.'
    };
  }

  let expectedPreviousHash = GENESIS_PREVIOUS_HASH;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // Check 1: Previous hash link must match the preceding record's current hash
    if (record.previousHash !== expectedPreviousHash) {
      return {
        verified: false,
        totalRecords: records.length,
        verifiedCount: i,
        compromisedRecord: {
          auditId: record.auditId,
          sequenceNumber: record.sequenceNumber,
          action: record.action,
          entityId: record.entityId,
          timestamp: record.timestamp,
          expectedPreviousHash,
          actualPreviousHash: record.previousHash
        },
        status: 'CHAIN_LINK_BROKEN',
        message: `Hash link broken at record #${record.sequenceNumber} (${record.auditId}). Previous hash mismatch.`
      };
    }

    // Check 2: Recomputed hash of the current record data must match currentHash
    const computedHash = computeRecordHash({
      previousHash: record.previousHash,
      sequenceNumber: record.sequenceNumber,
      timestamp: record.timestamp,
      userId: record.userId,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      previousValue: record.previousValue,
      newValue: record.newValue,
      shipId: record.shipId,
      containerId: record.containerId,
      location: record.location,
      nonce: record.nonce || 0
    });

    if (computedHash !== record.currentHash) {
      return {
        verified: false,
        totalRecords: records.length,
        verifiedCount: i,
        compromisedRecord: {
          auditId: record.auditId,
          sequenceNumber: record.sequenceNumber,
          action: record.action,
          entityId: record.entityId,
          timestamp: record.timestamp,
          storedHash: record.currentHash,
          computedHash
        },
        status: 'RECORD_CONTENT_TAMPERED',
        message: `Data tampering detected at record #${record.sequenceNumber} (${record.auditId}). Content hash does not match stored cryptographic hash.`
      };
    }

    expectedPreviousHash = record.currentHash;
  }

  return {
    verified: true,
    totalRecords: records.length,
    verifiedCount: records.length,
    compromisedRecord: null,
    status: 'VERIFIED_SECURE',
    latestHash: expectedPreviousHash,
    message: `All ${records.length} audit trail records cryptographically verified with 0 integrity violations.`
  };
}

/**
 * Simulates a database tampering attack for testing/demonstration
 */
async function simulateTamper(auditId, fieldToAltered, fakeValue) {
  const log = await AuditLog.findOne({ auditId });
  if (!log) {
    throw new Error(`Audit record ${auditId} not found`);
  }

  // Intentionally alter content in DB without updating currentHash to trigger tamper detection
  log[fieldToAltered] = fakeValue;
  log.isTampered = true;
  log.tamperDetails = `Simulated unauthorized modification of field "${fieldToAltered}" to "${JSON.stringify(fakeValue)}"`;
  
  // Note: we save without updating currentHash to simulate illicit DB record tampering
  await AuditLog.collection.updateOne(
    { auditId },
    { $set: { [fieldToAltered]: fakeValue, isTampered: true, tamperDetails: log.tamperDetails } }
  );

  return log;
}

/**
 * Repairs / re-hashes the audit trail ledger
 */
async function repairChain() {
  const records = await AuditLog.find().sort({ sequenceNumber: 1 });
  let previousHash = GENESIS_PREVIOUS_HASH;

  for (const record of records) {
    record.previousHash = previousHash;
    record.isTampered = false;
    record.tamperDetails = null;
    record.currentHash = computeRecordHash({
      previousHash: record.previousHash,
      sequenceNumber: record.sequenceNumber,
      timestamp: record.timestamp,
      userId: record.userId,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      previousValue: record.previousValue,
      newValue: record.newValue,
      shipId: record.shipId,
      containerId: record.containerId,
      location: record.location,
      nonce: record.nonce || 0
    });

    await record.save();
    previousHash = record.currentHash;
  }

  return { repairedCount: records.length };
}

module.exports = {
  createAuditLog,
  computeRecordHash,
  verifyAuditChain,
  simulateTamper,
  repairChain,
  GENESIS_PREVIOUS_HASH
};

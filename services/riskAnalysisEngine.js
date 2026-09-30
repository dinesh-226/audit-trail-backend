const Anomaly = require('../models/Anomaly');
const Inspection = require('../models/Inspection');
const Container = require('../models/Container');

/**
 * Calculates dynamic multi-factor risk score and reasons for a container
 */
async function calculateContainerRisk(container) {
  let score = 5;
  const reasons = [];

  const cId = container.containerId;

  // 1. Check active anomalies
  const anomalies = await Anomaly.find({
    entityId: cId,
    status: { $in: ['Active', 'Investigating'] }
  });

  for (const anm of anomalies) {
    if (anm.severity === 'Critical') {
      score += 35;
      reasons.push(`Critical anomaly: ${anm.title}`);
    } else if (anm.severity === 'High') {
      score += 20;
      reasons.push(`High severity anomaly: ${anm.title}`);
    } else if (anm.severity === 'Medium') {
      score += 10;
      reasons.push(`Operational anomaly: ${anm.title}`);
    }
  }

  // 2. Check failed inspections
  const failedInspections = await Inspection.find({
    containerId: cId,
    result: { $in: ['Failed', 'Flagged for Quarantine'] }
  });

  if (failedInspections.length > 0) {
    score += 30;
    reasons.push(`${failedInspections.length} failed safety/customs inspection(s) recorded`);
  }

  // 3. Delay factors
  if (container.isDelayed) {
    score += 20;
    reasons.push(`Operational delay detected (${container.delayReason || 'Transit duration exceeded SLA'})`);
  }

  // 4. Hazardous Cargo factors
  if (container.hazardClass && container.hazardClass !== 'Non-Hazardous') {
    score += 15;
    reasons.push(`Dangerous cargo classification: ${container.hazardClass}`);
  }

  // 5. Reefer Temperature deviation
  if (container.type === 'Reefer 40ft' && container.temperatureCelsius !== null && container.temperatureCelsius > -12) {
    score += 25;
    reasons.push(`Cold-chain temperature excursion (${container.temperatureCelsius}°C exceeds threshold)`);
  }

  // 6. Seal check
  if (container.sealNumber === 'SL-UNASSIGNED' || container.sealNumber?.includes('COMPROMISED')) {
    score += 25;
    reasons.push('Container security seal unverified or marked compromised');
  }

  // Cap score between 0 and 100
  const finalScore = Math.min(100, Math.max(0, score));

  let riskLevel = 'Low';
  if (finalScore >= 80) {
    riskLevel = 'Critical';
  } else if (finalScore >= 55) {
    riskLevel = 'High';
  } else if (finalScore >= 25) {
    riskLevel = 'Medium';
  }

  if (reasons.length === 0) {
    reasons.push('Normal operational parameters verified with no security flags');
  }

  // Update container record
  container.riskScore = finalScore;
  container.riskLevel = riskLevel;
  container.riskReasons = reasons;

  await container.save();

  return {
    containerId: cId,
    riskScore: finalScore,
    riskLevel,
    riskReasons: reasons
  };
}

module.exports = {
  calculateContainerRisk
};

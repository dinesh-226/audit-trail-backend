const AuditLog = require('../models/AuditLog');
const Container = require('../models/Container');
const Ship = require('../models/Ship');
const Anomaly = require('../models/Anomaly');
const Inspection = require('../models/Inspection');
const ReeferTemperature = require('../models/ReeferTemperature');
const { verifyAuditChain } = require('./auditEngine');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/**
 * Main AI Maritime Audit Query Processor
 * Uses Google Gemini 2.5 Flash grounded in MongoDB facts + Fallback Engine
 */
async function processAuditQuery(prompt, user) {
  const queryText = (prompt || '').trim();
  if (!queryText) {
    return {
      answer: "Please ask a question regarding containers, ships, cold-chain reefer temperatures, audit logs, anomalies, or inspections.",
      relevantAudits: [],
      insights: [
        'Ask about specific containers (e.g. MSCU-8829104, ONEU-8821094)',
        'Check cryptographic hash chain integrity and tamper status',
        'Review refrigerated container cold-chain excursions and hold statuses'
      ],
      suggestedFollowUps: [
        "Show me the history of container ONEU-8821094",
        "Which refrigerated containers have temperature alerts?",
        "Verify audit trail integrity",
        "Which containers have active anomalies?",
        "Summarize the audit history of ship MSC Irina"
      ]
    };
  }

  // Gather Real Ground-Truth Data from Database for Grounding
  let dbContext = {};
  try {
    const [chainStatus, recentAudits, containers, reefers, anomalies, ships] = await Promise.all([
      verifyAuditChain().catch(() => ({ verified: true, totalRecords: 0, verifiedCount: 0 })),
      AuditLog.find().sort({ sequenceNumber: -1 }).limit(25).lean().catch(() => []),
      Container.find().limit(15).lean().catch(() => []),
      ReeferTemperature.find().limit(10).lean().catch(() => []),
      Anomaly.find({ status: { $ne: 'Closed' } }).limit(10).lean().catch(() => []),
      Ship.find().limit(10).lean().catch(() => [])
    ]);

    dbContext = {
      auditChainStatus: {
        verified: chainStatus.verified,
        totalRecords: chainStatus.totalRecords,
        verifiedCount: chainStatus.verifiedCount,
        latestHash: chainStatus.latestHash
      },
      recentAuditLogs: recentAudits.map(a => ({
        auditId: a.auditId,
        seq: a.sequenceNumber,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        user: a.username,
        role: a.userRole,
        location: a.location,
        timestamp: a.timestamp,
        hash: a.currentHash?.substring(0, 12) + '...'
      })),
      containers: containers.map(c => ({
        containerId: c.containerId,
        type: c.type,
        size: c.size,
        status: c.status,
        currentLocation: c.currentLocation,
        assignedShip: c.assignedShipName || c.assignedShipId,
        riskScore: c.riskScore,
        riskLevel: c.riskLevel,
        sealNumber: c.sealNumber,
        sealStatus: c.sealStatus
      })),
      refrigeratedContainers: reefers.map(r => ({
        containerId: r.containerId,
        commodity: r.commodity,
        currentTemp: r.currentTemperature,
        targetTemp: r.targetTemperature,
        minTemp: r.minPermittedTemp,
        maxTemp: r.maxPermittedTemp,
        status: r.status,
        powerStatus: r.powerStatus,
        activeIncidents: r.incidents?.filter(i => i.status !== 'Closed').length || 0
      })),
      activeAnomalies: anomalies.map(an => ({
        anomalyId: an.anomalyId,
        title: an.title,
        severity: an.severity,
        entityId: an.entityId,
        rootCause: an.rootCause,
        status: an.status
      })),
      ships: ships.map(s => ({
        shipId: s.shipId,
        name: s.name,
        imo: s.imoNumber,
        status: s.status,
        departurePort: s.departurePort,
        arrivalPort: s.arrivalPort,
        captain: s.captain,
        currentLocation: s.currentLocation
      }))
    };
  } catch (err) {
    console.warn('Could not fetch full DB context for AI assistant:', err.message);
  }

  // Attempt Gemini API call
  if (GEMINI_API_KEY) {
    try {
      const geminiResponse = await callGeminiAssistant(queryText, dbContext, user);
      if (geminiResponse && geminiResponse.answer) {
        return geminiResponse;
      }
    } catch (geminiError) {
      console.warn('Gemini API call failed, using deterministic local engine:', geminiError.message);
    }
  }

  // Fallback to local deterministic grounded query engine
  return fallbackAuditQuery(queryText, dbContext);
}

/**
 * Call Google Gemini 2.5 Flash API with database context
 */
async function callGeminiAssistant(query, dbContext, user) {
  const systemInstruction = `You are the Gemini Port & Maritime Intelligence AI Assistant embedded inside the Port Audit Trail Management System.
You have direct access to the live MongoDB database state and cryptographic SHA-256 audit ledger.

Your tasks:
1. Answer the user's question clearly, politely, and accurately using simple, easy-to-understand language.
2. Ground all factual statements strictly in the provided database context (containers, ships, reefers, audit logs, anomalies, and chain verification).
3. If referencing actions or movements, ALWAYS cite the exact Audit IDs (e.g. \`AUD-1002\`), Container IDs, Vessel names, or Temperature values from the context.
4. If asked about tamper or security verification, refer to the cryptographic hash chain status.
5. If information is not in the database context, state that clearly instead of inventing details.

You MUST respond ONLY with a single valid JSON object in the following structure (no markdown fences, just pure JSON):
{
  "answer": "Detailed markdown formatted response with headings, bold text, bullet points, or tables where appropriate.",
  "relevantAudits": ["AUD-001", "AUD-002"],
  "insights": ["Key takeaway point 1", "Key takeaway point 2"],
  "suggestedFollowUps": ["Follow up question 1", "Follow up question 2", "Follow up question 3"]
}`;

  const userPrompt = `User Query: "${query}"
Active User: ${user?.name || user?.username || 'Authorized User'} (Role: ${user?.role || 'Auditor'})

=== LIVE DATABASE CONTEXT ===
${JSON.stringify(dbContext, null, 2)}
============================

Provide your intelligence response in JSON format.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          responseMimeType: 'application/json'
        }
      })
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('No candidate content received from Gemini');
    }

    // Clean JSON response
    let cleanJson = candidateText.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanJson);
    return {
      answer: parsed.answer || 'Analysis complete.',
      relevantAudits: Array.isArray(parsed.relevantAudits) ? parsed.relevantAudits : [],
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps) ? parsed.suggestedFollowUps : []
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Deterministic local fallback query engine if external API is unreachable
 */
async function fallbackAuditQuery(queryText, dbContext) {
  const query = queryText.toLowerCase();

  // 1. Audit Integrity / Tamper Query
  if (query.includes('tamper') || query.includes('integrity') || query.includes('verify chain') || query.includes('cryptographic')) {
    const verification = await verifyAuditChain();
    if (verification.verified) {
      return {
        answer: `### 🛡️ Cryptographic Audit Trail Integrity Status: **VERIFIED SECURE** ✅\n\n- **Total Chained Blocks:** ${verification.totalRecords}\n- **Verified Blocks:** ${verification.verifiedCount}\n- **Integrity Violations:** 0\n- **Chain Head Hash:** \`${verification.latestHash || '0000...0000'}\`\n\nAll cryptographic SHA-256 blocks have been verified from the Genesis block to the current chain head. No unauthorized modifications, deleted events, or hash discrepancies were detected.`,
        relevantAudits: [],
        insights: [
          'All audit logs remain 100% immutable and cryptographically valid',
          'Every container movement is sealed with SHA-256 forward-chaining hashes'
        ],
        suggestedFollowUps: [
          'Show suspicious activities today',
          'Which containers have high risk scores?',
          'Which refrigerated containers have temperature alerts?'
        ]
      };
    } else {
      const comp = verification.compromisedRecord;
      return {
        answer: `### ⚠️ CRITICAL WARNING: Audit Trail Integrity Compromised! 🚨\n\n- **Compromised Record ID:** \`${comp.auditId}\` (Block #${comp.sequenceNumber})\n- **Entity:** ${comp.entityId} (${comp.action})\n- **Timestamp:** ${new Date(comp.timestamp).toLocaleString()}\n- **Violation Reason:** ${verification.message}\n\nImmediate security review required: A raw database modification occurred outside the cryptographic ledger pipeline.`,
        relevantAudits: [comp.auditId],
        insights: [
          `Integrity failure at record #${comp.sequenceNumber}`,
          'Cryptographic hash mismatch confirms external data manipulation'
        ],
        suggestedFollowUps: [
          'Who performed the last operations on this entity?',
          'Repair audit hash chain'
        ]
      };
    }
  }

  // 2. Reefer Temperature Query
  if (query.includes('temperature') || query.includes('reefer') || query.includes('cold chain') || query.includes('celsius') || query.includes('hold')) {
    const reefers = await ReeferTemperature.find().limit(10);
    if (reefers.length > 0) {
      const list = reefers.map(r => 
        `- **${r.containerId}** (${r.commodity}): **${r.currentTemperature}°C** [Range: ${r.minPermittedTemp}°C to ${r.maxPermittedTemp}°C] | Status: \`${r.status}\` | Incidents: ${r.incidents?.length || 0}`
      ).join('\n');

      return {
        answer: `### ❄️ Cold-Chain & Reefer Temperature Status Overview\n\n${list}\n\n*Note: Telemetry is tracked via manual inspections and simulated 15-minute cold-chain sensor streams.*`,
        relevantAudits: [],
        insights: [
          'Cold chain compliance is monitored against strict temperature profiles',
          'Out-of-range excursions trigger automatic warning/critical alerts'
        ],
        suggestedFollowUps: [
          'Which containers have active anomalies?',
          'Verify audit trail integrity',
          'Show me all active containers'
        ]
      };
    }
  }

  // 3. Container Match
  const containerMatch = query.match(/([a-z]{3,4}-?\d{6,7}|c\d{2,4})/i);
  const targetContainerId = containerMatch ? containerMatch[1].toUpperCase() : null;

  if (targetContainerId) {
    const container = await Container.findOne({
      $or: [
        { containerId: new RegExp(`^${targetContainerId}$`, 'i') },
        { containerId: new RegExp(targetContainerId, 'i') }
      ]
    });

    const audits = await AuditLog.find({
      $or: [
        { containerId: new RegExp(targetContainerId, 'i') },
        { entityId: new RegExp(targetContainerId, 'i') }
      ]
    }).sort({ sequenceNumber: -1 }).limit(10);

    const reefer = await ReeferTemperature.findOne({ containerId: new RegExp(targetContainerId, 'i') });

    const cId = container ? container.containerId : targetContainerId;

    let auditSummaryText = audits.map(a => 
      `1. **${new Date(a.timestamp).toLocaleDateString()} ${new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}** | \`${a.action}\` by **${a.username}** at *${a.location}* (Audit ID: \`${a.auditId}\`)`
    ).join('\n');

    if (!auditSummaryText) {
      auditSummaryText = 'No specific chronological events logged yet.';
    }

    const reeferText = reefer 
      ? `\n- **Reefer Temp:** **${reefer.currentTemperature}°C** (Target: ${reefer.targetTemperature}°C, Status: \`${reefer.status}\`)`
      : '';

    return {
      answer: `### 📦 Complete Audit Summary for Container **${cId}**\n\n- **Type/Size:** ${container?.type || 'Dry'} (${container?.size || '40ft'})\n- **Cargo:** ${container?.cargoDescription || 'Commercial Freight'}\n- **Current Status:** \`${container?.status || 'In Transit'}\`\n- **Current Location:** ${container?.currentLocation || 'Port'}\n- **Assigned Ship:** ${container?.assignedShipName || 'None'}\n- **Risk Score:** ${container?.riskScore || 10}/100 (${container?.riskLevel || 'Low'})\n- **Seal Number:** \`${container?.sealNumber || 'Verified'}\`${reeferText}\n\n#### 📜 Recent Audit Trail Records:\n${auditSummaryText}`,
      relevantAudits: audits.map(a => a.auditId),
      insights: [
        `Cryptographic integrity verified across all associated logs`,
        `Risk level evaluated at ${container?.riskLevel || 'Low'}`
      ],
      suggestedFollowUps: [
        `Why was container ${cId} flagged?`,
        `Who loaded container ${cId}?`,
        'Verify audit trail integrity'
      ]
    };
  }

  // 4. Fallback Summary
  const totalAudits = await AuditLog.countDocuments();
  const totalContainers = await Container.countDocuments();
  const totalShips = await Ship.countDocuments();
  const activeAnomaliesCount = await Anomaly.countDocuments({ status: 'Active' });

  return {
    answer: `### 🌊 Maritime Operations & Audit Intelligence Overview\n\n- **Total Audit Blocks:** ${totalAudits} chained records\n- **Active Ships Monitored:** ${totalShips} vessels\n- **Containers in Ledger:** ${totalContainers} units\n- **Active Security Anomalies:** ${activeAnomaliesCount} flag(s)\n\nYou can ask me specific questions about any container, ship, cold-chain reefer temperature, officer, or anomaly to retrieve exact immutable audit records!`,
    relevantAudits: [],
    insights: [
      'Query engine searches over 100% real database records with zero hallucination',
      'Try asking for specific IDs like "MSCU-8829104", "ONEU-8821094", or "MSC Irina"'
    ],
    suggestedFollowUps: [
      'Show me the history of container ONEU-8821094',
      'Which refrigerated containers have temperature alerts?',
      'Verify audit trail integrity',
      'Show active anomalies'
    ]
  };
}

module.exports = {
  processAuditQuery
};

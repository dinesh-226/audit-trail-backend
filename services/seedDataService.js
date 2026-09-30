const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Ship = require('../models/Ship');
const Container = require('../models/Container');
const AuditLog = require('../models/AuditLog');
const Inspection = require('../models/Inspection');
const Evidence = require('../models/Evidence');
const Anomaly = require('../models/Anomaly');
const Alert = require('../models/Alert');
const Report = require('../models/Report');
const { computeRecordHash, GENESIS_PREVIOUS_HASH } = require('./auditEngine');

async function seedDatabase(force = false) {
  const existingCount = await Container.countDocuments();
  if (existingCount > 0 && !force) {
    console.log('📦 Database already seeded with maritime data.');
    return;
  }

  console.log('🌊 Seeding authentic 3 Ships, 3 Containers & Indian User dataset...');

  // Clear existing collections completely
  await User.deleteMany({});
  await Ship.deleteMany({});
  await Container.deleteMany({});
  await AuditLog.deleteMany({});
  await Inspection.deleteMany({});
  await Evidence.deleteMany({});
  await Anomaly.deleteMany({});
  await Alert.deleteMany({});
  await Report.deleteMany({});

  const salt = await bcrypt.genSalt(10);
  const defaultPassword = await bcrypt.hash('audit123', salt);

  // 1. Five Indian User Accounts
  const users = await User.insertMany([
    {
      userId: 'USR-001',
      name: 'Capt. Rajesh Menon',
      email: 'admin@auditflow.com',
      password: defaultPassword,
      role: 'admin',
      department: 'Fleet Governance & Cryptographic Security',
      assignedPort: 'Global Central Command',
      avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80'
    },
    {
      userId: 'USR-002',
      name: 'Sunita Rao',
      email: 'portmanager@auditflow.com',
      password: defaultPassword,
      role: 'port_manager',
      department: 'Mumbai Terminal Operations',
      assignedPort: 'Mumbai Port',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'
    },
    {
      userId: 'USR-003',
      name: 'Capt. Vikram Sengupta',
      email: 'shipmanager@auditflow.com',
      password: defaultPassword,
      role: 'ship_manager',
      department: 'Marine Vessel Operations',
      assignedPort: 'Singapore Port',
      assignedShipId: 'SH-101',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'
    },
    {
      userId: 'USR-004',
      name: 'Rahul Sharma',
      email: 'inspector@auditflow.com',
      password: defaultPassword,
      role: 'inspector',
      department: 'Customs & Safety Compliance',
      assignedPort: 'Mumbai Port',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80'
    },
    {
      userId: 'USR-005',
      name: 'Ananya Deshmukh',
      email: 'viewer@auditflow.com',
      password: defaultPassword,
      role: 'viewer',
      department: 'Compliance & Audit Observer',
      assignedPort: 'Nhava Sheva (JNPT) Port',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
    }
  ]);

  // 2. Exactly 3 Ships
  const ships = await Ship.insertMany([
    {
      shipId: 'SH-101',
      name: 'MSC Irina',
      imoNumber: 'IMO 9929429',
      type: 'Ultra Large Container Vessel',
      capacityTEU: 24346,
      currentLocation: 'Arabian Sea (18.94°N, 72.83°E)',
      destination: 'Mumbai Port',
      departurePort: 'Singapore Port',
      arrivalPort: 'Mumbai Port',
      status: 'In Transit',
      captain: 'Capt. Vikram Sengupta',
      flag: 'Panama',
      coordinates: {
        lat: 18.9412,
        lng: 72.8347,
        heading: 142,
        speedKnots: 19.4,
        lastUpdated: new Date()
      }
    },
    {
      shipId: 'SH-102',
      name: 'Ever Ace',
      imoNumber: 'IMO 9893890',
      type: 'Second-Generation Triple-E Carrier',
      capacityTEU: 23992,
      currentLocation: 'Malacca Strait (3.13°N, 101.68°E)',
      destination: 'Singapore Port',
      departurePort: 'Shanghai Port',
      arrivalPort: 'Singapore Port',
      status: 'In Transit',
      captain: 'Capt. Suresh Pillai',
      flag: 'Panama',
      coordinates: {
        lat: 3.1390,
        lng: 101.6869,
        heading: 198,
        speedKnots: 18.2,
        lastUpdated: new Date()
      }
    },
    {
      shipId: 'SH-103',
      name: 'CMA CGM Jacques Saadé',
      imoNumber: 'IMO 9839179',
      type: 'LNG Dual-Fuel Megamax Carrier',
      capacityTEU: 23112,
      currentLocation: 'Mumbai Port Berth 4',
      destination: 'Mumbai Port',
      departurePort: 'Dubai Port',
      arrivalPort: 'Mumbai Port',
      status: 'Docked',
      captain: 'Capt. Amitav Ghosh',
      flag: 'France',
      coordinates: {
        lat: 18.9500,
        lng: 72.8500,
        heading: 0,
        speedKnots: 0.0,
        lastUpdated: new Date()
      }
    }
  ]);

  // 3. Cryptographic Audit Trail Builder
  let currentSeq = 1;
  let lastHash = GENESIS_PREVIOUS_HASH;
  const createdAuditLogs = [];

  async function recordBlock(params) {
    const auditId = `AUD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(currentSeq).padStart(4, '0')}`;
    const timestamp = params.timestamp || new Date(Date.now() - (20 - currentSeq) * 3600000);
    const logData = {
      auditId,
      sequenceNumber: currentSeq,
      userId: params.userId || 'USR-001',
      username: params.username || 'Capt. Rajesh Menon',
      userRole: params.userRole || 'admin',
      action: params.action,
      entityType: params.entityType || 'Container',
      entityId: params.entityId,
      containerId: params.containerId || null,
      shipId: params.shipId || null,
      location: params.location || 'Mumbai Port',
      timestamp,
      previousHash: lastHash,
      previousValue: params.previousValue || null,
      newValue: params.newValue || null,
      notes: params.notes || `Cryptographic block #${currentSeq}`
    };

    const computedHash = computeRecordHash({
      previousHash: lastHash,
      sequenceNumber: currentSeq,
      timestamp,
      userId: logData.userId,
      action: logData.action,
      entityType: logData.entityType,
      entityId: logData.entityId,
      previousValue: logData.previousValue,
      newValue: logData.newValue,
      shipId: logData.shipId,
      containerId: logData.containerId,
      location: logData.location
    });
    logData.currentHash = computedHash;
    lastHash = computedHash;
    currentSeq++;

    const doc = await AuditLog.create(logData);
    createdAuditLogs.push(doc);
    return doc;
  }

  // Genesis block
  const block1 = await recordBlock({
    action: 'SYSTEM_LEDGER_INITIALIZED',
    entityType: 'System',
    entityId: 'LEDGER-ROOT-001',
    location: 'Mumbai Central Command',
    newValue: { status: 'INITIALIZED', standard: 'IMO/ISPS SHA-256' },
    notes: 'Cryptographic maritime audit trail initialized'
  });

  // Commissioned vessel block
  const block2 = await recordBlock({
    action: 'VESSEL_FLEET_COMMISSIONED',
    entityType: 'Ship',
    entityId: 'SH-101',
    shipId: 'SH-101',
    location: 'Singapore Port',
    newValue: { name: 'MSC Irina', imo: 'IMO 9929429', captain: 'Capt. Vikram Sengupta' }
  });

  // 4. Exactly 3 Containers

  // Container 1: ONEU-8821094 (In Transit on MSC Irina)
  const c1Book = await recordBlock({
    userId: 'USR-002',
    username: 'Sunita Rao',
    userRole: 'port_manager',
    action: 'CONTAINER_BOOKED',
    entityType: 'Container',
    entityId: 'ONEU-8821094',
    containerId: 'ONEU-8821094',
    location: 'Singapore Port Terminal 1',
    newValue: { status: 'Booked', cargo: 'Automotive Electronics & Microchips', seal: 'SL-884920-SEC' }
  });

  const c1Load = await recordBlock({
    userId: 'USR-003',
    username: 'Capt. Vikram Sengupta',
    userRole: 'ship_manager',
    action: 'CONTAINER_LOADED_ON_SHIP',
    entityType: 'Container',
    entityId: 'ONEU-8821094',
    containerId: 'ONEU-8821094',
    shipId: 'SH-101',
    location: 'Onboard MSC Irina (Singapore)',
    newValue: { status: 'Loaded', ship: 'MSC Irina' }
  });

  const c1Depart = await recordBlock({
    userId: 'USR-003',
    username: 'Capt. Vikram Sengupta',
    userRole: 'ship_manager',
    action: 'CONTAINER_DEPARTED_AT_SEA',
    entityType: 'Container',
    entityId: 'ONEU-8821094',
    containerId: 'ONEU-8821094',
    shipId: 'SH-101',
    location: 'Arabian Sea (18.94°N, 72.83°E)',
    newValue: { status: 'In Transit', speedKnots: 19.4 }
  });

  const container1 = await Container.create({
    containerId: 'ONEU-8821094',
    type: 'Dry 40ft',
    size: '40ft',
    weightKg: 26450,
    cargoDescription: 'Precision Automotive Electronics & Semiconductor Components',
    origin: 'Singapore Port',
    destination: 'Mumbai Port',
    currentLocation: 'Onboard MSC Irina (Arabian Sea)',
    assignedShipId: 'SH-101',
    assignedShipName: 'MSC Irina',
    ownerCompany: 'Ocean Network Express (ONE)',
    status: 'In Transit',
    sealNumber: 'SL-884920-SEC',
    hazardClass: 'Non-Hazardous',
    temperatureCelsius: null,
    riskLevel: 'Low',
    riskScore: 10,
    isDelayed: false,
    journeyMilestones: [
      {
        stage: 'BOOKED',
        status: 'Booked',
        location: 'Singapore Port Terminal 1',
        timestamp: c1Book.timestamp,
        performedBy: 'Sunita Rao',
        userRole: 'port_manager',
        auditId: c1Book.auditId,
        hash: c1Book.currentHash,
        notes: 'Container booked for maritime voyage to Mumbai Port'
      },
      {
        stage: 'LOADED',
        status: 'Loaded',
        location: 'Onboard MSC Irina (Singapore)',
        timestamp: c1Load.timestamp,
        performedBy: 'Capt. Vikram Sengupta',
        userRole: 'ship_manager',
        shipId: 'SH-101',
        shipName: 'MSC Irina',
        auditId: c1Load.auditId,
        hash: c1Load.currentHash,
        notes: 'Container manifested and stowed in Bay 14'
      },
      {
        stage: 'IN TRANSIT',
        status: 'In Transit',
        location: 'Arabian Sea (18.94°N, 72.83°E)',
        timestamp: c1Depart.timestamp,
        performedBy: 'Capt. Vikram Sengupta',
        userRole: 'ship_manager',
        shipId: 'SH-101',
        shipName: 'MSC Irina',
        auditId: c1Depart.auditId,
        hash: c1Depart.currentHash,
        notes: 'Vessel underway at 19.4 knots, ETA Mumbai Port'
      }
    ]
  });

  // Container 2: MSCU-7492014 (Under Inspection at Mumbai Port)
  const c2Book = await recordBlock({
    userId: 'USR-002',
    username: 'Sunita Rao',
    userRole: 'port_manager',
    action: 'CONTAINER_BOOKED',
    entityType: 'Container',
    entityId: 'MSCU-7492014',
    containerId: 'MSCU-7492014',
    location: 'Dubai Port Terminal 2',
    newValue: { status: 'Booked', cargo: 'Cold Chain Vaccines', temp: -20 }
  });

  const c2Arrive = await recordBlock({
    userId: 'USR-002',
    username: 'Sunita Rao',
    userRole: 'port_manager',
    action: 'CONTAINER_ARRIVED_PORT',
    entityType: 'Container',
    entityId: 'MSCU-7492014',
    containerId: 'MSCU-7492014',
    location: 'Mumbai Port Berth 4',
    newValue: { status: 'Arrived' }
  });

  const c2Inspect = await recordBlock({
    userId: 'USR-004',
    username: 'Rahul Sharma',
    userRole: 'inspector',
    action: 'CONTAINER_PHYSICAL_INSPECTION_PASSED',
    entityType: 'Container',
    entityId: 'MSCU-7492014',
    containerId: 'MSCU-7492014',
    location: 'Mumbai Port Customs Area',
    newValue: { status: 'Under Inspection', result: 'Passed', sealIntact: true }
  });

  const container2 = await Container.create({
    containerId: 'MSCU-7492014',
    type: 'Reefer 40ft',
    size: '40ft',
    weightKg: 21800,
    cargoDescription: 'Pharmaceutical Vaccines & Cold Chain Biologics',
    origin: 'Dubai Port',
    destination: 'Mumbai Port',
    currentLocation: 'Mumbai Port Customs Area',
    assignedShipId: 'SH-103',
    assignedShipName: 'CMA CGM Jacques Saadé',
    ownerCompany: 'Mediterranean Shipping Company (MSC)',
    status: 'Under Inspection',
    sealNumber: 'SL-749201-ISO',
    hazardClass: 'Non-Hazardous',
    temperatureCelsius: -20,
    riskLevel: 'Medium',
    riskScore: 35,
    isDelayed: false,
    riskReasons: ['Cold Chain Criticality: Reefer unit requires continuous temperature audit'],
    journeyMilestones: [
      {
        stage: 'BOOKED',
        status: 'Booked',
        location: 'Dubai Port Terminal 2',
        timestamp: c2Book.timestamp,
        performedBy: 'Sunita Rao',
        userRole: 'port_manager',
        auditId: c2Book.auditId,
        hash: c2Book.currentHash,
        notes: 'Temperature-controlled pharmaceutical cargo booked'
      },
      {
        stage: 'ARRIVED AT PORT',
        status: 'Arrived',
        location: 'Mumbai Port Berth 4',
        timestamp: c2Arrive.timestamp,
        performedBy: 'Sunita Rao',
        userRole: 'port_manager',
        auditId: c2Arrive.auditId,
        hash: c2Arrive.currentHash,
        notes: 'Vessel berthed, container moved to reefer inspection bay'
      },
      {
        stage: 'INSPECTED',
        status: 'Under Inspection',
        location: 'Mumbai Port Customs Area',
        timestamp: c2Inspect.timestamp,
        performedBy: 'Rahul Sharma',
        userRole: 'inspector',
        auditId: c2Inspect.auditId,
        hash: c2Inspect.currentHash,
        notes: 'Customs & Reefer integrity verified. Temperature -20°C confirmed intact.'
      }
    ]
  });

  // Container 3: MSKU-9102483 (Delivered at Singapore Depot)
  const c3Book = await recordBlock({
    userId: 'USR-001',
    username: 'Capt. Rajesh Menon',
    userRole: 'admin',
    action: 'CONTAINER_BOOKED',
    entityType: 'Container',
    entityId: 'MSKU-9102483',
    containerId: 'MSKU-9102483',
    location: 'Shanghai Port Terminal 3',
    newValue: { status: 'Booked', cargo: 'Industrial Robotics & Machinery' }
  });

  const c3Delivered = await recordBlock({
    userId: 'USR-002',
    username: 'Sunita Rao',
    userRole: 'port_manager',
    action: 'CONTAINER_DELIVERED',
    entityType: 'Container',
    entityId: 'MSKU-9102483',
    containerId: 'MSKU-9102483',
    location: 'Singapore Freight Depot 7',
    newValue: { status: 'Delivered', gateOut: true }
  });

  const container3 = await Container.create({
    containerId: 'MSKU-9102483',
    type: 'Dry 40ft',
    size: '40ft',
    weightKg: 28900,
    cargoDescription: 'High-Precision Industrial Robotics & CNC Machinery',
    origin: 'Shanghai Port',
    destination: 'Singapore Port',
    currentLocation: 'Singapore Freight Depot 7',
    assignedShipId: 'SH-102',
    assignedShipName: 'Ever Ace',
    ownerCompany: 'Maersk Line Ltd.',
    status: 'Delivered',
    sealNumber: 'SL-910248-VER',
    hazardClass: 'Non-Hazardous',
    temperatureCelsius: null,
    riskLevel: 'Low',
    riskScore: 10,
    isDelayed: false,
    journeyMilestones: [
      {
        stage: 'BOOKED',
        status: 'Booked',
        location: 'Shanghai Port Terminal 3',
        timestamp: c3Book.timestamp,
        performedBy: 'Capt. Rajesh Menon',
        userRole: 'admin',
        auditId: c3Book.auditId,
        hash: c3Book.currentHash,
        notes: 'Container booked for delivery to Singapore'
      },
      {
        stage: 'DELIVERED',
        status: 'Delivered',
        location: 'Singapore Freight Depot 7',
        timestamp: c3Delivered.timestamp,
        performedBy: 'Sunita Rao',
        userRole: 'port_manager',
        auditId: c3Delivered.auditId,
        hash: c3Delivered.currentHash,
        notes: 'Gate out authorization verified. Cargo successfully delivered to consignee.'
      }
    ]
  });

  // 5. Seed Real Physical Inspection Record
  const inspection1 = await Inspection.create({
    inspectionId: 'INS-20260925-001',
    containerId: 'MSCU-7492014',
    shipId: 'SH-103',
    inspectorId: 'USR-004',
    inspectorName: 'Rahul Sharma',
    port: 'Mumbai Port',
    inspectionType: 'Reefer Temp & Integrity',
    result: 'Passed',
    notes: 'Reefer data logger downloaded: temperature steadily maintained between -19.8°C and -20.4°C. High-security bolt seal verified intact.',
    sealIntact: true,
    temperatureRecorded: -20.1,
    checklist: [
      { item: 'High-Security Bolt Seal Physical Verification', passed: true, notes: 'Seal SL-749201-ISO fully intact with zero tampering signs' },
      { item: 'Cold Chain Digital Datalogger Telemetry Audit', passed: true, notes: 'Continuous sub-zero log verified' },
      { item: 'External Container Structural & Panel Inspection', passed: true, notes: 'No puncture, dent, or seal deformation detected' },
      { item: 'Customs Manifest & Bill of Lading Match', passed: true, notes: '100% matched with official customs manifest' },
      { item: 'Hazardous Materials & Dangerous Goods Check', passed: true, notes: 'Pharma medical cargo declared and verified' }
    ]
  });

  // 6. Seed Evidence Documents
  await Evidence.insertMany([
    {
      evidenceId: 'EVD-20260925-0001',
      containerId: 'MSCU-7492014',
      inspectionId: 'INS-20260925-001',
      fileName: 'msc_vaccine_coldchain_datalog.pdf',
      fileType: 'application/pdf',
      fileSize: 420000,
      fileUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&auto=format&fit=crop&q=80',
      uploadedBy: 'Rahul Sharma',
      uploadedByRole: 'inspector',
      category: 'Inspection Photo',
      description: 'Official Cold Chain Temperature Audit & Inspection Certificate',
      fileHashSha256: crypto.createHash('sha256').update('msc_vaccine_coldchain_datalog_cert_2026').digest('hex'),
      auditId: c2Inspect.auditId
    },
    {
      evidenceId: 'EVD-20260925-0002',
      containerId: 'ONEU-8821094',
      fileName: 'one_singapore_bill_of_lading.pdf',
      fileType: 'application/pdf',
      fileSize: 285000,
      fileUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=80',
      uploadedBy: 'Sunita Rao',
      uploadedByRole: 'port_manager',
      category: 'Bill of Lading',
      description: 'Official Ocean Bill of Lading for ONEU-8821094',
      fileHashSha256: crypto.createHash('sha256').update('one_singapore_bill_of_lading_2026').digest('hex'),
      auditId: c1Book.auditId
    }
  ]);

  // 7. Seed Initial Report
  await Report.create({
    reportId: 'RPT-20260925-0001',
    title: 'Executive Maritime Audit Trail & Fleet Operations Report',
    reportType: 'Comprehensive Audit Trail',
    dateRange: {
      startDate: new Date(Date.now() - 7 * 86400000),
      endDate: new Date()
    },
    generatedBy: 'Capt. Rajesh Menon',
    generatedByRole: 'admin',
    format: 'PDF',
    metricsSummary: {
      totalAudits: createdAuditLogs.length,
      totalContainers: 3,
      totalShips: 3,
      anomaliesFound: 0,
      highRiskContainers: 0,
      integrityVerified: true
    },
    integrityStatus: 'VERIFIED',
    tamperCheckDetails: 'All 8 cryptographic SHA-256 blocks verified with 0 violations.',
    dataSnapshot: {
      latestBlockHash: lastHash,
      sampleLogCount: createdAuditLogs.length
    }
  });

  console.log('✅ Maritime database successfully populated with 3 Ships, 3 Containers, and Indian Officers.');
}

module.exports = { seedDatabase };

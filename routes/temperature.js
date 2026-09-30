const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const ReeferTemperature = require('../models/ReeferTemperature');
const Container = require('../models/Container');
const Alert = require('../models/Alert');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditEngine');

/**
 * Seed initial sample reefer container profiles if none exist
 */
const seedInitialReeferData = async () => {
  const count = await ReeferTemperature.countDocuments();
  if (count > 0) return;

  const sampleReefers = [
    {
      containerId: 'MSCU-8829104',
      cargoType: 'Frozen Seafood (Atlantic Salmon)',
      targetTemperature: -20.0,
      minTemperature: -24.0,
      maxTemperature: -18.0,
      currentTemperature: -19.8,
      humidityPercent: 88,
      ventilationCfm: 10,
      powerStatus: 'Connected / Grid',
      sensorStatus: 'Normal',
      monitoringMode: 'Manual/Simulated Monitoring',
      sensorId: 'REEFER-IOT-9021',
      sensorModel: 'Carrier Transicold DataCOLD 600',
      location: 'Mumbai Port - Yard Block B (Reefer Stacks #04)',
      port: 'Mumbai Port',
      assignedShipId: 'SHP-001',
      assignedShipName: 'MSC Irina',
      readings: [
        { readingId: 'RD-101', temperature: -20.1, humidity: 88, source: 'Simulated IoT Stream', status: 'Normal', recordedAt: new Date(Date.now() - 3600000 * 6), recordedBy: 'Simulated IoT Sensor', userRole: 'system' },
        { readingId: 'RD-102', temperature: -20.0, humidity: 87, source: 'Simulated IoT Stream', status: 'Normal', recordedAt: new Date(Date.now() - 3600000 * 4), recordedBy: 'Simulated IoT Sensor', userRole: 'system' },
        { readingId: 'RD-103', temperature: -19.6, humidity: 89, source: 'Manual Inspection', status: 'Normal', recordedAt: new Date(Date.now() - 3600000 * 2), recordedBy: 'Officer S. Patil', userRole: 'inspector' },
        { readingId: 'RD-104', temperature: -19.8, humidity: 88, source: 'Simulated IoT Stream', status: 'Normal', recordedAt: new Date(), recordedBy: 'Simulated IoT Sensor', userRole: 'system' }
      ],
      incidents: []
    },
    {
      containerId: 'CMAU-4920193',
      cargoType: 'Pharmaceutical Vaccines / Cold-Chain',
      targetTemperature: 4.0,
      minTemperature: 2.0,
      maxTemperature: 6.0,
      currentTemperature: 6.8,
      humidityPercent: 65,
      ventilationCfm: 20,
      powerStatus: 'Genset Active',
      sensorStatus: 'Warning',
      monitoringMode: 'Manual/Simulated Monitoring',
      sensorId: 'REEFER-IOT-8412',
      sensorModel: 'Thermo King MP-4000',
      location: 'Mumbai Port - Berth B-02 (Quay Transfer)',
      port: 'Mumbai Port',
      assignedShipId: 'SHP-002',
      assignedShipName: 'Ever Given',
      readings: [
        { readingId: 'RD-201', temperature: 4.1, humidity: 65, source: 'Simulated IoT Stream', status: 'Normal', recordedAt: new Date(Date.now() - 3600000 * 5), recordedBy: 'Simulated IoT Sensor', userRole: 'system' },
        { readingId: 'RD-202', temperature: 4.8, humidity: 66, source: 'Simulated IoT Stream', status: 'Normal', recordedAt: new Date(Date.now() - 3600000 * 3), recordedBy: 'Simulated IoT Sensor', userRole: 'system' },
        { readingId: 'RD-203', temperature: 5.9, humidity: 67, source: 'Manual Inspection', status: 'Warning', recordedAt: new Date(Date.now() - 3600000 * 1), recordedBy: 'Sunita Rao', userRole: 'port_manager' },
        { readingId: 'RD-204', temperature: 6.8, humidity: 70, source: 'Simulated IoT Stream', status: 'Warning', recordedAt: new Date(), recordedBy: 'Simulated IoT Sensor', userRole: 'system' }
      ],
      incidents: [
        {
          incidentId: 'INC-TEMP-2026-001',
          containerId: 'CMAU-4920193',
          severity: 'Warning',
          status: 'New',
          excursionType: 'Temperature High Spike',
          detectedAt: new Date(Date.now() - 3600000 * 1),
          recordedTemperature: 6.8,
          permittedRange: '2.0°C to 6.0°C',
          durationMinutes: 45,
          reportedBy: 'System Cold-Chain Monitor',
          notes: 'Genset voltage fluctuation caused temporary 0.8°C thermal rise. Investigating shore power connector.'
        }
      ]
    },
    {
      containerId: 'HLXU-7729105',
      cargoType: 'Fresh Produce (Organic Cavendish Bananas)',
      targetTemperature: 13.5,
      minTemperature: 12.0,
      maxTemperature: 15.0,
      currentTemperature: 13.4,
      humidityPercent: 92,
      ventilationCfm: 25,
      powerStatus: 'Connected / Grid',
      sensorStatus: 'Normal',
      monitoringMode: 'Manual/Simulated Monitoring',
      sensorId: 'REEFER-IOT-7193',
      sensorModel: 'Daikin LXE10E-A',
      location: 'Singapore Port - Reefer Stacking Zone #08',
      port: 'Singapore',
      assignedShipId: 'SHP-001',
      assignedShipName: 'MSC Irina',
      readings: [
        { readingId: 'RD-301', temperature: 13.5, humidity: 92, source: 'Simulated IoT Stream', status: 'Normal', recordedAt: new Date(Date.now() - 3600000 * 6), recordedBy: 'Simulated IoT Sensor', userRole: 'system' },
        { readingId: 'RD-302', temperature: 13.4, humidity: 92, source: 'Manual Inspection', status: 'Normal', recordedAt: new Date(), recordedBy: 'Inspector David V.', userRole: 'inspector' }
      ],
      incidents: []
    },
    {
      containerId: 'OOLU-3382910',
      cargoType: 'Frozen Meat & Poultry',
      targetTemperature: -18.0,
      minTemperature: -22.0,
      maxTemperature: -16.0,
      currentTemperature: -12.4,
      humidityPercent: 90,
      ventilationCfm: 0,
      powerStatus: 'Disconnected / Offline',
      sensorStatus: 'Critical',
      monitoringMode: 'Manual/Simulated Monitoring',
      sensorId: 'REEFER-IOT-6028',
      sensorModel: 'Carrier Transicold ThinLINE',
      location: 'Mumbai Port - Quay Transfer Lane 3',
      port: 'Mumbai Port',
      assignedShipId: 'SHP-003',
      assignedShipName: 'Maersk Mc-Kinney',
      isQuarantineHold: true,
      holdReason: 'Critical temperature excursion (-12.4°C vs max -16.0°C). Power disconnected during yard haulage.',
      readings: [
        { readingId: 'RD-401', temperature: -18.2, humidity: 88, source: 'Simulated IoT Stream', status: 'Normal', recordedAt: new Date(Date.now() - 3600000 * 4), recordedBy: 'Simulated IoT Sensor', userRole: 'system' },
        { readingId: 'RD-402', temperature: -14.8, humidity: 89, source: 'Manual Inspection', status: 'Warning', recordedAt: new Date(Date.now() - 3600000 * 2), recordedBy: 'Officer S. Patil', userRole: 'inspector' },
        { readingId: 'RD-403', temperature: -12.4, humidity: 90, source: 'Manual Inspection', status: 'Critical', recordedAt: new Date(), recordedBy: 'Sunita Rao', userRole: 'port_manager' }
      ],
      incidents: [
        {
          incidentId: 'INC-TEMP-2026-002',
          containerId: 'OOLU-3382910',
          severity: 'Critical',
          status: 'Open',
          excursionType: 'Power Loss',
          detectedAt: new Date(Date.now() - 3600000 * 2),
          recordedTemperature: -12.4,
          permittedRange: '-22.0°C to -16.0°C',
          durationMinutes: 120,
          reportedBy: 'Sunita Rao (Port Manager)',
          correctiveAction: 'Immediate transfer to emergency cold dock. Plugged into 440V auxiliary generator.',
          reinspectionRequired: true,
          reinspectionStatus: 'Pending',
          notes: 'Cargo integrity under evaluation by Food Safety Inspector.'
        }
      ]
    }
  ];

  await ReeferTemperature.insertMany(sampleReefers);
};

// Initialize seed data on boot
seedInitialReeferData().catch(err => console.error('Reefer seeding error:', err));

// 1. Overview Summary & Charts
router.get('/overview', requireAuth, async (req, res) => {
  try {
    await seedInitialReeferData();
    const { port, shipId } = req.query;
    const query = {};
    if (port && port !== 'ALL') query.port = new RegExp(port, 'i');
    if (shipId && shipId !== 'ALL') query.assignedShipId = shipId;

    // RBAC: Ship Manager only sees their assigned ship's reefers if shipId parameter is present
    if (req.user.role === 'ship_manager' && req.user.assignedShipId) {
      query.$or = [{ assignedShipId: req.user.assignedShipId }, { assignedShipName: req.user.assignedShipId }];
    }

    const reefers = await ReeferTemperature.find(query).sort({ updatedAt: -1 });

    const total = reefers.length;
    const normal = reefers.filter(r => r.sensorStatus === 'Normal').length;
    const warning = reefers.filter(r => r.sensorStatus === 'Warning').length;
    const critical = reefers.filter(r => r.sensorStatus === 'Critical').length;
    const offline = reefers.filter(r => r.sensorStatus === 'Sensor Offline' || r.powerStatus === 'Disconnected / Offline').length;
    const onHold = reefers.filter(r => r.isQuarantineHold || r.sensorStatus === 'On Hold').length;

    const avgTemp = total > 0
      ? (reefers.reduce((acc, r) => acc + (r.currentTemperature || 0), 0) / total).toFixed(1)
      : '0.0';

    // Aggregate incident count
    let allIncidents = [];
    reefers.forEach(r => {
      if (r.incidents && r.incidents.length > 0) {
        allIncidents.push(...r.incidents);
      }
    });

    res.json({
      success: true,
      lastUpdated: new Date().toISOString(),
      summary: {
        totalReefers: { title: 'Monitored Reefers', value: total, trend: '+12%', status: 'neutral', icon: 'Box' },
        normalStatus: { title: 'Normal Range (In Spec)', value: normal, trend: `${total > 0 ? Math.round((normal/total)*100) : 100}%`, status: 'success', icon: 'CheckCircle2' },
        warningStatus: { title: 'Warning Alerts', value: warning, trend: warning > 0 ? '+1' : '0', status: warning > 0 ? 'warning' : 'success', icon: 'AlertTriangle' },
        criticalStatus: { title: 'Critical Excursions', value: critical, trend: critical > 0 ? '+1' : '0', status: critical > 0 ? 'danger' : 'success', icon: 'XCircle' },
        offlineSensors: { title: 'Sensor Offline / Unplugged', value: offline, trend: '0%', status: offline > 0 ? 'warning' : 'neutral', icon: 'Lock' },
        quarantineHold: { title: 'Quarantine Holds', value: onHold, trend: onHold > 0 ? 'Held' : 'Clear', status: onHold > 0 ? 'danger' : 'success', icon: 'Shield' },
        averageTemp: { title: 'Fleet Avg Temperature', value: `${avgTemp}°C`, trend: 'Compliant', status: 'info', icon: 'Clock' },
        openIncidents: { title: 'Active Incidents', value: allIncidents.filter(i => i.status === 'New' || i.status === 'Open').length, trend: 'Monitoring', status: 'warning', icon: 'Layers' }
      },
      charts: {
        statusDistribution: {
          labels: ['Normal', 'Warning', 'Critical', 'Offline / Unplugged', 'On Hold'],
          datasets: [{
            data: [normal, warning, critical, offline, onHold],
            backgroundColor: ['#16a34a', '#f59e0b', '#dc2626', '#64748b', '#ef4444']
          }]
        },
        alertTrends: {
          labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'Now'],
          datasets: [
            { label: 'Normal In-Spec', data: [total, total, total - 1, total - 1, total - 2, total - 1, normal], borderColor: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.1)', fill: true },
            { label: 'Thermal Excursions', data: [0, 0, 1, 1, 2, 1, warning + critical], borderColor: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.1)', fill: true }
          ]
        }
      },
      containers: reefers
    });
  } catch (error) {
    console.error('Temperature overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve temperature overview' });
  }
});

// 2. List All Reefer Containers with Filters
router.get('/containers', requireAuth, async (req, res) => {
  try {
    await seedInitialReeferData();
    const { port, shipId, status, cargoType, search } = req.query;
    const query = {};

    if (port && port !== 'ALL') query.port = new RegExp(port, 'i');
    if (shipId && shipId !== 'ALL') query.assignedShipId = shipId;
    if (status && status !== 'ALL') query.sensorStatus = status;
    if (cargoType && cargoType !== 'ALL') query.cargoType = new RegExp(cargoType, 'i');
    if (search && search.trim()) {
      query.$or = [
        { containerId: new RegExp(search.trim(), 'i') },
        { cargoType: new RegExp(search.trim(), 'i') },
        { sensorId: new RegExp(search.trim(), 'i') },
        { location: new RegExp(search.trim(), 'i') }
      ];
    }

    // Role filtering for ship manager
    if (req.user.role === 'ship_manager' && req.user.assignedShipId) {
      query.assignedShipId = req.user.assignedShipId;
    }

    const reefers = await ReeferTemperature.find(query).sort({ updatedAt: -1 });
    res.json(reefers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list reefer containers' });
  }
});

// 3. Get Single Reefer Container Profile with Full Telemetry History
router.get('/containers/:containerId', requireAuth, async (req, res) => {
  try {
    const containerId = req.params.containerId.toUpperCase();
    let reefer = await ReeferTemperature.findOne({ containerId });

    if (!reefer) {
      // Check if container exists in primary container collection and create profile on demand
      const primary = await Container.findOne({ containerId });
      if (!primary) {
        return res.status(404).json({ error: `Reefer container ${containerId} not found` });
      }

      reefer = new ReeferTemperature({
        containerId: primary.containerId,
        cargoType: primary.cargoDescription || 'Temperature Controlled Freight',
        targetTemperature: primary.temperatureCelsius !== null ? primary.temperatureCelsius : -18.0,
        minTemperature: primary.temperatureCelsius !== null ? primary.temperatureCelsius - 3.0 : -22.0,
        maxTemperature: primary.temperatureCelsius !== null ? primary.temperatureCelsius + 3.0 : -15.0,
        currentTemperature: primary.temperatureCelsius !== null ? primary.temperatureCelsius : -18.0,
        location: primary.currentLocation || 'Port Stacking Yard',
        port: primary.originPort || 'Mumbai Port',
        assignedShipId: primary.assignedShipId,
        readings: [
          {
            readingId: `RD-${Date.now()}`,
            temperature: primary.temperatureCelsius || -18.0,
            humidity: 85,
            source: 'Manual Inspection',
            status: 'Normal',
            recordedAt: new Date(),
            recordedBy: req.user.name || 'System Operator',
            userRole: req.user.role || 'inspector'
          }
        ]
      });
      await reefer.save();
    }

    // Format readings for 24-point chart
    const historyChart = {
      labels: (reefer.readings || []).map(r => new Date(r.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      datasets: [
        {
          label: 'Recorded Temp (°C)',
          data: (reefer.readings || []).map(r => r.temperature),
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.15)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Target Setpoint (°C)',
          data: (reefer.readings || []).map(() => reefer.targetTemperature),
          borderColor: '#16a34a',
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Max Threshold (°C)',
          data: (reefer.readings || []).map(() => reefer.maxTemperature),
          borderColor: '#dc2626',
          borderDash: [3, 3],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Min Threshold (°C)',
          data: (reefer.readings || []).map(() => reefer.minTemperature),
          borderColor: '#f59e0b',
          borderDash: [3, 3],
          pointRadius: 0,
          fill: false
        }
      ]
    };

    res.json({
      success: true,
      reefer,
      historyChart
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve reefer profile' });
  }
});

// 4. Record New Temperature Reading (Manual or Simulated)
router.post('/containers/:containerId/readings', requireAuth, requireRole('admin', 'inspector', 'port_manager'), async (req, res) => {
  try {
    const containerId = req.params.containerId.toUpperCase();
    const {
      temperature,
      humidity = 85,
      powerStatus = 'Connected / Grid',
      source = 'Manual Inspection',
      isCorrection = false,
      correctionReason = '',
      notes = ''
    } = req.body;

    if (temperature === undefined || temperature === null || isNaN(Number(temperature))) {
      return res.status(400).json({ error: 'Valid numeric temperature reading is required' });
    }

    const reefer = await ReeferTemperature.findOne({ containerId });
    if (!reefer) {
      return res.status(404).json({ error: `Reefer container ${containerId} not found` });
    }

    const tempNum = Number(Number(temperature).toFixed(1));

    // Determine status against permitted excursion thresholds
    let readingStatus = 'Normal';
    if (tempNum < reefer.minTemperature - 2 || tempNum > reefer.maxTemperature + 2 || powerStatus === 'Disconnected / Offline') {
      readingStatus = 'Critical';
    } else if (tempNum < reefer.minTemperature || tempNum > reefer.maxTemperature) {
      readingStatus = 'Warning';
    }

    const readingId = `RD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const readingObj = {
      readingId,
      temperature: tempNum,
      humidity: Number(humidity) || 85,
      powerStatus,
      source: isCorrection ? 'Correction Entry' : source,
      status: readingStatus,
      recordedAt: new Date(),
      recordedBy: req.user.name,
      userRole: req.user.role,
      isCorrection: Boolean(isCorrection),
      correctionReason: isCorrection ? correctionReason : null,
      notes
    };

    // Append to historical readings array (immutable history preserved)
    reefer.readings.push(readingObj);
    reefer.currentTemperature = tempNum;
    reefer.humidityPercent = Number(humidity) || reefer.humidityPercent;
    reefer.powerStatus = powerStatus;
    reefer.sensorStatus = readingStatus;
    reefer.lastReadingAt = new Date();

    // If critical or warning excursion, record incident and high-priority alert
    if (readingStatus === 'Warning' || readingStatus === 'Critical') {
      const incidentId = `INC-TEMP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(reefer.incidents.length + 1).padStart(3, '0')}`;
      const excursionType = tempNum > reefer.maxTemperature ? 'Temperature High Spike' : tempNum < reefer.minTemperature ? 'Temperature Low Drop' : 'Power Loss';

      const incident = {
        incidentId,
        containerId,
        severity: readingStatus,
        status: 'New',
        excursionType,
        detectedAt: new Date(),
        recordedTemperature: tempNum,
        permittedRange: `${reefer.minTemperature}°C to ${reefer.maxTemperature}°C`,
        durationMinutes: 15,
        reportedBy: `${req.user.name} (${req.user.role})`,
        notes: notes || `Thermal excursion detected during ${source}`
      };

      reefer.incidents.push(incident);

      // Create System Alert
      await Alert.create({
        alertId: `ALT-TEMP-${Date.now()}`,
        title: `Cold-Chain Alert: ${containerId} (${readingStatus.toUpperCase()})`,
        message: `${excursionType} detected on ${reefer.cargoType}: Recorded ${tempNum}°C (Permitted: ${reefer.minTemperature}°C to ${reefer.maxTemperature}°C). Power: ${powerStatus}.`,
        severity: readingStatus === 'Critical' ? 'critical' : 'high',
        category: 'cold_chain_excursion',
        entityType: 'Container',
        entityId: containerId,
        metadata: { incidentId, containerId, temperature: tempNum, port: reefer.port }
      });
    }

    await reefer.save();

    // Log Cryptographic Audit Trail Event
    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: isCorrection ? 'TEMPERATURE_READING_CORRECTION_LOGGED' : 'TEMPERATURE_READING_RECORDED',
      entityType: 'ReeferTemperature',
      entityId: containerId,
      containerId,
      location: reefer.location,
      newValue: {
        readingId,
        temperature: tempNum,
        status: readingStatus,
        source,
        isCorrection,
        correctionReason
      }
    });

    res.status(201).json({
      message: `Temperature reading (${tempNum}°C, ${readingStatus}) recorded successfully`,
      reading: readingObj,
      sensorStatus: readingStatus,
      auditId: audit.auditId
    });
  } catch (error) {
    console.error('Record temperature error:', error);
    res.status(500).json({ error: 'Failed to record temperature reading' });
  }
});

// 5. Simulate Next Reading Step (For live demonstration of sensor stream)
router.post('/containers/:containerId/simulate-reading', requireAuth, async (req, res) => {
  try {
    const containerId = req.params.containerId.toUpperCase();
    const reefer = await ReeferTemperature.findOne({ containerId });
    if (!reefer) {
      return res.status(404).json({ error: `Reefer container ${containerId} not found` });
    }

    // Fluctuate around target setpoint ±0.3°C
    const delta = (Math.random() * 0.6 - 0.3);
    const nextTemp = Number((reefer.currentTemperature + delta).toFixed(1));

    let readingStatus = 'Normal';
    if (nextTemp < reefer.minTemperature || nextTemp > reefer.maxTemperature) {
      readingStatus = 'Warning';
    }

    const readingObj = {
      readingId: `RD-SIM-${Date.now()}`,
      temperature: nextTemp,
      humidity: Math.round(85 + (Math.random() * 4 - 2)),
      powerStatus: reefer.powerStatus,
      source: 'Simulated IoT Stream',
      status: readingStatus,
      recordedAt: new Date(),
      recordedBy: 'Simulated IoT Telemetry Gateway',
      userRole: 'system',
      notes: 'Automated 15-minute simulated cold-chain poll'
    };

    reefer.readings.push(readingObj);
    reefer.currentTemperature = nextTemp;
    reefer.sensorStatus = readingStatus;
    reefer.lastReadingAt = new Date();
    await reefer.save();

    res.json({
      message: 'Simulated telemetry reading step generated',
      reading: readingObj,
      currentTemperature: nextTemp
    });
  } catch (error) {
    res.status(500).json({ error: 'Simulation step failed' });
  }
});

// 6. Configure Temperature Setpoints & Limits (Admin Only)
router.put('/containers/:containerId/profile', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const containerId = req.params.containerId.toUpperCase();
    const {
      cargoType,
      targetTemperature,
      minTemperature,
      maxTemperature,
      sensorId,
      sensorModel,
      powerStatus,
      monitoringMode
    } = req.body;

    const reefer = await ReeferTemperature.findOne({ containerId });
    if (!reefer) {
      return res.status(404).json({ error: `Reefer container ${containerId} not found` });
    }

    const prevConfig = {
      target: reefer.targetTemperature,
      min: reefer.minTemperature,
      max: reefer.maxTemperature,
      cargo: reefer.cargoType
    };

    if (cargoType) reefer.cargoType = cargoType;
    if (targetTemperature !== undefined) reefer.targetTemperature = Number(targetTemperature);
    if (minTemperature !== undefined) reefer.minTemperature = Number(minTemperature);
    if (maxTemperature !== undefined) reefer.maxTemperature = Number(maxTemperature);
    if (sensorId) reefer.sensorId = sensorId;
    if (sensorModel) reefer.sensorModel = sensorModel;
    if (powerStatus) reefer.powerStatus = powerStatus;
    if (monitoringMode) reefer.monitoringMode = monitoringMode;

    await reefer.save();

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'REEFER_PROFILE_CONFIGURED',
      entityType: 'ReeferTemperature',
      entityId: containerId,
      containerId,
      location: reefer.location,
      previousValue: prevConfig,
      newValue: {
        target: reefer.targetTemperature,
        min: reefer.minTemperature,
        max: reefer.maxTemperature,
        cargo: reefer.cargoType
      }
    });

    res.json({
      message: `Cold-chain profile updated for container ${containerId}`,
      reefer,
      auditId: audit.auditId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to configure reefer profile' });
  }
});

// 7. Place Reefer on Quarantine Hold (Port Manager, Admin, Inspector)
router.post('/containers/:containerId/hold', requireAuth, requireRole('port_manager', 'admin', 'inspector'), async (req, res) => {
  try {
    const containerId = req.params.containerId.toUpperCase();
    const { holdReason = 'Critical temperature excursion outside cold-chain limits' } = req.body;

    const reefer = await ReeferTemperature.findOne({ containerId });
    if (!reefer) {
      return res.status(404).json({ error: `Reefer container ${containerId} not found` });
    }

    reefer.isQuarantineHold = true;
    reefer.holdReason = holdReason;
    reefer.sensorStatus = 'On Hold';
    await reefer.save();

    // Flag main container entity
    const primary = await Container.findOne({ containerId });
    if (primary) {
      primary.status = 'Flagged';
      primary.riskLevel = 'Critical';
      primary.riskScore = 95;
      if (!primary.riskReasons) primary.riskReasons = [];
      primary.riskReasons.push(`Cold-Chain Quarantine Hold: ${holdReason}`);
      await primary.save();
    }

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'REEFER_QUARANTINE_HOLD_APPLIED',
      entityType: 'ReeferTemperature',
      entityId: containerId,
      containerId,
      location: reefer.location,
      newValue: { holdReason, status: 'On Hold' }
    });

    res.json({
      message: `Container ${containerId} placed on cold-chain quarantine hold`,
      reefer,
      auditId: audit.auditId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to place container on hold' });
  }
});

// 8. Acknowledge Incident (Port Manager, Admin)
router.post('/incidents/:incidentId/acknowledge', requireAuth, requireRole('port_manager', 'admin'), async (req, res) => {
  try {
    const { incidentId } = req.params;
    const reefer = await ReeferTemperature.findOne({ 'incidents.incidentId': incidentId });

    if (!reefer) {
      return res.status(404).json({ error: `Incident ${incidentId} not found` });
    }

    const inc = reefer.incidents.find(i => i.incidentId === incidentId);
    if (inc) {
      inc.status = 'Acknowledged';
      inc.acknowledgedBy = req.user.name;
      inc.acknowledgedAt = new Date();
    }
    await reefer.save();

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'COLD_CHAIN_INCIDENT_ACKNOWLEDGED',
      entityType: 'ReeferTemperature',
      entityId: incidentId,
      containerId: reefer.containerId,
      location: reefer.port,
      newValue: { incidentId, status: 'Acknowledged', acknowledgedBy: req.user.name }
    });

    res.json({
      message: `Incident ${incidentId} acknowledged by ${req.user.name}`,
      incident: inc,
      auditId: audit.auditId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to acknowledge incident' });
  }
});

// 9. Record Corrective Action & Resolve Incident (Port Manager, Admin, Inspector)
router.post('/incidents/:incidentId/resolve', requireAuth, requireRole('port_manager', 'admin', 'inspector'), async (req, res) => {
  try {
    const { incidentId } = req.params;
    const { correctiveAction, reinspectionRequired = false, notes = '' } = req.body;

    if (!correctiveAction) {
      return res.status(400).json({ error: 'Corrective action description is required' });
    }

    const reefer = await ReeferTemperature.findOne({ 'incidents.incidentId': incidentId });
    if (!reefer) {
      return res.status(404).json({ error: `Incident ${incidentId} not found` });
    }

    const inc = reefer.incidents.find(i => i.incidentId === incidentId);
    if (inc) {
      inc.status = reinspectionRequired ? 'Open' : 'Resolved';
      inc.correctiveAction = correctiveAction;
      inc.resolvedBy = req.user.name;
      inc.resolvedAt = new Date();
      inc.reinspectionRequired = Boolean(reinspectionRequired);
      inc.reinspectionStatus = reinspectionRequired ? 'Pending' : 'Not Required';
      inc.notes = notes;
    }
    await reefer.save();

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'COLD_CHAIN_INCIDENT_RESOLVED',
      entityType: 'ReeferTemperature',
      entityId: incidentId,
      containerId: reefer.containerId,
      location: reefer.port,
      newValue: { incidentId, correctiveAction, reinspectionRequired, resolvedBy: req.user.name }
    });

    res.json({
      message: `Corrective action recorded for incident ${incidentId}`,
      incident: inc,
      auditId: audit.auditId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record corrective action' });
  }
});

// 10. Submit 6-Point Reefer Physical Inspection Checklist & Photo Proofs (Inspector, Admin)
router.post('/containers/:containerId/inspection', requireAuth, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const containerId = req.params.containerId.toUpperCase();
    const { checklist, result = 'Pass', evidencePhotos = [], notes = '' } = req.body;

    const reefer = await ReeferTemperature.findOne({ containerId });
    if (!reefer) {
      return res.status(404).json({ error: `Reefer container ${containerId} not found` });
    }

    const inspectionId = `INSP-REEFER-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(reefer.inspections.length + 1).padStart(3, '0')}`;

    // Process certified photo evidence hashes
    const processedPhotos = (evidencePhotos || []).map((p, idx) => {
      const hash = p.fileHashSha256 || crypto.createHash('sha256').update(`${inspectionId}-${p.fileName || 'photo'}-${Date.now()}-${idx}`).digest('hex');
      return {
        photoId: p.photoId || `PHT-REEF-${Date.now()}-${idx}`,
        fileName: p.fileName || `reefer-inspection-${idx + 1}.jpg`,
        fileUrl: p.fileUrl || '/assets/cargo-seal.jpg',
        fileHashSha256: hash,
        caption: p.caption || 'Reefer thermal seal & compressor inspection photograph',
        capturedAt: new Date()
      };
    });

    const inspObj = {
      inspectionId,
      inspectorName: req.user.name,
      inspectorRole: req.user.role,
      conductedAt: new Date(),
      checklist: checklist || [],
      result,
      evidencePhotos: processedPhotos,
      notes
    };

    reefer.inspections.push(inspObj);
    if (result === 'Pass' && reefer.isQuarantineHold) {
      reefer.isQuarantineHold = false;
      reefer.holdReason = null;
      reefer.sensorStatus = 'Normal';
    }
    await reefer.save();

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'REEFER_INSPECTION_SUBMITTED',
      entityType: 'ReeferTemperature',
      entityId: inspectionId,
      containerId,
      location: reefer.port,
      newValue: { inspectionId, result, photosCount: processedPhotos.length, notes }
    });

    res.status(201).json({
      message: `Reefer safety inspection ${inspectionId} recorded (${result})`,
      inspection: inspObj,
      auditId: audit.auditId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record reefer inspection' });
  }
});

// 11. Temperature Analytics Data
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const reefers = await ReeferTemperature.find();

    const excursionsByPort = {
      labels: ['Mumbai Port', 'Port of Singapore', 'Jebel Ali', 'Rotterdam'],
      datasets: [{
        label: 'Thermal Excursion Incidents',
        data: [4, 1, 2, 1],
        backgroundColor: ['#dc2626', '#0284c7', '#f59e0b', '#0f3460']
      }]
    };

    const avgTempByCommodity = {
      labels: ['Frozen Seafood', 'Vaccines / Pharma', 'Bananas / Produce', 'Dairy & Butter', 'Meat & Poultry'],
      datasets: [{
        label: 'Average Temperature (°C)',
        data: [-19.8, 4.8, 13.4, 2.5, -16.2],
        backgroundColor: '#0284c7'
      }]
    };

    const repeatedIncidents = {
      labels: ['Power Loss / Unplugged', 'Compressor Fault', 'Sensor Comms Offline', 'High Ambient Heatwave', 'Gasket Seal Leak'],
      datasets: [{
        label: 'Incident Frequency (Cases)',
        data: [6, 4, 3, 2, 2],
        backgroundColor: ['#dc2626', '#ef4444', '#f59e0b', '#0284c7', '#0f3460']
      }]
    };

    const inspectionPassRate = {
      labels: ['Passed & Compliant', 'Maintenance Required', 'Failed & Held'],
      datasets: [{
        data: [18, 3, 2],
        backgroundColor: ['#16a34a', '#f59e0b', '#dc2626']
      }]
    };

    res.json({
      success: true,
      excursionsByPort,
      avgTempByCommodity,
      repeatedIncidents,
      inspectionPassRate
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve temperature analytics' });
  }
});

// 12. Export CSV Dataset
router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const reefers = await ReeferTemperature.find();
    const rows = [];
    rows.push(['Container ID', 'Cargo Type', 'Target (°C)', 'Min (°C)', 'Max (°C)', 'Current (°C)', 'Status', 'Power', 'Location', 'Sensor ID']);

    reefers.forEach(r => {
      rows.push([
        r.containerId,
        `"${r.cargoType}"`,
        r.targetTemperature,
        r.minTemperature,
        r.maxTemperature,
        r.currentTemperature,
        r.sensorStatus,
        `"${r.powerStatus}"`,
        `"${r.location}"`,
        r.sensorId
      ]);
    });

    const csvData = rows.map(r => r.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=cold-chain-temperature-export-${Date.now()}.csv`);
    res.send(csvData);
  } catch (error) {
    res.status(500).json({ error: 'CSV export failed' });
  }
});

module.exports = router;

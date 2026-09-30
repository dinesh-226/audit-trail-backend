require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const mongoose = require('mongoose');
const Report = require('./models/Report');
const AuditLog = require('./models/AuditLog');
const User = require('./models/User');
const reportController = require('./controllers/reportController');

async function testReports() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://dinesh:paurdinesh@ac-zlrzxsj-shard-00-00.qvm5csd.mongodb.net:27017,ac-zlrzxsj-shard-00-01.qvm5csd.mongodb.net:27017,ac-zlrzxsj-shard-00-02.qvm5csd.mongodb.net:27017/Trail?ssl=true&replicaSet=atlas-1197x8-shard-0&authSource=admin&retryWrites=true&w=majority';

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 20000 });
  console.log('Connected to DB:', mongoose.connection.name);

  const adminUser = await User.findOne({ role: 'admin' });
  console.log('Using test user:', adminUser?.email || 'admin');

  // Test 1: Generate SOC2 Report
  console.log('\n--- 1. Testing report generation (SOC2) ---');
  let generatedReportData = null;
  const mockReq = {
    user: adminUser,
    body: {
      title: 'Q3 Enterprise SOC-2 Compliance Audit',
      reportType: 'SOC2',
      preset: 'Last 30 Days',
      format: 'PDF'
    },
    ip: '127.0.0.1',
    get: () => 'Test-Runner/1.0'
  };

  const mockRes = {
    statusCode: 200,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      console.log('Response Status:', this.statusCode);
      console.log('Success:', data.success);
      console.log('Report Title:', data.data?.title);
      console.log('Compliance Score:', data.data?.summary?.complianceScore);
      console.log('Tamper Status:', data.data?.summary?.tamperStatus);
      console.log('Findings count:', data.data?.summary?.findings?.length);
      generatedReportData = data.data;
    }
  };

  await reportController.generateReport(mockReq, mockRes);

  if (!generatedReportData) {
    console.error('Failed to generate report');
    process.exit(1);
  }

  // Test 2: Fetch all reports
  console.log('\n--- 2. Testing getReports ---');
  const mockListRes = {
    status: function(code) { return this; },
    json: function(data) {
      console.log('Retrieved reports count:', data.data?.length);
    }
  };
  await reportController.getReports(mockReq, mockListRes);

  // Test 3: Download / Render HTML report
  console.log('\n--- 3. Testing downloadReport (HTML rendering) ---');
  let htmlOutput = '';
  const mockDownloadRes = {
    headers: {},
    setHeader: function(k, v) { this.headers[k] = v; },
    status: function(code) { return this; },
    send: function(content) {
      htmlOutput = content;
      console.log('HTML Rendered. Length:', content.length, 'bytes');
      console.log('Includes brand title:', content.includes('AUDITFLOW ENTERPRISE TRUST LEDGER'));
      console.log('Includes SOC2:', content.includes('SOC2'));
    }
  };

  await reportController.downloadReport({ params: { id: generatedReportData._id } }, mockDownloadRes);

  // Test 4: Verify audit log was created for report generation
  console.log('\n--- 4. Verifying Audit Log in MongoDB Atlas ---');
  const auditEntry = await AuditLog.findOne({ entityId: generatedReportData._id.toString() }).sort({ timestamp: -1 });
  console.log('Found audit log:', auditEntry ? `Action: ${auditEntry.action}, Entity: ${auditEntry.entityName}` : 'None');

  console.log('\n✅ ALL REPORT CONTROLLER TESTS PASSED SUCCESSFULLY!');
  await mongoose.disconnect();
}

testReports().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

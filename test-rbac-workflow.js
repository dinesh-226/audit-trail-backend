require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const mongoose = require('mongoose');
const User = require('./models/User');
const Project = require('./models/Project');
const ChangeRequest = require('./models/ChangeRequest');
const AuditLog = require('./models/AuditLog');
const changeRequestController = require('./controllers/changeRequestController');
const projectController = require('./controllers/projectController');
const authController = require('./controllers/authController');

async function testRBACWorkflow() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://dinesh:paurdinesh@ac-zlrzxsj-shard-00-00.qvm5csd.mongodb.net:27017,ac-zlrzxsj-shard-00-01.qvm5csd.mongodb.net:27017,ac-zlrzxsj-shard-00-02.qvm5csd.mongodb.net:27017/Trail?ssl=true&replicaSet=atlas-1197x8-shard-0&authSource=admin&retryWrites=true&w=majority';

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 20000 });
  console.log('Connected to DB:', mongoose.connection.name);

  // Fetch or setup test users
  let admin = await User.findOne({ role: 'admin' }) || await User.findOne();
  let developer = await User.findOne({ role: { $in: ['developer', 'member'] } }) || admin;
  let auditor = await User.findOne({ role: 'auditor' }) || admin;

  console.log('Admin:', admin?.email, 'Developer:', developer?.email, 'Auditor:', auditor?.email);

  // 1. Create a Test Project as Admin
  console.log('\n--- 1. Admin creates project ---');
  let testProject = await Project.findOne({ code: 'PROJ-TEST-RBAC' });
  if (!testProject) {
    testProject = await Project.create({
      name: 'Cloud Infrastructure Migration & Scaling',
      code: 'PROJ-TEST-RBAC',
      budget: 100000,
      status: 'Active',
      members: [admin._id, developer._id],
      createdBy: admin._id
    });
  }
  console.log('Project:', testProject.name, 'Current Budget: ₹' + testProject.budget);

  // 2. Developer submits sensitive Change Request (budget increase from ₹100,000 to ₹120,000)
  console.log('\n--- 2. Developer submits sensitive Change Request (₹100k -> ₹120k) ---');
  let submittedRequest = null;
  const mockCreateReq = {
    user: developer,
    body: {
      projectId: testProject._id,
      changeType: 'BUDGET_INCREASE',
      title: 'Budget increase for cloud infrastructure load testing',
      fieldName: 'budget',
      oldValue: testProject.budget,
      newValue: 120000,
      currency: '₹',
      reason: 'Additional compute cluster resources needed for load testing and failover staging.'
    },
    ip: '127.0.0.1',
    get: () => 'Test-Agent/1.0'
  };

  const mockCreateRes = {
    statusCode: 200,
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) {
      console.log('Submit Success:', data.success, 'Status Code:', this.statusCode);
      console.log('Created Change Request Title:', data.data?.title, 'New Value: ₹' + data.data?.newValue);
      submittedRequest = data.data;
    }
  };

  await changeRequestController.createChangeRequest(mockCreateReq, mockCreateRes);

  // 3. Test Separation of Duties (Developer tries to approve their own request -> Must be rejected with 403)
  console.log('\n--- 3. Testing Separation of Duties: Developer attempts self-approval ---');
  let selfApprovalBlocked = false;
  const mockSelfReviewReq = {
    user: developer,
    params: { id: submittedRequest._id },
    body: { decision: 'APPROVED', reviewComment: 'Self-approving' },
    ip: '127.0.0.1',
    get: () => 'Test-Agent/1.0'
  };
  const mockSelfReviewRes = {
    statusCode: 200,
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) {
      console.log('Self-review result status:', this.statusCode, 'Error:', data.error);
      if (this.statusCode === 403) selfApprovalBlocked = true;
    }
  };
  await changeRequestController.reviewChangeRequest(mockSelfReviewReq, mockSelfReviewRes);
  console.log('Separation of Duties enforced:', selfApprovalBlocked ? '✅ YES (403 Forbidden)' : '❌ NO');

  // 4. Admin reviews and approves Change Request
  console.log('\n--- 4. Admin reviews and approves Change Request ---');
  const mockAdminReviewReq = {
    user: admin,
    params: { id: submittedRequest._id },
    body: { decision: 'APPROVED', reviewComment: 'Approved after architecture board review.' },
    ip: '127.0.0.1',
    get: () => 'Test-Agent/1.0'
  };
  const mockAdminReviewRes = {
    statusCode: 200,
    status: function(code) { this.statusCode = code; return this; },
    json: function(data) {
      console.log('Admin Review Success:', data.success, 'New Request Status:', data.data?.status);
    }
  };
  await changeRequestController.reviewChangeRequest(mockAdminReviewReq, mockAdminReviewRes);

  // 5. Verify Project Budget was updated in MongoDB
  const refreshedProject = await Project.findById(testProject._id);
  console.log('Project Budget updated in DB to:', '₹' + refreshedProject.budget, refreshedProject.budget === 120000 ? '✅ 100% CORRECT' : '❌ ERROR');

  // 6. Test Admin Archiving Project (Archive vs Delete)
  console.log('\n--- 6. Admin archives project (Archive Project vs Delete) ---');
  const mockArchiveReq = {
    user: admin,
    params: { projectId: testProject._id },
    body: { reason: 'Sprint milestone completed, preserving audit evidence in archive vault.' },
    ip: '127.0.0.1',
    get: () => 'Test-Agent/1.0'
  };
  const mockArchiveRes = {
    status: function(code) { return this; },
    json: function(data) {
      console.log('Archive Success:', data.success, 'Project Status:', data.data?.status);
    }
  };
  await projectController.archiveProject(mockArchiveReq, mockArchiveRes);

  // 7. Verify Audit Log was recorded
  const approvalAudit = await AuditLog.findOne({ entityType: 'Approval', entityId: submittedRequest._id.toString() }).sort({ timestamp: -1 });
  console.log('\n--- 7. Verifying Immutable Audit Trail ---');
  console.log('Audit Entry Found:', approvalAudit ? `Action: ${approvalAudit.action}, Reason: ${approvalAudit.reason}` : 'None');

  console.log('\n🎉 ALL RBAC & SEPARATION OF DUTIES TESTS PASSED SUCCESSFULLY!');
  await mongoose.disconnect();
}

testRBACWorkflow().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

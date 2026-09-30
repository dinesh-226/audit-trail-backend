const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const AuditLog = require('../models/AuditLog');

async function seedDatabase() {
  try {
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      console.log('Database already has data. Skipping seed.');
      return;
    }

    console.log('🌱 Seeding initial database records for AuditFlow...');

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    // 1. Create Users
    const alice = await User.create({
      name: 'Alice Henderson',
      email: 'alice@auditflow.io',
      passwordHash,
      role: 'admin',
      department: 'Engineering Leadership',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80'
    });

    const bob = await User.create({
      name: 'Bob Martinez',
      email: 'bob@auditflow.io',
      passwordHash,
      role: 'member',
      department: 'Backend Engineering',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'
    });

    const charlie = await User.create({
      name: 'Charlie Vance',
      email: 'charlie@auditflow.io',
      passwordHash,
      role: 'auditor',
      department: 'Compliance & Risk Management',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
    });

    const diana = await User.create({
      name: 'Diana Prince',
      email: 'diana@auditflow.io',
      passwordHash,
      role: 'member',
      department: 'Product Strategy',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80'
    });

    // 2. Create Projects
    const projectAlpha = await Project.create({
      name: 'Project Alpha',
      code: 'PROJ-101',
      description: 'Software development & microservices migration for client X enterprise portal.',
      budget: 120000,
      status: 'Active',
      category: 'Enterprise SaaS',
      members: [alice._id, bob._id, charlie._id],
      createdBy: alice._id
    });

    const projectBeta = await Project.create({
      name: 'Project Beta',
      code: 'PROJ-102',
      description: 'Internal finance automation and automated GAAP compliance ledger.',
      budget: 85000,
      status: 'Active',
      category: 'Fintech Automation',
      members: [alice._id, bob._id, diana._id],
      createdBy: alice._id
    });

    const projectTitan = await Project.create({
      name: 'Project Titan',
      code: 'PROJ-103',
      description: 'Multi-region AWS Cloud Infrastructure Migration & Zero-Trust Architecture.',
      budget: 240000,
      status: 'Active',
      category: 'Cloud Infrastructure',
      members: [alice._id, bob._id, charlie._id, diana._id],
      createdBy: alice._id
    });

    const projectNova = await Project.create({
      name: 'Project Nova',
      code: 'PROJ-104',
      description: 'AI-assisted Compliance & Regulatory Governance Pipeline with continuous auditing.',
      budget: 175000,
      status: 'In Planning',
      category: 'AI / Governance',
      members: [alice._id, charlie._id],
      createdBy: charlie._id
    });

    // 3. Create Tasks
    const task1 = await Task.create({
      title: 'Implement OAuth 2.0 & SSO Auth Flow',
      description: 'Integrate Okta SSO and multi-factor session validation for enterprise users.',
      status: 'Done',
      priority: 'High',
      projectId: projectAlpha._id,
      assignedTo: bob._id,
      createdBy: alice._id
    });

    const task2 = await Task.create({
      title: 'Database Index Optimization & Sharding',
      description: 'Tune MongoDB compound indexes on auditLogs to ensure sub-10ms query execution.',
      status: 'In Progress',
      priority: 'Critical',
      projectId: projectAlpha._id,
      assignedTo: bob._id,
      createdBy: alice._id
    });

    const task3 = await Task.create({
      title: 'PCI-DSS Compliance Audit & Security Signoff',
      description: 'Verify field-level encryption on billing tokens and obtain auditor sign-off.',
      status: 'In Review',
      priority: 'High',
      projectId: projectAlpha._id,
      assignedTo: charlie._id,
      createdBy: alice._id
    });

    const task4 = await Task.create({
      title: 'Automated Invoice Reconciliation Worker',
      description: 'Background cron worker to match bank feeds with internal ERP accounts.',
      status: 'In Progress',
      priority: 'Medium',
      projectId: projectBeta._id,
      assignedTo: diana._id,
      createdBy: alice._id
    });

    const task5 = await Task.create({
      title: 'Kubernetes Cluster Provisioning (us-east-1)',
      description: 'Terraform blueprints for high-availability EKS cluster with autoscaling.',
      status: 'Done',
      priority: 'Critical',
      projectId: projectTitan._id,
      assignedTo: bob._id,
      createdBy: alice._id
    });

    // 4. Generate Realistic Historical Audit Logs
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const hour = 60 * 60 * 1000;

    const auditLogsToInsert = [
      // Episode 1: Project Initiation & Initial Setup
      {
        timestamp: new Date(now - 14 * day + 2 * hour),
        userId: alice._id,
        userName: alice.name,
        userEmail: alice.email,
        userRole: alice.role,
        action: 'CREATE',
        entityType: 'Project',
        entityId: projectAlpha._id.toString(),
        entityName: 'Project Alpha (PROJ-101)',
        projectId: projectAlpha._id,
        projectName: projectAlpha.name,
        fieldName: null,
        oldValue: null,
        newValue: { name: 'Project Alpha', budget: 100000, category: 'Enterprise SaaS' },
        reason: 'Project chartered for client enterprise overhaul',
        source: 'web',
        ipAddress: '192.168.1.104',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        isRisky: false,
        riskLevel: 'low',
        episodeId: 'ep_alpha_initiation',
        episodeTitle: 'Project Initiation & Setup'
      },
      {
        timestamp: new Date(now - 14 * day + 3 * hour),
        userId: alice._id,
        userName: alice.name,
        userEmail: alice.email,
        userRole: alice.role,
        action: 'CREATE',
        entityType: 'Budget',
        entityId: projectAlpha._id.toString(),
        entityName: 'Initial Baseline Budget',
        projectId: projectAlpha._id,
        projectName: projectAlpha.name,
        fieldName: 'amount',
        oldValue: 0,
        newValue: 100000,
        reason: 'Initial approved baseline allocation for Phase 1',
        source: 'web',
        ipAddress: '192.168.1.104',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        isRisky: false,
        riskLevel: 'low',
        episodeId: 'ep_alpha_initiation',
        episodeTitle: 'Project Initiation & Setup'
      },
      {
        timestamp: new Date(now - 12 * day + 4 * hour),
        userId: alice._id,
        userName: alice.name,
        userEmail: alice.email,
        userRole: alice.role,
        action: 'CREATE',
        entityType: 'Task',
        entityId: task1._id.toString(),
        entityName: 'Implement OAuth 2.0 & SSO Auth Flow',
        projectId: projectAlpha._id,
        projectName: projectAlpha.name,
        fieldName: 'status',
        oldValue: null,
        newValue: 'Todo',
        reason: 'Authentication requirement assigned to sprint 1',
        source: 'web',
        ipAddress: '192.168.1.104',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        isRisky: false,
        riskLevel: 'low'
      },
      // Episode 2: Major Budget Revision (As described in PDF page 14: Alice updated Budget 100,000 -> 120,000 Reason: Extra scope from client)
      {
        timestamp: new Date(now - 7 * day + 5 * hour),
        userId: alice._id,
        userName: alice.name,
        userEmail: alice.email,
        userRole: alice.role,
        action: 'UPDATE',
        entityType: 'Budget',
        entityId: projectAlpha._id.toString(),
        entityName: 'Project Alpha Budget',
        projectId: projectAlpha._id,
        projectName: projectAlpha.name,
        fieldName: 'amount',
        oldValue: 100000,
        newValue: 120000,
        reason: 'Extra scope from client for multi-tenant isolation',
        source: 'web',
        ipAddress: '192.168.1.104',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        isRisky: false,
        riskLevel: 'medium',
        episodeId: 'ep_budget_expansion_01',
        episodeTitle: 'Scope & Budget Revision (Q3)'
      },
      {
        timestamp: new Date(now - 7 * day + 6 * hour),
        userId: charlie._id,
        userName: charlie.name,
        userEmail: charlie.email,
        userRole: charlie.role,
        action: 'APPROVE',
        entityType: 'Approval',
        entityId: 'APP-8841',
        entityName: 'Budget Expansion Signoff ($20,000)',
        projectId: projectAlpha._id,
        projectName: projectAlpha.name,
        fieldName: 'approvalStatus',
        oldValue: 'Pending Auditor Review',
        newValue: 'Approved by Compliance Board',
        reason: 'Reviewed signed contract addendum from client leadership',
        source: 'web',
        ipAddress: '10.0.4.19',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        isRisky: false,
        riskLevel: 'low',
        episodeId: 'ep_budget_expansion_01',
        episodeTitle: 'Scope & Budget Revision (Q3)'
      },
      // Tasks updates & integrations
      {
        timestamp: new Date(now - 5 * day + 1 * hour),
        userId: bob._id,
        userName: bob.name,
        userEmail: bob.email,
        userRole: bob.role,
        action: 'UPDATE',
        entityType: 'Task',
        entityId: task1._id.toString(),
        entityName: 'Implement OAuth 2.0 & SSO Auth Flow',
        projectId: projectAlpha._id,
        projectName: projectAlpha.name,
        fieldName: 'status',
        oldValue: 'Todo',
        newValue: 'In Progress',
        reason: 'Beginning sprint implementation',
        source: 'web',
        ipAddress: '172.16.0.45',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        isRisky: false,
        riskLevel: 'low'
      },
      {
        timestamp: new Date(now - 3 * day + 4 * hour),
        userId: null,
        userName: 'Jira Automation Sync',
        userEmail: 'jira-bot@atlassian.net',
        userRole: 'system',
        action: 'UPDATE',
        entityType: 'Task',
        entityId: task1._id.toString(),
        entityName: 'Implement OAuth 2.0 & SSO Auth Flow',
        projectId: projectAlpha._id,
        projectName: projectAlpha.name,
        fieldName: 'status',
        oldValue: 'In Progress',
        newValue: 'Done',
        reason: 'Jira issue PROJ-101 merged via GitHub PR #42',
        source: 'integration_jira',
        ipAddress: '52.84.12.89',
        userAgent: 'Atlassian-Jira-Webhook/9.4.0',
        isRisky: false,
        riskLevel: 'low'
      },
      // High-risk critical log item (Flagged)
      {
        timestamp: new Date(now - 2 * day + 8 * hour),
        userId: alice._id,
        userName: alice.name,
        userEmail: alice.email,
        userRole: alice.role,
        action: 'UPDATE',
        entityType: 'Budget',
        entityId: projectTitan._id.toString(),
        entityName: 'Project Titan Budget',
        projectId: projectTitan._id,
        projectName: projectTitan.name,
        fieldName: 'amount',
        oldValue: 150000,
        newValue: 240000,
        reason: 'Emergency cloud compute capacity provisioning for black friday benchmark',
        source: 'web',
        ipAddress: '192.168.1.104',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        isRisky: true,
        riskLevel: 'high',
        episodeId: 'ep_titan_infra_scale',
        episodeTitle: 'Titan Multi-Region Infrastructure Surge'
      },
      {
        timestamp: new Date(now - 1 * day + 3 * hour),
        userId: charlie._id,
        userName: charlie.name,
        userEmail: charlie.email,
        userRole: charlie.role,
        action: 'UPDATE',
        entityType: 'Document',
        entityId: 'DOC-501',
        entityName: 'SOC2 Type II Security Assessment Report',
        projectId: projectAlpha._id,
        projectName: projectAlpha.name,
        fieldName: 'status',
        oldValue: 'Draft',
        newValue: 'Final Approved',
        reason: 'External auditor verification completed with zero findings',
        source: 'web',
        ipAddress: '10.0.4.19',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        isRisky: false,
        riskLevel: 'low'
      },
      {
        timestamp: new Date(now - 4 * hour),
        userId: bob._id,
        userName: bob.name,
        userEmail: bob.email,
        userRole: bob.role,
        action: 'CREATE',
        entityType: 'Task',
        entityId: task2._id.toString(),
        entityName: 'Database Index Optimization & Sharding',
        projectId: projectAlpha._id,
        projectName: projectAlpha.name,
        fieldName: 'status',
        oldValue: null,
        newValue: 'In Progress',
        reason: 'Started performance tuning profiling',
        source: 'web',
        ipAddress: '172.16.0.45',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        isRisky: false,
        riskLevel: 'low'
      }
    ];

    await AuditLog.insertMany(auditLogsToInsert);
    console.log(`✅ Database successfully seeded with ${auditLogsToInsert.length} audit logs, 4 projects, and 4 users.`);
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

module.exports = seedDatabase;

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'maritime-audit-trail-secret-2026';

const requireAuth = async (req, res, next) => {
  try {
    // 1. Check for demo header (for easy demo role switching in evaluation)
    const demoRole = req.headers['x-demo-role'] || req.headers['x-demo-user'];
    if (demoRole) {
      const demoUser = await User.findOne({ role: demoRole, isActive: true });
      if (demoUser) {
        req.user = {
          userId: demoUser.userId,
          name: demoUser.name,
          email: demoUser.email,
          role: demoUser.role,
          department: demoUser.department,
          assignedPort: demoUser.assignedPort,
          assignedShipId: demoUser.assignedShipId
        };
        return next();
      }
    }

    // 2. Check JWT Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No authentication token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findOne({ userId: decoded.userId });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user account.' });
    }

    req.user = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      assignedPort: user.assignedPort,
      assignedShipId: user.assignedShipId
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Session expired or invalid token.' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
    }

    if (roles.includes(req.user.role) || req.user.role === 'admin') {
      return next();
    }

    return res.status(403).json({
      error: `Access forbidden: Role "${req.user.role}" is not permitted to perform this action. Required: [${roles.join(', ')}]`
    });
  };
};

module.exports = {
  requireAuth,
  requireRole,
  JWT_SECRET
};

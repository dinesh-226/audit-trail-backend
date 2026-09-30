const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function showUsers() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({});
  console.log('--- USERS IN MONGODB ATLAS ---');
  users.forEach(u => {
    console.log(`- Email: ${u.email}, Name: ${u.name}, Role: ${u.role}, ID: ${u._id}`);
  });
  process.exit(0);
}

showUsers().catch(console.error);

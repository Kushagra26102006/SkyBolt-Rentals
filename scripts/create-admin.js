#!/usr/bin/env node
/**
 * SkyBolt Rentals - Standalone Administrator Account Provisioning CLI
 * Usage:
 *   node scripts/create-admin.js
 *   node scripts/create-admin.js [email] [password] [name] [phone]
 * Examples:
 *   node scripts/create-admin.js admin@skybolt.com Admin@123456 "Super Admin"
 */

const path = require('path');
const fs = require('fs');

// Attempt to load backend dotenv
const backendEnvPath = path.resolve(__dirname, '../backend/.env');
const rootEnvPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(backendEnvPath)) {
  require('dotenv').config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
}

const mongoose = require(path.resolve(__dirname, '../backend/node_modules/mongoose'));
const bcrypt = require(path.resolve(__dirname, '../backend/node_modules/bcryptjs'));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/skybolt_rentals';

const adminEmail = (process.argv[2] || process.env.ADMIN_INITIAL_EMAIL || 'admin@skybolt.com').toLowerCase().trim();
const adminPassword = process.argv[3] || process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123456';
const adminName = process.argv[4] || process.env.ADMIN_INITIAL_NAME || 'SkyBolt Administrator';
const adminPhone = process.argv[5] || process.env.ADMIN_INITIAL_PHONE || '+91 9876543210';

async function createAdmin() {
  console.log('====================================================');
  console.log('⚡ SkyBolt Rentals - Admin Provisioning CLI');
  console.log(`🌐 Target Database: ${MONGODB_URI}`);
  console.log('====================================================');

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ Connected to MongoDB successfully.');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // 1. Check if user with this email already exists
    const existing = await usersCollection.findOne({ email: adminEmail });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    if (existing) {
      console.log(`ℹ️ User found with email "${adminEmail}" (current role: ${existing.role}). Elevating to ADMIN...`);
      await usersCollection.updateOne(
        { _id: existing._id },
        {
          $set: {
            role: 'ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            phoneVerified: true,
            passwordHash: passwordHash,
            updatedAt: new Date()
          }
        }
      );
      console.log('🎉 Successfully elevated user to ADMIN with updated credentials!');
    } else {
      console.log(`Creating fresh administrator account for "${adminEmail}"...`);
      const now = new Date();
      await usersCollection.insertOne({
        name: adminName,
        email: adminEmail,
        phone: adminPhone,
        passwordHash: passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        avatar: '',
        licenseNumber: 'DL-ADMIN-001',
        emailVerified: true,
        phoneVerified: true,
        isDeleted: false,
        createdAt: now,
        updatedAt: now
      });
      console.log('🎉 Successfully created fresh Administrator account!');
    }

    console.log('====================================================');
    console.log('👑 Administrator Credentials:');
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role:     ADMIN`);
    console.log('   Dashboard URL: http://localhost:8080/admin.html');
    console.log('====================================================');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to provision administrator account:', err.message);
    if (err.message && err.message.includes('ECONNREFUSED')) {
      console.error('\n💡 HINT: MongoDB is not running on localhost:27017.');
      console.error('   Start MongoDB before running this script (e.g. brew services start mongodb-community or mongod).');
    }
    process.exit(1);
  }
}

createAdmin();

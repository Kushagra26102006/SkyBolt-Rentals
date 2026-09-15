import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.model.js';
import { config } from '../config/env.config.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';

export interface AdminSeedConfig {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
}

/**
 * Authoritative Admin Provisioning & Seed Engine
 * Guarantees that at least one active administrator account exists in the database.
 * Idempotent: Skips if any user with role 'ADMIN' is already present.
 */
export async function seedAdmin(customConfig?: AdminSeedConfig): Promise<void> {
  try {
    const adminEmail = (
      customConfig?.email ||
      process.env.ADMIN_INITIAL_EMAIL ||
      'admin@skybolt.com'
    ).toLowerCase().trim();

    const adminPassword =
      customConfig?.password ||
      process.env.ADMIN_INITIAL_PASSWORD ||
      'Admin@123456';

    const adminName =
      customConfig?.name ||
      process.env.ADMIN_INITIAL_NAME ||
      'SkyBolt Administrator';

    const adminPhone =
      customConfig?.phone ||
      process.env.ADMIN_INITIAL_PHONE ||
      '+91 9876543210';

    // 1. Check if any ADMIN already exists in the system
    const existingAdmin = await UserModel.findOne({ role: 'ADMIN', isDeleted: false }).exec();

    if (existingAdmin) {
      // If the default admin email exists, ensure it is in ACTIVE status and verified
      if (existingAdmin.email === adminEmail && existingAdmin.status !== 'ACTIVE') {
        existingAdmin.status = 'ACTIVE';
        existingAdmin.emailVerified = true;
        await existingAdmin.save();
        console.log(`ℹ️ [SkyBolt Admin Seed] Re-activated existing administrator: ${adminEmail}`);
      }
    } else {
      // 2. Check if a user with the target admin email exists but is not an ADMIN
      const existingUser = await UserModel.findOne({ email: adminEmail }).select('+passwordHash').exec();

      if (existingUser) {
        existingUser.role = 'ADMIN';
        existingUser.status = 'ACTIVE';
        existingUser.emailVerified = true;
        existingUser.phoneVerified = true;
        const salt = await bcrypt.genSalt(config.auth.bcryptSaltRounds);
        existingUser.passwordHash = await bcrypt.hash(adminPassword, salt);
        await existingUser.save();
        console.log(`✅ [SkyBolt Admin Seed] Elevated existing account to ADMIN: ${adminEmail}`);
      } else {
        // 3. Create fresh initial Administrator account
        const salt = await bcrypt.genSalt(config.auth.bcryptSaltRounds);
        const passwordHash = await bcrypt.hash(adminPassword, salt);

        const newAdmin = new UserModel({
          name: adminName,
          email: adminEmail,
          phone: adminPhone,
          passwordHash,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          phoneVerified: true,
          licenseNumber: 'DL-ADMIN-001'
        });

        await newAdmin.save();

        console.log('====================================================');
        console.log('👑 [SkyBolt Admin Bootstrap] Initial Administrator provisioned:');
        console.log(`   Email:    ${adminEmail}`);
        console.log(`   Password: ${adminPassword}`);
        console.log(`   Role:     ADMIN`);
        console.log('   Access:   http://localhost:8080/admin.html');
        console.log('====================================================');
      }
    }

    // 4. Ensure standard demo customer exists for frictionless testing
    const demoCustomerEmail = 'customer@skybolt.com';
    const existingCustomer = await UserModel.findOne({ email: demoCustomerEmail }).exec();
    if (!existingCustomer) {
      const custSalt = await bcrypt.genSalt(config.auth.bcryptSaltRounds);
      const custHash = await bcrypt.hash('Customer@123', custSalt);
      const demoCust = new UserModel({
        name: 'Demo Customer',
        email: demoCustomerEmail,
        phone: '+91 9876543211',
        passwordHash: custHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
        phoneVerified: true,
        licenseNumber: 'DL-CUST-001'
      });
      await demoCust.save();
      console.log('👤 [SkyBolt Demo Seed] Demo Customer provisioned: customer@skybolt.com / Customer@123');
    }
  } catch (err: any) {
    console.error('❌ [SkyBolt Admin Seed Error] Failed to provision administrator:', err?.message || err);
  }
}

if (process.argv[1] && process.argv[1].includes('admin.seed')) {
  connectDatabase()
    .then(() => seedAdmin())
    .then(() => disconnectDatabase())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}


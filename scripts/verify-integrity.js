/**
 * SkyBolt Rentals - Production Integrity & Asset Verification Script
 * Validates file links, stylesheet references, script dependencies, and image assets.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(ROOT_DIR, 'frontend');

function runVerification() {
  console.log('[SkyBolt Verify] Running integrity and asset check...');
  let errors = 0;

  // 1. Validate HTML files in frontend/
  const htmlFiles = fs.readdirSync(FRONTEND_DIR).filter(f => f.endsWith('.html'));

  htmlFiles.forEach(file => {
    const fullPath = path.join(FRONTEND_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Check script tags
    const scriptMatches = [...content.matchAll(/<script[^>]+src="([^">:#]+)"/g)];
    scriptMatches.forEach(m => {
      const cleanPath = m[1].split('?')[0];
      const targetPath = path.join(FRONTEND_DIR, cleanPath);
      if (!fs.existsSync(targetPath)) {
        console.error(`  [FAIL] ${file}: Missing script "${m[1]}"`);
        errors++;
      }
    });

    // Check CSS stylesheets
    const cssMatches = [...content.matchAll(/<link[^>]+href="([^">:#]+\.css(?:\?[^"]*)?)"/g)];
    cssMatches.forEach(m => {
      const cleanPath = m[1].split('?')[0];
      const targetPath = path.join(FRONTEND_DIR, cleanPath);
      if (!fs.existsSync(targetPath)) {
        console.error(`  [FAIL] ${file}: Missing stylesheet "${m[1]}"`);
        errors++;
      }
    });

    // Check internal HTML navigation links
    const linkMatches = [...content.matchAll(/href="([^">:#]+\.html)(?:#[^"]*)?"/g)];
    linkMatches.forEach(m => {
      const targetPath = path.join(FRONTEND_DIR, m[1]);
      if (!fs.existsSync(targetPath)) {
        console.error(`  [FAIL] ${file}: Broken navigation link "${m[1]}"`);
        errors++;
      }
    });
  });

  // 2. Validate Referenced Images across HTML and JS in frontend/
  const searchFiles = [
    ...htmlFiles.map(f => path.join(FRONTEND_DIR, f)),
    ...fs.readdirSync(path.join(FRONTEND_DIR, 'js')).map(f => path.join(FRONTEND_DIR, 'js', f))
  ];

  searchFiles.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    const imgMatches = [...content.matchAll(/(assets\/images\/[a-zA-Z0-9_\-\.]+)/g)];
    imgMatches.forEach(m => {
      const targetPath = path.join(FRONTEND_DIR, m[1]);
      if (!fs.existsSync(targetPath)) {
        console.error(`  [FAIL] ${path.basename(filePath)}: Missing image asset "${m[1]}"`);
        errors++;
      }
    });
  });

  // 3. Validate .gitignore protects .env
  const gitignorePath = path.join(ROOT_DIR, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignoreContent.includes('.env')) {
      console.error('  [FAIL] .gitignore does not protect .env files');
      errors++;
    }
  } else {
    console.error('  [FAIL] .gitignore is missing');
    errors++;
  }

  // 4. Validate .env.example exists and contains no secrets
  const envExamplePath = path.join(ROOT_DIR, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    const envContent = fs.readFileSync(envExamplePath, 'utf8');
    const secretKeywords = ['password123', 'sk_live', 'rzp_live', 'supersecret'];
    for (const kw of secretKeywords) {
      if (envContent.toLowerCase().includes(kw)) {
        console.error(`  [SECURITY FAIL] .env.example appears to contain sensitive test secret: ${kw}`);
        errors++;
      }
    }
  } else {
    console.error('  [FAIL] .env.example is missing');
    errors++;
  }

  if (errors === 0) {
    console.log('[SkyBolt Verify] PASS: All scripts, stylesheets, assets, and environment files verified successfully.');
    process.exit(0);
  } else {
    console.error(`[SkyBolt Verify] FAIL: Detected ${errors} issue(s).`);
    process.exit(1);
  }
}

runVerification();

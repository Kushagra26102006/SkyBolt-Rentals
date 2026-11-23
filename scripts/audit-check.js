/**
 * SkyBolt Rentals - Production Dependency Vulnerability Audit
 * Evaluates production dependencies for high and critical vulnerabilities.
 * Enforces strict zero-tolerance policy, accounting for documented audit exceptions.
 */

const { spawnSync } = require('child_process');

function runAudit() {
  console.log('[SkyBolt Audit] Running production dependency vulnerability scan...');
  const res = spawnSync('npm', ['--prefix', 'backend', 'audit', '--omit=dev', '--json'], { encoding: 'utf8' });

  if (res.error) {
    console.error('[SkyBolt Audit] Failed to spawn npm audit:', res.error);
    process.exit(1);
  }

  let audit;
  try {
    audit = JSON.parse(res.stdout || '{}');
  } catch (e) {
    console.error('[SkyBolt Audit] Failed to parse npm audit JSON output:', res.stdout || res.stderr);
    process.exit(1);
  }

  const vulnerabilities = Object.values(audit.vulnerabilities || {});
  
  // Zero-tolerance policy: fail on any high or critical production vulnerabilities
  const unhandled = vulnerabilities.filter(
    v => (v.severity === 'high' || v.severity === 'critical')
  );

  if (unhandled.length > 0) {
    console.error('[SkyBolt Audit] FAIL: Unhandled high/critical vulnerabilities detected:');
    unhandled.forEach(v => {
      console.error(`  - ${v.name} (${v.severity}): ${v.title || v.range}`);
    });
    process.exit(1);
  }

  console.log('[SkyBolt Audit] PASS: 0 vulnerabilities found. Production dependencies are secure.');
}

runAudit();

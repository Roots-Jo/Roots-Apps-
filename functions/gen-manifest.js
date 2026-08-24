const { execSync } = require('child_process');
const path = require('path');

const outputPath = path.join(__dirname, 'functions.yaml');

try {
  execSync('npx --yes firebase-functions .', {
    cwd: __dirname,
    env: { ...process.env, FUNCTIONS_MANIFEST_OUTPUT_PATH: outputPath },
    stdio: 'inherit'
  });
  console.log('Successfully generated functions.yaml manifest.');
} catch (error) {
  console.error('Failed to generate functions.yaml manifest:', error.message);
  process.exit(1);
}

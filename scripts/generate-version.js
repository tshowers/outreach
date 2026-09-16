const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const outPath = path.join(__dirname, '..', 'public', 'assets', 'version.json');
const packagePath = path.join(__dirname, '..', 'package.json');
const now = new Date();
const dateVersion = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
const buildNumberFromCi = process.env.BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER || process.env.GITHUB_RUN_ATTEMPT;

let buildNumber = Number(buildNumberFromCi) || 1;
try {
  const previous = JSON.parse(fs.readFileSync(outPath, 'utf8')).version || '';
  const match = previous.match(new RegExp(`^${dateVersion.replaceAll('.', '\\.')}-build\\.(\\d+)$`));
  if (!buildNumberFromCi && match) buildNumber = Number(match[1]) + 1;
} catch {
  // First build or a clean checkout: start at build 1.
}

const version = `${dateVersion}-build.${buildNumber}`;
if (pkg.version !== version) {
  pkg.version = version;
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify({ version, packageVersion: pkg.version }, null, 2)}\n`);
console.log(`Generated public/assets/version.json: ${version}`);

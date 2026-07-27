const fs = require('node:fs');
const path = 'scripts/apply-heavy-mist-fix.cjs';
let source = fs.readFileSync(path, 'utf8');
source = source.replaceAll('\\`${name}', '\\`\\${name}');
source = source.replaceAll('${(coverage.ratio', '\\${(coverage.ratio');
fs.writeFileSync(path, source);
console.log('Repaired nested browser-test template literals in heavy mist patcher.');

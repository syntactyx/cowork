const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.devDependencies.electron = '41.0.1';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('Done');

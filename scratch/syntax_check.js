const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = [
  'js/supabase.js',
  'js/config.js',
  'js/state.js',
  'js/player.js',
  'js/practice.js',
  'js/match.js',
  'js/ui.js',
  'js/main.js'
];

files.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${file}`);
    return;
  }
  const code = fs.readFileSync(filePath, 'utf8');
  try {
    new vm.Script(code);
    console.log(`OK: ${file}`);
  } catch (e) {
    console.log(`ERROR in ${file}: ${e.message}`);
    // Extract line number if possible
    const stack = e.stack || '';
    console.log(stack);
  }
});

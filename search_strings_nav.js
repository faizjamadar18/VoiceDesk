const fs = require('fs');
const js = fs.readFileSync('extracted-voiceos/index-BKi3REhQ.js', 'utf8');

// Let's search for navigation enum or tabs definition
const matches = [];
let idx = 0;
while ((idx = js.indexOf('strings.navigation', idx + 1)) !== -1) {
  matches.push(idx);
}
console.log('strings.navigation matches:', matches.length);
matches.slice(0, 5).forEach(p => {
  console.log(p, ':', js.slice(p - 50, p + 200));
});

// Let's also search for 'sidebar' or 'Dashboard'
const matches2 = [];
let idx2 = 0;
while ((idx2 = js.indexOf('strings.sidebar', idx2 + 1)) !== -1) {
  matches2.push(idx2);
}
console.log('strings.sidebar matches:', matches2.length);
matches2.slice(0, 5).forEach(p => {
  console.log(p, ':', js.slice(p - 50, p + 200));
});


const fs = require('fs');

function replaceInFile(file, search, replace) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.split(search).join(replace);
  fs.writeFileSync(file, content);
}

replaceInFile('tests/e2e/integration/trash-undo.test.ts', '"3 Duplicate Groups Found"', '"3 duplicate groups"');
replaceInFile('tests/e2e/integration/app-tab.test.ts', '"3 Duplicate Groups Found"', '"3 duplicate groups"');
replaceInFile('tests/e2e/integration/app-tab.test.ts', '"2 Duplicate Groups Found"', '"2 duplicate groups"');
replaceInFile('tests/e2e/integration/app-tab.test.ts', '"1 Duplicate Group Found"', '"1 duplicate group"');

// Fix regexes in full flows
replaceInFile('tests/e2e/full/scan-flow.test.ts', '/Duplicate Groups Found/', '/duplicate groups/i');
replaceInFile('tests/e2e/full/trash-flow.test.ts', '/Duplicate Groups Found/', '/duplicate groups/i');

console.log("Replaced text assertions in tests.");

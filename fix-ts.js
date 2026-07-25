const fs = require('fs');

// 1. Fix ScanConfig.tsx
let scanConfig = fs.readFileSync('components/ScanConfig.tsx', 'utf8');
scanConfig = scanConfig.replace('const val = e.target.value', 'const val = e.target.value as string');
fs.writeFileSync('components/ScanConfig.tsx', scanConfig);

// 2. Fix app-reducer.ts
let appReducer = fs.readFileSync('lib/app-reducer.ts', 'utf8');
appReducer = appReducer.replace('      totalToTrash: number\n      trashedSoFar: number\n      accountEmail?: string\n    }', '      totalToTrash: number\n      trashedSoFar: number\n      accountEmail?: string\n      hasGptk: boolean\n    }');
appReducer = appReducer.replace('        trashedSoFar: 0,\n        accountEmail: state.accountEmail,\n      }', '        trashedSoFar: 0,\n        accountEmail: state.accountEmail,\n        hasGptk: "hasGptk" in state ? state.hasGptk : false,\n      }');
fs.writeFileSync('lib/app-reducer.ts', appReducer);

// 3. Fix tests/lib/app-reducer.test.ts
let testReducer = fs.readFileSync('tests/lib/app-reducer.test.ts', 'utf8');
testReducer = testReducer.replace('totalItems: 4, accountEmail: "alice@example.com" }', 'totalItems: 4, accountEmail: "alice@example.com", hasGptk: true }');
testReducer = testReducer.replace('{ status: "results", mediaItems: {}, groups: [], totalItems: 0 },', '{ status: "results", mediaItems: {}, groups: [], totalItems: 0, hasGptk: false },');
fs.writeFileSync('tests/lib/app-reducer.test.ts', testReducer);

// 4. Fix tests/components/duplicate-groups.test.tsx
let testGroups = fs.readFileSync('tests/components/duplicate-groups.test.tsx', 'utf8');
testGroups = testGroups.replace('onToggleKept: vi.fn(),\n  }', 'onToggleKept: vi.fn(),\n    onIgnoreGroup: vi.fn(),\n    groupIndex: 0,\n    totalGroups: 1,\n    previewHeight: 120,\n    previewWidth: 160,\n    fetchHeight: 200,\n  }');
fs.writeFileSync('tests/components/duplicate-groups.test.tsx', testGroups);

// 5. Fix tests/perf/duplicate-groups.bench.tsx
let benchGroups = fs.readFileSync('tests/perf/duplicate-groups.bench.tsx', 'utf8');
benchGroups = benchGroups.replace(/onToggleKept: \(\) => \{\},/g, 'onToggleKept: () => {},\n    onIgnoreGroup: () => {},\n    groupIndex: 0,\n    totalGroups: 1,\n    previewHeight: 120,\n    previewWidth: 160,\n    fetchHeight: 200,');
fs.writeFileSync('tests/perf/duplicate-groups.bench.tsx', benchGroups);

console.log("TS fixes applied");

const { Window } = require('happy-dom');
const window = new Window();
Object.assign(window, { innerWidth: 1000, innerHeight: 800, devicePixelRatio: 2 });
console.log(window.innerWidth, window.innerHeight, window.devicePixelRatio);

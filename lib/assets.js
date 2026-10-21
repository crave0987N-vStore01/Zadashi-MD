'use strict';
// Zadashi - MD · bot logo (menu / alive picture)
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./config');
let logo = null, thumb = null;
const read = (n) => { try { return fs.readFileSync(path.join(PUBLIC_DIR, n)); } catch (e) { return null; } };
module.exports = {
    logo() { if (!logo) logo = read('logo.jpg'); return logo; },
    thumb() { if (!thumb) thumb = read('logo-thumb.jpg'); return thumb; }
};

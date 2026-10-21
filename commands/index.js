'use strict';
// Zadashi - MD · loads all 50 commands (menu order: Download, Search, Tools, Fun, Group, Owner, Main)
require('./download');
require('./search');
require('./tools');
require('./sticker');
require('./fun');
require('./free');
require('./group');
require('./moderation');
require('./owner');
require('./main');
const { list } = require('../lib/registry');
module.exports = { count: () => list.length };

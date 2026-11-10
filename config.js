// Dashboard settings. This file is committed, so it must never contain a token.
//
// source: 'airtable' reads the data from the Airtable base below; 'demo' generates invented data in the browser.
// The token is requested on first load and kept for the browser session only. To avoid typing it each time,
// create config.local.js (ignored by git) next to this file with:
//   window.APP_CONFIG.airtable.token = 'pat...';
window.APP_CONFIG = {
  source: 'airtable',
  airtable: {
    baseId: 'appS5K6TugLWnxOXP',
    token: '',
  },
};

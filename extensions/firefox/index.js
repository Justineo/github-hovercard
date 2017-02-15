let data = require('sdk/self').data;
let prefs = require('sdk/simple-prefs').prefs;
let pageMod = require('sdk/page-mod');

let domains = prefs.domains || '';
domains = domains.split(/[,\s]/)
  .map((domain) => [`http://${domain}/*`, `https://${domain}/*`])
  .reduce((prev, current) => prev.concat(current), [
    'http://github.com/*', 'https://github.com/*'
  ]);

pageMod.PageMod({
  include: domains,
  contentScriptFile: [
    data.url('jquery.js'),
    data.url('mustache.js'),
    data.url('tooltipster.js'),
    data.url('hovercard.js')
  ],
  contentScriptOptions: {
    octicons: JSON.parse(data.load('octicons.json')),
    emojiMap: JSON.parse(data.load('emoji.json')),
    prefs: prefs
  },
  contentStyleFile: [
    data.url('tooltipster.css'),
    data.url('hovercard.css'),
    data.url('tomorrow-night.css')
  ]
});

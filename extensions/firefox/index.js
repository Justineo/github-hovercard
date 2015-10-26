let data = require('sdk/self').data;
let domains = require('sdk/simple-prefs').prefs.domains;
let pageMod = require('sdk/page-mod');

domains = domains.split(/[,\s]/)
  .map((domain) => [`http://${domain}/*`, `https://${domain}/*`])
  .reduce((prev, current) => prev.concat(current), [
    'http://github.com', 'https://github.com/*'
  ]);

pageMod.PageMod({
  include: domains,
  contentScriptFile: [
    data.url('jquery.js'),
    data.url('mustache.js'),
    data.url('tooltipster.js'),
    data.url('marked.js'),
    data.url('highlight.pack.js'),
    data.url('hovercard.js')
  ],
  contentStyleFile: [
    data.url('tooltipster.css'),
    data.url('highlight.css'),
    data.url('hovercard.css')
  ],
  contentScriptOptions: {
    emojiURLs: JSON.parse(data.load('emoji.json'))
  }
});

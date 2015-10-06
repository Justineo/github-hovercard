var data = require('sdk/self').data;
var pageMod = require('sdk/page-mod');

pageMod.PageMod({
  include: [
    'http://github.com/*',
    'https://github.com/*'
  ],
  contentScriptFile: [
    data.url('jquery.js'),
    data.url('mustache.js'),
    data.url('tooltipster.js'),
    data.url('hovercard.js')
  ],
  contentStyleFile: [
    data.url('tooltipster.css'),
    data.url('hovercard.css')
  ],
  contentScriptOptions: {
    emojiURL: data.url('emoji.json')
  }
});

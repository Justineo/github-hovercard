$(() => {
  'use strict';

  if (location.hash === '#disclaimer') {
    let $disclaimer = $('.disclaimer');
    $(`<div id="overlay"></div>`)
      .append($disclaimer.clone().append('<p class="alt">Click anywhere to close...</p>'))
      .appendTo(document.body)
      .on('click', function () {
        $(this).addClass('ok');
        if (history.replaceState) {
          history.replaceState({}, document.title, '/');
        }
      });
  }

  /**
   * Check browsers
   */
  let browser = window.browser;
  let $installBtn = $(`#${browser} .install`);
  let $hint = $(`#${browser} .hint`);

  const EXT_NAME = 'github-hovercard';
  const EXT_ID = {
    chrome: 'mmoahbbnojgkclgceahhakhnccimnplk',
    mozilla: '641356',
    opera: 'lldmekkknkapaampcfindholkpaeocib'
  }[browser];
  const VENDOR_URL = {
    chrome: `https://chrome.google.com/webstore/detail/${EXT_ID}`,
    mozilla: `https://addons.mozilla.org/en-US/firefox/addon/${EXT_ID}/`,
    opera: `https://addons.opera.com/extensions/details/${EXT_NAME}/`
  }[browser];
  const VENDOR_NAME = {
    chrome: 'Chrome Webstore',
    mozilla: 'Mozilla Add-ons',
    opera: 'Opera Extensions'
  }[browser];

  $installBtn.on('click', function () {
    if (browser === 'chrome') {
      setInstalling();
      chrome.webstore.install(VENDOR_URL, setInstalled.bind(null, true), reset);
    } else if (browser === 'opera') {
      setInstalling();
      opr.addons.installExtension(EXT_ID, setInstalled.bind(null, true), reset);
    } else if (browser === 'mozilla') {
      let result = InstallTrigger.install({
        'GitHub Hovercard': {
          URL: 'https://addons.mozilla.org/firefox/downloads/latest/' + EXT_ID + '/addon-' + EXT_ID + '-latest.xpi',
          ICON_URL: 'https://addons.cdn.mozilla.net/user-media/addon_icons/641/' + EXT_ID + '.png?modified=1450363198'
        }
      });
    }
  });

  checkInstalled();

  function checkInstalled() {
    switch (browser) {
      case 'chrome':
      case 'opera': {
        chrome.runtime.sendMessage(EXT_ID, { message: 'version' }, (resp) => {
          if (resp) {
            setInstalled();
          }
        });
        break;
      }
      case 'mozilla': {
        let timer = setInterval(() => {
          if (document.body.getAttribute('data-github-hovercard')) {
            setInstalled();
            clearTimeout(timer);
          }
        }, 100);
        break;
      }
    }
  }

  function setInstalled(isInstalledNow) {
    $installBtn.text('Installed').prop('disabled', true).addClass('disabled');
    let wording = isInstalledNow ? 'successfully' : 'already';
    $hint.text(`You have ${wording} installed GitHub Hovercard, enjoy!`);
  }

  function setInstalling() {
    $installBtn.text('Installing...').prop('disabled', true);
  }

  function reset(msg) {
    $installBtn.text('Install').prop('disabled', false);
    $hint.html(`${msg || 'Something went wrong.'} Try again or download at <a href="${VENDOR_URL}">${VENDOR_NAME}</a>.`);
  }
});

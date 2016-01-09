$(() => {
  'use strict';

  /**
   * Check browsers
   */
  let browser = window.browser;
  let $installBtn = $(`#${browser} .install`);
  let $hint = $(`#${browser} .hint`);

  const CHROME_EXT_ID = 'mmoahbbnojgkclgceahhakhnccimnplk';
  const VENDOR_URL = browser === 'chrome'
    ? `https://chrome.google.com/webstore/detail/${CHROME_EXT_ID}`
    : 'https://addons.mozilla.org/en-US/firefox/addon/github-hovercard/';
  const VENDOR_NAME = browser === 'chrome'
    ? 'Chrome Webstore' : 'Mozilla Add-ons';

  $installBtn.on('click', function () {
    if (browser === 'chrome') {
      setInstalling();
      chrome.webstore.install(VENDOR_URL, setInstalled.bind(null, true), reset);
    } else if (browser === 'mozilla') {
      let result = InstallTrigger.install({
        "GitHub Hovercard": {
          URL: 'https://addons.mozilla.org/firefox/downloads/latest/641356/addon-641356-latest.xpi',
          ICON_URL: 'https://addons.cdn.mozilla.net/user-media/addon_icons/641/641356-32.png?modified=1450363198'
        }
      });
    }
  });

  checkInstalled();

  function checkInstalled() {
    if (browser === 'chrome') {
      chrome.runtime.sendMessage(CHROME_EXT_ID, { message: 'version' }, (resp) => {
        console.log(resp);
        if (resp) {
          setInstalled();
        }
      });
    } else if (browser === 'mozilla') {
      let timer = setInterval(() => {
        if (document.body.getAttribute('data-github-hovercard')) {
          setInstalled();
          clearTimeout(timer);
        }
      }, 100);
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

  function reset() {
    $installBtn.text('Install').prop('disabled', false);
    $hint.html(`Something went wrong. Try again or download at <a href="${VENDOR_URL}">${VENDOR_NAME}</a>.`);
  }
});

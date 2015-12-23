$(() => {
  'use strict';

  let ua = window.ua;
  let $installBtn = $(`#${ua.browser} .install`);
  let $hint = $(`#${ua.browser} .hint`);

  const VENDOR_URL = ua.browser === 'chrome'
    ? 'https://chrome.google.com/webstore/detail/mmoahbbnojgkclgceahhakhnccimnplk'
    : 'https://addons.mozilla.org/en-US/firefox/addon/github-hovercard/';
  const VENDOR_NAME = ua.browser === 'chrome'
    ? 'Chrome Webstore' : 'Mozilla Add-ons';

  $installBtn.on('click', function () {
    setInstalling();

    if (ua.browser === 'chrome') {
      chrome.webstore.install(WEBSTORE_URL, setInstalled.bind(null, true), reset);
    } else if (ua.browser === 'mozilla') {
      var result = InstallTrigger.install({
        "GitHub Hovercard": {
          URL: 'https://addons.mozilla.org/firefox/downloads/latest/641356/addon-641356-latest.xpi',
          HASH: 'sha256:60d831956ddf766b38eb873adc323d8ce1355f0be9a34cd4657edf6249d5b720',
          ICON_URL: 'https://addons.cdn.mozilla.net/user-media/addon_icons/641/641356-32.png?modified=1450363198'
        }
      }, setInstalled.bind(null, true));
    }
  });

  let timer = setInterval(checkInstalled, 100);
  function checkInstalled() {
    if (document.body.getAttribute('data-github-hovercard')) {
      setInstalled();
      clearTimeout(timer);
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

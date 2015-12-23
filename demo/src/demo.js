$(() => {
  'use strict';

  let ua = window.ua;
  let $installBtn = $(`#${ua.browser} .install`);

  $installBtn.on('click', function () {
    setInstalling();

    if (ua.browser === 'chrome') {
      chrome.webstore.install(
        'https://chrome.google.com/webstore/detail/mmoahbbnojgkclgceahhakhnccimnplk',
        setInstalled.bind(null, true),
        () => {
          console.error('Fail to install');
        }
      );
    } else if (ua.browser === 'mozilla') {
      var result = InstallTrigger.install({
        "GitHub Hovercard": {
          URL: 'https://addons.mozilla.org/firefox/downloads/latest/641356/addon-641356-latest.xpi',
          HASH: 'sha256:60d831956ddf766b38eb873adc323d8ce1355f0be9a34cd4657edf6249d5b720',
          ICON_URL: 'https://addons.cdn.mozilla.net/user-media/addon_icons/641/641356-32.png?modified=1450363198'
        }
      }, setInstalled.bind(null, true));
      alert(result);
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
    $(`#${ua.browser} .hint`).text(`You have ${wording} installed GitHub Hovercard, enjoy!`);
  }

  function setInstalling() {
    $installBtn.text('Installing...').prop('disabled', true);
  }
});

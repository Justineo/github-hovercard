$(() => {
  var $installBtn = $('#chrome-install');

  $installBtn.on('click', function () {
    chrome.webstore.install(
      'https://chrome.google.com/webstore/detail/mmoahbbnojgkclgceahhakhnccimnplk',
      setInstalled,
      () => {
        console.error('Fail to install');
      }
    );
  });

  var timer = setInterval(checkInstalled, 100);
  function checkInstalled() {
    if (document.body.getAttribute('data-github-hovercard')) {
      setInstalled();
      clearTimeout(timer);
    }
  }

  function setInstalled() {
    $installBtn.text('Installed').prop('disabled', true);
  }
});

$(() => {
  $('#chrome-install').on('click', function () {
    chrome.webstore.install(
      'https://chrome.google.com/webstore/detail/mmoahbbnojgkclgceahhakhnccimnplk',
      () => {
        $(this).text('Installed').prop('disabled', true);
      },
      () => {
        console.error('Fail to install');
      }
    );
  });
});

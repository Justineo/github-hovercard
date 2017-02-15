/**
 * Use JavaScript to inject styles because extension styles
 * are treated as user stylesheet in Safari thus may lead to
 * precedence issues.
 */
(() => {
  let head = document.querySelector('head');

  function addStyle(file) {
    let link = document.createElement('link');
    link.href = `${safari.extension.baseURI}${file}`;
    link.rel = 'stylesheet';
    head.appendChild(link);
  }

  ['tooltipster.css', 'tomorrow-night.css', 'hovercard.css'].forEach(addStyle);
})();

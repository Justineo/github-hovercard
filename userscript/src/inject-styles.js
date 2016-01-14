(function () {
    function createStyle(styleText) {
        var style = document.createElement('style');
        style.type = 'text/css';

        // <style> element must be appended into DOM before setting `cssText`
        // otherwise IE8 will interpret the text in IE7 mode.
        document.querySelector('head').appendChild(style);
        if (style.styleSheet) {
            style.styleSheet.cssText = styleText;
        } else {
            style.appendChild(document.createTextNode(styleText));
        }
    }

    createStyle('__USER_SCRIPT_STYLES__');
})();

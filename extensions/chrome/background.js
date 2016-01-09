'use strict';

let contentJS = [
    'jquery.js',
    'mustache.js',
    'tooltipster.js',
    'remarkable.js',
    'highlight.pack.js',
    'js-xss.js',
    'hovercard.js'
];

let contentCSS = [
    'tooltipster.css',
    'highlight.css',
    'hovercard.css'
];

const INJECTORS = {
    js: chrome.tabs.executeScript.bind(chrome.tabs),
    css: chrome.tabs.insertCSS.bind(chrome.tabs)
};

function inject(id, files, type, callback) {
    let injector = INJECTORS[type];
    if (!injector) {
        return;
    }

    // inject code
    if (typeof files === 'string') {
        injector(id, {
            code: files
        }, callback);
        return;
    }

    // inject files
    let index = 0;
    let remaining = files.length;

    function injectNext() {
        if (remaining > 0) {
            injector(id, {
                file: files[index]
            }, () => {
                console.log(files[index] + ' injected.');
                index++;
                remaining--;
                injectNext();
            });
        } else {
            if (typeof callback === 'function') {
                callback();
            }
        }
    }
    injectNext();
}

function injectJS(id, content, callback) {
    inject(id, content, 'js', callback);
}

function injectCSS(id, content, callback) {
    inject(id, content, 'css', callback);
}

const GITHUB_DOMAIN = 'github.com';

function injector(details) {
    console.log('Injecting...');
    let tab = details.tabId;
    injectJS(tab, contentJS);
    injectCSS(tab, contentCSS);
}

function bindInjector(domains) {
    // always enable hovercard on GitHub
    if (domains.indexOf(GITHUB_DOMAIN) === -1) {
        domains.push(GITHUB_DOMAIN);
    }
    let filters = domains.map((domain) => { return { hostEquals: domain }; });
    if (chrome.webNavigation.onCommitted.hasListener(injector)) {
        console.log('Removing old injector...');
        chrome.webNavigation.onCommitted.removeListener(injector);
    }
    // rebind injector with different domains
    console.log('Binding new injector...');
    chrome.webNavigation.onCommitted.addListener(injector, { url: filters });
}

function init() {
    console.log('Loading options...');
    chrome.storage.sync.get({
        domains: []
    }, (items) => bindInjector(items.domains));
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.event === 'optionschange') {
        init();
        respond({ success: true });
    }
});

init();

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    console.log('On message external');
    if (request) {
        if (request.message) {
            if (request.message === 'version') {
                sendResponse({ version: chrome.runtime.getManifest().version });
            }
        }
    }
    return true;
});

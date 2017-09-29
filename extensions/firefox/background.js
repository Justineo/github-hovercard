'use strict';

let contentJS = [
    'jquery.js',
    'mustache.js',
    'tooltipster.js',
    'tripleclick.js',
    'hovercard.js'
];

let contentCSS = [
    'tooltipster.css',
    'hovercard.css',
    'tomorrow-night.css'
];

const INJECTORS = {
    js: chrome.tabs.executeScript.bind(chrome.tabs),
    css: chrome.tabs.insertCSS.bind(chrome.tabs)
};

let storage = chrome.storage.sync || chrome.storage.local;

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
                console.log('"' + files[index] + '" is injected.');
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
    let tab = details.tabId;
    injectJS(tab, contentJS);
    injectCSS(tab, contentCSS);
}

function bindInjector(domains = []) {
    // always enable hovercard on GitHub
    if (domains.indexOf(GITHUB_DOMAIN) === -1) {
        domains.push(GITHUB_DOMAIN);
    }
    let filters = domains.map((domain) => { return { hostEquals: domain }; });
    if (chrome.webNavigation.onCommitted.hasListener(injector)) {
        chrome.webNavigation.onCommitted.removeListener(injector);
    }
    // rebind injector with different domains
    chrome.webNavigation.onCommitted.addListener(injector, { url: filters });
}

function init() {
    storage.get({
        domains: []
    }, (items = {}) => bindInjector(items.domains));
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
    if (request) {
        if (request.message) {
            if (request.message === 'version') {
                sendResponse({ version: chrome.runtime.getManifest().version });
            }
        }
    }
});

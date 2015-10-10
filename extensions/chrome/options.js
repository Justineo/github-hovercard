'use strict';

const ITEM_TPL = `{{#domains}}<li><input type="text" class="domain" value="{{.}}"><button type="button" class="remove">✕</button></li>{{/domains}}`;

let list = $('#domains');
let saveBtn = $('#save');
let addBtn = $('#add');
let msg = $('#message');
let current;

function toOrigin(domain) {
    return `https://${domain}/*`;
}

function restore() {
    chrome.storage.sync.get({ domains: [] }, (items) => {
        current = items.domains;
        list.append(Mustache.render(ITEM_TPL, { domains: current }));
    });
}

function save() {
    let result = [];
    let inputs = $('.domain');
    inputs.each(function () {
        let domain = $(this).val().trim();
        if (domain && result.indexOf(domain) === -1) {
            result.push(domain);
        }
    });

    // let revokes = [];
    // for (let i = 0, j = current.length; i < j; i++) {
    //     let domain = current[i];
    //     if (result.indexOf(domain) === -1) {
    //         revokes.push(domain);
    //     }
    // }
    // chrome.permissions.remove({
    //     origins: revokes.map(toOrigin)
    // });

    // chrome.permissions.request({
    //     origins: result.map(toOrigin)
    // }, (isGranted) => {
    //     if (isGranted) {
            chrome.storage.sync.set({
                domains: result
            }, () => {
                current = result;
                window.close();
            });
    //     } else {
    //         log('Permission denied.');
    //     }
    // });
}

function addRow() {
    if ($('.domain').length >= 4) {
        log('That should be enough.', 3000);
        return;
    }
    list.append(Mustache.render(ITEM_TPL, {
        domains: ['']
    }));
}

function removeRow() {
    $(this).parent().remove();
}

let logTimer;
function log(message, duration) {
    clearTimeout(logTimer);
    msg.html(message).show();
    if (duration) {
        logTimer = setTimeout(() => {
            msg.fadeOut(500);
        }, duration);
    }
}

$(restore);
saveBtn.on('click', save);
addBtn.on('click', addRow);
list.on('click', '.remove', removeRow);

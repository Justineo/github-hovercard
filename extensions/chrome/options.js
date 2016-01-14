'use strict';

const ITEM_TPL = `{{#domains}}<li><input type="text" class="domain" value="{{.}}" placeholder="github.mydomain.com"><button type="button" class="remove">✕</button></li>{{/domains}}`;
const GH_DOMAIN = 'github.com';

let list = $('#domains');
let saveBtn = $('#save');
let cancelBtn = $('#cancel');
let addBtn = $('#add');
let msg = $('#message');
let current;
let storage = chrome.storage.sync || chrome.storage.local;

function toOrigins(name) {
    return [`http://${name}/*`, `https://${name}/*`];
}

function concat(a, b) {
    return a.concat(b);
}

function restore() {
    storage.get({ domains: [] }, items => {
        current = items.domains;
        list.append(Mustache.render(ITEM_TPL, { domains: current }));
    });
}

function save() {
    let domains = [];
    $('.domain').each(function () {
        let domain = $(this).val().trim();
        if (domains.indexOf(domain) === -1 && domain !== GH_DOMAIN) {
            domains.push(domain);
        }
    });

    let revoking = current.filter(domain => {
        return domains.indexOf(domain) === -1;
    }).map(toOrigins).reduce(concat, []);

    chrome.permissions.remove({
        origins: revoking
    }, removed => {
        let granting = domains.map(toOrigins).reduce(concat, []);
        chrome.permissions.request({
            origins: granting
        }, granted => {
            if (!granted) {
                log('Domain permission denied.');
                return;
            }

            storage.set({
                domains: domains
            }, () => {
                current = domains;
                chrome.runtime.sendMessage({ event: 'optionschange' }, response => {
                    if (response.success) {
                        window.close();
                    } else {
                        log('Something went wrong.');
                    }
                });
            });
        });
    });
}

function cancel() {
    window.close();
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
            msg.animate({ opacity: 0 }, 500);
        }, duration);
    }
}

$(() => {
    saveBtn.on('click', save);
    cancelBtn.on('click', cancel);
    addBtn.on('click', addRow);
    list.on('keypress', '.domain', e => {
        if (e.which === 13) {
            save();
        }
    });
    list.on('click', '.remove', removeRow);

    restore();
});

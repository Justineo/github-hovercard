'use strict';

const ITEM_TPL = `{{#domains}}<li><input type="text" class="domain" value="{{.}}" placeholder=""><button type="button" class="remove">✕</button></li>{{/domains}}`;

let list = $('#domains');
let saveBtn = $('#save');
let cancelBtn = $('#cancel');
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

    chrome.storage.sync.set({
        domains: result
    }, () => {
        current = result;
        chrome.runtime.sendMessage({ event: 'optionschange' }, (response) => {
            if (response.success) {
                window.close();
            } else {
                log('Something went wrong.');
            }
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

$(restore);
saveBtn.on('click', save);
cancelBtn.on('click', cancel);
addBtn.on('click', addRow);
list.on('keypress', '.domain', (e) => {
    if (e.which === 13) {
        save();
    }
});
list.on('click', '.remove', removeRow);

'use strict';

const ITEM_TPL = `{{#domains}}<li><input type="text" ui="wide" class="domain" value="{{.}}" placeholder="github.mydomain.com"><button type="button" class="remove">✕</button></li>{{/domains}}`;
const GH_DOMAIN = 'github.com';

let list = $('#domains');
let saveBtn = $('#save');
let cancelBtn = $('#cancel');
let addBtn = $('#add');
let msg = $('#message');
let delayInput = $('#delay');
let readmeInput = $('#readme');
let projectsInput = $('#projects');
let showSelfInput = $('#show-self');
let current;
let storage = browser.storage.sync || browser.storage.local;

function toOrigins(name) {
    return [`http://${name}/*`, `https://${name}/*`];
}

function concat(a, b) {
    return a.concat(b);
}

function restore() {
    storage.get({
        domains: [],
        delay: 200,
        readme: true,
        disableProjects: false,
        showSelf: false
    }, item => {
        current = item.domains;
        list.append(Mustache.render(ITEM_TPL, { domains: current }));
        delayInput.val(item.delay);
        readmeInput.prop('checked', item.readme);
        projectsInput.prop('checked', item.disableProjects);
        showSelfInput.prop('checked', item.showSelf);
    });
}

function save() {
    let delay = delayInput.val();
    let readme = readmeInput.prop('checked');
    let disableProjects = projectsInput.prop('checked');
    let showSelf = showSelfInput.prop('checked');

    let domains = [];
    $('.domain').each(function () {
        let domain = $(this).val().trim();
        if (domains.indexOf(domain) === -1 && domain !== GH_DOMAIN) {
            domains.push(domain);
        }
    });

    let options = { delay, readme, disableProjects, showSelf };
    Object.assign(options, { domains });
    current = domains;

    storage.set(options, () => {
        browser.runtime.sendMessage({ event: 'optionschange' }, response => {
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
    msg.css({opacity: 1}).html(message);
    if (duration) {
        logTimer = setTimeout(() => {
            msg.animate({ opacity: 0 }, 500, () => msg.empty());
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

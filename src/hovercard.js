$(function () {
    var target = document.querySelector('.site');
    var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === 'childList') {
                extract(mutation.target);
            }
        });
    });
    var observeConfig = {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
    };
    observer.observe(target, observeConfig);

    const EXTRACTOR = {
        SLUG: 0,  // {{user}}/{{repo}}
        TEXT: 1,  // {{user}}
        ALT: 2,   // alt="{{user}}"
        TITLE: 3, // title="{{user}}"
        URL: 4    // href="/{{user}}" or href="https://github.com/{{user}}"
    };

    var me = $('meta[name="user-login"]').attr('content');

    // based on octotree's config
    const GH_RESERVED_USER_NAMES = [
      'settings', 'orgs', 'organizations', 'site', 'blog', 'about',
      'explore', 'styleguide', 'showcases', 'trending', 'stars',
      'dashboard', 'notifications', 'search', 'developer', 'account',
      'pulls', 'issues', 'features', 'contact', 'security', 'join',
      'login', 'password_reset', 'watching'
    ];

    const GH_USER_NAME_PATTERN = /^[a-z0-9]$|^[a-z0-9](?:[a-z0-9](?!--)|-(?!-))*[a-z0-9]$/i;

    var strategies = {
        '.repo-list-name .prefix': EXTRACTOR.TEXT,
        '.avatar': EXTRACTOR.ALT,
        '.gravatar': EXTRACTOR.ALT,
        '.author-gravatar': EXTRACTOR.ALT,
        '.timeline-comment-avatar': EXTRACTOR.ALT,
        '[data-ga-click~="target:actor"]': EXTRACTOR.TEXT,
        '[data-ga-click~="target:repository"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:repo"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:parent"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:issue"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:issue-comment"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:pull"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:pull-comment"]': EXTRACTOR.SLUG,
        '.user-mention': EXTRACTOR.TEXT,
        '.opened-by a': EXTRACTOR.TEXT,
        '.issue-title-link': EXTRACTOR.SLUG,
        '.filter-list .repo-and-owner': EXTRACTOR.SLUG,
        '.repo-list a span:first-child': EXTRACTOR.TEXT,
        '.repo-list-info a': EXTRACTOR.SLUG,
        '.repo-and-owner .owner': EXTRACTOR.TEXT,
        '.capped-card .aname': EXTRACTOR.TEXT,
        '.team-member-username a': EXTRACTOR.TEXT,
        '.member-username': EXTRACTOR.TEXT,
        '.repo a:first-of-type': EXTRACTOR.TEXT,
        '.repo-name': EXTRACTOR.SLUG,
        '.author-name a': EXTRACTOR.TEXT,
        '.author-name span': EXTRACTOR.TEXT,
        '.release-authorship a:first-of-type': EXTRACTOR.TEXT,
        '.table-list-cell-avatar img': EXTRACTOR.ALT,
        '.author': EXTRACTOR.TEXT,
        '.repo-list-name a': EXTRACTOR.SLUG,
        '.code-list-item a:first-child': EXTRACTOR.SLUG,
        '.issue-list-meta li:first-child a': EXTRACTOR.SLUG,
        '.issue-list-meta li:nth-child(2) a': EXTRACTOR.TEXT,
        '.user-list-info a:first-child': EXTRACTOR.TEXT,
        '.commits li span': EXTRACTOR.TITLE,
        '.follow-list-name a': EXTRACTOR.HREF,
        '.sidebar-assignee .assignee': EXTRACTOR.TEXT,
        'a': EXTRACTOR.URL
    };

    function trim(str) {
        if (!str) {
            return '';
        }
        return str.replace(/^\s+|\s+$/g, '');
    }

    const USER_KEY = 'hovercard-user';
    const SKIP_KEY = 'hovercard-skip';
    const TOKEN_KEY = 'hovercard-token';

    function markExtracted(elem, username) {
        if (username) {
            elem.data(USER_KEY, username);
            elem.addClass(USER_KEY);
        } else {
            elem.data(SKIP_KEY, '✓');
        }
    }

    function getExtracted(elem) {
        return elem.data(USER_KEY) || !!elem.data(SKIP_KEY) || elem.find('.' + USER_KEY).length;
    }

    var URL_PATTERN = /^https?:\/\/github.com\/([^\/\?#]+)$/;
    var SLUG_PATTERN = /^([^\/]+)\/[^#]+(?:#\d+)?$/;
    var selectors = Object.keys(strategies);

    function extract(context) {
        selectors.forEach(function (selector) {
            var strategy = strategies[selector];
            var elems = $(selector, context);
            elems.each(function () {
                var elem = $(this);
                if (getExtracted(elem)) {
                    // skip processed elements
                    return;
                }
                var username;
                var match;
                switch (strategy) {
                    case EXTRACTOR.TEXT:
                        username = trim(elem.text().replace(/[@\/]/g, ''));
                        break;
                    case EXTRACTOR.TITLE:
                        username = trim(elem.attr('title').replace(/[@\/]/g, ''));
                        break;
                    case EXTRACTOR.ALT:
                        username = trim(elem.attr('alt').replace(/[@\/]/g, ''));
                        break;
                    case EXTRACTOR.HREF:
                        username = trim(elem.attr('href').replace(/[@\/]/g, ''));
                        break;
                    case EXTRACTOR.SLUG:
                        var slug = elem.text();
                        match = slug.match(SLUG_PATTERN);
                        username = trim(match && match[1]);
                        if (username) {
                            elem.html('<span>' + username + '</span>' + slug.replace(username, ''));
                            markExtracted(elem);
                            elem = elem.children().first();
                        }
                        break;
                    case EXTRACTOR.URL:
                        var attr = elem.attr('href');
                        if (attr && attr.charAt(0) === '#') {
                            // ignore local anchors
                            return;
                        }
                        var href = elem.prop('href'); // absolute path via prop
                        if (href) {
                            match = href.match(URL_PATTERN);
                            username = trim(match && match[1]);
                            if (GH_RESERVED_USER_NAMES.indexOf(username) !== -1
                                || !GH_USER_NAME_PATTERN.test(username)) {
                                username = null;
                            }
                        }
                        break;
                    default:
                        break;
                }

                if (username) {
                    if (username !== me) {
                        markExtracted(elem, username);
                    } else {
                        markExtracted(elem);
                    }
                }
            });
        });

        const CARD_TPL =
            '<address class="hovercard">\
                <img src="{{avatar}}&s=32" class="hovercard-avatar">\
                <div class="hovercard-person">\
                    <p><strong><a href="{{userUrl}}">{{loginName}}</a></strong>{{#isOrg}} <small>(Organization)</small>{{/isOrg}}</p>\
                    {{#realName}}<p>{{realName}}</p>{{/realName}}\
                </div>\
                <div class="hovercard-more">\
                    {{#location}}<p><span class="octicon octicon-location"></span>{{location}}</p>{{/location}}\
                    {{#company}}<p><span class="octicon octicon-organization"></span>{{company}}</p>{{/company}}\
                </div>\
            </address>';
        Mustache.parse(CARD_TPL);

        function getCardHTML(user) {
            // https://developer.github.com/v3/users/#get-a-single-user
            var html = Mustache.render(CARD_TPL, {
                avatar: user.avatar_url,
                userUrl: user.html_url,
                loginName: user.login,
                realName: user.name,
                location: user.location,
                org: user.organization,
                orgUrl: user.organizations_url,
                isOrg: user.type === 'Organization',
                company: user.company
            });

            return $(html);
        }

        const ERROR_TPL =
            '<div class="hovercard hovercard-error">\
                <p><strong>{{title}}</strong></p>\
                {{#message}}<p>{{{message}}}</p>{{/message}}\
            </div>';
        Mustache.parse(ERROR_TPL);

        function getErrorHTML(error) {
            var html = Mustache.render(ERROR_TPL, error);
            return $(html);
        }

        var cache = {};
        const CREATE_TOKEN_PATH = '//github.com/settings/tokens/new';

        $('.' + USER_KEY  + ':not(.tooltipstered)').tooltipster({
            updateAnimation: false,
            functionBefore: function (elem, done) {
                elem.tooltipster('content', $('<span class="loading"></span>'));
                var username = elem.data(USER_KEY);
                var user = cache[username];
                if (user) {
                    elem.tooltipster('content', getCardHTML(user));
                } else {
                    var requestOptions = {
                        url: '//api.github.com/users/' + username,
                        datatype: 'json'
                    };

                    var token = localStorage.getItem(TOKEN_KEY);
                    if (token) {
                        requestOptions.headers = {
                            Authorization: 'token ' + token
                        };
                    }
                    $.ajax(requestOptions)
                        .done(function (user) {
                            cache[username] = user;
                            elem.tooltipster('content', getCardHTML(user));
                        })
                        .fail(function (xhr) {
                            var status = xhr.status;
                            var title = '';
                            var message = '';
                            var needToken = false;

                            switch (status) {
                                case 0:
                                    title = 'Connection error';
                                    message = 'Please try again later.';
                                    break;
                                case 401:
                                    title = 'Invalid token';
                                    message = '<a href="' + CREATE_TOKEN_PATH + '" class="token-link" target="_blank">Create a new access token</a>, paste it back here and try again.';
                                    needToken = true;
                                    break;
                                case 403:
                                    if (xhr.getAllResponseHeaders().indexOf('X-RateLimit-Remaining: 0') !== -1) {
                                        title= 'API limit exceeded';
                                        if (!localStorage.getItem(TOKEN_KEY)) {
                                            message = 'API rate limit exceeded for current IP. <a href="' + CREATE_TOKEN_PATH + '" class="token-link" target="_blank">Create a new access token</a> and paste it back here to get a higher rate limit.';
                                        }
                                    } else {
                                        title = 'Forbidden';
                                        message = 'You are not allowed to access GitHub API. <a href="' + CREATE_TOKEN_PATH + '" class="token-link" target="_blank">Create a new access token</a>, paste it back here and try again.';
                                    }
                                    needToken = true;
                                    break;
                                default:
                                    title = 'Error';
                                    message = xhr.responseJSON.message || '';
                                    break;
                            }

                            var error = {
                                title: title,
                                message: message,
                                needToken: needToken
                            };
                            elem.tooltipster('content', getErrorHTML(error));
                        });
                }
                done();
            },
            interactive: true
        });
    }

    const FORM_TPL =
        '<div class="hovercard-overlay">\
            <form>\
                <p>\
                    <input class="hovercard-token" type="text" placeholder="Paste access token here..." size="40" />\
                    <button class="btn btn-primary hovercard-save">Save</button>\
                    <button class="btn hovercard-cancel">Cancel</button>\
                </p>\
            </form>\
        </div>';

    var tokenForm = $(FORM_TPL);
    var tokenField = tokenForm.find('.hovercard-token');
    tokenForm.find('button').on('click', function (e) {
        if ($(e.target).is('.hovercard-save') && tokenField.val()) {
            localStorage.setItem(TOKEN_KEY, tokenField.val());
        }
        tokenForm.detach();
        return false;
    });
    tokenForm.find('.hovercard-cancel').on('click')
    $('body').on('click', '.token-link', function () {
        tokenForm.appendTo($('body'));
    });

    extract();
});

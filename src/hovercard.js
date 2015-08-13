$(function () {
    var target = document.querySelector('.site');
    var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === 'childList') {
                init(mutation.target);
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
        SLUG: 0,
        TEXT: 1,
        ALT: 2,
        TITLE: 3,
        URL: 4
    };

    var me = $('meta[name="user-login"]').attr('content');

    // based on octotree's config
    const GH_RESERVED_USER_NAMES = [
      'settings', 'orgs', 'organizations', 'site', 'blog', 'about',
      'explore', 'styleguide', 'showcases', 'trending', 'stars',
      'dashboard', 'notifications', 'search', 'developer', 'account',
      'pulls', 'issues', 'features', 'contact', 'security', 'join',
      'login', 'password_reset', 'showcases.atom'
    ];

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
        '.user-mention': EXTRACTOR.TEXT,
        '.opened-by a': EXTRACTOR.TEXT,
        '.issue-title-link': EXTRACTOR.SLUG,
        '.filter-list .repo-and-owner': EXTRACTOR.SLUG,
        '.repo-list a span:first-child': EXTRACTOR.TEXT,
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

    function init(context) {
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
                            if (GH_RESERVED_USER_NAMES.indexOf(username) !== -1) {
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

        var tpl =
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

        Mustache.parse(tpl);

        function getCardHTML(user) {
            // https://developer.github.com/v3/users/#get-a-single-user
            var html = Mustache.render(tpl, {
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

        var cache = {};

        $('.' + USER_KEY  + ':not(.tooltipstered)').tooltipster({
            content: $('<span class="loading"></span>'),
            updateAnimation: false,
            functionBefore: function (elem, done) {
                var username = elem.data(USER_KEY);
                var user = cache[username];
                if (user) {
                    elem.tooltipster('content', getCardHTML(user));
                } else {
                    $.ajax({
                        url: '//api.github.com/users/' + username,
                        datatype: 'json',
                        success: function (user) {
                            cache[username] = user;
                            elem.tooltipster('content', getCardHTML(user));
                        },
                        error: function (e) {
                            var error = e.responseJSON;
                            elem.tooltipster('content', $('<div class="hovercard">' + error.message.replace(
                                /documentation/,
                                '<a href="' + error.documentation_url + '">documentation</a>'
                            ) + '</div>'));
                        }
                    });
                }
                done();
            },
            interactive: true
        });
    }

    init();
});

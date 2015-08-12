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

    var extractor = {
        SLUG: 0,
        TEXT: 1,
        ALT: 2,
        TITLE: 3,
        URL: 4
    };

    var me = $('meta[name="user-login"]').attr('content');
    var excludes = [
        me, 'pulls', 'issues', 'notifications', 'watching',
        'new', 'stars', 'explore', 'trending', 'showcases',
        'security', 'blog', 'about'
    ];

    var strategies = {
        '.repo-list-name .prefix': extractor.TEXT,
        '.avatar': extractor.ALT,
        '.gravatar': extractor.ALT,
        '.author-gravatar': extractor.ALT,
        '.timeline-comment-avatar': extractor.ALT,
        '[data-ga-click~="target:actor"]': extractor.TEXT,
        '[data-ga-click~="target:repository"]': extractor.SLUG,
        '[data-ga-click~="target:repo"]': extractor.SLUG,
        '[data-ga-click~="target:parent"]': extractor.SLUG,
        '[data-ga-click~="target:issue"]': extractor.SLUG,
        '[data-ga-click~="target:issue-comment"]': extractor.SLUG,
        '[data-ga-click~="target:pull"]': extractor.SLUG,
        '.user-mention': extractor.TEXT,
        '.opened-by a': extractor.TEXT,
        '.issue-title-link': extractor.SLUG,
        '.filter-list .repo-and-owner': extractor.SLUG,
        '.repo-list a span:first-child': extractor.TEXT,
        '.repo-and-owner .owner': extractor.TEXT,
        '.capped-card .aname': extractor.TEXT,
        '.team-member-username a': extractor.TEXT,
        '.member-username': extractor.TEXT,
        '.repo a:first-of-type': extractor.TEXT,
        '.repo-name': extractor.SLUG,
        '.author-name a': extractor.TEXT,
        '.author-name span': extractor.TEXT,
        '.release-authorship a:first-of-type': extractor.TEXT,
        '.table-list-cell-avatar img': extractor.ALT,
        '.author': extractor.TEXT,
        '.repo-list-name a': extractor.SLUG,
        '.code-list-item a:first-child': extractor.SLUG,
        '.issue-list-meta li:first-child a': extractor.SLUG,
        '.issue-list-meta li:nth-child(2) a': extractor.TEXT,
        '.user-list-info a:first-child': extractor.TEXT,
        '.commits li span': extractor.TITLE,
        '.follow-list-name a': extractor.HREF,
        'a': extractor.URL
    };

    function trim(str) {
        if (!str) {
            return '';
        }
        return str.replace(/^\s+|\s+$/g, '');
    }

    var USER_KEY = 'hovercard-user';
    var SKIP_KEY = 'hovercard-skip';

    function markExtracted(elem, username) {
        if (username) {
            elem.data(USER_KEY, username);
            elem.addClass(USER_KEY);
        } else {
            elem.data(SKIP_KEY, '✓');
        }
    }

    function getExtracted(elem) {
        return elem.data(USER_KEY) || !!elem.data(SKIP_KEY);
    }

    var URL_PATTERN = /^https?:\/\/github.com\/([^\/]+)\/?(?:#)$/;
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
                    case extractor.TEXT:
                        username = trim(elem.text().replace(/[@\/]/g, ''));
                        break;
                    case extractor.TITLE:
                        username = trim(elem.attr('title').replace(/[@\/]/g, ''));
                        break;
                    case extractor.ALT:
                        username = trim(elem.attr('alt').replace(/[@\/]/g, ''));
                        break;
                    case extractor.HREF:
                        username = trim(elem.attr('href').replace(/[@\/]/g, ''));
                        break;
                    case extractor.SLUG:
                        var slug = elem.text();
                        match = slug.match(SLUG_PATTERN);
                        username = trim(match && match[1]);
                        if (username) {
                            elem.html('<span>' + username + '</span>' + slug.replace(username, ''));
                            markExtracted(elem);
                            elem = elem.children().first();
                        }
                        break;
                    case extractor.URL:
                        var attr = elem.attr('href');
                        if (attr && attr.charAt(0) === '#') {
                            // ignore local anchors
                            return;
                        }
                        var href = elem.prop('href'); // absolute path via prop
                        if (href) {
                            match = href.match(URL_PATTERN);
                            username = trim(match && match[1]);
                            if (excludes.indexOf(username) !== -1) {
                                username = null;
                            }
                        }
                        break;
                    default:
                        break;
                }

                if (username) {
                    markExtracted(elem, username);
                }
            });
        });

        var tpl =
            '<address class="hovercard">\
                <img src="{{avatar}}&s=32" class="hovercard-avatar">\
                <div class="hovercard-person">\
                    <p><strong><a href="{{userUrl}}">{{loginName}}</a></strong>{{#isOrg}} <small>(Orgnization)</small>{{/isOrg}}</p>\
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

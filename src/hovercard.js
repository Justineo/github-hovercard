$(() => {
  'use strict';

  const GH_DOMAIN = location.host;

  const EXCLUDES = [
    '.tooltipster-base',
    '.tooltipster-sizer',
    '.timestamp',
    '.time',
    '.octotree_sidebar',
    'time-ago',
    'relative-time'
  ].join(',');

  const DEFAULT_TARGET = document.body;

  function isExclude (target) {
    return $(target).is(EXCLUDES)
      || $(target).parents(EXCLUDES).length
      || $(target).is(DEFAULT_TARGET)
  }

  let isExtracting = false;
  let observer = new MutationObserver(mutations => {
    if (isExtracting) {
      return;
    }
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        let target = mutation.target;
        if (!isExclude(target)) {
          extract(target);
        }
      }
    });
  });
  let observeConfig = {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true
  };
  observer.observe(DEFAULT_TARGET, observeConfig);

  let me = $('meta[name="user-login"]').attr('content');

  // based on octotree's config
  const GH_RESERVED_USER_NAMES = [
    'settings', 'orgs', 'organizations', 'site', 'blog', 'about',
    'explore', 'styleguide', 'showcases', 'trending', 'stars',
    'dashboard', 'notifications', 'search', 'developer', 'account',
    'pulls', 'issues', 'features', 'contact', 'security', 'join',
    'login', 'watching', 'new', 'integrations', 'pricing', 'topics',
    'personal', 'business', 'open-source', 'marketplace', 'collections',
    'hovercards'
  ];

  const GH_RESERVED_REPO_NAMES = [
    'followers', 'following', 'repositories'
  ];

  const GH_USER_NAME_PATTERN = /^[a-z0-9]+$|^[a-z0-9](?:[a-z0-9](?!--)|-(?!-))*[a-z0-9]$/i;
  const GH_REPO_NAME_PATTERN = /^[a-z0-9\-_\.]+$/i;

  const TYPE_KEY = 'ghh-type';
  const VALUE_KEY = 'ghh-value';
  const EXTRACT_TYPE = {
    USER: 'user',
    REPO: 'repo',
    ISSUE: 'issue',
    COMMENT: 'comment',
    COMMIT: 'commit',
    SKIP: 'skip'
  };

  const EXTRACTOR = {
    SLUG: 1, // {{user}}/{{repo}}#{{issue}}
    TEXT_USER: 2, // {{user}}
    TITLE_USER: 3, // title="{{user}}"
    ALT_USER: 4, // alt="{{user}}"
    HREF_USER: 5, // href="{{user}}"
    URL: 6, // href="/{{user}}" or href="https://{{GH_DOMAIN}}/{{user}}"
    NEXT_TEXT_REPO: 7, // <span>...</span> {{repo}}
    ANCESTOR_URL_REPO: 8, // <a href="/{{user}}/{{repo}}">...{{elem}}...</a>
    NEXT_LINK_TEXT_USER: 9, // <span>...</span>...<a>{{user}}</a>
    TEXT_MY_REPO: 10, // {{repo}}
    TEXT_NODE_USER: 11, // {{user}} <span>...</span>
    NEXT_TEXT_USER: 12, // <img alt> {{user}}
    REPO_LIST_SLUG: 13 // <span>{{user}} / </span>{{repo}}
  };

  const GH_DOMAIN_PATTERN = GH_DOMAIN.replace(/\./g, '\\.');
  const URL_USER_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/(?:([^/?#]+)(?:\\/$|[^/]*$)|orgs\\/[^/]+\\/people\\/([^/?#]+))`;
  const URL_REPO_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^/?#]+)\\/([^/?#]+)(?:\\/$|[^/]*$)`;
  const URL_PROJECT_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^/?#]+)\\/([^/?#]+)\\/projects\\/(\\d+)`;
  const URL_ISSUE_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^/?#]+)\\/([^/?#]+)\\/(?:issues|pull)\\/(\\d+)(?:\\/?(?:[?#](?!issuecomment).*)?$)`;
  const URL_COMMENT_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^/?#]+)\\/([^/?#]+)\\/(?:issues|pull)\\/(\\d+)#issuecomment-(\\d+)$`;
  const URL_COMMIT_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^/?#]+)\\/([^/?#]+)\\/(?:pull\\/\\d+\\/commits|commit)\\/([0-9a-f]+)(?:\\/?[^/]*$)`;
  const SLUG_PATTERN = /([^\/\s]+)\/([^#@\s]+)(?:#(\d+)|@([0-9a-f]+))?/;

  const STRATEGIES = {
    // @ mentions
    '.user-mention': EXTRACTOR.TEXT_USER,

    /* Dashboard */
    // News feeds
    '[data-hydro-click*="\\"action_target\\":\\"actor\\""]': EXTRACTOR.TEXT_USER,
    '[data-hydro-click*="\\"action_target\\":\\"issue\\""]': EXTRACTOR.URL,
    '[data-hydro-click*="\\"action_target\\":\\"followee\\""]': EXTRACTOR.URL,
    '[data-hydro-click*="\\"action_target\\":\\"repo\\""]': EXTRACTOR.SLUG,
    '[data-hydro-click*="\\"action_target\\":\\"repository\\""]': EXTRACTOR.SLUG,
    '[data-hydro-click*="\\"action_target\\":\\"sha\\""]': EXTRACTOR.URL,
    '[data-hydro-click*="\\"target\\":\\"ISSUE\\""]': EXTRACTOR.URL,
    '[data-hydro-click*="\\"target\\":\\"PULL_REQUEST\\""]': EXTRACTOR.URL,
    '.d-flex:has(.AvatarStack) + .d-flex a:first-child': EXTRACTOR.SLUG,
    'img[alt^="@"]': EXTRACTOR.ALT_USER,

    // Sidebar
    '.dashboard-sidebar [data-hydro-click*="\\"target\\":\\"REPOSITORY\\""] [title]:first-child': EXTRACTOR.TEXT_USER,
    '.dashboard-sidebar [data-hydro-click*="\\"target\\":\\"REPOSITORY\\""] [title]:last-child': EXTRACTOR.ANCESTOR_URL_REPO,

    /* Explore */
    // Trending
    '.explore-content .repo-list h3 > a': EXTRACTOR.REPO_LIST_SLUG,
    '.Story h1 > a': EXTRACTOR.REPO_LIST_SLUG,

    // Topics
    '.topic h3 > a': EXTRACTOR.REPO_LIST_SLUG,

    // Collections
    '[data-ga-click^="Repository"]': EXTRACTOR.REPO_LIST_SLUG,

    /* User profile */
    // Pinned repos
    '.pinned-repo-item-content .owner': EXTRACTOR.TEXT_USER,
    '.pinned-repo-item-content .repo': EXTRACTOR.ANCESTOR_URL_REPO,
    '.pinned-repo-item-content .d-block + p:not(.pinned-repo-desc) a': EXTRACTOR.SLUG,

    // Customize pinned repos
    '.pinned-repos-selection-list .pinned-repo-name span': EXTRACTOR.TEXT_MY_REPO,

    // Contribution activities
    '.profile-rollup-content > li > div:first-child a:first-child': EXTRACTOR.SLUG,
    '.profile-rollup-summarized button > span:first-child': EXTRACTOR.SLUG,
    '.profile-rollup-content .profile-rollup-icon:has(.octicon-repo, .octicon-repo-forked) + a': EXTRACTOR.SLUG,

    '.profile-timeline-card h3 a': EXTRACTOR.URL,

    // Repos
    '#user-repositories-list [itemprop$="owns"] h3 > a': EXTRACTOR.URL,
    '#user-repositories-list [itemprop$="owns"] h3 + span a': EXTRACTOR.SLUG,
    
    // Stars
    '.user-profile-nav + div h3 > a': EXTRACTOR.REPO_LIST_SLUG,

    /* Organization profile */
    // Invite member suggestion info
    '.member-suggestion-info .member-login': EXTRACTOR.TEXT_USER,

    // People
    '.member-info-content .member-link': EXTRACTOR.TEXT_USER,

    // People manage
    '.member-list-avatar + strong': EXTRACTOR.TEXT_USER,
    '.org-person-repo-header .table-list-heading strong': EXTRACTOR.TEXT_USER,
    '.org-repo-name .repo-prefix': EXTRACTOR.TEXT_USER,
    '.org-repo-name .repo-slash': EXTRACTOR.NEXT_TEXT_REPO,

    // Teams
    // - Team
    '.team-member-username a': EXTRACTOR.TEXT_USER,

    // Settings
    // - Audit log
    '.member-username .member-link': EXTRACTOR.TEXT_USER,

    // - Repositories details
    '.org-higher-access-member': EXTRACTOR.TEXT_NODE_USER,


    /* Repo */
    // Issues
    '.opened-by a': EXTRACTOR.TEXT_USER,
    'img.from-avatar:not([alt=""])': EXTRACTOR.ALT_USER,
    '.fork-flag a': EXTRACTOR.SLUG,
    '.merge-pr-more-commits a:last-child': EXTRACTOR.SLUG,
    '.select-menu-list[data-filter="author"] .select-menu-item-text': EXTRACTOR.TEXT_NODE_USER,
    '.select-menu-list[data-filter="assignee"] .select-menu-item-text': EXTRACTOR.TEXT_NODE_USER,

    // Insights
    // - Pulse
    '.pulse-authors-graph .bar image': EXTRACTOR.ALT_USER,

    // - Contributors
    '.contrib-person .avatar': EXTRACTOR.NEXT_LINK_TEXT_USER,
    '.contrib-person .avatar ~ a': EXTRACTOR.TEXT_USER,

    // - Dependency graph
    '.js-dependency .avatar': EXTRACTOR.NEXT_TEXT_USER,
    '.js-dependency button + a + span > a': EXTRACTOR.REPO_LIST_SLUG,

    /* New/import repo */
    '.select-menu-item-gravatar img': EXTRACTOR.ALT_USER,
    '.select-menu-item-gravatar + .select-menu-item-text': EXTRACTOR.TEXT_USER,
    '.select-menu-button-gravatar + .js-select-button': EXTRACTOR.TEXT_USER,

    /* Notifications */
    '.filter-item .repo-and-owner': EXTRACTOR.SLUG,
    '.notifications-repo-link': EXTRACTOR.SLUG,
    '.list-group-item-link': EXTRACTOR.TEXT_NODE_URL,

    // Watching
    '.notifications-list .repo-icon + a': EXTRACTOR.SLUG,

    /* Pulls/Issues */
    '.issues-listing .js-issue-row .muted-link:first-child': EXTRACTOR.SLUG,

    /* Search */
    '.codesearch-results .repo-list h3 > a': EXTRACTOR.REPO_LIST_SLUG,
    '.code-list-item a:has(.avatar) ~ div a:first-child': EXTRACTOR.SLUG, // rule out repo code search title
    '.commits-list-item .commit-author + a': EXTRACTOR.SLUG,
    '.issue-list-item li:first-child > a': EXTRACTOR.SLUG,
    '.wiki-list-item a:first-child': EXTRACTOR.SLUG,

    /* Common */
    // Avatars
    'img.avatar:not([alt=""])': EXTRACTOR.ALT_USER,
    'img.gravatar:not([alt=""])': EXTRACTOR.ALT_USER,

    /* All links */
    'a': EXTRACTOR.URL
  };

  const BLACK_LIST_SELECTOR = [
    '.ghh a',
    '.repo-nav a',
    '.tabnav-tab',
    '.discussion-item .timestamp',
    '.file-wrap .content a',
    '.reponav-item',
    '.intgrs-lstng-logo', // integrations icon
    '.issues-listing .float-right:last-child > a', // issue/pr list comment icon
    '.commit-links-cell > a:first-child', // commit list comment icon
    '.user-nav details .dropdown-item'
  ].join(', ');

  // Octicons in SVG
  const OCTICONS = '__OCTICONS__';

  function getIcon(type, scale = 1) {
    let icon = OCTICONS[type];
    return `<svg class="octicon" width="${icon.width * scale}" height="${icon.height * scale}"
      viewBox="0 0 ${icon.width} ${icon.height}"><path d="${icon.d}" /></svg>`;
  }

  const CARD_TPL = {
    user: `
      <address class="ghh">
        <div class="ghh-person">
          <img src="{{avatar}}&s=64" class="ghh-avatar">
          <p class="ghh-title-row">
            <span class="ghh-title{{^hasMeta}} no-meta{{/hasMeta}}"><strong><a href="{{userUrl}}">{{loginName}}</a></strong></span>
            {{#isAdmin}}<small class="ghh-meta">(Staff)</small>{{/isAdmin}}
            {{#isOrg}}<small class="ghh-meta">(Organization)</small>{{/isOrg}}
            {{^isSelf}}{{#hasToken}}${me ? '{{^isOrg}}{{#followedByMe}}<button class="ghh-aux" data-action="unfollow" data-args="{{loginName}}">Unfollow{{/followedByMe}}{{^followedByMe}}<button class="ghh-primary" data-action="follow" data-args="{{loginName}}">Follow{{/followedByMe}}</button>{{/isOrg}}' : ''}{{/hasToken}}{{/isSelf}}
          </p>
          {{#hasSubtitle}}<p>{{#realName}}{{realName}}{{/realName}}${me ? ' {{#followingMe}}<small>(Following you)</small>{{/followingMe}}' : ''}</p>{{/hasSubtitle}}
        </div>
        <div class="ghh-more">
          {{^isOrg}}<div class="ghh-stats">
            <a href="{{followersUrl}}">
              <strong>{{followers}}</strong>
              <span>Followers</span>
            </a>
            <a href="{{followingUrl}}">
              <strong>{{following}}</strong>
              <span>Following</span>
            </a>
            <a href="{{reposUrl}}">
              <strong>{{repos}}</strong>
              <span>Repos</span>
            </a>
          </div>{{/isOrg}}
          {{#location}}<p>{{{icons.location}}}</span>{{location}}</p>{{/location}}
          {{#company}}<p>{{{icons.organization}}}{{company}}</p>{{/company}}
        </div>
        {{#hasContexts}}<hr class="ghh-more-separator"/><div class="ghh-more">
          {{#contexts}}<p>{{{icon}}}{{message}}</p>{{/contexts}}
        </div>{{/hasContexts}}
      </address>`,
    repo: `
      <div class="ghh">
        <div class="ghh-repo">
          {{{icons.repo}}}
          <p class="ghh-title-row">
            <span class="ghh-title"><a href="{{ownerUrl}}">{{owner}}</a> / <strong><a href="{{repoUrl}}">{{repo}}</a></strong></span>
            {{#hasToken}}${me ? '{{#starredByMe}}<button class="ghh-aux" data-action="unstar" data-args="{{owner}}/{{repo}}">{{{icons.star}}} Unstar{{/starredByMe}}{{^starredByMe}}<button class="ghh-primary" data-action="star" data-args="{{owner}}/{{repo}}">{{{icons.star}}} Star{{/starredByMe}}</button>' : ''}{{/hasToken}}
          </p>
          {{#parent}}<p><span>forked from <a href="{{url}}">{{repo}}</a></span></p>{{/parent}}
        </div>
        <div class="ghh-more">
          <div class="ghh-stats">
            <a href="{{starsUrl}}">
              <strong>{{stars}}</strong>
              <span>Stars</span>
            </a>
            <a href="{{forksUrl}}">
              <strong>{{forks}}</strong>
              <span>Forks</span>
            </a>
            {{#hasIssues}}<a href="{{issuesUrl}}">
              <strong>{{issues}}</strong>
              <span>Issues</span>
            </a>{{/hasIssues}}
          </div>
          {{#desc}}<p class="ghh-repo-desc">{{{icons.info}}}{{{.}}}</p>{{/desc}}
          {{#homepage}}<p>{{{icons.link}}}<a href="{{.}}">{{.}}</a></p>{{/homepage}}
          {{#language}}<p>{{{icons.code}}}{{.}}</p>{{/language}}
          {{#hasTopics}}<p>{{{icons.bookmark}}}{{#topics}}<a class="ghh-topic" href="https://github.com/search?q=topic%3A{{query}}&type=Repositories">{{name}}</a>{{/topics}}</p>{{/hasTopics}}
        </div>
        {{#readme}}<div class="ghh-readme">{{{.}}}</div>{{/readme}}
      </div>`,
    issue: `
      <div class="ghh">
        <div class="ghh-issue">
          <p><span class="issue-number">#{{number}}</span> <a href="{{issueUrl}}" title="{{title}}"><strong>{{title}}</strong></a></p>
        </div>
        <div class="ghh-issue-meta">
          <p><span class="ghh-state ghh-state-{{state}}">{{{icons.state}}}{{state}}</span><a href="{{userUrl}}">{{user}}</a> created on {{{createTime}}}</p>
        </div>
        {{#isPullRequest}}<div class="ghh-pull-meta">
          <p>{{{icons.commit}}} {{commits}} commit{{^isSingleCommit}}s{{/isSingleCommit}}{{{icons.diff}}} {{changedFiles}} file{{^isSingleFile}}s{{/isSingleFile}} changed
            <span class="diffstat">
              <span class="text-diff-added">+{{additions}}</span>
              <span class="text-diff-deleted">−{{deletions}}</span>
            </span>
          </p>
          <p class="ghh-branch"><span class="commit-ref" title="{{headUser}}:{{headRef}}"><span class="user">{{headUser}}</span>:{{headRef}}</span><span>{{{icons.arrow}}}</span><span class="commit-ref" title="{{baseUser}}:{{baseRef}}"><span class="user">{{baseUser}}</span>:{{baseRef}}</span></p>
          {{^isMerged}}<ul class="ghh-reviews"><li title="{{mergeability.desc}}"><span class="ghh-state-icon ghh-state-icon-{{mergeability.type}}">{{{mergeability.icon}}}</span> {{mergeability.label}}</li>{{#hasReviews}}{{#reviews}}<li class="ghh-state-{{state.type}}" title="{{name}} {{state.desc}}">{{{state.icon}}} <a href="{{url}}">{{name}}</a></li>{{/reviews}}{{/hasReviews}}</ul>{{/isMerged}}
          </div>{{/isPullRequest}}
        {{#body}}<div class="ghh-issue-body">{{{.}}}</div>{{/body}}
      </div>`,
    comment: `
      <div class="ghh">
        <div class="ghh-person">
          <img src="{{avatar}}&s=32" class="ghh-avatar">
          <p><strong><a href="{{userUrl}}">{{loginName}}</a></strong></p>
          <p>Commented on {{{createTime}}}{{#updatedTime}} • {{{.}}}{{/updatedTime}}</p>
        </div>
        <div class="ghh-issue-body">{{{body}}}</div>
      </div>`,
    commit: `
      <div class="ghh">
        <div class="ghh-commit">
          <p><a href="{{commitUrl}}" title="{{title}}"><strong>{{title}}</strong></a></p>
        </div>
        {{#body}}<pre class="ghh-commit-body">{{.}}</pre>{{/body}}
        <p class="ghh-commit-author">{{#verified}}<span class="state ghh-state-verified" title="This commit was signed with a verified signature.">{{{icons.verified}}}Verified</span> {{/verified}}{{#authorUrl}}<a href="{{.}}"><strong>{{author}}</strong></a>{{/authorUrl}}{{^authorUrl}}<strong title="{{authorEmail}}">{{author}}</strong>{{/authorUrl}} committed{{#isGitHub}} on <strong>GitHub</strong>{{/isGitHub}}{{^isGitHub}}{{#committer}} with {{#committerUrl}}<a href="{{.}}"><strong>{{committer}}</strong></a>{{/committerUrl}}{{^committerUrl}}<strong title="{{committerEmail}}">{{committer}}</strong>{{/committerUrl}}{{/committer}}{{/isGitHub}} on {{{authorTime}}}</p>
        <div class="ghh-more">
          <p class="ghh-commit-sha">{{{icons.commit}}} <code>{{sha}}</code></p>
          {{#branch}}<p>{{{icons.branch}}} <a href="/{{fullRepo}}/tree/{{branch}}"><strong>{{branch}}</strong></a>{{#pull}} (<a href="/{{fullRepo}}/pull/{{.}}">#{{.}}</a>){{/pull}}</p>
          {{#mainTag}}<p class="ghh-tags">{{{icons.tag}}} <a href="/{{fullRepo}}/releases/tag/{{.}}"><strong>{{.}}</strong></a>{{#otherTags}}, <a href="/{{fullRepo}}/releases/tag/{{.}}">{{.}}</a>{{/otherTags}}{{#truncatedTagNumber}} <span title="{{truncatedTagNumber}} more tag(s)">...</span>{{/truncatedTagNumber}}</p>{{/mainTag}}{{/branch}}
          <p class="ghh-commit-meta">{{{icons.diff}}} {{changedFiles}} file{{^isSingleFile}}s{{/isSingleFile}} changed
            <span class="diffstat">
              <span class="text-diff-added">+{{additions}}</span>
              <span class="text-diff-deleted">−{{deletions}}</span>
            </span>
          </p>
        </div>
      </div>`,
    error: `
      <div class="ghh ghh-error">
        <p><strong>{{{icons.alert}}}{{title}}</strong></p>
        {{#message}}<p>{{{message}}}</p>{{/message}}
      </div>`,
    form: `
      <div class="ghh-overlay">
        <form>
          <h3>${getIcon('key')} GitHub Access Token</h3>
          <p>GitHub limits unauthenticated API requests to 60 per hour, but after binding your access token you will be able to enjoy the rate limit of <strong>5,000</strong> requests per hour.</p>
          <p>You should at least add permission for <code>public_repo</code> to enable star/unstar, and <code>user:follow</code> to enable follow/unfollow.</p>
          <p>
            <input class="ghh-token form-control" type="text" placeholder="Paste access token here..." size="40">
            <button class="btn btn-primary ghh-save">Save</button>
            <button class="btn ghh-cancel">Cancel</button>
          </p>
        </form>
      </div>`
  };

  const CREATE_TOKEN_PATH = `//${GH_DOMAIN}/settings/tokens/new`;
  const EDIT_TOKEN_PATH = `//${GH_DOMAIN}/settings/tokens`;
  const IS_ENTERPRISE = GH_DOMAIN !== 'github.com';
  const API_PREFIX = IS_ENTERPRISE ? `//${GH_DOMAIN}/api/v3` : `//api.${GH_DOMAIN}`;
  const SITE_PREFIX = `//${GH_DOMAIN}/`;

  function trim(str, isCollapse) {
    if (!str) {
      return '';
    }
    return str.replace(/^\s+|\s+$/g, isCollapse ? ' ' : '');
  }

  function markExtracted(elem, type, value) {
    if (value) {
      elem
        .data(TYPE_KEY, type)
        .data(VALUE_KEY, value)
        .addClass(getTypeClass(type));
    }
    if (!type || !value) {
      elem.data(TYPE_KEY, EXTRACT_TYPE.SKIP);
    }
  }

  function getExtracted(elem) {
    let extractedSelector = Object.keys(EXTRACT_TYPE)
      .map(key => EXTRACT_TYPE[key])
      .map(getTypeClass)
      .map(className => `.${className}`)
      .join(',');
    return elem.data(VALUE_KEY) || elem.data(TYPE_KEY) === EXTRACT_TYPE.SKIP
      || elem.find(extractedSelector).length;
  }

  function getTypeClass(type) {
    return `ghh-${type}-x`;
  }

  function getFullRepoFromAncestorLink(elem) {
    let href = elem.closest('a').prop('href');
    let fullRepo = null;
    if (href) {
      let match = href.match(URL_REPO_PATTERN);
      fullRepo = match && (match[1] + '/' + match[2]);
    }
    return fullRepo;
  }

  function getNextTextNode(node, context) {
    let filter = NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT;
    let walker = document.createTreeWalker(context || document.body, filter);
    while (walker.nextNode()) {
      if (walker.currentNode === node) {
        while (walker.nextNode()) {
          let current = walker.currentNode;
          if (current.nodeType === Node.TEXT_NODE
            && !(node.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_CONTAINED_BY)
            && trim(current.nodeValue)) {
            return current;
          }
        }
      }
    }
    return null;
  }

  // '<span>ecomfe/</span><em>ecomfe</em>.github.io'
  function fixRepoSlug(html) {
    let [, leading, content, ending] = html.replace(/\n/g, ' ').match(/^(\s*)(.+?)(\s*)$/);

    let parts = content
      .replace(/<\//g, '${END}')
      .replace(/\//g, '${SLASH}')
      .replace(/</g, '${BEGIN}')
      .split('${SLASH}');

    return leading + parts.map(part => {
      let [, leading, content, ending] = part.match(/^(\s*)(.+?)(\s*)$/);
      let marker = /\$\{(\w+)\}/g;
      let open = [];
      let close = [];
      let position;
      let result;
      while (result = marker.exec(content)) {
        position = marker.lastIndex - result[0].length;
        if (result[1] === 'BEGIN') {
          open.push(position);
        } else {
          if (open.length) {
            open.pop();
          } else {
            close.push(position);
          }
        }
      }

      // <span>user/ -> <span><span>user</span>
      let begin = 0;
      let end = content.length;
      if (open[0] === 0 || close[0] === 0) {
        begin = content.indexOf('>') + 1;
      } else if (open.length || close.length) {
        begin = 0;
        end = open[0] || close[0];
      }

      content = content.slice(0, end) + '</span>' + content.slice(end, content.length);
      content = content.slice(0, begin) + '<span data-ghh>' + content.slice(begin, content.length);
      content = content
        .replace(/\$\{BEGIN\}/g, '<')
        .replace(/\$\{END\}/g, '</');

      return `${leading}${content}${ending}`;
    }).join('/') + ending;
  }

  function formatNumber(num) {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num;
  }

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatTime(time, text) {
    let t = new Date(time);
    let formatted = MONTH_NAMES[t.getMonth()] + ' ' + t.getDate() + ', ' + t.getFullYear();

    return encodeHTML`<time datetime="${time}" title="${time}">${text || formatted}</time>`;
  }

  function replaceEmoji(text) {
    return text.replace(/:([a-z0-9+\-_]+):/ig, (match, key) => {
      let url = EMOJI_MAP[key];
      if (!url) {
        return match;
      }
      return `<img class="emoji" title="${match}" alt="${match}"
        src="${url}" width="18" height="18">`;
    });
  }

  function replaceLink(text) {
    return text.replace(/\b(https?:\/\/[^\s]+)/ig, '<a href="$1">$1</a>');
  }

  // Code via underscore's _.compose
  function compose(...fns) {
    let start = fns.length - 1;
    return function (...args) {
      let i = start;
      let result = fns[start].apply(this, args);
      while (i--) {
        result = fns[i].call(this, result);
      }
      return result;
    };
  }

  // Code via https://developers.google.com/web/updates/2015/01/ES6-Template-Strings
  // HTML Escape helper utility
  let htmlUtil = (function () {
    // Thanks to Andrea Giammarchi
    let reEscape = /[&<>'"]/g;
    let reUnescape = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34);/g;
    let oEscape = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    };
    let oUnescape = {
      '&amp;': '&',
      '&#38;': '&',
      '&lt;': '<',
      '&#60;': '<',
      '&gt;': '>',
      '&#62;': '>',
      '&apos;': "'",
      '&#39;': "'",
      '&quot;': '"',
      '&#34;': '"'
    };
    let fnEscape = function (m) {
      return oEscape[m];
    };
    let fnUnescape = function (m) {
      return oUnescape[m];
    };
    let replace = String.prototype.replace;

    return (Object.freeze || Object)({
      escape: function escape(s) {
        return replace.call(s, reEscape, fnEscape);
      },
      unescape: function unescape(s) {
        return replace.call(s, reUnescape, fnUnescape);
      }
    });
  }());

  // Tagged template function
  function encodeHTML(pieces, ...substitutions) {
    let result = pieces[0];
    for (let i = 0; i < substitutions.length; ++i) {
      result += htmlUtil.escape(substitutions[i]) + pieces[i + 1];
    }

    return result;
  }

  function fixRef(elem, base, branch) {
    ['href', 'src'].forEach(attr => {
      let url = elem.attr(attr);
      if (url && url.indexOf('//') === -1 && url.indexOf('mailto:') === -1) {
        elem.attr(attr, `${base}/raw/${branch}/${url}`);
      }
    });
  }

  function getHovercardSubject() {
    let [type, id] = ($('meta[name="hovercard-subject-tag"]').attr('content') || '').split(':');
    if (!type || !id) {
      return null;
    }
    return { type, id };
  }

  function getCardHTML(type, raw) {
    let data;
    if (type === EXTRACT_TYPE.USER) {
      data = {
        avatar: raw.avatar_url,
        userUrl: raw.html_url,
        loginName: raw.login,
        realName: raw.name,
        location: raw.location,
        isAdmin: raw.site_admin,
        isOrg: raw.type === 'Organization',
        company: raw.company,
        followers: formatNumber(raw.followers),
        following: formatNumber(raw.following),
        followingMe: raw.following_me,
        followedByMe: raw.followed_by_me,
        repos: formatNumber(raw.public_repos),
        hasSubtitle: raw.name || raw.following_me,
        hasMeta: raw.site_admin || raw.type === 'Organization',
        hasToken: !!token,
        isSelf: raw.login === me,
        followersUrl: `//${GH_DOMAIN}/${raw.login}/followers`,
        followingUrl: `//${GH_DOMAIN}/${raw.login}/following`,
        reposUrl: `//${GH_DOMAIN}/${raw.login}?tab=repositories`,
        icons: {
          location: getIcon('location', 0.875),
          organization: getIcon('organization', 0.875)
        },
        hasContexts: raw.hovercard && raw.hovercard.length > 0,
        contexts: (raw.hovercard || []).map(({ message, octicon }) => {
          return {
            message,
            icon: getIcon(octicon, 0.875)
          }
        })
      };
    } else if (type === EXTRACT_TYPE.REPO) {
      data = {
        owner: raw.owner.login,
        ownerAvatar: raw.owner.avatar_url,
        ownerUrl: raw.owner.html_url,
        repo: raw.name,
        repoUrl: raw.html_url,
        desc: raw.description ? compose(replaceEmoji, replaceLink)(encodeHTML`${raw.description}`) : '',
        language: raw.language,
        stars: formatNumber(raw.stargazers_count),
        forks: formatNumber(raw.forks_count),
        issues: formatNumber(raw.open_issues_count),
        hasIssues: raw.has_issues,
        homepage: raw.homepage
          ? raw.homepage.match(/^https?:\/\//) ? raw.homepage : `http://${raw.homepage}`
          : null,
        readme: raw.readme,
        topics: raw.topics.map(topic => {
          return {
            name: topic,
            query: encodeURIComponent(topic)
          }
        }),
        hasTopics: raw.topics.length > 0,
        starredByMe: raw.starred_by_me,
        hasToken: !!token,
        starsUrl: `//${GH_DOMAIN}/${raw.full_name}/stargazers`,
        forksUrl: `//${GH_DOMAIN}/${raw.full_name}/network`,
        issuesUrl: `//${GH_DOMAIN}/${raw.full_name}/issues`,
        icons: {
          repo: getIcon(raw.parent ? 'repo-forked' : 'repo', 1.5),
          info: getIcon('info', 0.875),
          link: getIcon('link', 0.875),
          code: getIcon('code', 0.875),
          bookmark: getIcon('bookmark', 0.875),
          star: getIcon('star', 0.75)
        }
      };
      if (raw.parent) {
        data.parent = {
          repo: raw.parent.full_name,
          url: raw.parent.html_url
        };
      }
    } else if (type === EXTRACT_TYPE.ISSUE) {
      data = {
        title: raw.title,
        body: raw.bodyHTML,
        issueUrl: raw.html_url,
        number: raw.number,
        isPullRequest: !!raw.pull_request,
        isClosed: raw.state === 'closed',
        userUrl: raw.user.html_url,
        user: raw.user.login,
        state: raw.state,
        avatar: raw.user.avatar_url,
        createTime: formatTime(raw.created_at),
        icons: {
          state: getIcon(raw.pull_request ? 'git-pull-request' : (raw.state === 'closed' ? 'issue-closed' : 'issue-opened'), 0.875),
          commit: getIcon('git-commit', 0.875),
          arrow: getIcon('arrow-right', 0.875),
          diff: getIcon('diff', 0.875)
        }
      };
      if (raw.pull_request) {
        const REVIEW_STATE_MAP = {
          COMMENTED: {
            icon: getIcon('comment', 0.75),
            type: 'normal',
            desc: 'left review comments'
          },
          CHANGES_REQUESTED: {
            icon: getIcon('x', 0.75),
            type: 'alert',
            desc: 'requested changes'
          },
          APPROVED: {
            icon: getIcon('check', 0.75),
            type: 'success',
            desc: 'approved these changes'
          },
          PENDING: {
            icon: getIcon('primitive-dot', 0.75),
            type: 'warning',
            desc: 'was requested for review'
          }
        };
        Object.assign(data, {
          headRef: raw.head.ref,
          headUser: raw.head.user.login,
          baseRef: raw.base.ref,
          baseUser: raw.base.user.login,
          commits: raw.commits,
          additions: raw.additions,
          deletions: raw.deletions,
          changedFiles: raw.changed_files,
          mergeability: {
            type: raw.mergeable ? 'success' : 'problem',
            icon: raw.mergeable ? getIcon('check', 0.5) : getIcon('alert', 0.5),
            label: raw.mergeable ? 'No conflicts' : 'Has conflicts',
            desc: raw.mergeable ? 'This branch has no conflicts with the base branch' : 'This branch has conflicts that must be resolved'
          },
          isMerged: raw.merged,
          isSingleCommit: raw.commits === 1,
          isSingleFile: raw.changed_files === 1,
          hasReviews: raw.reviews.length > 0,
          reviews: raw.reviews.map(review => {
            return Object.assign({}, review, {
              state: REVIEW_STATE_MAP[review.state]
            })
          })
        });
      }
    } else if (type === EXTRACT_TYPE.COMMENT) {
      data = {
        avatar: raw.user.avatar_url,
        userUrl: raw.user.html_url,
        loginName: raw.user.login,
        createTime: formatTime(raw.created_at),
        updatedTime: raw.created_at !== raw.updated_at ? formatTime(raw.updated_at, 'edited') : null,
        body: raw.bodyHTML
      };
    } else if (type === EXTRACT_TYPE.COMMIT) {
      let lines = raw.commit.message.split('\n\n');
      let committer;
      if (raw.committer.login && raw.author.login) {
        committer = raw.committer.login === raw.author.login ? null : raw.committer.login;
      } else if (!raw.committer.login && !raw.author.login) {
        committer = (raw.committer.name === raw.author.name && raw.committer.email === raw.author.email)
          ? null : raw.committer.name;
      } else {
        committer = raw.committer.login || raw.committer.name;
      }
      data = {
        sha: raw.sha,
        title: lines[0],
        body: lines.slice(1).join('\n\n'),
        commitUrl: raw.html_url,
        author: raw.author.login || raw.author.name,
        authorUrl: raw.author.html_url,
        authorEmail: raw.author.email,
        authorTime: formatTime(raw.commit.author.date),
        committer: committer,
        committerUrl: raw.committer.html_url,
        committerEmail: raw.committer.email,
        additions: raw.stats.additions,
        deletions: raw.stats.deletions,
        changedFiles: raw.files.length,
        isSingleFile: raw.files.length === 1,
        isGitHub: raw.committer.login === 'web-flow',
        branch: raw.branch,
        pull: raw.pull,
        mainTag: raw.mainTag,
        otherTags: raw.otherTags,
        truncatedTagNumber: raw.truncatedTagNumber,
        fullRepo: raw.fullRepo,
        verified: raw.commit.verification.verified,
        icons: {
          branch: getIcon('git-branch', 0.875),
          tag: getIcon('tag', 0.875),
          commit: getIcon('git-commit', 0.875),
          diff: getIcon('diff', 0.875),
          verified: getIcon('verified', 0.875)
        }
      };
    }

    let html = Mustache.render(CARD_TPL[type], data);
    return $(html);
  }

  function getErrorHTML(error) {
    let html = Mustache.render(CARD_TPL.error, error);
    return $(html);
  }

  // prepare token form
  let tokenForm = $(CARD_TPL.form);
  let tokenField = tokenForm.find('.ghh-token');
  tokenForm.find('.ghh-save').on('click', () => {
    let newToken = tokenField.val().trim();
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken);
      token = newToken;
    }
    tokenForm.detach();
    return false;
  });
  tokenForm.find('.ghh-cancel').on('click', () => {
    tokenForm.detach();
    return false;
  });

  function showTokenForm () {
    tokenForm.appendTo($('body'));
    tokenField.val(token).select();
  }

  $('body')
    .on('click', '.ghh-token-link', showTokenForm)
    .on('tripleclick', '.ghh', showTokenForm)
    .on('wheel', '.ghh-readme, .ghh-issue-body, .ghh-commit-body', function (e) {
      if (this.scrollTop + e.originalEvent.deltaY + this.clientHeight >= this.scrollHeight) {
        e.preventDefault();
        this.scrollTop = this.scrollHeight
      }
      if (this.scrollTop + e.originalEvent.deltaY <= 0) {
        e.preventDefault();
        this.scrollTop = 0
      }
    });

  // prepare cache objects
  let cache = {
    user: {},
    repo: {},
    issue: {},
    comment: {},
    commit: {},
    hovercard: {}
  };

  function extract(context) {
    if (cardOptions.disableProjects && location.href.match(URL_PROJECT_PATTERN)) {
      return;
    }

    isExtracting = true;

    // if on user profile page, we should not show user
    // hovercard for the said user
    let current = location.href.match(URL_USER_PATTERN);
    if (current) {
      current = current[1] || current[2];
      if (GH_RESERVED_USER_NAMES.indexOf(current) !== -1
        || !GH_USER_NAME_PATTERN.test(current)) {
        current = null;
      }
    }

    let selectors = Object.keys(STRATEGIES);
    selectors.forEach(selector => {
      let strategy = STRATEGIES[selector];
      let elems = $(selector, context);
      elems.each(function () {
        let elem = $(this);
        if (getExtracted(elem) || elem.is(BLACK_LIST_SELECTOR)) {
          // skip processed elements
          return;
        }
        let target;
        let username; // {{user}}
        let repo; // {{repo}}
        let fullRepo; // {{user}}/{{repo}}
        let issue; // {{issue}}
        let fullIssue; // {{user}}/{{repo}}#{{issue}}
        let comment; // {{comment}}
        let fullComment; // {{user}}/{{repo}}:{{issue}}
        let commit; // {{commit}}
        let fullCommit; // {{user}}/{{repo}}@{{commit}}
        switch (strategy) {
          case EXTRACTOR.TEXT_USER: {
            username = trim(elem.text().replace(/[@\/]/g, ''));
            target = $(`<span>${elem.text()}</span>`);
            elem.empty().append(target);
            break;
          }
          case EXTRACTOR.TITLE_USER: {
            username = trim((elem.attr('title') || '').replace(/[@\/]/g, ''));
            break;
          }
          case EXTRACTOR.ALT_USER: {
            username = trim((elem.attr('alt') || '').split(/\s+/)[0].replace(/[@\/]/g, ''));
            break;
          }
          case EXTRACTOR.HREF_USER: {
            username = trim((elem.attr('href') || '').replace(/[@\/]/g, ''));
            break;
          }
          case EXTRACTOR.TEXT_MY_REPO: {
            let repo = trim(elem.text());
            if (me && repo.indexOf('/') === -1) {
              fullRepo = `${me}/${repo}`;
              break;
            }
          }
          case EXTRACTOR.SLUG: {
            let slug = elem.text();
            let match = slug.match(SLUG_PATTERN);
            username = trim(match && match[1]);
            repo = trim(match && match[2]);
            issue = trim(match && match[3]);
            commit = trim(match && match[4]);
            if (username && repo) {
              fullRepo = username + '/' + repo;

              // special case for code search highlight
              // save contents before replacing
              let contents = elem.find('em').length
                ? elem.contents().map(function (i) {
                  let text = i === 0 ? (this.textContent.split('/')[1] || '') : this.textContent;
                  // whitelisting <em>s for safety
                  return this.nodeName.toLowerCase() === 'em'
                    ? `<em>${text}</em>`
                    : text;
                }).toArray().join('')
                : null;

              if (issue) {
                elem.html(slug.replace('#' + issue, encodeHTML`#<span>${issue}</span>`));
                slug = elem.html();
              }
              if (commit) {
                elem.html(slug.replace('@' + commit, encodeHTML`@<span>${commit}</span>`));
                slug = elem.html();
              }

              let repoContents = contents || repo; // safe HTML or plain text
              if ((username === me || username === current) && !cardOptions.showSelf) {
                elem.html(slug.replace(fullRepo, encodeHTML`${username}/<span>` + repoContents + '</span>'));
                markExtracted(elem.children().first(), EXTRACT_TYPE.REPO, fullRepo);
              } else {
                elem.html(slug.replace(fullRepo, encodeHTML`<span>${username}</span>/<span>` + repoContents + '</span>'));
                markExtracted(elem.children().first(), EXTRACT_TYPE.USER, username);
                markExtracted(elem.children().first().next(), EXTRACT_TYPE.REPO, fullRepo);
              }
              if (issue) {
                markExtracted(elem.children().last(), EXTRACT_TYPE.ISSUE, fullRepo + '#' + issue);
              }
              if (commit) {
                markExtracted(elem.children().last(), EXTRACT_TYPE.COMMIT, fullRepo + '@' + commit);
              }

              // if not marked earlier, mark as nothing extracted
              if (!getExtracted(elem)) {
                markExtracted(elem);
              }
              elem = null;
            }
            break;
          }
          case EXTRACTOR.TEXT_NODE_URL: {
            let nodes = [...elem[0].childNodes];
            let textNode = nodes.find(node => trim(node.nodeValue));
            target = $(encodeHTML` <span>${textNode.nodeValue}</span>`);
            textNode.parentNode.replaceChild(target[0], textNode);
            markExtracted(elem);
          }
          case EXTRACTOR.URL: {
            target = elem;
            elem = elem.closest('a');

            let href = elem.prop('href'); // absolute path via prop
            if (href) {
              href = href.baseVal || href; // support SVG elements

              try {
                let url = new URL(href);
                // skip local anchors
                if (`${url.host}${url.pathname}` === `${location.host}${location.pathname}`
                  && !url.hash.match(/#issuecomment-/)) {
                  return;
                }
              } catch (e) {
                return;
              }

              let match = href.match(URL_USER_PATTERN);
              username = trim(match && (match[1] || match[2]));
              if (!username) {
                match = href.match(URL_REPO_PATTERN);
                username = trim(match && match[1]);
                repo = trim(match && match[2]);
              }
              if (!username) {
                match = href.match(URL_ISSUE_PATTERN);
                username = trim(match && match[1]);
                repo = trim(match && match[2]);
                issue = trim(match && match[3]);
              }
              if (!username) {
                match = href.match(URL_COMMENT_PATTERN);
                username = trim(match && match[1]);
                repo = trim(match && match[2]);
                issue = trim(match && match[3]);
                comment = trim(match && match[4]);
              }
              if (!username) {
                match = href.match(URL_COMMIT_PATTERN);
                username = trim(match && match[1]);
                repo = trim(match && match[2]);
                commit = trim(match && match[3]);
              }
              if (username) {
                if (GH_RESERVED_USER_NAMES.indexOf(username) !== -1
                  || !GH_USER_NAME_PATTERN.test(username)) {
                  username = null;
                  repo = null;
                  issue = null;
                }
              }
              if (repo) {
                fullRepo = `${username}/${repo}`;
                if (GH_RESERVED_REPO_NAMES.indexOf(repo) !== -1
                  || !GH_REPO_NAME_PATTERN.test(repo)) {
                  fullRepo = null;
                  username = null;
                  issue = null;
                }
              }
              if (issue) {
                fullIssue = `${username}/${repo}#${issue}`;
              }
              if (comment) {
                fullComment = `${username}/${repo}:${comment}`;
              }
              if (commit) {
                fullCommit = `${username}/${repo}@${commit}`;
              }
              // skip hovercard on myself or current profile page owner
              if ((username === me || username === current) && !cardOptions.showSelf && !repo) {
                username = null;
              }
            }
            break;
          }
          case EXTRACTOR.NEXT_TEXT_REPO: {
            fullRepo = getFullRepoFromAncestorLink(elem);
            repo = fullRepo.split('/')[1];
            let textNode = getNextTextNode(elem[0], elem[0].parentNode.parentNode);
            target = $(`<span>${repo}</span>`);
            if (fullRepo && textNode) {
              let parent = textNode.parentNode;
              parent.replaceChild(target[0], textNode);
              parent.insertBefore(document.createTextNode(' '), target[0]);
              markExtracted(elem);
            } else {
              elem = null;
            }
            break;
          }
          case EXTRACTOR.ANCESTOR_URL_REPO: {
            fullRepo = getFullRepoFromAncestorLink(elem);
            break;
          }
          case EXTRACTOR.NEXT_LINK_TEXT_USER: {
            let link = elem.nextAll('a').eq(0);
            if (link) {
              username = trim(link.text().replace(/[@\/]/g, ''));
            }
            break;
          }
          case EXTRACTOR.TEXT_NODE_USER: {
            let nodes = [...elem[0].childNodes];
            let textNode = nodes.find(node => trim(node.nodeValue));

            if (textNode) {
              username = trim(textNode.nodeValue);
              let userElem = $(`<span>${textNode.nodeValue}</span>`);
              textNode.parentNode.replaceChild(userElem[0], textNode);
              markExtracted(elem);
              target = userElem;
            }
            break;
          }
          case EXTRACTOR.NEXT_TEXT_USER: {
            let textNode = getNextTextNode(elem[0], elem[0].parentNode.parentNode);
            username = textNode.nodeValue.replace(/[\s\\\/]+/g, '');
            break;
          }
          case EXTRACTOR.REPO_LIST_SLUG: {
            elem.find('.octicon-repo').insertBefore(elem.closest('a'))
            let slug = elem.text().replace(/\s+/g, '');
            let match = slug.match(SLUG_PATTERN);
            username = trim(match && match[1]);
            repo = trim(match && match[2]);
            if (username && repo) {
              fullRepo = username + '/' + repo;

              elem.html(fixRepoSlug(elem.html()));
              let targets = elem.find('[data-ghh]');
              markExtracted(targets.eq(0), EXTRACT_TYPE.USER, username);
              markExtracted(targets.eq(1), EXTRACT_TYPE.REPO, fullRepo);
              targets.removeAttr('data-ghh');

              // if not marked earlier, mark as nothing extracted
              if (!getExtracted(elem)) {
                markExtracted(elem);
              }
              elem = null;
            }
            break;
          }
          default:
            break;
        }

        // elem === null means already marked in extractors
        if (!elem) {
          return;
        }

        target = target || elem;
        if (fullCommit) {
          markExtracted(target, EXTRACT_TYPE.COMMIT, fullCommit);
        } else if (fullComment) {
          markExtracted(target, EXTRACT_TYPE.COMMENT, fullComment);
        } else if (fullIssue) {
          markExtracted(target, EXTRACT_TYPE.ISSUE, fullIssue);
        } else if (fullRepo) {
          markExtracted(target, EXTRACT_TYPE.REPO, fullRepo);
        } else if (username) {
          if (username !== me && username !== current || cardOptions.showSelf) {
            markExtracted(target, EXTRACT_TYPE.USER, username);
          } else {
            markExtracted(target);
          }
        }
        if (!username && !fullRepo && !fullIssue) {
          markExtracted(elem);
        }
      });
    });

    setTimeout(() => {
      isExtracting = false;
    }, 0);

    let tipSelector = Object.keys(EXTRACT_TYPE)
      .map(key => EXTRACT_TYPE[key])
      .map(getTypeClass)
      .map(className => `.${className}`)
      .join(',');

    let tipped = $(tipSelector);
    tipped.tooltipster({
      updateAnimation: false,
      contentAsHTML: true,
      debug: false,
      delay: cardOptions.delay,
      // trigger: 'click',
      zIndex: 2147483647,
      functionBefore(self, event) {
        let elem = $(event.origin);
        elem.tooltipster('content', $('<span class="loading"></span>'));
        let type = elem.data(TYPE_KEY);
        let value = elem.data(VALUE_KEY);

        let raw = cache[type][value];
        if (raw && type !== EXTRACT_TYPE.USER) {
          elem.tooltipster('content', getCardHTML(type, raw));
        } else {
          if (raw && type === EXTRACT_TYPE.USER) {
            let subject = getHovercardSubject() || {};
            // '@' for contextless
            let subjectSlug = subject ? `${subject.type}:${subject.id}` : '@';
            if (cache.hovercard[value] && cache.hovercard[value][subjectSlug]) {
              Object.assign(raw, {
                hovercard: cache.hovercard[value][subjectSlug]
              });
              elem.tooltipster('content', getCardHTML(type, raw));
              return;
            }
          }

          let apiPath;
          switch (type) {
            case EXTRACT_TYPE.USER:
              apiPath = `users/${value}`;
              break;
            case EXTRACT_TYPE.REPO:
              apiPath = `repos/${value}`;
              break;
            case EXTRACT_TYPE.ISSUE: {
              let [fullRepo, issue] = value.split('#');
              apiPath = `repos/${fullRepo}/issues/${issue}`;
              break;
            }
            case EXTRACT_TYPE.COMMENT: {
              let [fullRepo, comment] = value.split(':');
              apiPath = `repos/${fullRepo}/issues/comments/${comment}`;
              break;
            }
            case EXTRACT_TYPE.COMMIT: {
              let values = value.split('@');
              let fullRepo = values[0];
              let commit = values[1];
              apiPath = `repos/${fullRepo}/commits/${commit}`;
              break;
            }
          }

          let baseOptions = {
            url: `${API_PREFIX}/${apiPath}`,
            dataType: 'json'
          };

          let isRetry = false;
          let handleError = function (xhr) {
            let {status} = xhr;
            let title = '';
            let message = '';

            switch (status) {
              case 0:
                if (isRetry) {
                  title = 'Connection error';
                  message = 'Please try again later.';
                } else {
                  // next request should be retry
                  isRetry = true;
                  request();
                  return;
                }
                break;
              case 401:
                title = 'Invalid token';
                message = encodeHTML`<a href="${CREATE_TOKEN_PATH}" class="ghh-token-link" target="_blank">Create a new access token</a>, <a href="#" class="ghh-token-link">paste it back here</a> and try again.`;
                break;
              case 403: {
                let response = xhr.responseJSON;
                if (xhr.getAllResponseHeaders().indexOf('X-RateLimit-Remaining: 0') !== -1) {
                  title = 'API rate limit exceeded';
                  if (!localStorage.getItem(TOKEN_KEY)) {
                    message = encodeHTML`API rate limit exceeded for current IP. <a href="${CREATE_TOKEN_PATH}" class="ghh-token-link" target="_blank">Create a new access token</a> and <a href="#" class="ghh-token-link">paste it back here</a> to get a higher rate limit.`;
                  }
                } else if (type === EXTRACT_TYPE.REPO && response.block && response.block.reason === 'tos') {
                  title = 'Access blocked';
                  message = encodeHTML`Access to this repository has been disabled by GitHub staff.`;
                } else {
                  title = 'Forbidden';
                  message = encodeHTML`You are not allowed to access GitHub API. <a href="${CREATE_TOKEN_PATH}" class="ghh-token-link" target="_blank">Create a new access token</a>, <a href="#" class="ghh-token-link">paste it back here</a> and try again.`;
                }
                break;
              }
              case 404:
                title = 'Not found';
                if (type === EXTRACT_TYPE.REPO || type === EXTRACT_TYPE.ISSUE) {
                  message = encodeHTML`The repository doesn't exist or is private. <a href="${CREATE_TOKEN_PATH}" class="ghh-token-link" target="_blank">Create a new access token</a>, <a href="#" class="ghh-token-link">paste it back here</a> and try again.`;
                } else if (type === EXTRACT_TYPE.USER) {
                  message = 'The user doesn\'t exist.';
                }
                break;
              case 451: {
                let response = xhr.responseJSON;
                if (type === EXTRACT_TYPE.REPO && response.block && response.block.reason === 'dmca') {
                  title = 'Access blocked';
                  message = encodeHTML`Repository access blocked due to DMCA takedown. See the <a href="${response.block.html_url}" target="_blank">takedown notice</a>.`;
                }
                break;
              }
              default:
                title = 'Error';
                let response = xhr.responseJSON;
                if (response) {
                  message = encodeHTML`${response.message}` || '';
                }
                break;
            }

            let error = {
              title,
              message,
              icons: {
                alert: getIcon('alert')
              }
            };
            elem.tooltipster('content', getErrorHTML(error));
          };

          let request = function () {
            let headers = {};
            if (token && !isRetry) {
              headers.Authorization = `token ${token}`;
            }
            if (type === EXTRACT_TYPE.COMMIT) {
              headers.Accept = 'application/vnd.github.cryptographer-preview';
            } else if (type === EXTRACT_TYPE.REPO) {
              headers.Accept = 'application/vnd.github.mercy-preview+json'
            }

            let requestOptions = Object.assign({}, baseOptions, {headers});

            function renderMarkdown(content, context) {
              let options = {
                url: `${API_PREFIX}/markdown`,
                method: 'POST',
                contentType: 'application/json',
                dataType: 'text',
                data: JSON.stringify({
                  text: content,
                  mode: 'gfm',
                  context: context
                })
              };
              return $.ajax(Object.assign({}, requestOptions, options));
            }

            $.ajax(requestOptions)
              .done(raw => {
                cache[type][value] = raw;

                // further requests if necessary
                switch (type) {
                  case EXTRACT_TYPE.USER: {
                    if (raw.type !== 'Organization') {
                      let todo = 0;
                      let extra = {};

                      if (value) {
                        if (!cache.hovercard[value]) {
                          cache.hovercard[value] = {};
                        }

                        let subject = getHovercardSubject() || {};
                        // '@' for contextless
                        let subjectSlug = subject ? `${subject.type}:${subject.id}` : '@';
                        if (cache.hovercard[value][subjectSlug]) {
                          extra.hovercard = cache.hovercard[value][subjectSlug];
                        } else if (token) {
                          // get hovercard contexts
                          todo++;

                          let headers = {
                            Accept: 'application/vnd.github.hagar-preview+json'
                          };
                          if (token) {
                            Object.assign(headers, {
                              Authorization: `token ${token}`
                            });
                          }
                          let options = {
                            url: `${API_PREFIX}/users/${value}/hovercard`,
                            method: 'GET',
                            dataType: 'json',
                            headers,
                            data: {
                              subject_type: subject.type,
                              subject_id: subject.id
                            }
                          };
                          $.ajax(Object.assign({}, baseOptions, options))
                            .done(hovercard => {
                              extra.hovercard = cache.hovercard[value][subjectSlug] = hovercard.contexts;
                              Object.assign(raw, extra);
                            })
                            .always(() => {
                              if (!--todo) {
                                elem.tooltipster('content', getCardHTML(type, raw));
                              }
                            });
                        }

                        // if the logged-in user is following the current user
                        if (me && value !== me) {
                          todo += 2;
                          extra = {
                            following_me: false,
                            followed_by_me: false
                          };

                          $.ajax(Object.assign({}, requestOptions, {
                            url: `${API_PREFIX}/user/following/${value}`
                          }))
                            .done(() => {
                              extra.followed_by_me = true;
                            })
                            .always(() => {
                              Object.assign(raw, extra);
                              if (!--todo) {
                                elem.tooltipster('content', getCardHTML(type, raw));
                              }
                            });
                          // if the current user is following the logged-in user
                          $.ajax(Object.assign({}, requestOptions, {
                            url: `${API_PREFIX}/users/${value}/following/${me}`,
                            dataType: 'json'
                          }))
                            .done(() => {
                              extra.following_me = true;
                            })
                            .always(() => {
                              Object.assign(raw, extra);
                              if (!--todo) {
                                elem.tooltipster('content', getCardHTML(type, raw));
                              }
                            });
                        }
                      }

                      return;
                    }
                    break;
                  }
                  case EXTRACT_TYPE.REPO: {
                    let headers = {
                      Accept: 'application/vnd.github.v3.html'
                    };
                    if (token) {
                      Object.assign(headers, {
                        Authorization: `token ${token}`
                      });
                    }

                    let todo = 0;

                    if (cardOptions.readme) {
                      todo++;
                      let options = {
                        url: `${API_PREFIX}/${apiPath}/readme`,
                        method: 'GET',
                        dataType: 'html',
                        headers
                      };
                      $.ajax(Object.assign({}, baseOptions, options))
                        .done(html => {
                          let content = $(html).find('.entry-content');
                          $('.anchor', content).remove();
                          let base = raw.html_url;
                          $('[href], [src]', content).each(function () {
                            fixRef($(this), base, raw.default_branch);
                          });
                          raw.readme = content.html();
                        })
                        .always(() => {
                          if (!--todo) {
                            elem.tooltipster('content', getCardHTML(type, raw));
                          }
                        });
                    }

                    if (me) {
                      todo++;
                      let extra = {
                        starred_by_me: false
                      };
                      $.ajax(Object.assign({}, requestOptions, {
                        url: `${API_PREFIX}/user/starred/${value}`
                      }))
                        .done(() => {
                          extra.starred_by_me = true;
                        })
                        .always(() => {
                          Object.assign(raw, extra);
                          if (!--todo) {
                            elem.tooltipster('content', getCardHTML(type, raw));
                          }
                        });
                    }

                    if (!todo) {
                      break;
                    }

                    return;
                  }
                  case EXTRACT_TYPE.ISSUE: {
                    let todo = 0;
                    if (raw.body) {
                      todo++;
                      renderMarkdown(raw.body, value.split('#')[0])
                        .done(html => {
                          raw.bodyHTML = html;
                          if (!--todo) {
                            elem.tooltipster('content', getCardHTML(type, raw));
                          }
                        })
                        .fail(handleError);
                    }
                    if (raw.pull_request) {
                      // load PR
                      todo++;
                      let prPath = apiPath.replace(/\/issues\/(\d+)$/, '/pulls/$1');
                      let prOptions = {
                        url: `${API_PREFIX}/${prPath}`,
                        dataType: 'json'
                      };
                      $.ajax(Object.assign({}, requestOptions, prOptions))
                        .done(pull => {
                          let extra = {
                            commits: pull.commits,
                            additions: pull.additions,
                            deletions: pull.deletions,
                            changed_files: pull.changed_files,
                            mergeable: pull.mergeable,
                            merged: pull.merged,
                            head: pull.head,
                            base: pull.base
                          };
                          if (pull.merged) {
                            extra.state = 'merged';
                          }
                          Object.assign(raw, extra);
                          Object.assign(cache[type][value], extra);
                          if (!--todo) {
                            elem.tooltipster('content', getCardHTML(type, raw));
                          }
                        })
                        .fail(handleError);

                      let allReviews = []
                      Object.assign(raw, { reviews: allReviews });
                      Object.assign(cache[type][value], { reviews: allReviews });

                      // load reviews
                      todo++;
                      let reviewPath = `${prPath}/reviews`;
                      let reviewOptions = {
                        url: `${API_PREFIX}/${reviewPath}`,
                        dataType: 'json'
                      };
                      $.ajax(Object.assign({}, requestOptions, reviewOptions))
                        .done(reviews => {
                          let logged = reviews.reduce((acc, { user, state }) => {
                            let record = acc[user.login]
                            if (user.login !== raw.user.login // not self
                              && (state !== 'COMMENTED' || (!record && state === 'COMMENTED'))) {
                              acc[user.login] = {
                                name: user.login,
                                url: user.html_url,
                                avatar: user.avatar_url,
                                state: state
                              }
                            }
                            return acc
                          }, {})
                          let results = Object.keys(logged).map(login => logged[login])
                          allReviews.unshift(...results);
                          if (!--todo) {
                            elem.tooltipster('content', getCardHTML(type, raw));
                          }
                        })
                        .fail(handleError);

                        // load reviews
                        todo++;
                        let reviewReqPath = `${prPath}/requested_reviewers`;
                        let reviewReqOptions = {
                          url: `${API_PREFIX}/${reviewReqPath}`,
                          dataType: 'json'
                        };
                        let opts = Object.assign({}, requestOptions, reviewReqOptions);
                        opts.headers.Accept = 'application/vnd.github.thor-preview+json';
                          $.ajax(opts)
                          .done(reqs => {
                            let [owner] = value.split('/');
                            let users = reqs.users || reqs
                            let reviewers = users.map(user => {
                              return {
                                name: user.login,
                                url: user.html_url,
                                avatar: user.avatar_url,
                                state: 'PENDING'
                              }
                            });
                            if (reqs.teams) {
                              reviewers.push(...reqs.teams.map(team => {
                                return {
                                  name: team.name,
                                  url: `${SITE_PREFIX}orgs/${owner}/teams/${team.slug}`,
                                  avatar: '',
                                  state: 'PENDING'
                                }
                              }));
                            }

                            allReviews.push(...reviewers);
                            if (!--todo) {
                              elem.tooltipster('content', getCardHTML(type, raw));
                            }
                          })
                          .fail(handleError);
                    }
                    if (!todo) {
                      break;
                    }
                    return;
                  }
                  case EXTRACT_TYPE.COMMENT: {
                    renderMarkdown(raw.body, value.split(':')[0])
                      .done(html => {
                        raw.bodyHTML = html;
                        elem.tooltipster('content', getCardHTML(type, raw));
                      })
                      .fail(handleError);

                    return;
                  }
                  case EXTRACT_TYPE.COMMIT: {
                    let [fullRepo, commit] = value.split('@');
                    let commitPagePath = `${fullRepo}/branch_commits/${commit}`;
                    raw.fullRepo = fullRepo;
                    raw.author = raw.author || raw.commit.author;
                    raw.committer = raw.committer || raw.commit.committer;
                    let options = {
                      url: `${SITE_PREFIX}${commitPagePath}`,
                      headers: {
                        'X-PJAX': 'true'
                      },
                      dataType: 'html'
                    };
                    $.ajax(Object.assign(options))
                      .done(html => {
                        let branches = $(`<div>${html}</div>`);
                        raw.branch = branches.find('.branch a').text();
                        raw.pull = branches.find('.pull-request a').text().substring(1);
                        let tags = branches.find('.branches-tag-list a').map(function () {
                          return this.textContent;
                        }).get();

                        let maxTags = 10;
                        if (tags.length) {
                          if (tags.length > maxTags) {
                            raw.truncatedTagNumber = tags.length - maxTags;
                            tags.splice(maxTags);
                          }
                          raw.mainTag = tags[0];
                          raw.otherTags = tags.slice(1);
                        }

                        elem.tooltipster('content', getCardHTML(type, raw));
                      });

                    return;
                  }
                }

                elem.tooltipster('content', getCardHTML(type, raw));
              })
              .fail(handleError);
          };
          request();
        }
      },
      interactive: true
    });

    function toggleButtonState(action, ...args) {
      return ({
        follow: {
          type: 'user',
          field: 'followed_by_me',
          value: true,
          className: 'ghh-aux',
          action: 'unfollow',
          content: `Unfollow`
        },
        unfollow: {
          type: 'user',
          field: 'followed_by_me',
          value: false,
          className: 'ghh-primary',
          action: 'follow',
          content: `Follow`
        },
        star: {
          type: 'repo',
          field: 'starred_by_me',
          value: true,
          className: 'ghh-aux',
          action: 'unstar',
          content: `${getIcon('star', 0.75)} Unstar`
        },
        unstar: {
          type: 'repo',
          field: 'starred_by_me',
          value: false,
          className: 'ghh-primary',
          action: 'star',
          content: `${getIcon('star', 0.75)} Star`
        }
      })[action];
    }

    if (me) {
      $('body').on('click', '[data-action]', function () {
        let {action, args} = this.dataset;
        let options;
        if (action === 'follow' || action === 'unfollow') {
          options = {
            url: `${API_PREFIX}/user/following/${args}`,
            method: action === 'follow' ? 'PUT' : 'DELETE'
          };
        } else if (action === 'star' || action === 'unstar') {
          options = {
            url: `${API_PREFIX}/user/starred/${args}`,
            method: action === 'star' ? 'PUT' : 'DELETE'
          };
        }

        options.headers = {
          Authorization: `token ${token}`
        };

        this.disabled = true;
        $.ajax(options)
          .done(() => {
            let state = toggleButtonState(action, args);
            this.innerHTML = state.content;
            this.dataset.action = state.action;
            this.className = state.className;
            this.disabled = false;
            cache[state.type][args][state.field] = state.value;
          })
          .fail(() => {
            let error = {
              title: 'Forbidden',
              message: encodeHTML`Please ensure your access token contains these scopes: </p><ul><li><code>public_repo</code></li><li><code>user:follow</code></li></ul><p><a href="${EDIT_TOKEN_PATH}" target="_blank">Edit token scopes</a> and try again.`,
              icons: {
                alert: getIcon('alert')
              }
            };
            $(this).closest('.tooltipster-content').html(getErrorHTML(error));
          });
      });
    }

    if ('webkitTransform' in document.body.style) {
      // why? see https://github.com/iamceege/tooltipster/issues/491
      // use box-shadow instead to prevent weirder problem...
      tipped.css('box-shadow', '0 0 transparent');
    }

    // disable original title tooltips
    tipped.attr('title', null)
      .closest('[data-hovercard-user-id]').attr('data-hovercard-user-id', null);

    // block original tooltips
    // see https://github.com/Justineo/github-hovercard/issues/30
    const ORGANIC_TOOLTIP_CLASS = 'tooltipped';
    tipped.filter(`.${ORGANIC_TOOLTIP_CLASS}`).removeClass(ORGANIC_TOOLTIP_CLASS);
    tipped.parents(`.${ORGANIC_TOOLTIP_CLASS}`).removeClass(ORGANIC_TOOLTIP_CLASS);

    // Listen for future mutations but not ones happens
    // in current extraction process
    setTimeout(() => {
      isExtracting = false;
    }, 0);
  }

  const EMOJI_MAP = '__EMOJI_DATA__';

  const TOKEN_KEY = 'hovercard-token';
  let token = localStorage.getItem(TOKEN_KEY);
  let platform = (typeof browser !== 'undefined' ? browser : window.chrome) || null;

  const DEFAULT_OPTIONS = {
    delay: 200,
    readme: true,
    disableProjects: false,
    showSelf: false
  };

  let cardOptions = Object.assign({}, DEFAULT_OPTIONS);

  if (platform && platform.storage) {
    let storage = platform.storage.sync || platform.storage.local;
    storage.get(Object.assign({}, DEFAULT_OPTIONS), ({ delay, readme, disableProjects, showSelf }) => {
      delay = parseInt(delay, 10)
      delay = isNaN(delay) ? 200 : delay

      Object.assign(cardOptions, {
        delay, readme, disableProjects, showSelf
      });

      extract();
    });
  } else {
    extract();
  }
});

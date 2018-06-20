document.addEventListener('DOMContentLoaded', () => {
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
  const OCTICONS = {"alert":{"width":16,"height":16,"d":"M8.865 1.52c-.18-.31-.51-.5-.87-.5s-.69.19-.87.5L.275 13.5c-.18.31-.18.69 0 1 .19.31.52.5.87.5h13.7c.36 0 .69-.19.86-.5.17-.31.18-.69.01-1L8.865 1.52zM8.995 13h-2v-2h2v2zm0-3h-2V6h2v4z"},"arrow-right":{"width":10,"height":16,"d":"M10 8L4 3v3H0v4h4v3z"},"code":{"width":14,"height":16,"d":"M9.5 3L8 4.5 11.5 8 8 11.5 9.5 13 14 8 9.5 3zm-5 0L0 8l4.5 5L6 11.5 2.5 8 6 4.5 4.5 3z"},"diff":{"width":13,"height":16,"d":"M6 7h2v1H6v2H5V8H3V7h2V5h1v2zm-3 6h5v-1H3v1zM7.5 2L11 5.5V15c0 .55-.45 1-1 1H1c-.55 0-1-.45-1-1V3c0-.55.45-1 1-1h6.5zM10 6L7 3H1v12h9V6zM8.5 0H3v1h5l4 4v8h1V4.5L8.5 0z"},"git-commit":{"width":14,"height":16,"d":"M10.86 7c-.45-1.72-2-3-3.86-3-1.86 0-3.41 1.28-3.86 3H0v2h3.14c.45 1.72 2 3 3.86 3 1.86 0 3.41-1.28 3.86-3H14V7h-3.14zM7 10.2c-1.22 0-2.2-.98-2.2-2.2 0-1.22.98-2.2 2.2-2.2 1.22 0 2.2.98 2.2 2.2 0 1.22-.98 2.2-2.2 2.2z"},"git-pull-request":{"width":12,"height":16,"d":"M11 11.28V5c-.03-.78-.34-1.47-.94-2.06C9.46 2.35 8.78 2.03 8 2H7V0L4 3l3 3V4h1c.27.02.48.11.69.31.21.2.3.42.31.69v6.28A1.993 1.993 0 0 0 10 15a1.993 1.993 0 0 0 1-3.72zm-1 2.92c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zM4 3c0-1.11-.89-2-2-2a1.993 1.993 0 0 0-1 3.72v6.56A1.993 1.993 0 0 0 2 15a1.993 1.993 0 0 0 1-3.72V4.72c.59-.34 1-.98 1-1.72zm-.8 10c0 .66-.55 1.2-1.2 1.2-.65 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2zM2 4.2C1.34 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z"},"info":{"width":14,"height":16,"d":"M6.3 5.69a.942.942 0 0 1-.28-.7c0-.28.09-.52.28-.7.19-.18.42-.28.7-.28.28 0 .52.09.7.28.18.19.28.42.28.7 0 .28-.09.52-.28.7a1 1 0 0 1-.7.3c-.28 0-.52-.11-.7-.3zM8 7.99c-.02-.25-.11-.48-.31-.69-.2-.19-.42-.3-.69-.31H6c-.27.02-.48.13-.69.31-.2.2-.3.44-.31.69h1v3c.02.27.11.5.31.69.2.2.42.31.69.31h1c.27 0 .48-.11.69-.31.2-.19.3-.42.31-.69H8V7.98v.01zM7 2.3c-3.14 0-5.7 2.54-5.7 5.68 0 3.14 2.56 5.7 5.7 5.7s5.7-2.55 5.7-5.7c0-3.15-2.56-5.69-5.7-5.69v.01zM7 .98c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.12-7-7 3.14-7 7-7z"},"issue-closed":{"width":16,"height":16,"d":"M7 10h2v2H7v-2zm2-6H7v5h2V4zm1.5 1.5l-1 1L12 9l4-4.5-1-1L12 7l-1.5-1.5zM8 13.7A5.71 5.71 0 0 1 2.3 8c0-3.14 2.56-5.7 5.7-5.7 1.83 0 3.45.88 4.5 2.2l.92-.92A6.947 6.947 0 0 0 8 1C4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14 7-7l-1.52 1.52c-.66 2.41-2.86 4.19-5.48 4.19v-.01z"},"issue-opened":{"width":14,"height":16,"d":"M7 2.3c3.14 0 5.7 2.56 5.7 5.7s-2.56 5.7-5.7 5.7A5.71 5.71 0 0 1 1.3 8c0-3.14 2.56-5.7 5.7-5.7zM7 1C3.14 1 0 4.14 0 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm1 3H6v5h2V4zm0 6H6v2h2v-2z"},"link":{"width":16,"height":16,"d":"M4 9h1v1H4c-1.5 0-3-1.69-3-3.5S2.55 3 4 3h4c1.45 0 3 1.69 3 3.5 0 1.41-.91 2.72-2 3.25V8.59c.58-.45 1-1.27 1-2.09C10 5.22 8.98 4 8 4H4c-.98 0-2 1.22-2 2.5S3 9 4 9zm9-3h-1v1h1c1 0 2 1.22 2 2.5S13.98 12 13 12H9c-.98 0-2-1.22-2-2.5 0-.83.42-1.64 1-2.09V6.25c-1.09.53-2 1.84-2 3.25C6 11.31 7.55 13 9 13h4c1.45 0 3-1.69 3-3.5S14.5 6 13 6z"},"location":{"width":12,"height":16,"d":"M6 0C2.69 0 0 2.5 0 5.5 0 10.02 6 16 6 16s6-5.98 6-10.5C12 2.5 9.31 0 6 0zm0 14.55C4.14 12.52 1 8.44 1 5.5 1 3.02 3.25 1 6 1c1.34 0 2.61.48 3.56 1.36.92.86 1.44 1.97 1.44 3.14 0 2.94-3.14 7.02-5 9.05zM8 5.5c0 1.11-.89 2-2 2-1.11 0-2-.89-2-2 0-1.11.89-2 2-2 1.11 0 2 .89 2 2z"},"organization":{"width":16,"height":16,"d":"M16 12.999c0 .439-.45 1-1 1H7.995c-.539 0-.994-.447-.995-.999H1c-.54 0-1-.561-1-1 0-2.634 3-4 3-4s.229-.409 0-1c-.841-.621-1.058-.59-1-3 .058-2.419 1.367-3 2.5-3s2.442.58 2.5 3c.058 2.41-.159 2.379-1 3-.229.59 0 1 0 1s1.549.711 2.42 2.088C9.196 9.369 10 8.999 10 8.999s.229-.409 0-1c-.841-.62-1.058-.59-1-3 .058-2.419 1.367-3 2.5-3s2.437.581 2.495 3c.059 2.41-.158 2.38-1 3-.229.59 0 1 0 1s3.005 1.366 3.005 4"},"person":{"width":12,"height":16,"d":"M12 14.002a.998.998 0 0 1-.998.998H1.001A1 1 0 0 1 0 13.999V13c0-2.633 4-4 4-4s.229-.409 0-1c-.841-.62-.944-1.59-1-4 .173-2.413 1.867-3 3-3s2.827.586 3 3c-.056 2.41-.159 3.38-1 4-.229.59 0 1 0 1s4 1.367 4 4v1.002z"},"repo-forked":{"width":10,"height":16,"d":"M8 1a1.993 1.993 0 0 0-1 3.72V6L5 8 3 6V4.72A1.993 1.993 0 0 0 2 1a1.993 1.993 0 0 0-1 3.72V6.5l3 3v1.78A1.993 1.993 0 0 0 5 15a1.993 1.993 0 0 0 1-3.72V9.5l3-3V4.72A1.993 1.993 0 0 0 8 1zM2 4.2C1.34 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zm3 10c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zm3-10c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z"},"repo":{"width":12,"height":16,"d":"M4 9H3V8h1v1zm0-3H3v1h1V6zm0-2H3v1h1V4zm0-2H3v1h1V2zm8-1v12c0 .55-.45 1-1 1H6v2l-1.5-1.5L3 16v-2H1c-.55 0-1-.45-1-1V1c0-.55.45-1 1-1h10c.55 0 1 .45 1 1zm-1 10H1v2h2v-1h3v1h5v-2zm0-10H2v9h9V1z"},"git-branch":{"width":10,"height":16,"d":"M10 5c0-1.11-.89-2-2-2a1.993 1.993 0 0 0-1 3.72v.3c-.02.52-.23.98-.63 1.38-.4.4-.86.61-1.38.63-.83.02-1.48.16-2 .45V4.72a1.993 1.993 0 0 0-1-3.72C.88 1 0 1.89 0 3a2 2 0 0 0 1 1.72v6.56c-.59.35-1 .99-1 1.72 0 1.11.89 2 2 2 1.11 0 2-.89 2-2 0-.53-.2-1-.53-1.36.09-.06.48-.41.59-.47.25-.11.56-.17.94-.17 1.05-.05 1.95-.45 2.75-1.25S8.95 7.77 9 6.73h-.02C9.59 6.37 10 5.73 10 5zM2 1.8c.66 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2C1.35 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2zm0 12.41c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zm6-8c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z"},"tag":{"width":14,"height":16,"d":"M7.73 1.73C7.26 1.26 6.62 1 5.96 1H3.5C2.13 1 1 2.13 1 3.5v2.47c0 .66.27 1.3.73 1.77l6.06 6.06c.39.39 1.02.39 1.41 0l4.59-4.59a.996.996 0 0 0 0-1.41L7.73 1.73zM2.38 7.09c-.31-.3-.47-.7-.47-1.13V3.5c0-.88.72-1.59 1.59-1.59h2.47c.42 0 .83.16 1.13.47l6.14 6.13-4.73 4.73-6.13-6.15zM3.01 3h2v2H3V3h.01z"},"bookmark":{"width":10,"height":16,"d":"M9 0H1C.27 0 0 .27 0 1v15l5-3.09L10 16V1c0-.73-.27-1-1-1zm-.78 4.25L6.36 5.61l.72 2.16c.06.22-.02.28-.2.17L5 6.6 3.12 7.94c-.19.11-.25.05-.2-.17l.72-2.16-1.86-1.36c-.17-.16-.14-.23.09-.23l2.3-.03.7-2.16h.25l.7 2.16 2.3.03c.23 0 .27.08.09.23h.01z"},"star":{"width":14,"height":16,"d":"M14 6l-4.9-.64L7 1 4.9 5.36 0 6l3.6 3.26L2.67 14 7 11.67 11.33 14l-.93-4.74z"},"verified":{"width":16,"height":16,"d":"M15.67 7.06l-1.08-1.34c-.17-.22-.28-.48-.31-.77l-.19-1.7a1.51 1.51 0 0 0-1.33-1.33l-1.7-.19c-.3-.03-.56-.16-.78-.33L8.94.32c-.55-.44-1.33-.44-1.88 0L5.72 1.4c-.22.17-.48.28-.77.31l-1.7.19c-.7.08-1.25.63-1.33 1.33l-.19 1.7c-.03.3-.16.56-.33.78L.32 7.05c-.44.55-.44 1.33 0 1.88l1.08 1.34c.17.22.28.48.31.77l.19 1.7c.08.7.63 1.25 1.33 1.33l1.7.19c.3.03.56.16.78.33l1.34 1.08c.55.44 1.33.44 1.88 0l1.34-1.08c.22-.17.48-.28.77-.31l1.7-.19c.7-.08 1.25-.63 1.33-1.33l.19-1.7c.03-.3.16-.56.33-.78l1.08-1.34c.44-.55.44-1.33 0-1.88zM6.5 12L3 8.5 4.5 7l2 2 5-5L13 5.55 6.5 12z"},"key":{"width":14,"height":16,"d":"M12.83 2.17C12.08 1.42 11.14 1.03 10 1c-1.13.03-2.08.42-2.83 1.17S6.04 3.86 6.01 5c0 .3.03.59.09.89L0 12v1l1 1h2l1-1v-1h1v-1h1v-1h2l1.09-1.11c.3.08.59.11.91.11 1.14-.03 2.08-.42 2.83-1.17S13.97 6.14 14 5c-.03-1.14-.42-2.08-1.17-2.83zM11 5.38c-.77 0-1.38-.61-1.38-1.38 0-.77.61-1.38 1.38-1.38.77 0 1.38.61 1.38 1.38 0 .77-.61 1.38-1.38 1.38z"},"check":{"width":12,"height":16,"d":"M12 5l-8 8-4-4 1.5-1.5L4 10l6.5-6.5z"},"x":{"width":12,"height":16,"d":"M7.48 8l3.75 3.75-1.48 1.48L6 9.48l-3.75 3.75-1.48-1.48L4.52 8 .77 4.25l1.48-1.48L6 6.52l3.75-3.75 1.48 1.48z"},"primitive-dot":{"width":8,"height":16,"d":"M0 8c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4z"},"comment":{"width":16,"height":16,"d":"M14 1H2c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h2v3.5L7.5 11H14c.55 0 1-.45 1-1V2c0-.55-.45-1-1-1zm0 9H7l-2 2v-2H2V2h12v8z"},"comment-discussion":{"width":16,"height":16,"d":"M15 1H6c-.55 0-1 .45-1 1v2H1c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h1v3l3-3h4c.55 0 1-.45 1-1V9h1l3 3V9h1c.55 0 1-.45 1-1V2c0-.55-.45-1-1-1zM9 11H4.5L3 12.5V11H1V5h4v3c0 .55.45 1 1 1h3v2zm6-3h-2v1.5L11.5 8H6V2h9v6z"},"clock":{"width":14,"height":16,"d":"M8 8h3v2H7c-.55 0-1-.45-1-1V4h2v4zM7 2.3c3.14 0 5.7 2.56 5.7 5.7s-2.56 5.7-5.7 5.7A5.71 5.71 0 0 1 1.3 8c0-3.14 2.56-5.7 5.7-5.7zM7 1C3.14 1 0 4.14 0 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7z"},"jersey":{"width":14,"height":16,"d":"M4.5 6l-.5.5v5l.5.5h2l.5-.5v-5L6.5 6h-2zM6 11H5V7h1v4zm6.27-7.25C12.05 2.37 11.96 1.12 12 0H9.02c0 .27-.13.48-.39.69-.25.2-.63.3-1.13.3-.5 0-.88-.09-1.13-.3-.23-.2-.36-.42-.36-.69H3c.05 1.13-.03 2.38-.25 3.75C2.55 5.13 1.95 5.88 1 6v9c.02.27.11.48.31.69.2.21.42.3.69.31h11c.27-.02.48-.11.69-.31.21-.2.3-.42.31-.69V6c-.95-.13-1.53-.88-1.75-2.25h.02zM13 15H2V7c.89-.5 1.48-1.25 1.72-2.25S4.03 2.5 4 1h1c-.02.78.16 1.47.52 2.06.36.58 1.02.89 2 .94.98-.02 1.64-.33 2-.94.36-.59.5-1.28.48-2.06h1c.02 1.42.13 2.55.33 3.38.2.81.69 2 1.67 2.63v8V15zM8.5 6l-.5.5v5l.5.5h2l.5-.5v-5l-.5-.5h-2zm1.5 5H9V7h1v4z"}};

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

  const EMOJI_MAP = {"100":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4af.png?v5","1234":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f522.png?v5","+1":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f44d.png?v5","-1":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f44e.png?v5","8ball":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3b1.png?v5","a":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f170.png?v5","ab":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f18e.png?v5","abc":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f524.png?v5","abcd":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f521.png?v5","accept":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f251.png?v5","aerial_tramway":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6a1.png?v5","airplane":"https://assets-cdn.github.com/images/icons/emoji/unicode/2708.png?v5","alarm_clock":"https://assets-cdn.github.com/images/icons/emoji/unicode/23f0.png?v5","alien":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f47d.png?v5","ambulance":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f691.png?v5","anchor":"https://assets-cdn.github.com/images/icons/emoji/unicode/2693.png?v5","angel":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f47c.png?v5","anger":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a2.png?v5","angry":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f620.png?v5","anguished":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f627.png?v5","ant":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f41c.png?v5","apple":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f34e.png?v5","aquarius":"https://assets-cdn.github.com/images/icons/emoji/unicode/2652.png?v5","aries":"https://assets-cdn.github.com/images/icons/emoji/unicode/2648.png?v5","arrow_backward":"https://assets-cdn.github.com/images/icons/emoji/unicode/25c0.png?v5","arrow_double_down":"https://assets-cdn.github.com/images/icons/emoji/unicode/23ec.png?v5","arrow_double_up":"https://assets-cdn.github.com/images/icons/emoji/unicode/23eb.png?v5","arrow_down":"https://assets-cdn.github.com/images/icons/emoji/unicode/2b07.png?v5","arrow_down_small":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f53d.png?v5","arrow_forward":"https://assets-cdn.github.com/images/icons/emoji/unicode/25b6.png?v5","arrow_heading_down":"https://assets-cdn.github.com/images/icons/emoji/unicode/2935.png?v5","arrow_heading_up":"https://assets-cdn.github.com/images/icons/emoji/unicode/2934.png?v5","arrow_left":"https://assets-cdn.github.com/images/icons/emoji/unicode/2b05.png?v5","arrow_lower_left":"https://assets-cdn.github.com/images/icons/emoji/unicode/2199.png?v5","arrow_lower_right":"https://assets-cdn.github.com/images/icons/emoji/unicode/2198.png?v5","arrow_right":"https://assets-cdn.github.com/images/icons/emoji/unicode/27a1.png?v5","arrow_right_hook":"https://assets-cdn.github.com/images/icons/emoji/unicode/21aa.png?v5","arrow_up":"https://assets-cdn.github.com/images/icons/emoji/unicode/2b06.png?v5","arrow_up_down":"https://assets-cdn.github.com/images/icons/emoji/unicode/2195.png?v5","arrow_up_small":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f53c.png?v5","arrow_upper_left":"https://assets-cdn.github.com/images/icons/emoji/unicode/2196.png?v5","arrow_upper_right":"https://assets-cdn.github.com/images/icons/emoji/unicode/2197.png?v5","arrows_clockwise":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f503.png?v5","arrows_counterclockwise":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f504.png?v5","art":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3a8.png?v5","articulated_lorry":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f69b.png?v5","astonished":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f632.png?v5","athletic_shoe":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f45f.png?v5","atm":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3e7.png?v5","b":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f171.png?v5","baby":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f476.png?v5","baby_bottle":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f37c.png?v5","baby_chick":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f424.png?v5","baby_symbol":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6bc.png?v5","back":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f519.png?v5","baggage_claim":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6c4.png?v5","balloon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f388.png?v5","ballot_box_with_check":"https://assets-cdn.github.com/images/icons/emoji/unicode/2611.png?v5","bamboo":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f38d.png?v5","banana":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f34c.png?v5","bangbang":"https://assets-cdn.github.com/images/icons/emoji/unicode/203c.png?v5","bank":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3e6.png?v5","bar_chart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ca.png?v5","barber":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f488.png?v5","baseball":"https://assets-cdn.github.com/images/icons/emoji/unicode/26be.png?v5","basketball":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3c0.png?v5","bath":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6c0.png?v5","bathtub":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6c1.png?v5","battery":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f50b.png?v5","bear":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f43b.png?v5","bee":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f41d.png?v5","beer":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f37a.png?v5","beers":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f37b.png?v5","beetle":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f41e.png?v5","beginner":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f530.png?v5","bell":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f514.png?v5","bento":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f371.png?v5","bicyclist":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6b4.png?v5","bike":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6b2.png?v5","bikini":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f459.png?v5","bird":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f426.png?v5","birthday":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f382.png?v5","black_circle":"https://assets-cdn.github.com/images/icons/emoji/unicode/26ab.png?v5","black_joker":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f0cf.png?v5","black_large_square":"https://assets-cdn.github.com/images/icons/emoji/unicode/2b1b.png?v5","black_medium_small_square":"https://assets-cdn.github.com/images/icons/emoji/unicode/25fe.png?v5","black_medium_square":"https://assets-cdn.github.com/images/icons/emoji/unicode/25fc.png?v5","black_nib":"https://assets-cdn.github.com/images/icons/emoji/unicode/2712.png?v5","black_small_square":"https://assets-cdn.github.com/images/icons/emoji/unicode/25aa.png?v5","black_square_button":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f532.png?v5","blossom":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f33c.png?v5","blowfish":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f421.png?v5","blue_book":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d8.png?v5","blue_car":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f699.png?v5","blue_heart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f499.png?v5","blush":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f60a.png?v5","boar":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f417.png?v5","boat":"https://assets-cdn.github.com/images/icons/emoji/unicode/26f5.png?v5","bomb":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a3.png?v5","book":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d6.png?v5","bookmark":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f516.png?v5","bookmark_tabs":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d1.png?v5","books":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4da.png?v5","boom":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a5.png?v5","boot":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f462.png?v5","bouquet":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f490.png?v5","bow":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f647.png?v5","bowling":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3b3.png?v5","bowtie":"https://assets-cdn.github.com/images/icons/emoji/bowtie.png?v5","boy":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f466.png?v5","bread":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f35e.png?v5","bride_with_veil":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f470.png?v5","bridge_at_night":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f309.png?v5","briefcase":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4bc.png?v5","broken_heart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f494.png?v5","bug":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f41b.png?v5","bulb":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a1.png?v5","bullettrain_front":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f685.png?v5","bullettrain_side":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f684.png?v5","bus":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f68c.png?v5","busstop":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f68f.png?v5","bust_in_silhouette":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f464.png?v5","busts_in_silhouette":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f465.png?v5","cactus":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f335.png?v5","cake":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f370.png?v5","calendar":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4c6.png?v5","calling":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4f2.png?v5","camel":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f42b.png?v5","camera":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4f7.png?v5","cancer":"https://assets-cdn.github.com/images/icons/emoji/unicode/264b.png?v5","candy":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f36c.png?v5","capital_abcd":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f520.png?v5","capricorn":"https://assets-cdn.github.com/images/icons/emoji/unicode/2651.png?v5","car":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f697.png?v5","card_index":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4c7.png?v5","carousel_horse":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3a0.png?v5","cat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f431.png?v5","cat2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f408.png?v5","cd":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4bf.png?v5","chart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4b9.png?v5","chart_with_downwards_trend":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4c9.png?v5","chart_with_upwards_trend":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4c8.png?v5","checkered_flag":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3c1.png?v5","cherries":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f352.png?v5","cherry_blossom":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f338.png?v5","chestnut":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f330.png?v5","chicken":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f414.png?v5","children_crossing":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6b8.png?v5","chocolate_bar":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f36b.png?v5","christmas_tree":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f384.png?v5","church":"https://assets-cdn.github.com/images/icons/emoji/unicode/26ea.png?v5","cinema":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3a6.png?v5","circus_tent":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3aa.png?v5","city_sunrise":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f307.png?v5","city_sunset":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f306.png?v5","cl":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f191.png?v5","clap":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f44f.png?v5","clapper":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ac.png?v5","clipboard":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4cb.png?v5","clock1":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f550.png?v5","clock10":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f559.png?v5","clock1030":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f565.png?v5","clock11":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f55a.png?v5","clock1130":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f566.png?v5","clock12":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f55b.png?v5","clock1230":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f567.png?v5","clock130":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f55c.png?v5","clock2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f551.png?v5","clock230":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f55d.png?v5","clock3":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f552.png?v5","clock330":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f55e.png?v5","clock4":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f553.png?v5","clock430":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f55f.png?v5","clock5":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f554.png?v5","clock530":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f560.png?v5","clock6":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f555.png?v5","clock630":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f561.png?v5","clock7":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f556.png?v5","clock730":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f562.png?v5","clock8":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f557.png?v5","clock830":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f563.png?v5","clock9":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f558.png?v5","clock930":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f564.png?v5","closed_book":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d5.png?v5","closed_lock_with_key":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f510.png?v5","closed_umbrella":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f302.png?v5","cloud":"https://assets-cdn.github.com/images/icons/emoji/unicode/2601.png?v5","clubs":"https://assets-cdn.github.com/images/icons/emoji/unicode/2663.png?v5","cn":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1e8-1f1f3.png?v5","cocktail":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f378.png?v5","coffee":"https://assets-cdn.github.com/images/icons/emoji/unicode/2615.png?v5","cold_sweat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f630.png?v5","collision":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a5.png?v5","computer":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4bb.png?v5","confetti_ball":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f38a.png?v5","confounded":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f616.png?v5","confused":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f615.png?v5","congratulations":"https://assets-cdn.github.com/images/icons/emoji/unicode/3297.png?v5","construction":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6a7.png?v5","construction_worker":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f477.png?v5","convenience_store":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ea.png?v5","cookie":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f36a.png?v5","cool":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f192.png?v5","cop":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f46e.png?v5","copyright":"https://assets-cdn.github.com/images/icons/emoji/unicode/00a9.png?v5","corn":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f33d.png?v5","couple":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f46b.png?v5","couple_with_heart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f491.png?v5","couplekiss":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f48f.png?v5","cow":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f42e.png?v5","cow2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f404.png?v5","credit_card":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4b3.png?v5","crescent_moon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f319.png?v5","crocodile":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f40a.png?v5","crossed_flags":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f38c.png?v5","crown":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f451.png?v5","cry":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f622.png?v5","crying_cat_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f63f.png?v5","crystal_ball":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f52e.png?v5","cupid":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f498.png?v5","curly_loop":"https://assets-cdn.github.com/images/icons/emoji/unicode/27b0.png?v5","currency_exchange":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4b1.png?v5","curry":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f35b.png?v5","custard":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f36e.png?v5","customs":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6c3.png?v5","cyclone":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f300.png?v5","dancer":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f483.png?v5","dancers":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f46f.png?v5","dango":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f361.png?v5","dart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3af.png?v5","dash":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a8.png?v5","date":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4c5.png?v5","de":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1e9-1f1ea.png?v5","deciduous_tree":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f333.png?v5","department_store":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ec.png?v5","diamond_shape_with_a_dot_inside":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a0.png?v5","diamonds":"https://assets-cdn.github.com/images/icons/emoji/unicode/2666.png?v5","disappointed":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f61e.png?v5","disappointed_relieved":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f625.png?v5","dizzy":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ab.png?v5","dizzy_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f635.png?v5","do_not_litter":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6af.png?v5","dog":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f436.png?v5","dog2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f415.png?v5","dollar":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4b5.png?v5","dolls":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f38e.png?v5","dolphin":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f42c.png?v5","door":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6aa.png?v5","doughnut":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f369.png?v5","dragon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f409.png?v5","dragon_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f432.png?v5","dress":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f457.png?v5","dromedary_camel":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f42a.png?v5","droplet":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a7.png?v5","dvd":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4c0.png?v5","e-mail":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4e7.png?v5","ear":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f442.png?v5","ear_of_rice":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f33e.png?v5","earth_africa":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f30d.png?v5","earth_americas":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f30e.png?v5","earth_asia":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f30f.png?v5","egg":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f373.png?v5","eggplant":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f346.png?v5","eight":"https://assets-cdn.github.com/images/icons/emoji/unicode/0038-20e3.png?v5","eight_pointed_black_star":"https://assets-cdn.github.com/images/icons/emoji/unicode/2734.png?v5","eight_spoked_asterisk":"https://assets-cdn.github.com/images/icons/emoji/unicode/2733.png?v5","electric_plug":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f50c.png?v5","elephant":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f418.png?v5","email":"https://assets-cdn.github.com/images/icons/emoji/unicode/2709.png?v5","end":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f51a.png?v5","envelope":"https://assets-cdn.github.com/images/icons/emoji/unicode/2709.png?v5","envelope_with_arrow":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4e9.png?v5","es":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1ea-1f1f8.png?v5","euro":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4b6.png?v5","european_castle":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3f0.png?v5","european_post_office":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3e4.png?v5","evergreen_tree":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f332.png?v5","exclamation":"https://assets-cdn.github.com/images/icons/emoji/unicode/2757.png?v5","expressionless":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f611.png?v5","eyeglasses":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f453.png?v5","eyes":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f440.png?v5","facepunch":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f44a.png?v5","factory":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ed.png?v5","fallen_leaf":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f342.png?v5","family":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f46a.png?v5","fast_forward":"https://assets-cdn.github.com/images/icons/emoji/unicode/23e9.png?v5","fax":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4e0.png?v5","fearful":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f628.png?v5","feelsgood":"https://assets-cdn.github.com/images/icons/emoji/feelsgood.png?v5","feet":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f43e.png?v5","ferris_wheel":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3a1.png?v5","file_folder":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4c1.png?v5","finnadie":"https://assets-cdn.github.com/images/icons/emoji/finnadie.png?v5","fire":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f525.png?v5","fire_engine":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f692.png?v5","fireworks":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f386.png?v5","first_quarter_moon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f313.png?v5","first_quarter_moon_with_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f31b.png?v5","fish":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f41f.png?v5","fish_cake":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f365.png?v5","fishing_pole_and_fish":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3a3.png?v5","fist":"https://assets-cdn.github.com/images/icons/emoji/unicode/270a.png?v5","five":"https://assets-cdn.github.com/images/icons/emoji/unicode/0035-20e3.png?v5","flags":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f38f.png?v5","flashlight":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f526.png?v5","flipper":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f42c.png?v5","floppy_disk":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4be.png?v5","flower_playing_cards":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3b4.png?v5","flushed":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f633.png?v5","foggy":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f301.png?v5","football":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3c8.png?v5","footprints":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f463.png?v5","fork_and_knife":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f374.png?v5","fountain":"https://assets-cdn.github.com/images/icons/emoji/unicode/26f2.png?v5","four":"https://assets-cdn.github.com/images/icons/emoji/unicode/0034-20e3.png?v5","four_leaf_clover":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f340.png?v5","fr":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1eb-1f1f7.png?v5","free":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f193.png?v5","fried_shrimp":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f364.png?v5","fries":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f35f.png?v5","frog":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f438.png?v5","frowning":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f626.png?v5","fu":"https://assets-cdn.github.com/images/icons/emoji/fu.png?v5","fuelpump":"https://assets-cdn.github.com/images/icons/emoji/unicode/26fd.png?v5","full_moon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f315.png?v5","full_moon_with_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f31d.png?v5","game_die":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3b2.png?v5","gb":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1ec-1f1e7.png?v5","gem":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f48e.png?v5","gemini":"https://assets-cdn.github.com/images/icons/emoji/unicode/264a.png?v5","ghost":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f47b.png?v5","gift":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f381.png?v5","gift_heart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f49d.png?v5","girl":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f467.png?v5","globe_with_meridians":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f310.png?v5","goat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f410.png?v5","goberserk":"https://assets-cdn.github.com/images/icons/emoji/goberserk.png?v5","godmode":"https://assets-cdn.github.com/images/icons/emoji/godmode.png?v5","golf":"https://assets-cdn.github.com/images/icons/emoji/unicode/26f3.png?v5","grapes":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f347.png?v5","green_apple":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f34f.png?v5","green_book":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d7.png?v5","green_heart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f49a.png?v5","grey_exclamation":"https://assets-cdn.github.com/images/icons/emoji/unicode/2755.png?v5","grey_question":"https://assets-cdn.github.com/images/icons/emoji/unicode/2754.png?v5","grimacing":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f62c.png?v5","grin":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f601.png?v5","grinning":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f600.png?v5","guardsman":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f482.png?v5","guitar":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3b8.png?v5","gun":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f52b.png?v5","haircut":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f487.png?v5","hamburger":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f354.png?v5","hammer":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f528.png?v5","hamster":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f439.png?v5","hand":"https://assets-cdn.github.com/images/icons/emoji/unicode/270b.png?v5","handbag":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f45c.png?v5","hankey":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a9.png?v5","hash":"https://assets-cdn.github.com/images/icons/emoji/unicode/0023-20e3.png?v5","hatched_chick":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f425.png?v5","hatching_chick":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f423.png?v5","headphones":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3a7.png?v5","hear_no_evil":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f649.png?v5","heart":"https://assets-cdn.github.com/images/icons/emoji/unicode/2764.png?v5","heart_decoration":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f49f.png?v5","heart_eyes":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f60d.png?v5","heart_eyes_cat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f63b.png?v5","heartbeat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f493.png?v5","heartpulse":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f497.png?v5","hearts":"https://assets-cdn.github.com/images/icons/emoji/unicode/2665.png?v5","heavy_check_mark":"https://assets-cdn.github.com/images/icons/emoji/unicode/2714.png?v5","heavy_division_sign":"https://assets-cdn.github.com/images/icons/emoji/unicode/2797.png?v5","heavy_dollar_sign":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4b2.png?v5","heavy_exclamation_mark":"https://assets-cdn.github.com/images/icons/emoji/unicode/2757.png?v5","heavy_minus_sign":"https://assets-cdn.github.com/images/icons/emoji/unicode/2796.png?v5","heavy_multiplication_x":"https://assets-cdn.github.com/images/icons/emoji/unicode/2716.png?v5","heavy_plus_sign":"https://assets-cdn.github.com/images/icons/emoji/unicode/2795.png?v5","helicopter":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f681.png?v5","herb":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f33f.png?v5","hibiscus":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f33a.png?v5","high_brightness":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f506.png?v5","high_heel":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f460.png?v5","hocho":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f52a.png?v5","honey_pot":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f36f.png?v5","honeybee":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f41d.png?v5","horse":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f434.png?v5","horse_racing":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3c7.png?v5","hospital":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3e5.png?v5","hotel":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3e8.png?v5","hotsprings":"https://assets-cdn.github.com/images/icons/emoji/unicode/2668.png?v5","hourglass":"https://assets-cdn.github.com/images/icons/emoji/unicode/231b.png?v5","hourglass_flowing_sand":"https://assets-cdn.github.com/images/icons/emoji/unicode/23f3.png?v5","house":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3e0.png?v5","house_with_garden":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3e1.png?v5","hurtrealbad":"https://assets-cdn.github.com/images/icons/emoji/hurtrealbad.png?v5","hushed":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f62f.png?v5","ice_cream":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f368.png?v5","icecream":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f366.png?v5","id":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f194.png?v5","ideograph_advantage":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f250.png?v5","imp":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f47f.png?v5","inbox_tray":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4e5.png?v5","incoming_envelope":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4e8.png?v5","information_desk_person":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f481.png?v5","information_source":"https://assets-cdn.github.com/images/icons/emoji/unicode/2139.png?v5","innocent":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f607.png?v5","interrobang":"https://assets-cdn.github.com/images/icons/emoji/unicode/2049.png?v5","iphone":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4f1.png?v5","it":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1ee-1f1f9.png?v5","izakaya_lantern":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ee.png?v5","jack_o_lantern":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f383.png?v5","japan":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f5fe.png?v5","japanese_castle":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ef.png?v5","japanese_goblin":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f47a.png?v5","japanese_ogre":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f479.png?v5","jeans":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f456.png?v5","joy":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f602.png?v5","joy_cat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f639.png?v5","jp":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1ef-1f1f5.png?v5","key":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f511.png?v5","keycap_ten":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f51f.png?v5","kimono":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f458.png?v5","kiss":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f48b.png?v5","kissing":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f617.png?v5","kissing_cat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f63d.png?v5","kissing_closed_eyes":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f61a.png?v5","kissing_heart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f618.png?v5","kissing_smiling_eyes":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f619.png?v5","knife":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f52a.png?v5","koala":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f428.png?v5","koko":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f201.png?v5","kr":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1f0-1f1f7.png?v5","lantern":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ee.png?v5","large_blue_circle":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f535.png?v5","large_blue_diamond":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f537.png?v5","large_orange_diamond":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f536.png?v5","last_quarter_moon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f317.png?v5","last_quarter_moon_with_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f31c.png?v5","laughing":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f606.png?v5","leaves":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f343.png?v5","ledger":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d2.png?v5","left_luggage":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6c5.png?v5","left_right_arrow":"https://assets-cdn.github.com/images/icons/emoji/unicode/2194.png?v5","leftwards_arrow_with_hook":"https://assets-cdn.github.com/images/icons/emoji/unicode/21a9.png?v5","lemon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f34b.png?v5","leo":"https://assets-cdn.github.com/images/icons/emoji/unicode/264c.png?v5","leopard":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f406.png?v5","libra":"https://assets-cdn.github.com/images/icons/emoji/unicode/264e.png?v5","light_rail":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f688.png?v5","link":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f517.png?v5","lips":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f444.png?v5","lipstick":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f484.png?v5","lock":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f512.png?v5","lock_with_ink_pen":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f50f.png?v5","lollipop":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f36d.png?v5","loop":"https://assets-cdn.github.com/images/icons/emoji/unicode/27bf.png?v5","loud_sound":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f50a.png?v5","loudspeaker":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4e2.png?v5","love_hotel":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3e9.png?v5","love_letter":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f48c.png?v5","low_brightness":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f505.png?v5","m":"https://assets-cdn.github.com/images/icons/emoji/unicode/24c2.png?v5","mag":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f50d.png?v5","mag_right":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f50e.png?v5","mahjong":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f004.png?v5","mailbox":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4eb.png?v5","mailbox_closed":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ea.png?v5","mailbox_with_mail":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ec.png?v5","mailbox_with_no_mail":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ed.png?v5","man":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f468.png?v5","man_with_gua_pi_mao":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f472.png?v5","man_with_turban":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f473.png?v5","mans_shoe":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f45e.png?v5","maple_leaf":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f341.png?v5","mask":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f637.png?v5","massage":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f486.png?v5","meat_on_bone":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f356.png?v5","mega":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4e3.png?v5","melon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f348.png?v5","memo":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4dd.png?v5","mens":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6b9.png?v5","metal":"https://assets-cdn.github.com/images/icons/emoji/metal.png?v5","metro":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f687.png?v5","microphone":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3a4.png?v5","microscope":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f52c.png?v5","milky_way":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f30c.png?v5","minibus":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f690.png?v5","minidisc":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4bd.png?v5","mobile_phone_off":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4f4.png?v5","money_with_wings":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4b8.png?v5","moneybag":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4b0.png?v5","monkey":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f412.png?v5","monkey_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f435.png?v5","monorail":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f69d.png?v5","moon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f314.png?v5","mortar_board":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f393.png?v5","mount_fuji":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f5fb.png?v5","mountain_bicyclist":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6b5.png?v5","mountain_cableway":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6a0.png?v5","mountain_railway":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f69e.png?v5","mouse":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f42d.png?v5","mouse2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f401.png?v5","movie_camera":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3a5.png?v5","moyai":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f5ff.png?v5","muscle":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4aa.png?v5","mushroom":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f344.png?v5","musical_keyboard":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3b9.png?v5","musical_note":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3b5.png?v5","musical_score":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3bc.png?v5","mute":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f507.png?v5","nail_care":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f485.png?v5","name_badge":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4db.png?v5","neckbeard":"https://assets-cdn.github.com/images/icons/emoji/neckbeard.png?v5","necktie":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f454.png?v5","negative_squared_cross_mark":"https://assets-cdn.github.com/images/icons/emoji/unicode/274e.png?v5","neutral_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f610.png?v5","new":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f195.png?v5","new_moon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f311.png?v5","new_moon_with_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f31a.png?v5","newspaper":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4f0.png?v5","ng":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f196.png?v5","night_with_stars":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f303.png?v5","nine":"https://assets-cdn.github.com/images/icons/emoji/unicode/0039-20e3.png?v5","no_bell":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f515.png?v5","no_bicycles":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6b3.png?v5","no_entry":"https://assets-cdn.github.com/images/icons/emoji/unicode/26d4.png?v5","no_entry_sign":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6ab.png?v5","no_good":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f645.png?v5","no_mobile_phones":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4f5.png?v5","no_mouth":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f636.png?v5","no_pedestrians":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6b7.png?v5","no_smoking":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6ad.png?v5","non-potable_water":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6b1.png?v5","nose":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f443.png?v5","notebook":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d3.png?v5","notebook_with_decorative_cover":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d4.png?v5","notes":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3b6.png?v5","nut_and_bolt":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f529.png?v5","o":"https://assets-cdn.github.com/images/icons/emoji/unicode/2b55.png?v5","o2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f17e.png?v5","ocean":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f30a.png?v5","octocat":"https://assets-cdn.github.com/images/icons/emoji/octocat.png?v5","octopus":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f419.png?v5","oden":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f362.png?v5","office":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3e2.png?v5","ok":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f197.png?v5","ok_hand":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f44c.png?v5","ok_woman":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f646.png?v5","older_man":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f474.png?v5","older_woman":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f475.png?v5","on":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f51b.png?v5","oncoming_automobile":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f698.png?v5","oncoming_bus":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f68d.png?v5","oncoming_police_car":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f694.png?v5","oncoming_taxi":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f696.png?v5","one":"https://assets-cdn.github.com/images/icons/emoji/unicode/0031-20e3.png?v5","open_book":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d6.png?v5","open_file_folder":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4c2.png?v5","open_hands":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f450.png?v5","open_mouth":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f62e.png?v5","ophiuchus":"https://assets-cdn.github.com/images/icons/emoji/unicode/26ce.png?v5","orange_book":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d9.png?v5","outbox_tray":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4e4.png?v5","ox":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f402.png?v5","package":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4e6.png?v5","page_facing_up":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4c4.png?v5","page_with_curl":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4c3.png?v5","pager":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4df.png?v5","palm_tree":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f334.png?v5","panda_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f43c.png?v5","paperclip":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ce.png?v5","parking":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f17f.png?v5","part_alternation_mark":"https://assets-cdn.github.com/images/icons/emoji/unicode/303d.png?v5","partly_sunny":"https://assets-cdn.github.com/images/icons/emoji/unicode/26c5.png?v5","passport_control":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6c2.png?v5","paw_prints":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f43e.png?v5","peach":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f351.png?v5","pear":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f350.png?v5","pencil":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4dd.png?v5","pencil2":"https://assets-cdn.github.com/images/icons/emoji/unicode/270f.png?v5","penguin":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f427.png?v5","pensive":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f614.png?v5","performing_arts":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ad.png?v5","persevere":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f623.png?v5","person_frowning":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f64d.png?v5","person_with_blond_hair":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f471.png?v5","person_with_pouting_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f64e.png?v5","phone":"https://assets-cdn.github.com/images/icons/emoji/unicode/260e.png?v5","pig":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f437.png?v5","pig2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f416.png?v5","pig_nose":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f43d.png?v5","pill":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f48a.png?v5","pineapple":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f34d.png?v5","pisces":"https://assets-cdn.github.com/images/icons/emoji/unicode/2653.png?v5","pizza":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f355.png?v5","point_down":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f447.png?v5","point_left":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f448.png?v5","point_right":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f449.png?v5","point_up":"https://assets-cdn.github.com/images/icons/emoji/unicode/261d.png?v5","point_up_2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f446.png?v5","police_car":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f693.png?v5","poodle":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f429.png?v5","poop":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a9.png?v5","post_office":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3e3.png?v5","postal_horn":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ef.png?v5","postbox":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ee.png?v5","potable_water":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6b0.png?v5","pouch":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f45d.png?v5","poultry_leg":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f357.png?v5","pound":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4b7.png?v5","pouting_cat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f63e.png?v5","pray":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f64f.png?v5","princess":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f478.png?v5","punch":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f44a.png?v5","purple_heart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f49c.png?v5","purse":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f45b.png?v5","pushpin":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4cc.png?v5","put_litter_in_its_place":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6ae.png?v5","question":"https://assets-cdn.github.com/images/icons/emoji/unicode/2753.png?v5","rabbit":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f430.png?v5","rabbit2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f407.png?v5","racehorse":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f40e.png?v5","radio":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4fb.png?v5","radio_button":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f518.png?v5","rage":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f621.png?v5","rage1":"https://assets-cdn.github.com/images/icons/emoji/rage1.png?v5","rage2":"https://assets-cdn.github.com/images/icons/emoji/rage2.png?v5","rage3":"https://assets-cdn.github.com/images/icons/emoji/rage3.png?v5","rage4":"https://assets-cdn.github.com/images/icons/emoji/rage4.png?v5","railway_car":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f683.png?v5","rainbow":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f308.png?v5","raised_hand":"https://assets-cdn.github.com/images/icons/emoji/unicode/270b.png?v5","raised_hands":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f64c.png?v5","raising_hand":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f64b.png?v5","ram":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f40f.png?v5","ramen":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f35c.png?v5","rat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f400.png?v5","recycle":"https://assets-cdn.github.com/images/icons/emoji/unicode/267b.png?v5","red_car":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f697.png?v5","red_circle":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f534.png?v5","registered":"https://assets-cdn.github.com/images/icons/emoji/unicode/00ae.png?v5","relaxed":"https://assets-cdn.github.com/images/icons/emoji/unicode/263a.png?v5","relieved":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f60c.png?v5","repeat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f501.png?v5","repeat_one":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f502.png?v5","restroom":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6bb.png?v5","revolving_hearts":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f49e.png?v5","rewind":"https://assets-cdn.github.com/images/icons/emoji/unicode/23ea.png?v5","ribbon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f380.png?v5","rice":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f35a.png?v5","rice_ball":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f359.png?v5","rice_cracker":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f358.png?v5","rice_scene":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f391.png?v5","ring":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f48d.png?v5","rocket":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f680.png?v5","roller_coaster":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3a2.png?v5","rooster":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f413.png?v5","rose":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f339.png?v5","rotating_light":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6a8.png?v5","round_pushpin":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4cd.png?v5","rowboat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6a3.png?v5","ru":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1f7-1f1fa.png?v5","rugby_football":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3c9.png?v5","runner":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3c3.png?v5","running":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3c3.png?v5","running_shirt_with_sash":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3bd.png?v5","sa":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f202.png?v5","sagittarius":"https://assets-cdn.github.com/images/icons/emoji/unicode/2650.png?v5","sailboat":"https://assets-cdn.github.com/images/icons/emoji/unicode/26f5.png?v5","sake":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f376.png?v5","sandal":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f461.png?v5","santa":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f385.png?v5","satellite":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4e1.png?v5","satisfied":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f606.png?v5","saxophone":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3b7.png?v5","school":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3eb.png?v5","school_satchel":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f392.png?v5","scissors":"https://assets-cdn.github.com/images/icons/emoji/unicode/2702.png?v5","scorpius":"https://assets-cdn.github.com/images/icons/emoji/unicode/264f.png?v5","scream":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f631.png?v5","scream_cat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f640.png?v5","scroll":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4dc.png?v5","seat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ba.png?v5","secret":"https://assets-cdn.github.com/images/icons/emoji/unicode/3299.png?v5","see_no_evil":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f648.png?v5","seedling":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f331.png?v5","seven":"https://assets-cdn.github.com/images/icons/emoji/unicode/0037-20e3.png?v5","shaved_ice":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f367.png?v5","sheep":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f411.png?v5","shell":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f41a.png?v5","ship":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6a2.png?v5","shipit":"https://assets-cdn.github.com/images/icons/emoji/shipit.png?v5","shirt":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f455.png?v5","shit":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a9.png?v5","shoe":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f45e.png?v5","shower":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6bf.png?v5","signal_strength":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4f6.png?v5","six":"https://assets-cdn.github.com/images/icons/emoji/unicode/0036-20e3.png?v5","six_pointed_star":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f52f.png?v5","ski":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3bf.png?v5","skull":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f480.png?v5","sleeping":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f634.png?v5","sleepy":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f62a.png?v5","slot_machine":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3b0.png?v5","small_blue_diamond":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f539.png?v5","small_orange_diamond":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f538.png?v5","small_red_triangle":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f53a.png?v5","small_red_triangle_down":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f53b.png?v5","smile":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f604.png?v5","smile_cat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f638.png?v5","smiley":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f603.png?v5","smiley_cat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f63a.png?v5","smiling_imp":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f608.png?v5","smirk":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f60f.png?v5","smirk_cat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f63c.png?v5","smoking":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6ac.png?v5","snail":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f40c.png?v5","snake":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f40d.png?v5","snowboarder":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3c2.png?v5","snowflake":"https://assets-cdn.github.com/images/icons/emoji/unicode/2744.png?v5","snowman":"https://assets-cdn.github.com/images/icons/emoji/unicode/26c4.png?v5","sob":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f62d.png?v5","soccer":"https://assets-cdn.github.com/images/icons/emoji/unicode/26bd.png?v5","soon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f51c.png?v5","sos":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f198.png?v5","sound":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f509.png?v5","space_invader":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f47e.png?v5","spades":"https://assets-cdn.github.com/images/icons/emoji/unicode/2660.png?v5","spaghetti":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f35d.png?v5","sparkle":"https://assets-cdn.github.com/images/icons/emoji/unicode/2747.png?v5","sparkler":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f387.png?v5","sparkles":"https://assets-cdn.github.com/images/icons/emoji/unicode/2728.png?v5","sparkling_heart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f496.png?v5","speak_no_evil":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f64a.png?v5","speaker":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f508.png?v5","speech_balloon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ac.png?v5","speedboat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6a4.png?v5","squirrel":"https://assets-cdn.github.com/images/icons/emoji/shipit.png?v5","star":"https://assets-cdn.github.com/images/icons/emoji/unicode/2b50.png?v5","star2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f31f.png?v5","stars":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f320.png?v5","station":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f689.png?v5","statue_of_liberty":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f5fd.png?v5","steam_locomotive":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f682.png?v5","stew":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f372.png?v5","straight_ruler":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4cf.png?v5","strawberry":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f353.png?v5","stuck_out_tongue":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f61b.png?v5","stuck_out_tongue_closed_eyes":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f61d.png?v5","stuck_out_tongue_winking_eye":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f61c.png?v5","sun_with_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f31e.png?v5","sunflower":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f33b.png?v5","sunglasses":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f60e.png?v5","sunny":"https://assets-cdn.github.com/images/icons/emoji/unicode/2600.png?v5","sunrise":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f305.png?v5","sunrise_over_mountains":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f304.png?v5","surfer":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3c4.png?v5","sushi":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f363.png?v5","suspect":"https://assets-cdn.github.com/images/icons/emoji/suspect.png?v5","suspension_railway":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f69f.png?v5","sweat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f613.png?v5","sweat_drops":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a6.png?v5","sweat_smile":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f605.png?v5","sweet_potato":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f360.png?v5","swimmer":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ca.png?v5","symbols":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f523.png?v5","syringe":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f489.png?v5","tada":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f389.png?v5","tanabata_tree":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f38b.png?v5","tangerine":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f34a.png?v5","taurus":"https://assets-cdn.github.com/images/icons/emoji/unicode/2649.png?v5","taxi":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f695.png?v5","tea":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f375.png?v5","telephone":"https://assets-cdn.github.com/images/icons/emoji/unicode/260e.png?v5","telephone_receiver":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4de.png?v5","telescope":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f52d.png?v5","tennis":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3be.png?v5","tent":"https://assets-cdn.github.com/images/icons/emoji/unicode/26fa.png?v5","thought_balloon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ad.png?v5","three":"https://assets-cdn.github.com/images/icons/emoji/unicode/0033-20e3.png?v5","thumbsdown":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f44e.png?v5","thumbsup":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f44d.png?v5","ticket":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ab.png?v5","tiger":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f42f.png?v5","tiger2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f405.png?v5","tired_face":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f62b.png?v5","tm":"https://assets-cdn.github.com/images/icons/emoji/unicode/2122.png?v5","toilet":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6bd.png?v5","tokyo_tower":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f5fc.png?v5","tomato":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f345.png?v5","tongue":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f445.png?v5","top":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f51d.png?v5","tophat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3a9.png?v5","tractor":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f69c.png?v5","traffic_light":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6a5.png?v5","train":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f68b.png?v5","train2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f686.png?v5","tram":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f68a.png?v5","triangular_flag_on_post":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6a9.png?v5","triangular_ruler":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4d0.png?v5","trident":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f531.png?v5","triumph":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f624.png?v5","trolleybus":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f68e.png?v5","trollface":"https://assets-cdn.github.com/images/icons/emoji/trollface.png?v5","trophy":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3c6.png?v5","tropical_drink":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f379.png?v5","tropical_fish":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f420.png?v5","truck":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f69a.png?v5","trumpet":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ba.png?v5","tshirt":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f455.png?v5","tulip":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f337.png?v5","turtle":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f422.png?v5","tv":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4fa.png?v5","twisted_rightwards_arrows":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f500.png?v5","two":"https://assets-cdn.github.com/images/icons/emoji/unicode/0032-20e3.png?v5","two_hearts":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f495.png?v5","two_men_holding_hands":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f46c.png?v5","two_women_holding_hands":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f46d.png?v5","u5272":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f239.png?v5","u5408":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f234.png?v5","u55b6":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f23a.png?v5","u6307":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f22f.png?v5","u6708":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f237.png?v5","u6709":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f236.png?v5","u6e80":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f235.png?v5","u7121":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f21a.png?v5","u7533":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f238.png?v5","u7981":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f232.png?v5","u7a7a":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f233.png?v5","uk":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1ec-1f1e7.png?v5","umbrella":"https://assets-cdn.github.com/images/icons/emoji/unicode/2614.png?v5","unamused":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f612.png?v5","underage":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f51e.png?v5","unlock":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f513.png?v5","up":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f199.png?v5","us":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f1fa-1f1f8.png?v5","v":"https://assets-cdn.github.com/images/icons/emoji/unicode/270c.png?v5","vertical_traffic_light":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6a6.png?v5","vhs":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4fc.png?v5","vibration_mode":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4f3.png?v5","video_camera":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4f9.png?v5","video_game":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3ae.png?v5","violin":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f3bb.png?v5","virgo":"https://assets-cdn.github.com/images/icons/emoji/unicode/264d.png?v5","volcano":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f30b.png?v5","vs":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f19a.png?v5","walking":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6b6.png?v5","waning_crescent_moon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f318.png?v5","waning_gibbous_moon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f316.png?v5","warning":"https://assets-cdn.github.com/images/icons/emoji/unicode/26a0.png?v5","watch":"https://assets-cdn.github.com/images/icons/emoji/unicode/231a.png?v5","water_buffalo":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f403.png?v5","watermelon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f349.png?v5","wave":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f44b.png?v5","wavy_dash":"https://assets-cdn.github.com/images/icons/emoji/unicode/3030.png?v5","waxing_crescent_moon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f312.png?v5","waxing_gibbous_moon":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f314.png?v5","wc":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6be.png?v5","weary":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f629.png?v5","wedding":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f492.png?v5","whale":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f433.png?v5","whale2":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f40b.png?v5","wheelchair":"https://assets-cdn.github.com/images/icons/emoji/unicode/267f.png?v5","white_check_mark":"https://assets-cdn.github.com/images/icons/emoji/unicode/2705.png?v5","white_circle":"https://assets-cdn.github.com/images/icons/emoji/unicode/26aa.png?v5","white_flower":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4ae.png?v5","white_large_square":"https://assets-cdn.github.com/images/icons/emoji/unicode/2b1c.png?v5","white_medium_small_square":"https://assets-cdn.github.com/images/icons/emoji/unicode/25fd.png?v5","white_medium_square":"https://assets-cdn.github.com/images/icons/emoji/unicode/25fb.png?v5","white_small_square":"https://assets-cdn.github.com/images/icons/emoji/unicode/25ab.png?v5","white_square_button":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f533.png?v5","wind_chime":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f390.png?v5","wine_glass":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f377.png?v5","wink":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f609.png?v5","wolf":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f43a.png?v5","woman":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f469.png?v5","womans_clothes":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f45a.png?v5","womans_hat":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f452.png?v5","womens":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f6ba.png?v5","worried":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f61f.png?v5","wrench":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f527.png?v5","x":"https://assets-cdn.github.com/images/icons/emoji/unicode/274c.png?v5","yellow_heart":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f49b.png?v5","yen":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4b4.png?v5","yum":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f60b.png?v5","zap":"https://assets-cdn.github.com/images/icons/emoji/unicode/26a1.png?v5","zero":"https://assets-cdn.github.com/images/icons/emoji/unicode/0030-20e3.png?v5","zzz":"https://assets-cdn.github.com/images/icons/emoji/unicode/1f4a4.png?v5"};

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

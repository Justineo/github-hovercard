var gulp = require('gulp');
var fs = require('fs');
var path = require('path');
var merge = require('merge-stream');
var del = require('del');
var exec = require('child_process').exec;
var replace = require('gulp-replace');
var rename = require('gulp-rename');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var stylus = require('gulp-stylus');
var cssnano = require('gulp-cssnano');
var buble = require('gulp-buble');
var DataURI = require('datauri');
var marked = require('marked');
var cheerio = require('cheerio');
var plist = require('plist');
var pack = require('./package.json');
var octicons = require('@primer/octicons');
var version = pack.version;

function getCommentHandler() {
  var inMetaBlock = false;
  return function (node, comment) {
    var value = comment.value.trim();
    if (comment.type === 'comment2' && value.charAt(0) === '!') {
      return true;
    }
    if (value === '==UserScript==') {
      inMetaBlock = true;
      return true;
    }
    if (value === '==/UserScript==') {
      inMetaBlock = false;
      return true;
    }
    return inMetaBlock;
  }
}

gulp.task('icons', function (cb) {
  var used = [
    'alert', 'arrow-right', 'code', 'diff', 'git-commit', 'git-pull-request',
    'info', 'issue-closed', 'issue-opened', 'link', 'location', 'organization',
    'person', 'repo-forked', 'repo', 'git-branch', 'tag', 'bookmark', 'star',
    'verified', 'key', 'check', 'dot-fill', 'comment', 'comment-discussion',
    'clock', 'rocket'
  ];

  var data = used.map(function (name) {
    var icon = octicons[name];
    var instance = icon.heights['16']
    var data = {};
    data[name] = {
      width: instance.width,
      height: 16,
      path: instance.path
    };
    return data;
  }).reduce(function (acc, val) {
    return Object.assign(acc, val)
  }, {});

  fs.writeFileSync('./assets/octicons.json', JSON.stringify(data, null, '  '));
  cb();
});

gulp.task('css:prepare', function () {
  return gulp.src('./src/tooltipster.css')
    .pipe(replace(
      'spinner.gif', new DataURI('./assets/spinner.gif').content
    ))
    .pipe(gulp.dest('./tmp'));
});

gulp.task('css:compile', function () {
  return gulp.src('./src/*.styl')
    .pipe(stylus())
    .pipe(gulp.dest('./src'));
});

gulp.task('css', gulp.series('css:prepare', 'css:compile'));

gulp.task('resource:inline', gulp.series('icons', function () {
  return gulp.src('./src/hovercard.js')
    .pipe(replace('\'__OCTICONS__\'', JSON.stringify(require('./assets/octicons.json'))))
    .pipe(replace('\'__EMOJI_DATA__\'', JSON.stringify(require('./assets/emoji.json'))))
    .pipe(gulp.dest('./tmp'));
}));

gulp.task('userscript:prepare', gulp.series('resource:inline', function () {
  var hovercard = gulp.src('./tmp/hovercard.js')
    .pipe(buble({
      transforms: {
        dangerousTaggedTemplateString: true
      }
    }))
    .pipe(rename('hovercard.userscript.js'))
    .pipe(gulp.dest('./tmp'));
  var meta = gulp.src('./userscript/src/metadata.js')
    .pipe(replace('{{version}}', version))
    .pipe(gulp.dest('./tmp'));
  return merge(hovercard, meta);
}));

gulp.task('userscript:styles', gulp.series('css', function () {
  return gulp.src([
      './tmp/tooltipster.css',
      './src/hovercard.css',
      './src/tomorrow-night.css'
    ])
    .pipe(concat('userscript.css'))
    .pipe(cssnano({ zindex: false }))
    .pipe(gulp.dest('./tmp'));
}));

gulp.task('userscript:inject-styles', gulp.series('userscript:styles', function () {
  return gulp.src('./userscript/src/inject-styles.js')
    .pipe(replace('__USER_SCRIPT_STYLES__', fs.readFileSync('./tmp/userscript.css', { encoding: 'utf8' }).replace(/'/g, '\\\'')))
    .pipe(gulp.dest('./tmp'));
}));

gulp.task('userscript', gulp.series('userscript:inject-styles', 'userscript:prepare', function () {
  return gulp.src([
      './tmp/metadata.js',
      './tmp/inject-styles.js',
      './src/jquery.js',
      './src/mustache.js',
      './src/tooltipster.js',
      './src/tripleclick.js',
      './tmp/hovercard.userscript.js'
    ])
    .pipe(concat('github-hovercard.user.js'))
    .pipe(uglify({
      preserveComments: getCommentHandler()
    }))
    .pipe(gulp.dest('./userscript/dist'));
}));

gulp.task('chrome:cp', gulp.series('resource:inline', 'css', 'icons', function () {
  var manifestPath = './extensions/chrome/manifest.json';
  var manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf8' }));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '  '));

  var targets = [
    './src/*', '!./src/hovercard.js', './tmp/hovercard.js', '!./src/*.styl',
    '!./src/tooltipster.css', './tmp/tooltipster.css', './icon.png'
  ];
  return gulp.src(targets)
    .pipe(gulp.dest('./extensions/chrome'));
}));

gulp.task('firefox:cp', gulp.series('resource:inline', 'css', 'icons', function () {
  var manifestPath = './extensions/firefox/manifest.json';
  var manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf8' }));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '  '));

  var targets = [
    './src/*', '!./src/hovercard.js', './tmp/hovercard.js', '!./src/*.styl',
    '!./src/tooltipster.css', './tmp/tooltipster.css', './icon.png'
  ];
  return gulp.src(targets)
    .pipe(gulp.dest('./extensions/firefox'));
}));

gulp.task('safari:cp', gulp.series('resource:inline', 'css', 'icons', function () {
  var infoPath = './extensions/github-hovercard.safariextension/Info.plist';
  var info = plist.parse(fs.readFileSync(infoPath, { encoding: 'utf8' }));
  info.CFBundleShortVersionString = version;
  info.CFBundleVersion = version;
  fs.writeFileSync(infoPath, plist.build(info));

  var targets = [
    './src/*', '!./src/hovercard.js', './tmp/hovercard.js', '!./src/*.styl',
    '!./src/tooltipster.css', './tmp/tooltipster.css', './icon.png'
  ];
  return gulp.src(targets)
    .pipe(gulp.dest('./extensions/github-hovercard.safariextension'));
}));

gulp.task('edge:hack', gulp.series('resource:inline', function () {
  return gulp.src(['./tmp/hovercard.js'])
    .pipe(replace('$(() => {', 'document.addEventListener(\'DOMContentLoaded\', () => {'))
    .pipe(gulp.dest('./extensions/edge'));
}));

gulp.task('edge:cp', gulp.series('edge:hack', 'css', 'icons', function () {
  var manifestPath = './extensions/edge/manifest.json';
  var manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf8' }));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '  '));

  var targets = [
    './src/*', '!./src/hovercard.js', '!./src/jquery.js', '!./src/*.styl',
    '!./src/tooltipster.css', './tmp/tooltipster.css', './icon.png'
  ];
  return gulp.src(targets)
    .pipe(gulp.dest('./extensions/edge'));
}));

gulp.task('chrome:zip', gulp.series('chrome:cp', function (cb) {
  exec(
    'find . -path \'*/.*\' -prune -o -type f -print | zip ../packed/github-hovercard.chrome.zip -@',
    { cwd: 'extensions/chrome' },
    function (error) {
      if (error) {
        return cb(error);
      } else {
        cb();
      }
    }
  );
}));

gulp.task('firefox:zip', gulp.series('firefox:cp', function (cb) {
  exec(
    'find . -path \'*/.*\' -prune -o -type f -print | zip ../packed/github-hovercard.firefox.zip -@',
    { cwd: 'extensions/firefox' },
    function (error) {
      if (error) {
        return cb(error);
      } else {
        cb();
      }
    }
  );
}));

gulp.task('edge:zip', gulp.series('edge:cp', function (cb) {
  exec(
    'find . -path \'*/.*\' -prune -o -type f -print | zip ../packed/github-hovercard.edge.zip -@',
    { cwd: 'extensions/edge' },
    function (error) {
      if (error) {
        return cb(error);
      } else {
        cb();
      }
    }
  );
}));

gulp.task('opera:nex', gulp.series('chrome:zip', function (cb) {
  exec(''
    + '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"'
    + ' --pack-extension=' + path.join(__dirname, 'extensions/chrome')
    + ' --pack-extension-key=' + path.join(process.env.HOME, '.ssh/chrome.pem')
    + ' --disable-gpu',
    function (error) {
      if (error) {
        return cb(error);
      } else {
        fs.renameSync('./extensions/chrome.crx', './extensions/packed/github-hovercard.nex');
        cb();
      }
    }
  );
}));

gulp.task('demo:prepare', gulp.series('resource:inline', function () {
  var hovercard = gulp.src('./tmp/hovercard.js')
    .pipe(replace('location.host', '\'github.com\''))
    .pipe(buble({
      transforms: {
        dangerousTaggedTemplateString: true
      }
    }))
    .pipe(rename('hovercard.demo.js'))
    .pipe(gulp.dest('./tmp'));

  var demo = gulp.src('./demo/src/demo.js')
    .pipe(buble({
      transforms: {
        dangerousTaggedTemplateString: true
      }
    }))
    .pipe(gulp.dest('./tmp'));

  return merge(hovercard, demo);
}));

gulp.task('demo:index', function () {
  var changelog = fs.readFileSync('./CHANGELOG.md', { encoding: 'utf8' });
  var $ = cheerio.load(marked(changelog));

  return gulp.src('./demo/src/index.html')
    .pipe(replace('${version}', version))
    .pipe(replace('${changes}', '<ul>' + $('h2').eq(1).next().html() + '</ul>'))
    .pipe(gulp.dest('.'));
});

gulp.task('demo', gulp.series('css', 'demo:prepare', 'demo:index', function () {
  var jsSrc = gulp.src([
      './src/jquery.js',
      './src/mustache.js',
      './src/tooltipster.js',
      './src/tripleclick.js',
      './tmp/hovercard.demo.js',
      './tmp/demo.js'
    ])
    .pipe(concat('demo.js'))
    .pipe(uglify({
      preserveComments: getCommentHandler()
    }))
    .pipe(gulp.dest('./demo/dist'));

  var cssSrc = gulp.src([
      './tmp/tooltipster.css',
      './src/hovercard.css',
      './src/tomorrow-night.css',
      './demo/src/demo.css'
    ])
    .pipe(concat('demo.css'))
    .pipe(cssnano({ zindex: false }))
    .pipe(gulp.dest('./demo/dist'));

  return merge(jsSrc, cssSrc);
}));

gulp.task('cleanup', function () {
  return del(['./tmp']);
});

gulp.task('extensions', gulp.series('chrome:zip', 'firefox:zip', 'edge:zip', 'opera:nex', 'safari:cp'));
gulp.task('build', gulp.series('extensions', 'demo', 'userscript'));
gulp.task('default', gulp.series('build', 'cleanup'));

var gulp = require('gulp');
var fs = require('fs');
var path = require('path');
var run = require('run-sequence');
var merge = require('merge-stream');
var del = require('del');
var exec = require('child_process').exec;
var replace = require('gulp-replace');
var rename = require('gulp-rename');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var stylus = require('gulp-stylus');
var cssnano = require('gulp-cssnano');
var babel = require('gulp-babel');
var pack = JSON.parse(fs.readFileSync('./package.json', { encoding: 'utf8' }));
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

gulp.task('css:prepare', function () {
  return gulp.src('./src/tooltipster.css')
    .pipe(replace(
      'spinner.svg',
      '"data:image/svg+xml;utf8,'
        + encodeURIComponent(fs.readFileSync('./assets/spinner.svg', { encoding: 'utf8' }))
        + '"'
    ))
    .pipe(gulp.dest('./tmp'));
});

gulp.task('css:compile', function () {
  return gulp.src('./src/*.styl')
    .pipe(stylus())
    .pipe(gulp.dest('./src'));
});

gulp.task('css', ['css:prepare', 'css:compile']);

gulp.task('cp', ['css', 'hovercard:prepare'], function () {
  var targets = [
    './src/*', '!./src/hovercard.js', './tmp/hovercard.js',
    '!./src/*.styl', '!./src/tooltipster.css', './tmp/tooltipster.css'
  ];
  var srcChrome = gulp.src(targets)
    .pipe(gulp.dest('./extensions/chrome'));
  var srcFirefox = gulp.src(targets)
    .pipe(gulp.dest('./extensions/firefox/data'));
  var icon = gulp.src('./icon.png')
    .pipe(gulp.dest('./extensions/firefox'))
    .pipe(gulp.dest('./extensions/chrome'));
  return merge(srcChrome, srcFirefox, icon);
});

gulp.task('hovercard:prepare', function () {
  return gulp.src('./src/hovercard.js')
    .pipe(replace('\'__EMOJI_DATA__\'', JSON.stringify(require('./assets/emoji.json'))))
    .pipe(gulp.dest('./tmp'));
});

gulp.task('userscript:prepare', ['hovercard:prepare'], function () {
  return gulp.src('./tmp/hovercard.js')
    .pipe(babel({ presets: ['es2015'] }))
    .pipe(rename('hovercard.userscript.js'))
    .pipe(gulp.dest('./tmp'));
});

gulp.task('userscript:styles', ['css'], function () {
  return gulp.src([
      './tmp/tooltipster.css',
      './src/highlight.css',
      './src/hovercard.css'
    ])
    .pipe(concat('userscript.css'))
    .pipe(cssnano({ zindex: false }))
    .pipe(gulp.dest('./tmp'));
});

gulp.task('userscript:inject-styles', ['userscript:styles'], function () {
  return gulp.src('./userscript/src/inject-styles.js')
    .pipe(replace('__USER_SCRIPT_STYLES__', fs.readFileSync('./tmp/userscript.css', { encoding: 'utf8' }).replace(/'/g, '\\\'')))
    .pipe(gulp.dest('./tmp'));
});

gulp.task('userscript', ['userscript:inject-styles', 'userscript:prepare'], function () {
  var inMetaBlock = false;
  return gulp.src([
      './userscript/src/metadata.js',
      './tmp/inject-styles.js',
      // './src/jquery.js',
      './src/mustache.js',
      './src/tooltipster.js',
      './src/remarkable.js',
      './src/highlight.pack.js',
      './src/js-xss.js',
      './tmp/hovercard.userscript.js'
    ])
    .pipe(concat('github-hovercard.user.js'))
    .pipe(uglify({
      preserveComments: getCommentHandler()
    }))
    .pipe(gulp.dest('./userscript/dist'));
});

gulp.task('extensions:prepare', function () {
  return gulp.src([
      './src/hovercard.js'
    ])
    .pipe(replace('\'__EMOJI_DATA__\'', JSON.stringify(require('./assets/emoji.json'))))
    .pipe(gulp.dest('./tmp'));
});

gulp.task('chrome:zip', ['cp'], function (cb) {
  var manifestPath = './extensions/chrome/manifest.json';
  var manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf8' }));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '  '));
  exec(
    'find . -path \'*/.*\' -prune -o -type f -print | zip ../packed/github-hovercard.zip -@',
    { cwd: 'extensions/chrome' },
    function (error, stdout, stderr) {
      if (error) {
        return cb(error);
      } else {
        cb();
      }
    }
  );
});

gulp.task('firefox:xpi', ['cp'], function (cb) {
  var fxPackPath = './extensions/firefox/package.json';
  var fxPack = JSON.parse(fs.readFileSync(fxPackPath, { encoding: 'utf8' }));
  fxPack.version = version;
  fs.writeFileSync(fxPackPath, JSON.stringify(fxPack, null, '  '));
  exec('jpm xpi', {
    cwd: 'extensions/firefox'
  }, function (error, stdout, stderr) {
    if (error) {
      return cb(error);
    } else {
      fs.renameSync('./extensions/firefox/@' + pack.name + '-' + version + '.xpi', './extensions/packed/' + pack.name + '.xpi');
      cb();
    }
  });
});

gulp.task('opera:nex', ['chrome:zip'], function (cb) {
  exec(''
    + '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"'
    + ' --pack-extension=' + path.join(__dirname, 'extensions/chrome')
    + ' --pack-extension-key=' + path.join(process.env.HOME, '.ssh/chrome.pem'),
    function (error, stdout, stderr) {
      if (error) {
        return cb(error);
      } else {
        fs.renameSync('./extensions/chrome.crx', './extensions/packed/github-hovercard.nex');
        cb();
      }
    }
  );
});

gulp.task('demo:prepare', ['hovercard:prepare'], function () {
  var hovercard = gulp.src('./tmp/hovercard.js')
    .pipe(replace('location.host', '\'github.com\''))
    .pipe(babel({ presets: ['es2015'] }))
    .pipe(rename('hovercard.demo.js'))
    .pipe(gulp.dest('./tmp'));

  var demo = gulp.src('./demo/src/demo.js')
    .pipe(babel({ presets: ['es2015'] }))
    .pipe(gulp.dest('./tmp'));

  return merge(hovercard, demo);
});

gulp.task('demo', ['css', 'demo:prepare'], function () {
  var jsSrc = gulp.src([
      './src/jquery.js',
      './src/mustache.js',
      './src/tooltipster.js',
      './src/remarkable.js',
      './src/highlight.pack.js',
      './src/js-xss.js',
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
      './src/highlight.css',
      './src/hovercard.css',
      './demo/src/demo.css'
    ])
    .pipe(concat('demo.css'))
    .pipe(cssnano({ zindex: false }))
    .pipe(gulp.dest('./demo/dist'));

  return merge(jsSrc, cssSrc);
});

gulp.task('cleanup', function (cb) {
  return del(['./tmp']);
});

gulp.task('extensions', ['chrome:zip', 'firefox:xpi', 'opera:nex']);
gulp.task('build', ['extensions', 'demo', 'userscript']);
gulp.task('default', function (cb) {
  run('build', 'cleanup', cb);
});

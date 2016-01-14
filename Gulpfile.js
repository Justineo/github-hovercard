var gulp = require('gulp');
var fs = require('fs');
var path = require('path');
var merge = require('merge-stream');
var del = require('del');
var exec = require('child_process').exec;
var replace = require('gulp-replace');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var cssnano = require('gulp-cssnano');
var babel = require('gulp-babel');
var pack = JSON.parse(fs.readFileSync('./package.json', { encoding: 'utf8' }));
var version = pack.version;

gulp.task('css', function () {
  var stylus = require('gulp-stylus');
  return gulp.src('./src/*.styl')
    .pipe(stylus())
    .pipe(gulp.dest('./src'));
});

gulp.task('cp', ['css'], function () {
  var srcChrome = gulp.src('./src/*')
    .pipe(replace('__EMOJI_DATA__', 'chrome.extension.getURL(\'emoji.json\')'))
    .pipe(replace(/spinner.svg/, 'chrome-extension://__MSG_@@extension_id__/spinner.svg'))
    .pipe(gulp.dest('./extensions/chrome'));
  var srcFirefox = gulp.src('./src/*')
    .pipe(replace('__EMOJI_DATA__', 'self.options.emojiURLs'))
    .pipe(gulp.dest('./extensions/firefox/data'));
  var assets = gulp.src('./assets/*')
    .pipe(gulp.dest('./extensions/firefox/data'))
    .pipe(gulp.dest('./extensions/chrome'));
  var icon = gulp.src('./icon.png')
    .pipe(gulp.dest('./extensions/firefox'))
    .pipe(gulp.dest('./extensions/chrome'));
  return merge(srcChrome, srcFirefox, assets, icon);
});

gulp.task('chrome.zip', ['cp'], function (cb) {
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

gulp.task('firefox.xpi', ['cp'], function (cb) {
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

gulp.task('opera.nex', ['chrome.zip'], function (cb) {
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

gulp.task('demo:prepare', function () {
  var main = gulp.src('./src/hovercard.js')
    .pipe(replace('__EMOJI_DATA__', JSON.stringify(require('./assets/emoji.json'))))
    .pipe(replace('location.host', '\'github.com\''))
    .pipe(babel({ presets: ['es2015'] }))
    .pipe(gulp.dest('./tmp'));

  var demo = gulp.src('./demo/src/demo.js')
    .pipe(babel({ presets: ['es2015'] }))
    .pipe(gulp.dest('./tmp'));

  return merge(main, demo);
});

gulp.task('demo', ['css', 'demo:prepare'], function () {
  var jsSrc = gulp.src([
      './src/jquery.js',
      './src/mustache.js',
      './src/tooltipster.js',
      './src/remarkable.js',
      './src/highlight.pack.js',
      './src/js-xss.js',
      './tmp/hovercard.js',
      './tmp/demo.js'
    ])
    .pipe(concat('demo.js'))
    .pipe(uglify())
    .pipe(gulp.dest('./demo/dist'));

  var cssSrc = gulp.src([
      './src/tooltipster.css',
      './src/highlight.css',
      './src/hovercard.css',
      './demo/src/demo.css'
    ])
    .pipe(replace(/spinner.svg/, '../../assets/spinner.svg'))
    .pipe(concat('demo.css'))
    .pipe(cssnano({ zindex: false }))
    .pipe(gulp.dest('./demo/dist'));

  return merge(jsSrc, cssSrc);
});

gulp.task('demo:clean', ['demo'], function (cb) {
  return del(['./tmp']);
});

gulp.task('extensions', ['chrome.zip', 'firefox.xpi', 'opera.nex']);
gulp.task('default', ['extensions', 'demo:clean']);

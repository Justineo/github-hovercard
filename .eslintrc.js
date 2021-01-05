module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "webextensions": true,
        "jquery": true,
    },
    "extends": "eslint:recommended",
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly",
        "$": true,
        "Mustache": true,
        "browser": true
    },
    "parserOptions": {
        "ecmaVersion": 2018
    },
    "rules": {
        "no-fallthrough": 0,
        "no-console": "off"
    }
};

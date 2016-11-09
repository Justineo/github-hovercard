// A polyfill for `setTimeout` & `clearTimeout` using `requestAnimationFrame`
// because `setTimeout` does not callback in certain conditions
var __nextId = 0;
var __activeTimers = {};
function setTimeout(callback, delay) {
    var start = Date.now();
    var timerId = __nextId++;

    function check() {
        if (!__activeTimers[timerId]) {
            return;
        }
        if (Date.now() - start >= delay) {
            callback();
        } else {
            requestAnimationFrame(check);
        }
    }
    requestAnimationFrame(check);

    __activeTimers[timerId] = true;
    return timerId;
}

function clearTimeout(timerId) {
    delete __activeTimers[timerId];
}

// Generated by CoffeeScript 1.8.0
(typeof exports !== "undefined" && exports !== null ? exports : window).Scroller = {
  _activatedElement: null,
  init: function() {
    var _this = this;
    handlerStack.push({
      DOMActivate: function(event) {
        _this._activatedElement = event.target;
        return true;
      }
    });
  },
  setSmoothScroll: function() {
  },
  scrollProperties: {
    x: {
      axisName: 'scrollLeft',
      max: 'scrollWidth',
      viewSize: 'clientHeight'
    },
    y: {
      axisName: 'scrollTop',
      max: 'scrollHeight',
      viewSize: 'clientWidth'
    }
  },
  getDimension: function(el, direction, name) {
    return (name !== 'viewSize' || el !== document.body)
      ? el[this.scrollProperties[direction][name]]
      : (direction === 'x') ? window.innerWidth
      : window.innerHeight;
  },
  ensureScrollChange: function(direction, changeFn) {
    var axisName, element, lastElement, oldScrollValue, rect;
    axisName = this.scrollProperties[direction].axisName;
    element = this._activatedElement;
    while (true) {
      oldScrollValue = element[axisName];
      changeFn.call(this, element, axisName);
      if (!(element[axisName] === oldScrollValue && element !== document.body)) {
        break;
      }
      lastElement = element;
      element = element.parentElement || document.body;
    }
    rect = this._activatedElement.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      this._activatedElement = element;
    }
  },
  scrollBy: function(direction, amount, factor) {
    if (factor == null) {
      factor = 1;
    }
    if (!document.body && amount instanceof Number) {
      if (direction === "x") {
        window.scrollBy(amount, 0);
      } else {
        window.scrollBy(0, amount);
      }
      return;
    }
    if (!this._activatedElement || !this.isRendered(this._activatedElement)) {
      this._activatedElement = document.body;
    }
    this.ensureScrollChange(direction, function(element, axisName) {
      var elementAmount = Utils.isString(amount) ? this.getDimension(element, direction, amount) : amount;
      element[axisName] += elementAmount * factor;
    });
  },
  scrollTo: function(direction, pos) {
    if (!document.body) {
      return;
    }
    if (!this._activatedElement || !this.isRendered(this._activatedElement)) {
      this._activatedElement = document.body;
    }
    this.ensureScrollChange(direction, function(element, axisName) {
      element[axisName] = Utils.isString(pos) ? this.getDimension(element, direction, pos) : pos;
    });
  },
  isRendered: function(element) {
    var computedStyle = window.getComputedStyle(element, null);
    return !(computedStyle.getPropertyValue("visibility") !== "visible" || computedStyle.getPropertyValue("display") === "none");
  }
};

var MockRequest = require('./MockRequest');
var MockResponse = require('./MockResponse');
var MockEventTarget = require('./MockEventTarget');

var notImplementedError = new Error(
  "This feature hasn't been implmented yet. Please submit an Issue or Pull Request on Github."
);

//https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest
//https://xhr.spec.whatwg.org/
//http://www.w3.org/TR/2006/WD-XMLHttpRequest-20060405/

MockXMLHttpRequest.STATE_UNSENT = 0;
MockXMLHttpRequest.STATE_OPENED = 1;
MockXMLHttpRequest.STATE_HEADERS_RECEIVED = 2;
MockXMLHttpRequest.STATE_LOADING = 3;
MockXMLHttpRequest.STATE_DONE = 4;

/**
 * The request handlers
 * @private
 * @type {Array}
 */
MockXMLHttpRequest.handlers = [];

/**
 * Add a request handler
 * @param   {function(MockRequest, MockResponse)} fn
 * @returns {MockXMLHttpRequest}
 */
MockXMLHttpRequest.addHandler = function(fn) {
  MockXMLHttpRequest.handlers.push(fn);
  return this;
};

/**
 * Remove a request handler
 * @param   {function(MockRequest, MockResponse)} fn
 * @returns {MockXMLHttpRequest}
 */
MockXMLHttpRequest.removeHandler = function(fn) {
  throw notImplementedError;
};

/**
 * Remove all request handlers
 */
MockXMLHttpRequest.reset = function() {
  MockXMLHttpRequest.handlers = [];
};

/**
 * Mock XMLHttpRequest
 * @constructor
 */
function MockXMLHttpRequest() {
  MockEventTarget.call(this);
  this.reset();
  this.upload = new MockEventTarget();
  this.timeout = 0;
  // some libraries (like Mixpanel) use the presence of this field to check if XHR is properly supported
  // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials
  this.withCredentials = false;
}

MockXMLHttpRequest.prototype = Object.create(MockEventTarget.prototype);
MockXMLHttpRequest.prototype.constructor = MockXMLHttpRequest;

/**
 * Reset the response values
 * @private
 */
MockXMLHttpRequest.prototype.reset = function() {
  this._requestHeaders = {};
  this._responseHeaders = {};

  this.status = 0;
  this.statusText = '';

  this.response = null;
  this.responseType = null;
  this.responseText = null;
  this.responseXML = null;

  this.readyState = MockXMLHttpRequest.STATE_UNSENT;
};

/**
 * Trigger an event
 * @param   {String} event
 * @returns {MockXMLHttpRequest}
 */
MockXMLHttpRequest.prototype.trigger = function(event, eventDetails) {
  if (this.onreadystatechange) {
    this.onreadystatechange();
  }

  if (this['on' + event]) {
    this['on' + event]();
  }

  return MockEventTarget.prototype.trigger.apply(this, arguments);
};

MockXMLHttpRequest.prototype.open = function(
  method,
  url,
  async,
  user,
  password
) {
  this.reset();
  this.method = method;
  this.url = url;
  this.async = async;
  this.user = user;
  this.password = password;
  this.data = null;
  this.readyState = MockXMLHttpRequest.STATE_OPENED;
};

MockXMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  this._requestHeaders[name] = value;
};

MockXMLHttpRequest.prototype.overrideMimeType = function(mime) {
  throw notImplementedError;
};

/**
 * Handle a request
 * @returns {MockResponse|null}
 */
MockXMLHttpRequest.prototype.handle = function() {
  for (var i = 0; i < MockXMLHttpRequest.handlers.length; ++i) {
    //get the generator to create a response to the request
    var response = MockXMLHttpRequest.handlers[i](
      new MockRequest(this),
      new MockResponse(this)
    );

    if (response) {
      return response;
    }
  }

  return null;
};

MockXMLHttpRequest.prototype.send = function(data) {
  var self = this;
  this.data = data;

  self.readyState = MockXMLHttpRequest.STATE_LOADING;

  self._sendTimeout = setTimeout(function() {
    var response = self.handle();

    if (response && response instanceof MockResponse) {
      var timeout = response.timeout();

      if (timeout) {
        //trigger a timeout event because the request timed out - wait for the timeout time because many libs like jquery and superagent use setTimeout to detect the error type
        self._sendTimeout = setTimeout(function() {
          self.readyState = MockXMLHttpRequest.STATE_DONE;
          self.trigger('timeout');
        }, typeof timeout === 'number' ? timeout : self.timeout + 1);
      } else {
        //trigger a load event to indicate the data has been sent
        self.upload.trigger('load'); //TODO: onloadstart and all the other events too https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload

        //map the response to the XHR object
        self.status = response.status();
        self.statusText = response.statusText();
        self._responseHeaders = response.headers();
        self.responseType = 'text';
        self.response = response.body();
        self.responseText = response.body(); //TODO: detect an object and return JSON, detect XML and return XML
        self.readyState = MockXMLHttpRequest.STATE_DONE;

        //trigger a load event because the request was received
        self.trigger('load');
      }
    } else {
      //trigger an error because the request was not handled
      self.readyState = MockXMLHttpRequest.STATE_DONE;
      self.trigger('error');
    }
  }, 0);
};

MockXMLHttpRequest.prototype.abort = function() {
  clearTimeout(this._sendTimeout);

  if (
    this.readyState > MockXMLHttpRequest.STATE_UNSENT &&
    this.readyState < MockXMLHttpRequest.STATE_DONE
  ) {
    this.readyState = MockXMLHttpRequest.STATE_UNSENT;
    this.upload.trigger('abort');
    this.trigger('abort');
  }
};

MockXMLHttpRequest.prototype.getAllResponseHeaders = function() {
  if (this.readyState < MockXMLHttpRequest.STATE_HEADERS_RECEIVED) {
    return null;
  }

  var headers = '';
  for (var name in this._responseHeaders) {
    if (this._responseHeaders.hasOwnProperty(name)) {
      headers += name + ': ' + this._responseHeaders[name] + '\r\n';
    }
  }

  return headers;
};

MockXMLHttpRequest.prototype.getResponseHeader = function(name) {
  if (this.readyState < MockXMLHttpRequest.STATE_HEADERS_RECEIVED) {
    return null;
  }

  return this._responseHeaders[name.toLowerCase()] || null;
};

module.exports = MockXMLHttpRequest;
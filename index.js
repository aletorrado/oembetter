var oembed = require('./oembed.js');
var async = require('async');
var filters = require('./filters.js');
var urls = require('url');

module.exports = function(options) {
  var self = {};

  if (!options) {
    options = {};
  }

  self.before = filters.before.concat(options.before || []);
  self.after = filters.after.concat(options.after || []);
  self.fallback = filters.fallback.concat(options.fallback || []);

  self.fetch = function(url, options, callback) {
    if (arguments.length === 2) {
      callback = options;
      options = {};
    }
    var response;
    var warnings = [];
    if (self._whitelist) {
      var parsed = urls.parse(url);
      if (!parsed) {
        return callback(new Error('oembetter: invalid URL: ' + url));
      }
      var i;
      var good = false;
      for (i = 0; (i < self._whitelist.length); i++) {
        if (self.inDomain(self._whitelist[i], parsed.hostname)) {
          good = true;
          break;
        }
      }
      if (!good) {
        return callback(new Error('oembetter: ' + url + ' is not in a whitelisted domain.'));
      }
    }
    return async.series({
      before: function(callback) {
        return async.eachSeries(self.before, function(before, callback) {
          return before(url, options, response, function(err, _url, _options, _response) {
            // Nonfatal
            if (err) {
              warnings.push(err);
              return callback(null);
            }
            url = _url || url;
            options = _options || options;
            response = _response || response;
            return callback(null);
          });
        }, callback);
      },
      fetch: function(callback) {
        if (response) {
          // Preempted by a before
          return callback(null);
        }
        return oembed(url, options, function (err, result) {
          response = result;
          if (err) {
            // not necessarily fatal
            warnings.push(err);
          }
          return callback(null);
        });
      },
      fallback: function(fallbackCallback) {
        if (response) {
          return setImmediate(fallbackCallback);
        }
        return async.eachSeries(self.fallback, function(fallback, callback) {
          return fallback(url, options, function(err, _response) {
            if (err) {
              warnings.push(err);
              return callback(err);
            }
            response = _response || response;
            if (response) {
              // Stop trying fallbacks, we got one
              return fallbackCallback(null);
            }
            return callback(null);
          });
        }, fallbackCallback);
      },
      after: function(callback) {
        if (!response) {
          return setImmediate(callback);
        }
        return async.eachSeries(self.after, function(after, callback) {
          return after(url, options, response, function(err, _response) {
            if (err) {
              warnings.push(err);
              return callback(err);
            }
            response = _response || response;
            return callback(null);
          });
        }, callback);
      }
    }, function(err) {
      // Handle fatal errors
      if (err) {
        return callback(err);
      }
      // If there is no response, treat the first
      // warning as a fatal error
      if (!response) {
        if (warnings.length) {
          return callback(warnings[0], warnings);
        }
      }
      // If there is a response, make the warnings available as the
      // third argument
      return callback(null, response, warnings);
    });
  };

  self.addBefore = function(fn) {
    self.before.push(fn);
  };

  self.addAfter = function(fn) {
    self.after.push(fn);
  };

  self.addFallback = function(fn) {
    self.fallback.push(fn);
  };

  self.inDomain = function(domain, hostname) {

    hostname = hostname.toLowerCase();
    domain = domain.toLowerCase();
    if (hostname === domain) {
      return true;
    }
    if (hostname.substr(-domain.length - 1) === ('.' + domain)) {
      return true;
    }
    return false;
  };

  self.whitelist = function(_whitelist) {
    self._whitelist = _whitelist;
  };

  self.suggestedWhitelist = [
    'youtube.com',
    'blip.tv',
    'dailymotion.com',
    'flickr.com',
    'hulu.com',
    'nfb.ca',
    'qik.com',
    'revision3.com',
    'scribd.com',
    'viddler.com',
    'vimeo.com',
    'youtube.com',
    'dotsub.com',
    'yfrog.com',
    'photobucket.com'
  ];

  return self;
};

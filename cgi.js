var url = require('url');
var spawn = require('child_process').spawn;
var StreamStack = require('stream-stack').StreamStack;
var buf = require('./bufferHelpers');

var SERVER_SOFTWARE = "Node/"+process.version;
var SERVER_PROTOCOL = "HTTP/1.1";
var GATEWAY_INTERFACE = "CGI/1.1";

// The default config options to use for each `cgi()` call.
cgi.DEFAULTS = {
  // The 'cgi' handler will take effect when the req.url begins with "mountPoint"
  mountPoint: '/',
  // Any additional variables to insert into the CGI script's Environment
  env: {},
  // Set to 'true' if the CGI script is an NPH script
  nph: false
};

module.exports = function cgi(cgiBin, options) {
  options = options || {};
  options.__proto__ = cgi.DEFAULTS;

  return function cgi(req, res, next) {
    if (!req.hasOwnProperty("uri")) { req.uri = url.parse(req.url); }
    if (req.uri.pathname.substring(0, options.mountPoint.length) !== options.mountPoint) return next();

    var host = (req.headers.host || '').split(':');
    var address = host[0];
    var port = host[1];
    if (!address || !port) {
      var serverAddress = this.address();
      if (!address) address = serverAddress.address;
      if (!port) address = serverAddress.port;
    }

    var env = clone(options.env);
    // These meta-variables below can be overwritten by a
    // user's 'env' object in options
    env.__proto__ = {
      GATEWAY_INTERFACE:  GATEWAY_INTERFACE,
      SERVER_NAME:        address,
      SERVER_PORT:        port,
      SERVER_PROTOCOL:    SERVER_PROTOCOL,
      SERVER_SOFTWARE:    SERVER_SOFTWARE
    };
    env.__proto__.__proto__ = process.env;

    // These final environment variables take precedence over user-specified ones.
    env.REQUEST_METHOD = req.method;
    env.QUERY_STRING = req.uri.query || '';
    if ('content-length' in req.headers) {
      env.CONTENT_LENGTH = req.headers['content-length'];
    }
    if ('content-type' in req.headers) {
      env.CONTENT_TYPE = req.headers['content-type'];
    }
    if ('authorization' in req.headers) {
      var auth = req.headers.authorization.split(' ');
      env.AUTH_TYPE = auth[0];
      //var unbase = new Buffer(auth[1], 'base64').toString().split(':');
    }

    // Now we can spawn the CGI executable
    var cgiSpawn = spawn(cgiBin, [], { env: env });

    // The request body is piped to 'stdin' of the CGI spawn
    req.pipe(cgiSpawn.stdin);

    // A proper CGI script is supposed to print headers to 'stdout'
    // followed by a blank line, then a response body.
    var cgiResult = new CGIParser(cgiSpawn.stdout);

    // When the blank line after the headers has been parsed, then
    // the 'headers' event is emitted with an Object containing the headers.
    cgiResult.on('headers', function(headers) {
      var status = parseInt(headers.Status) || 200;
      res.writeHead(status, headers);
    });

    // The response body is piped to the response body of the HTTP request
    cgiResult.pipe(res);

    cgiSpawn.on('exit', function(code, signal) {
      cgiResult.cleanup();
    });
  }
}

/**
 * Parses CGI headers (\n newlines) until a blank line,
 * signifying the end of the headers. After the blank line
 * is assumed to be the body, which you can use 'pipe()' with.
 */
var LF = '\n';
var CR = '\r';
var DOUBLE_LF = new Buffer(LF+LF);
var DOUBLE_CRLF = new Buffer(CR+LF+CR+LF);
var CRLF = new RegExp(CR + LF, 'g');

function CGIParser(stream) {
  StreamStack.call(this, stream, {
    data: this._onData
  });
  this.headersParsed = false;
  this._headers = Buffer(0);
}
require('util').inherits(CGIParser, StreamStack);
exports.CGIParser = CGIParser;

CGIParser.prototype._onData = function(chunk) {
  if (this.headersParsed) {
    this.emit('data', chunk);
  } else {
    this._parseHeader(chunk);
  }
}

CGIParser.prototype._parseHeader = function(chunk) {
  this._headers = buf.bufferConcat(this._headers, chunk);
  // First try "\n\n"
  var index = buf.bufferIndexOf(this._headers, DOUBLE_LF);
  var headerLen = DOUBLE_LF.length;
  if (index < 0) {
    // Otherwise try "\r\n\r\n"
    index = buf.bufferIndexOf(this._headers, DOUBLE_CRLF);
    headerLen = DOUBLE_CRLF.length;
  }
  if (index >= 0) {
    var leftover = this._headers.slice(index + headerLen);
    this._headers = this._headers.slice(0, index);
    this._onHeadersComplete(leftover);
  }
}

CGIParser.prototype._onHeadersComplete = function(leftover) {
  var headers = {};

  this._headers.toString().replace(CRLF, LF).split(LF).forEach(function(line) {
    var firstColon = line.indexOf(':');
    var name = line.substring(0, firstColon);
    var value = line.substring(firstColon+(line[firstColon+1] == ' ' ? 2 : 1));
    headers[name] = value;
  });

  this.headersParsed = true;

  this.emit('headers', headers);

  if (leftover) {
    this.stream.emit('data', leftover);
  }
}


// Does a shallow clone of an Object
function clone(obj) {
  var rtn = {};
  for (var i in obj) {
    rtn[i] = obj[i];
  }
  return rtn;
}

var url = require('url');
var spawn = require('child_process').spawn;
var Stream = require('stream').Stream;
var StreamStack = require('stream-stack').StreamStack;
var HeaderParser = require('header-stack').Parser;

var SERVER_SOFTWARE = "Node/"+process.version;
var SERVER_PROTOCOL = "HTTP/1.1";
var GATEWAY_INTERFACE = "CGI/1.1";

function cgi(cgiBin, options) {
  options = options || {};
  options.__proto__ = cgi.DEFAULTS;

  return function layer(req, res, next) {
    if (!next) {
      next = function() {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found\n");
      }
    }
    if (!req.hasOwnProperty("uri")) { req.uri = url.parse(req.url); }
    if (req.uri.pathname.substring(0, options.mountPoint.length) !== options.mountPoint) return next();

    var host = (req.headers.host || '').split(':');
    var address = host[0];
    var port = host[1];
    if (!address || !port && typeof this.address == 'function') {
      var serverAddress = this.address();
      if (!address) address = serverAddress.address;
      if (!port) port = serverAddress.port;
    }

    var env = {};

    // Take environment variables from the current server process
    extend(process.env, env);

    // These meta-variables below can be overwritten by a
    // user's 'env' object in options
    extend({
      GATEWAY_INTERFACE:  GATEWAY_INTERFACE,
      SCRIPT_NAME:        options.mountPoint,
      PATH_INFO:          req.uri.pathname.substring(options.mountPoint.length),
      SERVER_NAME:        address || 'unknown',
      SERVER_PORT:        port || 80,
      SERVER_PROTOCOL:    SERVER_PROTOCOL,
      SERVER_SOFTWARE:    SERVER_SOFTWARE
    }, env);

    // The client HTTP request headers are attached to the env as well,
    // in the format: "User-Agent" -> "HTTP_USER_AGENT"
    for (var header in req.headers) {
      var name = 'HTTP_' + header.toUpperCase().replace(/-/g, '_');
      env[name] = req.headers[header];
    }

    // Now add the user-specified env variables
    extend(options.env, env);

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

    //console.log(env);
    //var fds = [ req.connection.fd, -1, -1 ];
    //if (options.nph) {
    //  fds[1] = fds[0];
    //}
    // Now we can spawn the CGI executable
    var cgiSpawn = spawn(cgiBin, [], {
      //'customFds': fds,
      'env': env
    });


    // Work-around some weird Node bug where a child process won't emit
    // any events... or something... still figuring it out.
    // This SHOULDN'T be needed.
    require('util').inspect(cgiSpawn, true, 5);

    
    // The request body is piped to 'stdin' of the CGI spawn
    req.pipe(cgiSpawn.stdin);

    // If `options.stderr` is set to a Stream instance, then re-emit the
    // 'data' events onto the stream.
    var onData;
    if (options.stderr) {
      onData = function (chunk) {
        options.stderr.emit('data', chunk);
      }
      cgiSpawn.stderr.on('data', onData);
    }

    // A proper CGI script is supposed to print headers to 'stdout'
    // followed by a blank line, then a response body.
    if (!options.nph) {
      var cgiResult = new CGIParser(cgiSpawn.stdout);

      // When the blank line after the headers has been parsed, then
      // the 'headers' event is emitted with an Object containing the headers.
      cgiResult.on('headers', function(headers) {
        console.log(headers);
        var status = parseInt(headers.status) || 200;
        res.writeHead(status, headers);

        // The response body is piped to the response body of the HTTP request
        cgiResult.pipe(res);
      });
    } else {
      // If it's an NPH script, then responsibility of the HTTP response is
      // completely passed off to the child process.
      //req.connection.destroy();
      cgiSpawn.stdout.pipe(res.connection);
    }


    cgiSpawn.on('exit', function(code, signal) {
      //console.log(arguments);
      //cgiResult.cleanup();
      if (onData) {
        options.stderr.removeListener('data', onData);
      }
    });
  }
}
module.exports = cgi;

// The default config options to use for each `cgi()` call.
cgi.DEFAULTS = {
  // The 'cgi' handler will take effect when the req.url begins with "mountPoint"
  mountPoint: '/',
  // Any additional variables to insert into the CGI script's Environment
  env: {},
  // Set to 'true' if the CGI script is an NPH script
  nph: false,
  // Set to a `Stream` instance if you want to log stderr of the CGI script somewhere
  stderr: undefined
};


/**
 * Parses CGI headers (\n newlines) until a blank line,
 * signifying the end of the headers. After the blank line
 * is assumed to be the body, which you can use 'pipe()' with.
 */
function CGIParser(stream) {
  StreamStack.call(this, stream, {
    data: function(b) { this._onData(b); }
  });
  this._onData = this._parseHeader;
  this._headerParser = new HeaderParser(new Stream(), {
    emitFirstLine: false,
    strictCRLF: false,
    strictSpaceAfterColon: false,
    allowFoldedHeaders: false
  });
  this._headerParser.on('headers', this._onHeadersComplete.bind(this));
}
require('util').inherits(CGIParser, StreamStack);
exports.CGIParser = CGIParser;

CGIParser.prototype._proxyData = function(b) {
  this.emit('data', b);
}

CGIParser.prototype._parseHeader = function(chunk) {
  this._headerParser.stream.emit('data', chunk);
}

CGIParser.prototype._onHeadersComplete = function(headers, leftover) {
  this._onData = this._proxyData;
  this.emit('headers', headers);
  if (leftover) {
    this._onData(leftover);
  }
}


// Copies the values from source onto destination
function extend(source, destination) {
  for (var i in source) {
    destination[i] = source[i];
  }
  return destination;
}

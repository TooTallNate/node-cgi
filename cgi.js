
/**
 * Module dependencies.
 */

var url = require('url');
var extend = require('extend');
var debug = require('debug')('cgi');
var spawn = require('child_process').spawn;
var CGIParser = require('./parser');

/**
 * Module exports.
 */

module.exports = cgi;

/**
 * Constants.
 */

var SERVER_SOFTWARE = 'Node/' + process.version;
var SERVER_PROTOCOL = 'HTTP/1.1';
var GATEWAY_INTERFACE = 'CGI/1.1';

function cgi(cgiBin, options) {
  options = extend({}, cgi.DEFAULTS, options);

  return function layer(req, res, next) {
    if (!next) {
      // define a default "next" handler if none was passed
      next = function(err) {
        debug('"next" called: %o', err);
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found\n");
      };
    }
    if (!req.hasOwnProperty("uri")) { req.uri = url.parse(req.url); }
    if (req.uri.pathname.substring(0, options.mountPoint.length) !== options.mountPoint) return next();
    debug('handling HTTP request: %o', req.url);

    var host = (req.headers.host || '').split(':');
    var address = host[0];
    var port = host[1];
    if ((!address || !port) && typeof this.address == 'function') {
      var serverAddress = this.address();
      debug('server address and port: %o', serverAddress);
      if (!address) address = serverAddress.address;
      if (!port) port = serverAddress.port;
    }

    // Take environment variables from the current server process
    var env = extend({}, process.env);

    // Determine the correct PATH_INFO variable.
    // It must be prepended with a "/" char as per:
    //   https://tools.ietf.org/html/rfc3875#section-4.1.5
    var pathInfo = req.uri.pathname.substring(options.mountPoint.length);
    if ('/' !== pathInfo[0]) pathInfo = '/' + pathInfo;
    debug('calculated PATH_INFO variable: %o', pathInfo);

    // These meta-variables below can be overwritten by a
    // user's 'env' object in options
    extend(env, {
      GATEWAY_INTERFACE:  GATEWAY_INTERFACE,
      SCRIPT_NAME:        options.mountPoint,
      PATH_INFO:          pathInfo,
      SERVER_NAME:        address || 'unknown',
      SERVER_PORT:        port || 80,
      SERVER_PROTOCOL:    SERVER_PROTOCOL,
      SERVER_SOFTWARE:    SERVER_SOFTWARE
    });

    // The client HTTP request headers are attached to the env as well,
    // in the format: "User-Agent" -> "HTTP_USER_AGENT"
    for (var header in req.headers) {
      var name = 'HTTP_' + header.toUpperCase().replace(/-/g, '_');
      env[name] = req.headers[header];
    }

    // Now add the user-specified env variables
    if (options.env) extend(env, options.env);

    // These final environment variables take precedence over user-specified ones.
    env.REQUEST_METHOD = req.method;
    env.QUERY_STRING = req.uri.query || '';
    env.REMOTE_ADDR = req.connection.remoteAddress;
    env.REMOTE_PORT = req.connection.remotePort;
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

    var opts = extend({}, options);

    // Now we can spawn the CGI executable
    debug('env: %o', env);
    opts.env = env;

    var cgiSpawn = spawn(cgiBin, opts.args, opts);
    debug('cgi spawn (pid: %o)', cgiSpawn.pid);

    // The request body is piped to 'stdin' of the CGI spawn
    req.pipe(cgiSpawn.stdin);

    // If `options.stderr` is set to a Stream instance, then re-emit the
    // 'data' events onto the stream.
    if (options.stderr) {
      cgiSpawn.stderr.pipe(options.stderr);
    }

    // A proper CGI script is supposed to print headers to 'stdout'
    // followed by a blank line, then a response body.
    var cgiResult;
    if (!options.nph) {
      cgiResult = new CGIParser(cgiSpawn.stdout);

      // When the blank line after the headers has been parsed, then
      // the 'headers' event is emitted with a Headers instance.
      cgiResult.on('headers', function(headers) {
        headers.forEach(function(header) {
          // Don't set the 'Status' header. It's special, and should be
          // used to set the HTTP response code below.
          if (header.key === 'Status') return;
          res.setHeader(header.key, header.value);
        });

        // set the response status code
        res.statusCode = parseInt(headers.status, 10) || 200;

        // The response body is piped to the response body of the HTTP request
        cgiResult.pipe(res);
      });
    } else {
      // If it's an NPH script, then responsibility of the HTTP response is
      // completely passed off to the child process.
      cgiSpawn.stdout.pipe(res.connection);
    }

    cgiSpawn.on('exit', function(code, signal) {
      debug('cgi spawn %o "exit" event (code %o) (signal %o)', cgiSpawn.pid, code, signal);
      // TODO: react on a failure status code (dump stderr to the response?)
    });

    cgiSpawn.stdout.on('end', function () {
      // clean up event listeners upon the "end" event
      debug('cgi spawn %o stdout "end" event', cgiSpawn.pid);
      if (cgiResult) {
        cgiResult.cleanup();
      }
      //if (options.stderr) {
      //  cgiSpawn.stderr.unpipe(options.stderr);
      //}
    });
  };
}

// The default config options to use for each `cgi()` call.
cgi.DEFAULTS = {
  // The 'cgi' handler will take effect when the req.url begins with "mountPoint"
  mountPoint: '/',
  // Any additional variables to insert into the CGI script's Environment
  env: {},
  // Set to 'true' if the CGI script is an NPH script
  nph: false,
  // Set to a `Stream` instance if you want to log stderr of the CGI script somewhere
  stderr: null,
  // A list of arguments for the cgi bin to be used by spawn
  args: []
};

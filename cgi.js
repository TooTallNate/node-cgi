var url = require('url');
var spawn = require('child_process').spawn;
var CGIParser = require('./parser');

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
    if ((!address || !port) && typeof(this.address) === 'function') {
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
    
    // The request body is piped to 'stdin' of the CGI spawn
    req.pipe(cgiSpawn.stdin);

    // If `options.stderr` is set to a Stream instance, then re-emit the
    // 'data' events onto the stream.
    var onData;
    if (options.stderr) {
      onData = function (chunk) {
        options.stderr.write(chunk);
      }
      cgiSpawn.stderr.on('data', onData);
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
        res.writeHead(parseInt(headers.status) || 200, {});

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
      if (cgiResult) {
        cgiResult.cleanup();
      }
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


// TODO: Remove this function, and use the prototype of the env instead
// Copies the values from source onto destination
function extend(source, destination) {
  for (var i in source) {
    destination[i] = source[i];
  }
  return destination;
}

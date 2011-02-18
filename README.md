node-cgi
========
### An http/stack/connect layer to invoke and serve CGI executables.


This module implements [RFC 3875][rfc3875], and offers an easy interface to run
and serve CGI executables using [Node][]'s HTTP server. I wrote this so I could
directly serve [GitWeb][node-gitweb] through Node.


CGI Scripts?
------------

If you're not familiar with CGI scripts, they're simply executables files that
get invoked by a web server with client requests. The script has Environment
Variables set that indicate information about the HTTP request the client has sent.

Here's what a simple "Hello World" CGI script in `sh` would look like:

    #!/bin/sh
    
    # Headers are written first. The special "Status" headers
    # indicates the response status code
    echo "Status: 200"
    echo "Content-Type: text/plain"
    echo
    
    # Followed by a response body
    echo "Hello World!"

Let's call it `hello.cgi`. Be sure to make it executable with `chmod +x hello.cgi`!


Invoking "The Script" with Node
-------------------------------

Now, we need to set up our Node HTTP server. For every request sent to the server,
our `hello.cgi` script will be invoked, and the response will be sent back to the
HTTP client:

    var http = require('http');
    var cgi = require('cgi');

    http.createServer(
      cgi('hello.cgi')
    ).listen(80);

This will set up a CGI handler with the default options.



[Node]: http://nodejs.org
[node-gitweb]: https://github.com/TooTallNate/node-gitweb
[rfc3875]: http://tools.ietf.org/html/rfc3875

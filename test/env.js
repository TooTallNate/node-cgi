var http = require('http');
var cgi  = require('../cgi');
var connect = require('connect');

var PORT = 5555;
var app = connect()
  .use(connect.logger())
  .use(cgi(__dirname + '/cgi-bin/printenv.cgi'));

var server = http.createServer(app);

server.listen(PORT, function() {
  console.log('server listening');

  var req = http.get({
    port: PORT,
    path: '/?test=1'
  });

  req.on('response', function (res) {
    console.log(res.headers);
    res.pipe(process.stdout);
    res.on('end', server.close.bind(server));
  });

  req.end();
});


0.3.1 / 2015-01-29
==================

  * cgi: ensure that the spawn opts don't trump the cgi options object
  * cgi: use .pipe() for stderr
  * cgi: use `%o` formatter for debug() calls
  * package: update "extend" to v2.0.0
  * package: use ".js" in "main" field
  * package: allow any "debug" v2

0.3.0 / 2014-05-22
==================

  * test: fix "env" test
  * cgi: pass the `options` object directly to spawn()
  * cgi: use "extend" module instead of inlined code
  * cgi: ensure a leading / char for `PATH_INFO` var
  * add LICENSE file
  * package: add "license" field
  * package: remove "engines" field
  * package: use ~ instead of >= for dependencies
  * package: remove period from "description"
  * Added `REMOTE_ADDR` and `REMOTE_PORT` to env variables

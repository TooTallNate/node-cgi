/**
 * Accepts an arbitrary number of Buffer instances, and returns a single
 * Buffer instance with the contents of all the passed Buffers concatenated
 * into it.
 */
function bufferConcat() {
  var size = 0;
  var l=arguments.length;
  for (var i=0; i<l; i++) {
    size += arguments[i].length;
  }
  var rtn = new Buffer(size);
  var pos = 0;
  for (var i=0; i<l; i++) {
    arguments[i].copy(rtn, pos, 0);
    pos += arguments[i].length;
  }
  return rtn;
}
exports.bufferConcat = bufferConcat;

/**
 * A naiive 'Buffer.indexOf' function. Requires both the needle and haystack
 * to be Buffer instances.
 */
function bufferIndexOf(haystack, needle) {
  for (var i=0, l=haystack.length-needle.length+1; i<l; i++) {
    var good = true;
    for (var j=0, n=needle.length; j<n; j++) {
      if (haystack[i+j] !== needle[j]) {
        good = false;
        break;
      }
    }
    if (good) return i;
  }
  return -1;
}
exports.bufferIndexOf = bufferIndexOf;
/*jshint mocha:true*/
'use strict';

const chai = require('chai');
const expect = chai.expect;
const { inferTypeAndCount } = require('../lib/record-utils');

describe('checkStopFields ', function() {

  var cases = {
    '12 s. :': ['volume', 1],
    '[1], 55 s. :': ['volume', 1],
    'XV, 514 s. :': ['volume', 1],
    '[4], 257, [1] s.': ['volume', 1],
    'XV, [4], 257, [1] s.': ['volume', 1],
    '2 nid.': ['volume', 2],
    '4 nid. (349, 312, 276, 336 s.)': ['volume', 4],
    '2 vol.': ['volume', 2]
  };

  describe('inferTypeAndCount', function() {

    Object.keys(cases).forEach(function(str) {
      it('should understand value ' + str, function() {
        var result = inferTypeAndCount(str);
        expect(result.type).to.equal(cases[str][0]);
        expect(result.count).to.equal(cases[str][1]);
      });
    });

  });
});

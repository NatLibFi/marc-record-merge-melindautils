/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Utility functions to apply for MARC records during deduplication in Melinda
*
* Copyright (C) 2015, 2017 University Of Helsinki (The National Library Of Finland)
*
* This file is part of marc-record-merge-melindautils
*
* marc-record-merge-melindautils program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* marc-record-merge-melindautils is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/

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

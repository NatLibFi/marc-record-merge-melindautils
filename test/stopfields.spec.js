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

var chai = require('chai');
var expect = chai.expect;
var Record = require('marc-record-js');
const validateFields = require('../lib/validate-fields');

describe('checkStopFields ', function() {

  describe('with preferredIsSubset option', function() {

    var stopFieldConfig = {
      '245': { validate: ['identical', 'preferredIsSuperset'] }
    };

    it('should not return anything if fields are identical', function() {
      var otherRecord = new Record();
      otherRecord.appendField(['245','','','a','FieldContent']);

      var preferredRecord = new Record();
      preferredRecord.appendField(['245','','','a','FieldContent']);

      var messages = validateFields(stopFieldConfig, otherRecord, preferredRecord);
      expect(messages).length.to.be(0);
    });

    it('should not return anything if other field is subset of preferred', function() {
      var otherRecord = new Record();
      otherRecord.appendField(['245','','','a','FieldContent']);

      var preferredRecord = new Record();
      preferredRecord.appendField(['245','','','a','FieldContent','b','MoreFieldContent']);

      var messages = validateFields(stopFieldConfig, otherRecord, preferredRecord);
      expect(messages).length.to.be(0);
    });

    it('should create message when preferred is a subset of the other', function() {
      var otherRecord = new Record();
      otherRecord.appendField(['245','','','a','FieldContent','b','MoreFieldContent']);

      var preferredRecord = new Record();
      preferredRecord.appendField(['245','','','a','FieldContent']);

      var messages = validateFields(stopFieldConfig, otherRecord, preferredRecord);
      expect(messages).length.to.be(2);
      expect(messages).to.contain('Preferred record has stopfields that are a subset of the other record in field: 245');
    });

    it('should not care about indicators', function() {
      var otherRecord = new Record();
      otherRecord.appendField(['245','0','0',
        'a','Tilastot kertyvät... tilastot kertovat :',
        'b','oikeushallintotilastoja vuodelta 2005 : ulosottotoimi /']);

      var preferredRecord = new Record();
      preferredRecord.appendField(['245','1','0',
        'a','Tilastot kertyvät... tilastot kertovat :',
        'b','oikeushallintotilastoja vuodelta 2005 : ulosottotoimi /',
        'c','[Oikeusministeriö, oikeushallinto-osasto, ulosottoyksikkö].']);


      var messages = validateFields(stopFieldConfig, otherRecord, preferredRecord);
      expect(messages).length.to.be(0);
    });

    it('should not care about indicators', function() {
      var otherRecord = new Record();
      otherRecord.appendField(['245','0','0',
        'a','Tilastot kertyvät... tilastot kertovat :',
        'b','oikeushallintotilastoja vuodelta 2005 : ulosottotoimi /',
        'c','[Oikeusministeriö, oikeushallinto-osasto, ulosottoyksikkö].']);

      var preferredRecord = new Record();
      preferredRecord.appendField(['245','1','0',
        'a','Tilastot kertyvät... tilastot kertovat :',
        'b','oikeushallintotilastoja vuodelta 2005 : ulosottotoimi /']);


      var messages = validateFields(stopFieldConfig, otherRecord, preferredRecord);
  
      expect(messages).length.to.be(2);

      expect(messages).to.contain('Preferred record has stopfields that are a subset of the other record in field: 245');
    });


    it('should not care about indicators in other', function() {
      var otherRecord = new Record();
      otherRecord.appendField(['245','1','0','a','FieldContent']);

      var preferredRecord = new Record();
      preferredRecord.appendField(['245','0','0','a','FieldContent']);

      var messages = validateFields(stopFieldConfig, otherRecord, preferredRecord);
      expect(messages).length.to.be(0);
    
    });
    it('should not care about indicators in preferred', function() {
      var otherRecord = new Record();
      otherRecord.appendField(['245','0','0','a','FieldContent']);

      var preferredRecord = new Record();
      preferredRecord.appendField(['245','1','0','a','FieldContent']);

      var messages = validateFields(stopFieldConfig, otherRecord, preferredRecord);
      expect(messages).length.to.be(0);
    });

  });

});

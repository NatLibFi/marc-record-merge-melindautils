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

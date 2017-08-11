/*jshint mocha:true*/
'use strict';

const sinon = require('sinon');
var chai = require('chai');
var expect = chai.expect;
var Record = require('marc-record-js');
var MergeUtilsMelinda = require('../lib/marc-record-merge-melindautils');
var path = require('path');
var fs = require('fs');

function AuthRecord(a, d) {
  const fakeAuthRecord = new Record();
  if (d) {
    fakeAuthRecord.appendField(['100','','','a',a,'d',d]);
  } else {
    fakeAuthRecord.appendField(['100','','','a',a]);
  }
  return fakeAuthRecord;
}

describe('Merge utils -', function() {

  const fakeAuthRecord = new Record();
  fakeAuthRecord.appendField(['100','','','a','Kivi, Aleksis,', 'd', '1834-1872']);

  const fakeAuthRecord2 = new Record();
  fakeAuthRecord2.appendField(['100','','','a','Aleksis Kiven seura']);

  
  const authDbQuery = sinon.stub();
  
  authDbQuery.withArgs('fin11', 'WNA', 'Aleksis Kivi').resolves(Array.of(AuthRecord('Kivi, Aleksis,', '1834-1872')));
  authDbQuery.withArgs('fin11', 'WNA', 'Kivi, Aleksis, 1834-1872').resolves(Array.of(AuthRecord('Kivi, Aleksis,', '1834-1872')));
  authDbQuery.withArgs('fin11', 'WNA', 'Aleksis Kiven seura').resolves(Array.of(AuthRecord('Aleksis Kiven seura')));
  authDbQuery.withArgs('fin11', 'WNA', 'Aleksis Kiven seur').resolves(Array.of(AuthRecord('Aleksis Kiven seura')));

  authDbQuery.withArgs('fin11', 'WNA', 'Castrén, Klaus, 1923-2011.').resolves(Array.of(AuthRecord('Castrén, Klaus,','1923-2011.')));
  authDbQuery.withArgs('fin11', 'WNA', 'Castrén, Klaus.').resolves(Array.of(AuthRecord('Castrén, Klaus,','1923-2011.')));


  const authDbStub = {
    query: authDbQuery
  };
  
  const isNotHostRecord = { data: { find: { error: 'empty set'}}};
  const isHostRecord = { data: { find: { no_records: 1}}};

  const rawStub = sinon.stub();
  rawStub.withArgs(sinon.match({request: 'MHOST=006072761'})).resolves(isHostRecord);
  rawStub.resolves(isNotHostRecord);
  
  const bibDbStub = {
    query: sinon.stub().resolves('FAKE-BIB-RESULTS'),
    raw: rawStub
  };
  
  
  var mergeUtils = new MergeUtilsMelinda(authDbStub, bibDbStub);

  var DEBUG = process.env.NODE_ENV === 'DEBUG';

  var casePath = path.resolve(__dirname, 'cases');
  var cases = fs.readdirSync(casePath);

  cases.forEach(function(tcase) {

    var suitesPath = path.resolve(__dirname, 'cases', tcase);
    var suites = fs.readdirSync(suitesPath);
          
    suites.forEach(function(suite) {

      describe(tcase + '-' + suite, function() {

        var p = path.resolve(suitesPath, suite);

        var testFiles = fs.readdirSync(p)
          .filter(function(filename) {
            return filename.indexOf('test') === 0;
          });

        var tests = testFiles.map(function(file) {

          var data = readAndTrim(path.resolve(p, file)).split('\n\n');

          return {
            description: data[0] + (DEBUG ? ' (' + path.resolve(p,file) + ')' : ''),
            record_other: data[1],
            record_preferred: data[2],
            expected_output: data[3]
          };
        });

        var runOnly = tests.filter(function(test) {
          return test.description.charAt(0) == '!';
        });

        if (runOnly.length > 0) {
          tests = runOnly;
        }

        if (tcase === 'post') {
          tests.forEach(testPostMergeFunction);
        }
        if (tcase === 'sanity') {
          tests.forEach(testCanMergeFunction);
        }
      });
    });
  });


  function testPostMergeFunction(test) {
    it(test.description, function(done) {

      this.timeout(5000);

      var postMergeModifiedRecord = Record.fromString(test.record_preferred);

      mergeUtils.applyPostMergeModifications(
        Record.fromString(test.record_other), 
        Record.fromString(test.record_preferred),
        postMergeModifiedRecord
      ).then(function() {
        removeField(postMergeModifiedRecord, '583');

        expect(postMergeModifiedRecord.toString()).to.equal(test.expected_output);
        done();
      }).catch(function(error) {
        if (error.name === 'TypeError') { throw error; }

        if (error.name !== 'AssertionError') {
          expect(error.toString()).to.equal(test.expected_output);
        } else {
          throw error;
        }
      
        done();
      }).done();

    });
  }

  function testCanMergeFunction(test) {
    it(test.description, function(done) {

      this.timeout(5000);

      mergeUtils.canMerge(
        Record.fromString(test.record_other), 
        Record.fromString(test.record_preferred)
      ).then(function(result) {
        expect(result).to.equal(test.expected_output);
        done();
      }).catch(function(error) {
        if (error.name === 'TypeError') { throw error; }

        if (error.name !== 'AssertionError') {
          expect(error.toString()).to.equal(test.expected_output);
        } else {
          throw error;
        }

        done();
      }).done();

    });
  }
});


function removeField(record, tag) {
  record.fields = record.fields.filter(function(field) {
    return field.tag !== tag;
  });
}

function readAndTrim(filename) {
  var contents = fs.readFileSync(filename, 'utf8');
  return contents.trim();
}

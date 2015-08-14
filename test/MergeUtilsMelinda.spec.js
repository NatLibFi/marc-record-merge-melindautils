/*jshint mocha:true*/
"use strict";

var chai = require('chai');
var expect = chai.expect;
var Record = require('marc-record-js');
var MergeUtilsMelinda = require('../lib/marc-record-merge-melindautils');
var path = require('path');
var fs = require('fs');

describe('Merge utils -', function() {

	var config = {
		
		auth_db: {
			Xendpoint: 'http://localhost:8080/melinda.kansalliskirjasto.fi/X' 
		},
		bib_db: {
			Xendpoint: 'http://localhost:8080/libtest.csc.fi:8992/X' 	
		}
		
	};

	var mergeUtils = new MergeUtilsMelinda(config);

	var DEBUG = process.env.NODE_ENV === "DEBUG";

	var casePath = path.resolve(__dirname, "cases");
	var cases = fs.readdirSync(casePath);

	cases.forEach(function(tcase) {

		var suitesPath = path.resolve(__dirname, "cases", tcase);
		var suites = fs.readdirSync(suitesPath);
					
		suites.forEach(function(suite) {

			describe(tcase + "-" + suite, function() {

				var p = path.resolve(suitesPath, suite);

				var testFiles = fs.readdirSync(p)
					.filter(function(filename) {
						return filename.indexOf("test") === 0;
					});

				var tests = testFiles.map(function(file) {

					var data = readAndTrim(path.resolve(p,file)).split("\n\n");

					return {
						description: data[0] + (DEBUG ? " (" + path.resolve(p,file) + ")" : ''),
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

				if (tcase === "post") {
					tests.forEach(testPostMergeFunction);
				}
				if (tcase === "sanity") {
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
				if (error.name !== "AssertionError") {
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
				console.log(error.name, error.toString());
				if (error.name !== "AssertionError") {
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

function formatDate(date) {
    var tzo = -date.getTimezoneOffset();
    var dif = tzo >= 0 ? '+' : '-';

    return date.getFullYear() +
        '-' + pad(date.getMonth()+1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes()) +
        ':' + pad(date.getSeconds()) +
        dif + pad(tzo / 60) +
        ':' + pad(tzo % 60);

    function pad(num) {
		var str = num.toString();
		while(str.length < 2) {
			str = "0" + str;
		}
		return str;
    }
}
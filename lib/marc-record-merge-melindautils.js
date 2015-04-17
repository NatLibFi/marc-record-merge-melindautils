//mergeutils melinda

(function(root, factory) {
	"use strict";
	if (typeof define === 'function' && define.amd) {
		define([
			'../node_modules/q/q', 
			'../node_modules/aleph-x-query/lib/query'
		], factory);
	} else if(typeof exports === 'object') {
		module.exports = factory(require('q'), require('aleph-x-query'));  // jshint ignore:line
	} else {
		root.merge = factory(root.Q, root.AlephXServices);
	}
}(this, function(Q, AlephXServices) {
	"use strict";

	function constructor(config) {

		var asteri = new AlephXServices(config);

		function applyPreMergeModifications(otherRecord, preferredRecord) {

		}

		/**
		 *
		 *  Checks whether 2 records can be merged, returns an object:
		 *  
		 *  {
		 *	  mergePossible: true|false,
		 *	  reason: ["if merge is not possible, the reason(s) for it"]
		 *	}
		 *
		 */
		function canMerge(otherRecord, preferredRecord) {
			// Check that there aren't any LOW tags with same library-id.

			var errors = [];

			var deferred = Q.defer();

			// both have same low tags
			var other_LOW = otherRecord.fields.filter(byTag('LOW')).map(toFirstSubfieldValue('a'));
			var preferred_LOW = preferredRecord.fields.filter(byTag('LOW')).map(toFirstSubfieldValue('a'));
		
			other_LOW.forEach(function(oLow) {
				if (preferred_LOW.indexOf(oLow) !== -1) {
					errors.push("Both records have have LOW tag: " + oLow);
				}
			});


			// record type, leader index 6
			var oType = otherRecord.leader.substr(6,1);
			var pType = preferredRecord.leader.substr(6,1);

			if (oType !== pType) {
				errors.push("Records are of different type (leader/6): " + oType + " - " + pType);
			}

			var stopFields = ['240', '880'];
			var other_stopFields = otherRecord.fields.filter(byTags(stopFields));
			var preferred_stopFields = preferredRecord.fields.filter(byTags(stopFields));

			if (other_stopFields.length > 0 || preferred_stopFields.length > 0) {
				errors.push("Records have stop fields. Automated handling of following fields is not possible currently: " + stopFields.join(", "));
			}

			var requiredIndenticalCounts = ["100","110","111"];
			requiredIndenticalCounts.forEach(function(countField) {
				if (!identicalCount(countField, otherRecord, preferredRecord)) {
					errors.push("Field count mismatch for field " + countField);
				}

				function identicalCount(tag, rec1, rec2) {
					var r1fields = rec1.fields.filter(byTag(tag));
					var r2fields = rec2.fields.filter(byTag(tag));

					return r1fields.length === r2fields.length;
				}
			});
			




			if (errors.length > 0) {
				deferred.reject(new Error(errors.join("\n")));
			} else {
				deferred.resolve("OK");
			}

			return deferred.promise;
		}

		function toFirstSubfieldValue(code) {
			return function(field) {
				var contents = field.subfields.filter(function(subfield) {
					return subfield.code === code;
				}).map(function(sub) {
					return sub.value;
				});
				
				if (contents === null || contents === undefined) {
					return undefined;
				}
				return contents[0];
			};
		}

		function applyPostMergeModifications(otherRecord, preferredRecord, mergedRecord) {
			// Handle low tags by moving them from "otherRecord" to mergedRecord
			//  and then creating SID links to both preferred and other record
			

			var deferred = Q.defer();
		
			var LOW_fields = otherRecord.fields.filter(byTag('LOW'));
			
			var other_id = findId(otherRecord);
			mergedRecord.fields = mergedRecord.fields.concat(LOW_fields);
			LOW_fields.forEach(function(field) {

				var libraryId = getSubfieldContent(field, 'a');
				if (libraryId === undefined) {
					return;
				}

				var SID_fields = recordHasSid(otherRecord, libraryId);

				if (SID_fields.length > 0) {

					SID_fields.forEach(function(field) {
						mergedRecord.fields.push(field);
					});
					
					return;
				}

				mergedRecord.fields.push({
					tag: 'SID',
					subfields: [
						{ code: 'c', value:'FCC' + other_id },
						{ code: 'b', value: libraryId.toLowerCase() },					
					]
				});
			});

			// Now make sid links from preferred record to merged too.
			LOW_fields = preferredRecord.fields.filter(byTag('LOW'));
			var preferred_id = findId(preferredRecord);
			LOW_fields.forEach(function(field) {

				var libraryId = getSubfieldContent(field, 'a');
				if (libraryId === undefined) {
					return;
				}

				var SID_fields = recordHasSid(preferredRecord, libraryId);

				if (SID_fields.length > 0) {

					// because preferred record is used as base, any sid fields are already in the merged one.
					
					return;
				}

				mergedRecord.fields.push({
					tag: 'SID',
					subfields: [
						{ code: 'c', value:'FCC' + preferred_id },
						{ code: 'b', value: libraryId.toLowerCase() },					
					]
				});
			});

			// Handle 035 tags by creating a,z fields to mergedRecrod from other and preferred records
			mergedRecord.fields.push({
					tag: '035',
					subfields: [
						{ code: 'z', value:'(FI-MELINDA)' + other_id },
					]
			});
			
			mergedRecord.fields.push({
					tag: '035',
					subfields: [
						{ code: 'z', value:'(FI-MELINDA)' + preferred_id },
					]
			});

			// Remove bib-id from mergedRecord 001, because we are going to save it as new
			mergedRecord.fields = mergedRecord.fields.filter(function(field) {
				return field.tag !== "001";
			});
			mergedRecord.fields.push({
				tag: '001',
				value: '000000000'
			});

			// add 583 field with comments about merge operation.
			
			mergedRecord.fields.push({
					tag: '583',
					subfields: [
						{ code: 'a', value:'MERGED FROM ' + other_id + " + " + preferred_id },
						{ code: '5', value:'MELINDA' },
						{ code: 'c', value: formatDate(new Date()) },
					]
			});

			// 780 + fenni<keep> drop thing
			// 
			// 
			// 
			

			// Check authorities from asteri.
			try {

				var otherQueryObject = toQueryObject(otherRecord);
				var prefQueryObject = toQueryObject(preferredRecord);
			
				if ( otherQueryObject === undefined || prefQueryObject === undefined || 
					otherQueryObject.name === prefQueryObject.name) {
			
					deferred.resolve();

				} else {

					if (otherQueryObject.tag !== prefQueryObject.tag) {
						deferred.reject(new Error("Author type mismatch."));
					} else {

						var tag = otherQueryObject.tag;

						var queries = [
							authorInAuthorizedFormat(otherRecord),
							authorInAuthorizedFormat(preferredRecord)
						];
					
						Q.all(queries).then(function(results) {
							
							var otherIsAuthorized = results[0];
							var preferredIsAuthorized = results[1];

							console.log("preferredIsAuthorized", preferredIsAuthorized);
							console.log("otherIsAuthorized", otherIsAuthorized);

							if (otherIsAuthorized && preferredIsAuthorized) {
								return deferred.reject(new Error("Both records are in authorized format."));
							}

							if (otherIsAuthorized) {

								mergedRecord.fields = mergedRecord.fields.filter(function(field) {
									return field.tag !== tag;
								});

								var field = otherRecord.fields.filter(byTag(tag))[0];

								if (field === undefined) {
									return deferred.reject(new Error("Could not find author from record"));
								}



								mergedRecord.fields.push(field);

							}

							deferred.resolve();
						}).catch(function(error) {

							deferred.reject(error);
						}).done();
					}
				}

			} catch (error) {

				deferred.reject(error);
			}

			deferred.promise.then(function() {
				mergedRecord.fields.sort(fieldSorter);
			});

			return deferred.promise;
		}

		var kept_subfields_for_query = {
			'100': "abcdgjq".split(''),
			'110': "abcdgn".split(''),
			'111': "acdegnq".split(''),
			'700': "abcdgjq".split(''),
			'710': "abcdgn".split(''),
			'711': "acdegnq".split(''),
		};

		function authorInAuthorizedFormat(record) {

			var qo = toQueryObject(record);
			
			return asteri.query('fin11', 'WNA', qo.name).then(function(results) {

				var isAuthorizedFormat = results.map(toQueryObject).filter(function(o) {
					return norm(o.name) === norm(toQueryObject(record).name);
				}).length > 0;

				return isAuthorizedFormat;

				function norm(str) {
					str = str.replace(/\.|,|:|-/g,' ');
					str = str.replace(/  /g, ' ');
					str = str.trim();
					return str;
				}
			});

		}

		function toQueryObject(record) {

			var nameFields = record.fields.filter(byTags(['100','110','111']));

			var queryObjects = nameFields.map(function(field) {

				return {
					tag: field.tag,
					name: field.subfields.filter(function(sub) {
						var list = kept_subfields_for_query[field.tag];
						if (list === undefined) return false;
						return list.indexOf(sub.code) !== -1;
					}).map(function(sub) {
						return sub.value;
					}).join(' ')
				};
			});

			if (queryObjects.length > 1) {
				throw new Error("Record has multiple names: " + queryObjects.map(function(o) { return o.name; }).join());
			}

			return queryObjects[0];
		}

		function byTags(tagArray) {
			return function(field) {
				return (tagArray.indexOf(field.tag)) !== -1;
			};
		}


		var fieldOrder = {
			"FMT": 0,
			"LOW": 997,
			"SID": 998,
			"CAT": 999
		};

		function sortByStringSubfieldArray(subfieldArray, field1, field2) {

			var t1 = field1.subfields.filter(toSubs).map(toVal).join('');
			var t2 = field2.subfields.filter(toSubs).map(toVal).join('');
			
			if (t1 > t2) {
				return 1;
			} 
			if (t2 > t1) {
				return -1;
			}
			return 0;

			function toSubs(f) {
				return subfieldArray.indexOf(f.code) !== -1;
			}
			function toVal(sub) {
				return sub.value;
			}
		}
		function sortByIntegerSubfieldArray(subfieldArray, field1, field2) {
			var t1 = field1.subfields.filter(toSubs).map(toVal).join('');
			var t2 = field2.subfields.filter(toSubs).map(toVal).join('');
			
			return parseInt(t1) - parseInt(t2);

			function toSubs(f) {
				return subfieldArray.indexOf(f.code) !== -1;
			}
			function toVal(sub) {
				return sub.value;
			}
		}

		function fieldSorter(f1, f2) {
			if (f1.tag === "CAT" && f2.tag === "CAT") {
				return sortByIntegerSubfieldArray(['c','h'], f1, f2);
			}
			if (f1.tag === "LOW" && f2.tag === "LOW") {
				return sortByStringSubfieldArray(['a'], f1, f2);
			}
			if (f1.tag === "SID" && f2.tag === "SID") {
				return sortByStringSubfieldArray(['b'], f1, f2);
			}

			var tag1 = fieldOrder[f1.tag] || parseInt(f1.tag);
			var tag2 = fieldOrder[f2.tag] || parseInt(f2.tag);

			return tag1-tag2;
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

		function recordHasSid(record, libraryId) {

			var SID_fields = record.fields.filter(bySubfieldValue('SID', 'b', libraryId.toLowerCase()));
			
			return SID_fields;
		}

		function byTag(tag) {
			return function(field) {
				return field.tag == tag;
			};
		}

		function bySubfieldValue(tag, code, value) {
			return function(field) {
				if (field.tag !== tag) { return false; }

				if (field.subfields === undefined) { return false; }

				for (var i=0;i<field.subfields.length;i++) {
					if (field.subfields[i].code === code && field.subfields[i].value === value) {
						return true;
					}
				}
				return false;

			};
		}

		function getSubfieldContent(field, code) {
			var subfields = field.subfields.filter(function(subfield) {
				return subfield.code == code;
			});
			if (subfields.length > 1) {
				throw new Error("Found multiple subfields with code " + code);
			}
			if (subfields.length < 1) {
				return undefined;
			}
			return subfields[0].value;
		}
		function findId(record) {
			var f001 = record.fields.filter(byTag("001"));
			if (f001.length === 0) {
				throw new Error("Could not parse record id");
			}
			return f001[0].value;
		}

		return {
			applyPreMergeModifications: applyPreMergeModifications,
			canMerge: canMerge,
			applyPostMergeModifications: applyPostMergeModifications
		};

	}

	return constructor;

}));
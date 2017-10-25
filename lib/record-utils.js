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

const XRegExp = require('xregexp').XRegExp;

var authorQuerySubfields = {
  '100': 'abcdgjq'.split(''),
  '110': 'abcdgn'.split(''),
  '111': 'acdegnq'.split(''),
  '700': 'abcdgjq'.split(''),
  '710': 'abcdgn'.split(''),
  '711': 'acdegnq'.split(''),
};

function isAuthorQuerySubfield(field, subfield) {
  var list = authorQuerySubfields[field.tag];
  if (list === undefined) return false;
  return list.indexOf(subfield.code) !== -1;
}

function toAuthorityQueryObject(record) {

  var nameFields = record.fields.filter(byTags(['100', '110', '111']));

  var queryObjects = nameFields.map(function(field) {

    return {
      tag: field.tag,
      name: field.subfields
        .filter(sub => isAuthorQuerySubfield(field, sub))
        .map(sub => sub.value)
        .join(' ')
    };
  });

  if (queryObjects.length > 1) {
    throw mergeError('Record has multiple names: ' + queryObjects.map(function(o) { return o.name; }).join());
  }

  return queryObjects[0];
}

function byTags(tagArray) {
  return function(field) {
    return (tagArray.indexOf(field.tag)) !== -1;
  };
}


var fieldOrder = {
  'FMT': 0,
  'LOW': 997,
  'SID': 998,
  'CAT': 999
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
  if (f1.tag === 'CAT' && f2.tag === 'CAT') {
    return sortByIntegerSubfieldArray(['c','h'], f1, f2);
  }
  if (f1.tag === 'LOW' && f2.tag === 'LOW') {
    return sortByStringSubfieldArray(['a'], f1, f2);
  }
  if (f1.tag === 'SID' && f2.tag === 'SID') {
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
      str = '0' + str;
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
    throw mergeError('Found multiple subfields with code ' + code + ' in ' + field.tag);
  }
  if (subfields.length < 1) {
    return undefined;
  }
  return subfields[0].value;
}

function findId(record) {
  var f001 = record.fields.filter(byTag('001'));
  if (f001.length === 0) {
    throw mergeError('Could not parse record id');
  }
  return f001[0].value;
}


function anyDiacritics(fields) {
  var has = false;
  fields.forEach(function(field) {
    field.subfields.forEach(function(subfield) {
      if (has === false) {
        has = /[^\u0000-\u007e,'öäå']/.test(subfield.value);
      }
    });
  });
  return has;
}


function normalizingSubsetComparator(field1, field2) {
  if (field1.tag !== field2.tag) return false;
  // indicators are skipped
  
  if (isSubset(field2.subfields, field1.subfields, normalizingSubfieldComparator)) return true;

  return false;
}

function normalizingSubfieldComparator(sub1, sub2) {
  return sub1.code === sub2.code && normalizeContent(sub1.value) === normalizeContent(sub2.value);

  function normalizeContent(value) {
    return value.toLowerCase().replace(/[^a-z0-9åäö]+/g, ' ').trim();
  }
}

function fieldComparator(field1, field2) {

  if (field1.tag !== field2.tag) return false;
  // This does not check for indicators

  if (!setsIdentical(field1.subfields, field2.subfields, subfieldComparator)) return false;

  return true;
}

function exactFieldComparator(field1, field2) {
  if (field1.tag !== field2.tag) return false;
  if (field1.ind1 !== field2.ind1) return false;
  if (field1.ind2 !== field2.ind2) return false;
  if (!setsIdentical(field1.subfields, field2.subfields, subfieldComparator)) return false;

  return true;
}


function subfieldComparator(sub1, sub2) {
  return sub1.code === sub2.code && sub1.value === sub2.value;
}

function isSubset(presumedSubset, superSet, comparator) {
  if (presumedSubset.length > superSet.length) {
    return false;
  }

  var superClone = JSON.parse(JSON.stringify(superSet));

  for (var i=0;i<presumedSubset.length;i++) {

    var indexInSuperset = findFromSet(superClone, presumedSubset[i], comparator);
    
    if (indexInSuperset === undefined) {
      return false;
    }

    superClone.splice(indexInSuperset,1);
    
  }
  return true;
}

function setsIdentical(set1, set2, comparator) {
  return (isSubset(set1, set2, comparator) && isSubset(set2, set1, comparator));
}

function findFromSet(set, item, comparator) {
  if (comparator === undefined) {
    comparator = function(a,b) { return a === b; };
  }

  for (var i=0;i<set.length;i++) {
    if (comparator.call(null, set[i], item)) {
      return i;
    }
  }
  return undefined;
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

function makeError(name, message) {
  var err = new Error(message);
  err.name = name;
  return err;
}

function mergeError(message) {
  return makeError('MergeValidationError', message);
}


function checkForDiacritics(tagList, otherRecord, preferredRecord) {
  var issues = [];
  tagList.forEach(function(tag) {
    
    var other_stopFields = otherRecord.fields.filter(byTag(tag));
    var preferred_stopFields = preferredRecord.fields.filter(byTag(tag));

    var preferredHasDiacritics = anyDiacritics(preferred_stopFields);
    var otherHasDiacritics = anyDiacritics(other_stopFields);

    if (preferredHasDiacritics && otherHasDiacritics) {
      issues.push('Both fields have diacritics in field: ' + tag);
    } else {
      if (preferredHasDiacritics) {
        issues.push('Preferred fields has diacritics in field: ' + tag);
      }
      if (otherHasDiacritics) {
        issues.push('Other fields has diacritics in field: ' + tag);
      }
    }
  });
  return issues;
}

function validateDiacritics(tagList, otherRecord, preferredRecord) {
  var issues = [];
  tagList.forEach(function(tag) {
    var other_stopFields = otherRecord.fields.filter(byTag(tag));
    var preferred_stopFields = preferredRecord.fields.filter(byTag(tag));

    var preferredHasDiacritics = anyDiacritics(preferred_stopFields);
    var otherHasDiacritics = anyDiacritics(other_stopFields);
    if (!preferredHasDiacritics && otherHasDiacritics) {
      issues.push('Other fields has diacritics in field: ' + tag);
    }
  });
  return issues;
}

function isSuppressed(record) {
  var STA_a_values = record.fields.filter(byTag('STA')).map(toFirstSubfieldValue('a'));
  if (STA_a_values.some(function(val) { return val.toLowerCase() == 'suppressed'; })) {
    return true;
  }
  return false;
}

function isDeleted(record) {

  if (record.leader.substr(5,1) === 'd') {
    return true;
  }

  var DEL_a_values = record.fields.filter(byTag('DEL')).map(toFirstSubfieldValue('a'));
  if (DEL_a_values.some(function(val) { return val == 'Y'; })) {
    return true;
  }
  var STA_a_values = record.fields.filter(byTag('STA')).map(toFirstSubfieldValue('a'));
  if (STA_a_values.some(function(val) { return val.toLowerCase() == 'deleted'; })) {
    return true;
  }
  return false;
}

function selectValue(record, tag, subfieldCode) {

  var fields = record.fields.filter(byTag(tag));
  if (fields.length === 0) {
    return null;
  }
  
  var values = fields.map(function(field) {
    field.subfields = field.subfields || [];
    return field.subfields.filter(function(sub) {
      return sub.code === subfieldCode;
    }).map(function(sub) {
      return sub.value;
    });
  });
  
  values = Array.prototype.concat.apply([], values);

  if (values.length === 0) {
    return null;
  }
  
  return values[0];
}


function inferTypeAndCount(str) {
  if (str === null || str === undefined) return str;

  str = str.toLowerCase();
  
  var IMPLICIT_VOLUME_WITH_PREFACE = /^([ivxlcdm]+)[,\\.]*\s*([0-9],\s*)*.*$/;
  var IMPLICIT_VOLUME_WITHOUT_PREFACE = /^(\[?[0-9]+\]?,?\s*)+ pages$/;

  var VOLUMES = [
    /^(\d+)\s*volumes/, 
    /^(\d+)\s*vol/, 
    /^(\d+)\s*nid/,
    /^(\d+)\s*v\./ 

  ];

  var PAGES_ALIAS = ['p', 's'];

  var types = [];
  VOLUMES.forEach(function(re) {
    var match = str.match(re);
    if (match !== null) {
      
      types.push({
        type: 'volume',
        count: parseInt(match[1], 10)
      });
      
    }
  });
  if (types.length > 0) {
    return types[0];
  }

  var strCopy = str;
  // try to infer the number of volumes from implicit declaration
  PAGES_ALIAS.forEach(function(alias) {
    var middleRe = new XRegExp('[^\\p{L}]'+alias+'[^\\p{L}]');
    var endRE = new XRegExp('[^\\p{L}]'+alias+'$');

    strCopy = strCopy.replace(middleRe, ' pages ');
    strCopy = strCopy.replace(endRE, ' pages ');
    strCopy = strCopy.replace(/[\\.;:\s+]$/g, '');
    strCopy = strCopy.trim();
  });

  var match;
  match = strCopy.match(IMPLICIT_VOLUME_WITH_PREFACE);
  if (match !== null) {
    return {
      type: 'volume',
      count: 1
    };
  }
  match = strCopy.match(IMPLICIT_VOLUME_WITHOUT_PREFACE);
  if (match !== null) {
    return {
      type: 'volume',
      count: 1
    };
  }

  return types.length > 0 ? types[0] : null;
}

function propValue(property, value) {
  return function(obj) {
    return obj[property] === value;
  };
}
  

module.exports = {
  byTag,
  toFirstSubfieldValue,
  setsIdentical,
  fieldComparator,
  isSubset,
  normalizingSubsetComparator,
  findId,
  formatDate,
  exactFieldComparator,
  toAuthorityQueryObject,
  getSubfieldContent,
  recordHasSid,
  fieldSorter,
  mergeError,
  isDeleted,
  isSuppressed,
  checkForDiacritics,
  validateDiacritics,
  selectValue,
  inferTypeAndCount,
  propValue
};

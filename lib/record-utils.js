

var kept_subfields_for_query = {
  '100': 'abcdgjq'.split(''),
  '110': 'abcdgn'.split(''),
  '111': 'acdegnq'.split(''),
  '700': 'abcdgjq'.split(''),
  '710': 'abcdgn'.split(''),
  '711': 'acdegnq'.split(''),
};


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

module.exports = {
  byTag,
  toFirstSubfieldValue,
  setsIdentical,
  fieldComparator,
  isSubset,
  normalizingSubsetComparator,
  anyDiacritics,
  findId,
  formatDate,
  exactFieldComparator,
  toQueryObject,
  getSubfieldContent,
  recordHasSid,
  fieldSorter,
  mergeError
};


const pick = (propName) => (obj) => obj[propName];
const head = (arr) => arr && arr.length > 0 ? arr[0] : undefined;
const last = (arr) => arr && arr.length > 0 ? arr[arr.length-1] : undefined;

const equals = (expectedValue) => (givenValue) => expectedValue === givenValue;
const equalsWith = (comparator, expectedValue) => (givenValue) => comparator(expectedValue, givenValue);

const includesWith = (comparator, hayStack) => (needle) => hayStack.some(hay => comparator(hay, needle));
const notIncludedWith = (comparator, hayStack) => (needle) => !includesWith(comparator, hayStack)(needle);

module.exports = {
  pick, head, last, equals, equalsWith, includesWith, notIncludedWith
};

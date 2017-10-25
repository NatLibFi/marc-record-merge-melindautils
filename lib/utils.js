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

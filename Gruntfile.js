'use strict';
/* eslint-disable no-console */
module.exports = function(grunt) {

  grunt.initConfig({
   
    mocha_istanbul: {
      coveralls: {
        src: ['test/*spec.js'],
        options: {
          check: {
            lines: 91,
            statements: 90,
            branches: 79,
            functions: 91
          }
        }
      }
    },
  });

  grunt.loadNpmTasks('grunt-mocha-istanbul');

  grunt.registerTask('coverage', ['mocha_istanbul']);
  
  grunt.registerTask('default', ['coverage']);

};

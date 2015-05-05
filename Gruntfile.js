'use strict';

module.exports = function(grunt) {

	var proxy;

	grunt.initConfig({
		jshint: {
			options: {
				jshintrc: '.jshintrc'
			},
			gruntfile: {
				src: 'Gruntfile.js'
			},
			lib: {
				src: ['lib/**/*.js']
			},
		},

		mochaTest: {
			test: {
				options: {
					reporter: 'spec'
				},
				src: [ 'test/*spec.js' ]
			}
		},

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

	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-mocha-test');
	grunt.loadNpmTasks('grunt-mocha-istanbul');

	grunt.registerTask('lint', ['jshint']);
	grunt.registerTask('test', ['startProxy', 'mochaTest', 'stopProxy']);
	grunt.registerTask('coverage', ['startProxy', 'mocha_istanbul', 'stopProxy']);
	
	grunt.registerTask('default', ['lint', 'test', 'coverage']);

	grunt.registerTask('startProxy', 'Start the proxy', function() {

		var done = this.async();
		var host = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
		var port = process.env.PORT || 8080;
 
		proxy = require('./test/proxy');

		proxy.listen(port, host, function() {
		    console.log('Running CORS Anywhere on ' + host + ':' + port);
		    done();
		});

	});

	grunt.registerTask('stopProxy', 'Stop the proxy', function() {

		if (proxy !== undefined) {
			proxy.close();
		}

	});

	grunt.registerTask('proxy', ['startProxy', 'wait']);

	grunt.registerTask('wait', 'wait', function() {
		this.async();
	});

};

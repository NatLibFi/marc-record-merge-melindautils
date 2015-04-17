// Heroku defines the environment variable PORT, and requires the binding address to be 0.0.0.0 

var cors_proxy = require('cors-anywhere');

var server = cors_proxy.createServer({
    //requireHeader: ['origin', 'x-requested-with'],
    removeHeaders: ['cookie', 'cookie2']
});

module.exports = server;